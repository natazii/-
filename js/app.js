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

      document.getElementById('lobbyPlayerName').innerText = currentUser;
      document.getElementById('lobbyAvatar').innerText = currentUser.charAt(0).toUpperCase();
      document.getElementById('navAvatar').innerText = currentUser.charAt(0).toUpperCase();

      closeAuth();
      showToast('أهلاً بك، ' + currentUser + '!');
    }
    function socialAuth(provider) {
      currentUser = provider + "_User";
      document.getElementById('lobbyPlayerName').innerText = currentUser;
      document.getElementById('lobbyAvatar').innerText = currentUser.charAt(0);
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
      const lobbyName = document.getElementById('lobbyPlayerName');
      const lobbyAvatar = document.getElementById('lobbyAvatar');
      const navAvatar = document.getElementById('navAvatar');
      if (lobbyName) lobbyName.innerText = currentUser;
      if (lobbyAvatar) lobbyAvatar.innerText = currentUser.charAt(0).toUpperCase();
      if (navAvatar) navAvatar.innerText = currentUser.charAt(0).toUpperCase();
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
    }

    // Full Monopoly-style board matching Richup layout
    function buildBoard() {
      const board = document.getElementById('lobbyBoard');
      const center = board.querySelector('.lobby-center');
      board.innerHTML = '';
      board.appendChild(center);

      // 40 tiles around the board (classic path order starting from GO / bottom-left going clockwise)
      // Grid is 11x11. Outer ring positions:
      // Bottom row (row 11): c1 → c11  (Go → ... → Jail corner area)
      // Right column (c11): r10 → r1
      // Top row (row 1): c10 → c1
      // Left column (c1): r2 → r10

      const tiles = [
        // === BOTTOM row left→right (row 11) ===
        { r:11, c:1,  name:'Go to prison', icon:'☠️', corner:true, special:true },
        { r:11, c:2,  name:'Paris', price:'280$', flag:'🇫🇷', color:'#4a90d9' },
        { r:11, c:3,  name:'Toulouse', price:'270$', flag:'🇫🇷', color:'#4a90d9' },
        { r:11, c:4,  name:'Water Company', price:'150$', icon:'💧', special:true },
        { r:11, c:5,  name:'Lyon', price:'260$', flag:'🇫🇷', color:'#4a90d9' },
        { r:11, c:6,  name:'CDG Airport', price:'200$', icon:'✈️', special:true },
        { r:11, c:7,  name:'Shanghai', price:'240$', flag:'🇨🇳', color:'#e74c3c' },
        { r:11, c:8,  name:'Beijing', price:'220$', flag:'🇨🇳', color:'#e74c3c' },
        { r:11, c:9,  name:'Surprise', icon:'❓', special:true },
        { r:11, c:10, name:'Shenzhen', price:'210$', flag:'🇨🇳', color:'#e74c3c' },
        { r:11, c:11, name:'Vacation', icon:'🏝️', corner:true, special:true },

        // === RIGHT column bottom→top (c11, r10→r2) ===
        { r:10, c:11, name:'Berlin', price:'200$', flag:'🇩🇪', color:'#2c3e50' },
        { r:9,  c:11, name:'Munich', price:'190$', flag:'🇩🇪', color:'#2c3e50' },
        { r:8,  c:11, name:'Treasure', icon:'🎁', special:true },
        { r:7,  c:11, name:'Frankfurt', price:'180$', flag:'🇩🇪', color:'#2c3e50' },
        { r:6,  c:11, name:'MUC Airport', price:'200$', icon:'✈️', special:true },
        { r:5,  c:11, name:'Rome', price:'160$', flag:'🇮🇹', color:'#27ae60' },
        { r:4,  c:11, name:'Milan', price:'140$', flag:'🇮🇹', color:'#27ae60' },
        { r:3,  c:11, name:'Power Company', price:'150$', icon:'⚡', special:true },
        { r:2,  c:11, name:'Venice', price:'130$', flag:'🇮🇹', color:'#27ae60' },

        // === TOP row right→left (row 1, c11→c1) ===
        { r:1, c:11, name:'In Prison', icon:'🔒', corner:true, special:true },
        { r:1, c:10, name:'Jerusalem', price:'120$', flag:'🇮🇱', color:'#5dade2' },
        { r:1, c:9,  name:'Surprise', icon:'❓', special:true },
        { r:1, c:8,  name:'Haifa', price:'110$', flag:'🇮🇱', color:'#5dade2' },
        { r:1, c:7,  name:'Tel Aviv', price:'100$', flag:'🇮🇱', color:'#5dade2' },
        { r:1, c:6,  name:'TLV Airport', price:'200$', icon:'✈️', special:true },
        { r:1, c:5,  name:'Earnings Tax', price:'$10', icon:'📝', special:true },
        { r:1, c:4,  name:'Rio', price:'60$', flag:'🇧🇷', color:'#f1c40f' },
        { r:1, c:3,  name:'Treasure', icon:'🎁', special:true },
        { r:1, c:2,  name:'Salvador', price:'60$', flag:'🇧🇷', color:'#f1c40f' },
        { r:1, c:1,  name:'START', icon:'🏁', corner:true, special:true },

        // === LEFT column top→bottom (c1, r2→r10) ===
        { r:2,  c:1, name:'New York', price:'400$', flag:'🇺🇸', color:'#9b59b6' },
        { r:3,  c:1, name:'Premium Tax', price:'$75', icon:'💎', special:true },
        { r:4,  c:1, name:'San Francisco', price:'360$', flag:'🇺🇸', color:'#9b59b6' },
        { r:5,  c:1, name:'Surprise', icon:'❓', special:true },
        { r:6,  c:1, name:'JFK Airport', price:'200$', icon:'✈️', special:true },
        { r:7,  c:1, name:'London', price:'320$', flag:'🇬🇧', color:'#e67e22' },
        { r:8,  c:1, name:'Treasure', icon:'🎁', special:true },
        { r:9,  c:1, name:'Manchester', price:'300$', flag:'🇬🇧', color:'#e67e22' },
        { r:10, c:1, name:'Liverpool', price:'290$', flag:'🇬🇧', color:'#e67e22' }
      ];

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
          else if (tile.icon === '💧' || tile.icon === '⚡') cls += ' tint-company';
          else cls += ' tint-tax';
        }

        // Tag each tile with the board edge it belongs to (corners excluded),
        // so CSS can rotate side tiles and point color strips towards the outside.
        if (!tile.corner) {
          if (tile.c === 1) cls += ' edge-left';
          else if (tile.c === 11) cls += ' edge-right';
          else if (tile.r === 1) cls += ' edge-top';
          else if (tile.r === 11) cls += ' edge-bottom';
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
        if (tile.flag) html += `<div class="rt-flag">${tile.flag}</div>`;
        if (tile.icon !== '❓') html += `<div class="rt-name">${tile.name}</div>`;
        div.innerHTML = html;

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

    function startGame() {
      showToast('جاري بدء اللعبة...');
    }

    syncPlayButton();
    startBackgroundMusic();

    // Deep link straight into a demo lobby via URL hash (e.g. index.html#lobby)
    if (location.hash === '#lobby') {
      const nick = document.getElementById('nicknameInput');
      if (nick && !nick.value.trim()) nick.value = 'زائر';
      syncPlayButton();
      playAsGuest();
    }
