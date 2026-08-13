# THC Tool Drawer

A Chrome extension that puts one drawer on the right edge of every page, holding
buttons for every tool the team uses — our own extensions (WellSky Scanner, Text
Blaster) and our own web apps.

A super admin edits the buttons from inside the drawer and publishes. Everyone
else's drawer picks the change up on its own. **Nobody reinstalls anything.**

```
┌─────────────────────────────────┬──────────────┐
│                                 │ THC Tool     │
│                                 │ Drawer    ⟳📌✕│
│                                 ├──────────────┤
│         the page you            │ 🔎 WellSky   │
│         are already on          │    Scanner   │
│                                 │ 💬 Text      │
│                                 │    Blaster   │
│                              ┌──┤ 🗓️ Scheduler │
│                              │T ├──────────────┤
│                              │o │ 🔐 Super     │
│                              │o │    admin  v4 │
└──────────────────────────────┴──┴──────────────┘
                            handle
```

## Install it

1. Go to `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → pick this folder.
3. A teal **Tools** handle appears on the right of any web page. Click it, or
   press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>, or click the toolbar icon.

For rolling it out to the team, see [docs/DEPLOY.md](docs/DEPLOY.md).

## Using the drawer

| Control | What it does |
| --- | --- |
| **Tools** handle | Opens and closes the drawer. Drag the panel's inner edge to resize. |
| ⟳ | Checks for a newer catalog right now. |
| 📌 | Keeps the drawer open on every page instead of closing after each launch. |
| Search | Filters buttons by name, description or section. |
| 🔐 Super admin | Password gate for editing (below). |

## Super admin

Click **🔐 Super admin** at the bottom of the drawer.

- The first time, there is no password yet, so it asks you to set one. That
  password is stored as a PBKDF2-SHA256 hash inside the catalog, which means it
  travels with the catalog and works on any machine you unlock from.
- After that it asks for the password. An unlock lasts 30 minutes.

Unlocked, you get **＋ Add app**, **＋ Add extension**, **＋ Section**,
**⇧ Publish**, per-button edit/reorder controls, and section rename/reorder.

> **Be clear-eyed about what the password is.** It stops teammates from casually
> editing the drawer. It is *not* a security boundary — the catalog is delivered
> to every teammate's browser, so the hash goes with it, and anyone determined
> enough can bypass the check in their own devtools. Keep real secrets (API
> keys, tokens) out of the catalog entirely. Publishing tokens are the one
> credential the extension stores, and they stay in the admin's local storage
> and never enter the published file.

### Adding a web app

**＋ Add app** → name it, paste the exec link, choose new tab / popup / current
tab. Done.

Links may carry context from the page the teammate is standing on:

| Placeholder | Becomes |
| --- | --- |
| `{{url}}` | The current page's URL |
| `{{title}}` | The current page's title |
| `{{selection}}` | Whatever text the teammate has highlighted |
| `{{date}}` | Today, as `YYYY-MM-DD` |

All values are URL-encoded, so an `&` in a page title cannot break the query
string. Example:

```
https://intake.togetherhomecare.org/new?from={{url}}&name={{selection}}
```

### Adding an extension

Extensions stay separate installs — the drawer launches them, it does not
contain them. Get the extension's 32-letter ID from `chrome://extensions` with
developer mode on, then pick how the button reaches it:

**Open an extension's page** — opens `chrome-extension://<id>/popup.html` in a
popup or tab. Requires the target extension to list that file in its manifest:

```json
"web_accessible_resources": [
  { "resources": ["popup.html"], "matches": ["<all_urls>"] }
]
```

**Send a message to an extension** — hands it a JSON payload and lets it decide
what to do (usually the cleaner option, and the only one that can trigger
behaviour rather than just show a page). Requires the target extension to accept
messages from this one:

```json
"externally_connectable": { "ids": ["<THC Tool Drawer's extension ID>"] }
```

and to handle them:

```js
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_BLASTER') { /* ... */ }
  sendResponse({ ok: true });
});
```

Since WellSky Scanner and Text Blaster are ours, adding those few lines to each
is the tidiest path. Chrome gives no way to pop open another extension's toolbar
popup from the outside, so one of these two hooks is required — the drawer
reports a clear error rather than failing silently if neither is in place.

If a button's extension is missing, the drawer marks it **not installed** and
the button opens the install link instead. That badge needs the optional
`management` permission — the admin bar offers to turn it on, and everything
else works without it.

## How updates reach the team

```
   super admin's browser                    teammate's browser
   ─────────────────────                    ──────────────────
   edit buttons in drawer
            │
            ▼
       ⇧ Publish  ──────►  catalog JSON  ◄────── checks every 30 min
                           (gist / your host)     and whenever the
                                                  drawer is opened
                                                          │
                                                          ▼
                                                   buttons update
```

Each save bumps the catalog's version number. A teammate adopts a catalog only
when its version is higher than the one they hold, so a published change rolls
out and nothing rolls backwards. Unpublished admin edits are never silently
overwritten — if someone else publishes meanwhile, the drawer shows the conflict
and offers **Take theirs** / **Keep mine**.

## Layout

```
manifest.json              MV3 manifest
src/lib/                   shared: config schema, storage, crypto, sync
src/background/            service worker: sync, launching, routing
src/content/mount.js       injects the drawer into pages
src/drawer/                the panel UI and the admin editor
src/options/               settings: catalog URL, publishing
tools/make-icons.py        regenerates icons/
tools/test.mjs             tests for the logic modules
config.example.json        a filled-in catalog to copy from
```

The panel is an extension page in an iframe inside a closed shadow root, so page
CSS cannot reach it and it still gets direct `chrome.*` access. It is not loaded
until the drawer is first opened, so pages where nobody touches it pay nothing.

`src/lib/*` is listed in `web_accessible_resources` alongside `src/drawer/*`
because the panel is framed from a web page; the files hold no secrets.

## Tests

```bash
node tools/test.mjs        # catalog normalising, site matching, templating, password gate
python3 tools/make-icons.py # regenerate icons after changing the mark
```

The `chrome.*` layers are verified by loading the unpacked extension — Chrome's
extension APIs do not exist outside the browser.
