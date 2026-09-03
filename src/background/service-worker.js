// Service worker: pulls the catalog from the sheet, launches tools, and routes
// everything the panel asks for.

import { MSG, ALARM_SYNC, TYPES } from '../lib/constants.js';
import { normalizeCatalog, findItem, renderTemplate, usesTemplate } from '../lib/catalog.js';
import {
  getCatalog,
  setCatalog,
  getSettings,
  getMeta,
  setMeta,
  isAdminUnlocked,
  startAdminSession,
  getAdminPassword,
  endAdminSession
} from '../lib/storage.js';
import * as api from '../lib/api.js';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  await openPanelOnIconClick();
  await scheduleSync();
  await pullCatalog();
});

chrome.runtime.onStartup.addListener(async () => {
  await openPanelOnIconClick();
  await scheduleSync();
  await pullCatalog();
});

/** Clicking the toolbar icon opens the side panel, with no popup in between. */
async function openPanelOnIconClick() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // Older Chrome. The action click still opens the panel by default path.
  }
}

async function scheduleSync() {
  const settings = await getSettings();
  const minutes = Math.max(5, Number(settings.pollMinutes) || 30);
  await chrome.alarms.clear(ALARM_SYNC);
  chrome.alarms.create(ALARM_SYNC, { periodInMinutes: minutes, delayInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_SYNC) return;
  const result = await pullCatalog();
  if (result.status === 'updated') broadcast();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) scheduleSync();
});

function broadcast() {
  chrome.runtime.sendMessage({ type: MSG.CATALOG_CHANGED }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * Fetch the catalog and adopt it when the sheet has moved ahead of what we
 * hold. Version numbers only ever climb, so a published change rolls out and
 * nothing rolls backwards.
 */
async function pullCatalog({ force = false } = {}) {
  const settings = await getSettings();
  if (!settings.endpoint) {
    await setMeta({ lastSyncError: null });
    return { status: 'not-configured' };
  }

  let remote;
  try {
    remote = normalizeCatalog(await api.fetchCatalog(settings.endpoint));
  } catch (error) {
    const message = String((error && error.message) || error);
    await setMeta({ lastSyncAt: Date.now(), lastSyncError: message });
    return { status: 'error', error: message };
  }

  const local = await getCatalog();
  if (!force && remote.version <= local.version && local.items.length) {
    await setMeta({ lastSyncAt: Date.now(), lastSyncError: null, version: remote.version });
    return { status: 'current', version: remote.version };
  }

  await setCatalog(remote);
  await setMeta({ lastSyncAt: Date.now(), lastSyncError: null, version: remote.version });
  return { status: 'updated', version: remote.version };
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
  return true; // keep the channel open for the async reply
});

async function handle(message, sender) {
  switch (message && message.type) {
    case MSG.GET_STATE:
      return getState();

    case MSG.SYNC_NOW: {
      const result = await pullCatalog({ force: Boolean(message.force) });
      if (result.status === 'updated') broadcast();
      return { ok: result.status !== 'error', ...result };
    }

    case MSG.LAUNCH:
      return launch(message.itemId, message.tabId || (sender.tab && sender.tab.id));

    case MSG.ADMIN_VERIFY:
      return adminVerify(message.password);

    case MSG.ADMIN_LOCK:
      await endAdminSession();
      return { ok: true };

    case MSG.ADMIN_SAVE:
      return adminSave(message.catalog);

    case MSG.CHECK_INSTALLED:
      return checkInstalled(message.extensionIds || []);

    case MSG.PING: {
      const settings = await getSettings();
      const endpoint = (message.endpoint || settings.endpoint || '').trim();
      return { ok: true, result: await api.ping(endpoint) };
    }

    case MSG.OPEN_OPTIONS:
      await chrome.runtime.openOptionsPage();
      return { ok: true };

    default:
      return { ok: false, error: `Unknown message: ${message && message.type}` };
  }
}

async function getState() {
  const [catalog, settings, meta, admin] = await Promise.all([
    getCatalog(),
    getSettings(),
    getMeta(),
    isAdminUnlocked()
  ]);
  const hasManagement = await chrome.permissions.contains({ permissions: ['management'] });
  return { ok: true, catalog, settings, meta, admin, hasManagement };
}

// ---------------------------------------------------------------------------
// Super admin
//
// The password is checked by the Apps Script against the private Superadmin
// tab. It is never compared here, and the sheet never sends it back.
// ---------------------------------------------------------------------------

async function adminVerify(password) {
  const settings = await getSettings();
  if (!settings.endpoint) return { ok: false, error: 'No spreadsheet connection is set up yet.' };
  if (!password) return { ok: false, error: 'Enter the password.' };

  const result = await api.verifyPassword(settings.endpoint, password);
  if (!result || !result.valid) {
    await endAdminSession();
    return { ok: true, valid: false };
  }

  await startAdminSession(password);
  return { ok: true, valid: true };
}

async function adminSave(catalog) {
  const settings = await getSettings();
  const password = await getAdminPassword();
  if (!password) return { ok: false, error: 'Your admin session expired. Unlock again.' };

  const result = await api.saveCatalog(settings.endpoint, password, normalizeCatalog(catalog));
  if (!result || !result.ok) {
    return { ok: false, error: (result && result.error) || 'The sheet refused the save.' };
  }

  // Take the sheet's own version back, rather than guessing it here.
  await pullCatalog({ force: true });
  broadcast();
  return { ok: true, version: result.version };
}

// ---------------------------------------------------------------------------
// Launching
// ---------------------------------------------------------------------------

async function launch(itemId, tabId) {
  const catalog = await getCatalog();
  const item = findItem(catalog, itemId);
  if (!item) return { ok: false, error: 'That button is no longer in the list.' };
  if (!item.enabled) return { ok: false, error: `${item.name} is turned off.` };

  if (item.type === TYPES.EXTENSION) return messageExtension(item);

  if (!item.target) return { ok: false, error: `${item.name} has no link yet.` };
  const url = usesTemplate(item.target)
    ? renderTemplate(item.target, await buildContext(tabId))
    : item.target;

  try {
    await openUrl(url, item, tabId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
}

async function buildContext(tabId) {
  const context = {
    url: '',
    title: '',
    selection: '',
    date: new Date().toISOString().slice(0, 10)
  };
  if (!tabId) return context;

  try {
    const tab = await chrome.tabs.get(tabId);
    context.url = tab.url || '';
    context.title = tab.title || '';
  } catch {
    // Tab closed underneath us.
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => String(window.getSelection() || '')
    });
    context.selection = (result && result.result) || '';
  } catch {
    // Reading the selection needs access to that page, which the extension may
    // not have. The rest of the placeholders still work.
  }

  return context;
}

async function openUrl(url, item, tabId) {
  if (item.openIn === 'popup') {
    await chrome.windows.create({ url, type: 'popup', width: 480, height: 740 });
    return;
  }
  if (item.openIn === 'current' && tabId) {
    await chrome.tabs.update(tabId, { url });
    return;
  }
  await chrome.tabs.create({ url });
}

function messageExtension(item) {
  if (!item.target) {
    return Promise.resolve({ ok: false, error: `${item.name} has no extension ID yet.` });
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(item.target, { type: 'THC_TOOL_DRAWER_OPEN', tool: item.name }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({
          ok: false,
          error:
            `${item.name} did not answer. It has to be installed, and its manifest must list ` +
            `this extension's ID under "externally_connectable". (${error.message})`
        });
        return;
      }
      resolve({ ok: true, response });
    });
  });
}

async function checkInstalled(extensionIds) {
  const hasPermission = await chrome.permissions.contains({ permissions: ['management'] });
  if (!hasPermission) return { ok: true, supported: false, installed: {} };

  const installed = {};
  await Promise.all(
    extensionIds.filter(Boolean).map(
      (id) =>
        new Promise((resolve) => {
          chrome.management.get(id, (info) => {
            installed[id] = Boolean(!chrome.runtime.lastError && info && info.enabled);
            resolve();
          });
        })
    )
  );
  return { ok: true, supported: true, installed };
}
