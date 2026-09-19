// System State
    let isMuted = false;
    let currentUser = "زائر";
    const BG_VOLUME = 0.03;

    function getBgMusic() {
      return document.getElementById('bgMusic');
    }

    function isMusicPlaying() {
      const audio = getBgMusic();
      return !!(audio && !audio.paused && !audio.ended);
    }

    function tryPlayMusic() {
      const audio = getBgMusic();
      if (!audio || isMuted) return;
      audio.volume = BG_VOLUME;
      audio.muted = false;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }
    }

    function startBackgroundMusic() {
      tryPlayMusic();

      const unlock = function (e) {
        if (isMuted) return;
        if (e && e.target && e.target.closest && e.target.closest('#muteButton, #lobbySoundButton')) {
          return;
        }
        tryPlayMusic();
        if (isMusicPlaying()) {
          document.removeEventListener('pointerdown', unlock, true);
          document.removeEventListener('keydown', unlock, true);
          document.removeEventListener('touchstart', unlock, true);
        }
      };

      document.addEventListener('pointerdown', unlock, true);
      document.addEventListener('keydown', unlock, true);
      document.addEventListener('touchstart', unlock, true);
      window.addEventListener('focus', tryPlayMusic);
    }

    // Toast Notification System
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, 3000);
    }

    function updateMuteButton() {
      const button = document.getElementById('muteButton');
      if (button) {
        button.classList.toggle('muted', isMuted);
        button.setAttribute('aria-pressed', String(isMuted));
        button.setAttribute('aria-label', isMuted ? 'Unmute sound' : 'Mute sound');
      }
      RoomSidebar.setMuted(isMuted);
    }

    // Toggle the preference even when the optional background MP3 is missing.
    function toggleMute() {
      isMuted = !isMuted;
      const audio = getBgMusic();
      if (audio) audio.muted = isMuted;
      if (isMuted) {
        audio?.pause();
        GameUI.stopSounds?.();
      } else {
        tryPlayMusic();
      }
      updateMuteButton();
      showToast(isMuted ? 'Sound muted' : 'Sound unmuted');
    }

    // Account Menu Toggle
    function toggleAccountMenu() {
      document.getElementById('accountMenu').classList.toggle('open');
    }
    function closeAccountMenu() {
      document.getElementById('accountMenu').classList.remove('open');
    }
    window.addEventListener('click', function(e) {
      if (!e.target.closest('.account-zone')) {
        closeAccountMenu();
      }
    });

    // Auth Modal Handlers
    function openAuth(mode) {
      switchAuthTab(mode);
      document.getElementById('authModal').classList.add('show');
    }
    function closeAuth() {
      document.getElementById('authModal').classList.remove('show');
    }
    function switchAuthTab(mode) {
      const title = document.getElementById('authTitle');
      const submitBtn = document.getElementById('authSubmitBtn');
      const tabLogin = document.getElementById('tabLogin');
      const tabSignup = document.getElementById('tabSignup');

      if (mode === 'signup') {
        title.innerText = 'حساب جديد';
        submitBtn.innerText = 'إنشاء الحساب';
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
      } else {
        title.innerText = 'تسجيل الدخول';
        submitBtn.innerText = 'تسجيل الدخول';
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
      }
    }
    function handleAuthSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('authEmail').value;
      currentUser = email.split('@')[0];

      applyNickname(currentUser);

      closeAuth();
      showToast('أهلاً بك، ' + currentUser + '!');
    }
    function socialAuth(provider) {
      currentUser = provider + "_User";
      applyNickname(currentUser);
      closeAuth();
      showToast('تم الدخول عن طريق ' + provider);
    }

    // Guest nickname
    function getNickname() {
      const input = document.getElementById('nicknameInput');
      return (input ? input.value : '').trim();
    }
    function syncPlayButton() {
      const playBtn = document.getElementById('playButton');
      if (playBtn) playBtn.disabled = getNickname().length === 0;
    }
    function applyNickname(name) {
      currentUser = name;
      if (lobbyPlayers.length) lobbyPlayers[0].name = currentUser;
      const navAvatar = document.getElementById('navAvatar');
      if (navAvatar) navAvatar.innerText = currentUser.charAt(0).toUpperCase();
      renderLobbyPlayers();
    }

    // Lobby System (WebRTC online peer-to-peer / no DB)
    function playAsGuest(e) {
      if (e) e.preventDefault();
      const name = getNickname();
      if (!name) {
        showToast('اكتب اسمك أولاً عشان تلعب');
        const input = document.getElementById('nicknameInput');
        if (input) input.focus();
        return;
      }
      applyNickname(name);

      const randomCode = Math.random().toString(36).substring(2, 7);
      document.getElementById('roomCodeLabel').innerText = "غرفة أونلاين: " + randomCode;
      const roomOrigin = (window.location.protocol === 'file:') ? 'https://zeta-six-50.vercel.app' : window.location.origin;
      const roomLink = document.getElementById('roomUrlInput');
      roomLink.value = roomOrigin + "/room/" + randomCode;
      roomLink.title = roomLink.value;
      RoomSidebar.copied(false);

      document.getElementById('homePage').style.display = 'none';
      document.getElementById('lobbyScreen').classList.add('show');
      buildBoard();
      initLobbyPlayers();

      if (window.Net) Net.host(randomCode);
    }

    function joinRoomSubmit(e) {
      if (e) e.preventDefault();
      const codeInput = document.getElementById('joinCodeInput');
      const code = (codeInput?.value || '').trim();
      if (!code) {
        showToast('اكتب رمز الغرفة أولاً');
        if (codeInput) codeInput.focus();
        return;
      }
      const name = getNickname();
      if (!name) {
        showToast('اكتب اسمك أولاً للانضمام');
        const input = document.getElementById('nicknameInput');
        if (input) input.focus();
        return;
      }
      joinRoom(code, name);
    }

    function joinRoom(code, name) {
      code = String(code).trim().toLowerCase();
      if (!code) return;
      applyNickname(name || 'ضيف');

      document.getElementById('roomCodeLabel').innerText = "جاري الاتصال بالغرفة " + code + "...";
      const roomOrigin = (window.location.protocol === 'file:') ? 'https://zeta-six-50.vercel.app' : window.location.origin;
      const roomLink = document.getElementById('roomUrlInput');
      roomLink.value = roomOrigin + "/room/" + code;
      roomLink.title = roomLink.value;
      RoomSidebar.copied(false);

      document.getElementById('homePage').style.display = 'none';
      document.getElementById('lobbyScreen').classList.add('show');
      buildBoard();

      lobbyPlayers = [{ name: currentUser, color: PLAYER_COLORS[1], isBot: false }];
      renderLobbyPlayers();

      if (window.Net) Net.join(code, currentUser);
    }
    function openPrivateRoom() {
      RoomSettings.set('privateRoom', true);
      playAsGuest();
    }

    function clearLobbyChat() {
      const container = document.getElementById('lobbyMessages');
      if (!container) return;
      container.innerHTML = RoomSidebar.emptyMarkup();
      const input = document.getElementById('lobbyChatInput');
      if (input) input.value = '';
      RoomSidebar.syncComposer();
    }

    function resetGameSession() {
      window.Trades?.clear?.();
      document.getElementById('lobbyScreen')?.classList.remove('playing');
      if (typeof Game !== 'undefined' && Game.reset) Game.reset();
      else if (typeof Game !== 'undefined') { Game.state = null; Game.busy = false; }
      if (typeof GameUI !== 'undefined' && GameUI.reset) GameUI.reset();
      clearLobbyChat();
    }

    function exitLobby() {
      if (window.Net) Net.leave();
      resetGameSession();
      document.getElementById('lobbyScreen').classList.remove('show');
      document.getElementById('homePage').style.display = 'block';
    }
    async function copyLobbyRoom() {
      const copyText = document.getElementById('roomUrlInput');
      let copied = false;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(copyText.value);
        copied = true;
      } catch (_) {
        copyText.focus();
        copyText.select();
        try { copied = document.execCommand('copy'); } catch (_) {}
      }
      RoomSidebar.copied(copied);
      showToast(copied ? 'Room link copied' : 'Could not copy automatically. Select and copy the room link.');
      return copied;
    }
    // ===== الطاولة =====
    // البيانات ديال الخانات ولات فـ board.js (BOARD) بترتيب المسار الحقيقي.
    // الأعلام: كود ISO من حرفين، ولا صورة حقيقية للي عندهم وحدة.
    const FLAG_CODES = Object.fromEntries(Object.entries(FLAG_OF).map(([code, flag]) => [flag, code]));
    // Build fallbacks first, then apply the real ISO asset for each emoji.
    // Several group codes intentionally share one flag (DE/KW = Kuwait and
    // JP = UAE), so the explicit mapping must be the final override.
    const ROUND_FLAG_IMAGES = {
      ...Object.fromEntries(Object.entries(FLAG_OF).map(([code, flag]) => [flag, `assets/board/flags/${code.toLowerCase()}.png`])),
      '🇹🇳': 'assets/board/flags/br.png',
      '🇪🇬': 'assets/board/flags/il.png',
      '🇵🇸': 'assets/board/flags/in.png',
      '🇲🇦': 'assets/board/flags/it.png',
      '🇰🇼': 'assets/board/flags/kw.png',
      '🇯🇴': 'assets/board/flags/jo.png',
      '🇸🇾': 'assets/board/flags/fr.png',
      '🇦🇪': 'assets/board/flags/ae.png',
      '🇮🇶': 'assets/board/flags/gb.png',
      '🇸🇦': 'assets/board/flags/us.png',
      '🇧🇭': 'assets/board/flags/bh.png',
      '🇶🇦': 'assets/board/flags/qa.png'
    };
    const POPUP_FLAG_IMAGES = {
      ...Object.fromEntries(Object.entries(FLAG_OF).map(([code, flag]) => [flag, `assets/board/full-flags/${code.toLowerCase()}.svg`])),
      '🇹🇳': 'assets/board/full-flags/tn.svg',
      '🇪🇬': 'assets/board/full-flags/eg.svg',
      '🇵🇸': 'assets/board/full-flags/ps.svg',
      '🇲🇦': 'assets/board/full-flags/ma.svg',
      '🇰🇼': 'assets/board/full-flags/kw.svg',
      '🇯🇴': 'assets/board/full-flags/jo.svg',
      '🇸🇾': 'assets/board/full-flags/sy.svg',
      '🇦🇪': 'assets/board/full-flags/ae.svg',
      '🇮🇶': 'assets/board/full-flags/iq.svg',
      '🇸🇦': 'assets/board/full-flags/sa.svg',
      '🇧🇭': 'assets/board/full-flags/bh.svg',
      '🇶🇦': 'assets/board/full-flags/qa.svg'
    };
    const FLAG_IMAGES = ROUND_FLAG_IMAGES;

    function escapeHTML(value) {
      return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    function buildBoard() {
      const board = document.getElementById('lobbyBoard');
      const center = board.querySelector('.lobby-center');
      board.replaceChildren(center);
      GameUI.tileEls = {};
      const inspectable = ['city', 'airport', 'company', 'treasure', 'surprise'];
      BOARD.forEach((tile, index) => {
        const top = tile.r === 1 && !tile.corner;
        const edge = tile.corner ? 'corner' : top ? 'top' : tile.r === 13 ? 'bottom' : tile.c === 1 ? 'left' : 'right';
        const template = top ? 'top' : 'bottom';
        const art = tile.corner ? tile.type : tile.type === 'city' ? tile.art
          : ['airport', 'treasure', 'surprise'].includes(tile.type) ? `${tile.type}-${template}` : tile.artwork;
        const element = document.createElement('div');
        element.className = 'room-tile reference-tile';
        element.dataset.tileIndex = index;
        element.dataset.tileType = tile.type;
        element.dataset.edge = edge;
        element.dataset.template = template;
        if (tile.group) element.dataset.group = tile.group;
        if (tile.artwork) element.dataset.artwork = tile.artwork;
        element.style.gridRow = tile.r;
        element.style.gridColumn = tile.c;
        const cityFlag = tile.flag ? `<span class="bt-flag"><img src="${ROUND_FLAG_IMAGES[tile.flag]}" alt="${escapeHTML(tile.country)} flag" draggable="false"></span>` : '';
        let name = escapeHTML(tile.name);
        if (tile.type === 'company' && tile.artwork !== 'gas') name = name.replace(' ', '<br>');
        element.innerHTML = `<div class="bt-face">
          <img class="bt-surface" src="assets/board/art/${art}.png?v=26" alt="" aria-hidden="true" draggable="false">
          ${cityFlag}
          <span class="bt-name${tile.corner ? ' bt-sr-only' : ''}">${name}</span>
          ${tile.price ? `<span class="bt-price${tile.type === 'tax' ? ' bt-plain-price' : ''}">${escapeHTML(tile.price)}</span>` : ''}
          <div class="rt-tokens"></div>
        </div>`;
        if (inspectable.includes(tile.type)) {
          element.classList.add('land-clickable', 'info-clickable');
          element.tabIndex = 0;
          element.setAttribute('role', 'button');
          element.setAttribute('aria-label', `Open ${tile.name} information`);
          element.addEventListener('click', ev => {
            ev.preventDefault(); ev.stopPropagation(); GameUI.openLandInfo(index);
          });
          element.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault(); ev.stopPropagation(); GameUI.openLandInfo(index);
            }
          });
        } else element.setAttribute('aria-label', tile.name + (tile.price ? `, ${tile.price}` : ''));
        board.appendChild(element);
        GameUI.registerTile(index, element);
      });
      GameUI.prepareDice?.();
      GameUI.resetDice?.();
    }

    // Chat Functionality + host/admin slash commands (WebRTC synced)
    function sendLobbyMessage(e) {
      e.preventDefault();
      const input = document.getElementById('lobbyChatInput');
      const val = input.value.trim();
      if (!val) return;

      input.value = '';
      RoomSidebar.syncComposer();

      if (val.startsWith('/')) {
        if (window.Net && Net.isGuest()) {
          Net.send({ t: 'cmd', text: val });
          return;
        }
        const result = (typeof Game !== 'undefined' && Game.executeCommand)
          ? Game.executeCommand(val)
          : { ok: false, message: 'Commands are available after the game starts.' };
        lobbyChatSystem((result.ok ? '✓ ' : '✕ ') + result.message);
        if (window.Net && Net.isHost()) {
          Net.broadcast({ t: 'chat', who: '⚙', text: (result.ok ? '✓ ' : '✕ ') + result.message });
        }
        return;
      }

      if (window.Net && Net.isGuest()) {
        Net.send({ t: 'chat', text: val });
        const container = document.getElementById('lobbyMessages');
        const emptyMsg = document.getElementById('chatEmpty');
        if (emptyMsg) emptyMsg.style.display = 'none';
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg';
        msgDiv.innerHTML = `<strong>${escapeHTML(currentUser)}:</strong> ${escapeHTML(val)}`;
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
        RoomSidebar.afterMessage();
        return;
      }

      const container = document.getElementById('lobbyMessages');
      const emptyMsg = document.getElementById('chatEmpty');
      if (emptyMsg) emptyMsg.style.display = 'none';

      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-msg';
      msgDiv.innerHTML = `<strong>${escapeHTML(currentUser)}:</strong> ${escapeHTML(val)}`;
      container.appendChild(msgDiv);
      container.scrollTop = container.scrollHeight;
      RoomSidebar.afterMessage();

      if (window.Net && Net.isHost()) {
        Net.broadcast({ t: 'chat', who: currentUser, text: val });
      }
    }


    /* ================= لائحة اللاعبين فالغرفة ================= */
    const BOT_NAMES = ['Sam', 'RAED', 'Noor', 'Ziad', 'Lina', 'Omar', 'Kenza'];
    let lobbyPlayers = [];

    function maxPlayers() { return RoomSettings.get('maxPlayers'); }
    function botsAllowed() { return RoomSettings.get('allowBots'); }

    /** إنشاء الغرفة: المضيف وحدو، والبوتات كيدخلو إلا كان التوغل مفعّل */
    function initLobbyPlayers() {
      lobbyPlayers = [{
        name: currentUser || 'زائر',
        color: PLAYER_COLORS[0],
        isBot: false,
        host: true
      }];
      if (botsAllowed()) fillWithBots();
      renderLobbyPlayers();
      window.lobbyPlayers = lobbyPlayers;
    }
    window.freeColor = freeColor;
    window.renderLobbyPlayers = renderLobbyPlayers;
    window.lobbyChatSystem = lobbyChatSystem;
    window.joinRoom = joinRoom;
    window.joinRoomSubmit = joinRoomSubmit;

    function usedColors() { return lobbyPlayers.map(p => p.color); }

    function freeColor() {
      return PLAYER_COLORS.find(c => !usedColors().includes(c)) || PLAYER_COLORS[0];
    }

    function fillWithBots() {
      while (lobbyPlayers.length < maxPlayers()) {
        const name = BOT_NAMES.find(n => !lobbyPlayers.some(p => p.name === n));
        if (!name) break;
        lobbyPlayers.push({ name, color: freeColor(), isBot: true });
      }
    }

    function removeLobbyPlayer(i) {
      if (lobbyPlayers[i] && lobbyPlayers[i].host) return;
      const gone = lobbyPlayers.splice(i, 1)[0];
      if (gone) lobbyChatSystem(gone.name + ' left the game');
      renderLobbyPlayers();
    }

    /** ملي يتبدل عدد اللاعبين الأقصى ولا توغل البوتات */
    function syncLobbyRoster() {
      if (!lobbyPlayers.length) return;
      if (!botsAllowed()) lobbyPlayers = lobbyPlayers.filter(p => !p.isBot);
      while (lobbyPlayers.length > maxPlayers()) {
        const idx = lobbyPlayers.map(p => !!p.isBot).lastIndexOf(true);
        if (idx < 0) break;
        lobbyPlayers.splice(idx, 1);
      }
      if (botsAllowed()) fillWithBots();
      renderLobbyPlayers();
    }

    function roomIcon(name) {
      return `<svg class="room-icon" aria-hidden="true" focusable="false"><use href="#rs-${name}"></use></svg>`;
    }

    function lobbyAvatar(color) {
      return `<span class="room-player-avatar" aria-hidden="true">
        <svg viewBox="0 0 32 32" style="--player-color:${color}">
          <circle cx="16" cy="16" r="16" fill="var(--player-color)"/>
          <path d="M16 0a16 16 0 0 0 0 32c-6-8 5-14 0-32" fill="#fff" opacity=".2"/>
          <ellipse cx="24.5" cy="10" rx="4.7" ry="4.4" fill="#fff"/>
          <ellipse cx="24.5" cy="23" rx="4.7" ry="4.4" fill="#fff"/>
          <circle cx="26" cy="10" r="1.7" fill="#292332"/>
          <circle cx="26" cy="23" r="1.7" fill="#292332"/>
        </svg>
      </span>`;
    }

    function renderLobbyPlayers() {
      window.lobbyPlayers = lobbyPlayers;
      const box = document.getElementById('lobbyPlayers');
      if (!box) return;
      const isGuest = window.Net && Net.isGuest();
      box.innerHTML = lobbyPlayers.map((p, i) => `
        <div class="room-player-row${p.host ? ' is-host' : ''}">
          ${lobbyAvatar(p.color)}
          <div class="room-player-info">
            <div class="room-player-identity">
              <span class="room-player-name" dir="auto" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</span>
              ${p.host ? `<button type="button" class="room-leave" onclick="exitLobby()" title="Leave room" aria-label="Leave room">${roomIcon('leave')}</button><span class="room-host">${roomIcon('crown')}Host</span>` : ''}
              ${p.isBot ? '<span class="room-botbadge">BOT</span>' : ''}
            </div>
            ${(p.host && !isGuest) ? `<button type="button" class="change-appearance" onclick="openAppearance()">${roomIcon('palette')}Change appearance</button>` : ''}
          </div>
          ${(p.host || isGuest) ? '' : `<button type="button" class="kick-player" onclick="removeLobbyPlayer(${i})" aria-label="Remove ${escapeHTML(p.name)}" title="Remove player">×</button>`}
        </div>
      `).join('');

      const start = document.querySelector('.start-game');
      if (start) {
        if (isGuest) {
          start.disabled = true;
          start.innerHTML = '<span>في انتظار المضيف لبدء اللعبة...</span>';
          start.title = 'المضيف هو من يبدأ اللعبة';
        } else {
          start.disabled = lobbyPlayers.length < 2;
          start.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m6 4 5 4-5 4z" fill="#4d3b72"/></svg><span>Start Game</span>';
          start.title = lobbyPlayers.length < 2
            ? 'خاصك لاعبين اثنين على الأقل — فعّل Allow bots'
            : `Start with ${lobbyPlayers.length} players`;
        }
      }
      const navAvatar = document.getElementById('navAvatar');
      if (navAvatar) navAvatar.innerText = (currentUser || 'ز').charAt(0).toUpperCase();
    }

    function lobbyChatSystem(text) {
      const container = document.getElementById('lobbyMessages');
      const emptyMsg = document.getElementById('chatEmpty');
      if (!container) return;
      if (emptyMsg) emptyMsg.style.display = 'none';
      const div = document.createElement('div');
      div.className = 'chat-msg system';
      div.textContent = text;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
      RoomSidebar.afterMessage();
    }

    /* ================= اختيار المظهر (12 لون) ================= */
    function openAppearance() {
      const grid = document.getElementById('appearanceGrid');
      if (grid) {
        grid.innerHTML = PLAYER_COLORS.map(c => {
          const taken = lobbyPlayers.some((p, i) => p.color === c && !p.host);
          const mine = lobbyPlayers[0].color === c;
          return `<button class="appearance-dot${mine ? ' selected' : ''}${taken ? ' taken' : ''}"
                    style="background:${c}" ${taken ? 'disabled' : ''}
                    aria-label="${mine ? 'Selected color' : taken ? 'Color already taken' : 'Select this color'}"
                    aria-pressed="${mine ? 'true' : 'false'}"
                    onclick="pickAppearance('${c}')"></button>`;
        }).join('');
      }
      document.getElementById('appearanceModal').classList.add('show');
    }

    function pickAppearance(color) {
      if (!PLAYER_COLORS.includes(color)) return;
      if (lobbyPlayers.some((p, i) => i !== 0 && p.color === color)) return;
      lobbyPlayers[0].color = color;
      renderLobbyPlayers();
      openAppearance();
    }

    function closeAppearance() {
      document.getElementById('appearanceModal').classList.remove('show');
    }

    // Start with a validated settings snapshot; labels are presentation only.
    function startGame() {
      if (window.Net && Net.isGuest()) return;
      if (lobbyPlayers.length < 2) {
        return showToast('خاصك على الأقل لاعبين اثنين — فعّل Allow bots to join');
      }
      if (typeof GameUI !== 'undefined') {
        GameUI.hideEndScreen?.();
        GameUI.closeLandInfo?.();
      }
      document.getElementById('lobbyScreen').classList.add('playing');
      Game.init(lobbyPlayers.map(p => ({ name: p.name, color: p.color, isBot: p.isBot, host: p.host })), RoomSettings.gameSettings());
      if (window.Net && Net.isHost()) {
        Net.hostStart();
      }
      showToast('اللعبة بدات — حظ سعيد!');
    }

    function quitGame() {
      resetGameSession();
      buildBoard();
      renderLobbyPlayers();
    }

    RoomSettings.init((key) => {
      // Gameplay switches must not refill the roster or affect a running match.
      if (key === 'maxPlayers' || key === 'allowBots') syncLobbyRoster();
      if (key === 'privateRoom') {
        showToast('Preference saved. This local build has no online room discovery or access control.');
      }
    });
    RoomSidebar.init();
    isMuted = RoomSidebar.isMuted();
    updateMuteButton();
    syncPlayButton();
    startBackgroundMusic();

    window.addEventListener('net-host-open', (e) => {
      document.getElementById('roomCodeLabel').innerText = "غرفة أونلاين: " + e.detail.code;
    });
    window.addEventListener('net-guest-open', (e) => {
      document.getElementById('roomCodeLabel').innerText = "متصل بالغرفة: " + e.detail.code;
      showToast('تم الاتصال بالمضيف بنجاح!');
    });
    window.addEventListener('net-error', (e) => {
      showToast(e.detail || 'خطأ في الاتصال');
    });
    window.addEventListener('net-closed', () => {
      showToast('انقطع الاتصال بالغرفة');
    });

    // Deep link: /room/:code or #room=:code or ?room=:code or #lobby
    function getRoomCodeFromUrl() {
      const pathMatch = location.pathname.match(/\/room\/([a-zA-Z0-9_-]+)/);
      if (pathMatch) return pathMatch[1];
      if (location.hash) {
        const hashMatch = location.hash.match(/#room=([a-zA-Z0-9_-]+)/);
        if (hashMatch) return hashMatch[1];
      }
      const sp = new URLSearchParams(location.search);
      if (sp.get('room')) return sp.get('room');
      return null;
    }

    const roomFromUrl = getRoomCodeFromUrl();
    if (roomFromUrl) {
      const joinInput = document.getElementById('joinCodeInput');
      if (joinInput) joinInput.value = roomFromUrl;
      const nick = document.getElementById('nicknameInput');
      if (nick && nick.value.trim()) {
        joinRoom(roomFromUrl, nick.value.trim());
      } else {
        showToast('انضمام للغرفة: ' + roomFromUrl + ' — اكتب اسمك واضغط انضمام');
      }
    } else if (location.hash === '#lobby') {
      const nick = document.getElementById('nicknameInput');
      if (nick && !nick.value.trim()) nick.value = 'زائر';
      syncPlayButton();
      playAsGuest();
    }
