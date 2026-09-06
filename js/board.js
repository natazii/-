/* =========================================================================
   board.js — الـ48 خانة بترتيب المسار الحقيقي (index 0 = START)
   المسار: START (فوق-يسار) → يمين على الصف العلوي → نزول العمود اليمين
           → يسار على الصف السفلي → طلوع العمود الأيسر → رجوع لـ START
   ========================================================================= */

// تكلفة البيت الواحد حسب المجموعة
const GROUP_HOUSE_COST = {
  TN: 50, IQ: 50, EG: 50, PS: 100, MA: 100, KW: 100, BH: 100, QA: 100,
  JO: 150, SY: 150, AE: 150, GB: 200, SA: 200
};

// ألوان المجموعات
const GROUP_COLOR = {
  TN: '#e74c3c', IQ: '#ce1126', PS: 'rgba(255,255,255,.82)', MA: '#c1272d',
  KW: '#ffffff', EG: '#ce1126', BH: '#ce1126', QA: '#8a1538', JO: '#e74c3c', SY: '#007a3d',
  AE: '#d94f70', GB: '#c9a227', SA: '#0a5c36'
};

const FLAG_OF = {
  TN: '🇹🇳', IQ: '🇮🇶', EG: '🇪🇬', PS: '🇵🇸', MA: '🇲🇦', KW: '🇰🇼', BH: '🇧🇭', QA: '🇶🇦',
  JO: '🇯🇴', SY: '🇸🇾', AE: '🇦🇪', GB: '🇬🇧', SA: '🇸🇦'
};

// Human-readable country names used by the land info panel and chat commands.
const COUNTRY_NAME = {
  TN: 'Tunisia',
  IQ: 'Iraq',
  EG: 'Egypt',
  PS: 'Palestine',
  MA: 'Morocco',
  KW: 'Kuwait',
  BH: 'Bahrain',
  QA: 'Qatar',
  JO: 'Jordan',
  SY: 'Syria',
  AE: 'United Arab Emirates',
  GB: 'United Kingdom',
  SA: 'Saudi Arabia'
};

const COUNTRY_ALIASES = {
  tunisia: 'TN', tunisian: 'TN',
  iraq: 'IQ', iraqi: 'IQ', baghdad: 'IQ', basra: 'IQ', mosul: 'IQ',
  egypt: 'EG', egyptian: 'EG',
  palestine: 'PS', palestinian: 'PS',
  morocco: 'MA', moroccan: 'MA',
  kuwait: 'KW', kuwaiti: 'KW',
  bahrain: 'BH', bahraini: 'BH',
  qatar: 'QA', qatari: 'QA',
  jordan: 'JO', jordanian: 'JO',
  syria: 'SY', syrian: 'SY',
  uae: 'AE', 'united arab emirates': 'AE', emirates: 'AE',
  uk: 'GB', britain: 'GB', 'united kingdom': 'GB', england: 'GB',
  saudi: 'SA', 'saudi arabia': 'SA'
};


/** مدينة: الإيجار = [أساسي, بيت1, بيت2, بيت3, بيت4, فندق] */
function city(r, c, name, cost, group) {
  const b = Math.round(cost / 10);
  return {
    type: 'city', r, c, name, cost,
    price: cost + '$',
    group,
    country: COUNTRY_NAME[group] || group,
    flag: FLAG_OF[group],
    color: GROUP_COLOR[group],
    houseCost: GROUP_HOUSE_COST[group],
    rent: [b, b * 5, b * 15, b * 45, b * 70, b * 90]
  };
}

const airport = (r, c, name) =>
  ({ type: 'airport', r, c, name, cost: 200, price: '200$', icon: '✈️', special: true });

const company = (r, c, name, icon) =>
  ({ type: 'company', r, c, name, cost: 150, price: '150$', icon, special: true });

const deathValley = (r, c) =>
  ({ type: 'deathvalley', r, c, name: 'Death Valley', icon: '💀', special: true });

const BOARD = [
  /* ===== 0 — الزاوية: البداية ===== */
  { type: 'start', r: 1, c: 1, name: 'START', icon: '🏁', corner: true, special: true },

  /* ===== الصف العلوي: من اليسار لليمين (c2 → c12) ===== */
  city(1, 2, 'Sfax', 60, 'TN'),
  { type: 'treasure', r: 1, c: 3, name: 'Treasure', icon: '🎁', special: true },
  city(1, 4, 'Tunis', 60, 'TN'),
  { type: 'tax', r: 1, c: 5, name: 'Earnings Tax', icon: '📝', special: true, price: '%10', taxPercent: 10 },
  city(1, 6, 'Cairo', 100, 'EG'),
  airport(1, 7, 'IST Airport'),
  city(1, 8, 'Alexandria', 100, 'EG'),
  city(1, 9, 'Giza', 110, 'EG'),
  deathValley(1, 10),
  city(1, 11, 'Halhul', 120, 'PS'),
  city(1, 12, 'Jerusalem', 130, 'PS'),

  /* ===== 12 — الزاوية: السجن (زيارة فقط) ===== */
  { type: 'jail', r: 1, c: 13, name: 'In Prison', icon: '🔒', corner: true, special: true },

  /* ===== العمود اليمين: من فوق لتحت (r2 → r12) ===== */
  city(2, 13, 'Tangier', 140, 'MA'),
  city(3, 13, 'Fes', 140, 'MA'),
  company(4, 13, 'Power Company', '⚡'),
  city(5, 13, 'Agadir', 160, 'MA'),
  city(6, 13, 'Rabat', 160, 'MA'),
  airport(7, 13, 'MUC Airport'),
  city(8, 13, 'Hawalli', 180, 'KW'),
  { type: 'surprise', r: 9, c: 13, name: 'Surprise', icon: '❓', special: true },
  city(10, 13, 'Bahrain', 180, 'BH'),
  company(11, 13, 'Gas Company', '🔥'),
  city(12, 13, 'Doha', 200, 'QA'),

  /* ===== 24 — الزاوية: الإجازة ===== */
  { type: 'vacation', r: 13, c: 13, name: 'Vacation', icon: '🏝️', corner: true, special: true },

  /* ===== الصف السفلي: من اليمين لليسار (c12 → c2) ===== */
  city(13, 12, 'Aleppo', 260, 'SY'),
  city(13, 11, 'Damascus', 260, 'SY'),
  city(13, 10, 'Amman', 220, 'JO'),
  city(13, 9, 'Aqaba', 220, 'JO'),
  { type: 'tax', r: 13, c: 8, name: 'Earnings Tax', icon: '📝', special: true, price: '%10', taxPercent: 10 },
  airport(13, 7, 'DAM Airport'),
  { type: 'treasure', r: 13, c: 6, name: 'Treasure', icon: '🎁', special: true },
  company(13, 5, 'Water Company', '💧'),
  deathValley(13, 4),
  city(13, 3, 'Dubai', 280, 'AE'),
  city(13, 2, 'Sharjah', 280, 'AE'),

  /* ===== 36 — الزاوية: روح للسجن ===== */
  { type: 'gotojail', r: 13, c: 1, name: 'Go to prison', icon: '☠️', corner: true, special: true },

  /* ===== العمود الأيسر: من تحت لفوق (r12 → r2) ===== */
  city(12, 1, 'Baghdad', 300, 'IQ'),
  city(11, 1, 'Basra', 300, 'IQ'),
  { type: 'surprise', r: 10, c: 1, name: 'Surprise', icon: '❓', special: true },
  city(9, 1, 'Mosul', 320, 'IQ'),
  city(8, 1, 'Kuwait', 320, 'KW'),
  airport(7, 1, 'RUH Airport'),
  city(6, 1, 'Dammam', 360, 'SA'),
  deathValley(5, 1),
  city(4, 1, 'Jeddah', 360, 'SA'),
  { type: 'tax', r: 3, c: 1, name: 'Premium Tax', icon: '💎', special: true, price: '$75', taxFlat: 75 },
  city(2, 1, 'Riyadh', 400, 'SA')
];

// فهارس مفيدة
const IDX_START = 0;
const IDX_JAIL = 12;
const IDX_VACATION = 24;
const IDX_GOTOJAIL = 36;

const AIRPORT_IDS = BOARD.map((t, i) => (t.type === 'airport' ? i : -1)).filter(i => i >= 0);
const COMPANY_IDS = BOARD.map((t, i) => (t.type === 'company' ? i : -1)).filter(i => i >= 0);

/** كل فهارس المدن ديال نفس المجموعة */
function groupTiles(group) {
  return BOARD.map((t, i) => (t.group === group ? i : -1)).filter(i => i >= 0);
}
