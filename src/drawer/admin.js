// Super-admin editing: the toolbar, the tool editor, and the section editor.
//
// Every function here takes the drawer's `ctx` ({ state, save, toast, refresh })
// so this module holds no state of its own — it reads the live catalog, builds a
// modified copy, and hands it back to ctx.save().

import { newId } from '../lib/config.js';
import { MSG, ACTION_TYPES } from '../lib/constants.js';

const $ = (selector) => document.querySelector(selector);

// Remembers what the open editor is editing.
let editing = { itemId: null, sectionId: null };
let editingSectionId = null;

// ---------------------------------------------------------------------------
// Admin toolbar
// ---------------------------------------------------------------------------

export function renderAdminBar(ctx) {
  const bar = document.createElement('div');
  bar.className = 'admin-bar';

  bar.appendChild(
    barButton('＋ Add app', 'primary', () =>
      openItemEditor(ctx, { kind: 'app', actionType: ACTION_TYPES.OPEN_URL })
    )
  );
  bar.appendChild(
    barButton('＋ Add extension', 'primary', () =>
      openItemEditor(ctx, { kind: 'extension', actionType: ACTION_TYPES.EXTENSION_PAGE })
    )
  );
  bar.appendChild(barButton('＋ Section', 'small', () => openSectionEditor(ctx, null)));
  bar.appendChild(
    barButton(ctx.state.meta.dirty ? '⇧ Publish •' : '⇧ Publish', 'small', () => ctx.publish())
  );
  bar.appendChild(barButton('⚙ Settings', 'small', () => ctx.send({ type: MSG.OPEN_OPTIONS })));

  if (!ctx.state.hasManagement) {
    bar.appendChild(
      barButton('Enable install checks', 'small', async () => {
        // Must be inside a user gesture, which a click is.
        const granted = await chrome.permissions.request({ permissions: ['management'] });
        if (!granted) {
          ctx.toast('Permission declined — install badges stay off.', true);
          return;
        }
        await ctx.refresh();
        ctx.toast('Install badges are on.');
        location.reload();
      })
    );
  }

  return bar;
}

function barButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

// ---------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------

export async function moveItem(ctx, itemId, delta) {
  const next = structuredClone(ctx.state.config);
  for (const section of next.sections) {
    const index = section.items.findIndex((item) => item.id === itemId);
    if (index === -1) continue;
    const target = index + delta;
    if (target < 0 || target >= section.items.length) return;
    const [moved] = section.items.splice(index, 1);
    section.items.splice(target, 0, moved);
    await ctx.save(next);
    return;
  }
}

export async function moveSection(ctx, index, delta) {
  const target = index + delta;
  const next = structuredClone(ctx.state.config);
  if (target < 0 || target >= next.sections.length) return;
  const [moved] = next.sections.splice(index, 1);
  next.sections.splice(target, 0, moved);
  await ctx.save(next);
}

// ---------------------------------------------------------------------------
// Tool editor
// ---------------------------------------------------------------------------

export function openItemEditor(ctx, options = {}) {
  const config = ctx.state.config;
  const existing = options.itemId ? locate(config, options.itemId) : null;

  editing = {
    itemId: existing ? existing.item.id : null,
    sectionId: existing ? existing.section.id : options.sectionId || null
  };

  const item = existing
    ? existing.item
    : {
        name: '',
        description: '',
        icon: options.kind === 'extension' ? '🧩' : '🌐',
        kind: options.kind || 'app',
        enabled: true,
        action: {
          type: options.actionType || ACTION_TYPES.OPEN_URL,
          target: options.kind === 'extension' ? 'popup' : 'tab',
          url: '',
          extensionId: '',
          path: 'popup.html',
          message: '{"type":"OPEN"}',
          popup: { width: 460, height: 720 }
        },
        install: { webStoreUrl: '' }
      };

  $('#item-modal-title').textContent = existing ? 'Edit tool' : 'Add a tool';
  $('#f-name').value = item.name;
  $('#f-description').value = item.description;
  $('#f-icon').value = item.icon;
  $('#f-kind').value = item.kind;
  $('#f-action-type').value = item.action.type;
  $('#f-url').value = item.action.url || '';
  $('#f-extension-id').value = item.action.extensionId || '';
  $('#f-path').value = item.action.path || 'popup.html';
  $('#f-message').value = item.action.message || '{}';
  $('#f-target').value = item.action.target || 'tab';
  $('#f-popup-width').value = (item.action.popup && item.action.popup.width) || 460;
  $('#f-popup-height').value = (item.action.popup && item.action.popup.height) || 720;
  $('#f-webstore').value = item.install.webStoreUrl || '';
  $('#f-enabled').checked = item.enabled !== false;

  const sectionSelect = $('#f-section');
  sectionSelect.replaceChildren();
  for (const section of config.sections) {
    const option = document.createElement('option');
    option.value = section.id;
    option.textContent = section.name;
    sectionSelect.appendChild(option);
  }
  sectionSelect.value = editing.sectionId || (config.sections[0] && config.sections[0].id) || '';

  const deleteButton = $('#btn-delete-item');
  deleteButton.hidden = !existing;

  $('#item-error').hidden = true;
  $('#item-modal').hidden = false;
  syncConditionalFields();
  $('#f-name').focus();

  // Rebind each time so handlers always close over the current ctx.
  bindOnce($('#item-form'), 'submit', (event) => submitItem(event, ctx));
  armDelete(deleteButton, 'Delete', () => deleteItem(ctx));
  bindOnce($('#f-action-type'), 'change', syncConditionalFields);
  bindOnce($('#f-target'), 'change', syncConditionalFields);
}

/** Show only the fields that matter for the chosen action type. */
function syncConditionalFields() {
  const actionType = $('#f-action-type').value;
  const target = $('#f-target').value;

  for (const node of document.querySelectorAll('[data-when]')) {
    node.hidden = !node.dataset.when.split(' ').includes(actionType);
  }
  for (const node of document.querySelectorAll('[data-when-target]')) {
    const relevant = ['openUrl', 'extensionPage'].includes(actionType);
    node.hidden = !relevant || node.dataset.whenTarget !== target;
  }
}

async function submitItem(event, ctx) {
  event.preventDefault();
  const error = $('#item-error');
  const actionType = $('#f-action-type').value;

  const action = { type: actionType, target: $('#f-target').value };

  if (actionType === ACTION_TYPES.OPEN_URL) {
    const url = $('#f-url').value.trim();
    if (!/^https?:\/\//i.test(url)) {
      return fail(error, 'Enter a full link starting with http:// or https://');
    }
    action.url = url;
  } else {
    const extensionId = $('#f-extension-id').value.trim();
    if (!/^[a-p]{32}$/.test(extensionId)) {
      return fail(
        error,
        'Extension IDs are 32 letters (a–p). Copy it from chrome://extensions with developer mode on.'
      );
    }
    action.extensionId = extensionId;

    if (actionType === ACTION_TYPES.EXTENSION_PAGE) {
      action.path = ($('#f-path').value.trim() || 'popup.html').replace(/^\/+/, '');
    } else {
      const message = $('#f-message').value.trim() || '{}';
      try {
        JSON.parse(message);
      } catch {
        return fail(error, 'The message has to be valid JSON.');
      }
      action.message = message;
      action.target = 'tab'; // unused for messages, kept valid
    }
  }

  if (action.target === 'popup') {
    action.popup = {
      width: Number($('#f-popup-width').value) || 460,
      height: Number($('#f-popup-height').value) || 720
    };
  }

  const next = structuredClone(ctx.state.config);
  const targetSectionId = $('#f-section').value;
  const targetSection = next.sections.find((section) => section.id === targetSectionId);
  if (!targetSection) return fail(error, 'Pick a section for this button.');

  const payload = {
    id: editing.itemId || newId('item'),
    name: $('#f-name').value.trim(),
    description: $('#f-description').value.trim(),
    icon: $('#f-icon').value.trim() || (($('#f-kind').value === 'extension') ? '🧩' : '🌐'),
    kind: $('#f-kind').value,
    enabled: $('#f-enabled').checked,
    action,
    install: { webStoreUrl: $('#f-webstore').value.trim() }
  };

  if (editing.itemId) {
    // Drop the old copy wherever it lived, in case the admin moved it into a
    // different section.
    for (const section of next.sections) {
      const index = section.items.findIndex((item) => item.id === editing.itemId);
      if (index === -1) continue;
      section.items.splice(index, 1);
      break;
    }
  }
  targetSection.items.push(payload);

  if (await ctx.save(next)) {
    $('#item-modal').hidden = true;
    ctx.toast(editing.itemId ? 'Tool updated.' : 'Tool added. Publish to share it.');
  }
}

async function deleteItem(ctx) {
  if (!editing.itemId) return;
  const found = locate(ctx.state.config, editing.itemId);
  if (!found) return;

  const next = structuredClone(ctx.state.config);
  for (const section of next.sections) {
    const index = section.items.findIndex((item) => item.id === editing.itemId);
    if (index !== -1) {
      section.items.splice(index, 1);
      break;
    }
  }

  if (await ctx.save(next)) {
    $('#item-modal').hidden = true;
    ctx.toast('Tool removed.');
  }
}

// ---------------------------------------------------------------------------
// Section editor
// ---------------------------------------------------------------------------

export function openSectionEditor(ctx, sectionId) {
  editingSectionId = sectionId;
  const section = sectionId
    ? ctx.state.config.sections.find((entry) => entry.id === sectionId)
    : null;

  $('#section-modal-title').textContent = section ? 'Rename section' : 'Add a section';
  $('#f-section-name').value = section ? section.name : '';
  $('#btn-delete-section').hidden = !section;
  $('#section-error').hidden = true;
  $('#section-modal').hidden = false;
  $('#f-section-name').focus();

  bindOnce($('#section-form'), 'submit', (event) => submitSection(event, ctx));
  armDelete($('#btn-delete-section'), 'Delete', () => deleteSection(ctx));
}

async function submitSection(event, ctx) {
  event.preventDefault();
  const name = $('#f-section-name').value.trim();
  if (!name) return fail($('#section-error'), 'Give the section a name.');

  const next = structuredClone(ctx.state.config);
  if (editingSectionId) {
    const section = next.sections.find((entry) => entry.id === editingSectionId);
    if (section) section.name = name;
  } else {
    next.sections.push({ id: newId('sec'), name, items: [] });
  }

  if (await ctx.save(next)) {
    $('#section-modal').hidden = true;
    ctx.toast('Section saved.');
  }
}

async function deleteSection(ctx) {
  if (!editingSectionId) return;
  const section = ctx.state.config.sections.find((entry) => entry.id === editingSectionId);
  if (!section) return;

  const next = structuredClone(ctx.state.config);
  next.sections = next.sections.filter((entry) => entry.id !== editingSectionId);
  if (!next.sections.length) next.sections.push({ id: newId('sec'), name: 'Tools', items: [] });

  if (await ctx.save(next)) {
    $('#section-modal').hidden = true;
    ctx.toast('Section removed.');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function locate(config, itemId) {
  for (const section of config.sections) {
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
 * Two-click delete.
 *
 * window.confirm() is ignored inside a cross-origin iframe, and the drawer is
 * exactly that, so a native confirm would silently cancel every delete. The
 * button arms itself on the first click and acts on the second.
 */
function armDelete(button, restingLabel, onConfirm) {
  let armed = false;
  let timer = null;

  const reset = () => {
    armed = false;
    button.textContent = restingLabel;
    clearTimeout(timer);
  };

  reset();
  bindOnce(button, 'click', () => {
    if (armed) {
      reset();
      onConfirm();
      return;
    }
    armed = true;
    button.textContent = 'Click again to confirm';
    timer = setTimeout(reset, 4000);
  });
}

/**
 * Replace any previous listener of the same type on this element, so reopening
 * an editor does not stack handlers.
 */
const bound = new WeakMap();
function bindOnce(element, type, handler) {
  const key = `${type}`;
  const previous = bound.get(element) || {};
  if (previous[key]) element.removeEventListener(type, previous[key]);
  element.addEventListener(type, handler);
  previous[key] = handler;
  bound.set(element, previous);
}
