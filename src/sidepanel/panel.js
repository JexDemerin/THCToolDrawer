// The side panel: renders the catalog, launches tools, and hosts super-admin
// mode. Runs as an extension page, so chrome.* is available directly.

import { MSG, BUILT_IN_ICONS } from '../lib/constants.js';
import { openEditor, renderAdminBar, moveItem } from './admin.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  catalog: null,
  settings: null,
  meta: null,
  admin: false,
  hasManagement: false,
  installed: {},
  query: ''
};

// Shared with admin.js so the editor can read state and write it back.
const ctx = { state, save, toast, refresh, send, BUILT_IN_ICONS };

init();

async function init() {
  wire();
  await refresh();
  render();
  checkInstalled();

  // Opening the panel is the natural moment to look for a newer catalog.
  if (state.settings.syncOnOpen && state.settings.endpoint) {
    const result = await send({ type: MSG.SYNC_NOW });
    if (result.status === 'updated') {
      await refresh();
      render();
      toast(`Updated to v${result.version}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      void chrome.runtime.lastError;
      resolve(response || { ok: false, error: 'The extension did not respond.' });
    });
  });
}

async function refresh() {
  const response = await send({ type: MSG.GET_STATE });
  if (!response.ok) return;
  state.catalog = response.catalog;
  state.settings = response.settings;
  state.meta = response.meta;
  state.admin = response.admin;
  state.hasManagement = response.hasManagement;
}

/** Persist an edited catalog by writing it back to the spreadsheet. */
async function save(catalog) {
  const response = await send({ type: MSG.ADMIN_SAVE, catalog });
  if (!response.ok) {
    toast(response.error || 'Could not save to the sheet.', true);
    return false;
  }
  await refresh();
  render();
  return true;
}

async function checkInstalled() {
  const ids = [];
  for (const section of state.catalog.sections) {
    for (const item of section.items) {
      if (item.type !== 'app' && item.target && !ids.includes(item.target)) ids.push(item.target);
    }
  }
  if (!ids.length) return;

  const response = await send({ type: MSG.CHECK_INSTALLED, extensionIds: ids });
  if (response.ok && response.supported) {
    state.installed = response.installed;
    render();
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  if (!state.catalog) return;

  $('#brand-title').textContent = state.catalog.branding.title;
  $('#brand-subtitle').textContent = state.catalog.branding.subtitle;
  $('#version').textContent = state.catalog.version ? `v${state.catalog.version}` : '';
  $('#btn-admin').classList.toggle('on', state.admin);
  $('#admin-label').textContent = state.admin ? 'Admin mode on' : 'Super admin';

  renderStatus();
  renderTools();
}

function renderStatus() {
  const node = $('#status');
  const { lastSyncError, lastSyncAt } = state.meta;

  if (!state.settings.endpoint) {
    node.innerHTML = '<b>Not connected yet.</b> Open settings to add the spreadsheet link.';
    return;
  }
  if (lastSyncError) {
    node.innerHTML = `<b>Could not reach the sheet.</b> ${escapeHtml(lastSyncError)}`;
    return;
  }
  node.innerHTML = lastSyncAt
    ? `<b>Up to date.</b> Checked ${relativeTime(lastSyncAt)}.`
    : '<b>Ready.</b>';
}

function renderTools() {
  const root = $('#tools');
  root.replaceChildren();

  if (state.admin) root.appendChild(renderAdminBar(ctx));

  const query = state.query.trim().toLowerCase();
  let shown = 0;

  state.catalog.sections.forEach((section) => {
    const items = section.items.filter((item) => {
      if (!state.admin && !item.enabled) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        section.name.toLowerCase().includes(query)
      );
    });

    if (!items.length && !state.admin) return;

    const wrapper = document.createElement('section');
    wrapper.className = 'section';

    const head = document.createElement('h2');
    head.className = 'section-head';
    const label = document.createElement('span');
    label.textContent = section.name;
    const rule = document.createElement('span');
    rule.className = 'rule';
    head.append(label, rule);
    if (state.admin) {
      head.appendChild(
        mini('＋', 'Add a tool to this section', () => openEditor(ctx, { section: section.name }))
      );
    }
    wrapper.appendChild(head);

    items.forEach((item, index) => {
      wrapper.appendChild(renderTool(item, index, items.length));
      shown += 1;
    });

    root.appendChild(wrapper);
  });

  if (!shown) root.appendChild(renderEmpty(Boolean(query)));
}

function renderEmpty(searching) {
  const box = document.createElement('div');
  box.className = 'empty';

  if (searching) {
    box.textContent = `Nothing matches “${state.query}”.`;
    return box;
  }
  if (!state.settings.endpoint) {
    box.innerHTML = '<b>Not connected</b>The drawer needs the link to your spreadsheet.';
    const button = document.createElement('button');
    button.className = 'primary';
    button.type = 'button';
    button.textContent = 'Open settings';
    button.addEventListener('click', () => send({ type: MSG.OPEN_OPTIONS }));
    box.appendChild(document.createElement('br'));
    box.appendChild(button);
    return box;
  }
  box.innerHTML = '<b>No tools yet</b>Add the first one from the Tools tab of the sheet, or unlock super admin.';
  return box;
}

function renderTool(item, index, count) {
  const row = document.createElement('div');
  row.className = 'tool';
  if (!item.enabled) row.classList.add('off');

  const launcher = document.createElement('button');
  launcher.className = 'tool-launch';
  launcher.type = 'button';

  launcher.appendChild(renderIcon(item));

  const body = document.createElement('span');
  body.className = 'tool-body';

  const name = document.createElement('span');
  name.className = 'tool-name';
  const label = document.createElement('span');
  label.className = 'tool-label';
  label.textContent = item.name;
  name.appendChild(label);

  const missing = isMissing(item);
  if (missing) name.appendChild(chip('not installed', true));
  if (state.admin && !item.enabled) name.appendChild(chip('off', false));
  body.appendChild(name);

  if (item.description) {
    const desc = document.createElement('span');
    desc.className = 'tool-desc';
    desc.textContent = item.description;
    body.appendChild(desc);
  }

  launcher.appendChild(body);
  launcher.addEventListener('click', () => (missing ? offerInstall(item) : launch(item)));
  row.appendChild(launcher);

  if (state.admin) {
    const controls = document.createElement('span');
    controls.className = 'tool-admin';
    controls.appendChild(mini('✎', 'Edit', () => openEditor(ctx, { itemId: item.id })));

    // While a search filters the list, on-screen position no longer maps to
    // position in the sheet, so reordering would move things unpredictably.
    if (!state.query.trim()) {
      if (index > 0) controls.appendChild(mini('↑', 'Move up', () => moveItem(ctx, item.id, -1)));
      if (index < count - 1) {
        controls.appendChild(mini('↓', 'Move down', () => moveItem(ctx, item.id, 1)));
      }
    }
    row.appendChild(controls);
  }

  return row;
}

function renderIcon(item) {
  if (BUILT_IN_ICONS.includes(item.icon)) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tool-icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${item.icon}`);
    svg.appendChild(use);
    return svg;
  }

  const img = document.createElement('img');
  img.className = 'tool-icon';
  img.src = item.icon;
  img.alt = '';
  // A dead image URL should not leave a broken-image glyph in the row.
  img.addEventListener('error', () => {
    const fallback = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fallback.setAttribute('class', 'tool-icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', item.type === 'app' ? '#i-app' : '#i-link');
    fallback.appendChild(use);
    img.replaceWith(fallback);
  });
  return img;
}

function chip(text, missing) {
  const node = document.createElement('span');
  node.className = missing ? 'chip missing' : 'chip';
  node.textContent = text;
  return node;
}

function mini(label, title, handler) {
  const button = document.createElement('button');
  button.className = 'mini';
  button.type = 'button';
  button.title = title;
  button.textContent = label;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    handler();
  });
  return button;
}

function isMissing(item) {
  if (item.type === 'app' || !item.target || !state.hasManagement) return false;
  return state.installed[item.target] === false;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function launch(item) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await send({ type: MSG.LAUNCH, itemId: item.id, tabId: tab && tab.id });
  if (!response.ok) toast(response.error || 'Could not open that tool.', true);
}

function offerInstall(item) {
  if (item.installLink) {
    chrome.tabs.create({ url: item.installLink });
    return;
  }
  toast(`${item.name} is not installed, and no install link is set for it.`, true);
}

async function syncNow() {
  const button = $('#btn-sync');
  button.classList.add('spinning');
  const response = await send({ type: MSG.SYNC_NOW, force: true });
  button.classList.remove('spinning');

  await refresh();
  render();

  const messages = {
    updated: `Updated to v${response.version}.`,
    current: 'Already up to date.',
    'not-configured': 'No spreadsheet is connected yet.'
  };
  toast(messages[response.status] || response.error || 'Could not check.', response.status === 'error');
}

// ---------------------------------------------------------------------------
// Super admin
// ---------------------------------------------------------------------------

async function toggleAdmin() {
  if (state.admin) {
    await send({ type: MSG.ADMIN_LOCK });
    await refresh();
    render();
    toast('Admin mode off.');
    return;
  }

  if (!state.settings.endpoint) {
    toast('Connect the spreadsheet first, in settings.', true);
    return;
  }

  $('#unlock-password').value = '';
  $('#unlock-error').hidden = true;
  $('#unlock-modal').hidden = false;
  $('#unlock-password').focus();
}

async function submitUnlock(event) {
  event.preventDefault();
  const error = $('#unlock-error');
  const submit = $('#unlock-submit');

  submit.disabled = true;
  submit.textContent = 'Checking…';
  const response = await send({ type: MSG.ADMIN_VERIFY, password: $('#unlock-password').value });
  submit.disabled = false;
  submit.textContent = 'Unlock';

  if (!response.ok) {
    error.textContent = response.error;
    error.hidden = false;
    return;
  }
  if (!response.valid) {
    error.textContent = 'That password is not right.';
    error.hidden = false;
    return;
  }

  await refresh();
  $('#unlock-modal').hidden = true;
  render();
  toast('Admin mode on. Edits save straight to the sheet.');
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wire() {
  $('#btn-sync').addEventListener('click', syncNow);
  $('#btn-settings').addEventListener('click', () => send({ type: MSG.OPEN_OPTIONS }));
  $('#btn-admin').addEventListener('click', toggleAdmin);
  $('#unlock-form').addEventListener('submit', submitUnlock);

  $('#search').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderTools();
  });

  for (const button of document.querySelectorAll('[data-close]')) {
    button.addEventListener('click', () => {
      $(`#${button.dataset.close}`).hidden = true;
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal')].find((modal) => !modal.hidden);
    if (open) open.hidden = true;
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === MSG.CATALOG_CHANGED) refresh().then(render);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let toastTimer = null;
function toast(message, isError = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', isError);
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, isError ? 7000 : 3400);
}

function relativeTime(timestamp) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}
