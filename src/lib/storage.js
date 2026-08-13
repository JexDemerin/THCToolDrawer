// Thin wrappers over chrome.storage with defaults applied on read.

import { STORAGE, SESSION, ADMIN_SESSION_MS } from './constants.js';
import { DEFAULT_SETTINGS, DEFAULT_CATALOG, DEFAULT_META } from './defaults.js';
import { normalizeCatalog, deepClone } from './catalog.js';

async function read(key) {
  const bag = await chrome.storage.local.get(key);
  return bag[key];
}

async function write(key, value) {
  await chrome.storage.local.set({ [key]: value });
  return value;
}

export async function getCatalog() {
  return normalizeCatalog((await read(STORAGE.CATALOG)) || deepClone(DEFAULT_CATALOG));
}

export async function setCatalog(catalog) {
  return write(STORAGE.CATALOG, normalizeCatalog(catalog));
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await read(STORAGE.SETTINGS)) };
}

export async function setSettings(patch) {
  return write(STORAGE.SETTINGS, { ...(await getSettings()), ...patch });
}

export async function getMeta() {
  return { ...DEFAULT_META, ...(await read(STORAGE.META)) };
}

export async function setMeta(patch) {
  return write(STORAGE.META, { ...(await getMeta()), ...patch });
}

// ---------------------------------------------------------------------------
// Super-admin session
//
// The password is held in session storage, which Chrome clears when the browser
// closes and never writes to disk. It is kept only so an admin can save several
// edits without re-typing it — the sheet is the thing that actually checks it.
// ---------------------------------------------------------------------------

export async function isAdminUnlocked() {
  const bag = await chrome.storage.session.get(SESSION.ADMIN_UNTIL);
  return (bag[SESSION.ADMIN_UNTIL] || 0) > Date.now();
}

export async function startAdminSession(password) {
  await chrome.storage.session.set({
    [SESSION.ADMIN_UNTIL]: Date.now() + ADMIN_SESSION_MS,
    [SESSION.ADMIN_PASSWORD]: password
  });
}

export async function getAdminPassword() {
  if (!(await isAdminUnlocked())) return null;
  const bag = await chrome.storage.session.get(SESSION.ADMIN_PASSWORD);
  return bag[SESSION.ADMIN_PASSWORD] || null;
}

export async function endAdminSession() {
  await chrome.storage.session.remove([SESSION.ADMIN_UNTIL, SESSION.ADMIN_PASSWORD]);
}
