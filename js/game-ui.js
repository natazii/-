/* =========================================================================
   game-ui.js — طبقة العرض ديال اللعبة
   مسؤولة على: القطع، النرد، الأزرار، لوحة اللاعبين، السجل، البطاقات.
   ========================================================================= */

const GameUI = {
  tileEls: {},   // tileIndex -> DOM element
  selectedLand: null,
  soundVolume: 0.72,
  soundFiles: {
    dice: 'sounds/dice-roll.mp3',
    token_move: 'sounds/token-move.mp3',
    token_land: 'sounds/token-land.mp3',
    buy: 'sounds/buy-land.mp3',
    rent: 'sounds/rent-paid.mp3',
    money_loss: 'sounds/money-loss.mp3',
    start: 'sounds/pass-start.mp3',
    house: 'sounds/build-house.mp3',
    hotel: 'sounds/build-hotel.mp3',
    sell: 'sounds/sell-building.mp3',
    sell_land: 'sounds/sell-land.mp3',
    mortgage: 'sounds/mortgage.mp3',
    unmortgage: 'sounds/unmortgage.mp3',
    card: 'sounds/card.mp3',
    death_valley: 'sounds/death-valley.mp3',
    jail: 'sounds/jail.mp3',
    win: 'sounds/win.mp3',
    game_over: 'sounds/game-over.mp3'
  },

  playSound(name) {
    const src = this.soundFiles[name];
    if (!src) return;
    try {
      const a = new Audio(src);
      a.volume = this.soundVolume;
      a.play().catch(() => {});
    } catch (_) {}
  },

  reset() {
    this.selectedLand = null;
    this.closeLandInfo();
    this.hideEndScreen();
    document.querySelectorAll('.g-token-mover,.g-token-ghost').forEach(el => el.remove());
    document.querySelectorAll('.rt-tokens').forEach(el => (el.innerHTML = ''));
    const actions = document.getElementById('gameActions');
    const log = document.getElementById('gameLog');
    const props = document.getElementById('gameProps');
    const players = document.getElementById('gamePlayers');
    if (actions) actions.innerHTML = '';
    if (log) log.innerHTML = '';
    if (props) props.innerHTML = '';
    if (players) players.innerHTML = '';
    const count = document.getElementById('gamePropsCount');
    if (count) count.textContent = '0';
  },

  /** كيتسمى مرة وحدة من buildBoard() */
  registerTile(idx, el) { this.tileEls[idx] = el; },

  /* ---------------- الرسم الشامل ---------------- */
  renderAll() {
    this.renderTokens();
    this.renderOwnership();
    this.renderPlayers();
    this.renderActions();
    this.renderLog();
    this.renderProperties();
    if (this.selectedLand !== null) this.renderLandInfo(this.selectedLand);
  },

  /* ---------------- قطع اللاعبين ---------------- */
  renderTokens() {
    const s = Game.state;
    if (!s) return;
    document.querySelectorAll('.rt-tokens').forEach(el => (el.innerHTML = ''));
    s.players.forEach(p => {
      if (p.bankrupt) return;
      const tile = this.tileEls[p.pos];
      if (!tile) return;
      let box = tile.querySelector('.rt-tokens');
      if (!box) {
        box = document.createElement('div');
        box.className = 'rt-tokens';
        tile.appendChild(box);
      }
      const tok = document.createElement('span');
      tok.className = 'g-token face-token' + (s.turn === p.id ? ' active' : '');
      tok.style.setProperty('--player-color', p.color);
      tok.title = p.name;
      tok.dataset.playerId = p.id;
      tok.dataset.look = p.look || this.lookForTile(p.pos);
      tok.setAttribute('aria-label', p.name);
      tok.innerHTML = '<span class="token-face-eyes" aria-hidden="true"></span>';
      box.appendChild(tok);
    });
  },

  /* ---------------- Richup-style token movement ---------------- */
  tileCenter(idx) {
    const tile = this.tileEls[idx];
    if (!tile) return null;
    const r = tile.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  },

  movingToken(player, look = 'right') {
    const el = document.createElement('span');
    el.className = 'g-token face-token g-token-mover active';
    el.style.setProperty('--player-color', player.color);
    el.style.setProperty('--flight-color', player.color);
    el.dataset.playerId = player.id;
    el.dataset.look = look;
    el.title = player.name;
    el.setAttribute('aria-label', player.name);
    el.innerHTML = '<span class="token-face-eyes" aria-hidden="true"></span>';
    document.body.appendChild(el);
    return el;
  },

  lookForTile(idx) {
    const tile = BOARD[idx];
    if (!tile) return 'right';
    if (tile.r === 1 && tile.c < 13) return 'right';
    if (tile.c === 13 && tile.r < 13) return 'down';
    if (tile.r === 13 && tile.c > 1) return 'left';
    if (tile.c === 1 && tile.r > 1) return 'up';
    if (idx === 0) return 'right';
    if (idx === 12) return 'down';
    if (idx === 24) return 'left';
    if (idx === 36) return 'up';
    return 'right';
  },

  directionBetween(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return {
      dx,
      dy,
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
      look: Math.abs(dx) >= Math.abs(dy)
        ? (dx >= 0 ? 'right' : 'left')
        : (dy >= 0 ? 'down' : 'up')
    };
  },

  pointMover(el, direction) {
    if (!el || !direction) return;
    el.dataset.look = direction.look;
    el.style.setProperty('--flight-angle', `${direction.angle}deg`);
  },

  /* V11.6 REAL OLD MOVEMENT: continuous one-piece flight + delayed ghosts. */
  async animateTokenPath(player, fromIdx, steps, opts = {}) {
    const total = Math.max(0, Number(steps) || 0);
    if (!total) return;
    const dir = opts.direction === -1 ? -1 : 1;
    this.playSound('token_move');
    const points = [this.tileCenter(fromIdx)];
    for (let i = 1; i <= total; i++) {
      points.push(this.tileCenter((fromIdx + dir * i + BOARD.length * 20) % BOARD.length));
    }
    if (points.some(p => !p) || !document.body.animate) {
      await sleep(Math.max(90, total * 35));
      return;
    }

    const staticToken = document.querySelector(`.g-token[data-player-id="${player.id}"]:not(.g-token-mover):not(.g-token-ghost)`);
    if (staticToken) staticToken.style.visibility = 'hidden';

    const directions = points.slice(1).map((point, i) => this.directionBetween(points[i], point));
    const firstDirection = directions[0];
    const makeMover = (ghost = false) => {
      const el = this.movingToken(player, firstDirection.look);
      if (ghost) el.classList.add('g-token-ghost');
      el.classList.add('flight');
      el.style.left = `${points[0].x}px`;
      el.style.top = `${points[0].y}px`;
      this.pointMover(el, firstDirection);
      return el;
    };

    const keyframes = points.map((pt, i) => {
      const edge = i === 0 || i === points.length - 1;
      return {
        left: `${pt.x}px`,
        top: `${pt.y}px`,
        transform: `translate(-50%,-50%) scale(${edge ? 1.08 : 1.24})`,
        filter: edge ? 'blur(0px) brightness(1.08)' : 'blur(.8px) brightness(1.34)',
        opacity: 1,
        offset: i / (points.length - 1)
      };
    });

    // One continuous flight for the entire dice move. The translucent delayed
    // copies create the fast Richup-like motion trail without hopping.
    const mover = makeMover(false);
    const ghosts = [1, 2, 3].map(n => {
      const g = makeMover(true);
      g.style.opacity = String(0.28 / n);
      return { el: g, delay: 16 * n };
    });

    const duration = Math.min(820, Math.max(170, total * 64));

    // Keep the original one-piece Richup flight, but turn the face as the
    // token travels around board corners.
    const facingTimers = [];
    directions.forEach((direction, i) => {
      const at = Math.max(0, Math.round(duration * (i / Math.max(1, directions.length))));
      facingTimers.push(setTimeout(() => {
        if (mover.isConnected) this.pointMover(mover, direction);
      }, at));
      ghosts.forEach(g => {
        facingTimers.push(setTimeout(() => {
          if (g.el.isConnected) this.pointMover(g.el, direction);
        }, at + g.delay));
      });
    });

    const main = mover.animate(keyframes, {
      duration,
      easing: 'linear',
      fill: 'forwards'
    });
    const ghostAnimations = ghosts.map(({el, delay}) => el.animate(keyframes, {
      duration,
      delay,
      easing: 'linear',
      fill: 'forwards'
    }));

    try { await main.finished; } catch (_) {}
    try { await Promise.all(ghostAnimations.map(a => a.finished.catch(() => {}))); } catch (_) {}
    facingTimers.forEach(clearTimeout);
    player.look = directions[directions.length - 1].look;

    mover.remove();
    ghosts.forEach(g => g.el.remove());
    if (staticToken) staticToken.style.visibility = '';
    if (opts.final !== false) {
      this.pulseTile((fromIdx + dir * total + BOARD.length * 20) % BOARD.length, 'land');
      this.playSound('token_land');
    }
  },

  async animateTokenStep(player, fromIdx, toIdx, opts = {}) {
    const a = this.tileCenter(fromIdx);
    const b = this.tileCenter(toIdx);
    if (!a || !b || !document.body.animate) {
      await sleep(opts.fast ? 45 : 62);
      return;
    }

    const staticToken = document.querySelector(`.g-token[data-player-id="${player.id}"]:not(.g-token-mover)`);
    if (staticToken) staticToken.style.visibility = 'hidden';

    const direction = this.directionBetween(a, b);
    const { dx, dy } = direction;
    const mover = this.movingToken(player, direction.look);
    mover.classList.add('flight');
    mover.style.left = `${a.x}px`;
    mover.style.top = `${a.y}px`;
    this.pointMover(mover, direction);

    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    mover.style.setProperty('--flight-angle', `${angle}deg`);
    mover.style.setProperty('--flight-color', player.color);
    mover.style.boxShadow = [5, 10, 15].map((d, i) =>
      `${(-nx*d).toFixed(1)}px ${(-ny*d).toFixed(1)}px ${3 + i*2}px ${player.color}${['99','66','33'][i]}`
    ).join(',') + ', 0 0 0 3px rgba(255,255,255,.34)';

    const duration = opts.fast ? 46 : 62;
    const animation = mover.animate([
      { left: `${a.x}px`, top: `${a.y}px`, transform: 'translate(-50%,-50%) scale(1.05)', filter: 'blur(0px) brightness(1.08)', opacity: 1 },
      { left: `${a.x + dx * .18}px`, top: `${a.y + dy * .18}px`, transform: 'translate(-50%,-50%) scale(1.22)', filter: 'blur(.45px) brightness(1.25)', opacity: .98 },
      { left: `${a.x + dx * .82}px`, top: `${a.y + dy * .82}px`, transform: 'translate(-50%,-50%) scale(1.18)', filter: 'blur(.35px) brightness(1.18)', opacity: .98 },
      { left: `${b.x}px`, top: `${b.y}px`, transform: 'translate(-50%,-50%) scale(1.02)', filter: 'blur(0px) brightness(1.05)', opacity: 1 }
    ], { duration, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'forwards' });

    try { await animation.finished; } catch (_) {}
    player.look = direction.look;
    mover.remove();
    if (staticToken) staticToken.style.visibility = '';
    if (opts.final) this.pulseTile(toIdx, 'land');
  },

  async animateTokenTeleport(player, fromIdx, toIdx) {
    const a = this.tileCenter(fromIdx);
    const b = this.tileCenter(toIdx);
    if (!a || !b || !document.body.animate) return sleep(180);

    const staticToken = document.querySelector(`.g-token[data-player-id="${player.id}"]:not(.g-token-mover)`);
    if (staticToken) staticToken.style.visibility = 'hidden';

    const direction = this.directionBetween(a, b);
    const { dx, dy } = direction;
    const mover = this.movingToken(player, direction.look);
    mover.classList.add('flight', 'teleporting');
    mover.style.left = `${a.x}px`;
    mover.style.top = `${a.y}px`;
    this.pointMover(mover, direction);

    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance, ny = dy / distance;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    mover.style.setProperty('--flight-angle', `${angle}deg`);
    mover.style.setProperty('--flight-color', player.color);
    mover.style.boxShadow = `${-nx*12}px ${-ny*12}px 8px ${player.color}88, ${-nx*24}px ${-ny*24}px 14px ${player.color}44, 0 0 0 3px rgba(255,255,255,.38)`;

    const animation = mover.animate([
      { left: `${a.x}px`, top: `${a.y}px`, transform: 'translate(-50%,-50%) scale(1.08)', filter: 'blur(0px) brightness(1.05)' },
      { left: `${a.x + dx * .50}px`, top: `${a.y + dy * .50}px`, transform: 'translate(-50%,-50%) scale(1.34)', filter: 'blur(.75px) brightness(1.35)' },
      { left: `${b.x}px`, top: `${b.y}px`, transform: 'translate(-50%,-50%) scale(1.04)', filter: 'blur(0px) brightness(1.05)' }
    ], { duration: 220, easing: 'cubic-bezier(.17,.78,.18,1)', fill: 'forwards' });

    try { await animation.finished; } catch (_) {}
    player.look = direction.look;
    mover.remove();
    if (staticToken) staticToken.style.visibility = '';
    this.pulseTile(toIdx, 'jail');
  },

  pulseTile(idx, kind = 'land') {
    const tile = this.tileEls[idx];
    if (!tile) return;
    tile.classList.remove('tile-pulse-land','tile-pulse-money','tile-pulse-house','tile-pulse-hotel','tile-pulse-sell','tile-pulse-jail','tile-pulse-mortgage','tile-pulse-unmortgage');
    // force restart
    void tile.offsetWidth;
    tile.classList.add(`tile-pulse-${kind}`);
    setTimeout(() => tile.classList.remove(`tile-pulse-${kind}`), 520);
  },

  /* ---------------- الملكية والبيوت ---------------- */
  renderOwnership() {
    const s = Game.state;
    if (!s) return;
    Object.keys(this.tileEls).forEach(k => {
      const idx = Number(k);
      const el = this.tileEls[idx];
      const owner = s.owners[idx];
      el.classList.toggle('owned', owner !== undefined);
      el.classList.toggle('mortgaged', !!s.mortgaged[idx]);
      el.style.setProperty('--owner-color', owner !== undefined ? Game.player(owner).color : 'transparent');
      const tile = BOARD[idx] || {};
      const ownable = ['city', 'airport', 'company'].includes(tile.type);
      const priceBadge = el.querySelector('.rt-price');
      if (priceBadge) {
        priceBadge.style.display = '';
        // Keep the price's layout slot when ownership replaces it. Removing
        // the element from layout pulled row labels into the claimed bar.
        priceBadge.style.visibility = (ownable && owner !== undefined) ? 'hidden' : '';
      }

      let ownerMark = el.querySelector('.rt-owner-mark');
      if (ownable && owner !== undefined) {
        if (!ownerMark) {
          ownerMark = document.createElement('div');
          ownerMark.className = 'rt-owner-mark';
          el.appendChild(ownerMark);
        }
        const ownerPlayer = Game.player(owner);
        ownerMark.style.setProperty('--owner-color', ownerPlayer?.color || '#8bc34a');
        ownerMark.title = ownerPlayer ? `${ownerPlayer.name} owns ${tile.name}` : `${tile.name} is owned`;
        ownerMark.textContent = '';
      } else if (ownerMark) {
        ownerMark.remove();
      }

      let hb = el.querySelector('.rt-houses');
      const h = s.houses[idx] || 0;
      if (h > 0) {
        if (!hb) {
          hb = document.createElement('div');
          hb.className = 'rt-houses';
          el.appendChild(hb);
        }
        if (h === 5) {
          hb.className = 'rt-houses has-hotel';
          hb.innerHTML = '<span class="rt-hotel" title="Hotel"></span>';
        } else {
          hb.className = 'rt-houses';
          hb.innerHTML = Array.from({ length: h }, () => '<span class="rt-house" title="House"></span>').join('');
        }
      } else if (hb) {
        hb.remove();
      }
    });
  },

  /* ---------------- لوحة اللاعبين ---------------- */
  renderPlayers() {
    const s = Game.state;
    const box = document.getElementById('gamePlayers');
    if (!box || !s) return;
    box.innerHTML = s.players.map(p => `
      <div class="g-player${s.turn === p.id ? ' turn' : ''}${p.bankrupt ? ' out' : ''}">
        <span class="g-avatar player-face" style="--player-color:${p.color}" data-look="${p.look || this.lookForTile(p.pos)}" aria-hidden="true"></span>
        <span class="g-pname">${p.name}${p.isBot ? ' <i class="g-bot">BOT</i>' : ''}${p.jail > 0 ? ' 🔒' : ''}${p.deathMultiplier > 0 ? ` <i class="g-valley-curse">💀×${p.deathMultiplier}</i>` : ''}</span>
        <span class="g-cash" id="cash-${p.id}">$${p.cash}</span>
      </div>
    `).join('');

    const bankruptBtn = document.querySelector('.g-bankrupt');
    if (bankruptBtn) {
      bankruptBtn.disabled = !!Game.me.isBot || !!Game.busy || s.phase === 'over';
      bankruptBtn.title = Game.me.isBot ? "You can't act during a bot turn" : '';
    }
  },

  /** أنيميشن +200 / -50 حدا الرصيد */
  flashMoney(playerId, amount) {
    if (!amount) return;
    const el = document.getElementById('cash-' + playerId);
    if (!el) return;
    const f = document.createElement('span');
    f.className = 'g-flash ' + (amount > 0 ? 'up' : 'down');
    f.textContent = (amount > 0 ? '+' : '') + amount;
    el.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  },

  /* ---------------- أزرار الدور ---------------- */
  renderActions() {
    const s = Game.state;
    if (!s) return;
    const p = Game.me;
    const human = !p.isBot;
    const acts = [];

    if (s.phase === 'over') {
      this.setActions([]);
      return;
    }
    if (s.phase === 'debt') {
      const bar = document.getElementById('gameActions');
      if (bar) bar.innerHTML = human
        ? `<div class="g-debt-warning">⚠ Balance is negative ($${p.cash}). Open your land information and sell a building / mortgage / sell land, or declare bankruptcy.</div>`
        : '<div class="g-debt-warning">🤖 Bot is resolving debt...</div>';
      return;
    }
    if (s.phase === 'jail' && human) {
      acts.push({ t: '🎲 Roll the dice', fn: 'Game.roll()' });
      if (p.cash >= s.settings.jailFee) acts.push({ t: `💰 get free for $${s.settings.jailFee}`, fn: 'Game.jailPay()' });
      if (p.pardon > 0) acts.push({ t: '🕊 Use Pardon card', fn: 'Game.jailPardon()', cls: 'pink' });
    } else if (s.phase === 'roll' && human) {
      acts.push({ t: '🎲 Roll the dice', fn: 'Game.roll()' });
    } else if (s.phase === 'action' && human) {
      if (s.pendingBuy !== undefined && (s.pendingBuyPlayer === undefined || s.pendingBuyPlayer === p.id)) {
        const t = BOARD[s.pendingBuy];
        acts.push({ t: `💰 Buy for $${t.cost}`, fn: 'Game.buy()', cls: 'blue' });
      }
      const again = s.dice[0] === s.dice[1] && p.jail === 0;
      acts.push({ t: again ? '🎲 Roll again (double)' : '✓ End turn', fn: 'Game.endTurn()' });
    }
    this.setActions(acts);
  },

  setActions(acts) {
    const bar = document.getElementById('gameActions');
    if (!bar) return;
    bar.innerHTML = acts.map(a =>
      `<button class="g-btn ${a.cls || ''}" onclick="${a.fn}">${a.t}</button>`
    ).join('');
  },

  /* ---------------- السجل ---------------- */
  renderLog() {
    const s = Game.state;
    const box = document.getElementById('gameLog');
    if (!box || !s) return;
    box.innerHTML = s.log.slice(0, 9).map((l, i) => {
      const p = l.playerId !== null && l.playerId !== undefined ? Game.player(l.playerId) : null;
      const dot = p ? `<span class="g-logdot" style="background:${p.color}"></span><b>${p.name}</b>` : '';
      return `<div class="g-logline" style="opacity:${Math.max(0.15, 1 - i * 0.13)}">${dot} ${l.text}</div>`;
    }).join('');
  },

  /* ---------------- قائمة الممتلكات: الإدارة صارت من نافذة معلومات الأرض ---------------- */
  renderProperties() {
    const s = Game.state;
    const box = document.getElementById('gameProps');
    const head = document.getElementById('gamePropsCount');
    if (!box || !s) return;

    const me = s.players.find(p => !p.isBot && !p.bankrupt) || s.players.find(p => !p.isBot) || Game.me;
    const ids = Object.keys(s.owners).map(Number).filter(i => s.owners[i] === me.id);
    if (head) head.textContent = String(ids.length);

    const rows = ids.map(i => {
      const t = BOARD[i];
      const h = s.houses[i] || 0;
      const mortgaged = !!s.mortgaged[i];
      let buildingText = '';
      if (h === 5) buildingText = '<span class="prop-hotel"><i class="mini-hotel"></i> HOTEL</span>';
      else if (h > 0) buildingText = `<span class="prop-houses">${Array.from({length:h}, () => '<i class="mini-house"></i>').join('')}</span>`;
      const mort = mortgaged ? '<i class="g-mort">MORTGAGED</i>' : '';
      return `<button class="g-prop g-prop-open ${mortgaged ? 'is-mortgaged' : ''}" onclick="GameUI.openLandInfo(${i})">
        <span class="g-propdot" style="background:${t.color || '#5f7d95'}"></span>
        <span class="g-propname"><span class="g-prop-title">${t.name}</span><span class="g-prop-meta">${mort}</span></span>
        <span class="g-prophouses">${buildingText}</span>
        <span class="g-prop-arrow">›</span>
      </button>`;
    });

    if (me.pardon > 0) {
      rows.push(`<div class="g-prop"><span class="g-propdot" style="background:#e0a3ff"></span><span class="g-propname"><span class="g-prop-title">Pardon card × ${me.pardon}</span></span></div>`);
    }
    if (me.valleyPardon > 0) {
      rows.push(`<div class="g-prop"><span class="g-propdot" style="background:#6d5a88"></span><span class="g-propname"><span class="g-prop-title">💀 Valley Pardon × ${me.valleyPardon}</span></span></div>`);
    }

    box.innerHTML = rows.join('') || '<div class="g-empty">No properties yet</div>';
  },

  /* ---------------- Land info card — anchored to the clicked land ---------------- */
  ensureLandInfo() {
    let wrap = document.getElementById('landInfoModal');

    if (wrap && !wrap.classList.contains('land-info-v8')) {
      wrap.remove();
      wrap = null;
    }

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'landInfoModal';
      wrap.className = 'land-info-v8';
      wrap.innerHTML = '<section class="land-info-v8-card" id="landInfoCard"></section>';
      document.body.appendChild(wrap);
    } else if (wrap.parentElement !== document.body) {
      document.body.appendChild(wrap);
    }

    wrap.style.position = 'fixed';
    wrap.style.left = '0px';
    wrap.style.top = '0px';
    wrap.style.width = 'auto';
    wrap.style.height = 'auto';
    wrap.style.zIndex = '2147483000';
    wrap.style.pointerEvents = 'auto';
    if (!wrap.classList.contains('show')) wrap.style.display = 'none';

    if (!this._landInfoOutsideBound) {
      this._landInfoOutsideBound = true;
      document.addEventListener('pointerdown', (ev) => {
        const openWrap = document.getElementById('landInfoModal');
        if (!openWrap || !openWrap.classList.contains('show')) return;
        const card = document.getElementById('landInfoCard');
        if (card && card.contains(ev.target)) return;
        const tile = ev.target.closest?.('.room-tile[data-tile-index]');
        if (tile) {
          const idx = Number(tile.dataset.tileIndex);
          const t = BOARD[idx];
          if (t && ['city','airport','company','deathvalley','surprise','treasure'].includes(t.type)) return;
        }
        this.closeLandInfo();
      }, true);
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') this.closeLandInfo();
      });
    }

    return wrap;
  },

  positionLandInfo(idx) {
    const wrap = document.getElementById('landInfoModal');
    const card = document.getElementById('landInfoCard');
    const tile = this.tileEls[idx] || document.querySelector(`.room-tile[data-tile-index="${idx}"]`);
    if (!wrap || !card || !tile) return;

    const tileRect = tile.getBoundingClientRect();
    const cardW = card.offsetWidth || 318;
    const cardH = card.offsetHeight || 390;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const pad = 8;
    const gap = 10;
    const t = BOARD[idx];

    let anchor = 'top';
    let left = tileRect.left + tileRect.width / 2 - cardW / 2;
    let top = tileRect.bottom + gap;

    if (t && t.c === 1 && !t.corner) {
      anchor = 'left';
      left = tileRect.right + gap;
      top = tileRect.top + tileRect.height / 2 - cardH / 2;
    } else if (t && t.c === 13 && !t.corner) {
      anchor = 'right';
      left = tileRect.left - cardW - gap;
      top = tileRect.top + tileRect.height / 2 - cardH / 2;
    } else if (t && t.r === 13 && !t.corner) {
      anchor = 'bottom';
      left = tileRect.left + tileRect.width / 2 - cardW / 2;
      top = tileRect.top - cardH - gap;
    } else {
      anchor = 'top';
      left = tileRect.left + tileRect.width / 2 - cardW / 2;
      top = tileRect.bottom + gap;
    }

    left = Math.max(pad, Math.min(vw - cardW - pad, left));
    top = Math.max(pad, Math.min(vh - cardH - pad, top));

    wrap.dataset.anchor = anchor;
    wrap.style.left = `${Math.round(left)}px`;
    wrap.style.top = `${Math.round(top)}px`;

    const tileCx = tileRect.left + tileRect.width / 2;
    const tileCy = tileRect.top + tileRect.height / 2;
    const arrowX = Math.max(18, Math.min(cardW - 18, tileCx - left));
    const arrowY = Math.max(18, Math.min(cardH - 18, tileCy - top));
    card.style.setProperty('--land-arrow-x', `${arrowX}px`);
    card.style.setProperty('--land-arrow-y', `${arrowY}px`);
  },

  openLandInfo(idx) {
    const t = BOARD[idx];
    if (!t || !['city','airport','company','deathvalley','surprise','treasure'].includes(t.type)) return;

    // Clicking the SAME land again toggles its information card closed.
    const existingWrap = document.getElementById('landInfoModal');
    if (this.selectedLand === idx && existingWrap && existingWrap.classList.contains('show')) {
      this.closeLandInfo();
      return;
    }

    this.selectedLand = idx;
    const wrap = this.ensureLandInfo();
    wrap.classList.add('show');
    wrap.style.display = 'block';
    wrap.style.visibility = 'hidden';
    this.renderLandInfo(idx);

    requestAnimationFrame(() => {
      this.positionLandInfo(idx);
      wrap.style.visibility = 'visible';
      wrap.classList.add('land-info-v8-pop');
      setTimeout(() => wrap.classList.remove('land-info-v8-pop'), 150);
    });
  },

  closeLandInfo() {
    this.selectedLand = null;
    const wrap = document.getElementById('landInfoModal');
    if (!wrap) return;
    wrap.classList.remove('show');
    wrap.style.display = 'none';
    wrap.style.visibility = 'hidden';
  },

  flagImage(tile) {
    try {
      // Full-size rectangular artwork is for the popup ONLY.
      if (tile.flag && typeof POPUP_FLAG_IMAGES !== 'undefined' && POPUP_FLAG_IMAGES[tile.flag]) {
        return POPUP_FLAG_IMAGES[tile.flag];
      }
      // Fallback for countries where the user has not supplied a big popup flag yet.
      if (tile.flag && typeof ROUND_FLAG_IMAGES !== 'undefined' && ROUND_FLAG_IMAGES[tile.flag]) {
        return ROUND_FLAG_IMAGES[tile.flag];
      }
      if (tile.flag && typeof FLAG_IMAGES !== 'undefined' && FLAG_IMAGES[tile.flag]) {
        return FLAG_IMAGES[tile.flag];
      }
    } catch (_) {}
    return '';
  },

  renderLandInfo(idx) {
    if (this.selectedLand === null) return;
    const t = BOARD[idx];
    const card = document.getElementById('landInfoCard');
    if (!t || !card) return;

    const closeButton = ''; // V9: no X button; click the land again or anywhere outside to close.

    if (t.type === 'deathvalley') {
      card.className = 'land-info-v8-card special-info death-info';
      card.innerHTML = `
        <div class="special-info-bg">💀</div><div class="land-info-shade"></div>${closeButton}
        <div class="land-info-content special-info-content">
          <div class="special-info-icon">💀</div><h2>Death Valley</h2>
          <p class="special-info-lead">Landing here makes you roll the two dice again without moving.</p>
          <div class="special-rule-list">
            <div><b>Roll 2 or 12</b><span>You escape. Any older Death Valley curse is removed.</span></div>
            <div><b>Any other total</b><span>That total becomes your new Death Valley multiplier.</span></div>
            <div><b>Next unbuilt enemy land</b><span>Normal rent × your Death Valley multiplier.</span></div>
            <div><b>Land with buildings</b><span>The Death Valley loss is always $200.</span></div>
            <div><b>Land here again</b><span>The old multiplier is replaced. It never stacks.</span></div>
            <div><b>Valley Pardon</b><span>Consumes one card and cancels the new curse.</span></div>
          </div>
        </div>`;
      this.bindLandInfoClose();
      return;
    }

    if (t.type === 'surprise') {
      card.className = 'land-info-v8-card special-info surprise-info';
      card.innerHTML = `
        <div class="special-info-bg">?</div><div class="land-info-shade"></div>${closeButton}
        <div class="land-info-content special-info-content">
          <div class="special-info-icon surprise">?</div><h2>Surprise</h2>
          <p class="special-info-lead">Landing here draws one random Surprise card.</p>
          <div class="special-rule-list compact">
            <div><b>Movement</b><span>Move to a city, airport, company, Vacation, START, or backwards.</span></div>
            <div><b>Prison</b><span>A Surprise card can send you directly to prison.</span></div>
            <div><b>Money</b><span>You may gain money, pay a fine, or pay the other players.</span></div>
            <div><b>Pardon cards</b><span>You can receive a Prison Pardon or a Pardon of the Valley.</span></div>
          </div>
        </div>`;
      this.bindLandInfoClose();
      return;
    }

    if (t.type === 'treasure') {
      card.className = 'land-info-v8-card special-info treasure-info';
      card.innerHTML = `
        <div class="special-info-bg">🎁</div><div class="land-info-shade"></div>${closeButton}
        <div class="land-info-content special-info-content">
          <div class="special-info-icon treasure">🎁</div><h2>Treasure</h2>
          <p class="special-info-lead">Landing here draws one random Treasure card.</p>
          <div class="special-rule-list compact">
            <div><b>Rewards</b><span>Receive cash, dividends, refunds, or money from other players.</span></div>
            <div><b>Costs</b><span>Some cards charge fees, repairs, school costs, or other payments.</span></div>
            <div><b>Movement</b><span>A Treasure card can send you directly to START.</span></div>
            <div><b>Pardon</b><span>You can receive a Prison Pardon and keep it until needed.</span></div>
          </div>
        </div>`;
      this.bindLandInfoClose();
      return;
    }

    if (!['city','airport','company'].includes(t.type)) return;

    const s = Game.state;
    const flagSrc = this.flagImage(t);
    card.dataset.country = t.group || '';
    const ownerId = s ? s.owners[idx] : undefined;
    const owner = s && ownerId !== undefined ? Game.player(ownerId) : null;
    const level = s ? (s.houses[idx] || 0) : 0;
    const mortgaged = !!(s && s.mortgaged[idx]);
    const me = s ? (s.players.find(p => !p.isBot && !p.bankrupt) || s.players.find(p => !p.isBot) || Game.me) : null;
    const current = s ? Game.me : null;
    const humanManage = !!(s && me && current && !current.isBot && me.id === s.turn && !Game.busy && s.phase !== 'over');
    const mine = !!(s && me && ownerId === me.id);

    let rentRows = '';
    if (t.type === 'city') {
      const labels = ['rent','with one house','with two houses','with three houses','with four houses','with a hotel'];
      rentRows = t.rent.map((r, i) => `<div class="land-rent-row ${level === i ? 'current' : ''}"><span>${labels[i]}</span><b>$${r}</b></div>`).join('');
    } else if (t.type === 'airport') {
      rentRows = [25,50,100,200].map((r,i) => `<div class="land-rent-row"><span>${i+1} airport${i ? 's' : ''} owned</span><b>$${r}</b></div>`).join('');
    } else {
      rentRows = [4,10,20].map((mult,i) => `<div class="land-rent-row"><span>${i+1} compan${i ? 'ies' : 'y'} owned</span><b>dice × ${mult}</b></div>`).join('');
    }

    const actions = [];
    const pendingBuyerId = s && s.pendingBuyPlayer !== undefined ? s.pendingBuyPlayer : (s ? s.turn : undefined);
    if (s && !owner && s.pendingBuy === idx && me && pendingBuyerId === me.id && !me.isBot && me.cash >= t.cost && s.phase !== 'debt') {
      actions.push(`<button class="land-action buy" onclick="Game.buy();GameUI.renderLandInfo(${idx})">Buy for $${t.cost}</button>`);
    }
    if (s && mine && humanManage) {
      if (t.type === 'city') {
        if (Game.canBuild(idx, me.id)) {
          actions.push(`<button class="land-action build" onclick="Game.build(${idx});GameUI.renderLandInfo(${idx})">${level === 4 ? 'Build hotel' : 'Build house'} <small>-$${t.houseCost}</small></button>`);
        } else if (Game.ownsGroup(me.id, t.group) && level < 5) {
          const why = Game.buildBlockReason ? Game.buildBlockReason(idx, me.id) : 'Building is not available on this land yet.';
          actions.push(`<button class="land-action build disabled" disabled title="${why.replace(/"/g,'&quot;')}">${level === 4 ? 'Build hotel' : 'Build house'} <small>${why}</small></button>`);
        }
      }
      if (s.settings.mortgaging) {
        const canM = mortgaged ? Game.canUnmortgage(idx) : Game.canMortgage(idx);
        if (canM) {
          const value = mortgaged ? Math.round(t.cost * .55) : Math.round(t.cost / 2);
          actions.push(`<button class="land-action mortgage" onclick="Game.toggleMortgage(${idx});GameUI.renderLandInfo(${idx})">${mortgaged ? 'Unmortgage' : 'Mortgage'} <small>${mortgaged ? '-' : '+'}$${value}</small></button>`);
        }
      }
      if (t.type === 'city' && level > 0 && Game.canSellHouse(idx)) {
        const what = level === 5 ? 'hotel' : 'house';
        actions.push(`<button class="land-action sell" onclick="if(confirm('Sell this ${what}?')){Game.sellHouse(${idx});GameUI.renderLandInfo(${idx})}">${level === 5 ? 'Sell hotel' : 'Sell house'} <small>+$${Math.round(t.houseCost/2)}</small></button>`);
      }
      if (!s.settings.mortgaging && Game.canSellLand(idx)) {
        actions.push(`<button class="land-action sell-land" onclick="if(confirm('Sell this land back to the bank?')){Game.sellLand(${idx});GameUI.renderLandInfo(${idx})}">Sell land <small>+$${Math.round(t.cost/2)}</small></button>`);
      }
    }

    const ownerText = !s ? 'Game not started' : owner ? `Owned by ${owner.name}` : 'Unowned';
    const bg = flagSrc ? `<img class="land-info-flag-image" src="${flagSrc}" alt="" />` : `<span class="land-info-flag-emoji">${t.flag || ''}</span>`;

    card.className = 'land-info-v8-card property-info';
    card.innerHTML = `
      <div class="land-info-flag-bg">${bg}</div><div class="land-info-shade"></div>${closeButton}
      <div class="land-info-content">
        <div class="land-info-country">${t.country || (typeof COUNTRY_NAME !== 'undefined' && COUNTRY_NAME[t.group]) || ''}</div>
        <h2>${t.name}</h2>
        <div class="land-info-owner ${mortgaged ? 'mortgaged' : ''}">${ownerText}${mortgaged ? ' • MORTGAGED' : ''}</div>
        <div class="land-rents">${rentRows}</div>
        ${!owner ? `<div class="land-info-stats"><div><span>Price</span><b>$${t.cost}</b></div>${t.type === 'city' ? `<div><span>🏠 House</span><b>$${t.houseCost}</b></div><div><span>🏨 Hotel</span><b>$${t.houseCost}</b></div>` : ''}</div>` : ''}
        ${actions.length ? `<div class="land-info-actions">${actions.join('')}</div>` : ''}
        ${s && mine && s.phase === 'debt' ? `<div class="land-debt-note">Your balance is $${me.cash}. You cannot continue until it is $0 or higher.</div>` : ''}
      </div>`;
    this.bindLandInfoClose();
    const liveWrap = document.getElementById('landInfoModal');
    if (liveWrap && liveWrap.style.display !== 'none') requestAnimationFrame(() => this.positionLandInfo(idx));
  },

  bindLandInfoClose() {
    const card = document.getElementById('landInfoCard');
    const close = card?.querySelector('.land-info-close');
    if (!close) return;
    close.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
    close.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); this.closeLandInfo(); });
  },

  /* ---------------- Dice V10: actual six-face 3D cubes ---------------- */
  diePips(v) {
    const layouts = {
      1: ['2/2'],
      2: ['1/1', '3/3'],
      3: ['1/1', '2/2', '3/3'],
      4: ['1/1', '1/3', '3/1', '3/3'],
      5: ['1/1', '1/3', '2/2', '3/1', '3/3'],
      6: ['1/1', '1/3', '2/1', '2/3', '3/1', '3/3']
    };
    return layouts[Math.max(1, Math.min(6, Number(v) || 1))]
      .map(g => `<span class="rr-dice-pip" style="grid-area:${g}"></span>`)
      .join('');
  },

  // Physical die layout. Opposite faces always sum to seven:
  // 1↔6, 2↔5, 3↔4.
  diePhysicalFaces() {
    return {
      front: 1,
      back: 6,
      right: 3,
      left: 4,
      top: 2,
      bottom: 5
    };
  },

  // V11: the rolled value is the TOP face, like Richup.
  // The physical die is unchanged (opposites still sum to 7); only the final
  // orientation changes so players read the result from above.
  dieTargetRotation(value) {
    const v = Math.max(1, Math.min(6, Number(value) || 1));
    const map = {
      // Physical layout: front=1, back=6, right=3, left=4, top=2, bottom=5.
      // Rotate the requested normal onto the local TOP direction.
      1: { x: 90,  y: 0, z: 0 },
      6: { x: -90, y: 0, z: 0 },
      3: { x: 0,   y: 0, z: -90 },
      4: { x: 0,   y: 0, z: 90 },
      2: { x: 0,   y: 0, z: 0 },
      5: { x: 180, y: 0, z: 0 }
    };
    return map[v];
  },

  dieRotationString(rot) {
    return `rotateX(${rot.x}deg) rotateY(${rot.y}deg) rotateZ(${rot.z}deg)`;
  },

  ensureRealDie(el, value = 1) {
    if (!el) return null;

    // Unique V10 classes intentionally avoid every old dice-face/cube rule.
    el.className = 'center-die rr-dice-viewport';

    let stage = el.querySelector('.rr-dice-stage');
    if (!stage) {
      const physical = this.diePhysicalFaces();
      el.innerHTML = `
        <span class="rr-dice-ground-shadow" aria-hidden="true"></span>
        <div class="rr-dice-stage">
          <div class="rr-dice-view">
            <div class="rr-dice-cube">
              ${Object.entries(physical).map(([side, faceValue]) => `
                <div class="rr-dice-face rr-dice-face-${side}" data-side="${faceValue}">
                  ${this.diePips(faceValue)}
                </div>`).join('')}
            </div>
          </div>
        </div>`;
      stage = el.querySelector('.rr-dice-stage');
    }

    const cube = el.querySelector('.rr-dice-cube');
    if (!cube) return null;

    const target = this.dieTargetRotation(value);
    cube.getAnimations().forEach(a => a.cancel());
    stage?.getAnimations().forEach(a => a.cancel());
    cube.style.transform = this.dieRotationString(target);
    el.dataset.value = String(value);
    el.dataset.face = String(value);
    return cube;
  },

  prepareDice() {
    const e1 = document.getElementById('die1');
    const e2 = document.getElementById('die2');
    this.ensureRealDie(e1, Number(e1?.dataset.value || 1));
    this.ensureRealDie(e2, Number(e2?.dataset.value || 1));
  },

  setDieFace(el, value) {
    this.ensureRealDie(el, value);
  },

  async rollSingleDie3D(el, value, delay = 0) {
    if (!el) return;
    const currentValue = Number(el.dataset.face || el.dataset.value || 1);
    const cube = this.ensureRealDie(el, currentValue);
    const stage = el.querySelector('.rr-dice-stage');
    if (!cube || !stage) return;
    if (delay) await sleep(delay);

    cube.getAnimations().forEach(a => a.cancel());
    stage.getAnimations().forEach(a => a.cancel());

    const from = this.dieTargetRotation(currentValue);
    const to = this.dieTargetRotation(value);
    const signX = Math.random() < .5 ? -1 : 1;
    const signY = Math.random() < .5 ? -1 : 1;
    const signZ = Math.random() < .5 ? -1 : 1;
    const turnsX = (4 + Math.floor(Math.random() * 3)) * 360 * signX;
    const turnsY = (5 + Math.floor(Math.random() * 3)) * 360 * signY;
    const turnsZ = (2 + Math.floor(Math.random() * 3)) * 360 * signZ;

    const end = {
      x: to.x + turnsX,
      y: to.y + turnsY,
      z: to.z + turnsZ
    };

    el.classList.add('rr-dice-is-rolling');

    const lift = stage.animate([
      { transform: 'translate3d(0,0,0) scale(1)', offset: 0 },
      { transform: 'translate3d(0,-18px,10px) scale(1.07)', offset: .34 },
      { transform: 'translate3d(0,-5px,4px) scale(1.02)', offset: .78 },
      { transform: 'translate3d(0,0,0) scale(1)', offset: 1 }
    ], {
      duration: 920,
      easing: 'cubic-bezier(.18,.72,.20,1)',
      fill: 'both'
    });

    const spin = cube.animate([
      { transform: this.dieRotationString(from), offset: 0 },
      { transform: `rotateX(${from.x + turnsX * .38}deg) rotateY(${from.y + turnsY * .38}deg) rotateZ(${from.z + turnsZ * .30}deg)`, offset: .31 },
      { transform: `rotateX(${from.x + turnsX * .79}deg) rotateY(${from.y + turnsY * .79}deg) rotateZ(${from.z + turnsZ * .74}deg)`, offset: .76 },
      { transform: this.dieRotationString(end), offset: 1 }
    ], {
      duration: 920,
      easing: 'cubic-bezier(.12,.64,.18,1)',
      fill: 'both'
    });

    try { await Promise.all([spin.finished, lift.finished]); } catch (_) {}

    spin.cancel();
    lift.cancel();
    cube.style.transform = this.dieRotationString(to);
    stage.style.transform = 'translate3d(0,0,0) scale(1)';
    el.dataset.value = String(value);
    el.dataset.face = String(value);
    el.classList.remove('rr-dice-is-rolling');
  },

  async rollDice(d1, d2) {
    this.playSound('dice');
    const e1 = document.getElementById('die1');
    const e2 = document.getElementById('die2');
    if (!e1 || !e2) return sleep(300);

    this.prepareDice();
    await Promise.all([
      this.rollSingleDie3D(e1, d1, 0),
      this.rollSingleDie3D(e2, d2, 55)
    ]);
    await sleep(80);
  },

  async showDeathValleyLoss(player, info) {
    this.playSound('death_valley');
    const detail = info.buildings > 0
      ? `Built land rule: fixed loss $${info.rent}`
      : `$${info.baseRent} × ${info.multiplier} = $${info.rent}`;
    await this.showCard(`💀 DEATH VALLEY<br><b>-${info.rent}$</b><br><small>${info.land} • ${detail}</small>`, 'deathvalley loss');
  },

  ensureEndScreen() {
    let el = document.getElementById('gameEndScreen');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'gameEndScreen';
    el.className = 'game-end-screen';
    document.body.appendChild(el);
    return el;
  },

  showEndScreen(winner, human) {
    const el = this.ensureEndScreen();
    const won = !!(winner && human && winner.id === human.id);
    const title = won ? 'YOU WIN!' : 'GAME OVER';
    const icon = won ? '🏆' : '💀';
    const sub = won
      ? `${winner.name} owns the board.`
      : winner ? `${winner.name} won the game.` : 'You went bankrupt.';
    el.innerHTML = `
      <div class="game-end-card ${won ? 'win' : 'lose'}">
        <div class="game-end-icon">${icon}</div>
        <h1>${title}</h1>
        <p>${sub}</p>
        <button onclick="quitGame()">Back to lobby</button>
      </div>`;
    el.classList.add('show');
  },

  hideEndScreen() {
    document.getElementById('gameEndScreen')?.classList.remove('show');
  },

  /* ---------------- بطاقة وسط الشاشة ---------------- */
  showCard(text, kind) {
    return new Promise(resolve => {
      const box = document.getElementById('gameCard');
      if (!box) return resolve();
      box.className = 'g-card show ' + kind;
      box.innerHTML = `<span class="g-card-close" onclick="GameUI.hideCard()">×</span>${text}`;
      clearTimeout(this._cardT);
      this._cardT = setTimeout(() => { this.hideCard(); resolve(); }, 2200);
    });
  },

  hideCard() {
    const box = document.getElementById('gameCard');
    if (box) box.classList.remove('show');
  }
};
