// Shared keys and message names.

export const STORAGE = {
  CATALOG: 'catalog', // the tool list, pulled from the sheet
  SETTINGS: 'settings', // where to pull it from
  META: 'meta' // sync bookkeeping
};

export const SESSION = {
  ADMIN_UNTIL: 'adminUnlockedUntil',
  ADMIN_PASSWORD: 'adminPassword' // held only for this browser session, to
  // re-authorise saves without asking again
};

// How long a super-admin unlock lasts before it has to be re-entered.
export const ADMIN_SESSION_MS = 30 * 60 * 1000;

export const MSG = {
  GET_STATE: 'TD_GET_STATE',
  SYNC_NOW: 'TD_SYNC_NOW',
  LAUNCH: 'TD_LAUNCH',
  ADMIN_VERIFY: 'TD_ADMIN_VERIFY',
  ADMIN_LOCK: 'TD_ADMIN_LOCK',
  ADMIN_SAVE: 'TD_ADMIN_SAVE',
  CHECK_INSTALLED: 'TD_CHECK_INSTALLED',
  OPEN_OPTIONS: 'TD_OPEN_OPTIONS',
  PING: 'TD_PING',
  CATALOG_CHANGED: 'TD_CATALOG_CHANGED'
};

export const ALARM_SYNC = 'td-sync';

// Two kinds of tool, and one fixed section for each. A tool's section is
// decided by what it is, not by a column someone can mistype.
export const TYPES = {
  APP: 'app',
  EXTENSION: 'extension'
};

export const SECTIONS = [
  { key: TYPES.EXTENSION, name: 'Extensions' },
  { key: TYPES.APP, name: 'Web Apps' }
];

// Icons bundled with the extension. The sheet's Icon column takes one of these
// names, or an https:// image URL for anything else.
export const BUILT_IN_ICONS = [
  'drawer',
  'scanner',
  'verify',
  'blaster',
  'board',
  'intake',
  'report',
  'link',
  'app'
];
