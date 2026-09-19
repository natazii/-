/* ============================================================================
   Trades — barter / trade section (v25).
   Sidebar "Trades" bar + Create flow:
     1) pick a player  ->  2) set money amounts with two sliders  ->  send.
   Bots answer offers automatically; results land in the game log and in the
   trades list under the Trades bar.
   ============================================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const ICONS = {
    swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h11m0 0-3.2-3.2M18 8l-3.2 3.2M17 16H6m0 0 3.2-3.2M6 16l3.2 3.2" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.6 21 12 3.4 3.4l2.4 7.2 9 1.4-9 1.4z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a1.6 1.6 0 0 1 1.6 1.6v9.2A1.6 1.6 0 0 1 20 16.4h-9.4L5 20.6v-4.2H4A1.6 1.6 0 0 1 2.4 14.8V5.6A1.6 1.6 0 0 1 4 4Z" fill="none" stroke="#b6aed6" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 7.4v5M9.5 9.9h5" stroke="#b6aed6" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  const Trades = {
    list: [],
    seq: 1,
    withId: null,
    noteOpen: false,

    me() {
      const s = Game.state;
      if (!s) return null;
      if (window.Net && Net.online() && Net.myId != null && s.players[Net.myId]) return s.players[Net.myId];
      return s.players.find(p => !p.isBot && !p.bankrupt) || s.players.find(p => !p.isBot) || null;
    },

    active() { return !!Game.state && Game.state.phase !== 'over'; },

    avatar(p, cls) {
      return `<span class="g-avatar player-face ${cls || ''}" style="--player-color:${p.color}" aria-hidden="true"></span>`;
    },

    /* ------------------------------ open/close ----------------------------- */
    openCreate() {
      const me = this.me();
      if (!me || !this.active()) { if (window.showToast) showToast('Trades are available during a game.'); return; }
      const others = Game.state.players.filter(p => p.id !== me.id && !p.bankrupt);
      if (!others.length) return;
      this.withId = null;
      this.noteOpen = false;
      document.querySelector('.trade-shell').style.width = 'min(430px, 94vw)';
      $('tradeModal').innerHTML = `
        <h3 class="trade-title">Create a trade</h3>
        <p class="trade-sub">Select a player to trade with:</p>
        <div class="trade-picks">
          ${others.map(p => `
            <button type="button" class="trade-pick" onclick="Trades.openWith(${p.id})">
              ${this.avatar(p)}<span>${escapeHTML(p.name)}</span>
            </button>`).join('')}
        </div>`;
      $('tradeOverlay').hidden = false;
    },

    openWith(id) {
      const me = this.me();
      const other = Game.player(id);
      if (!me || !other) return;
      this.withId = id;
      this.noteOpen = false;
      document.querySelector('.trade-shell').style.width = 'min(560px, 94vw)';
      $('tradeModal').innerHTML = `
        <h3 class="trade-title">Create a trade</h3>
        <div class="trade-cols">
          <div class="trade-col">
            <div class="trade-who">${this.avatar(me, 'sm')}<span>${escapeHTML(me.name)}</span></div>
            <input class="trade-range" type="range" id="tradeGiveRange" min="0" max="${me.cash}" step="10" value="0" oninput="Trades.syncPills()">
            <div class="trade-ends"><span>0</span><span>${me.cash}</span></div>
            <div class="trade-pill" id="tradeGivePill">0 $</div>
          </div>
          <div class="trade-mid">
            <button type="button" class="trade-swap" onclick="Trades.swap()" title="Swap amounts" aria-label="Swap amounts">${ICONS.swap}</button>
            <span class="trade-divider" aria-hidden="true"></span>
          </div>
          <div class="trade-col">
            <div class="trade-who">${this.avatar(other, 'sm')}<span>${escapeHTML(other.name)}</span></div>
            <input class="trade-range" type="range" id="tradeTakeRange" min="0" max="${other.cash}" step="10" value="0" oninput="Trades.syncPills()">
            <div class="trade-ends"><span>0</span><span>${other.cash}</span></div>
            <div class="trade-pill" id="tradeTakePill">0 $</div>
          </div>
        </div>
        <div class="trade-note-row" id="tradeNoteRow" hidden>
          <input id="tradeNoteInput" maxlength="90" placeholder="Add a message to the offer…">
        </div>
        <div class="trade-foot">
          <button type="button" class="trade-note-btn" onclick="Trades.toggleNote()" title="Add a message" aria-label="Add a message">${ICONS.note}</button>
          <button type="button" class="trade-send" onclick="Trades.send()">${ICONS.send}<span>Send trade</span></button>
        </div>`;
      this.syncPills();
      $('tradeOverlay').hidden = false;
    },

    close() { $('tradeOverlay').hidden = true; },

    toggleNote() {
      this.noteOpen = !this.noteOpen;
      const row = $('tradeNoteRow');
      if (row) { row.hidden = !this.noteOpen; if (this.noteOpen) $('tradeNoteInput')?.focus(); }
    },

    syncPills() {
      const g = $('tradeGiveRange'), t = $('tradeTakeRange');
      if (g) $('tradeGivePill').textContent = `${g.value} $`;
      if (t) $('tradeTakePill').textContent = `${t.value} $`;
    },

    swap() {
      const g = $('tradeGiveRange'), t = $('tradeTakeRange');
      if (!g || !t) return;
      const gv = Math.min(Number(t.value), Number(g.max));
      const tv = Math.min(Number(g.value), Number(t.max));
      g.value = gv; t.value = tv;
      this.syncPills();
    },

    /* --------------------------------- send -------------------------------- */
    send() {
      const me = this.me();
      const other = Game.player(this.withId);
      const give = Number($('tradeGiveRange')?.value || 0);   // me -> other
      const take = Number($('tradeTakeRange')?.value || 0);   // other -> me
      if (!me || !other) return this.close();
      if (give <= 0 && take <= 0) { if (window.showToast) showToast('Set an amount on at least one side.'); return; }
      const note = (this.noteOpen && $('tradeNoteInput')?.value || '').trim();

      if (Net.isGuest?.()) {
        Net.send({ t: 'trade', with: other.id, give, take, note });
        this.close();
        return;
      }
      this.propose(me.id, other.id, give, take, note);
      this.close();
    },

    /** Core proposal execution (host / offline only). */
    propose(fromId, withId, give, take, note) {
      const me = Game.player(fromId), other = Game.player(withId);
      if (!me || !other) return;
      const trade = { id: this.seq++, from: fromId, with: withId, give, take, note, status: 'pending' };
      this.list.unshift(trade);
      this.renderList();
      Game.log(`proposed a trade to ${other.name}: $${give} for $${take}${note ? ` — “${note}”` : ''}`, fromId, 'trade');
      setTimeout(() => this.resolve(trade), other.isBot ? 1100 + Math.random() * 900 : 0);
      if (!other.isBot) this.renderList();
    },

    /** Bot decision: accepts when it does not lose money on the deal. */
    botAccepts(trade) {
      const other = Game.player(trade.with);
      const gain = trade.give - trade.take;                 // bot's net gain
      if (trade.take > other.cash) return false;            // cannot pay
      if (trade.take > other.cash * 0.6) return false;      // won't drain itself
      if (gain > 0) return true;
      if (gain === 0) return (trade.give > 0 && Math.random() < 0.6) || Math.random() < 0.3;
      return gain >= -100 && Math.random() < 0.25;          // small favours, sometimes
    },

    resolve(trade) {
      const s = Game.state;
      if (!s || s.phase === 'over') { trade.status = 'cancelled'; this.renderList(); return; }
      const me = Game.player(trade.from);
      const other = Game.player(trade.with);
      if (!me || !other || me.bankrupt || other.bankrupt) { trade.status = 'cancelled'; this.renderList(); return; }

      let accept;
      if (other.isBot) accept = this.botAccepts(trade);
      else { this.renderList(); return; } // humans answer from the trades list

      if (accept) {
        const give = Math.min(trade.give, me.cash);
        const take = Math.min(trade.take, other.cash);
        if (give > 0) { Game.pay(me, -give); Game.pay(other, give); }
        if (take > 0) { Game.pay(other, -take); Game.pay(me, take); }
        trade.status = 'accepted';
        Game.log(`accepted the trade ($${give} ⇄ $${take})`, other.id, 'trade');
      } else {
        trade.status = 'declined';
        Game.log(`declined the trade offer`, other.id, 'trade');
      }
      GameUI.renderPlayers();
      GameUI.renderProperties();
      this.renderList();
    },

    answer(tradeId, accept) {
      const trade = this.list.find(t => t.id === tradeId);
      if (!trade || trade.status !== 'pending') return;
      const me = this.me();
      if (!me || trade.with !== me.id) return;
      if (Net.isGuest?.()) { Net.send({ t: 'tradeAnswer', tradeId, accept }); return; }
      this.answerCore(trade, accept);
    },

    /** Host-side entry when a guest answers. */
    answerFor(playerIndex, tradeId, accept) {
      const trade = this.list.find(t => t.id === tradeId);
      if (!trade || trade.status !== 'pending' || trade.with !== playerIndex) return;
      this.answerCore(trade, accept);
    },

    answerCore(trade, accept) {
      const s = Game.state;
      const me = Game.player(trade.with);
      if (!s || !me) return;
      if (accept) {
        const from = Game.player(trade.from);
        const give = Math.min(trade.give, from.cash);
        const take = Math.min(trade.take, me.cash);
        if (give > 0) { Game.pay(from, -give); Game.pay(me, give); }
        if (take > 0) { Game.pay(me, -take); Game.pay(from, take); }
        trade.status = 'accepted';
        Game.log(`accepted the trade ($${give} ⇄ $${take})`, me.id, 'trade');
      } else {
        trade.status = 'declined';
        Game.log(`declined the trade offer`, me.id, 'trade');
      }
      this.renderList();
    },

    /* ------------------------------ sidebar list ---------------------------- */
    renderList() {
      if (Net.isHost?.()) Net.broadcast({ t: 'trades', list: this.list });
      const box = $('gameTrades');
      const btn = $('tradeCreateBtn');
      if (btn) btn.disabled = !this.active();
      if (!box) return;
      if (!Game.state || !this.list.length) { box.innerHTML = ''; return; }
      const me = this.me();
      box.innerHTML = this.list.slice(0, 6).map(t => {
        const from = Game.player(t.from), withP = Game.player(t.with);
        if (!from || !withP) return '';
        const iAmFrom = !!me && t.from === me.id;
        const iAmWith = !!me && t.with === me.id;
        const other = iAmWith ? from : withP;
        const give = iAmFrom ? t.give : t.take;   // what I give
        const get = iAmFrom ? t.take : t.give;    // what I get
        const actions = (t.status === 'pending' && iAmWith)
          ? `<span class="trade-acts">
               <button type="button" class="trade-accept" onclick="Trades.answer(${t.id}, true)">Accept</button>
               <button type="button" class="trade-decline" onclick="Trades.answer(${t.id}, false)">Decline</button>
             </span>`
          : `<span class="trade-status ${t.status}">${t.status}</span>`;
        return `<div class="trade-row">
          ${this.avatar(other, 'xs')}
          <span class="trade-row-info">
            <b>${escapeHTML(other.name)}</b>
            <small>give $${give} · get $${get}</small>
          </span>
          ${actions}
        </div>`;
      }).join('');
    },

    clear() {
      this.list = [];
      this.withId = null;
      this.renderList();
      const ov = $('tradeOverlay');
      if (ov) ov.hidden = true;
    }
  };

  window.Trades = Trades;

  // Close on backdrop click / Escape
  document.addEventListener('pointerdown', e => {
    const ov = $('tradeOverlay');
    if (ov && !ov.hidden && e.target === ov) Trades.close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const ov = $('tradeOverlay'); if (ov && !ov.hidden) Trades.close(); }
  });
})();
