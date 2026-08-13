/**
 * THC Tool Drawer — Google Apps Script backend.
 *
 * Paste this into the script editor of the Tool Drawer spreadsheet
 * (Extensions → Apps Script), then deploy it as a web app. Setup steps are in
 * docs/SHEET-SETUP.md.
 *
 * The spreadsheet stays private. This script is the only thing that reads it,
 * and it never returns the super-admin password — the closest it comes is
 * answering yes or no to "is this the password?". That is the whole reason the
 * drawer talks to a script instead of reading a published CSV: a published tab
 * would have to be readable by every teammate's browser.
 *
 * Endpoints
 *   GET  ?action=catalog   → the tool list, for everyone
 *   POST {action:'verify'} → is this password right?
 *   POST {action:'save'}   → replace the tool list (password required)
 *   POST {action:'ping'}   → setup check, reports which tabs were found
 */

const SHEET_TOOLS = 'Tools';
const SHEET_ADMIN = 'Superadmin';
const SHEET_SETTINGS = 'Settings';

// Column order of the Tools tab. Changing the order here changes what the
// script expects; the header row in the sheet is for humans, not for parsing.
const TOOL_COLUMNS = [
  'Section',
  'Name',
  'Description',
  'Type',
  'Target',
  'Open In',
  'Icon',
  'Install Link',
  'Enabled'
];

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'catalog';
  try {
    if (action === 'catalog') return json(buildCatalog());
    return json({ ok: false, error: 'Unknown action: ' + action });
  } catch (error) {
    return json({ ok: false, error: String(error && error.message) });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    return json({ ok: false, error: 'Body was not valid JSON.' });
  }

  try {
    switch (body.action) {
      case 'ping':
        return json(ping());
      case 'verify':
        return json({ ok: true, valid: checkPassword(body.password) });
      case 'save':
        return json(saveCatalog(body));
      default:
        return json({ ok: false, error: 'Unknown action: ' + body.action });
    }
  } catch (error) {
    return json({ ok: false, error: String(error && error.message) });
  }
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ---------------------------------------------------------------------------
// Reading the catalog
// ---------------------------------------------------------------------------

function buildCatalog() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const settings = readSettings(book);
  const rows = readToolRows(book);

  // Sections are created in the order they first appear in the sheet, so an
  // admin reorders groups by moving rows rather than editing a second tab.
  const order = [];
  const grouped = {};

  rows.forEach(function (row, index) {
    const section = row['Section'] || 'Tools';
    if (!grouped[section]) {
      grouped[section] = [];
      order.push(section);
    }
    grouped[section].push({
      id: 'row-' + (index + 2), // sheet row number, so edits map back
      name: row['Name'],
      description: row['Description'],
      icon: row['Icon'],
      type: normalizeType(row['Type']),
      target: row['Target'],
      openIn: normalizeOpenIn(row['Open In']),
      installLink: row['Install Link'],
      enabled: isTrue(row['Enabled'])
    });
  });

  return {
    ok: true,
    version: Number(settings.version || 1),
    updatedAt: settings.updatedat || null,
    branding: {
      title: settings.title || 'Tool Drawer',
      subtitle: settings.subtitle || 'Together Homecare'
    },
    sections: order.map(function (name) {
      return { name: name, items: grouped[name] };
    })
  };
}

function readToolRows(book) {
  const sheet = book.getSheetByName(SHEET_TOOLS);
  if (!sheet) throw new Error('No tab named "' + SHEET_TOOLS + '".');

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const header = values[0].map(function (cell) {
    return String(cell).trim();
  });

  return values
    .slice(1)
    .map(function (row) {
      const record = {};
      TOOL_COLUMNS.forEach(function (column) {
        const at = header.indexOf(column);
        record[column] = at === -1 ? '' : String(row[at] === undefined ? '' : row[at]).trim();
      });
      return record;
    })
    .filter(function (record) {
      return record['Name']; // a row with no name is a blank row
    });
}

function readSettings(book) {
  const sheet = book.getSheetByName(SHEET_SETTINGS);
  const settings = {};
  if (!sheet) return settings;

  sheet
    .getDataRange()
    .getValues()
    .forEach(function (row) {
      const key = String(row[0] || '').trim().toLowerCase();
      if (key) settings[key] = String(row[1] === undefined ? '' : row[1]).trim();
    });
  return settings;
}

function normalizeType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'extension' || type === 'extension-message') return 'extensionMessage';
  if (type === 'extension-page') return 'extensionPage';
  return 'app';
}

function normalizeOpenIn(value) {
  const target = String(value || '').trim().toLowerCase();
  if (target === 'popup') return 'popup';
  if (target === 'current' || target === 'current tab') return 'current';
  return 'tab';
}

function isTrue(value) {
  const text = String(value).trim().toLowerCase();
  return text === '' || text === 'true' || text === 'yes' || text === 'y' || text === '1';
}

// ---------------------------------------------------------------------------
// The password
// ---------------------------------------------------------------------------

/**
 * Compare a submitted password against the Superadmin tab.
 *
 * The password never leaves this function — callers only learn true or false.
 * A wrong answer costs a short pause, which makes guessing at scale impractical
 * without punishing a real admin who mistypes.
 */
function checkPassword(submitted) {
  if (!submitted) return false;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ADMIN);
  if (!sheet) throw new Error('No tab named "' + SHEET_ADMIN + '".');

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return false;

  const header = values[0].map(function (cell) {
    return String(cell).trim().toLowerCase();
  });
  const passwordAt = header.indexOf('password');
  if (passwordAt === -1) throw new Error('The Superadmin tab has no "Password" column.');

  const candidate = String(submitted);
  let matched = false;

  // Every row is checked, and the loop never breaks early, so the time taken
  // does not reveal which row matched or how far in it got.
  for (let i = 1; i < values.length; i += 1) {
    const stored = String(values[i][passwordAt] === undefined ? '' : values[i][passwordAt]).trim();
    if (stored && constantTimeEquals(stored, candidate)) matched = true;
  }

  if (!matched) Utilities.sleep(700);
  return matched;
}

function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

// ---------------------------------------------------------------------------
// Writing the catalog
// ---------------------------------------------------------------------------

/**
 * Replace the Tools tab with what the drawer sent, and bump the version so
 * teammates pick it up on their next check.
 */
function saveCatalog(body) {
  if (!checkPassword(body.password)) return { ok: false, error: 'Wrong password.' };
  if (!body.catalog || !Array.isArray(body.catalog.sections)) {
    return { ok: false, error: 'No catalog in the request.' };
  }

  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SHEET_TOOLS);
  if (!sheet) throw new Error('No tab named "' + SHEET_TOOLS + '".');

  // One writer at a time: two admins saving at once would otherwise interleave
  // and leave a half-written sheet.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'Someone else is saving. Try again.' };

  try {
    const rows = [];
    body.catalog.sections.forEach(function (section) {
      (section.items || []).forEach(function (item) {
        rows.push([
          section.name || 'Tools',
          item.name || '',
          item.description || '',
          typeToSheet(item.type),
          item.target || '',
          item.openIn || 'tab',
          item.icon || '',
          item.installLink || '',
          item.enabled === false ? 'FALSE' : 'TRUE'
        ]);
      });
    });

    sheet.clear();
    sheet.getRange(1, 1, 1, TOOL_COLUMNS.length).setValues([TOOL_COLUMNS]);
    sheet.getRange(1, 1, 1, TOOL_COLUMNS.length).setFontWeight('bold');
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, TOOL_COLUMNS.length).setValues(rows);
    }

    const version = bumpVersion(book);
    return { ok: true, version: version, rows: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function typeToSheet(type) {
  if (type === 'extensionMessage') return 'extension-message';
  if (type === 'extensionPage') return 'extension-page';
  return 'app';
}

function bumpVersion(book) {
  let sheet = book.getSheetByName(SHEET_SETTINGS);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_SETTINGS);
    sheet.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]).setFontWeight('bold');
  }

  const values = sheet.getDataRange().getValues();
  let versionRow = -1;
  let updatedRow = -1;

  for (let i = 0; i < values.length; i += 1) {
    const key = String(values[i][0] || '').trim().toLowerCase();
    if (key === 'version') versionRow = i + 1;
    if (key === 'updatedat') updatedRow = i + 1;
  }

  const next = (versionRow === -1 ? 1 : Number(values[versionRow - 1][1]) || 1) + 1;
  const stamp = new Date().toISOString();

  if (versionRow === -1) sheet.appendRow(['version', next]);
  else sheet.getRange(versionRow, 2).setValue(next);

  if (updatedRow === -1) sheet.appendRow(['updatedAt', stamp]);
  else sheet.getRange(updatedRow, 2).setValue(stamp);

  return next;
}

// ---------------------------------------------------------------------------
// Setup check
// ---------------------------------------------------------------------------

/** Reports what the script can see, so a bad deployment is obvious. */
function ping() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const names = book.getSheets().map(function (sheet) {
    return sheet.getName();
  });
  return {
    ok: true,
    spreadsheet: book.getName(),
    tabs: names,
    hasTools: names.indexOf(SHEET_TOOLS) !== -1,
    hasSuperadmin: names.indexOf(SHEET_ADMIN) !== -1,
    hasSettings: names.indexOf(SHEET_SETTINGS) !== -1,
    toolCount: names.indexOf(SHEET_TOOLS) === -1 ? 0 : readToolRows(book).length
  };
}

/**
 * Run this once from the editor (Run → setUpSheets) to create the tabs and
 * headers. Existing tabs are left alone.
 */
function setUpSheets() {
  const book = SpreadsheetApp.getActiveSpreadsheet();

  if (!book.getSheetByName(SHEET_TOOLS)) {
    const sheet = book.insertSheet(SHEET_TOOLS);
    sheet.getRange(1, 1, 1, TOOL_COLUMNS.length).setValues([TOOL_COLUMNS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, 1, TOOL_COLUMNS.length).setValues([
      ['Extensions', 'WellSky Shift Scanner', 'Scan and pull data from WellSky.',
       'extension-message', 'paste-the-32-letter-id-here', 'tab', 'scanner', '', 'TRUE']
    ]);
  }

  if (!book.getSheetByName(SHEET_ADMIN)) {
    const sheet = book.insertSheet(SHEET_ADMIN);
    sheet.getRange(1, 1, 1, 3).setValues([['Admin Email', 'Password', 'Name']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  if (!book.getSheetByName(SHEET_SETTINGS)) {
    const sheet = book.insertSheet(SHEET_SETTINGS);
    sheet.getRange(1, 1, 4, 2).setValues([
      ['Key', 'Value'],
      ['title', 'Tool Drawer'],
      ['subtitle', 'Together Homecare'],
      ['version', 1]
    ]);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  }

  SpreadsheetApp.getUi().alert('Tool Drawer: tabs are ready.');
}
