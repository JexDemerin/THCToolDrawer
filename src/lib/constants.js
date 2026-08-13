// Shared keys and message names. Imported by the service worker, the drawer
// page and the options page. The content script duplicates the few strings it
// needs, because MV3 content scripts cannot import modules.

export const STORAGE = {
  CONFIG: 'config', // the tool catalog (synced from remote, editable by admins)
  SYNC: 'sync', // where to pull the catalog from, and pull bookkeeping
  PUBLISH: 'publish', // how an admin pushes the catalog back out (local only)
  UI: 'ui', // per-user drawer preferences
  META: 'meta' // last-sync results, pending-update notices
};

export const SESSION = {
  ADMIN_UNTIL: 'adminUnlockedUntil'
};

// How long a super-admin unlock lasts before it has to be re-entered.
export const ADMIN_SESSION_MS = 30 * 60 * 1000;

export const MSG = {
  // content script <-> service worker
  TOGGLE_DRAWER: 'TD_TOGGLE_DRAWER',
  GET_MOUNT_STATE: 'TD_GET_MOUNT_STATE',
  SET_UI: 'TD_SET_UI',

  // drawer page -> service worker
  GET_STATE: 'TD_GET_STATE',
  LAUNCH: 'TD_LAUNCH',
  SYNC_NOW: 'TD_SYNC_NOW',
  SAVE_CONFIG: 'TD_SAVE_CONFIG',
  PUBLISH_CONFIG: 'TD_PUBLISH_CONFIG',
  DISCARD_LOCAL: 'TD_DISCARD_LOCAL',
  CHECK_INSTALLED: 'TD_CHECK_INSTALLED',
  GET_SELECTION: 'TD_GET_SELECTION',
  OPEN_OPTIONS: 'TD_OPEN_OPTIONS',

  // service worker -> drawer page
  CONFIG_CHANGED: 'TD_CONFIG_CHANGED'
};

export const ALARM_SYNC = 'td-sync';

export const ACTION_TYPES = {
  OPEN_URL: 'openUrl',
  EXTENSION_PAGE: 'extensionPage',
  EXTENSION_MESSAGE: 'extensionMessage'
};
