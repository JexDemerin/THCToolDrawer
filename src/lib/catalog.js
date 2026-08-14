// Catalog shape: normalising, validating, grouping, templating.
//
// The catalog is a flat list of tools. The drawer's two sections are derived
// from each tool's type rather than stored, so a tool can never end up in the
// wrong place or in a section that exists only because of a typo.
//
// Everything that reads a catalog runs it through normalizeCatalog() first, so
// a half-filled spreadsheet row can never crash the panel.

import { DEFAULT_CATALOG } from './defaults.js';
import { TYPES, SECTIONS, BUILT_IN_ICONS } from './constants.js';

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function num(value, fallback, min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return typeof min === 'number' && n < min ? min : n;
}

const VALID_TYPES = new Set(Object.values(TYPES));
const VALID_OPEN_IN = new Set(['tab', 'popup', 'current']);

export function newId(prefix = 'item') {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeItem(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const type = VALID_TYPES.has(input.type) ? input.type : TYPES.APP;

  return {
    id: str(input.id) || newId('item'),
    name: str(input.name, 'Untitled'),
    description: str(input.description),
    icon: normalizeIcon(input.icon, type),
    type,
    // A link for an app, a 32-letter extension ID for an extension.
    target: str(input.target).trim(),
    openIn: VALID_OPEN_IN.has(input.openIn) ? input.openIn : 'tab',
    installLink: str(input.installLink).trim(),
    enabled: input.enabled !== false
  };
}

function normalizeIcon(value, type) {
  const icon = str(value).trim();
  if (!icon) return type === TYPES.APP ? 'app' : 'link';
  if (BUILT_IN_ICONS.includes(icon)) return icon;
  // Anything else has to be an image we are willing to load. http: and
  // javascript: must never reach an <img src>.
  if (/^https:\/\//i.test(icon) || /^data:image\//i.test(icon)) return icon;
  return type === TYPES.APP ? 'app' : 'link';
}

export function normalizeCatalog(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const branding = input.branding && typeof input.branding === 'object' ? input.branding : {};

  return {
    version: num(input.version, 0, 0),
    updatedAt: str(input.updatedAt) || null,
    branding: {
      title: str(branding.title, DEFAULT_CATALOG.branding.title),
      subtitle: str(branding.subtitle, DEFAULT_CATALOG.branding.subtitle)
    },
    items: Array.isArray(input.items) ? input.items.map(normalizeItem) : []
  };
}

/**
 * The two fixed sections, in display order, each holding the tools of its type.
 * Order within a section follows the order of the flat list, which is the order
 * of the rows in the sheet.
 */
export function groupItems(catalog) {
  return SECTIONS.map((section) => ({
    key: section.key,
    name: section.name,
    items: catalog.items.filter((item) => item.type === section.key)
  }));
}

/** The name of the section a tool belongs to, for labels and messages. */
export function sectionNameFor(type) {
  const section = SECTIONS.find((entry) => entry.key === type);
  return section ? section.name : 'Tools';
}

/**
 * Substitute `{{url}}`, `{{title}}`, `{{selection}}`, `{{date}}` into a link so
 * a web-app button can carry context from the page the teammate is on.
 */
export function renderTemplate(template, context) {
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (!(key in context)) return match;
    return encodeURIComponent(context[key] ?? '');
  });
}

export function usesTemplate(template) {
  return /\{\{\s*\w+\s*\}\}/.test(String(template || ''));
}

export function findItem(catalog, itemId) {
  return catalog.items.find((item) => item.id === itemId) || null;
}

/** Chrome extension IDs are exactly 32 letters, a–p. */
export function isValidExtensionId(value) {
  return /^[a-p]{32}$/.test(String(value || '').trim());
}

/**
 * Move a tool up or down within its own section, and return the reordered flat
 * list. Positions are relative to the section the teammate can see, so the
 * arrows do what they appear to do even though the list underneath is flat.
 */
export function moveWithinSection(catalog, itemId, delta) {
  const item = findItem(catalog, itemId);
  if (!item) return null;

  const sameType = catalog.items.filter((entry) => entry.type === item.type);
  const at = sameType.indexOf(item);
  const to = at + delta;
  if (to < 0 || to >= sameType.length) return null;

  const reordered = sameType.slice();
  reordered.splice(at, 1);
  reordered.splice(to, 0, item);

  // Rebuild the flat list, putting the reordered group back into the slots its
  // members occupied so tools of the other type keep their places.
  const slots = [];
  catalog.items.forEach((entry, index) => {
    if (entry.type === item.type) slots.push(index);
  });

  const next = catalog.items.slice();
  slots.forEach((slot, index) => {
    next[slot] = reordered[index];
  });
  return next;
}
