// Tests for the modules that carry real logic: catalog normalising, link
// templating, extension-ID validation, and endpoint recognition.
//
//   node tools/test.mjs
//
// The chrome.* layers and the Apps Script are exercised by loading the unpacked
// extension against a real deployment — see docs/SHEET-SETUP.md.

import assert from 'node:assert/strict';
import {
  normalizeCatalog,
  renderTemplate,
  usesTemplate,
  findItem,
  isValidExtensionId,
  isExtensionType,
  countItems
} from '../src/lib/catalog.js';
import { looksLikeEndpoint } from '../src/lib/api.js';
import { TYPES } from '../src/lib/constants.js';

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

const SHEET_LIKE = {
  version: 7,
  branding: { title: 'Tool Drawer', subtitle: 'Together Homecare' },
  sections: [
    {
      name: 'Extensions',
      items: [
        {
          id: 'row-2',
          name: 'WellSky Shift Scanner',
          description: 'Scan and pull data from WellSky.',
          type: 'extensionMessage',
          target: 'abcdefghijklmnopabcdefghijklmnop',
          openIn: 'tab',
          icon: 'scanner',
          installLink: '',
          enabled: true
        }
      ]
    },
    {
      name: 'Web Apps',
      items: [
        {
          id: 'row-3',
          name: 'Client Intake',
          type: 'app',
          target: 'https://intake.togetherhomecare.org/new?from={{url}}',
          openIn: 'popup',
          icon: 'intake',
          enabled: true
        }
      ]
    }
  ]
};

// --- normalizeCatalog ------------------------------------------------------

await test('a sheet-shaped catalog survives a round trip', () => {
  const catalog = normalizeCatalog(SHEET_LIKE);
  assert.equal(catalog.version, 7);
  assert.equal(catalog.sections.length, 2);
  assert.equal(catalog.sections[0].items[0].name, 'WellSky Shift Scanner');
  assert.equal(countItems(catalog), 2);
});

await test('garbage in does not throw', () => {
  for (const input of [null, undefined, 42, 'nope', [], { sections: 'no' }]) {
    const catalog = normalizeCatalog(input);
    assert.ok(Array.isArray(catalog.sections));
    assert.equal(catalog.version, 0);
  }
});

await test('an unknown type falls back to a plain link', () => {
  const catalog = normalizeCatalog({
    sections: [{ name: 'S', items: [{ name: 'X', type: 'rm -rf' }] }]
  });
  assert.equal(catalog.sections[0].items[0].type, TYPES.APP);
});

await test('a blank row still yields a usable item', () => {
  const catalog = normalizeCatalog({ sections: [{ name: 'S', items: [{}] }] });
  const item = catalog.sections[0].items[0];
  assert.equal(item.name, 'Untitled');
  assert.equal(item.enabled, true);
  assert.match(item.id, /^item-/);
});

await test('enabled is only false when the sheet says so', () => {
  const make = (enabled) =>
    normalizeCatalog({ sections: [{ name: 'S', items: [{ name: 'X', enabled }] }] })
      .sections[0].items[0].enabled;
  assert.equal(make(false), false);
  assert.equal(make(true), true);
  assert.equal(make(undefined), true); // a blank cell means visible
});

await test('an unknown "open in" falls back to a new tab', () => {
  const catalog = normalizeCatalog({
    sections: [{ name: 'S', items: [{ name: 'X', openIn: 'sideways' }] }]
  });
  assert.equal(catalog.sections[0].items[0].openIn, 'tab');
});

// --- icons -----------------------------------------------------------------

await test('a built-in icon name is kept', () => {
  const catalog = normalizeCatalog({
    sections: [{ name: 'S', items: [{ name: 'X', icon: 'verify' }] }]
  });
  assert.equal(catalog.sections[0].items[0].icon, 'verify');
});

await test('an https image URL is kept, other schemes are not', () => {
  const iconOf = (icon) =>
    normalizeCatalog({ sections: [{ name: 'S', items: [{ name: 'X', icon }] }] })
      .sections[0].items[0].icon;

  assert.equal(iconOf('https://cdn.example.org/a.png'), 'https://cdn.example.org/a.png');
  assert.equal(iconOf('data:image/svg+xml;base64,AAA'), 'data:image/svg+xml;base64,AAA');
  // A javascript: or http: icon must never reach an <img src>.
  assert.equal(iconOf('javascript:alert(1)'), 'app');
  assert.equal(iconOf('http://insecure.example/a.png'), 'app');
  assert.equal(iconOf('made-up-name'), 'app');
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

await test('an ampersand in a title cannot break out of the query string', () => {
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

// --- extension IDs ---------------------------------------------------------

await test('extension IDs are 32 letters a-p', () => {
  assert.equal(isValidExtensionId('abcdefghijklmnopabcdefghijklmnop'), true);
  assert.equal(isValidExtensionId('ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP'), false); // uppercase
  assert.equal(isValidExtensionId('abcdefghijklmnopabcdefghijklmno'), false); // 31
  assert.equal(isValidExtensionId('abcdefghijklmnqpabcdefghijklmnop'), false); // q is out of range
  assert.equal(isValidExtensionId('https://example.com'), false);
  assert.equal(isValidExtensionId(''), false);
});

await test('extension types are told apart from apps', () => {
  assert.equal(isExtensionType(TYPES.EXTENSION_MESSAGE), true);
  assert.equal(isExtensionType(TYPES.EXTENSION_PAGE), true);
  assert.equal(isExtensionType(TYPES.APP), false);
});

// --- lookups and endpoints -------------------------------------------------

await test('findItem reaches across sections', () => {
  const catalog = normalizeCatalog(SHEET_LIKE);
  assert.equal(findItem(catalog, 'row-3').name, 'Client Intake');
  assert.equal(findItem(catalog, 'missing'), null);
});

await test('only a deployed Apps Script /exec link is accepted', () => {
  assert.equal(
    looksLikeEndpoint('https://script.google.com/macros/s/AKfycbx123/exec'),
    true
  );
  assert.equal(
    looksLikeEndpoint('https://script.google.com/macros/s/AKfycbx123/dev'),
    false
  );
  assert.equal(looksLikeEndpoint('https://docs.google.com/spreadsheets/d/abc/edit'), false);
  assert.equal(looksLikeEndpoint('http://script.google.com/macros/s/x/exec'), false);
  assert.equal(looksLikeEndpoint(''), false);
});

// --- report ----------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`\n${failures.map((line) => `  ✗ ${line}`).join('\n')}\n`);
  process.exit(1);
}
