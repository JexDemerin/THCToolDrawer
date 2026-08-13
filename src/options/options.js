// Settings page: the spreadsheet connection and a setup check.

import { MSG } from '../lib/constants.js';
import { getSettings, setSettings, getMeta } from '../lib/storage.js';
import { looksLikeEndpoint } from '../lib/api.js';

const $ = (selector) => document.querySelector(selector);

init();

async function init() {
  const settings = await getSettings();
  const meta = await getMeta();

  $('#endpoint').value = settings.endpoint;
  $('#poll-minutes').value = settings.pollMinutes;
  $('#sync-on-open').checked = Boolean(settings.syncOnOpen);

  if (meta.lastSyncError) status(`Last check failed: ${meta.lastSyncError}`, 'error');
  else if (meta.lastSyncAt) {
    status(`Last checked ${new Date(meta.lastSyncAt).toLocaleString()}.`);
  }

  $('#btn-save').addEventListener('click', save);
  $('#btn-test').addEventListener('click', test);
  $('#btn-sync').addEventListener('click', syncNow);
}

async function save() {
  const endpoint = $('#endpoint').value.trim();
  if (endpoint && !looksLikeEndpoint(endpoint)) {
    return status(
      'That does not look like an Apps Script web app link. It should start with ' +
        'https://script.google.com/ and end in /exec',
      'error'
    );
  }

  await setSettings({
    endpoint,
    pollMinutes: Math.min(1440, Math.max(5, Number($('#poll-minutes').value) || 30)),
    syncOnOpen: $('#sync-on-open').checked
  });
  status('Saved.', 'ok');
}

async function test() {
  const endpoint = $('#endpoint').value.trim();
  if (!endpoint) return status('Add the web app link first.', 'error');

  status('Testing…');
  $('#ping').hidden = true;

  const response = await send({ type: MSG.PING, endpoint });
  if (!response.ok) return status(response.error || 'The test failed.', 'error');

  const result = response.result || {};
  const missing = [];
  if (!result.hasTools) missing.push('Tools');
  if (!result.hasSuperadmin) missing.push('Superadmin');

  $('#ping').hidden = false;
  $('#ping').textContent = [
    `Spreadsheet: ${result.spreadsheet}`,
    `Tabs found:  ${(result.tabs || []).join(', ')}`,
    `Tools rows:  ${result.toolCount}`
  ].join('\n');

  if (missing.length) {
    return status(`Connected, but these tabs are missing: ${missing.join(', ')}.`, 'error');
  }
  status(`Connected. ${result.toolCount} tool(s) in the sheet.`, 'ok');
}

async function syncNow() {
  status('Checking…');
  const response = await send({ type: MSG.SYNC_NOW, force: true });

  const messages = {
    updated: `Pulled v${response.version} from the sheet.`,
    current: `Already up to date (v${response.version}).`,
    'not-configured': 'Add the web app link first.'
  };
  status(
    messages[response.status] || response.error || 'Check failed.',
    response.status === 'error' ? 'error' : 'ok'
  );
}

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      void chrome.runtime.lastError;
      resolve(response || { ok: false, error: 'The extension did not respond.' });
    });
  });
}

function status(message, tone = '') {
  const node = $('#status');
  node.textContent = message;
  node.className = `status ${tone}`.trim();
}
