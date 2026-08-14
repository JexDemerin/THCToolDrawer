# Publishing all three extensions

You are publishing **three** extensions, not one:

1. **THC Tool Drawer** — this project
2. **WellSky Shift Scanner** — yours
3. **Text Blaster** — yours

All three go to the Chrome Web Store. Then the drawer's Extensions section can
launch the other two, for everybody, permanently.

---

## Why all three, and not just the drawer

Chrome refuses to let one extension poke another unless the target has named the
poker in advance, by ID. So:

- **Shift Scanner** must contain the **Tool Drawer's** ID
- **The sheet** must contain **Shift Scanner's** ID

An extension loaded from a folder gets its ID from the folder path, so it's
different on every machine. Neither of those references would hold. An extension
from the Web Store gets one fixed ID, the same everywhere, forever.

That's the whole reason. If Scanner and Blaster stay as folders, the drawer's
extension buttons will work on your machine and fail on everyone else's.

---

## The order matters

You need each extension's ID *before* you can finish the others — which sounds
circular, but isn't. **Uploading assigns the ID immediately, before you publish.**
So you upload everything first, collect the IDs, then wire them together.

```
  1. upload all three as drafts     →  Chrome hands you 3 IDs
  2. put the Drawer's ID into Scanner and Blaster
  3. re-upload Scanner and Blaster
  4. publish all three
  5. put Scanner's and Blaster's IDs into the spreadsheet
```

---

## Step 1 — Zip each extension

For each one, zip so that **`manifest.json` is at the very top of the zip**, not
inside a folder. This is the single most common rejection.

Windows: open the extension's folder, select the *contents* (`manifest.json`,
`src`, `icons`, …), right-click → **Send to → Compressed (zipped) folder**.

To check: open the zip and confirm you see `manifest.json` right there, not a
folder you have to click into first.

## Step 2 — Upload all three as drafts

Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

For each extension: **Add new item** → drop in the zip → wait for it to process.
**Do not click Publish yet.**

## Step 3 — Get the three IDs

An extension's ID is assigned the moment you **first upload it**, and it never
changes afterwards — not when you publish, not on later versions. So a draft
already has its final ID, which is what makes this order work.

**Do this one.** Open the item in the dashboard and look at the address bar:

```
https://chrome.google.com/webstore/devconsole/….../abcdefghijklmnopabcdefghijklmnop/edit
                                                   └──────── the ID, 32 letters ────────┘
```

That long string of letters between the slashes is the extension's ID. Copy it.
Every ID is exactly 32 characters and uses only the letters **a** to **p** — no
numbers. If you see a digit, you've grabbed the wrong part of the URL.

*(The same number also appears at `chrome://extensions` under an installed
extension's name, with **Developer mode** switched on. That's an alternative
place to read it once something is installed — not a second step, and not
something you need now while everything is still a draft.)*

Write all three down:

| Extension | ID |
| --- | --- |
| THC Tool Drawer | |
| WellSky Shift Scanner | |
| Text Blaster | |

## Step 4 — Teach Scanner and Blaster to accept the drawer

In **each** of Scanner's and Blaster's `manifest.json`, add an
`externally_connectable` entry using the **Tool Drawer's** ID.

It goes **inside the outermost `{ }`**, as a sibling of `"name"` and
`"version"` — not above the opening brace. A manifest must start with `{` and
end with `}`; anything before that first brace gives you
*"a object must begin with '{'"* on upload.

```json
{
  "manifest_version": 3,
  "name": "Text Blaster",
  "version": "1.0.1",
  "externally_connectable": {
    "ids": ["PASTE_THE_TOOL_DRAWER_ID_HERE"]
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

Every entry ends with a comma except the last one. Paste the finished file into
**jsonlint.com** before re-zipping — it points at the exact line if anything is
wrong, which is quicker than another upload attempt.

And in each one's background script (service worker), add a listener:

```js
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'THC_TOOL_DRAWER_OPEN') {
    // Open this tool's window. A popup works from here; a side panel does not,
    // because Chrome only opens a side panel in response to a click inside the
    // extension that owns it.
    chrome.windows.create({
      url: chrome.runtime.getURL('sidepanel.html'), // your own page
      type: 'popup',
      width: 480,
      height: 740
    });
    sendResponse({ ok: true });
  }
});
```

Point it at whatever page each tool already uses. If you'd rather it do
something else entirely — start a scan directly, say — put that here instead.

Bump `version` in each manifest, re-zip, and upload the new version to each
listing.

## Step 5 — Set visibility and publish

For each of the three: **Store listing** → fill in a description and a screenshot
→ **Privacy** → explain the permissions → **Distribution** → set visibility.

| Choice | Who can install |
| --- | --- |
| **Private** | Only people in your Google Workspace. Best if all three are internal. |
| **Unlisted** | Anyone with the link. Not searchable. |

Then **Submit for review** on each. Review is usually hours, sometimes a couple
of days.

**The Tool Drawer's permissions, for the privacy form:**

| Permission | Why |
| --- | --- |
| `sidePanel` | The drawer is a side panel |
| `storage` | Caches the tool list so the panel opens instantly and works offline |
| `alarms` | Checks the spreadsheet for changes on a timer |
| `tabs`, `activeTab`, `scripting` | Fills the current page's address, title and selected text into links |
| `management` (optional) | Marks a tool "not installed"; the drawer works without it |
| `host_permissions` on `script.google.com` | Where the tool list is fetched from |

There is no analytics, no remote code, and nothing leaves the browser except the
request to your own Apps Script. Saying exactly that makes review quick.

## Step 6 — Put the IDs into the spreadsheet

Open the **Tools** tab. For each extension row, put its **32-letter ID** in the
**Target** column and set **Type** to `extension`:

| Name | Type | Target | Icon | Install Link |
| --- | --- | --- | --- | --- |
| WellSky Shift Scanner | extension | *Scanner's ID* | scanner | *its store link* |
| Text Blaster | extension | *Blaster's ID* | blaster | *its store link* |

The **Install Link** is the store page, which you get from the listing once it's
live. If a teammate hasn't installed that tool, the drawer marks the button
**not installed** and sends them there instead of failing.

Bump `version` in the **Settings** tab, and everyone picks it up within 30
minutes.

## Step 7 — Get it onto their machines

Send the three store links, or — if you manage Chrome through Google Workspace —
push them silently: **Admin console → Devices → Chrome → Apps & extensions**, add
each by ID, set **Force install**. They appear already installed, with nothing to
click.

---

## After this, the day-to-day

You only touch the Web Store again if the extensions' **code** changes.
Everything else — new tools, new links, renaming, hiding, reordering — is the
spreadsheet, and reaches everyone within 30 minutes with no upload and no review.

---

## Troubleshooting

**"Manifest file is missing or unreadable" on upload.** The zip has a folder at
its root. Re-zip the contents, not the folder.

**"Version number is not greater than the previous."** Bump `version` in
`manifest.json` before re-zipping.

**"a object must begin with '{'".** Either something was pasted above the
manifest's opening brace, or the editor saved a hidden byte-order mark at the
start of the file. For the second, re-save from Notepad with **File → Save As →
Encoding: UTF-8** (not "UTF-8 with BOM"). Editing these files in VS Code or
Notepad++ avoids it; Word and Google Docs will also silently replace `"` with
curly quotes and break the file.

**A button says the extension didn't answer.** Either that extension is missing
`externally_connectable` with the drawer's ID, or the ID in the sheet is wrong.
Check both against the table from Step 3.

**The extension buttons work for you but not the team.** One of them is still
installed from a folder somewhere, so its ID differs. All three have to come from
the store.
