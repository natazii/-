/* =========================================================================
   board.js — الـ48 خانة بترتيب المسار الحقيقي (index 0 = START)
   المسار: START (فوق-يسار) → يمين على الصف العلوي → نزول العمود اليمين
           → يسار على الصف السفلي → طلوع العمود الأيسر → رجوع لـ START
   ========================================================================= */

// تكلفة البيت الواحد حسب المجموعة
const GROUP_HOUSE_COST = {
  TN: 50, EG: 50, PS: 100, MA: 100, DE: 100,
  CN: 150, SY: 150, AE: 150, GB: 200, SA: 200
};

// ألوان المجموعات
const GROUP_COLOR = {
  TN: '#e74c3c', EG: '#fdf3ae', PS: 'rgba(255,255,255,.82)', MA: '#c1272d', DE: '#d4af37',
  CN: '#e74c3c', SY: '#007a3d', AE: '#d94f70', GB: '#c9a227', SA: '#0a5c36'
};

const FLAG_OF = {
  TN: '🇹🇳', EG: '🇪🇬', PS: '🇵🇸', MA: '🇲🇦', DE: '🇩🇪',
  CN: '🇨🇳', SY: '🇸🇾', AE: '🇦🇪', GB: '🇬🇧', SA: '🇸🇦'
};

/** مدينة: الإيجار = [أساسي, بيت1, بيت2, بيت3, بيت4, فندق] */
function city(r, c, name, cost, group) {
  const b = Math.round(cost / 10);
  return {
    type: 'city', r, c, name, cost,
    price: cost + '$',
    group,
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

const BOARD = [
  /* ===== 0 — الزاوية: البداية ===== */
  { type: 'start', r: 1, c: 1, name: 'START', icon: '🏁', corner: true, special: true },

  /* ===== الصف العلوي: من اليسار لليمين (c2 → c12) ===== */
  city(1, 2, 'Sfax', 60, 'TN'),
  { type: 'treasure', r: 1, c: 3, name: 'Treasure', icon: '🎁', special: true },
  city(1, 4, 'Tunis', 60, 'TN'),
  { type: 'tax', r: 1, c: 5, name: 'Earnings Tax', icon: '📝', special: true, price: '%10', taxPercent: 10 },
  city(1, 6, 'Alexandria', 100, 'EG'),
  airport(1, 7, 'CAI Airport'),
  city(1, 8, 'Giza', 100, 'EG'),
  city(1, 9, 'Cairo', 110, 'EG'),
  { type: 'surprise', r: 1, c: 10, name: 'Surprise', icon: '❓', special: true },
  city(1, 11, 'Gaza', 120, 'PS'),
  city(1, 12, 'Jerusalem', 130, 'PS'),

  /* ===== 12 — الزاوية: السجن (زيارة فقط) ===== */
  { type: 'jail', r: 1, c: 13, name: 'In Prison', icon: '🔒', corner: true, special: true },

  /* ===== العمود اليمين: من فوق لتحت (r2 → r12) ===== */
  city(2, 13, 'Tangier', 140, 'MA'),
  city(3, 13, 'Fes', 140, 'MA'),
  company(4, 13, 'Power Company', '⚡'),
  city(5, 13, 'Marrakech', 160, 'MA'),
  city(6, 13, 'Casablanca', 160, 'MA'),
  airport(7, 13, 'MUC Airport'),
  { ...city(8, 13, 'Kuwait City', 180, 'DE'), flag: '🇰🇼' },
  { type: 'treasure', r: 9, c: 13, name: 'Treasure', icon: '🎁', special: true },
  { ...city(10, 13, 'Manama', 180, 'DE'), flag: '🇧🇭' },
  company(11, 13, 'Gas Company', '🔥'),
  { ...city(12, 13, 'Doha', 200, 'DE'), flag: '🇶🇦' },

  /* ===== 24 — الزاوية: الإجازة ===== */
  { type: 'vacation', r: 13, c: 13, name: 'Vacation', icon: '🏝️', corner: true, special: true },

  /* ===== الصف السفلي: من اليمين لليسار (c12 → c2) ===== */
  city(13, 12, 'Shenzhen', 220, 'CN'),
  { type: 'surprise', r: 13, c: 11, name: 'Surprise', icon: '❓', special: true },
  city(13, 10, 'Beijing', 220, 'CN'),
  { type: 'treasure', r: 13, c: 9, name: 'Treasure', icon: '🎁', special: true },
  city(13, 8, 'Shanghai', 240, 'CN'),
  airport(13, 7, 'DAM Airport'),
  city(13, 6, 'Aleppo', 260, 'SY'),
  city(13, 5, 'Damascus', 260, 'SY'),
  company(13, 4, 'Water Company', '💧'),
  city(13, 3, 'Dubai', 280, 'AE'),
  city(13, 2, 'Abu Dhabi', 280, 'AE'),

  /* ===== 36 — الزاوية: روح للسجن ===== */
  { type: 'gotojail', r: 13, c: 1, name: 'Go to prison', icon: '☠️', corner: true, special: true },

  /* ===== العمود الأيسر: من تحت لفوق (r12 → r2) ===== */
  city(12, 1, 'Liverpool', 300, 'GB'),
  city(11, 1, 'Manchester', 300, 'GB'),
  { type: 'treasure', r: 10, c: 1, name: 'Treasure', icon: '🎁', special: true },
  city(9, 1, 'Birmingham', 320, 'GB'),
  city(8, 1, 'London', 320, 'GB'),
  airport(7, 1, 'RUH Airport'),
  city(6, 1, 'Dammam', 360, 'SA'),
  { type: 'surprise', r: 5, c: 1, name: 'Surprise', icon: '❓', special: true },
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
