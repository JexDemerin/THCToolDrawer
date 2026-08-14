// Super-admin editing: the toolbar and the tool editor.
//
// Every function takes the panel's `ctx` ({ state, save, toast, refresh, send })
// so this module holds no state of its own — it reads the live catalog, builds a
// modified copy, and hands it back to ctx.save(), which writes it to the sheet.

import { MSG, TYPES } from '../lib/constants.js';
import { newId, isValidExtensionId, findItem, moveWithinSection, sectionNameFor } from '../lib/catalog.js';

const $ = (selector) => document.querySelector(selector);

let editingId = null;

// ---------------------------------------------------------------------------
// Admin toolbar
// ---------------------------------------------------------------------------

export function renderAdminBar(ctx) {
  const bar = document.createElement('div');
  bar.className = 'admin-bar';

  bar.appendChild(
    button('＋ Add app', 'primary', () => openEditor(ctx, { type: TYPES.APP }))
  );
  bar.appendChild(
    button('＋ Add extension', 'primary', () => openEditor(ctx, { type: TYPES.EXTENSION }))
  );
  bar.appendChild(button('⚙ Settings', 'small', () => ctx.send({ type: MSG.OPEN_OPTIONS })));

  if (!ctx.state.hasManagement) {
    bar.appendChild(
      button('Enable install checks', 'small', async () => {
        // Must be inside a user gesture, which a click is.
        const granted = await chrome.permissions.request({ permissions: ['management'] });
        if (!granted) {
          ctx.toast('Permission declined — install badges stay off.', true);
          return;
        }
        location.reload();
      })
    );
  }

  return bar;
}

function button(label, className, handler) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  node.addEventListener('click', handler);
  return node;
}

// ---------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------

export async function moveItem(ctx, itemId, delta) {
  const items = moveWithinSection(ctx.state.catalog, itemId, delta);
  if (!items) return;
  const next = { ...structuredClone(ctx.state.catalog), items };
  if (await ctx.save(next)) ctx.toast('Order saved to the sheet.');
}

// ---------------------------------------------------------------------------
// Tool editor
// ---------------------------------------------------------------------------

export function openEditor(ctx, options = {}) {
  const existing = options.itemId ? findItem(ctx.state.catalog, options.itemId) : null;
  editingId = existing ? existing.id : null;

  const item = existing || {
    name: '',
    description: '',
    icon: options.type === TYPES.APP ? 'app' : 'link',
    type: options.type || TYPES.APP,
    target: '',
    openIn: 'tab',
    installLink: '',
    enabled: true
  };

  $('#item-title').textContent = existing
    ? 'Edit tool'
    : `Add to ${sectionNameFor(item.type)}`;
  $('#f-name').value = item.name;
  $('#f-description').value = item.description;
  $('#f-type').value = item.type;
  $('#f-url').value = item.type === TYPES.APP ? item.target : '';
  $('#f-extension-id').value = item.type === TYPES.APP ? '' : item.target;
  $('#f-open-in').value = item.openIn;
  $('#f-install').value = item.installLink;
  $('#f-enabled').checked = item.enabled !== false;

  fillIcons(ctx, item.icon);

  $('#btn-delete').hidden = !existing;
  $('#item-error').hidden = true;
  $('#item-modal').hidden = false;
  syncFields();
  $('#f-name').focus();

  // Rebind each time so handlers always close over the current ctx.
  bindOnce($('#item-form'), 'submit', (event) => submit(event, ctx));
  bindOnce($('#f-type'), 'change', syncFields);
  armDelete($('#btn-delete'), 'Delete', () => remove(ctx));
}

function fillIcons(ctx, selected) {
  const select = $('#f-icon');
  select.replaceChildren();
  for (const name of ctx.BUILT_IN_ICONS) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }
  // An icon coming from the sheet as a URL is kept as its own option so that
  // editing a tool does not silently replace custom artwork with a built-in.
  if (selected && !ctx.BUILT_IN_ICONS.includes(selected)) {
    const option = document.createElement('option');
    option.value = selected;
    option.textContent = 'custom image';
    select.appendChild(option);
  }
  select.value = selected;
}

/** Show only the fields that matter for the chosen type. */
function syncFields() {
  const type = $('#f-type').value;
  for (const node of document.querySelectorAll('[data-when]')) {
    node.hidden = !node.dataset.when.split(' ').includes(type);
  }
}

async function submit(event, ctx) {
  event.preventDefault();
  const error = $('#item-error');
  const type = $('#f-type').value;

  let target;
  if (type === TYPES.APP) {
    target = $('#f-url').value.trim();
    if (!/^https?:\/\//i.test(target)) {
      return fail(error, 'Enter a full link starting with http:// or https://');
    }
  } else {
    target = $('#f-extension-id').value.trim();
    if (!isValidExtensionId(target)) {
      return fail(
        error,
        'Extension IDs are 32 letters (a–p). Copy it from chrome://extensions with developer mode on.'
      );
    }
  }

  const payload = {
    id: editingId || newId('item'),
    name: $('#f-name').value.trim(),
    description: $('#f-description').value.trim(),
    icon: $('#f-icon').value,
    type,
    target,
    openIn: $('#f-open-in').value,
    installLink: $('#f-install').value.trim(),
    enabled: $('#f-enabled').checked
  };

  const next = structuredClone(ctx.state.catalog);
  const at = next.items.findIndex((entry) => entry.id === editingId);

  if (at === -1) next.items.push(payload);
  // Editing in place keeps the tool where it sits, even if its type changed —
  // the section it appears in follows the type on its own.
  else next.items[at] = payload;

  setBusy(true);
  const saved = await ctx.save(next);
  setBusy(false);

  if (saved) {
    $('#item-modal').hidden = true;
    ctx.toast(editingId ? 'Saved to the sheet.' : 'Added. Your team gets it on their next check.');
  }
}

async function remove(ctx) {
  if (!editingId) return;

  const next = structuredClone(ctx.state.catalog);
  next.items = next.items.filter((entry) => entry.id !== editingId);

  setBusy(true);
  const saved = await ctx.save(next);
  setBusy(false);

  if (saved) {
    $('#item-modal').hidden = true;
    ctx.toast('Removed from the sheet.');
  }
}

function setBusy(busy) {
  for (const node of $('#item-form').querySelectorAll('button')) node.disabled = busy;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(node, message) {
  node.textContent = message;
  node.hidden = false;
  return false;
}

/**
 * Two-click delete. window.confirm() is unavailable in some extension surfaces,
 * and a silent no-op would be worse than an extra click.
 */
function armDelete(node, restingLabel, onConfirm) {
  let armed = false;
  let timer = null;

  const reset = () => {
    armed = false;
    node.textContent = restingLabel;
    clearTimeout(timer);
  };

  reset();
  bindOnce(node, 'click', () => {
    if (armed) {
      reset();
      onConfirm();
      return;
    }
    armed = true;
    node.textContent = 'Click again to confirm';
    timer = setTimeout(reset, 4000);
  });
}

/** Replace any previous listener of the same type, so reopening the editor
    does not stack handlers. */
const bound = new WeakMap();
function bindOnce(element, type, handler) {
  const previous = bound.get(element) || {};
  if (previous[type]) element.removeEventListener(type, previous[type]);
  element.addEventListener(type, handler);
  previous[type] = handler;
  bound.set(element, previous);
}
