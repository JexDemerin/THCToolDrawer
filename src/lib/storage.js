// Thin wrappers over chrome.storage.local with defaults applied on read.

import { STORAGE } from './constants.js';
import { DEFAULT_CONFIG, DEFAULT_SYNC, DEFAULT_PUBLISH, DEFAULT_UI } from './defaults.js';
import { normalizeConfig, deepClone } from './config.js';

async function read(key) {
  const bag = await chrome.storage.local.get(key);
  return bag[key];
}

async function write(key, value) {
  await chrome.storage.local.set({ [key]: value });
  return value;
}

export async function getConfig() {
  const stored = await read(STORAGE.CONFIG);
  return normalizeConfig(stored || deepClone(DEFAULT_CONFIG));
}

export async function setConfig(config) {
  return write(STORAGE.CONFIG, normalizeConfig(config));
}

export async function getSync() {
  return { ...DEFAULT_SYNC, ...(await read(STORAGE.SYNC)) };
}

export async function setSync(patch) {
  return write(STORAGE.SYNC, { ...(await getSync()), ...patch });
}

export async function getPublish() {
  const stored = (await read(STORAGE.PUBLISH)) || {};
  return {
    ...DEFAULT_PUBLISH,
    ...stored,
    gist: { ...DEFAULT_PUBLISH.gist, ...(stored.gist || {}) },
    http: { ...DEFAULT_PUBLISH.http, ...(stored.http || {}) }
  };
}

export async function setPublish(patch) {
  const current = await getPublish();
  return write(STORAGE.PUBLISH, {
    ...current,
    ...patch,
    gist: { ...current.gist, ...(patch.gist || {}) },
    http: { ...current.http, ...(patch.http || {}) }
  });
}

export async function getUi() {
  return { ...DEFAULT_UI, ...(await read(STORAGE.UI)) };
}

export async function setUi(patch) {
  return write(STORAGE.UI, { ...(await getUi()), ...patch });
}

export async function getMeta() {
  return {
    lastSyncAt: null,
    lastSyncError: null,
    lastRemoteVersion: null,
    // Set when an admin has unpublished local edits.
    dirty: false,
    // Set when a remote update arrived while local edits were pending.
    pendingRemoteVersion: null,
    ...(await read(STORAGE.META))
  };
}

export async function setMeta(patch) {
  return write(STORAGE.META, { ...(await getMeta()), ...patch });
}
