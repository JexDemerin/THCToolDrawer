// Catalog shape: normalising, validating, matching and templating.
//
// Everything that reads a config runs it through normalizeConfig() first, so a
// hand-edited or half-written remote file can never crash the drawer — unknown
// fields are dropped and missing ones get defaults.

import { DEFAULT_CONFIG } from './defaults.js';
import { ACTION_TYPES } from './constants.js';

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

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function bool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (typeof min === 'number' && n < min) return min;
  if (typeof max === 'number' && n > max) return max;
  return n;
}

const VALID_ACTIONS = new Set(Object.values(ACTION_TYPES));
const VALID_TARGETS = new Set(['tab', 'popup', 'current']);

function normalizeAction(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const type = VALID_ACTIONS.has(input.type) ? input.type : ACTION_TYPES.OPEN_URL;
  const action = {
    type,
    target: VALID_TARGETS.has(input.target) ? input.target : 'tab'
  };

  if (type === ACTION_TYPES.OPEN_URL) {
    action.url = str(input.url);
  } else {
    action.extensionId = str(input.extensionId).trim();
    if (type === ACTION_TYPES.EXTENSION_PAGE) {
      action.path = str(input.path, 'popup.html').replace(/^\/+/, '');
    } else {
      // Free-form JSON payload handed to the target extension. Stored as text so
      // an admin can type it without the editor fighting them mid-keystroke.
      action.message = str(input.message, '{}');
    }
  }

  if (action.target === 'popup') {
    const popup = input.popup && typeof input.popup === 'object' ? input.popup : {};
    action.popup = {
      width: num(popup.width, 460, 200, 2000),
      height: num(popup.height, 720, 200, 2000)
    };
  }

  return action;
}

function normalizeItem(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const kind = input.kind === 'extension' ? 'extension' : 'app';
  return {
    id: str(input.id) || newId('item'),
    name: str(input.name, 'Untitled'),
    description: str(input.description),
    icon: str(input.icon, kind === 'extension' ? '🧩' : '🌐'),
    kind,
    enabled: bool(input.enabled, true),
    action: normalizeAction(input.action),
    install: {
      webStoreUrl: str(input.install && input.install.webStoreUrl)
    }
  };
}

function normalizeSection(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const items = Array.isArray(input.items) ? input.items.map(normalizeItem) : [];
  return {
    id: str(input.id) || newId('sec'),
    name: str(input.name, 'Section'),
    items
  };
}

export function normalizeConfig(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const branding = input.branding && typeof input.branding === 'object' ? input.branding : {};
  const settings = input.settings && typeof input.settings === 'object' ? input.settings : {};
  const sites = settings.sites && typeof settings.sites === 'object' ? settings.sites : {};
  const admin = input.admin && typeof input.admin === 'object' ? input.admin : {};

  const sections = Array.isArray(input.sections)
    ? input.sections.map(normalizeSection)
    : deepClone(DEFAULT_CONFIG.sections);

  return {
    schema: 1,
    version: num(input.version, 1, 1),
    updatedAt: str(input.updatedAt) || null,
    updatedBy: str(input.updatedBy) || null,
    branding: {
      title: str(branding.title, DEFAULT_CONFIG.branding.title),
      subtitle: str(branding.subtitle, DEFAULT_CONFIG.branding.subtitle),
      accent: /^#[0-9a-f]{3,8}$/i.test(str(branding.accent))
        ? branding.accent
        : DEFAULT_CONFIG.branding.accent
    },
    settings: {
      side: settings.side === 'left' ? 'left' : 'right',
      handleLabel: str(settings.handleLabel, DEFAULT_CONFIG.settings.handleLabel),
      sites: {
        mode: ['all', 'allow', 'deny'].includes(sites.mode) ? sites.mode : 'all',
        patterns: Array.isArray(sites.patterns)
          ? sites.patterns.map((p) => str(p).trim()).filter(Boolean)
          : []
      }
    },
    admin: {
      passwordHash: str(admin.passwordHash) || null,
      salt: str(admin.salt) || null,
      iterations: num(admin.iterations, DEFAULT_CONFIG.admin.iterations, 1000)
    },
    sections
  };
}

/**
 * Turn a Chrome-style match pattern into a RegExp.
 * Supports `*://*.host.com/path*` and bare-substring fallbacks.
 */
function patternToRegExp(pattern) {
  if (!pattern.includes('://')) {
    // Treat a bare `wellsky.com` as "any URL containing that string".
    return new RegExp(escapeRegex(pattern), 'i');
  }
  const escaped = escapeRegex(pattern)
    // `*.` directly after the scheme means "this host or any subdomain".
    .replace(/\\\*\\\./g, '(?:[^/]+\\.)?')
    .replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function shouldShowOnUrl(config, url) {
  if (!url || !/^https?:/i.test(url)) return false;
  const { mode, patterns } = config.settings.sites;
  if (mode === 'all' || patterns.length === 0) return true;

  const matched = patterns.some((pattern) => {
    try {
      return patternToRegExp(pattern).test(url);
    } catch {
      return false;
    }
  });
  return mode === 'allow' ? matched : !matched;
}

/**
 * Substitute `{{url}}`, `{{title}}`, `{{selection}}`, `{{date}}` into a link so a
 * web-app button can carry context from the page the user is standing on.
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

export function findItem(config, itemId) {
  for (const section of config.sections) {
    const item = section.items.find((entry) => entry.id === itemId);
    if (item) return item;
  }
  return null;
}

/**
 * The catalog as it should be published: identical to what admins edit, since
 * the password hash is meant to travel with it. Nothing local (tokens, the sync
 * URL, per-user prefs) is ever part of the config object in the first place.
 */
export function configForPublish(config, editor) {
  const out = normalizeConfig(config);
  out.updatedAt = new Date().toISOString();
  if (editor) out.updatedBy = editor;
  return out;
}
