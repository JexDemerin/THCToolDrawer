// Settings page: catalog sync for everyone, publishing for the super admin.

import { MSG, SESSION, ADMIN_SESSION_MS } from '../lib/constants.js';
import { verifyPassword } from '../lib/crypto.js';
import { normalizeConfig } from '../lib/config.js';
import { getConfig, getSync, setSync, getPublish, setPublish, getMeta } from '../lib/storage.js';

const $ = (selector) => document.querySelector(selector);

let config = null;

init();

async function init() {
  config = await getConfig();
  const sync = await getSync();
  const meta = await getMeta();

  $('#version-tag').textContent = `Catalog v${config.version}`;
  $('#config-url').value = sync.configUrl;
  $('#poll-minutes').value = sync.pollMinutes;
  $('#sync-on-open').checked = Boolean(sync.syncOnOpen);
  renderSyncStatus(meta);
  renderSites();

  $('#btn-save-sync').addEventListener('click', saveSync);
  $('#btn-sync-now').addEventListener('click', syncNow);
  $('#btn-unlock').addEventListener('click', unlock);
  $('#admin-password').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') unlock();
  });
  $('#publish-target').addEventListener('change', renderPublishTarget);
  $('#btn-save-publish').addEventListener('click', savePublish);
  $('#btn-publish-now').addEventListener('click', publishNow);
  $('#btn-export').addEventListener('click', exportConfig);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', importConfig);

  if (await isUnlocked()) await showPublishPanel();
}

// ---------------------------------------------------------------------------
// Catalog sync
// ---------------------------------------------------------------------------

async function saveSync() {
  const url = $('#config-url').value.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return status('#sync-status', 'The catalog URL has to start with http:// or https://', 'error');
  }
  await setSync({
    configUrl: url,
    pollMinutes: Math.min(1440, Math.max(5, Number($('#poll-minutes').value) || 30)),
    syncOnOpen: $('#sync-on-open').checked
  });
  status('#sync-status', 'Saved.', 'ok');
}

async function syncNow() {
  status('#sync-status', 'Checking…');
  const response = await send({ type: MSG.SYNC_NOW });
  config = await getConfig();
  $('#version-tag').textContent = `Catalog v${config.version}`;
  renderSites();

  const messages = {
    updated: `Updated to v${response.version}.`,
    current: `Already up to date (v${response.version}).`,
    held: `A newer catalog (v${response.version}) is waiting, but there are unpublished local edits.`,
    'not-configured': 'No catalog URL is set, so there is nothing to check.'
  };
  status(
    '#sync-status',
    messages[response.status] || response.error || 'Check failed.',
    response.status === 'error' ? 'error' : 'ok'
  );
}

function renderSyncStatus(meta) {
  if (meta.lastSyncError) {
    return status('#sync-status', `Last check failed: ${meta.lastSyncError}`, 'error');
  }
  if (meta.lastSyncAt) {
    status('#sync-status', `Last checked ${new Date(meta.lastSyncAt).toLocaleString()}.`);
  }
}

function renderSites() {
  const { mode, patterns } = config.settings.sites;
  const summary = $('#sites-summary');
  if (mode === 'all' || !patterns.length) {
    summary.textContent = 'The drawer appears on every http and https page.';
    return;
  }
  const verb = mode === 'allow' ? 'only on' : 'everywhere except';
  summary.textContent = `The drawer appears ${verb}: ${patterns.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Super-admin gate
// ---------------------------------------------------------------------------

async function isUnlocked() {
  const bag = await chrome.storage.session.get(SESSION.ADMIN_UNTIL);
  return (bag[SESSION.ADMIN_UNTIL] || 0) > Date.now();
}

async function unlock() {
  if (!config.admin.passwordHash) {
    return status(
      '#unlock-status',
      'No super-admin password exists yet. Open the drawer, click “Super admin”, and set one first.',
      'error'
    );
  }

  const valid = await verifyPassword($('#admin-password').value, config.admin);
  if (!valid) return status('#unlock-status', 'That password is not right.', 'error');

  await chrome.storage.session.set({ [SESSION.ADMIN_UNTIL]: Date.now() + ADMIN_SESSION_MS });
  $('#admin-password').value = '';
  status('#unlock-status', '');
  await showPublishPanel();
}

async function showPublishPanel() {
  const publish = await getPublish();
  $('#publish-target').value = publish.target;
  $('#gist-id').value = publish.gist.id;
  $('#gist-filename').value = publish.gist.filename;
  $('#gist-token').value = publish.gist.token;
  $('#http-url').value = publish.http.url;
  $('#http-method').value = publish.http.method;
  $('#http-header-name').value = publish.http.headerName;
  $('#http-header-value').value = publish.http.headerValue;

  $('#publish-gate').hidden = true;
  $('#publish-panel').hidden = false;
  $('#publish-lock').textContent = 'unlocked';
  renderPublishTarget();
}

function renderPublishTarget() {
  const target = $('#publish-target').value;
  for (const node of document.querySelectorAll('[data-target]')) {
    node.hidden = node.dataset.target !== target;
  }
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

async function savePublish() {
  await setPublish({
    target: $('#publish-target').value,
    gist: {
      id: $('#gist-id').value.trim(),
      filename: $('#gist-filename').value.trim() || 'thc-tool-drawer.json',
      token: $('#gist-token').value.trim()
    },
    http: {
      url: $('#http-url').value.trim(),
      method: $('#http-method').value,
      headerName: $('#http-header-name').value.trim(),
      headerValue: $('#http-header-value').value.trim()
    }
  });
  status('#publish-status', 'Saved on this machine.', 'ok');
}

async function publishNow() {
  status('#publish-status', 'Publishing…');
  const response = await send({ type: MSG.PUBLISH_CONFIG });

  if (!response.ok) {
    return status('#publish-status', response.error || 'Publish failed.', 'error');
  }
  if (response.status === 'manual') {
    download(response.json, 'thc-tool-drawer.json');
    return status(
      '#publish-status',
      'Downloaded. Upload it to wherever the catalog URL above points.',
      'ok'
    );
  }
  status(
    '#publish-status',
    `Published v${response.version}. Teammates pick it up on their next check.`,
    'ok'
  );
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

async function exportConfig() {
  const current = await getConfig();
  download(JSON.stringify(current, null, 2), 'thc-tool-drawer.json');
  status('#io-status', 'Exported.', 'ok');
}

async function importConfig(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const incoming = normalizeConfig(parsed);
    const response = await send({ type: MSG.SAVE_CONFIG, config: incoming });
    if (!response.ok) throw new Error(response.error || 'Save failed.');

    config = await getConfig();
    $('#version-tag').textContent = `Catalog v${config.version}`;
    renderSites();
    status('#io-status', `Imported. Saved as v${response.version} — publish to share it.`, 'ok');
  } catch (error) {
    status('#io-status', `Could not import that file: ${error.message}`, 'error');
  } finally {
    event.target.value = '';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      void chrome.runtime.lastError;
      resolve(response || { ok: false, error: 'The extension did not respond.' });
    });
  });
}

function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function status(selector, message, tone = '') {
  const node = $(selector);
  node.textContent = message;
  node.className = `status ${tone}`.trim();
}
