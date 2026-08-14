# THC Tool Drawer

A Chrome side panel holding every tool the Together Homecare team uses — our own
extensions and our own web apps — in one place, on the side of any page.

The tools live in a Google Sheet. A super admin edits them there, or from inside
the panel. Everyone else's drawer picks the change up on its own.
**Nobody reinstalls anything.**

```
┌──────────────────────────────────────┬──────────────────────┐
│                                      │  Tool Drawer      ⟳⚙ │
│                                      │  TOGETHER HOMECARE   │
│                                      ├──────────────────────┤
│                                      │  Search tools…       │
│        the page you are              │                      │
│        already working in            │  EXTENSIONS ─────────│
│                                      │  ▣ WellSky Scanner   │
│        (a side panel docks           │  ▣ Shift Verification│
│         beside it — nothing          │  ▣ Text Blaster      │
│         gets covered up)             │                      │
│                                      │  WEB APPS ───────────│
│                                      │  ▣ Scheduling Board  │
│                                      │  ▣ Client Intake     │
│                                      ├──────────────────────┤
│                                      │  🔐 Super admin   v4 │
└──────────────────────────────────────┴──────────────────────┘
```

## How it fits together

```
   the spreadsheet                 Apps Script              every teammate
   ───────────────                 ───────────              ──────────────
   Tools       ──────────────►  serves the tool list  ────►  the drawer
   Settings                                                  (checks every
   Superadmin  ──────────────►  answers yes / no on           30 min, and on
   (never leaves Google)         a password                   every open)
```

The spreadsheet stays private. The script is the only thing that reads it, and
the only things it hands back are the tool list and a yes-or-no on a password.

## Set it up

1. **The spreadsheet and script** — [docs/SHEET-SETUP.md](docs/SHEET-SETUP.md).
   Once, about ten minutes.
2. **The extension** — `chrome://extensions` → **Developer mode** → **Load
   unpacked** → pick this folder.
3. Click the toolbar icon (or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>),
   open **Settings** from the panel header, paste the `/exec` link, **Save**,
   then **Test connection**.

To get it onto the team's machines, see [docs/DEPLOY.md](docs/DEPLOY.md).

## Using it

| Control | What it does |
| --- | --- |
| Toolbar icon | Opens and closes the panel |
| ⟳ | Checks the sheet for changes right now |
| ⚙ | Settings for this browser |
| Search | Filters by name, description or section |
| 🔐 Super admin | Password gate for editing |

Launching a tool leaves the panel open, so it stays put while you work.

## Super admin

Click **🔐 Super admin** and enter the password from the sheet's Superadmin tab.
An unlock lasts 30 minutes.

Unlocked, you get **＋ Add app**, **＋ Add extension**, edit and reorder controls
on every row, and switched-off tools become visible with an **off** chip. Every
edit writes straight back to the spreadsheet and bumps its version, so the team
picks it up on their next check.

**What the password is and isn't.** It's checked by the Apps Script against the
private sheet — the drawer never sees it, never stores it on disk, and holds it
in memory only for the 30 minutes of an unlock. That's a real gate, not a
cosmetic one. It is still a shared password rather than per-person accounts, so
treat it as "who may edit the tool list", not as protection for anything
sensitive. Keep secrets out of the sheet.

## Adding tools

**A web app** needs its link. Optionally with `{{url}}`, `{{title}}`,
`{{selection}}` or `{{date}}` in it, which the drawer fills in from the page the
teammate is on.

**An extension** needs its 32-letter ID from `chrome://extensions` with
developer mode on. Extensions have no link — the ID is how Chrome names them.

The drawer has exactly two sections, **Extensions** and **Web Apps**. A tool
lands in one or the other based on what it is, so there is no section to choose
and none to mistype.

**Extensions must opt in to being launched.** Chrome gives no way for one
extension to open another, so each target needs `externally_connectable` in its
manifest naming this extension, plus a listener. Both are a few lines and both
are documented in [docs/SHEET-SETUP.md](docs/SHEET-SETUP.md#making-extension-buttons-actually-work).
Without it the drawer reports that the extension didn't answer, rather than
failing quietly.

## Layout

```
manifest.json              MV3 manifest
apps-script/Code.gs        the Google Apps Script backend
src/lib/                   catalog schema, storage, Apps Script client
src/background/            service worker: sync, launching, routing
src/sidepanel/             the panel and the admin editor
src/options/               settings: the spreadsheet connection
icons/icon.svg             the extension mark (source of truth)
icons/logo-mark.svg        the company mark used in the panel header
tools/render-icons.mjs     renders icon.svg to the PNG sizes Chrome needs
tools/test.mjs             tests for the logic modules
docs/SHEET-SETUP.md        spreadsheet and script setup
docs/PUBLISHING.md         publishing all three extensions, in order
docs/DEPLOY.md             getting it onto the team's machines
```

Design follows the Together Homecare brand sheet: white ground, Dusty Rose for
anything that carries meaning, black type. The panel uses the six brand colours
and nothing else — hairlines and secondary text are those same colours at
reduced opacity. There is no dark mode; the brand is white by definition.

## Tests

```bash
node tools/test.mjs         # catalog normalising, templating, ID and link validation
node tools/render-icons.mjs # regenerate PNGs after editing icons/icon.svg
```

The `chrome.*` layers were verified by loading the unpacked extension in
Chromium and driving it — panel render, search, admin mode, and the editor. The
Apps Script is verified against a real deployment via **Test connection** on the
settings page.
