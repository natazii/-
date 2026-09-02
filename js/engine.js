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
        skipTurns: 0,       // الإجازة كتخلي اللاعب يفوّت دور
        bankrupt: false
      })),
      turn: 0,
      phase: 'roll',        // roll | action | jail | over
      dice: [1, 1],
      doubles: 0,
      owners: {},           // tileIndex -> playerId
      houses: {},           // tileIndex -> 0..5  (5 = فندق)
      mortgaged: {},        // tileIndex -> true
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
    let guard = 0;
    do {
      s.turn = (s.turn + 1) % s.players.length;
      guard++;
    } while (s.players[s.turn].bankrupt && guard < 100);
    this.beginTurn();
  },

  endTurn() {
    if (this.busy) return;
    // دبل = اللاعب كيعاود يرمي
    if (this.state.dice[0] === this.state.dice[1] && this.state.phase === 'action' && this.me.jail === 0) {
      this.state.phase = 'roll';
      GameUI.renderAll();
      if (this.me.isBot) setTimeout(() => Bot.play(), 900);
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

  /** التحريك خانة بخانة مع أنيميشن */
  async movePlayer(p, steps, opts = {}) {
    for (let i = 0; i < steps; i++) {
      p.pos = (p.pos + 1) % BOARD.length;
      if (p.pos === IDX_START && !opts.noPass) {
        this.pay(p, this.state.settings.startBonus);
        this.log(`passed through START and received $${this.state.settings.startBonus}`, p.id, 'money');
      }
      GameUI.renderTokens();
      await sleep(140);
    }
  },

  /** نقل مباشر لخانة (بطاقة) */
  async teleport(p, target, opts = {}) {
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
          if (p.cash >= t.cost) s.pendingBuy = idx;      // نعرضو زر الشراء
          else this.log(`cannot afford ${t.name}`, p.id, 'info');
        } else if (owner !== p.id && !s.mortgaged[idx]) {
          const rent = this.rentOf(idx);
          const other = this.player(owner);
          this.pay(p, -rent);
          this.pay(other, rent);
          this.log(`paid $${rent} to ${other.name}`, p.id, 'rent');
          await this.settleDebt(p, other);
        }
        break;
      }

      case 'tax': {
        const amount = t.taxFlat ? t.taxFlat : Math.round(p.cash * t.taxPercent / 100);
        this.pay(p, -amount);
        s.vacationPot += amount;
        this.log(`paid a $${amount} tax`, p.id, 'tax');
        await this.settleDebt(p, null);
        break;
      }

      case 'treasure':
        await this.drawCard(p, 'treasure');
        break;

      case 'surprise':
        await this.drawCard(p, 'surprise');
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
    const p = this.me;
    const t = BOARD[idx];
    if (p.cash < t.cost) return;

    this.pay(p, -t.cost);
    s.owners[idx] = p.id;
    s.pendingBuy = undefined;
    this.log(`bought ${t.name}`, p.id, 'buy');
    GameUI.renderAll();
    this.finishAction();
  },

  /* ---------- البطاقات ---------- */
  async drawCard(p, deckName) {
    const card = this.decks[deckName].draw();
    this.log(`got a ${deckName} card: ${card.text}`, p.id, deckName);
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

      case 'jail':
        await this.sendToJail(p);
        break;

      case 'move': {
        if (card.to !== undefined && card.to >= 0) {
          await this.teleport(p, card.to, { noPass: card.noPass });
        } else if (card.back) {
          p.pos = (p.pos - card.back + BOARD.length) % BOARD.length;
          GameUI.renderTokens();
          await sleep(300);
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
    p.pos = IDX_JAIL;
    p.jail = 1;
    this.state.doubles = 0;
    this.state.pendingBuy = undefined;
    this.log('got into prison', p.id, 'jail');
    GameUI.renderTokens();
    await sleep(400);
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

  /* ---------- البناء والرهن ---------- */
  canBuild(idx) {
    const t = BOARD[idx];
    const s = this.state;
    if (!t || t.type !== 'city') return false;
    const owner = s.owners[idx];
    if (owner !== s.turn) return false;
    if (s.mortgaged[idx]) return false;
    if (!this.ownsGroup(owner, t.group)) return false;
    if ((s.houses[idx] || 0) >= 5) return false;
    return this.player(owner).cash >= t.houseCost;
  },

  build(idx) {
    if (!this.canBuild(idx)) return;
    const t = BOARD[idx];
    const p = this.me;
    this.pay(p, -t.houseCost);
    this.state.houses[idx] = (this.state.houses[idx] || 0) + 1;
    const h = this.state.houses[idx];
    this.log(`${h === 5 ? 'built a hotel on' : 'built a house on'} ${t.name}`, p.id, 'build');
    GameUI.renderAll();
  },

  sellHouse(idx) {
    const s = this.state;
    const t = BOARD[idx];
    if (s.owners[idx] !== s.turn || !(s.houses[idx] > 0)) return;
    s.houses[idx]--;
    this.pay(this.me, Math.round(t.houseCost / 2));
    this.log(`sold a house on ${t.name}`, this.me.id, 'build');
    GameUI.renderAll();
  },

  toggleMortgage(idx) {
    const s = this.state;
    const t = BOARD[idx];
    if (s.owners[idx] !== s.turn) return;
    if (s.mortgaged[idx]) {
      const cost = Math.round(t.cost * 0.55);
      if (this.me.cash < cost) return;
      this.pay(this.me, -cost);
      delete s.mortgaged[idx];
      this.log(`unmortgaged ${t.name}`, this.me.id, 'build');
    } else {
      if (s.houses[idx] > 0) return;
      this.pay(this.me, Math.round(t.cost / 2));
      s.mortgaged[idx] = true;
      this.log(`mortgaged ${t.name}`, this.me.id, 'build');
    }
    GameUI.renderAll();
  },

  /* ---------- الديون والإفلاس ---------- */
  /** إلا كان الرصيد سالب: نبيعو البيوت ونرهنو أوتوماتيكياً، وإلا الإفلاس */
  async settleDebt(p, creditor) {
    if (p.cash >= 0) return;
    const s = this.state;

    // 1) بيع البيوت
    for (const key of Object.keys(s.houses)) {
      while (p.cash < 0 && s.owners[key] === p.id && s.houses[key] > 0) {
        s.houses[key]--;
        this.pay(p, Math.round(BOARD[key].houseCost / 2));
      }
    }
    // 2) رهن العقارات
    for (const key of Object.keys(s.owners)) {
      if (p.cash >= 0) break;
      const i = Number(key);
      if (s.owners[i] === p.id && !s.mortgaged[i] && !(s.houses[i] > 0)) {
        s.mortgaged[i] = true;
        this.pay(p, Math.round(BOARD[i].cost / 2));
      }
    }
    if (p.cash >= 0) { GameUI.renderAll(); return; }

    // 3) الإفلاس
    p.bankrupt = true;
    p.cash = 0;
    Object.keys(s.owners).forEach(key => {
      const i = Number(key);
      if (s.owners[i] !== p.id) return;
      if (creditor) { s.owners[i] = creditor.id; }
      else { delete s.owners[i]; delete s.mortgaged[i]; }
      delete s.houses[i];
    });
    this.log(creditor ? `went bankrupt against ${creditor.name}` : 'went bankrupt', p.id, 'bankrupt');
    GameUI.renderAll();
    await sleep(600);
  },

  declareBankrupt() {
    const p = this.me;
    p.cash = -1;
    this.settleDebt(p, null).then(() => {
      p.bankrupt = true;
      GameUI.renderAll();
      this.nextTurn();
    });
  },

  checkGameOver() {
    const left = this.alive();
    if (left.length <= 1 && this.state.players.length > 1) {
      this.state.phase = 'over';
      const w = left[0];
      this.log(w ? `${w.name} wins the game! 🏆` : 'Game over', w ? w.id : null, 'win');
      GameUI.renderAll();
      GameUI.showCard(w ? `${w.name} ربح اللعبة! 🏆` : 'انتهت اللعبة', 'win');
      return true;
    }
    return false;
  },

  /** بعد ما يكمل الفعل: نحدد شنو الأزرار اللي غادي تبان */
  finishAction() {
    if (this.state.phase === 'over') return;
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

  afterRoll() {
    const s = Game.state;
    const p = Game.me;
    if (!p.isBot || s.phase === 'over') return;

    // الشراء: كيشري إلا بقات ليه سيولة كافية
    if (s.pendingBuy !== undefined) {
      const t = BOARD[s.pendingBuy];
      const keepCash = 250;
      const wants = Game.ownsGroup(p.id, t.group) || p.cash - t.cost > keepCash;
      if (wants && p.cash >= t.cost) {
        Game.buy();
        return; // buy() كتعيّط لـ finishAction اللي كتعاود تنادي afterRoll
      }
      s.pendingBuy = undefined;
    }

    // البناء على المجموعات الكاملة
    const buildable = BOARD.map((t, i) => i).filter(i => Game.canBuild(i) && p.cash > BOARD[i].houseCost + 300);
    if (buildable.length) {
      Game.build(buildable[0]);
      return setTimeout(() => Bot.afterRoll(), 500);
    }

    setTimeout(() => Game.endTurn(), 700);
  }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
