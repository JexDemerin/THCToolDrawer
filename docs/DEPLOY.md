# Getting the drawer onto the team's machines

Two things travel to your teammates, on very different schedules.

| | What it is | Changes | How it reaches them |
| --- | --- | --- | --- |
| **The extension** | The panel itself | Rarely — only when the code changes | Installed once |
| **The tool list** | Your buttons and links | Whenever you add or fix a tool | On its own, from the sheet |

That split is the whole point: **buttons change without anyone reinstalling
anything.**

Set up the spreadsheet first — [SHEET-SETUP.md](SHEET-SETUP.md).

---

## Step 1 — Bake the link into the extension

So teammates configure nothing, put your `/exec` link in the shipped defaults
before you package. In `src/lib/defaults.js`:

```js
export const DEFAULT_SETTINGS = {
  endpoint: 'https://script.google.com/macros/s/AKfycb…/exec',
  pollMinutes: 30,
  syncOnOpen: true
};
```

They install, open the panel, and the tools are already there.

Anyone who installed before you set this can paste the link into **Settings**
by hand, once.

## Step 2 — Package it

Zip the project folder — the whole thing, with `manifest.json` at the **top
level**, not inside a subfolder. A zip containing `THCToolDrawer/manifest.json`
will be rejected; it needs `manifest.json` at the root.

```bash
cd THCToolDrawer
zip -r ../thc-tool-drawer.zip . -x '.git/*' '*.DS_Store' 'node_modules/*'
```

`apps-script/`, `docs/` and `tools/` ride along harmlessly. Chrome ignores what
the manifest doesn't reference.

## Step 3 — Get it installed

### Option A: Chrome Web Store, unlisted (best for a remote team)

1. Upload the zip at the [Developer Dashboard][cwsd]. One-time $5 registration.
2. Set visibility to **Unlisted** — it won't appear in search; only people with
   the link can install it.
3. Send the link.

This is the option that keeps working on its own: when you publish a new
version, Chrome updates everyone automatically.

**What the review will ask about.** The listing must justify each permission.
Honest answers, which are also the real ones:

| Permission | Why |
| --- | --- |
| `sidePanel` | The drawer is a side panel |
| `storage` | Caches the tool list so the panel opens instantly and survives being offline |
| `alarms` | Checks the sheet for changes on a timer |
| `tabs`, `activeTab`, `scripting` | Fills `{{url}}`, `{{title}}` and `{{selection}}` into links |
| `management` (optional) | Marks a tool as "not installed"; the drawer works without it |
| `host_permissions` on `script.google.com` | Where the tool list is fetched from |

There is no analytics, no remote code, and no data leaves the browser except the
request to your own Apps Script. Say so in the listing — it's true and it makes
review straightforward.

### Option B: Google Workspace force-install

If Together Homecare manages Chrome through Workspace, push it to every account
with no click from them: **Admin console → Devices → Chrome → Apps &
extensions**, add it by ID, set **Force install**. Combine with the unlisted
listing from Option A.

### Option C: Load unpacked

Fine for testing and a couple of people. `chrome://extensions` → **Developer
mode** → **Load unpacked**. The catch: everyone must keep the folder on disk,
and *code* updates mean re-copying it to each machine. Tool list updates still
arrive automatically — this only affects the extension itself.

---

## Day to day: adding a tool

Either edit the **Tools** tab directly, or do it from the panel:

1. Open the drawer, unlock super admin.
2. **＋ Add app** or **＋ Add extension**, fill it in, **Save to sheet**.

Within 30 minutes everyone has it. Anyone who opens their panel sooner gets it
sooner — it checks on open too.

To retire a tool without losing it, set **Enabled** to `FALSE` (or untick
**Show this button to the team**). It stays in the sheet, visible only in admin
mode.

---

## When you change the code

1. Bump `version` in `manifest.json`.
2. Re-zip and upload the new version to the Web Store listing.
3. Chrome rolls it out over the next few hours.

Changing the **Apps Script** is separate and doesn't touch the extension:
**Deploy → Manage deployments → pencil → Version: New version → Deploy.** The
`/exec` URL stays the same, so nothing needs reconfiguring.

---

## Troubleshooting

**A teammate's tools are stale.** Have them open **Settings → Check for tools
now**; it reports exactly what happened.

**Everyone is stuck on an old list.** If you edited the sheet by hand, bump
`version` in the **Settings** tab. Teammates only adopt a catalog whose version
is higher than the one they hold.

**"The spreadsheet returned a sign-in page."** The deployment's access is not set
to **Anyone**. See [SHEET-SETUP.md](SHEET-SETUP.md#4-deploy-it).

**An extension button says the extension didn't answer.** That extension hasn't
opted in yet — see [SHEET-SETUP.md](SHEET-SETUP.md#making-extension-buttons-actually-work).

[cwsd]: https://chrome.google.com/webstore/devconsole
