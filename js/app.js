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
        if (e && e.target && e.target.closest && e.target.closest('#muteButton')) {
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
      const btn = document.getElementById('muteButton');
      if (!btn) return;
      if (isMuted) {
        btn.classList.add('muted');
        btn.setAttribute('aria-label', 'تشغيل الصوت');
      } else {
        btn.classList.remove('muted');
        btn.setAttribute('aria-label', 'كتم الصوت');
      }
    }

    // Toggle Audio
    function toggleMute() {
      const audio = getBgMusic();

      if (isMuted) {
        isMuted = false;
        tryPlayMusic();
        updateMuteButton();
        showToast('تم تشغيل الأغنية');
        return;
      }

      if (!isMusicPlaying()) {
        tryPlayMusic();
        updateMuteButton();
        return;
      }

      isMuted = true;
      if (audio) audio.pause();
      updateMuteButton();
      showToast('تم إيقاف الأغنية');
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

    // Lobby System
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

      const randomCode = Math.random().toString(36).substring(2, 6);
      document.getElementById('roomCodeLabel').innerText = "Joined room " + randomCode;
      document.getElementById('roomUrlInput').value = "https://richora.io/room/" + randomCode;

      document.getElementById('homePage').style.display = 'none';
      document.getElementById('lobbyScreen').classList.add('show');
      buildBoard();
      initLobbyPlayers();
    }
    function openPrivateRoom() {
      playAsGuest();
      showToast('تم إنشاء غرفة خاصة بنجاح');
    }
    function exitLobby() {
      document.getElementById('lobbyScreen').classList.remove('show');
      document.getElementById('homePage').style.display = 'block';
    }
    function copyLobbyRoom() {
      const copyText = document.getElementById("roomUrlInput");
      navigator.clipboard.writeText(copyText.value).then(() => {
        showToast('تم نسخ رابط الغرفة!');
      }).catch(() => {
        showToast('تم نسخ رابط الغرفة!');
      });
    }
    function toggleRoomSwitch(el) {
      el.classList.toggle('on');
      syncLobbyRoster();
    }

    // ===== الطاولة =====
    // البيانات ديال الخانات ولات فـ board.js (BOARD) بترتيب المسار الحقيقي.
    // الأعلام: كود ISO من حرفين، ولا صورة حقيقية للي عندهم وحدة.
    const FLAG_CODES = {
      '🇧🇷': 'BR', '🇪🇬': 'EG', '🇵🇸': 'PS', '🇨🇳': 'CN', '🇸🇾': 'SY',
      '🇦🇪': 'AE', '🇩🇪': 'DE', '🇲🇦': 'MA', '🇸🇦': 'SA', '🇬🇧': 'GB',
      '🇹🇳': 'TN', '🇰🇼': 'KW', '🇧🇭': 'BH', '🇶🇦': 'QA'
    };
    const FLAG_IMAGES = {
      '🇹🇳': 'assets/flags/tunisia.png',
      '🇸🇾': 'assets/flags/syria.png',
      '🇪🇬': 'assets/flags/egypt.png',
      '🇸🇦': 'assets/flags/saudi.png',
      '🇵🇸': 'assets/flags/palestine.png',
      '🇲🇦': 'assets/flags/morocco.png',
      '🇦🇪': 'assets/flags/uae.png',
      '🇰🇼': 'assets/flags/kuwait.png',
      '🇧🇭': 'assets/flags/bahrain.png',
      '🇶🇦': 'assets/flags/qatar.png'
    };

    function buildBoard() {
      const board = document.getElementById('lobbyBoard');
      const center = board.querySelector('.lobby-center');
      board.innerHTML = '';
      board.appendChild(center);
      GameUI.tileEls = {};

      const tiles = BOARD;
      tiles.forEach((tile) => {
        const div = document.createElement('div');
        let cls = 'room-tile';
        if (tile.corner) cls += ' corner';
        if (tile.special) cls += ' special';
        if (tile.color) cls += ' has-bar';

        // Tag special non-corner tiles so each type gets its own tinted style
        if (tile.special && !tile.corner) {
          if (tile.icon === '🎁') cls += ' tint-treasure';
          else if (tile.icon === '❓') cls += ' tint-surprise';
          else if (tile.icon === '✈️') cls += ' tint-airport';
          else if (tile.icon === '💧' || tile.icon === '⚡' || tile.icon === '🔥') cls += ' tint-company';
          else cls += ' tint-tax';
        }

        // Tag each tile with the board edge it belongs to (corners excluded),
        // so CSS can rotate side tiles and point color strips towards the outside.
        if (!tile.corner) {
          if (tile.c === 1) cls += ' edge-left';
          else if (tile.c === 13) cls += ' edge-right';
          else if (tile.r === 1) cls += ' edge-top';
          else if (tile.r === 13) cls += ' edge-bottom';
        }
        div.className = cls;
        div.style.gridRow = tile.r;
        div.style.gridColumn = tile.c;
        if (tile.color) div.style.setProperty('--tile-color', tile.color);

        let html = '';
        if (tile.color) html += `<div class="color-bar"></div>`;
        if (tile.price) html += `<div class="rt-price">${tile.price}</div>`;
        if (tile.icon === '❓') html += `<div class="rt-icon"><span class="rt-q">?</span></div>`;
        else if (tile.icon) html += `<div class="rt-icon">${tile.icon}</div>`;
        if (tile.flag) {
          if (FLAG_IMAGES[tile.flag]) {
            html += `<div class="rt-flag rt-img"><img src="${FLAG_IMAGES[tile.flag]}" alt="" /></div>`;
          } else {
            html += `<div class="rt-flag rt-code">${FLAG_CODES[tile.flag] || ''}</div>`;
          }
        }
        if (tile.icon !== '❓') {
          // Font-size class based on how the name will break:
          // single words can't wrap, multi-word names wrap at the space.
          const words = tile.name.split(' ');
          const longestWord = Math.max.apply(null, words.map(w => w.length));
          const constraint = words.length === 1
            ? longestWord
            : Math.max(longestWord, Math.ceil(tile.name.length / 2));
          const nameCls = constraint >= 10 ? ' rt-f8' : (constraint >= 8 ? ' rt-f9' : '');
          html += `<div class="rt-name${nameCls}">${tile.name}</div>`;
        }
        div.innerHTML = html;
        const tokens = document.createElement('div');
        tokens.className = 'rt-tokens';
        div.appendChild(tokens);
        GameUI.registerTile(BOARD.indexOf(tile), div);

        board.appendChild(div);
      });
    }

    // Chat Functionality
    function sendLobbyMessage(e) {
      e.preventDefault();
      const input = document.getElementById('lobbyChatInput');
      const val = input.value.trim();
      if (!val) return;

      const container = document.getElementById('lobbyMessages');
      const emptyMsg = document.getElementById('chatEmpty');
      if (emptyMsg) emptyMsg.style.display = 'none';

      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-msg';
      msgDiv.innerHTML = `<strong>${currentUser}:</strong> ${val}`;
      container.appendChild(msgDiv);

      input.value = '';
      container.scrollTop = container.scrollHeight;
    }


    /* ================= لائحة اللاعبين فالغرفة ================= */
    const BOT_NAMES = ['Sam', 'RAED', 'Noor', 'Ziad', 'Lina', 'Omar', 'Kenza'];
    let lobbyPlayers = [];

    function maxPlayers() {
      const sel = document.querySelector('.room-select');
      return sel ? parseInt(sel.value, 10) : 4;
    }

    function botsAllowed() {
      const row = [...document.querySelectorAll('.room-setting')].find(r => {
        const n = r.querySelector('.room-setting-name');
        return n && n.textContent.trim().startsWith('Allow bots');
      });
      const tg = row && row.querySelector('.room-toggle');
      return !!(tg && tg.classList.contains('on'));
    }

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
    }

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

    function addLobbyBot() {
      if (lobbyPlayers.length >= maxPlayers()) {
        return showToast('الغرفة عامرة — كبّر عدد اللاعبين أولاً');
      }
      const name = BOT_NAMES.find(n => !lobbyPlayers.some(p => p.name === n));
      if (!name) return showToast('ما بقاوش أسماء بوتات');
      lobbyPlayers.push({ name, color: freeColor(), isBot: true });
      lobbyChatSystem(name + ' joined the game');
      renderLobbyPlayers();
    }

    function removeLobbyPlayer(i) {
      if (lobbyPlayers[i] && lobbyPlayers[i].host) return;
      const gone = lobbyPlayers.splice(i, 1)[0];
      if (gone) lobbyChatSystem(gone.name + ' left the game');
      renderLobbyPlayers();
    }

    /** ملي يتبدل عدد اللاعبين الأقصى ولا توغل البوتات */
    function syncLobbyRoster() {
      const max = maxPlayers();
      while (lobbyPlayers.length > max) {
        const idx = lobbyPlayers.map(p => !!p.isBot).lastIndexOf(true);
        if (idx < 0) break;
        lobbyPlayers.splice(idx, 1);
      }
      if (botsAllowed()) fillWithBots();
      renderLobbyPlayers();
    }

    function renderLobbyPlayers() {
      const box = document.getElementById('lobbyPlayers');
      if (!box) return;
      box.innerHTML = lobbyPlayers.map((p, i) => `
        <div class="room-player-row${p.host ? ' is-host' : ''}">
          <span class="room-player-avatar" style="background:${p.color}">${p.name.charAt(0).toUpperCase()}</span>
          <span class="room-player-name">
            ${p.name}
            ${p.host ? '<span class="room-host">♛ Host</span>' : ''}
            ${p.isBot ? '<span class="room-botbadge">BOT</span>' : ''}
          </span>
          ${p.host
            ? '<button class="change-appearance" onclick="openAppearance()">Change appearance</button>'
            : `<button class="kick-player" onclick="removeLobbyPlayer(${i})" title="طرد">✕</button>`}
        </div>
      `).join('');

      const count = document.getElementById('lobbyCount');
      const max = document.getElementById('lobbyMax');
      if (count) count.textContent = lobbyPlayers.length;
      if (max) max.textContent = maxPlayers();

      const addBtn = document.getElementById('addBotBtn');
      if (addBtn) addBtn.disabled = lobbyPlayers.length >= maxPlayers();

      // الاسم/الأفاتار فالشريط العلوي
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
                    onclick="pickAppearance('${c}')"></button>`;
        }).join('');
      }
      document.getElementById('appearanceModal').classList.add('show');
    }

    function pickAppearance(color) {
      lobbyPlayers[0].color = color;
      renderLobbyPlayers();
      openAppearance();
    }

    function closeAppearance() {
      document.getElementById('appearanceModal').classList.remove('show');
    }

    // ===== انطلاق اللعبة =====
    function readRoomToggle(name) {
      const rows = document.querySelectorAll('.room-setting');
      for (const row of rows) {
        const label = row.querySelector('.room-setting-name');
        if (label && label.textContent.trim().startsWith(name)) {
          const tg = row.querySelector('.room-toggle');
          if (tg) return tg.classList.contains('on');
        }
      }
      return false;
    }

    function startGame() {
      if (lobbyPlayers.length < 2) {
        return showToast('خاصك على الأقل لاعبين اثنين — زيد بوت');
      }
      document.getElementById('lobbyScreen').classList.add('playing');
      Game.init(lobbyPlayers.map(p => ({ name: p.name, color: p.color, isBot: p.isBot })), {
        startCash: 3000,
        startBonus: 200,
        jailFee: 50,
        vacationCash: readRoomToggle('Vacation cash'),
        doubleRentFullSet: readRoomToggle('x2 rent')
      });
      showToast('اللعبة بدات — حظ سعيد!');
    }

    function quitGame() {
      document.getElementById('lobbyScreen').classList.remove('playing');
      Game.state = null;
      buildBoard();
      renderLobbyPlayers();
    }

    document.addEventListener('change', function (e) {
      if (e.target && e.target.classList.contains('room-select')) syncLobbyRoster();
    });

    syncPlayButton();
    startBackgroundMusic();

    // Deep link straight into a demo lobby via URL hash (e.g. index.html#lobby)
    if (location.hash === '#lobby') {
      const nick = document.getElementById('nicknameInput');
      if (nick && !nick.value.trim()) nick.value = 'زائر';
      syncPlayButton();
      playAsGuest();
    }
