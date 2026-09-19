/* ============================================================================
   Net — online play over WebRTC data channels (host-authoritative, no DB).
   Signalling uses the free PeerJS cloud broker ONLY to introduce peers;
   all gameplay data travels peer-to-peer afterwards.

   Topology:
   - The host runs the authoritative engine (Game/engine.js).
   - Guests render synced state snapshots and send player actions back to host.
   - 3D dice rolls are animated simultaneously on all screens.
   ============================================================================ */
(function () {
  'use strict';

  const PEER_PREFIX = 'ma7fofa-v25-';
  const ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // Actions a guest may ask the host to execute on their turn.
  const ACTIONS = [
    'roll', 'endTurn', 'buy', 'jailPay', 'jailPardon', 'declareBankrupt',
    'placeAuctionBid', 'passAuction', 'build', 'sellHouse', 'sellLand', 'toggleMortgage'
  ];

  const Net = {
    role: 'offline',          // 'offline' | 'host' | 'guest'
    peer: null,
    conns: new Map(),         // host: conn.peerId -> { conn, playerIndex }
    conn: null,               // guest: connection to host
    myId: null,               // my player id (0 for host; assigned index for guest)
    roomCode: null,
    _syncTimer: 0,

    online() { return this.role !== 'offline'; },
    isHost() { return this.role === 'host'; },
    isGuest() { return this.role === 'guest'; },

    /* ------------------------------- HOST -------------------------------- */
    host(code) {
      if (this.online()) this.leave();
      this.roomCode = String(code).trim().toLowerCase();
      this.role = 'host';
      this.myId = 0;

      try {
        const peer = new Peer(PEER_PREFIX + this.roomCode, { config: ICE });
        this.peer = peer;

        peer.on('open', (id) => {
          console.log('[net] Host peer opened:', id);
          window.dispatchEvent(new CustomEvent('net-host-open', { detail: { code: this.roomCode } }));
        });

        peer.on('error', (err) => {
          console.warn('[net] host error:', err && err.type, err);
          if (err && err.type === 'unavailable-id') {
            window.dispatchEvent(new CustomEvent('net-error', { detail: 'Room code already in use — generating another.' }));
          }
        });

        peer.on('disconnected', () => {
          try { peer.reconnect(); } catch (_) {}
        });

        peer.on('connection', (conn) => {
          conn.on('open', () => {
            this.conns.set(conn.peer, { conn, playerIndex: -1 });
          });

          conn.on('data', (d) => this._hostData(conn, d));

          conn.on('close', () => this._hostPeerLeft(conn));
          conn.on('error', (e) => {
            console.warn('[net] conn error', e);
            this._hostPeerLeft(conn);
          });
        });
      } catch (e) {
        console.error('[net] Failed to create host peer:', e);
      }
    },

    _hostData(conn, d) {
      if (!d || typeof d !== 'object') return;
      let entry = this.conns.get(conn.peer) || { conn, playerIndex: -1 };

      switch (d.t) {
        case 'hello': {
          const name = String(d.name || 'Guest').slice(0, 18);
          // If already in game, can guest rejoin? Or if in lobby:
          if (typeof lobbyPlayers !== 'undefined') {
            const color = window.freeColor ? freeColor() : '#4fc3f7';
            lobbyPlayers.push({ name, color, isBot: false, net: true });
            entry.playerIndex = lobbyPlayers.length - 1;
            this.conns.set(conn.peer, entry);

            if (window.lobbyChatSystem) lobbyChatSystem(name + ' joined the room');
            if (window.renderLobbyPlayers) renderLobbyPlayers();

            // Send full roster to all guests
            this.broadcast({ t: 'lobby', players: this._roster() });
            conn.send({ t: 'lobby', players: this._roster(), youIndex: entry.playerIndex });
          }
          break;
        }

        case 'chat': {
          const p = (typeof lobbyPlayers !== 'undefined') ? lobbyPlayers[entry.playerIndex] : null;
          const who = p ? p.name : (Game.state?.players[entry.playerIndex]?.name || 'Guest');
          if (window.lobbyChatSystem) lobbyChatSystem(`${who}: ${d.text}`);
          this._others(conn).forEach(c => c.send({ t: 'chat', who, text: d.text }));
          break;
        }

        case 'cmd': {
          const res = (typeof Game !== 'undefined' && Game.executeCommand)
            ? Game.executeCommand(d.text)
            : { ok: false, message: 'Commands are available after the game starts.' };
          conn.send({ t: 'cmdres', ok: res.ok, message: res.message });
          if (window.lobbyChatSystem) lobbyChatSystem((res.ok ? '✓ ' : '✕ ') + res.message);
          this._others(conn).forEach(c => c.send({ t: 'chat', who: '⚙', text: (res.ok ? '✓ ' : '✕ ') + res.message }));
          break;
        }

        case 'action': {
          if (!this.isHost() || !Game.state) return;
          if (!ACTIONS.includes(d.fn)) return;
          try {
            Game[d.fn](...(d.args || []));
          } catch (e) {
            console.warn('[net] host action execution failed:', d.fn, e);
          }
          break;
        }

        case 'trade': {
          if (!Game.state || entry.playerIndex < 0) return;
          window.Trades?.propose?.(entry.playerIndex, d.with, d.give, d.take, d.note);
          break;
        }

        case 'tradeAnswer': {
          window.Trades?.answerFor?.(entry.playerIndex, d.tradeId, d.accept);
          break;
        }
      }
    },

    _others(conn) {
      const out = [];
      this.conns.forEach(e => {
        if (e.conn !== conn && e.conn.open) out.push(e.conn);
      });
      return out;
    },

    _roster() {
      if (typeof lobbyPlayers === 'undefined') return [];
      return lobbyPlayers.map(p => ({
        name: p.name,
        color: p.color,
        isBot: !!p.isBot,
        host: !!p.host
      }));
    },

    _hostPeerLeft(conn) {
      const entry = this.conns.get(conn.peer);
      this.conns.delete(conn.peer);
      if (!entry || entry.playerIndex < 0) return;

      if (typeof lobbyPlayers !== 'undefined') {
        const p = lobbyPlayers[entry.playerIndex];
        if (Game.state && Game.state.phase !== 'over') {
          const gp = Game.state.players[entry.playerIndex];
          if (gp && !gp.bankrupt) {
            gp.isBot = true;
            Game.log(`${gp.name} lost connection — bot takes over`, gp.id, 'info');
            if (typeof GameUI !== 'undefined') GameUI.renderAll();
          }
        } else {
          const i = lobbyPlayers.indexOf(p);
          if (i >= 0) lobbyPlayers.splice(i, 1);
          if (window.lobbyChatSystem && p) lobbyChatSystem(p.name + ' left the room');
          if (typeof renderLobbyPlayers !== 'undefined') renderLobbyPlayers();
          this.broadcast({ t: 'lobby', players: this._roster() });
        }
      }
    },

    broadcast(obj) {
      if (!this.isHost()) return;
      this.conns.forEach(e => {
        if (e.conn && e.conn.open) {
          try { e.conn.send(obj); } catch (_) {}
        }
      });
    },

    /** Debounced full-state snapshot sync after any host-side render. */
    hostSync() {
      if (!this.isHost() || !Game.state) return;
      clearTimeout(this._syncTimer);
      this._syncTimer = setTimeout(() => {
        this.broadcast({
          t: 'state',
          state: Game.state,
          trades: window.Trades ? Trades.list : []
        });
      }, 40);
    },

    hostStart() {
      if (!this.isHost() || !Game.state) return;
      // Identify host's actual id in Game.state.players
      const hostP = Game.state.players.find(p => p.host);
      this.myId = hostP ? hostP.id : 0;

      this.conns.forEach(e => {
        if (e.conn && e.conn.open && e.playerIndex >= 0) {
          const lp = lobbyPlayers[e.playerIndex];
          const sp = lp ? Game.state.players.find(p => p.name === lp.name && p.color === lp.color) : null;
          const assignedId = sp ? sp.id : e.playerIndex;
          try {
            e.conn.send({
              t: 'start',
              state: Game.state,
              myId: assignedId
            });
          } catch (_) {}
        }
      });
    },

    /* ------------------------------- GUEST ------------------------------- */
    join(code, name) {
      if (this.online()) this.leave();
      this.roomCode = String(code).trim().toLowerCase();
      this.role = 'guest';

      try {
        const peer = new Peer({ config: ICE });
        this.peer = peer;

        peer.on('open', (id) => {
          console.log('[net] Guest peer opened:', id);
          const conn = peer.connect(PEER_PREFIX + this.roomCode, { reliable: true });
          this.conn = conn;

          conn.on('open', () => {
            console.log('[net] Connected to host!');
            conn.send({ t: 'hello', name });
            window.dispatchEvent(new CustomEvent('net-guest-open', { detail: { code: this.roomCode } }));
          });

          conn.on('data', (d) => this._guestData(d));

          conn.on('close', () => {
            if (window.showToast) showToast('Disconnected from host.');
            window.dispatchEvent(new CustomEvent('net-closed'));
          });

          conn.on('error', (err) => {
            console.warn('[net] guest conn error:', err);
            window.dispatchEvent(new CustomEvent('net-error', { detail: 'Connection error.' }));
          });
        });

        peer.on('error', (err) => {
          console.warn('[net] peer error:', err && err.type, err);
          if (err && err.type === 'peer-unavailable') {
            window.dispatchEvent(new CustomEvent('net-error', { detail: 'Room not found. Make sure host is in the lobby.' }));
          }
        });
      } catch (e) {
        console.error('[net] Failed to join room:', e);
      }
    },

    send(obj) {
      if (this.isGuest() && this.conn && this.conn.open) {
        try { this.conn.send(obj); } catch (_) {}
      }
    },

    _guestData(d) {
      if (!d || typeof d !== 'object') return;
      switch (d.t) {
        case 'lobby': {
          if (typeof lobbyPlayers !== 'undefined') {
            lobbyPlayers = d.players.map(p => ({ ...p }));
            if (d.youIndex != null) this.myId = d.youIndex;
            if (typeof renderLobbyPlayers !== 'undefined') renderLobbyPlayers();
          }
          break;
        }

        case 'chat': {
          if (window.lobbyChatSystem) lobbyChatSystem(d.who === '⚙' ? d.text : `${d.who}: ${d.text}`);
          break;
        }

        case 'cmdres': {
          if (window.lobbyChatSystem) lobbyChatSystem((d.ok ? '✓ ' : '✕ ') + d.message);
          break;
        }

        case 'start': {
          this.myId = d.myId;
          Game.state = d.state;
          Game.busy = false;
          const lobby = document.getElementById('lobbyScreen');
          if (lobby) lobby.classList.add('playing');
          if (typeof GameUI !== 'undefined') {
            GameUI.hideEndScreen?.();
            GameUI.closeLandInfo?.();
            GameUI.renderAll();
          }
          if (window.showToast) showToast('The game has started!');
          break;
        }

        case 'state': {
          Game.state = d.state;
          Game.busy = false;
          if (window.Trades) { Trades.list = d.trades || []; }
          if (typeof GameUI !== 'undefined') {
            GameUI.renderAll();
            if (d.state.phase === 'over') {
              const winner = Game.alive ? Game.alive()[0] : null;
              const me = GameUI.localMe(d.state);
              if (winner) GameUI.showEndScreen?.(winner, me);
            }
          }
          if (window.Trades) Trades.renderList();
          break;
        }

        case 'dice': {
          if (typeof GameUI !== 'undefined') {
            GameUI.rollDice(d.d[0], d.d[1]);
          }
          break;
        }

        case 'trades': {
          if (window.Trades) {
            Trades.list = d.list || [];
            Trades.renderList();
          }
          break;
        }

        case 'toast': {
          if (window.showToast) showToast(d.msg);
          break;
        }
      }
    },

    leave() {
      try { this.conn?.close(); } catch (_) {}
      try { this.peer?.destroy(); } catch (_) {}
      this.role = 'offline';
      this.myId = null;
      this.conns.clear();
      this.conn = null;
      this.peer = null;
      this.roomCode = null;
    },

    /* ------------------------- GUEST PROXY HOOK ------------------------- */
    initProxy() {
      if (typeof Game === 'undefined') return;
      ACTIONS.forEach(fn => {
        const orig = Game[fn];
        Game[fn] = function (...args) {
          if (Net.isGuest()) {
            if (fn === 'roll') {
              Game.busy = true;
              if (typeof GameUI !== 'undefined') GameUI.setActions([]);
            }
            Net.send({ t: 'action', fn, args });
            return;
          }
          return orig ? orig.apply(this, args) : undefined;
        };
      });
    }
  };

  // Automatically wrap Game methods when loaded
  if (typeof Game !== 'undefined') {
    Net.initProxy();
  } else {
    window.addEventListener('DOMContentLoaded', () => Net.initProxy());
  }

  window.Net = Net;
})();
