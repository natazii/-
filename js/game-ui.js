/* =========================================================================
   game-ui.js — طبقة العرض ديال اللعبة
   مسؤولة على: القطع، النرد، الأزرار، لوحة اللاعبين، السجل، البطاقات.
   ========================================================================= */

const GameUI = {
  tileEls: {},   // tileIndex -> DOM element

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
      tok.className = 'g-token' + (s.turn === p.id ? ' active' : '');
      tok.style.background = p.color;
      tok.title = p.name;
      box.appendChild(tok);
    });
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

      let hb = el.querySelector('.rt-houses');
      const h = s.houses[idx] || 0;
      if (h > 0) {
        if (!hb) {
          hb = document.createElement('div');
          hb.className = 'rt-houses';
          el.appendChild(hb);
        }
        hb.textContent = h === 5 ? '🏨' : '🏠'.repeat(h);
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
        <span class="g-avatar" style="background:${p.color}">${p.name.charAt(0).toUpperCase()}</span>
        <span class="g-pname">${p.name}${p.isBot ? ' <i class="g-bot">BOT</i>' : ''}${p.jail > 0 ? ' 🔒' : ''}</span>
        <span class="g-cash" id="cash-${p.id}">$${p.cash}</span>
      </div>
    `).join('');
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
    if (s.phase === 'jail' && human) {
      acts.push({ t: '🎲 Roll the dice', fn: 'Game.roll()' });
      if (p.cash >= s.settings.jailFee) acts.push({ t: `💰 get free for $${s.settings.jailFee}`, fn: 'Game.jailPay()' });
      if (p.pardon > 0) acts.push({ t: '🕊 Use Pardon card', fn: 'Game.jailPardon()', cls: 'pink' });
    } else if (s.phase === 'roll' && human) {
      acts.push({ t: '🎲 Roll the dice', fn: 'Game.roll()' });
    } else if (s.phase === 'action' && human) {
      if (s.pendingBuy !== undefined) {
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

  /* ---------------- قائمة الممتلكات ---------------- */
  renderProperties() {
    const s = Game.state;
    const box = document.getElementById('gameProps');
    const head = document.getElementById('gamePropsCount');
    if (!box || !s) return;
    const me = Game.me;
    const ids = Object.keys(s.owners).map(Number).filter(i => s.owners[i] === me.id);
    if (head) head.textContent = ids.length + (me.pardon ? ' + 🕊' : '');

    const rows = ids.map(i => {
      const t = BOARD[i];
      const h = s.houses[i] || 0;
      const badge = h === 5 ? '🏨' : (h ? '🏠'.repeat(h) : '');
      const mort = s.mortgaged[i] ? ' <i class="g-mort">مرهون</i>' : '';
      const canBuild = Game.canBuild(i);
      return `<div class="g-prop">
        <span class="g-propdot" style="background:${t.color || '#5f7d95'}"></span>
        <span class="g-propname">${t.name}${mort}</span>
        <span class="g-prophouses">${badge}</span>
        <span class="g-propbtns">
          ${canBuild ? `<button onclick="Game.build(${i})" title="بناء بيت (-$${t.houseCost})">＋</button>` : ''}
          ${h > 0 ? `<button onclick="Game.sellHouse(${i})" title="بيع بيت">－</button>` : ''}
          <button onclick="Game.toggleMortgage(${i})" title="${s.mortgaged[i] ? 'فك الرهن' : 'رهن'}">${s.mortgaged[i] ? '🔓' : '🏦'}</button>
        </span>
      </div>`;
    });
    if (me.pardon > 0) {
      rows.push(`<div class="g-prop"><span class="g-propdot" style="background:#e0a3ff"></span>
        <span class="g-propname">Pardon card × ${me.pardon}</span></div>`);
    }
    box.innerHTML = rows.join('') || '<div class="g-empty">ما عندك حتى عقار</div>';
  },

  /* ---------------- النرد ---------------- */
  async rollDice(d1, d2) {
    const e1 = document.getElementById('die1');
    const e2 = document.getElementById('die2');
    if (!e1 || !e2) return sleep(300);
    e1.classList.add('rolling');
    e2.classList.add('rolling');
    for (let i = 0; i < 8; i++) {
      this.setDieFace(e1, 1 + Math.floor(Math.random() * 6));
      this.setDieFace(e2, 1 + Math.floor(Math.random() * 6));
      await sleep(70);
    }
    this.setDieFace(e1, d1);
    this.setDieFace(e2, d2);
    e1.classList.remove('rolling');
    e2.classList.remove('rolling');
    await sleep(220);
  },

  /** ترتيب النقط داخل شبكة 3×3 حسب قيمة النرد */
  setDieFace(el, v) {
    const layouts = {
      1: ['2/2'],
      2: ['1/1', '3/3'],
      3: ['1/1', '2/2', '3/3'],
      4: ['1/1', '1/3', '3/1', '3/3'],
      5: ['1/1', '1/3', '2/2', '3/1', '3/3'],
      6: ['1/1', '1/3', '2/1', '2/3', '3/1', '3/3']
    };
    el.innerHTML = layouts[v].map(g => `<span class="pip" style="grid-area:${g}"></span>`).join('');
    el.dataset.value = v;
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
