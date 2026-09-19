/* Local-only sidebar UI: expanding chat, notifications, toolbar and copy feedback.
   No ad network, external community URL, or simulated multiplayer service is used. */
const RoomSidebar = (() => {
  const STORAGE_KEY = 'sabotaging.sidebar.v1';
  const prefs = { expanded: false, chatMuted: false, muted: false };
  let bound = false;
  let copyTimer;
  let audioContext;
  let activeTone;
  let lastTone = 0;
  const byId = id => document.getElementById(id);
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (_) {}
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') {
        Object.keys(prefs).forEach(key => {
          if (typeof saved[key] === 'boolean') prefs[key] = saved[key];
        });
      }
    } catch (_) { /* The controls still work without storage. */ }
  }
  function setTool(id, label, pressed, icon) {
    const button = byId(id);
    if (!button) return;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('aria-pressed', String(pressed));
    if (icon) button.querySelector('use')?.setAttribute('href', '#ls-' + icon);
  }
  function render() {
    const stack = byId('lobbyLeftStack');
    if (stack) stack.dataset.chatExpanded = String(prefs.expanded);
    const ad = byId('lobbyAdSlot');
    if (ad) ad.hidden = prefs.expanded;
    setTool('expandChatButton', prefs.expanded ? 'Restore chat size' : 'Expand chat', prefs.expanded, prefs.expanded ? 'restore' : 'expand');
    setTool('chatSoundButton', prefs.chatMuted ? 'Unmute chat notifications' : 'Mute chat notifications', prefs.chatMuted, prefs.chatMuted ? 'muted' : 'volume');
    setTool('lobbySoundButton', prefs.muted ? 'Unmute sound' : 'Mute sound', prefs.muted, prefs.muted ? 'muted' : 'volume');
  }
  function expand(value) { prefs.expanded = !!value; save(); render(); }
  function syncComposer() {
    const button = byId('sendChatButton');
    if (button) button.disabled = !(byId('lobbyChatInput')?.value.trim());
  }
  function setMuted(value) {
    prefs.muted = !!value;
    if (prefs.muted && activeTone) { try { activeTone.stop(); } catch (_) {} }
    save();
    render();
  }
  function setChatMuted(value) {
    prefs.chatMuted = !!value;
    if (prefs.chatMuted && activeTone) { try { activeTone.stop(); } catch (_) {} }
    save();
    render();
  }
  async function notify() {
    // A subtle message sound works without any of the missing MP3 assets.
    // Check again after resuming the audio context in case mute changed meanwhile.
    if (prefs.muted || prefs.chatMuted || Date.now() - lastTone < 150) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      audioContext ||= new AudioContext();
      if (audioContext.state === 'suspended') await audioContext.resume();
      if (prefs.muted || prefs.chatMuted || audioContext.state !== 'running' || Date.now() - lastTone < 150) return;
      lastTone = Date.now();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(.018, now + .006);
      gain.gain.exponentialRampToValueAtTime(.001, now + .075);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      activeTone = oscillator;
      oscillator.onended = () => {
        oscillator.disconnect(); gain.disconnect();
        if (activeTone === oscillator) activeTone = null;
      };
      oscillator.start(now);
      oscillator.stop(now + .085);
    } catch (_) { /* Browser audio policies must never interrupt chat. */ }
  }
  function afterMessage() { syncComposer(); void notify(); }
  function copied(success) {
    clearTimeout(copyTimer);
    const button = byId('copyRoomButton');
    const label = byId('copyRoomLabel');
    if (!button || !label) return;
    button.classList.toggle('is-copied', success);
    label.textContent = success ? 'Copied' : 'Copy';
    button.querySelector('use')?.setAttribute('href', success ? '#rs-check' : '#ls-copy');
    if (success) copyTimer = setTimeout(() => copied(false), 1800);
  }
  function syncFullscreen() {
    setTool('fullscreenButton', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen', !!document.fullscreenElement);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      syncFullscreen();
    } catch (_) {
      showToast('Fullscreen is unavailable here. Try opening the live preview in a new tab.');
    }
  }
  function init() {
    if (!bound) {
      load();
      byId('expandChatButton')?.addEventListener('click', () => expand(!prefs.expanded));
      byId('dismissAdButton')?.addEventListener('click', () => {
        expand(true);
        byId('expandChatButton')?.focus();
      });
      byId('chatSoundButton')?.addEventListener('click', () => setChatMuted(!prefs.chatMuted));
      byId('lobbyChatInput')?.addEventListener('input', syncComposer);
      byId('fullscreenButton')?.addEventListener('click', toggleFullscreen);
      document.addEventListener('fullscreenchange', syncFullscreen);
      document.querySelectorAll('[data-sidebar-dialog]').forEach(button => {
        button.addEventListener('click', () => byId(button.dataset.sidebarDialog)?.showModal());
      });
      document.querySelectorAll('.sidebar-dialog').forEach(dialog => {
        dialog.addEventListener('click', event => {
          const r = dialog.getBoundingClientRect();
          if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
        });
      });
      bound = true;
    }
    render(); syncComposer(); syncFullscreen();
  }
  return {
    init, expand, setMuted, copied, syncComposer, afterMessage,
    isMuted: () => prefs.muted,
    emptyMarkup: () => '<div class="lobby-chat-empty" id="chatEmpty"><svg class="sidebar-icon" aria-hidden="true" focusable="false"><use href="#ls-message"></use></svg><span>No messages yet</span></div>'
  };
})();
