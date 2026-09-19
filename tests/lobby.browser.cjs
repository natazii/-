/* Run after starting the static server: npm run test:ui
   Optional BASE_URL and SCREENSHOT_DIR environment variables. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000';
const shots = process.env.SCREENSHOT_DIR || path.join(__dirname, '..', 'test-results');
fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 780 } });
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base + '/index.html#lobby');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => applyNickname('Rough Rush'));
    const names = await page.locator('.room-setting-name').allTextContents();
    assert.deepEqual(names, [
      'Maximum players', 'Private room', 'Allow bots to join Beta', 'Board map',
      'x2 rent on full-set properties', 'Vacation cash', 'Auction', "Don't collect rent while in prison",
      'Mortgage', 'Even build', 'Starting cash', 'Randomize player order'
    ]);
    assert.equal(await page.locator('.room-settings .room-toggle').count(), 9);
    assert.equal(await page.locator('.room-settings select').count(), 2);
    assert.equal(await page.locator('.room-settings .room-setting-icon use').count(), 12);
    assert.equal(await page.locator('.room-toggle[aria-checked="true"]').count(), 3);
    assert.equal(await page.locator('#setting-startCash').inputValue(), '1500');
    assert.equal(await page.locator('.start-game').isDisabled(), true);
    const sizes = await page.evaluate(() => {
      const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.width, r.height]; };
      return { toggle: rect('.room-toggle'), players: rect('.room-select'), cash: rect('.room-select-cash'), host: rect('.room-player-card'), board: rect('#lobbyBoard') };
    });
    assert.deepEqual(sizes.toggle, [48, 24]);
    assert.deepEqual(sizes.players, [56, 28]);
    assert.deepEqual(sizes.cash, [84, 28]);
    assert.equal(sizes.host[1], 102);
    assert.equal(Math.round(sizes.board[0]), Math.round(sizes.board[1]));
    await page.screenshot({ path: path.join(shots, 'lobby-desktop.png') });
    await page.locator('.lobby-side.right').screenshot({ path: path.join(shots, 'settings-top.png') });

    // Mouse and keyboard state changes, including native switch Space/Enter behavior.
    await page.locator('#setting-vacationCash').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#setting-vacationCash').getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#setting-vacationCash').getAttribute('aria-checked'), 'false');
    await page.locator('#setting-allowBots').click();
    assert.equal(await page.locator('.room-player-row').count(), 4);
    assert.equal(await page.locator('.start-game').isDisabled(), false);
    await page.locator('#setting-maxPlayers').selectOption('6');
    assert.equal(await page.locator('.room-player-row').count(), 6);
    await page.locator('#setting-maxPlayers').selectOption('3');
    assert.equal(await page.locator('.room-player-row').count(), 3);
    await page.getByRole('button', { name: 'Remove Sam', exact: true }).click();
    assert.equal(await page.locator('.room-player-row').count(), 2);
    await page.locator('#setting-doubleRentFullSet').click();
    assert.equal(await page.locator('.room-player-row').count(), 2, 'a gameplay change must not refill removed bots');
    await page.locator('#setting-allowBots').click();
    assert.equal(await page.locator('.room-player-row').count(), 1);
    assert.equal(await page.locator('.start-game').isDisabled(), true);

    // Map selection does not offer unsupported maps. Escape restores focus.
    await page.locator('#changeMapButton').click();
    assert.equal(await page.locator('#boardMapDialog').isVisible(), true);
    assert.equal(await page.locator('#classicMapPreview i').count(), 48);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#boardMapDialog').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'changeMapButton');
    await page.locator('#changeMapButton').click();
    await page.locator('#confirmBoardMap').click();
    assert.equal(await page.locator('#boardMapDialog').isVisible(), false);

    await page.locator('#setting-startCash').selectOption('2000');
    await page.locator('#setting-mortgaging').click();
    await page.reload();
    assert.equal(await page.locator('#setting-startCash').inputValue(), '2000');
    assert.equal(await page.locator('#setting-mortgaging').getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('#setting-allowBots').getAttribute('aria-checked'), 'false');
    console.log('PASS: exact settings/defaults, dimensions, keyboard controls, roster, map dialog, persistence');

    // Verify the values are really passed to a running game, not just styled toggles.
    await page.locator('#setting-randomizeOrder').click(); // use fixed order for this integration check
    await page.locator('#setting-auction').click();
    await page.locator('#setting-allowBots').click();
    await page.locator('.start-game').click();
    const state = await page.evaluate(() => ({ cash: Game.me.cash, settings: Game.state.settings, players: Game.state.players.length }));
    assert.equal(state.cash, 2000);
    assert.equal(state.settings.auction, true);
    assert.equal(state.settings.mortgaging, true);
    assert.equal(state.players, 3);
    assert.equal(await page.locator('.room-settings').isVisible(), false);
    assert.equal(await page.locator('.game-panel').isVisible(), true);

    // Open an auction in the real game and use its bid form.
    await page.evaluate(() => {
      Game.state.phase = 'action'; Game.state.dice = [1, 2];
      Game.state.pendingBuy = BOARD.findIndex(t => t.type === 'city');
      Game.state.pendingBuyPlayer = Game.me.id;
      Game.endTurn();
    });
    assert.equal(await page.locator('.g-auction').isVisible(), true);
    await page.locator('#auctionAmount').fill('500');
    await page.getByRole('button', { name: 'Place bid', exact: true }).click();
    await page.waitForFunction(() => Game.state && Game.state.auction === null);
    assert.equal(await page.evaluate(() => Game.state.players[0].cash), 1500);
    assert.equal(await page.evaluate(() => Game.state.owners[BOARD.findIndex(t => t.type === 'city')]), 0);
    await page.evaluate(() => quitGame());
    assert.equal(await page.locator('.room-settings').isVisible(), true);
    assert.equal(await page.evaluate(() => Game.timers.size), 0);
    console.log('PASS: game integration, real auction bid, turn continuation, safe return to lobby');

    // Match clean defaults in all screenshots; never depend on previous test state.
    await page.evaluate(() => { localStorage.removeItem('richora.room-settings.v1'); });
    await page.reload();
    await page.evaluate(() => applyNickname('Rough Rush'));
    for (const [width, height] of [[1920, 1080], [1600, 780], [1366, 768], [1024, 768], [768, 1024], [390, 844], [320, 740]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.room-settings').evaluate(el => { el.scrollTop = 0; });
      const layout = await page.evaluate(() => {
        const panel = document.querySelector('.room-settings');
        const rows = [...panel.querySelectorAll('.room-setting')];
        const noOverlap = rows.every(row => {
          const copy = row.querySelector('.room-setting-copy').getBoundingClientRect();
          const control = row.lastElementChild.getBoundingClientRect();
          return copy.right <= control.left && copy.width > 0;
        });
        return { documentWidth: document.documentElement.scrollWidth, panelWidth: panel.clientWidth, contentWidth: panel.scrollWidth, noOverlap, hostHeight: document.querySelector('.room-player-card').getBoundingClientRect().height };
      });
      assert.ok(layout.documentWidth <= width, `horizontal page overflow at ${width}`);
      assert.ok(layout.contentWidth <= layout.panelWidth, `horizontal settings overflow at ${width}`);
      assert.ok(layout.noOverlap, `overlapping controls at ${width}`);
      if (width === 1920) assert.equal(layout.hostHeight, 81);
      await page.screenshot({ path: path.join(shots, `lobby-${width}.png`), fullPage: true });
      await page.locator('#setting-randomizeOrder').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#setting-randomizeOrder').isVisible(), true);
      if (width === 1600) await page.locator('.room-settings').screenshot({ path: path.join(shots, 'settings-bottom.png') });
      console.log(`PASS: ${width}×${height}, no overlaps or horizontal overflow, last setting reachable`);
    }
    assert.deepEqual(errors, [], 'No JavaScript page errors');
    console.log('All browser checks passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
