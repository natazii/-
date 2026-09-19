const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function setup(saved) {
  const storage = new Map();
  const timers = new Map();
  let timerId = 0;
  if (saved !== undefined) storage.set('richora.room-settings.v1', saved);
  const context = vm.createContext({
    console,
    setTimeout: cb => { const id = ++timerId; timers.set(id, cb); return id; },
    clearTimeout: id => timers.delete(id),
    document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    GameUI: new Proxy({}, { get: () => () => {} })
  });
  for (const name of ['board', 'cards', 'room-settings', 'engine', 'auction']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'), context, { filename: name + '.js' });
  }
  const api = vm.runInContext('({ Game, Bot, BOARD, RoomSettings, groupTiles, IDX_VACATION, AIRPORT_IDS, COMPANY_IDS })', context);
  api.RoomSettings.init();
  const players = [
    { name: 'Host', color: '#bada55', host: true },
    { name: 'Guest', color: '#f5b942' }
  ];
  const init = (settings = {}, roster = players) => {
    api.Game.init(roster, { ...api.RoomSettings.gameSettings(), randomizeOrder: false, ...settings });
    api.Game.state.dice = [1, 2];
    return api.Game.state;
  };
  const ownSet = (owner = 0) => {
    const idx = api.BOARD.findIndex(t => t.type === 'city');
    const ids = api.groupTiles(api.BOARD[idx].group);
    ids.forEach(i => { api.Game.state.owners[i] = owner; });
    return ids;
  };
  return { ...api, context, timers, storage, init, ownSet };
}
const plain = v => JSON.parse(JSON.stringify(v));

test('reference defaults, exactly twelve settings', () => {
  const { RoomSettings: rs } = setup();
  assert.deepEqual(plain(rs.snapshot()), {
    maxPlayers: 4, privateRoom: true, allowBots: false, boardMap: 'classic',
    doubleRentFullSet: false, vacationCash: false, auction: false, noRentInPrison: false,
    mortgaging: false, evenBuilding: true, startCash: 1500, randomizeOrder: true
  });
});
test('malformed storage falls back safely; invalid and removed settings are ignored', () => {
  assert.equal(setup('{bad json').RoomSettings.get('startCash'), 1500);
  const { RoomSettings: rs } = setup(JSON.stringify({ maxPlayers: 99, auction: 'true', startCash: -2, turnTimer: 30, vacationCash: true }));
  assert.equal(rs.get('maxPlayers'), 4);
  assert.equal(rs.get('auction'), false);
  assert.equal(rs.get('startCash'), 1500);
  assert.equal(rs.get('turnTimer'), undefined);
  assert.equal(rs.get('vacationCash'), true);
});
test('settings persist and snapshots are isolated', () => {
  const { RoomSettings: rs, storage } = setup();
  assert.equal(rs.set('startCash', 2000), true);
  assert.equal(rs.set('maxPlayers', 3), true);
  assert.equal(rs.set('allowBots', 'true'), false);
  assert.equal(rs.set('boardMap', 'unavailable'), false);
  const copy = rs.snapshot(); copy.startCash = 9000;
  assert.equal(rs.get('startCash'), 2000);
  assert.equal(JSON.parse(storage.get('richora.room-settings.v1')).maxPlayers, 3);
});
test('starting cash applies to everyone; the engine keeps its own settings copy', () => {
  const { Game: g, init } = setup();
  const input = { startCash: 2000 };
  const s = init(input);
  assert.deepEqual(plain(s.players.map(p => p.cash)), [2000, 2000]);
  input.startCash = 100;
  assert.equal(g.state.settings.startCash, 2000);
  assert.equal(s.players[0].host, true);
});
test('randomized order uses a shuffled copy and preserves host identity', () => {
  const { Game: g, init, context } = setup();
  const roster = [{ name: 'A', host: true }, { name: 'B' }, { name: 'C' }];
  vm.runInContext('Math.random = () => 0', context);
  init({ randomizeOrder: true }, roster);
  assert.deepEqual(plain(g.state.players.map(p => p.name)), ['B', 'C', 'A']);
  assert.equal(g.state.players[2].host, true);
  assert.deepEqual(roster.map(p => p.name), ['A', 'B', 'C']);
  init({ randomizeOrder: false }, roster);
  assert.deepEqual(plain(g.state.players.map(p => p.name)), ['A', 'B', 'C']);
});
test('full-set rent doubles only the base rent of an unbuilt city', () => {
  const { Game: g, BOARD, init, ownSet } = setup(); init();
  const [i] = ownSet();
  assert.equal(g.rentOf(i), BOARD[i].rent[0]);
  g.state.settings.doubleRentFullSet = true;
  assert.equal(g.rentOf(i), BOARD[i].rent[0] * 2);
  g.state.houses[i] = 1;
  assert.equal(g.rentOf(i), BOARD[i].rent[1]);
});
test('prison rule suppresses rent for cities, airports and companies', () => {
  const { Game: g, BOARD, AIRPORT_IDS, COMPANY_IDS, init } = setup();
  const s = init({ noRentInPrison: true });
  const ids = [BOARD.findIndex(t => t.type === 'city'), AIRPORT_IDS[0], COMPANY_IDS[0]];
  s.players[1].jail = 1;
  for (const i of ids) {
    s.owners[i] = 1;
    assert.equal(g.rentOf(i), 0);
    s.settings.noRentInPrison = false;
    assert.ok(g.rentOf(i) > 0);
    s.settings.noRentInPrison = true;
  }
});
test('prison rule actually prevents transfer and does not consume a Death Valley curse', async () => {
  const { Game: g, BOARD, init } = setup();
  const s = init({ noRentInPrison: true });
  const i = BOARD.findIndex(t => t.type === 'city');
  s.owners[i] = 1; s.players[1].jail = 1; s.players[0].pos = i; s.players[0].deathMultiplier = 4;
  await g.resolveTile(s.players[0]);
  assert.equal(s.players[0].cash, 1500);
  assert.equal(s.players[1].cash, 1500);
  assert.equal(s.players[0].deathMultiplier, 4);
  s.settings.noRentInPrison = false;
  await g.resolveTile(s.players[0]);
  assert.equal(s.players[0].cash, 1500 - BOARD[i].rent[0] * 4);
});
test('mortgage pays 50%, suppresses rent, and can be redeemed; disabled mode keeps bank selling', () => {
  const { Game: g, BOARD, init, ownSet } = setup(); init();
  const [i] = ownSet();
  assert.equal(g.canMortgage(i), false);
  assert.equal(g.canSellLand(i), true);
  g.state.settings.mortgaging = true;
  assert.equal(g.canSellLand(i), false);
  g.toggleMortgage(i);
  assert.equal(g.me.cash, 1500 + Math.round(BOARD[i].cost / 2));
  assert.equal(g.rentOf(i), 0);
  g.toggleMortgage(i);
  assert.equal(g.state.mortgaged[i], undefined);
  assert.equal(g.me.cash, 1500 + Math.round(BOARD[i].cost / 2) - Math.round(BOARD[i].cost * .55));
});
test('Even build controls both building and selling order', () => {
  const { Game: g, init, ownSet } = setup(); init();
  const [a, b] = ownSet();
  g.state.houses[a] = 1;
  assert.equal(g.canBuild(a), false);
  assert.equal(g.canBuild(b), true);
  g.state.settings.evenBuilding = false;
  assert.equal(g.canBuild(a), true);
  g.state.houses[b] = 2;
  g.state.settings.evenBuilding = true;
  assert.equal(g.canSellHouse(a), false);
  assert.equal(g.canSellHouse(b), true);
  g.state.settings.evenBuilding = false;
  assert.equal(g.canSellHouse(a), true);
});
test('vacation pot includes tax and bail, pays once when enabled', async () => {
  const { Game: g, BOARD, IDX_VACATION, init } = setup();
  const s = init({ vacationCash: true });
  const p = s.players[0];
  const i = BOARD.findIndex(t => t.type === 'tax' && t.taxFlat);
  p.pos = i; await g.resolveTile(p);
  p.jail = 1; g.jailPay();
  const pot = BOARD[i].taxFlat + 50;
  assert.equal(s.vacationPot, pot);
  p.pos = IDX_VACATION; await g.resolveTile(p);
  assert.equal(p.cash, 1500);
  assert.equal(s.vacationPot, 0);
  await g.resolveTile(p);
  assert.equal(p.cash, 1500);
  s.settings.vacationCash = false; s.vacationPot = 100;
  await g.resolveTile(p);
  assert.equal(p.cash, 1500);
});

function purchaseOpportunity(x, auction = true) {
  const s = x.init({ auction });
  const i = x.BOARD.findIndex(t => t.type === 'city');
  s.phase = 'action'; s.pendingBuy = i; s.pendingBuyPlayer = 0;
  return { s, i };
}
test('disabled Auction skips the sale and clears the pending purchase', () => {
  const x = setup(); const { s, i } = purchaseOpportunity(x, false);
  x.Game.endTurn();
  assert.equal(s.auction, null); assert.equal(s.owners[i], undefined);
  assert.equal(s.pendingBuy, undefined); assert.equal(s.turn, 1);
});
test('auction sells to the highest bidder and charges only the winning amount', () => {
  const x = setup(); const { s, i } = purchaseOpportunity(x);
  x.Game.endTurn(); assert.equal(s.phase, 'auction'); assert.equal(s.auction.bidderId, 0);
  x.Game.placeAuctionBid(10); x.Game.placeAuctionBid(20); x.Game.passAuction();
  assert.equal(s.owners[i], 1); assert.equal(s.players[1].cash, 1480); assert.equal(s.players[0].cash, 1500);
  assert.equal(s.auction, null); assert.equal(s.turn, 1); assert.equal(s.phase, 'roll');
});
test('auction rejects invalid, fractional, too-small and unaffordable bids', () => {
  const x = setup(); purchaseOpportunity(x); x.Game.endTurn();
  for (const value of [0, -5, 'NaN', Infinity, 10.5, 1501]) assert.equal(x.Game.placeAuctionBid(value), false);
  assert.equal(x.Game.state.auction.highBid, 0);
  assert.equal(x.Game.placeAuctionBid('10'), true);
  assert.equal(x.Game.placeAuctionBid(15), false);
  assert.equal(x.Game.state.auction.highBid, 10);
});
test('everyone passing leaves the property unsold and continues the game', () => {
  const x = setup(); const { s, i } = purchaseOpportunity(x);
  x.Game.endTurn(); x.Game.passAuction(); x.Game.passAuction();
  assert.equal(s.owners[i], undefined); assert.equal(s.auction, null); assert.equal(s.turn, 1);
});
test('unaffordable unowned property can still go to auction', async () => {
  const x = setup(); const { s, i } = purchaseOpportunity(x);
  s.players[0].cash = 15; s.players[0].pos = i;
  await x.Game.resolveTile(s.players[0]);
  assert.equal(s.pendingBuy, i);
  x.Game.endTurn(); assert.equal(s.phase, 'auction');
  assert.equal(x.Game.placeAuctionBid(10), true);
});
test('bot declining a purchase enters the same auction flow', () => {
  const x = setup(); const { s } = purchaseOpportunity(x);
  s.players[0].isBot = true; s.players[0].cash = 260;
  x.Bot.afterRoll();
  assert.equal(s.phase, 'auction'); assert.ok(x.timers.size > 0);
  const [id, callback] = x.timers.entries().next().value;
  x.timers.delete(id); callback();
  assert.equal(s.auction.highBid, 10); assert.equal(s.auction.bidderId, 1);
});
test('an auction does not consume the original player’s double', () => {
  const x = setup(); const { s } = purchaseOpportunity(x);
  s.dice = [3, 3]; x.Game.endTurn(); x.Game.placeAuctionBid(10); x.Game.passAuction();
  assert.equal(s.turn, 0); assert.equal(s.phase, 'roll'); assert.equal(x.timers.size, 1);
});
test('game commands cannot change auction ownership or cash mid-bid', () => {
  const x = setup(); purchaseOpportunity(x); x.Game.endTurn();
  assert.equal(x.Game.executeCommand('/eco give Host 1000').ok, false);
  assert.equal(x.Game.me.cash, 1500);
});
test('reset cancels all scheduled bot and auction callbacks', () => {
  const x = setup(); const { s } = purchaseOpportunity(x);
  s.players[0].isBot = true; x.Game.endTurn(); assert.ok(x.timers.size > 0);
  x.Game.reset(); assert.equal(x.timers.size, 0); assert.equal(x.Game.state, null);
});
