// Catalog shape: normalising, validating, templating.
//
// Everything that reads a catalog runs it through normalizeCatalog() first, so
// a half-filled spreadsheet row can never crash the panel — unknown values are
// replaced with defaults rather than trusted.

import { DEFAULT_CATALOG } from './defaults.js';
import { TYPES, BUILT_IN_ICONS } from './constants.js';

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
    // A link for an app, a 32-letter extension ID for the other two.
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
  // Anything else has to be an image URL we are willing to load.
  if (/^https:\/\//i.test(icon) || /^data:image\//i.test(icon)) return icon;
  return type === TYPES.APP ? 'app' : 'link';
}

function normalizeSection(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    id: str(input.id) || newId('sec'),
    name: str(input.name, 'Tools'),
    items: Array.isArray(input.items) ? input.items.map(normalizeItem) : []
  };
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
    sections: Array.isArray(input.sections) ? input.sections.map(normalizeSection) : []
  };
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
  for (const section of catalog.sections) {
    const item = section.items.find((entry) => entry.id === itemId);
    if (item) return item;
  }
  return null;
}

export function isExtensionType(type) {
  return type === TYPES.EXTENSION_MESSAGE || type === TYPES.EXTENSION_PAGE;
}

/** Chrome extension IDs are exactly 32 letters, a–p. */
export function isValidExtensionId(value) {
  return /^[a-p]{32}$/.test(String(value || '').trim());
}

export function countItems(catalog) {
  return catalog.sections.reduce((total, section) => total + section.items.length, 0);
}
