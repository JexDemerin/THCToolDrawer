// Ships-with-the-extension defaults.
//
// DEFAULT_SETTINGS.endpoint is the one value worth setting before you package
// the extension for the team: point it at your deployed Apps Script and
// teammates get every future tool change without touching their browser again.

export const DEFAULT_SETTINGS = {
  // The Apps Script web app URL, ending in /exec.
  endpoint: '',
  pollMinutes: 30,
  // Pull whenever the panel is opened, not just on the timer. Cheap, and it
  // means a teammate who opens the drawer sees your change immediately.
  syncOnOpen: true
};

export const DEFAULT_CATALOG = {
  version: 0,
  updatedAt: null,
  branding: {
    title: 'Tool Drawer',
    subtitle: 'Together Homecare'
  },
  sections: []
};

export const DEFAULT_META = {
  lastSyncAt: null,
  lastSyncError: null,
  version: 0
};
