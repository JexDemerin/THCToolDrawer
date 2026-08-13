# Rolling the drawer out to the team

Two separate things travel to your teammates, on very different schedules:

| | What it is | How often it changes | How it reaches them |
| --- | --- | --- | --- |
| **The extension** | The drawer itself | Rarely — only when the code changes | They install it once |
| **The catalog** | Your buttons and links | Whenever you add or fix a tool | Automatically, on its own |

Getting this split right is the whole point: **buttons change without anyone
reinstalling anything.**

---

## Step 1 — Host the catalog

Pick one. The gist route needs no server and takes about five minutes.

### Option A: GitHub Gist (recommended)

1. Create a **secret** gist at <https://gist.github.com> with a file named
   `thc-tool-drawer.json`. Paste in `config.example.json` as a starting point.
   (Secret gists are unlisted, not private — anyone with the link can read them.
   Keep secrets out of the catalog regardless.)
2. Copy the **gist ID** — the long hex string in the gist's URL.
3. Click **Raw** on the file and copy that URL. It looks like:
   ```
   https://gist.githubusercontent.com/<user>/<gist-id>/raw/thc-tool-drawer.json
   ```
   Use the form **without** a commit hash in it, so it always serves the latest
   version.
4. Create a fine-grained personal access token with **only** the `gist` scope, at
   <https://github.com/settings/tokens>.
5. In the drawer: **⚙ Settings** → **Publishing** → unlock → choose
   **GitHub Gist**, paste the gist ID, filename and token → **Save**.

Now **⇧ Publish** in the drawer writes straight to the gist, and every teammate
picks it up on their next check.

### Option B: Your own endpoint

Anything that serves the JSON over HTTPS and accepts a `PUT` or `POST`: an
intranet host, an S3 bucket, a small Apps Script. Set the URL, method and an auth
header under **Publishing → My own endpoint**.

### Option C: Host it yourself, by hand

Leave publishing on **Download the file**. **⇧ Publish** hands you the JSON and
you upload it wherever you like — GitHub Pages, SharePoint, a static host. Fine
if changes are rare; tedious if they are not.

---

## Step 2 — Bake the catalog URL into the extension

So teammates configure nothing, put the URL in the shipped defaults before you
package. In `src/lib/defaults.js`:

```js
export const DEFAULT_SYNC = {
  configUrl: 'https://gist.githubusercontent.com/<user>/<gist-id>/raw/thc-tool-drawer.json',
  pollMinutes: 30,
  syncOnOpen: true
};
```

They install, open the drawer, and the buttons are already there.

(Anyone who installed before you set this can paste the URL into
**⚙ Settings → Catalog URL** once, by hand.)

---

## Step 3 — Get the extension onto their machines

### Option A: Chrome Web Store, unlisted (best for remote teams)

1. Zip the project folder — the whole thing, with `manifest.json` at the top
   level, not inside a subfolder.
2. Upload at the [Chrome Web Store Developer Dashboard][cwsd] (one-time $5
   registration fee).
3. Set visibility to **Unlisted**. It will not appear in search; only people with
   the link can install it.
4. Send the link. Chrome auto-updates it whenever you publish a new version.

This is the option that keeps working on its own. Code changes reach people the
same way catalog changes do.

### Option B: Google Workspace force-install

If Together Homecare manages Chrome through Google Workspace, you can push the
extension to every account with no click from them at all: **Admin console →
Devices → Chrome → Apps & extensions**, add it by ID, set **Force install**.
Combine with Option A's unlisted listing.

### Option C: Load unpacked

Good for testing and for a handful of people. `chrome://extensions` →
**Developer mode** → **Load unpacked**. The catch: everyone must keep the folder
on disk, and code updates mean re-copying that folder to each machine. Catalog
updates still flow automatically — this only affects code changes.

---

## Step 4 — Set the password once

On your machine, open the drawer → **🔐 Super admin** → set the password →
**⇧ Publish**. The hash is part of the catalog, so from then on you can unlock
from any machine, and teammates who try get the same gate.

---

## Day-to-day: adding a button

1. Open the drawer, unlock super admin.
2. **＋ Add app** or **＋ Add extension**, fill it in, **Save**.
3. **⇧ Publish**.

Within 30 minutes everyone has it. Anyone who opens their drawer sooner gets it
sooner — the drawer checks on open too, and shows a small "Updated to v12" note
when it lands.

To take a tool away without deleting it, edit the button and untick **Show this
button to the team** — it stays in the catalog, visible only in admin mode.

---

## Restricting where the drawer appears

By default the drawer shows on every `http`/`https` page. To narrow it, edit the
catalog's `settings.sites` (export → edit → import, from **⚙ Settings**):

```json
"sites": {
  "mode": "allow",
  "patterns": ["https://*.wellsky.com/*", "https://*.togetherhomecare.org/*"]
}
```

`mode` is `all`, `allow` (only these) or `deny` (everywhere but these). Patterns
are Chrome match-pattern style; a bare `wellsky.com` is treated as "any URL
containing that". This lives in the catalog, so it applies to the whole team on
the next sync.

---

## Troubleshooting

**A teammate's buttons are stale.** Have them open **⚙ Settings** and click
**Check now** — it reports what happened. A wrong catalog URL, or a gist raw URL
pinned to a commit hash, are the usual causes.

**"Chrome would not open X's page."** That extension does not expose the page.
Add it to the target's `web_accessible_resources`, or switch the button to
**Send a message** instead. See the README.

**"X did not answer."** The target extension is missing, disabled, or does not
list this extension's ID under `externally_connectable`.

**The drawer says edits are held back.** Someone else published while you had
unpublished edits. **Take theirs** discards yours; **Keep mine** keeps yours
until you publish over the top.

**Nothing appears on a page.** The drawer never mounts on `chrome://` pages, the
Chrome Web Store, PDFs, or other extensions' pages. Chrome does not allow it.

[cwsd]: https://chrome.google.com/webstore/devconsole
