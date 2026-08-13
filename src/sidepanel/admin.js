// Super-admin editing: the toolbar and the tool editor.
//
// Every function takes the panel's `ctx` ({ state, save, toast, refresh, send })
// so this module holds no state of its own — it reads the live catalog, builds a
// modified copy, and hands it back to ctx.save(), which writes it to the sheet.

import { MSG, TYPES } from '../lib/constants.js';
import { newId, isValidExtensionId } from '../lib/catalog.js';

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
    button('＋ Add extension', 'primary', () =>
      openEditor(ctx, { type: TYPES.EXTENSION_MESSAGE })
    )
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
  const next = structuredClone(ctx.state.catalog);
  for (const section of next.sections) {
    const index = section.items.findIndex((item) => item.id === itemId);
    if (index === -1) continue;
    const target = index + delta;
    if (target < 0 || target >= section.items.length) return;
    const [moved] = section.items.splice(index, 1);
    section.items.splice(target, 0, moved);
    if (await ctx.save(next)) ctx.toast('Order saved to the sheet.');
    return;
  }
}

// ---------------------------------------------------------------------------
// Tool editor
// ---------------------------------------------------------------------------

export function openEditor(ctx, options = {}) {
  const found = options.itemId ? locate(ctx.state.catalog, options.itemId) : null;
  editingId = found ? found.item.id : null;

  const item = found
    ? found.item
    : {
        name: '',
        description: '',
        icon: options.type === TYPES.APP ? 'app' : 'link',
        type: options.type || TYPES.APP,
        target: '',
        openIn: 'tab',
        installLink: '',
        enabled: true
      };
  const sectionName = found
    ? found.section.name
    : options.section || (ctx.state.catalog.sections[0] || {}).name || 'Tools';

  $('#item-title').textContent = found ? 'Edit tool' : 'Add a tool';
  $('#f-name').value = item.name;
  $('#f-description').value = item.description;
  $('#f-type').value = item.type;
  $('#f-url').value = item.type === TYPES.APP ? item.target : '';
  $('#f-extension-id').value = item.type === TYPES.APP ? '' : item.target;
  $('#f-open-in').value = item.openIn;
  $('#f-install').value = item.installLink;
  $('#f-section').value = sectionName;
  $('#f-enabled').checked = item.enabled !== false;

  fillIcons(ctx, item.icon);
  fillSections(ctx);

  $('#btn-delete').hidden = !found;
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

function fillSections(ctx) {
  const list = $('#section-list');
  list.replaceChildren();
  for (const section of ctx.state.catalog.sections) {
    const option = document.createElement('option');
    option.value = section.name;
    list.appendChild(option);
  }
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

  const sectionName = $('#f-section').value.trim();
  if (!sectionName) return fail(error, 'Give the tool a section.');

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

  // Drop the old copy wherever it lived, in case the section changed.
  if (editingId) {
    for (const section of next.sections) {
      const index = section.items.findIndex((entry) => entry.id === editingId);
      if (index !== -1) {
        section.items.splice(index, 1);
        break;
      }
    }
  }

  let section = next.sections.find((entry) => entry.name === sectionName);
  if (!section) {
    section = { id: newId('sec'), name: sectionName, items: [] };
    next.sections.push(section);
  }
  section.items.push(payload);

  // Sections left empty by a move would vanish from the sheet anyway, since the
  // sheet stores rows, not groups.
  next.sections = next.sections.filter((entry) => entry.items.length);

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
  for (const section of next.sections) {
    const index = section.items.findIndex((entry) => entry.id === editingId);
    if (index !== -1) {
      section.items.splice(index, 1);
      break;
    }
  }
  next.sections = next.sections.filter((entry) => entry.items.length);

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

function locate(catalog, itemId) {
  for (const section of catalog.sections) {
    const item = section.items.find((entry) => entry.id === itemId);
    if (item) return { section, item };
  }
  return null;
}

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
