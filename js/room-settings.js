/* Single source of truth for the replacement lobby controls.
   These are local preferences, not a network room service. The engine receives a
   separate snapshot at game start, so changing the lobby never changes a live game. */
const RoomSettings = (() => {
  const STORAGE_KEY = 'richora.room-settings.v1';
  const defaults = Object.freeze({
    maxPlayers: 4,
    privateRoom: true,
    allowBots: false,
    boardMap: 'classic',
    doubleRentFullSet: false,
    vacationCash: false,
    auction: false,
    noRentInPrison: false,
    mortgaging: false,
    evenBuilding: true,
    startCash: 1500,
    randomizeOrder: true
  });
  const choices = {
    maxPlayers: [2, 3, 4, 5, 6, 7, 8],
    startCash: [500, 1000, 1500, 2000, 3000, 5000],
    boardMap: ['classic']
  };
  let values = { ...defaults };
  let changeHandler = null;
  let bound = false;

  function valid(key, value) {
    if (!Object.hasOwn(defaults, key)) return false;
    return choices[key] ? choices[key].includes(value) : typeof value === 'boolean';
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        Object.keys(defaults).forEach(key => {
          if (valid(key, saved[key])) values[key] = saved[key];
        });
      }
    } catch (_) { /* Blocked storage or an old malformed value: use reference defaults. */ }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); }
    catch (_) { /* Settings still work in memory when browser storage is unavailable. */ }
  }
  function render() {
    document.querySelectorAll('[data-room-setting]').forEach(control => {
      const value = values[control.dataset.roomSetting];
      if (control.matches('select')) control.value = String(value);
      else {
        control.classList.toggle('on', value === true);
        control.setAttribute('aria-checked', String(value === true));
      }
    });
    const lobby = document.getElementById('lobbyScreen');
    if (lobby) lobby.dataset.privateRoom = String(values.privateRoom);
  }
  function set(key, value) {
    if (!valid(key, value)) return false;
    // Controls belong to the host's lobby, not an in-progress match.
    if (document.getElementById('lobbyScreen')?.classList.contains('playing')) return false;
    if (values[key] === value) return true;
    values[key] = value;
    save();
    render();
    if (changeHandler) changeHandler(key, value);
    return true;
  }
  function bindMapDialog() {
    const dialog = document.getElementById('boardMapDialog');
    const preview = document.getElementById('classicMapPreview');
    const open = document.getElementById('changeMapButton');
    if (!dialog || !open) return;
    if (preview && typeof BOARD !== 'undefined') {
      BOARD.forEach(tile => {
        const cell = document.createElement('i');
        cell.style.gridRow = tile.r;
        cell.style.gridColumn = tile.c;
        if (tile.color) cell.style.setProperty('--map-color', tile.color);
        preview.appendChild(cell);
      });
      const count = BOARD.filter(tile => ['city', 'airport', 'company'].includes(tile.type)).length;
      document.getElementById('classicMapSummary').textContent = `${BOARD.length} tiles · ${count} properties`;
    }
    open.addEventListener('click', () => dialog.showModal());
    const confirm = () => { set('boardMap', 'classic'); dialog.close(); };
    document.getElementById('confirmBoardMap').addEventListener('click', confirm);
    document.getElementById('classicMapOption').addEventListener('click', confirm);
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
  }
  function init(onChange) {
    changeHandler = onChange;
    if (!bound) {
      load();
      document.querySelectorAll('[data-room-setting]').forEach(control => {
        const key = control.dataset.roomSetting;
        if (control.matches('select')) {
          control.addEventListener('change', () => set(key, Number(control.value)));
        } else {
          control.addEventListener('click', () => set(key, !values[key]));
        }
      });
      bindMapDialog();
      bound = true;
    }
    render();
  }
  return {
    defaults,
    init,
    set,
    get: key => values[key],
    snapshot: () => ({ ...values }),
    gameSettings: () => ({ ...values, startBonus: 200, jailFee: 50 })
  };
})();
