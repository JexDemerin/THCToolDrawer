// Ships-with-the-extension defaults.
//
// DEFAULT_SYNC.configUrl is the one value worth editing before you package the
// extension for the team: point it at your published catalog and teammates get
// every future button change without touching their browser again.

export const DEFAULT_SYNC = {
  // Leave empty to run the drawer purely locally. Set it to the raw URL of your
  // published catalog JSON (GitHub Gist raw, GitHub Pages, S3, intranet, ...).
  configUrl: '',
  pollMinutes: 30,
  // Pull whenever the drawer is opened, not just on the timer. Cheap, and it
  // means a teammate who opens the drawer sees your change immediately.
  syncOnOpen: true
};

export const DEFAULT_PUBLISH = {
  target: 'manual', // 'manual' | 'gist' | 'http'
  gist: { id: '', filename: 'thc-tool-drawer.json', token: '' },
  http: { url: '', method: 'PUT', headerName: 'Authorization', headerValue: '' }
};

export const DEFAULT_UI = {
  open: false,
  pinned: false, // when true the drawer auto-opens on every page
  width: 340,
  handleTop: 140 // px from the top of the viewport
};

export const DEFAULT_CONFIG = {
  schema: 1,
  version: 1,
  updatedAt: null,
  updatedBy: null,
  branding: {
    title: 'THC Tool Drawer',
    subtitle: 'Together Homecare',
    accent: '#0d7c74'
  },
  settings: {
    side: 'right',
    handleLabel: 'Tools',
    // 'all' shows the drawer everywhere. 'allow' shows it only on matching
    // pages, 'deny' shows it everywhere except matching pages. Patterns are
    // match-pattern style, e.g. https://*.wellsky.com/*
    sites: { mode: 'all', patterns: [] }
  },
  // Set from the super-admin panel the first time it is opened.
  admin: { passwordHash: null, salt: null, iterations: 250000 },
  sections: [
    {
      id: 'sec-extensions',
      name: 'Extensions',
      items: [
        {
          id: 'item-wellsky-scanner',
          name: 'WellSky Scanner',
          description: 'Scan and pull data from WellSky.',
          icon: '🔎',
          kind: 'extension',
          enabled: true,
          action: {
            type: 'extensionPage',
            extensionId: '',
            path: 'popup.html',
            target: 'popup',
            popup: { width: 460, height: 720 }
          },
          install: { webStoreUrl: '' }
        },
        {
          id: 'item-text-blaster',
          name: 'Text Blaster',
          description: 'Send templated texts to caregivers.',
          icon: '💬',
          kind: 'extension',
          enabled: true,
          action: {
            type: 'extensionPage',
            extensionId: '',
            path: 'popup.html',
            target: 'popup',
            popup: { width: 460, height: 720 }
          },
          install: { webStoreUrl: '' }
        }
      ]
    },
    {
      id: 'sec-apps',
      name: 'Web Apps',
      items: []
    }
  ]
};
