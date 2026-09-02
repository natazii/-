/* =========================================================================
   cards.js — رزم البطاقات (Treasure / Surprise)
   نصوص البطاقات مأخوذة من الفيديو + إضافات على نفس الأسلوب.
   كل بطاقة: { text, kind, ...effect }
   kind: money | move | jail | pardon | payEach | collectEach | repairs
   ========================================================================= */

const TREASURE_CARDS = [
  { text: 'From trading stocks you earned $50.', kind: 'money', amount: 50 },
  { text: 'Happy holidays! Receive $20.', kind: 'money', amount: 20 },
  { text: 'Your car has run out of gas. Pay $50.', kind: 'money', amount: -50 },
  { text: 'You received a Pardon card. Keep it until you need it.', kind: 'pardon' },
  { text: 'Bank pays you a dividend of $100.', kind: 'money', amount: 100 },
  { text: 'Doctor fees. Pay $80.', kind: 'money', amount: -80 },
  { text: 'You won second prize in a beauty contest. Collect $30.', kind: 'money', amount: 30 },
  { text: 'Income tax refund. Collect $40.', kind: 'money', amount: 40 },
  { text: 'School fees. Pay $60.', kind: 'money', amount: -60 },
  { text: 'It is your birthday! Collect $20 from every player.', kind: 'collectEach', amount: 20 },
  { text: 'Hotel maintenance. Pay $40 per house and $150 per hotel.', kind: 'repairs', perHouse: 40, perHotel: 150 },
  { text: 'Advance to START and collect $200.', kind: 'move', to: IDX_START }
];

const SURPRISE_CARDS = [
  { text: 'Go to prison. Do not pass START.', kind: 'jail' },
  { text: 'Advance to the next company.', kind: 'move', nearest: 'company' },
  { text: 'Advance to the next airport.', kind: 'move', nearest: 'airport' },
  { text: 'Advance to Amman.', kind: 'move', to: BOARD.findIndex(t => t.name === 'Amman') },
  { text: 'Advance to Cairo.', kind: 'move', to: BOARD.findIndex(t => t.name === 'Cairo') },
  { text: 'Take a vacation. Move to the Vacation corner.', kind: 'move', to: IDX_VACATION, noPass: true },
  { text: 'Go back three spaces.', kind: 'move', back: 3 },
  { text: 'You received a Pardon card. Keep it until you need it.', kind: 'pardon' },
  { text: 'Speeding fine. Pay $15.', kind: 'money', amount: -15 },
  { text: 'Pay each player $50 for the party you missed.', kind: 'payEach', amount: 50 },
  { text: 'Your building loan matures. Collect $150.', kind: 'money', amount: 150 },
  { text: 'Advance to START and collect $200.', kind: 'move', to: IDX_START }
];

/** خلط الرزمة (Fisher-Yates) */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** رزمة كتخلط راسها أوتوماتيكياً ملي تسالي */
function makeDeck(cards) {
  let pile = shuffle(cards);
  return {
    draw() {
      if (!pile.length) pile = shuffle(cards);
      return pile.pop();
    }
  };
}
