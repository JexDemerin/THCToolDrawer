// Tests for the modules that carry real logic: catalog normalising, site
// matching, link templating and password hashing. Run with `node tools/test.mjs`.
//
// The chrome.* layers (service worker, drawer, content script) are exercised by
// loading the unpacked extension — see README.

import assert from 'node:assert/strict';
import {
  normalizeConfig,
  shouldShowOnUrl,
  renderTemplate,
  usesTemplate,
  findItem,
  configForPublish
} from '../src/lib/config.js';
import { hashPassword, verifyPassword } from '../src/lib/crypto.js';
import { DEFAULT_CONFIG } from '../src/lib/defaults.js';

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}\n    ${error.message.split('\n')[0]}`);
  }
}

// --- normalizeConfig -------------------------------------------------------

await test('shipped defaults survive a round trip', () => {
  const config = normalizeConfig(DEFAULT_CONFIG);
  assert.equal(config.sections.length, 2);
  assert.equal(config.sections[0].items[0].name, 'WellSky Scanner');
  assert.equal(config.branding.title, 'THC Tool Drawer');
});

await test('garbage in does not throw', () => {
  for (const input of [null, undefined, 42, 'nope', [], { sections: 'no' }]) {
    const config = normalizeConfig(input);
    assert.ok(Array.isArray(config.sections));
    assert.ok(config.version >= 1);
  }
});

await test('unknown action types fall back to a link', () => {
  const config = normalizeConfig({
    sections: [{ name: 'S', items: [{ name: 'X', action: { type: 'rm -rf' } }] }]
  });
  assert.equal(config.sections[0].items[0].action.type, 'openUrl');
});

await test('items without ids are given one', () => {
  const config = normalizeConfig({ sections: [{ name: 'S', items: [{ name: 'X' }] }] });
  assert.match(config.sections[0].items[0].id, /^item-/);
});

await test('a bad accent colour is replaced, a good one kept', () => {
  assert.equal(normalizeConfig({ branding: { accent: 'javascript:alert(1)' } }).branding.accent,
    DEFAULT_CONFIG.branding.accent);
  assert.equal(normalizeConfig({ branding: { accent: '#ff0000' } }).branding.accent, '#ff0000');
});

await test('popup sizes are clamped to something sane', () => {
  const config = normalizeConfig({
    sections: [
      { name: 'S', items: [{ name: 'X', action: { type: 'openUrl', target: 'popup', popup: { width: 99999, height: -5 } } }] }
    ]
  });
  const popup = config.sections[0].items[0].action.popup;
  assert.equal(popup.width, 2000);
  assert.equal(popup.height, 200);
});

// --- site matching ---------------------------------------------------------

const withSites = (mode, patterns) =>
  normalizeConfig({ settings: { sites: { mode, patterns } } });

await test('mode "all" shows on any http(s) page', () => {
  const config = withSites('all', []);
  assert.equal(shouldShowOnUrl(config, 'https://anything.example/x'), true);
  assert.equal(shouldShowOnUrl(config, 'http://anything.example/x'), true);
});

await test('non-web pages never mount', () => {
  const config = withSites('all', []);
  for (const url of ['chrome://extensions', 'file:///tmp/x.html', 'about:blank', '']) {
    assert.equal(shouldShowOnUrl(config, url), false, url);
  }
});

await test('allow-list matches the host and its subdomains', () => {
  const config = withSites('allow', ['https://*.wellsky.com/*']);
  assert.equal(shouldShowOnUrl(config, 'https://clearcare.wellsky.com/dash'), true);
  assert.equal(shouldShowOnUrl(config, 'https://wellsky.com/'), true);
  assert.equal(shouldShowOnUrl(config, 'https://evil-wellsky.com/'), false);
  assert.equal(shouldShowOnUrl(config, 'https://example.com/'), false);
});

await test('deny-list is the exact inverse', () => {
  const config = withSites('deny', ['https://*.bank.com/*']);
  assert.equal(shouldShowOnUrl(config, 'https://secure.bank.com/'), false);
  assert.equal(shouldShowOnUrl(config, 'https://example.com/'), true);
});

await test('a bare host is treated as a substring rule', () => {
  const config = withSites('allow', ['wellsky.com']);
  assert.equal(shouldShowOnUrl(config, 'https://clearcare.wellsky.com/x'), true);
  assert.equal(shouldShowOnUrl(config, 'https://example.com/x'), false);
});

await test('an unparseable pattern is ignored, not fatal', () => {
  const config = withSites('allow', ['https://[/*']);
  assert.equal(shouldShowOnUrl(config, 'https://example.com/'), false);
});

// --- templating ------------------------------------------------------------

const context = {
  url: 'https://wellsky.com/client?id=7',
  title: 'Client 7 & Co',
  selection: 'Jane Doe',
  date: '2026-08-13'
};

await test('placeholders are substituted and URL-encoded', () => {
  const out = renderTemplate('https://app.example.org/exec?src={{url}}&q={{selection}}', context);
  assert.equal(
    out,
    'https://app.example.org/exec?src=https%3A%2F%2Fwellsky.com%2Fclient%3Fid%3D7&q=Jane%20Doe'
  );
});

await test('ampersands in a title cannot break out of a query string', () => {
  const out = renderTemplate('https://x.test/?t={{title}}', context);
  assert.equal(out, 'https://x.test/?t=Client%207%20%26%20Co');
  assert.equal(out.split('&').length, 1);
});

await test('unknown placeholders are left alone', () => {
  assert.equal(renderTemplate('https://x.test/?a={{nope}}', context), 'https://x.test/?a={{nope}}');
});

await test('usesTemplate only fires on real placeholders', () => {
  assert.equal(usesTemplate('https://x.test/{{url}}'), true);
  assert.equal(usesTemplate('https://x.test/plain'), false);
  assert.equal(usesTemplate(''), false);
});

// --- lookups and publishing ------------------------------------------------

await test('findItem reaches across sections', () => {
  const config = normalizeConfig(DEFAULT_CONFIG);
  const id = config.sections[0].items[1].id;
  assert.equal(findItem(config, id).name, 'Text Blaster');
  assert.equal(findItem(config, 'missing'), null);
});

await test('publishing stamps the time and editor', () => {
  const out = configForPublish(normalizeConfig(DEFAULT_CONFIG), 'jexter@togetherhomecare.org');
  assert.ok(out.updatedAt);
  assert.equal(out.updatedBy, 'jexter@togetherhomecare.org');
});

// --- password gate ---------------------------------------------------------

await test('the right password verifies and a wrong one does not', async () => {
  const credential = await hashPassword('correct horse battery', 20000);
  assert.equal(await verifyPassword('correct horse battery', credential), true);
  assert.equal(await verifyPassword('correct horse batter', credential), false);
  assert.equal(await verifyPassword('', credential), false);
});

await test('the same password hashes differently each time (unique salt)', async () => {
  const a = await hashPassword('same password', 20000);
  const b = await hashPassword('same password', 20000);
  assert.notEqual(a.passwordHash, b.passwordHash);
  assert.notEqual(a.salt, b.salt);
  assert.equal(await verifyPassword('same password', a), true);
  assert.equal(await verifyPassword('same password', b), true);
});

await test('verifying against an empty credential fails closed', async () => {
  for (const credential of [null, undefined, {}, { passwordHash: 'x' }]) {
    assert.equal(await verifyPassword('anything', credential), false);
  }
});

await test('a catalog with no password set has no hash to check', () => {
  assert.equal(normalizeConfig({}).admin.passwordHash, null);
});

// --- report ----------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`\n${failures.map((line) => `  ✗ ${line}`).join('\n')}\n`);
  process.exit(1);
}
