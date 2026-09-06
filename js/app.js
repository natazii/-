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
      const roomOrigin = (window.location.protocol === 'file:') ? 'https://zeta-six-50.vercel.app' : window.location.origin;
      document.getElementById('roomUrlInput').value = roomOrigin + "/room/" + randomCode;

      document.getElementById('homePage').style.display = 'none';
      document.getElementById('lobbyScreen').classList.add('show');
      buildBoard();
      initLobbyPlayers();
    }
    function openPrivateRoom() {
      playAsGuest();
      showToast('تم إنشاء غرفة خاصة بنجاح');
    }

    function clearLobbyChat() {
      const container = document.getElementById('lobbyMessages');
      if (!container) return;
      container.innerHTML = '<div class="lobby-chat-empty" id="chatEmpty"><b>▦</b><span>No messages yet</span></div>';
      const input = document.getElementById('lobbyChatInput');
      if (input) input.value = '';
    }

    function resetGameSession() {
      document.getElementById('lobbyScreen')?.classList.remove('playing');
      if (typeof Game !== 'undefined' && Game.reset) Game.reset();
      else if (typeof Game !== 'undefined') { Game.state = null; Game.busy = false; }
      if (typeof GameUI !== 'undefined' && GameUI.reset) GameUI.reset();
      clearLobbyChat();
    }

    function exitLobby() {
      resetGameSession();
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
      '🇹🇳': 'TN', '🇮🇶': 'IQ', '🇪🇬': 'EG', '🇵🇸': 'PS', '🇸🇾': 'SY',
      '🇦🇪': 'AE', '🇲🇦': 'MA', '🇸🇦': 'SA', '🇬🇧': 'GB',
      '🇰🇼': 'KW', '🇧🇭': 'BH', '🇶🇦': 'QA', '🇯🇴': 'JO'
    };
    // Two separate flag sets on purpose:
    // ROUND_FLAG_IMAGES = only the small circular board chips.
    // POPUP_FLAG_IMAGES = the user's full rectangular artwork for land cards.
    const ROUND_FLAG_IMAGES = {
      '🇹🇳': 'assets/flags/tunisia.png',
      '🇮🇶': 'assets/flags/iraq.png',
      '🇪🇬': 'assets/flags/egypt.png',
      '🇸🇾': 'assets/flags/syria.png',
      '🇸🇦': 'assets/flags/saudi.png',
      '🇵🇸': 'assets/flags/palestine.png',
      '🇲🇦': 'assets/flags/morocco.png',
      '🇦🇪': 'assets/flags/uae.png',
      '🇰🇼': 'assets/flags/kuwait.png',
      '🇧🇭': 'assets/flags/bahrain.png',
      '🇶🇦': 'assets/flags/qatar.png',
      '🇯🇴': 'assets/flags/jordan.png',
      '🇬🇧': 'assets/flags/gb.png'
    };
    const POPUP_FLAG_IMAGES = {
      '🇹🇳': 'assets/flags/popup/tunisia.png',
      '🇮🇶': 'assets/flags/popup/iraq.png',
      '🇪🇬': 'assets/flags/popup/egypt.png',
      '🇸🇦': 'assets/flags/popup/saudi.png',
      '🇵🇸': 'assets/flags/popup/palestine.png',
      '🇲🇦': 'assets/flags/popup/morocco.png',
      '🇦🇪': 'assets/flags/popup/uae.png',
      '🇰🇼': 'assets/flags/popup/kuwait.png',
      '🇧🇭': 'assets/flags/popup/bahrain.png',
      '🇶🇦': 'assets/flags/popup/qatar.png',
      '🇯🇴': 'assets/flags/popup/jordan.png',
      '🇸🇾': 'assets/flags/popup/syria.png',
      '🇬🇧': 'assets/flags/popup/gb.png'
    };
    // Legacy name kept for old code, but it ALWAYS means the round board chip.
    const FLAG_IMAGES = ROUND_FLAG_IMAGES;

    function escapeHTML(value) {
      return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    function buildBoard() {
      const board = document.getElementById('lobbyBoard');
      const center = board.querySelector('.lobby-center');
      board.innerHTML = '';
      board.appendChild(center);
      GameUI.tileEls = {};

      const tiles = BOARD;
      tiles.forEach((tile, tileIndex) => {
        const div = document.createElement('div');
        let cls = 'room-tile';
        if (tile.corner) cls += ' corner';
        if (tile.special) cls += ' special';
        if (tile.color && tile.type !== 'city') cls += ' has-bar';
        if (['city','airport','company','deathvalley','surprise','treasure'].includes(tile.type)) cls += ' land-clickable info-clickable';
        if (tile.type === 'city') cls += ' land-city';
        if (tile.flag) cls += ' has-flag-chip';
        if (tile.special && !tile.corner) cls += ' special-tile';

        // Tag special non-corner tiles so each type gets its own tinted style
        if (tile.special && !tile.corner) {
          if (tile.type === 'deathvalley') cls += ' tint-deathvalley';
          else if (tile.icon === '🎁') cls += ' tint-treasure';
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
        if (tile.special && !tile.corner) {
          if (tile.c === 1 || tile.c === 13) cls += ' side-special';
          else if (tile.r === 1 || tile.r === 13) cls += ' row-special';
        }
        div.className = cls;
        div.style.gridRow = tile.r;
        div.style.gridColumn = tile.c;
        if (tile.color) div.style.setProperty('--tile-color', tile.color);
        div.dataset.tileIndex = tileIndex;
        div.dataset.tileType = tile.type || '';

        if (['city','airport','company','deathvalley','surprise','treasure'].includes(tile.type)) {
          div.tabIndex = 0;
          div.setAttribute('role', 'button');
          div.setAttribute('aria-label', `Open ${tile.name} information`);
          div.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); GameUI.openLandInfo(tileIndex); });
          div.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              GameUI.openLandInfo(tileIndex);
            }
          });
        }

        let html = '';
        if (tile.type === 'city') {
          const bg = tile.flag && ROUND_FLAG_IMAGES[tile.flag];
          if (bg) html += `<div class="rt-land-bg"><img src="${bg}" alt="" /></div>`;
          else if (tile.flag) html += `<div class="rt-land-bg rt-land-bg-emoji">${tile.flag}</div>`;
          html += '<div class="rt-land-dim"></div>';
        }
        if (tile.color && tile.type !== 'city') html += `<div class="color-bar"></div>`;
        if (tile.price) html += `<div class="rt-price">${tile.price}</div>`;
        if (tile.icon === '❓') html += `<div class="rt-icon"><span class="rt-q">?</span></div>`;
        else if (tile.icon) html += `<div class="rt-icon">${tile.icon}</div>`;
        if (tile.flag) {
          if (ROUND_FLAG_IMAGES[tile.flag]) {
            html += `<div class="rt-flag rt-img"><img src="${ROUND_FLAG_IMAGES[tile.flag]}" alt="" /></div>`;
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
        GameUI.registerTile(tileIndex, div);

        board.appendChild(div);
      });
      // Convert the two center dice into actual six-face 3D cubes immediately,
      // even before the first roll.
      GameUI.prepareDice?.();
      GameUI.setDieFace?.(document.getElementById('die1'), 1);
      GameUI.setDieFace?.(document.getElementById('die2'), 1);

      // One delegated listener makes land clicking reliable even when ownership
      // overlays, tokens, houses, or flags are on top of the tile content.
      if (!board.dataset.landClickDelegated) {
        board.dataset.landClickDelegated = '1';
        board.addEventListener('click', ev => {
          if (ev.defaultPrevented) return;
          const tileEl = ev.target.closest('.room-tile[data-tile-index]');
          if (!tileEl || !board.contains(tileEl)) return;
          const idx = Number(tileEl.dataset.tileIndex);
          const land = BOARD[idx];
          if (land && ['city','airport','company','deathvalley','surprise','treasure'].includes(land.type)) {
            ev.preventDefault();
            GameUI.openLandInfo(idx);
          }
        });
      }
    }

    // Chat Functionality + host/admin slash commands
    function sendLobbyMessage(e) {
      e.preventDefault();
      const input = document.getElementById('lobbyChatInput');
      const val = input.value.trim();
      if (!val) return;

      input.value = '';

      if (val.startsWith('/')) {
        const result = (typeof Game !== 'undefined' && Game.executeCommand)
          ? Game.executeCommand(val)
          : { ok: false, message: 'Commands are available after the game starts.' };
        lobbyChatSystem((result.ok ? '✓ ' : '✕ ') + result.message);
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
          <span class="room-player-avatar player-face" style="--player-color:${p.color}" data-look="${['right','down','left','up'][i % 4]}" aria-hidden="true"></span>
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

    // Extra gameplay setting: when disabled, owned land can be sold back to the bank instead of mortgaged.
    function ensureMortgageSetting() {
      const settings = document.querySelector('.room-settings');
      if (!settings || document.getElementById('mortgagingSetting')) return;

      const row = document.createElement('div');
      row.className = 'room-setting';
      row.id = 'mortgagingSetting';
      row.innerHTML = `
        <div class="room-setting-icon">🏦</div>
        <div class="room-setting-copy">
          <div class="room-setting-name">Mortgaging</div>
          <div class="room-setting-help">When disabled, players can sell land back to the bank for 50% of its price instead.</div>
        </div>
        <button class="room-toggle on" onclick="toggleRoomSwitch(this)"></button>`;

      const gameplayTitle = [...settings.querySelectorAll('.settings-section-title')]
        .find(el => el.textContent.trim().startsWith('Gameplay rules'));
      if (gameplayTitle && gameplayTitle.nextSibling) gameplayTitle.parentNode.insertBefore(row, gameplayTitle.nextSibling);
      else settings.appendChild(row);
    }

    // Monopoly-style even building can be switched off for a freer Richup-style mode.
    // ON  = houses/hotels must stay balanced across the country set.
    // OFF = each land can be upgraded independently all the way to a hotel.
    function ensureEvenBuildingSetting() {
      const settings = document.querySelector('.room-settings');
      if (!settings || document.getElementById('evenBuildingSetting')) return;

      const row = document.createElement('div');
      row.className = 'room-setting';
      row.id = 'evenBuildingSetting';
      row.innerHTML = `
        <div class="room-setting-icon">🏘️</div>
        <div class="room-setting-copy">
          <div class="room-setting-name">Even building</div>
          <div class="room-setting-help">When enabled, houses and hotels must be built evenly across a full country set. Turn it off to upgrade each land independently.</div>
        </div>
        <button class="room-toggle on" onclick="toggleRoomSwitch(this)"></button>`;

      const mortgageRow = document.getElementById('mortgagingSetting');
      if (mortgageRow && mortgageRow.nextSibling) mortgageRow.parentNode.insertBefore(row, mortgageRow.nextSibling);
      else if (mortgageRow) mortgageRow.parentNode.appendChild(row);
      else settings.appendChild(row);
    }

    function ensureExpandedSettings() {
      const settings = document.querySelector('.room-settings');
      if (!settings || document.getElementById('expandedSettingsAnchor')) return;

      const anchor = document.createElement('div');
      anchor.id = 'expandedSettingsAnchor';
      anchor.style.display = 'none';
      settings.appendChild(anchor);

      const extraRows = [
        { id:'auctionSetting', icon:'🔨', name:'Auction unowned lands', help:'If a player refuses to buy a land, it can still be auctioned to the highest bidder.', kind:'toggle', on:true },
        { id:'tradeSetting', icon:'🤝', name:'Player trading', help:'Allow players to trade money, lands, and get-out cards with each other.', kind:'toggle', on:true },
        { id:'timerSetting', icon:'⏱️', name:'Turn timer', help:'Set the maximum amount of time for each player turn.', kind:'select', options:['Off','15 sec','30 sec','45 sec','60 sec'], selected:'30 sec' },
        { id:'cashSetting', icon:'💵', name:'Starting cash', help:'Choose the starting amount every player receives.', kind:'select', options:['1500$','2000$','3000$','5000$'], selected:'3000$' },
        { id:'startBonusSetting', icon:'🏁', name:'Passing START bonus', help:'Money earned when a player passes or lands on START.', kind:'select', options:['100$','200$','300$','400$'], selected:'200$' },
        { id:'jailFeeSetting', icon:'🔒', name:'Prison bail fee', help:'The fee required to leave prison immediately.', kind:'select', options:['25$','50$','100$'], selected:'50$' },
        { id:'fastModeSetting', icon:'⚡', name:'Fast mode', help:'Speed up movement, dice and popup pacing for a quicker match.', kind:'toggle', on:true },
        { id:'animSetting', icon:'🎞️', name:'Board animations', help:'Enable extra movement and board animation effects.', kind:'toggle', on:true }
      ];

      extraRows.forEach(def => {
        if (document.getElementById(def.id)) return;
        const row = document.createElement('div');
        row.className = 'room-setting';
        row.id = def.id;
        const control = def.kind === 'select'
          ? `<select class="room-select">${def.options.map(o => `<option ${o === def.selected ? 'selected' : ''}>${o}</option>`).join('')}</select>`
          : `<button class="room-toggle${def.on ? ' on' : ''}" onclick="toggleRoomSwitch(this)"></button>`;
        row.innerHTML = `
          <div class="room-setting-icon">${def.icon}</div>
          <div class="room-setting-copy">
            <div class="room-setting-name">${def.name}</div>
            <div class="room-setting-help">${def.help}</div>
          </div>
          ${control}`;
        settings.insertBefore(row, anchor);
      });
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

    function readRoomSelect(name, fallback) {
      const rows = document.querySelectorAll('.room-setting');
      for (const row of rows) {
        const label = row.querySelector('.room-setting-name');
        if (label && label.textContent.trim().startsWith(name)) {
          const sel = row.querySelector('.room-select');
          if (sel && sel.value) {
            const m = sel.value.match(/-?\d+/);
            return m ? Number(m[0]) : sel.value;
          }
        }
      }
      return fallback;
    }

    function startGame() {
      if (lobbyPlayers.length < 2) {
        return showToast('خاصك على الأقل لاعبين اثنين — زيد بوت');
      }
      if (typeof GameUI !== 'undefined') {
        GameUI.hideEndScreen?.();
        GameUI.closeLandInfo?.();
      }
      document.getElementById('lobbyScreen').classList.add('playing');
      Game.init(lobbyPlayers.map(p => ({ name: p.name, color: p.color, isBot: p.isBot })), {
        startCash: readRoomSelect('Starting cash', 3000),
        startBonus: readRoomSelect('Passing START bonus', 200),
        jailFee: readRoomSelect('Prison bail fee', 50),
        vacationCash: readRoomToggle('Vacation cash'),
        doubleRentFullSet: readRoomToggle('x2 rent'),
        mortgaging: readRoomToggle('Mortgaging'),
        evenBuilding: readRoomToggle('Even building')
      });
      showToast('اللعبة بدات — حظ سعيد!');
    }

    function quitGame() {
      resetGameSession();
      buildBoard();
      renderLobbyPlayers();
    }

    document.addEventListener('change', function (e) {
      if (e.target && e.target.classList.contains('room-select')) syncLobbyRoster();
    });

    ensureMortgageSetting();
    ensureEvenBuildingSetting();
    ensureExpandedSettings();
    syncPlayButton();
    startBackgroundMusic();

    // Deep link straight into a demo lobby via URL hash (e.g. index.html#lobby)
    if (location.hash === '#lobby') {
      const nick = document.getElementById('nicknameInput');
      if (nick && !nick.value.trim()) nick.value = 'زائر';
      syncPlayButton();
      playAsGuest();
    }
