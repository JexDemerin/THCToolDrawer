// The drawer panel: renders the catalog, launches tools, and hosts super-admin
// mode. Runs as an extension page inside an iframe injected by the content
// script, so chrome.* is available directly.

import { MSG, SESSION, ADMIN_SESSION_MS } from '../lib/constants.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { openItemEditor, openSectionEditor, renderAdminBar, moveItem, moveSection } from './admin.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  config: null,
  sync: null,
  ui: null,
  meta: null,
  hasManagement: false,
  installed: {},
  admin: false,
  query: ''
};

// Shared with admin.js so the editor can read state and write it back.
const ctx = { state, save, toast, refresh, send };

init();

async function init() {
  wireChrome();
  wireControls();
  await refresh();
  state.admin = await isUnlocked();
  render();
  checkInstalled();
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
  state.config = response.config;
  state.sync = response.sync;
  state.ui = response.ui;
  state.meta = response.meta;
  state.hasManagement = response.hasManagement;
}

/** Persist an edited catalog. The service worker bumps the version. */
async function save(config) {
  const response = await send({ type: MSG.SAVE_CONFIG, config });
  if (!response.ok) {
    toast(response.error || 'Could not save.', true);
    return false;
  }
  await refresh();
  render();
  return true;
}

async function checkInstalled() {
  const ids = [];
  for (const section of state.config.sections) {
    for (const item of section.items) {
      const id = item.action.extensionId;
      if (id && !ids.includes(id)) ids.push(id);
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
  if (!state.config) return;
  const { branding, settings } = state.config;

  $('#brand-title').textContent = branding.title;
  $('#brand-subtitle').textContent = branding.subtitle;
  document.documentElement.style.setProperty('--accent', branding.accent);
  $('#version-tag').textContent = `v${state.config.version}`;
  $('#btn-pin').classList.toggle('active', Boolean(state.ui.pinned));
  $('#btn-admin').classList.toggle('on', state.admin);
  $('#admin-label').textContent = state.admin ? 'Admin mode on' : 'Super admin';

  // Tell the host page about branding it renders itself.
  postToHost({ type: 'accent', accent: branding.accent });
  postToHost({ type: 'label', label: settings.handleLabel });

  renderNotice();
  renderTools();
}

function renderNotice() {
  const notice = $('#notice');
  const parts = [];

  if (state.meta.pendingRemoteVersion) {
    parts.push({
      html: `<strong>Someone else published v${state.meta.pendingRemoteVersion}.</strong> You have unpublished edits, so it is being held back.`,
      actions: [
        { label: 'Take theirs', action: discardLocal },
        { label: 'Keep mine', action: () => toast('Publish from admin mode to push your edits.') }
      ]
    });
  } else if (state.meta.dirty) {
    parts.push({
      html: `<strong>Unpublished edits.</strong> Teammates will not see them until you publish.`,
      actions: state.admin ? [{ label: 'Publish now', action: publish }] : []
    });
  }

  if (state.meta.lastSyncError) {
    parts.push({ html: `<strong>Sync failed.</strong> ${escapeHtml(state.meta.lastSyncError)}` });
  } else if (!state.sync.configUrl) {
    parts.push({
      html: `<strong>Running locally.</strong> Set a catalog URL so this drawer stays in step with the team.`,
      actions: [{ label: 'Open settings', action: () => send({ type: MSG.OPEN_OPTIONS }) }]
    });
  }

  if (!parts.length) {
    notice.hidden = true;
    notice.replaceChildren();
    return;
  }

  notice.hidden = false;
  notice.replaceChildren();
  for (const part of parts) {
    const block = document.createElement('div');
    block.innerHTML = part.html;
    if (part.actions && part.actions.length) {
      const row = document.createElement('div');
      row.className = 'notice-actions';
      for (const entry of part.actions) {
        const button = document.createElement('button');
        button.className = 'small';
        button.type = 'button';
        button.textContent = entry.label;
        button.addEventListener('click', entry.action);
        row.appendChild(button);
      }
      block.appendChild(row);
    }
    notice.appendChild(block);
  }
}

function renderTools() {
  const root = $('#tools');
  root.replaceChildren();

  if (state.admin) root.appendChild(renderAdminBar(ctx));

  const query = state.query.trim().toLowerCase();
  let shown = 0;

  state.config.sections.forEach((section, sectionIndex) => {
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
    wrapper.appendChild(renderSectionHead(section, sectionIndex));

    items.forEach((item, itemIndex) => {
      wrapper.appendChild(renderTool(section, item, itemIndex, items.length));
      shown += 1;
    });

    root.appendChild(wrapper);
  });

  if (!shown) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = query
      ? `Nothing matches “${state.query}”.`
      : 'No tools yet. Unlock super admin to add the first one.';
    root.appendChild(empty);
  }
}

function renderSectionHead(section, sectionIndex) {
  const head = document.createElement('h2');
  head.className = 'section-head';

  const label = document.createElement('span');
  label.textContent = section.name;
  head.appendChild(label);

  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  head.appendChild(spacer);

  if (state.admin) {
    head.appendChild(
      miniButton('↑', 'Move section up', () => moveSection(ctx, sectionIndex, -1))
    );
    head.appendChild(
      miniButton('↓', 'Move section down', () => moveSection(ctx, sectionIndex, 1))
    );
    head.appendChild(miniButton('✎', 'Rename section', () => openSectionEditor(ctx, section.id)));
    head.appendChild(
      miniButton('＋', 'Add a tool here', () => openItemEditor(ctx, { sectionId: section.id }))
    );
  }

  return head;
}

function renderTool(section, item, itemIndex, itemCount) {
  const row = document.createElement('div');
  row.className = 'tool';
  if (!item.enabled) row.classList.add('disabled');

  const icon = document.createElement('div');
  icon.className = 'tool-icon';
  icon.textContent = item.icon;

  const body = document.createElement('div');
  body.className = 'tool-body';

  const name = document.createElement('div');
  name.className = 'tool-name';

  // The label is its own element so it can ellipsize instead of wrapping the
  // row when a badge sits next to a long tool name.
  const label = document.createElement('span');
  label.className = 'tool-label';
  label.textContent = item.name;
  name.appendChild(label);

  const missing = isMissing(item);
  if (missing) {
    const badge = document.createElement('span');
    badge.className = 'badge missing';
    badge.textContent = 'not installed';
    name.appendChild(badge);
  }
  if (state.admin && !item.enabled) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'off';
    name.appendChild(badge);
  }

  body.appendChild(name);
  if (item.description) {
    const desc = document.createElement('div');
    desc.className = 'tool-desc';
    desc.textContent = item.description;
    body.appendChild(desc);
  }

  // The row is the launch target; admin controls sit beside it, not inside it,
  // so clicking edit never fires the tool.
  const launcher = document.createElement('button');
  launcher.className = 'tool-launch';
  launcher.type = 'button';
  launcher.append(icon, body);
  launcher.addEventListener('click', () => (missing ? offerInstall(item) : launch(item)));

  row.appendChild(launcher);

  if (state.admin) {
    const controls = document.createElement('div');
    controls.className = 'tool-admin';
    controls.appendChild(miniButton('✎', 'Edit', () => openItemEditor(ctx, { itemId: item.id })));

    // While a search is filtering the list, on-screen position no longer maps to
    // position in the catalog, so reordering would move things unpredictably.
    if (!state.query.trim()) {
      if (itemIndex > 0) {
        controls.appendChild(miniButton('↑', 'Move up', () => moveItem(ctx, item.id, -1)));
      }
      if (itemIndex < itemCount - 1) {
        controls.appendChild(miniButton('↓', 'Move down', () => moveItem(ctx, item.id, 1)));
      }
    }
    row.appendChild(controls);
  }

  return row;
}

function miniButton(label, title, handler) {
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
  const id = item.action.extensionId;
  if (!id || !state.hasManagement) return false;
  return state.installed[id] === false;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function launch(item) {
  const response = await send({ type: MSG.LAUNCH, itemId: item.id });
  if (!response.ok) {
    toast(response.error || 'Could not open that tool.', true);
    return;
  }
  if (!state.ui.pinned) postToHost({ type: 'close' });
}

function offerInstall(item) {
  const url = item.install.webStoreUrl;
  if (url) {
    chrome.tabs.create({ url });
    return;
  }
  toast(`${item.name} is not installed, and no install link is set for it.`, true);
}

async function syncNow() {
  const button = $('#btn-sync');
  button.classList.add('spinning');
  const response = await send({ type: MSG.SYNC_NOW });
  button.classList.remove('spinning');

  await refresh();
  render();

  const messages = {
    updated: `Updated to v${response.version}.`,
    current: 'Already up to date.',
    held: 'Remote update held back — you have unpublished edits.',
    'not-configured': 'No catalog URL is set yet.'
  };
  toast(messages[response.status] || response.error || 'Sync failed.', response.status === 'error');
}

async function publish() {
  const response = await send({ type: MSG.PUBLISH_CONFIG, editor: null });
  await refresh();
  render();

  if (!response.ok) {
    toast(response.error || 'Publish failed.', true);
    return;
  }
  if (response.status === 'manual') {
    downloadJson(response.json, 'thc-tool-drawer.json');
    toast('Catalog downloaded. Upload it where the team pulls from.');
    return;
  }
  toast(`Published v${response.version}. Teammates pick it up on their next sync.`);
}

async function discardLocal() {
  const response = await send({ type: MSG.DISCARD_LOCAL });
  await refresh();
  render();
  toast(response.ok ? 'Local edits discarded.' : response.error || 'Could not reset.', !response.ok);
}

function downloadJson(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------------------------------------------------------------------------
// Super admin gate
// ---------------------------------------------------------------------------

async function isUnlocked() {
  const bag = await chrome.storage.session.get(SESSION.ADMIN_UNTIL);
  const until = bag[SESSION.ADMIN_UNTIL] || 0;
  return until > Date.now();
}

async function markUnlocked() {
  await chrome.storage.session.set({ [SESSION.ADMIN_UNTIL]: Date.now() + ADMIN_SESSION_MS });
}

async function toggleAdmin() {
  if (state.admin) {
    state.admin = false;
    await chrome.storage.session.remove(SESSION.ADMIN_UNTIL);
    render();
    toast('Admin mode off.');
    return;
  }
  openUnlockModal();
}

function openUnlockModal() {
  const firstRun = !state.config.admin.passwordHash;
  $('#unlock-title').textContent = firstRun ? 'Set a super-admin password' : 'Super admin';
  $('#unlock-copy').textContent = firstRun
    ? 'No password is set yet. Choose one now — it travels with the catalog, so it works on every teammate’s copy.'
    : 'Enter the super-admin password to edit the drawer.';
  $('#unlock-confirm').hidden = !firstRun;
  $('#unlock-confirm').required = firstRun;
  $('#unlock-submit').textContent = firstRun ? 'Set password' : 'Unlock';
  $('#unlock-password').value = '';
  $('#unlock-confirm').value = '';
  $('#unlock-error').hidden = true;
  $('#unlock-modal').hidden = false;
  $('#unlock-password').focus();
}

async function submitUnlock(event) {
  event.preventDefault();
  const password = $('#unlock-password').value;
  const error = $('#unlock-error');
  const firstRun = !state.config.admin.passwordHash;

  if (firstRun) {
    if (password.length < 8) {
      error.textContent = 'Use at least 8 characters.';
      error.hidden = false;
      return;
    }
    if (password !== $('#unlock-confirm').value) {
      error.textContent = 'The two passwords do not match.';
      error.hidden = false;
      return;
    }
    const credential = await hashPassword(password, state.config.admin.iterations);
    const next = structuredClone(state.config);
    next.admin = credential;
    if (!(await save(next))) return;
  } else {
    const valid = await verifyPassword(password, state.config.admin);
    if (!valid) {
      error.textContent = 'That password is not right.';
      error.hidden = false;
      return;
    }
  }

  await markUnlocked();
  state.admin = true;
  $('#unlock-modal').hidden = true;
  render();
  toast('Admin mode on. Publish when you are done so the team gets your changes.');
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wireControls() {
  $('#btn-close').addEventListener('click', () => postToHost({ type: 'close' }));
  $('#btn-sync').addEventListener('click', syncNow);
  $('#btn-admin').addEventListener('click', toggleAdmin);
  $('#unlock-form').addEventListener('submit', submitUnlock);

  $('#btn-pin').addEventListener('click', async () => {
    const pinned = !state.ui.pinned;
    await send({ type: MSG.SET_UI, patch: { pinned } });
    state.ui.pinned = pinned;
    postToHost({ type: 'pinned', pinned });
    render();
    toast(pinned ? 'Drawer stays open on every page.' : 'Drawer closes after each launch.');
  });

  $('#search').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderTools();
  });

  for (const button of document.querySelectorAll('[data-close-modal]')) {
    button.addEventListener('click', () => {
      $(`#${button.dataset.closeModal}`).hidden = true;
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal')].find((modal) => !modal.hidden);
    if (open) {
      open.hidden = true;
      return;
    }
    postToHost({ type: 'close' });
  });

  // Expose publish to the admin bar in admin.js.
  ctx.publish = publish;
  ctx.discardLocal = discardLocal;
  ctx.syncNow = syncNow;
}

function wireChrome() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === MSG.CONFIG_CHANGED) {
      refresh().then(render);
    }
  });

  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || data.source !== 'thc-tool-drawer-host') return;
    if (data.type !== 'opened') return;

    // Opening the drawer is the natural moment to look for a newer catalog.
    await refresh();
    state.admin = await isUnlocked();
    render();
    if (state.sync.syncOnOpen && state.sync.configUrl) {
      const response = await send({ type: MSG.SYNC_NOW });
      if (response.status === 'updated') {
        await refresh();
        render();
        toast(`Updated to v${response.version}.`);
      }
    }
  });
}

function postToHost(payload) {
  // '*' because the panel cannot know the host page's origin, and the host page
  // can read anything posted to it. Only non-sensitive UI signals go this way —
  // open/close, accent colour, handle label.
  parent.postMessage({ source: 'thc-tool-drawer', ...payload }, '*');
}

let toastTimer = null;
function toast(message, isError = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', isError);
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, isError ? 6500 : 3200);
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}
