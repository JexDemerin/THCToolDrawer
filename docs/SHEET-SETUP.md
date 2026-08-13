# Setting up the spreadsheet

Do this once. About ten minutes.

At the end you'll have one Google Sheet that holds every tool in the drawer, and
a link you paste into the extension. After that, adding a tool for the whole
team is a row in a spreadsheet.

---

## Why a script and not a published CSV

Google can publish a single tab as a CSV, and that would work for the tool list.
It does not work for the password.

The extension is installed on every teammate's machine, so anything it can read,
they can read. If the drawer had to fetch the Superadmin tab to check a
password, that tab would have to be readable by everyone — which defeats the
point of having one.

The Apps Script sits between the two. It reads the private sheet and answers
questions:

- *"What tools are there?"* — anyone may ask
- *"Is this the password?"* — anyone may ask, and gets only **yes** or **no**
- *"Save this tool list"* — only answered if the password came with it

The password never leaves Google's servers. Nothing readable is ever stored in
anyone's browser.

---

## 1. Make the spreadsheet

Create a new Google Sheet. Name it something like **Tool Drawer**.

Leave the sharing exactly as it is — private to you. It never needs to be shared
with the team.

## 2. Add the script

**Extensions → Apps Script.** Delete whatever is in the editor and paste in the
whole contents of [`apps-script/Code.gs`](../apps-script/Code.gs). Save.

## 3. Create the tabs

In the Apps Script editor, pick **setUpSheets** from the function dropdown and
press **Run**.

Google will ask you to authorise the script the first time. It's your own
script, working on your own sheet — approve it. On the "Google hasn't verified
this app" screen, choose **Advanced → Go to Tool Drawer (unsafe)**. That warning
appears for every unpublished personal script.

You should now have three tabs:

**Tools** — one row per button

| Section | Name | Description | Type | Target | Open In | Icon | Install Link | Enabled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Extensions | WellSky Shift Scanner | Scan and pull data from WellSky. | extension-message | *32-letter ID* | tab | scanner | | TRUE |
| Web Apps | Scheduling Board | Our in-house scheduling app. | app | https://…/exec | tab | board | | TRUE |

**Superadmin** — who can edit

| Admin Email | Password | Name |
| --- | --- | --- |
| you@togetherhomecare.org | *a real password* | Your name |

**Settings** — a couple of values

| Key | Value |
| --- | --- |
| title | Tool Drawer |
| subtitle | Together Homecare |
| version | 1 |

## 4. Deploy it

**Deploy → New deployment → Web app.**

| Field | Set it to |
| --- | --- |
| Execute as | **Me** |
| Who has access | **Anyone** |

Copy the **Web app URL**. It ends in `/exec`.

> **"Anyone" does not make your spreadsheet public.** It means the script will
> answer without demanding a Google login, which is what lets the drawer work
> for teammates. The script is the only thing that can read the sheet, and the
> only things it will ever hand back are the tool list and a yes/no on a
> password. It never returns the Superadmin tab.

Re-deploy after any edit to the script: **Deploy → Manage deployments → pencil →
Version: New version → Deploy.** The URL stays the same.

## 5. Point the extension at it

Load the extension, open its **Settings** (the ⚙ in the panel header), paste the
`/exec` link, **Save**, then **Test connection**. It should report the tabs it
found and how many tools are in the sheet.

---

## Filling in the Tools tab

**Section** — any name. Rows sharing a section are grouped under it, in the
order they appear. Move a row to move a button.

**Type** — one of:

| Value | What the button does | What goes in Target |
| --- | --- | --- |
| `app` | Opens a link | The URL |
| `extension-message` | Tells another extension to open | Its 32-letter ID |
| `extension-page` | Opens a page inside another extension | Its 32-letter ID |

**Target** — a link for `app`; for the others, the extension's ID from
`chrome://extensions` with **Developer mode** switched on.

**Open In** — `tab`, `popup`, or `current`.

**Icon** — one of the bundled names: `drawer`, `scanner`, `verify`, `blaster`,
`board`, `intake`, `report`, `link`, `app`. Or an `https://` link to an image of
your own.

**Install Link** — where to send someone whose copy of an extension is missing.

**Enabled** — `FALSE` hides the row from the team while keeping it in the sheet.
Blank counts as `TRUE`.

### Links that carry the page across

A link may include any of these, and the drawer fills them in from whatever page
the teammate is looking at:

| Placeholder | Becomes |
| --- | --- |
| `{{url}}` | The current page's URL |
| `{{title}}` | The current page's title |
| `{{selection}}` | Text the teammate has highlighted |
| `{{date}}` | Today, as `YYYY-MM-DD` |

```
https://intake.togetherhomecare.org/new?from={{url}}&name={{selection}}
```

Everything is URL-encoded, so an `&` in a page title can't break the link.

---

## Making extension buttons actually work

This is the one part that needs a change outside this project.

**Chrome does not let one extension open another.** No API exists for it, in
either direction. So a button pointing at Shift Scanner cannot bring up Shift
Scanner's panel on its own — the target extension has to agree to be opened.

Since your extensions are your own, that's a few lines in each. In the target
extension's `manifest.json`:

```json
"externally_connectable": { "ids": ["<the Tool Drawer's extension ID>"] }
```

and in its service worker:

```js
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'THC_TOOL_DRAWER_OPEN') {
    // open your side panel, popup, or whatever this tool does
    sendResponse({ ok: true });
  }
});
```

Without this, the drawer's button reports that the extension didn't answer,
rather than failing silently.

> **A note on side panels.** `chrome.sidePanel.open()` can only be called by an
> extension on itself, and only in response to a click inside that extension. A
> message arriving from the drawer is not a click, so a target extension usually
> cannot open its own side panel on request. The practical answer is for the
> target to open its interface in a **popup window** when the drawer asks. Same
> interface, different frame, and it works.

---

## Troubleshooting

**"The spreadsheet returned a sign-in page rather than data."** The deployment's
*Who has access* is not **Anyone**. Edit the deployment and re-deploy.

**"Could not reach the spreadsheet."** The link is wrong or the deployment was
deleted. It must be the `/exec` link, not `/dev`, and not the spreadsheet's own
URL.

**Test connection reports a missing tab.** Tab names are case-sensitive:
`Tools`, `Superadmin`, `Settings`.

**Changes don't reach the team.** Every save through the panel bumps `version` in
the Settings tab. If you edit the sheet by hand, bump that number yourself —
teammates only adopt a catalog whose version is higher than the one they hold.

**A tool's row is ignored.** Rows with an empty **Name** are skipped.
