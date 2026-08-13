// Service worker: catalog sync, launching tools, and the toolbar/keyboard entry
// points into the drawer.

import { MSG, ALARM_SYNC, ACTION_TYPES } from '../lib/constants.js';
import { DEFAULT_CONFIG } from '../lib/defaults.js';
import {
  normalizeConfig,
  deepClone,
  findItem,
  renderTemplate,
  usesTemplate,
  shouldShowOnUrl
} from '../lib/config.js';
import {
  getConfig,
  setConfig,
  getSync,
  getUi,
  setUi,
  getMeta,
  setMeta
} from '../lib/storage.js';
import { pullRemoteConfig, publishConfig } from '../lib/sync.js';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = await chrome.storage.local.get('config');
  if (!existing.config) {
    await setConfig(deepClone(DEFAULT_CONFIG));
  }
  await scheduleSync();
  await pullRemoteConfig();

  // Tabs that were already open have no content script yet. Inject so the
  // drawer works right after install without asking anyone to reload.
  if (details.reason === 'install' || details.reason === 'update') {
    await injectIntoOpenTabs();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleSync();
  await pullRemoteConfig();
});

async function scheduleSync() {
  const sync = await getSync();
  const minutes = Math.max(5, Number(sync.pollMinutes) || 30);
  await chrome.alarms.clear(ALARM_SYNC);
  chrome.alarms.create(ALARM_SYNC, { periodInMinutes: minutes, delayInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_SYNC) return;
  const result = await pullRemoteConfig();
  if (result.status === 'updated') broadcastConfigChanged();
});

async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(
    tabs.map((tab) =>
      chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: ['src/content/mount.js'] })
        .catch(() => {
          // Restricted pages (web store, other extensions' pages) simply refuse.
        })
    )
  );
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener((tab) => toggleDrawer(tab.id));

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-drawer') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) toggleDrawer(tab.id);
});

async function toggleDrawer(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.TOGGLE_DRAWER });
  } catch {
    // No content script on this page yet — inject, then try once more.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content/mount.js']
      });
      await chrome.tabs.sendMessage(tabId, { type: MSG.TOGGLE_DRAWER });
    } catch {
      // Chrome-internal page. Nothing sensible to do.
    }
  }
}

function broadcastConfigChanged() {
  chrome.runtime.sendMessage({ type: MSG.CONFIG_CHANGED }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
  return true; // keep the channel open for the async reply
});

async function handleMessage(message, sender) {
  switch (message && message.type) {
    case MSG.GET_MOUNT_STATE:
      return getMountState(sender);

    case MSG.SET_UI:
      await setUi(message.patch || {});
      return { ok: true };

    case MSG.GET_STATE:
      return getDrawerState();

    case MSG.LAUNCH:
      // The drawer is an iframe inside the page, so the sender carries the tab
      // whose URL/title/selection a templated link should draw from.
      return launchItem(message.itemId, message.tabId || (sender.tab && sender.tab.id));

    case MSG.SYNC_NOW: {
      const result = await pullRemoteConfig({ force: Boolean(message.force) });
      if (result.status === 'updated') broadcastConfigChanged();
      return { ok: result.status !== 'error', ...result };
    }

    case MSG.SAVE_CONFIG:
      return saveConfig(message.config);

    case MSG.PUBLISH_CONFIG: {
      const result = await publishConfig({ editor: message.editor });
      return { ok: result.status !== 'error', ...result };
    }

    case MSG.DISCARD_LOCAL: {
      await setMeta({ dirty: false, pendingRemoteVersion: null, lastRemoteVersion: null });
      const result = await pullRemoteConfig({ force: true });
      broadcastConfigChanged();
      return { ok: result.status !== 'error', ...result };
    }

    case MSG.CHECK_INSTALLED:
      return checkInstalled(message.extensionIds || []);

    case MSG.GET_SELECTION:
      return {
        ok: true,
        selection: await readSelection(message.tabId || (sender.tab && sender.tab.id))
      };

    case MSG.OPEN_OPTIONS:
      await chrome.runtime.openOptionsPage();
      return { ok: true };

    default:
      return { ok: false, error: `Unknown message: ${message && message.type}` };
  }
}

async function getMountState(sender) {
  const config = await getConfig();
  const ui = await getUi();
  const url = (sender && sender.tab && sender.tab.url) || '';
  return {
    ok: true,
    shouldMount: shouldShowOnUrl(config, url),
    side: config.settings.side,
    handleLabel: config.settings.handleLabel,
    accent: config.branding.accent,
    ui
  };
}

async function getDrawerState() {
  const [config, sync, ui, meta] = await Promise.all([
    getConfig(),
    getSync(),
    getUi(),
    getMeta()
  ]);
  const hasManagement = await chrome.permissions.contains({ permissions: ['management'] });
  return { ok: true, config, sync, ui, meta, hasManagement };
}

async function saveConfig(incoming) {
  const next = normalizeConfig(incoming);
  const current = await getConfig();
  const meta = await getMeta();

  // Every save moves the catalog forward, so a published copy always outranks
  // whatever teammates are holding.
  const floor = Math.max(current.version, meta.lastRemoteVersion || 0);
  next.version = floor + 1;
  next.updatedAt = new Date().toISOString();

  await setConfig(next);
  await setMeta({ dirty: true });
  broadcastConfigChanged();
  return { ok: true, version: next.version };
}

// ---------------------------------------------------------------------------
// Launching
// ---------------------------------------------------------------------------

async function launchItem(itemId, tabId) {
  const config = await getConfig();
  const item = findItem(config, itemId);
  if (!item) return { ok: false, error: 'That button is no longer in the catalog.' };
  if (!item.enabled) return { ok: false, error: `${item.name} is turned off.` };

  const action = item.action;

  if (action.type === ACTION_TYPES.EXTENSION_MESSAGE) {
    return sendToExtension(item);
  }

  let url;
  if (action.type === ACTION_TYPES.EXTENSION_PAGE) {
    if (!action.extensionId) {
      return { ok: false, error: `${item.name} has no extension ID set yet.` };
    }
    url = `chrome-extension://${action.extensionId}/${action.path}`;
  } else {
    if (!action.url) return { ok: false, error: `${item.name} has no link set yet.` };
    url = usesTemplate(action.url)
      ? renderTemplate(action.url, await buildContext(tabId))
      : action.url;
  }

  try {
    await openUrl(url, action, tabId);
    return { ok: true };
  } catch (error) {
    const detail = String((error && error.message) || error);
    if (action.type === ACTION_TYPES.EXTENSION_PAGE) {
      return {
        ok: false,
        error:
          `Chrome would not open ${item.name}'s page. That extension has to list ` +
          `"${action.path}" in its web_accessible_resources, or you can switch this ` +
          `button to "Send a message" instead. (${detail})`
      };
    }
    return { ok: false, error: detail };
  }
}

async function buildContext(tabId) {
  const context = { url: '', title: '', selection: '', date: new Date().toISOString().slice(0, 10) };
  if (!tabId) return context;
  try {
    const tab = await chrome.tabs.get(tabId);
    context.url = tab.url || '';
    context.title = tab.title || '';
  } catch {
    // Tab closed underneath us.
  }
  context.selection = await readSelection(tabId);
  return context;
}

async function readSelection(tabId) {
  if (!tabId) return '';
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => String(window.getSelection() || '')
    });
    return (result && result.result) || '';
  } catch {
    return '';
  }
}

async function openUrl(url, action, tabId) {
  if (action.target === 'popup') {
    const size = action.popup || { width: 460, height: 720 };
    await chrome.windows.create({
      url,
      type: 'popup',
      width: Math.round(size.width),
      height: Math.round(size.height)
    });
    return;
  }
  if (action.target === 'current' && tabId) {
    await chrome.tabs.update(tabId, { url });
    return;
  }
  await chrome.tabs.create({ url });
}

function sendToExtension(item) {
  const { extensionId, message } = item.action;
  if (!extensionId) {
    return Promise.resolve({ ok: false, error: `${item.name} has no extension ID set yet.` });
  }

  let payload;
  try {
    payload = JSON.parse(message || '{}');
  } catch {
    return Promise.resolve({ ok: false, error: `${item.name} has an invalid JSON message.` });
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(extensionId, payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({
          ok: false,
          error:
            `${item.name} did not answer. It must be installed and must list this ` +
            `extension's ID in its manifest "externally_connectable" section. (${error.message})`
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

// Keep the poll interval honest when an admin changes it in options.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sync) scheduleSync();
});
