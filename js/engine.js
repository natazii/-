/* =========================================================================
   engine.js — محرّك اللعبة
   كيدير: الأدوار، النرد، التحريك، الشراء، الإيجار، الضرائب،
          البطاقات، السجن، الإجازة، البناء، الرهن، الإفلاس.
   كيتواصل مع الواجهة عبر GameUI (فـ game-ui.js).
   ========================================================================= */

const PLAYER_COLORS = [
  '#8bc34a', '#f5b942', '#f28c38', '#e05c5c',
  '#4a90d9', '#4fc3f7', '#26a69a', '#66bb6a',
  '#a1887f', '#ec407a', '#f06292', '#7e57c2'
];

const Game = {
  state: null,
  decks: null,
  busy: false,

  reset() {
    this.state = null;
    this.decks = null;
    this.busy = false;
    if (typeof GameUI !== 'undefined' && GameUI.reset) GameUI.reset();
  },

  /* ---------- الإقلاع ---------- */
  init(players, settings) {
    this.state = {
      players: players.map((p, i) => ({
        id: i,
        name: p.name,
        color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
        isBot: !!p.isBot,
        cash: settings.startCash,
        pos: 0,
        jail: 0,            // 0 = حر، >0 = عدد الأدوار اللي دوّز فالسجن
        pardon: 0,          // بطاقات العفو
        valleyPardon: 0,    // بطاقة عفو Death Valley
        deathMultiplier: 0, // multiplier waiting for the next rent loss
        skipTurns: 0,       // الإجازة كتخلي اللاعب يفوّت دور
        bankrupt: false
      })),
      turn: 0,
      phase: 'roll',        // roll | action | jail | debt | over
      dice: [1, 1],
      doubles: 0,
      owners: {},           // tileIndex -> playerId
      houses: {},           // tileIndex -> 0..5  (0-4 houses, 5 = hotel)
      pendingBuy: undefined,
      pendingBuyPlayer: undefined,
      mortgaged: {},        // tileIndex -> true
      debt: null,             // { playerId, creditorId } while a player is below $0
      vacationPot: 0,
      settings,
      log: []
    };
    this.decks = {
      treasure: makeDeck(TREASURE_CARDS),
      surprise: makeDeck(SURPRISE_CARDS)
    };
    this.busy = false;

    this.log('Game started . Good luck!', null, 'start');
    GameUI.renderAll();
    this.beginTurn();
  },

  /* ---------- مساعدات ---------- */
  get me() { return this.state.players[this.state.turn]; },

  player(id) { return this.state.players[id]; },

  alive() { return this.state.players.filter(p => !p.bankrupt); },

  log(text, playerId, kind) {
    this.state.log.unshift({ text, playerId, kind });
    if (this.state.log.length > 40) this.state.log.pop();
    GameUI.renderLog();
  },

  /** تغيير الرصيد + أنيميشن الرقم الطايح */
  pay(player, amount, reason) {
    player.cash += amount;
    GameUI.flashMoney(player.id, amount);
    GameUI.renderPlayers();
    if (reason) { /* السبب كيتسجل من برّا */ }
  },

  /** كم من عقار عندو اللاعب من نفس النوع */
  countOwned(playerId, ids) {
    return ids.filter(i => this.state.owners[i] === playerId).length;
  },

  /** واش اللاعب مالك المجموعة كاملة */
  ownsGroup(playerId, group) {
    const ids = groupTiles(group);
    return ids.length > 0 && ids.every(i => this.state.owners[i] === playerId);
  },

  /* ---------- بداية الدور ---------- */
  beginTurn() {
    const s = this.state;
    if (this.checkGameOver()) return;

    const p = this.me;
    if (p.bankrupt) return this.nextTurn();
    if (p.cash < 0) {
      this.enterDebt(p, null);
      return;
    }

    // الإجازة: اللاعب كيفوّت الدور
    if (p.skipTurns > 0) {
      p.skipTurns--;
      this.log('will spend a turn while on vacation.', p.id, 'vacation');
      GameUI.renderAll();
      return setTimeout(() => this.nextTurn(), 1200);
    }

    s.doubles = 0;
    s.phase = p.jail > 0 ? 'jail' : 'roll';
    this.log('is playing...', p.id, 'playing');
    GameUI.renderAll();

    if (p.isBot) setTimeout(() => Bot.play(), 1100);
  },

  nextTurn() {
    const s = this.state;
    if (this.checkGameOver()) return;
    // A declined purchase never leaks into the next player's turn.
    s.pendingBuy = undefined;
    s.pendingBuyPlayer = undefined;
    let guard = 0;
    do {
      s.turn = (s.turn + 1) % s.players.length;
      guard++;
    } while (s.players[s.turn].bankrupt && guard < 100);
    this.beginTurn();
  },

  endTurn() {
    if (this.busy || !this.state || this.state.phase === 'over') return;
    if (this.me.cash < 0 || this.state.phase === 'debt') {
      this.enterDebt(this.me, this.state.debt?.creditorId != null ? this.player(this.state.debt.creditorId) : null);
      return;
    }

    // Double: ONE click is enough. We immediately roll again instead of
    // switching to roll phase and forcing the player to click a second time.
    if (this.state.dice[0] === this.state.dice[1] && this.state.phase === 'action' && this.me.jail === 0) {
      this.state.phase = 'roll';
      GameUI.renderAll();
      setTimeout(() => this.roll(), this.me.isBot ? 420 : 260);
      return;
    }
    this.nextTurn();
  },

  /* ---------- رمي النرد ---------- */
  async roll() {
    if (this.busy || this.state.phase === 'over') return;
    const p = this.me;
    if (this.state.phase === 'jail') return this.jailRoll();
    if (this.state.phase !== 'roll') return;

    this.busy = true;
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    this.state.dice = [d1, d2];
    GameUI.setActions([]);
    await GameUI.rollDice(d1, d2);

    // ثلاث دبلات ورا بعضياتهم = السجن
    if (d1 === d2) {
      this.state.doubles++;
      if (this.state.doubles >= 3) {
        this.log('rolled three doubles and went to prison!', p.id, 'jail');
        await this.sendToJail(p);
        this.busy = false;
        return this.finishAction();
      }
    }

    await this.movePlayer(p, d1 + d2);
    await this.resolveTile(p);
    this.busy = false;
    this.finishAction();
  },

  /**
   * Richup-style fast hover flight: the token glides from tile to tile with
   * a short motion-blur trail. No jumping and no teleport-looking pop.
   */
  async movePlayer(p, steps, opts = {}) {
    const total = Math.max(0, Number(steps) || 0);
    if (!total) return;
    const from = p.pos;

    await GameUI.animateTokenPath(p, from, total, { direction: 1, final: true });

    for (let i = 0; i < total; i++) {
      p.pos = (p.pos + 1) % BOARD.length;
      if (p.pos === IDX_START && !opts.noPass) {
        this.pay(p, this.state.settings.startBonus);
        this.log(`passed through START and received $${this.state.settings.startBonus}`, p.id, 'money');
        GameUI.pulseTile(IDX_START, 'money');
        GameUI.playSound?.('start');
      }
    }
    GameUI.renderTokens();
  },

  /** حركة للخلف مع نفس طيران القطعة */
  async movePlayerBackward(p, steps) {
    const total = Math.max(0, Number(steps) || 0);
    if (!total) return;
    const from = p.pos;
    await GameUI.animateTokenPath(p, from, total, { direction: -1, final: true });
    p.pos = (p.pos - total + BOARD.length * 20) % BOARD.length;
    GameUI.renderTokens();
  },

  /** نقل لخانة. START بالذات كيتنقل ليها مباشرة بلا أنيميشن. */
  async teleport(p, target, opts = {}) {
    if (target === IDX_START) {
      p.pos = IDX_START;
      if (!opts.noReward) {
        this.pay(p, this.state.settings.startBonus);
        this.log(`was sent to START and received $${this.state.settings.startBonus}`, p.id, 'money');
        GameUI.playSound?.('start');
      }
      GameUI.renderTokens();
      GameUI.pulseTile(IDX_START, 'money');
      return;
    }
    let steps = (target - p.pos + BOARD.length) % BOARD.length;
    if (steps === 0) steps = BOARD.length;
    await this.movePlayer(p, steps, opts);
  },

  /* ---------- تنفيذ حدث الخانة ---------- */
  async resolveTile(p) {
    const idx = p.pos;
    const t = BOARD[idx];
    const s = this.state;

    switch (t.type) {
      case 'city':
      case 'airport':
      case 'company': {
        const owner = s.owners[idx];
        if (owner === undefined) {
          if (p.cash >= t.cost) {
            s.pendingBuy = idx;
            s.pendingBuyPlayer = p.id;
          } else {
            s.pendingBuy = undefined;
            s.pendingBuyPlayer = undefined;
            this.log(`cannot afford ${t.name}`, p.id, 'info');
          }
        } else if (owner !== p.id && !s.mortgaged[idx]) {
          const other = this.player(owner);
          const baseRent = this.rentOf(idx);
          let rent = baseRent;
          let valleyLoss = null;
          if (p.deathMultiplier > 0) {
            const multiplier = p.deathMultiplier;
            const buildings = t.type === 'city' ? (s.houses[idx] || 0) : 0;
            rent = buildings > 0 ? 200 : baseRent * multiplier;
            valleyLoss = { multiplier, buildings, baseRent, rent, land: t.name };
            p.deathMultiplier = 0;
            this.log(buildings > 0
              ? `Death Valley activated on ${t.name}: fixed loss $200`
              : `Death Valley activated on ${t.name}: $${baseRent} × ${multiplier} = $${rent}`,
              p.id, 'deathvalley');
          }
          this.pay(p, -rent);
          this.pay(other, rent);
          this.log(`paid $${rent} to ${other.name}`, p.id, 'rent');
          GameUI.playSound?.('rent');
          if (valleyLoss) await GameUI.showDeathValleyLoss?.(p, valleyLoss);
          await this.settleDebt(p, other);
        }
        break;
      }

      case 'tax': {
        const amount = t.taxFlat ? t.taxFlat : Math.round(p.cash * t.taxPercent / 100);
        this.pay(p, -amount);
        s.vacationPot += amount;
        this.log(`paid a $${amount} tax`, p.id, 'tax');
        GameUI.playSound?.('money_loss');
        await this.settleDebt(p, null);
        break;
      }

      case 'treasure':
        await this.drawCard(p, 'treasure');
        break;

      case 'surprise':
        await this.drawCard(p, 'surprise');
        break;

      case 'deathvalley':
        await this.resolveDeathValley(p);
        break;

      case 'gotojail':
        await this.sendToJail(p);
        break;

      case 'vacation': {
        if (s.settings.vacationCash && s.vacationPot > 0) {
          const pot = s.vacationPot;
          s.vacationPot = 0;
          this.pay(p, pot);
          this.log(`landed on Vacation. $${pot} withdrawn.`, p.id, 'vacation');
        } else {
          this.log('is on vacation.', p.id, 'vacation');
        }
        p.skipTurns = 1;
        break;
      }

      default:
        break; // START / السجن (زيارة فقط)
    }
    GameUI.renderAll();
  },

  /* ---------- Death Valley ---------- */
  async resolveDeathValley(p) {
    await GameUI.showCard('💀 Death Valley! Roll the dice again. The total can multiply your next rent loss.', 'deathvalley');
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const total = d1 + d2;
    // This is a curse roll only. Do NOT overwrite the movement dice, otherwise
    // Death Valley could accidentally create/remove a doubles extra roll.
    await GameUI.rollDice(d1, d2);

    const previous = p.deathMultiplier || 0;
    GameUI.playSound?.('death_valley');

    if (total === 2 || total === 12) {
      p.deathMultiplier = 0;
      this.log(previous > 0
        ? `rolled ${total}: the old Death Valley ×${previous} curse was removed with no new penalty.`
        : `escaped Death Valley with ${total}. No next-rent penalty.`, p.id, 'deathvalley');
      await GameUI.showCard(`💀 You rolled ${total}. ${previous > 0 ? `Your old ×${previous} curse was removed.` : 'You escaped with no penalty.'}`, 'deathvalley');
      return;
    }

    if (p.valleyPardon > 0) {
      p.valleyPardon--;
      p.deathMultiplier = 0;
      this.log(`used a Pardon of the Valley and cancelled ×${total}${previous > 0 ? `, replacing/removing the old ×${previous}` : ''}.`, p.id, 'deathvalley');
      await GameUI.showCard(`🕊 Pardon of the Valley used. The ×${total} curse was cancelled${previous > 0 ? ` and your old ×${previous} curse was removed` : ''}.`, 'deathvalley');
      return;
    }

    // Death Valley NEVER stacks. Landing here again replaces the old number.
    p.deathMultiplier = total;
    this.log(previous > 0
      ? `Death Valley replaced the old ×${previous} curse with ×${total}.`
      : `Death Valley curse armed: next unbuilt land rent is ×${total}; built land is a fixed $200.`,
      p.id, 'deathvalley');
    await GameUI.showCard(previous > 0
      ? `💀 New curse ×${total}. Your old ×${previous} curse is gone.`
      : `💀 Curse ×${total}: your next unbuilt-land rent is multiplied by ${total}. If that land has buildings, you pay $200 instead.`, 'deathvalley');
  },

  /* ---------- حساب الإيجار ---------- */
  rentOf(idx) {
    const t = BOARD[idx];
    const s = this.state;
    const owner = s.owners[idx];
    if (owner === undefined || s.mortgaged[idx]) return 0;

    if (t.type === 'airport') {
      const n = this.countOwned(owner, AIRPORT_IDS);
      return [0, 25, 50, 100, 200][n] || 0;
    }
    if (t.type === 'company') {
      const n = this.countOwned(owner, COMPANY_IDS);
      const mult = [0, 4, 10, 20][n] || 0;
      return mult * (s.dice[0] + s.dice[1]);
    }
    // مدينة
    const h = s.houses[idx] || 0;
    let rent = t.rent[h];
    // x2 على المجموعة الكاملة بلا بيوت
    if (h === 0 && s.settings.doubleRentFullSet && this.ownsGroup(owner, t.group)) rent *= 2;
    return rent;
  },

  /* ---------- الشراء ---------- */
  buy() {
    const s = this.state;
    const idx = s.pendingBuy;
    if (idx === undefined) return;

    // Normal landings use the current player. Admin /tp may create a valid
    // purchase opportunity for another player, so remember exactly who landed.
    const buyerId = s.pendingBuyPlayer !== undefined ? s.pendingBuyPlayer : s.turn;
    const p = this.player(buyerId);
    const t = BOARD[idx];
    if (!p || s.owners[idx] !== undefined || p.cash < t.cost) return;

    this.pay(p, -t.cost);
    s.owners[idx] = p.id;
    s.pendingBuy = undefined;
    s.pendingBuyPlayer = undefined;
    this.log(`bought ${t.name}`, p.id, 'buy');
    GameUI.playSound?.('buy');
    GameUI.renderAll();

    // Only advance the turn state when this was the actual current player's
    // landing. Out-of-turn admin teleports must not hijack somebody else's turn.
    if (p.id === s.turn) this.finishAction();
  },

  /* ---------- البطاقات ---------- */
  async drawCard(p, deckName) {
    const card = this.decks[deckName].draw();
    this.log(`got a ${deckName} card: ${card.text}`, p.id, deckName);
    GameUI.playSound?.('card');
    await GameUI.showCard(card.text, deckName);

    switch (card.kind) {
      case 'money':
        this.pay(p, card.amount);
        if (card.amount < 0) {
          this.state.vacationPot += -card.amount;
          await this.settleDebt(p, null);
        }
        break;

      case 'pardon':
        p.pardon++;
        break;

      case 'valleyPardon':
        p.valleyPardon++;
        break;

      case 'jail':
        await this.sendToJail(p);
        break;

      case 'move': {
        if (card.to !== undefined && card.to >= 0) {
          await this.teleport(p, card.to, { noPass: card.noPass });
        } else if (card.back) {
          await this.movePlayerBackward(p, card.back);
        } else if (card.nearest) {
          const ids = card.nearest === 'company' ? COMPANY_IDS : AIRPORT_IDS;
          let best = ids[0], bestD = 99;
          ids.forEach(i => {
            const d = (i - p.pos + BOARD.length) % BOARD.length;
            if (d > 0 && d < bestD) { bestD = d; best = i; }
          });
          await this.teleport(p, best);
        }
        await this.resolveTile(p);
        break;
      }

      case 'collectEach':
        this.alive().forEach(o => {
          if (o.id === p.id) return;
          this.pay(o, -card.amount);
          this.pay(p, card.amount);
        });
        break;

      case 'payEach':
        for (const o of this.alive()) {
          if (o.id === p.id) continue;
          this.pay(p, -card.amount);
          this.pay(o, card.amount);
        }
        await this.settleDebt(p, null);
        break;

      case 'repairs': {
        let total = 0;
        Object.keys(this.state.houses).forEach(i => {
          if (this.state.owners[i] !== p.id) return;
          const h = this.state.houses[i];
          total += h === 5 ? card.perHotel : h * card.perHouse;
        });
        if (total > 0) {
          this.pay(p, -total);
          this.state.vacationPot += total;
          this.log(`paid $${total} for repairs`, p.id, 'tax');
          await this.settleDebt(p, null);
        }
        break;
      }
    }
    GameUI.renderAll();
  },

  /* ---------- السجن ---------- */
  async sendToJail(p) {
    const from = p.pos;
    this.state.doubles = 0;
    this.state.pendingBuy = undefined;
    this.state.pendingBuyPlayer = undefined;
    this.log('got into prison', p.id, 'jail');
    GameUI.playSound?.('jail');

    // Prison movement is a dramatic direct swoop, not a normal board walk.
    await GameUI.animateTokenTeleport(p, from, IDX_JAIL);
    p.pos = IDX_JAIL;
    p.jail = 1;
    GameUI.renderTokens();
    GameUI.pulseTile(IDX_JAIL, 'jail');
    await sleep(180);
  },

  async jailRoll() {
    if (this.busy) return;
    this.busy = true;
    const p = this.me;
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    this.state.dice = [d1, d2];
    await GameUI.rollDice(d1, d2);

    if (d1 === d2) {
      p.jail = 0;
      this.log('rolled a double and got out of prison!', p.id, 'jail');
      this.state.phase = 'action';
      await this.movePlayer(p, d1 + d2);
      await this.resolveTile(p);
      this.busy = false;
      return this.finishAction();
    }

    p.jail++;
    if (p.jail > 3) {
      // ثلاث محاولات فاشلة = خلاص $50 إجباري
      p.jail = 0;
      this.pay(p, -this.state.settings.jailFee);
      this.log(`served the sentence and paid $${this.state.settings.jailFee}`, p.id, 'jail');
      this.state.phase = 'action';
      await this.movePlayer(p, d1 + d2);
      await this.resolveTile(p);
      this.busy = false;
      return this.finishAction();
    }

    this.log('failed to roll a double', p.id, 'jail');
    this.busy = false;
    this.state.phase = 'action';
    GameUI.renderAll();
    if (p.isBot) setTimeout(() => this.endTurn(), 900);
  },

  jailPay() {
    const p = this.me;
    if (p.cash < this.state.settings.jailFee) return;
    this.pay(p, -this.state.settings.jailFee);
    p.jail = 0;
    this.state.phase = 'roll';
    this.log(`paid $${this.state.settings.jailFee} to get out of prison`, p.id, 'jail');
    GameUI.renderAll();
    if (p.isBot) setTimeout(() => Bot.play(), 700);
  },

  jailPardon() {
    const p = this.me;
    if (p.pardon <= 0) return;
    p.pardon--;
    p.jail = 0;
    this.state.phase = 'roll';
    this.log('used a Pardon card and left prison', p.id, 'jail');
    GameUI.renderAll();
    if (p.isBot) setTimeout(() => Bot.play(), 700);
  },

  /* ---------- البناء والرهن — قواعد Monopoly الكلاسيكية ---------- */

  groupBuildingLevels(group) {
    return groupTiles(group).map(i => this.state.houses[i] || 0);
  },

  groupHasMortgage(group) {
    return groupTiles(group).some(i => !!this.state.mortgaged[i]);
  },

  groupHasBuildings(group) {
    return groupTiles(group).some(i => (this.state.houses[i] || 0) > 0);
  },

  /**
   * البناء المتوازن:
   * خاصك تبني دائماً فوق أقل عقار فالمجموعة.
   * مثال: 1/1/0 => تقدر تبني غير فالعقار اللي عندو 0.
   * الفندق (level 5) ما كيطلع حتى تكون المجموعة كلها 4 بيوت.
   */
  canBuild(idx, playerId = this.state.turn) {
    const t = BOARD[idx];
    const s = this.state;
    if (!t || t.type !== 'city') return false;
    if (s.owners[idx] !== playerId) return false;
    if (!this.ownsGroup(playerId, t.group)) return false;
    if (this.groupHasMortgage(t.group)) return false;

    const current = s.houses[idx] || 0;
    if (current >= 5) return false;

    const ids = groupTiles(t.group);
    const levels = ids.map(i => s.houses[i] || 0);
    const evenBuilding = s.settings.evenBuilding !== false;

    if (evenBuilding) {
      const minLevel = Math.min(...levels);

      // Classic mode: build only on a least-developed property.
      if (current !== minLevel) return false;

      // Hotel: every property must already have at least four houses.
      // After one hotel is built, [5,4,4] is valid and the other level-4
      // properties can still be upgraded to hotels one by one.
      if (current === 4 && !levels.every(v => v >= 4)) return false;
    }

    // Free-build mode: when Even building is OFF, the selected land may be
    // upgraded independently from 0 -> 1 -> 2 -> 3 -> 4 -> hotel.
    const p = this.player(playerId);
    if (!p || p.cash < t.houseCost) return false;

    return true;
  },

  buildBlockReason(idx, playerId = this.state.turn) {
    const t = BOARD[idx];
    const s = this.state;
    if (!t || t.type !== 'city') return 'Only city lands can have buildings.';
    if (s.owners[idx] !== playerId) return 'You do not own this land.';
    if (!this.ownsGroup(playerId, t.group)) return `Own the full ${t.country || t.group} set to build.`;
    if (this.groupHasMortgage(t.group)) return 'Unmortgage the full set before building.';
    const current = s.houses[idx] || 0;
    if (current >= 5) return 'This land already has a hotel.';
    const levels = groupTiles(t.group).map(i => s.houses[i] || 0);
    const evenBuilding = s.settings.evenBuilding !== false;
    if (evenBuilding) {
      const minLevel = Math.min(...levels);
      if (current !== minLevel) return 'Build evenly: upgrade the least-developed land first.';
      if (current === 4 && !levels.every(v => v >= 4)) return 'Every land in this country needs 4 houses before another hotel.';
    }
    const p = this.player(playerId);
    if (!p || p.cash < t.houseCost) return `You need $${t.houseCost} to build.`;
    return '';
  },

  build(idx) {
    if (!this.canBuild(idx)) return;

    const s = this.state;
    const t = BOARD[idx];
    const p = this.me;
    const before = s.houses[idx] || 0;

    this.pay(p, -t.houseCost);

    if (before === 4) {
      // 4 houses -> hotel. Building supply is unlimited.
      s.houses[idx] = 5;
      this.log(`built a hotel on ${t.name}`, p.id, 'build');
      GameUI.playSound?.('hotel');
      GameUI.pulseTile(idx, 'hotel');
    } else {
      s.houses[idx] = before + 1;
      this.log(`built house ${s.houses[idx]}/4 on ${t.name}`, p.id, 'build');
      GameUI.playSound?.('house');
      GameUI.pulseTile(idx, 'house');
    }

    GameUI.renderAll();
  },

  /**
   * البيع المتوازن: خاصك تبيع من أكثر عقار مبني فالمجموعة أولاً.
   * الفندق كيرجع لـ4 بيوت، لذلك خاص البنك يكون عندو 4 بيوت متوفرة.
   */
  canSellHouse(idx, playerId = this.state.turn) {
    const t = BOARD[idx];
    const s = this.state;
    if (!t || t.type !== 'city') return false;
    if (s.owners[idx] !== playerId) return false;

    const current = s.houses[idx] || 0;
    if (current <= 0) return false;

    const ids = groupTiles(t.group);
    const levels = ids.map(i => s.houses[i] || 0);
    const evenBuilding = s.settings.evenBuilding !== false;

    // Classic mode keeps selling even as well. Free-build mode lets each
    // property be sold down independently.
    if (evenBuilding) {
      const maxLevel = Math.max(...levels);
      if (current !== maxLevel) return false;
    }

    return true;
  },

  sellHouse(idx) {
    if (!this.canSellHouse(idx)) return;

    const s = this.state;
    const t = BOARD[idx];
    const p = this.me;
    const before = s.houses[idx] || 0;

    if (before === 5) {
      // Hotel -> 4 houses. Building supply is unlimited.
      s.houses[idx] = 4;
      this.log(`sold the hotel on ${t.name} and returned to 4 houses`, p.id, 'build');
    } else {
      s.houses[idx] = before - 1;
      this.log(`sold a house on ${t.name}`, p.id, 'build');
    }

    this.pay(p, Math.round(t.houseCost / 2));
    GameUI.playSound?.('sell');
    GameUI.pulseTile(idx, 'sell');
    GameUI.renderAll();
    this.checkDebtResolved();
  },

  canMortgage(idx, playerId = this.state.turn) {
    const s = this.state;
    if (!s.settings.mortgaging) return false;
    const t = BOARD[idx];
    if (!t || s.owners[idx] !== playerId) return false;
    if (s.mortgaged[idx]) return false;

    // Classic rule: no property in a color set may be mortgaged while the set has buildings.
    if (t.type === 'city' && this.groupHasBuildings(t.group)) return false;
    return true;
  },

  canUnmortgage(idx, playerId = this.state.turn) {
    const s = this.state;
    if (!s.settings.mortgaging) return false;
    const t = BOARD[idx];
    if (!t || s.owners[idx] !== playerId || !s.mortgaged[idx]) return false;
    const cost = Math.round(t.cost * 0.55); // mortgage value + 10% interest
    return this.player(playerId).cash >= cost;
  },

  toggleMortgage(idx) {
    const s = this.state;
    if (!s.settings.mortgaging) return;
    const t = BOARD[idx];
    if (!t || s.owners[idx] !== s.turn) return;

    if (s.mortgaged[idx]) {
      if (!this.canUnmortgage(idx)) return;
      const cost = Math.round(t.cost * 0.55);
      this.pay(this.me, -cost);
      delete s.mortgaged[idx];
      this.log(`unmortgaged ${t.name} for $${cost}`, this.me.id, 'build');
      GameUI.playSound?.('unmortgage');
      GameUI.pulseTile(idx, 'unmortgage');
    } else {
      if (!this.canMortgage(idx)) return;
      const value = Math.round(t.cost / 2);
      this.pay(this.me, value);
      s.mortgaged[idx] = true;
      this.log(`mortgaged ${t.name} for $${value}`, this.me.id, 'build');
      GameUI.playSound?.('mortgage');
      GameUI.pulseTile(idx, 'mortgage');
    }
    GameUI.renderAll();
    this.checkDebtResolved();
  },

  /* ---------- بيع الأرض للبنك لما الرهن يكون معطّل ---------- */
  canSellLand(idx, playerId = this.state.turn) {
    const s = this.state;
    const t = BOARD[idx];
    if (!t || s.settings.mortgaging) return false;
    if (!['city', 'airport', 'company'].includes(t.type)) return false;
    if (s.owners[idx] !== playerId) return false;
    if (s.mortgaged[idx]) return false;
    if ((s.houses[idx] || 0) > 0) return false;
    if (t.type === 'city' && this.groupHasBuildings(t.group)) return false;
    return true;
  },

  sellLand(idx) {
    if (!this.canSellLand(idx)) return;
    const s = this.state;
    const t = BOARD[idx];
    const p = this.me;
    const value = Math.round(t.cost / 2);
    delete s.owners[idx];
    delete s.houses[idx];
    delete s.mortgaged[idx];
    this.pay(p, value);
    this.log(`sold ${t.name} back to the bank for $${value}`, p.id, 'build');
    GameUI.playSound?.('sell_land');
    GameUI.pulseTile(idx, 'sell');
    GameUI.renderAll();
    this.checkDebtResolved();
  },

  /* ---------- الديون والإفلاس ---------- */
  /**
   * Negative balance freezes the turn. Nothing automatically disappears.
   * The human must open owned lands and sell buildings / mortgage / sell land,
   * or declare bankruptcy. Bots resolve the same situation automatically.
   */
  async settleDebt(p, creditor) {
    if (p.cash >= 0) return true;
    // If an admin teleports a player who is not currently taking a turn, keep
    // their negative balance but do not freeze the wrong player's UI. Their
    // debt mode will begin automatically when their own turn starts.
    if (p.id !== this.state.turn) {
      this.log(`is $${Math.abs(p.cash)} below zero and must resolve it on their turn`, p.id, 'debt');
      GameUI.renderAll();
      return false;
    }
    this.enterDebt(p, creditor);
    return false;
  },

  enterDebt(p, creditor) {
    const s = this.state;
    s.phase = 'debt';
    s.pendingBuy = undefined;
    s.pendingBuyPlayer = undefined;
    s.debt = { playerId: p.id, creditorId: creditor ? creditor.id : null };
    this.log(`is $${Math.abs(p.cash)} below zero and must resolve the debt before continuing`, p.id, 'debt');
    GameUI.renderAll();
    if (p.isBot) setTimeout(() => Bot.resolveDebt(), 350);
  },

  checkDebtResolved() {
    const s = this.state;
    if (!s || s.phase !== 'debt') return false;
    const p = this.me;
    if (p.cash < 0) {
      GameUI.renderAll();
      return false;
    }
    s.debt = null;
    s.phase = 'action';
    this.log('resolved the debt and can continue.', p.id, 'money');
    GameUI.renderAll();
    if (p.isBot) setTimeout(() => Bot.afterRoll(), 350);
    return true;
  },

  finalizeBankruptcy(p, creditor) {
    const s = this.state;
    if (!p || p.bankrupt) return;
    p.bankrupt = true;
    p.cash = 0;

    Object.keys(s.owners).forEach(key => {
      const i = Number(key);
      if (s.owners[i] !== p.id) return;
      if (creditor && !creditor.bankrupt) {
        s.owners[i] = creditor.id;
      } else {
        delete s.owners[i];
        delete s.mortgaged[i];
      }
      delete s.houses[i];
    });

    s.debt = null;
    this.log(creditor ? `went bankrupt against ${creditor.name}` : 'went bankrupt', p.id, 'bankrupt');
    GameUI.closeLandInfo?.();
    GameUI.renderAll();

    // This build has one local human player. If that human goes bankrupt,
    // stop immediately and show GAME OVER instead of letting bots continue unseen.
    if (!p.isBot) {
      s.phase = 'over';
      GameUI.playSound?.('game_over');
      GameUI.showEndScreen?.(null, p);
    }
  },

  declareBankrupt() {
    if (!this.state || this.busy || this.state.phase === 'over') return;
    const p = this.me;
    const creditor = this.state.debt && this.state.debt.creditorId !== null
      ? this.player(this.state.debt.creditorId)
      : null;
    this.finalizeBankruptcy(p, creditor);
    if (this.state.phase === 'over') return;
    if (!this.checkGameOver()) this.nextTurn();
  },

  /* ---------- أوامر الشات المحلية ---------- */
  normalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  },

  commandTargetAndRest(raw) {
    let text = String(raw || '').trim();
    let targetName = '';
    let rest = '';
    let m = text.match(/^%([^%]+)%\s+(.+)$/);
    if (!m) m = text.match(/^"([^"]+)"\s+(.+)$/);
    if (m) return { targetName: m[1].trim(), rest: m[2].trim() };

    const names = this.state.players.map(p => p.name).sort((a, b) => b.length - a.length);
    const lower = text.toLowerCase();
    const found = names.find(n => lower === n.toLowerCase() || lower.startsWith(n.toLowerCase() + ' '));
    if (found) {
      targetName = found;
      rest = text.slice(found.length).trim();
    }
    return { targetName, rest };
  },

  findPlayerByName(name) {
    const n = this.normalizeName(name).replace(/^%|%$/g, '');
    return this.state.players.find(p => this.normalizeName(p.name) === n) || null;
  },

  findLandByName(name) {
    const n = this.normalizeName(name);
    let idx = BOARD.findIndex(t => ['city','airport','company'].includes(t.type) && this.normalizeName(t.name) === n);
    if (idx < 0) idx = BOARD.findIndex(t => ['city','airport','company'].includes(t.type) && this.normalizeName(t.name).startsWith(n));
    return idx;
  },

  giveLandTo(player, idx) {
    const t = BOARD[idx];
    if (!player || !t) return false;
    this.state.owners[idx] = player.id;
    delete this.state.mortgaged[idx];
    delete this.state.houses[idx];
    GameUI.pulseTile(idx, 'money');
    return true;
  },

  takeLandFrom(player, idx) {
    if (!player || idx < 0 || this.state.owners[idx] !== player.id) return false;
    delete this.state.owners[idx];
    delete this.state.mortgaged[idx];
    delete this.state.houses[idx];
    GameUI.pulseTile(idx, 'sell');
    return true;
  },

  findAnyTileByName(name) {
    const n = this.normalizeName(name);
    if (n === 'start') return IDX_START;
    if (n === 'prison' || n === 'jail' || n === 'in prison') return IDX_JAIL;
    if (n === 'vacation') return IDX_VACATION;
    if (n === 'go to prison' || n === 'go to jail') return IDX_GOTOJAIL;
    let idx = BOARD.findIndex(t => this.normalizeName(t.name) === n);
    if (idx < 0) idx = BOARD.findIndex(t => this.normalizeName(t.name).startsWith(n));
    return idx;
  },

  directTeleport(player, idx, options = {}) {
    if (!player || idx < 0 || idx >= BOARD.length) return false;
    player.pos = idx;
    if (options.escapePrison) player.jail = 0;
    GameUI.renderTokens();
    GameUI.pulseTile(idx, idx === IDX_START ? 'money' : 'land');
    return true;
  },

  executeCommand(command) {
    if (!this.state) return { ok: false, message: 'Start the game before using game commands.' };
    const text = String(command || '').trim();

    let m = text.match(/^\/eco\s+(give|take)\s+(.+)$/i);
    if (m) {
      const action = m[1].toLowerCase();
      const parsed = this.commandTargetAndRest(m[2]);
      const p = this.findPlayerByName(parsed.targetName);
      const amount = Math.max(0, Math.floor(Number(parsed.rest)));
      if (!p) return { ok: false, message: 'Player not found.' };
      if (!Number.isFinite(amount)) return { ok: false, message: 'Invalid amount.' };
      this.pay(p, action === 'give' ? amount : -amount);
      this.log(`admin ${action === 'give' ? 'gave' : 'took'} $${amount}`, p.id, 'money');
      if (p.id === this.state.turn && p.cash < 0) this.enterDebt(p, null);
      else if (p.id === this.state.turn && this.state.phase === 'debt') this.checkDebtResolved();
      GameUI.renderAll();
      return { ok: true, message: `${action === 'give' ? 'Gave' : 'Took'} $${amount} ${action === 'give' ? 'to' : 'from'} ${p.name}.` };
    }

    m = text.match(/^\/land\s+(give|take)\s+(.+)$/i);
    if (m) {
      const action = m[1].toLowerCase();
      const parsed = this.commandTargetAndRest(m[2]);
      const p = this.findPlayerByName(parsed.targetName);
      const idx = this.findLandByName(parsed.rest);
      if (!p) return { ok: false, message: 'Player not found.' };
      if (idx < 0) return { ok: false, message: 'Land not found.' };
      if (action === 'give') {
        this.giveLandTo(p, idx);
        this.log(`received ${BOARD[idx].name} by admin command`, p.id, 'buy');
        GameUI.renderAll();
        return { ok: true, message: `Gave ${BOARD[idx].name} to ${p.name}.` };
      }
      if (!this.takeLandFrom(p, idx)) return { ok: false, message: `${p.name} does not own ${BOARD[idx].name}.` };
      this.log(`lost ${BOARD[idx].name} by admin command`, p.id, 'build');
      GameUI.renderAll();
      return { ok: true, message: `Took ${BOARD[idx].name} from ${p.name}.` };
    }

    m = text.match(/^\/country\s+(give|take)\s+(.+)$/i);
    if (m) {
      const action = m[1].toLowerCase();
      const parsed = this.commandTargetAndRest(m[2]);
      const p = this.findPlayerByName(parsed.targetName);
      if (!p) return { ok: false, message: 'Player not found.' };
      const key = this.normalizeName(parsed.rest);
      const group = (typeof COUNTRY_ALIASES !== 'undefined' && COUNTRY_ALIASES[key]) ||
        Object.keys(COUNTRY_NAME || {}).find(g => this.normalizeName(COUNTRY_NAME[g]) === key);
      if (!group) return { ok: false, message: 'Country not found.' };
      const ids = groupTiles(group);
      if (action === 'give') {
        ids.forEach(i => this.giveLandTo(p, i));
        this.log(`received all land in ${COUNTRY_NAME[group]}`, p.id, 'buy');
        GameUI.renderAll();
        return { ok: true, message: `Gave ${COUNTRY_NAME[group]} (${ids.length} lands) to ${p.name}.` };
      }
      const owned = ids.filter(i => this.state.owners[i] === p.id);
      owned.forEach(i => this.takeLandFrom(p, i));
      this.log(`lost all owned land in ${COUNTRY_NAME[group]} by admin command`, p.id, 'build');
      GameUI.renderAll();
      return { ok: true, message: `Took ${owned.length} ${COUNTRY_NAME[group]} land${owned.length === 1 ? '' : 's'} from ${p.name}.` };
    }

    m = text.match(/^\/prison\s+escape\s+(.+)$/i);
    if (m) {
      const raw = m[1].trim().replace(/^%|%$/g, '').replace(/^"|"$/g, '');
      const p = this.findPlayerByName(raw);
      if (!p) return { ok: false, message: 'Player not found.' };
      p.jail = 0;
      if (p.id === this.state.turn && this.state.phase === 'jail') this.state.phase = 'roll';
      this.log('was released from prison by admin command', p.id, 'jail');
      GameUI.renderAll();
      return { ok: true, message: `${p.name} escaped prison.` };
    }

    m = text.match(/^\/tp\s+(.+)$/i);
    if (m) {
      const parsed = this.commandTargetAndRest(m[1]);
      const p = this.findPlayerByName(parsed.targetName);
      if (!p) return { ok: false, message: 'Player not found.' };
      const rest = parsed.rest.replace(/^to\s+/i, '').trim();
      if (!rest) return { ok: false, message: 'Use /tp player to land name.' };
      const idx = this.findAnyTileByName(rest);
      if (idx < 0) return { ok: false, message: 'Destination not found.' };
      // Admin TP itself is instant, but the destination behaves exactly like a
      // real landing: buy opportunity, rent, tax, Death Valley, cards, jail, etc.
      this.directTeleport(p, idx);
      this.log(`was teleported to ${BOARD[idx].name} by admin command`, p.id, 'info');
      GameUI.renderAll();
      Promise.resolve().then(async () => {
        try {
          await this.resolveTile(p);
          if (p.id === this.state.turn && this.state.phase !== 'debt' && this.state.phase !== 'over') {
            this.finishAction();
          } else {
            GameUI.renderAll();
          }
        } catch (err) {
          console.error('TP landing effect failed:', err);
        }
      });
      return { ok: true, message: `Teleported ${p.name} to ${BOARD[idx].name}; landing effect triggered.` };
    }

    m = text.match(/^\/start\s+(.+)$/i);
    if (m) {
      const raw = m[1].trim().replace(/^%|%$/g, '').replace(/^"|"$/g, '');
      const p = this.findPlayerByName(raw);
      if (!p) return { ok: false, message: 'Player not found.' };
      // /start is always an instant teleport and does not award money.
      this.directTeleport(p, IDX_START);
      this.log('was teleported to START by admin command', p.id, 'info');
      GameUI.renderAll();
      return { ok: true, message: `Teleported ${p.name} to START.` };
    }

    return {
      ok: false,
      message: 'Unknown command. Use /land give|take, /country give|take, /eco give|take, /prison escape, /tp, or /start.'
    };
  },

  checkGameOver() {
    const left = this.alive();
    if (left.length <= 1 && this.state.players.length > 1) {
      this.state.phase = 'over';
      const w = left[0];
      this.log(w ? `${w.name} wins the game! 🏆` : 'Game over', w ? w.id : null, 'win');
      GameUI.renderAll();
      const human = this.state.players.find(p => !p.isBot);
      if (w && human && w.id === human.id) GameUI.playSound?.('win');
      else GameUI.playSound?.('game_over');
      GameUI.showEndScreen?.(w || null, human || null);
      return true;
    }
    return false;
  },

  /** بعد ما يكمل الفعل: نحدد شنو الأزرار اللي غادي تبان */
  finishAction() {
    if (this.state.phase === 'over' || this.state.phase === 'debt' || this.me.cash < 0) return;
    this.state.phase = 'action';
    GameUI.renderAll();
    if (this.me.isBot) setTimeout(() => Bot.afterRoll(), 800);
  }
};

/* ============================ البوت ============================ */
const Bot = {
  play() {
    const s = Game.state;
    if (s.phase === 'over') return;
    const p = Game.me;
    if (!p.isBot) return;

    if (s.phase === 'jail') {
      if (p.pardon > 0) return Game.jailPardon();
      if (p.cash > 400) return Game.jailPay();
      return Game.jailRoll();
    }
    if (s.phase === 'roll') Game.roll();
  },

  resolveDebt() {
    const s = Game.state;
    const p = Game.me;
    if (!p || !p.isBot || s.phase !== 'debt') return;

    // 1) Sell buildings legally until solvent or no building can be sold.
    let safety = 200;
    while (p.cash < 0 && safety-- > 0) {
      const sellable = BOARD.map((t, i) => i).filter(i => s.owners[i] === p.id && Game.canSellHouse(i, p.id));
      if (!sellable.length) break;
      sellable.sort((a, b) => (s.houses[b] || 0) - (s.houses[a] || 0));
      Game.sellHouse(sellable[0]);
    }
    if (p.cash >= 0) return Game.checkDebtResolved();

    // 2) Mortgage or sell land, depending on room settings.
    const owned = Object.keys(s.owners).map(Number).filter(i => s.owners[i] === p.id);
    for (const i of owned) {
      if (p.cash >= 0) break;
      if (s.settings.mortgaging) {
        if (Game.canMortgage(i, p.id)) Game.toggleMortgage(i);
      } else if (Game.canSellLand(i, p.id)) {
        Game.sellLand(i);
      }
    }
    if (p.cash >= 0) return Game.checkDebtResolved();

    // 3) No legal recovery remains.
    Game.declareBankrupt();
  },

  afterRoll() {
    const s = Game.state;
    const p = Game.me;
    if (!p.isBot || s.phase === 'over' || s.phase === 'debt') return;

    // الشراء: كيشري إلا بقات ليه سيولة كافية
    if (s.pendingBuy !== undefined && (s.pendingBuyPlayer === undefined || s.pendingBuyPlayer === p.id)) {
      const t = BOARD[s.pendingBuy];
      const keepCash = 250;
      const wants = Game.ownsGroup(p.id, t.group) || p.cash - t.cost > keepCash;
      if (wants && p.cash >= t.cost) {
        Game.buy();
        return; // buy() كتعيّط لـ finishAction اللي كتعاود تنادي afterRoll
      }
      s.pendingBuy = undefined;
      s.pendingBuyPlayer = undefined;
    }

    // البناء على المجموعات الكاملة وبنفس قاعدة التوزيع المتوازن
    const buildable = BOARD.map((t, i) => i)
      .filter(i => Game.canBuild(i) && p.cash > BOARD[i].houseCost + 300)
      .sort((a, b) =>
        (Game.state.houses[a] || 0) - (Game.state.houses[b] || 0) ||
        BOARD[a].houseCost - BOARD[b].houseCost
      );
    if (buildable.length) {
      Game.build(buildable[0]);
      return setTimeout(() => Bot.afterRoll(), 500);
    }

    setTimeout(() => Game.endTurn(), 700);
  }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
