/* Left sidebar regression checks. Start scripts/serve.py first.
   BASE_URL and SCREENSHOT_DIR can be supplied by CI. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000';
const shots = path.join(process.env.SCREENSHOT_DIR || path.join(__dirname, '..', 'test-results'), 'sidebar');
fs.mkdirSync(shots, { recursive: true });
const near = (a, b) => assert.ok(Math.abs(a - b) < .03, `${a} should be ${b}`);

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 778 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const rect = selector => page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
  });
  try {
    await page.goto(base + '/index.html#lobby');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => applyNickname('Rough Rush'));
    assert.equal(await page.title(), 'Ma7fofa edited by Raed — Board game');
    assert.equal((await page.locator('.lobby-brand').innerText()).replace(/\s+/g, ' ').trim(), 'Ma7fofa edited by Raed');
    assert.equal((await page.locator('.logo-title').textContent()).replace(/\s+/g, ' ').trim(), 'Ma7fofa edited by Raed');
    assert.equal(await page.evaluate(() => document.body.innerText.includes('تخريب العلاقات')), false);
    const header = await rect('.lobby-tools');
    const share = await rect('.lobby-share');
    const chat = await rect('.lobby-chat');
    const boardBefore = await rect('#lobbyBoard');
    const settingsBefore = await rect('.room-settings');
    near(header.height, 32); near(header.width, 395.5);
    near(share.height, 101.4); near(share.y, header.bottom + 16);
    near(chat.height, 316); near(chat.y, 446); near(chat.bottom, 778 - 16);
    near((await rect('#roomUrlInput')).height, 36);
    near((await rect('.lobby-copy')).width, 78);
    near((await rect('.lobby-chat-form')).height, 73);
    near((await rect('#lobbyChatInput')).height, 40);
    near((await rect('#sendChatButton')).width, 40);
    assert.equal(await page.locator('.lobby-utilities button').count(), 4);
    assert.equal(await page.locator('.lobby-chat-tools button').count(), 2);
    assert.equal(await page.locator('#lobbyAdSlot').isVisible(), true);
    await page.screenshot({ path: path.join(shots, 'lobby-default.png') });
    await page.locator('.lobby-side.left').screenshot({ path: path.join(shots, 'chat-compact.png') });
    console.log('PASS: renamed wordmarks, toolbar/share/chat dimensions, default bottom alignment');

    // Copy the real room URL, with accurate feedback and a real failure path.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copied = text; } } }));
    await page.getByRole('button', { name: 'Copy room link', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('copyRoomLabel').textContent === 'Copied');
    assert.equal(await page.evaluate(() => window.__copied), await page.locator('#roomUrlInput').inputValue());
    assert.ok((await page.locator('#roomUrlInput').inputValue()).startsWith(base + '/room/'));
    await page.waitForFunction(() => document.getElementById('copyRoomLabel').textContent === 'Copy');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } });
      document.execCommand = () => false;
    });
    assert.equal(await page.evaluate(() => copyLobbyRoom()), false);
    assert.ok((await page.locator('#toast').innerText()).includes('Could not copy automatically'));
    const selection = await page.locator('#roomUrlInput').evaluate(e => [e.selectionStart, e.selectionEnd, e.value.length]);
    assert.deepEqual(selection, [0, selection[2], selection[2]]);
    console.log('PASS: clipboard success, feedback reset, and truthful manual-copy fallback');

    await page.getByRole('button', { name: 'Expand chat', exact: true }).click();
    near((await rect('.lobby-chat')).height, 580.6);
    near((await rect('.lobby-chat')).y, share.bottom + 16);
    assert.equal(await page.locator('#lobbyAdSlot').isVisible(), false);
    assert.deepEqual(await rect('#lobbyBoard'), boardBefore);
    assert.deepEqual(await rect('.room-settings'), settingsBefore);
    await page.locator('.lobby-side.left').screenshot({ path: path.join(shots, 'chat-expanded.png') });
    await page.getByRole('button', { name: 'Restore chat size', exact: true }).click();
    near((await rect('.lobby-chat')).height, 316);
    await page.getByRole('button', { name: 'Hide advertisement area', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'expandChatButton');
    await page.reload();
    assert.equal(await page.locator('#expandChatButton').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#lobbyAdSlot').isVisible(), false);
    await page.evaluate(() => applyNickname('Rough Rush'));
    console.log('PASS: both reference chat layouts, ad dismissal, focus, persistence; board/settings untouched');

    assert.equal(await page.locator('#sendChatButton').isDisabled(), true);
    await page.locator('#lobbyChatInput').fill('   ');
    assert.equal(await page.locator('#sendChatButton').isDisabled(), true);
    await page.locator('#lobbyChatInput').fill('Hello from the room');
    await page.locator('#lobbyChatInput').press('Enter');
    assert.equal(await page.locator('#lobbyMessages .chat-msg').count(), 1);
    assert.ok((await page.locator('#lobbyMessages').innerText()).includes('Rough Rush: Hello from the room'));
    assert.equal(await page.locator('#chatEmpty').isVisible(), false);
    assert.equal(await page.locator('#lobbyChatInput').inputValue(), '');
    assert.equal(await page.locator('#sendChatButton').isDisabled(), true);
    await page.locator('#lobbyChatInput').fill('<img src=x onerror="window.__unsafe=true">');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    assert.equal(await page.locator('#lobbyMessages img').count(), 0);
    assert.equal(await page.evaluate(() => window.__unsafe), undefined);
    assert.ok((await page.locator('#lobbyMessages').innerText()).includes('<img src=x'));
    await page.locator('#lobbyChatInput').fill('/help');
    await page.locator('#lobbyChatInput').press('Enter');
    assert.ok((await page.locator('#lobbyMessages .system').innerText()).includes('Start the game'));
    console.log('PASS: Enter/send, whitespace guard, safe text rendering, and existing slash commands');

    // The speaker controls are independent and work even without optional MP3s.
    await page.getByRole('button', { name: 'Mute chat notifications', exact: true }).click();
    await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
    assert.equal(await page.evaluate(() => isMuted), true);
    assert.equal(await page.locator('#muteButton').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#bgMusic').evaluate(e => e.muted), true);
    await page.evaluate(() => {
      window.__originalAudio = window.Audio;
      window.__sfxCreated = 0; window.__sfxPaused = 0;
      window.Audio = function () {
        window.__sfxCreated++;
        this.addEventListener = () => {};
        this.play = async () => {};
        this.pause = () => { window.__sfxPaused++; };
      };
      GameUI.playSound('buy');
    });
    assert.equal(await page.evaluate(() => window.__sfxCreated), 0);
    await page.getByRole('button', { name: 'Unmute sound', exact: true }).click();
    await page.evaluate(() => GameUI.playSound('buy'));
    assert.equal(await page.evaluate(() => window.__sfxCreated), 1);
    await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__sfxPaused), 1);
    assert.equal(await page.evaluate(() => GameUI.activeSounds.size), 0);
    await page.evaluate(() => { window.Audio = window.__originalAudio; });
    await page.reload();
    assert.equal(await page.locator('#lobbySoundButton').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#chatSoundButton').getAttribute('aria-pressed'), 'true');
    console.log('PASS: chat mute, shared game mute, active sound cleanup, and saved preferences');

    for (const [name, id] of [['How to play', 'gameHelpDialog'], ['Community', 'communityDialog'], ['About room links', 'shareInfoDialog']]) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.locator('#' + id).waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#' + id).isVisible(), false);
      assert.equal(await page.getByRole('button', { name, exact: true }).evaluate(e => e === document.activeElement), true);
    }
    // Exercise the fullscreen wiring independently of window-manager permissions.
    await page.evaluate(() => {
      let active = null;
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => active });
      document.documentElement.requestFullscreen = async () => { active = document.documentElement; document.dispatchEvent(new Event('fullscreenchange')); };
      document.exitFullscreen = async () => { active = null; document.dispatchEvent(new Event('fullscreenchange')); };
    });
    await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
    assert.equal(await page.locator('#fullscreenButton').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
    assert.equal(await page.locator('#fullscreenButton').getAttribute('aria-pressed'), 'false');
    console.log('PASS: utility dialogs, Escape/focus restoration, and fullscreen wiring');

    const inputBefore = await rect('#lobbyChatInput');
    await page.evaluate(() => {
      const input = document.getElementById('lobbyChatInput');
      for (let i = 0; i < 80; i++) {
        input.value = `Message ${i}: ` + 'a'.repeat(400);
        sendLobbyMessage({ preventDefault() {} });
      }
    });
    assert.deepEqual(await rect('#lobbyChatInput'), inputBefore);
    const scroll = await page.locator('#lobbyMessages').evaluate(e => ({ top: e.scrollTop, height: e.scrollHeight, client: e.clientHeight, width: e.clientWidth, content: e.scrollWidth }));
    assert.ok(scroll.height > scroll.client);
    assert.ok(Math.abs(scroll.top + scroll.client - scroll.height) <= 1);
    assert.ok(scroll.content <= scroll.width);
    await page.evaluate(() => clearLobbyChat());
    assert.equal(await page.locator('#chatEmpty').isVisible(), true);
    assert.equal(await page.locator('#chatEmpty use').getAttribute('href'), '#ls-message');
    assert.equal(await page.locator('#sendChatButton').isDisabled(), true);
    console.log('PASS: independent message scrolling, no composer overlap, correct reset/empty state');

    await page.evaluate(() => applyNickname('Rough Rush'));
    for (const [width, height] of [[1920, 1080], [1600, 778], [1366, 768], [1024, 768], [768, 1024], [390, 844], [320, 740]]) {
      await page.setViewportSize({ width, height });
      for (const expanded of [false, true]) {
        await page.evaluate(value => RoomSidebar.expand(value), expanded);
        const check = await page.evaluate(() => {
          const brand = document.querySelector('.lobby-brand').getBoundingClientRect();
          const tools = document.querySelector('.lobby-utilities').getBoundingClientRect();
          const card = document.querySelector('.lobby-chat').getBoundingClientRect();
          const input = document.getElementById('lobbyChatInput').getBoundingClientRect();
          const send = document.getElementById('sendChatButton').getBoundingClientRect();
          return { page: document.documentElement.scrollWidth, headerOverlap: brand.right > tools.left, inputOverlap: input.right > send.left, footerInside: input.bottom <= card.bottom && input.y > card.y, toolHeight: document.querySelector('.lobby-tools').getBoundingClientRect().height };
        });
        assert.ok(check.page <= width, `page overflow at ${width}`);
        assert.equal(check.headerOverlap, false, `wordmark overlap at ${width}`);
        assert.equal(check.inputOverlap, false, `composer overlap at ${width}`);
        assert.equal(check.footerInside, true, `composer clipped at ${width}`);
        near(check.toolHeight, 32);
      }
      await page.evaluate(() => RoomSidebar.expand(false));
      await page.screenshot({ path: path.join(shots, `lobby-${width}.png`), fullPage: true });
      console.log(`PASS: compact and expanded chat at ${width}×${height}`);
    }
    // Check the longer English home-screen name, too.
    await page.evaluate(() => exitLobby());
    assert.equal(await page.locator('#homePage').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(shots, 'home-mobile.png'), fullPage: true });
    assert.deepEqual(errors, [], 'No JavaScript page errors');
    console.log('All sidebar checks passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
