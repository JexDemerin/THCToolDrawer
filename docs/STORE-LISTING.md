# Store listing copy for all three extensions

Text to paste into the Chrome Web Store dashboard: **Store listing**, **Privacy**
and **Distribution** for each of the three.

The Tool Drawer's entries are complete — I wrote its code, so I can state
exactly what each permission does. Scanner's and Blaster's are drafted from
their manifests, and a few are marked **CONFIRM** where only you know the
answer. Do not submit a guess: an inaccurate permission justification is a
policy violation, and it is the thing reviewers check hardest.

---

# 1. THC Tool Drawer

## Store listing

**Category:** Workflow & Planning

**Short description** (this is the `description` in the manifest, already set):

> One panel for every Together Homecare tool. Launch team extensions and web
> apps from the side of any page.

**Detailed description:**

```
THC Tool Drawer is an internal tool for Together Homecare staff. It puts every
tool the team uses — our own Chrome extensions and our own web apps — into one
side panel, so nobody has to remember where anything lives.

The panel docks beside the page you are working in, rather than covering it, and
groups tools into two sections: Extensions and Web Apps. A search box filters the
list when it gets long.

The list of tools is not built into the extension. It is held in a private
Google Sheet belonging to Together Homecare and read through a Google Apps Script
endpoint. When an administrator adds or changes a tool, every teammate's panel
picks it up automatically within half an hour — nobody reinstalls or updates
anything.

An administrator can also edit the list from inside the panel, after entering a
password that is checked against the private spreadsheet. The password is never
stored on disk and never leaves Google's servers.

This extension is built for Together Homecare's own staff and is not intended for
general use.
```

## Privacy

**Single purpose:**

```
Show a side panel listing the internal tools a Together Homecare employee uses,
and open the one they choose.
```

**Permission justifications** — paste one per field:

| Permission | Justification |
| --- | --- |
| `sidePanel` | The extension's entire interface is a side panel. This permission is what allows that panel to exist. |
| `storage` | Stores the list of tools locally so the panel opens instantly and keeps working when the network is unavailable. No personal data is stored. |
| `alarms` | Schedules a periodic check, every 30 minutes, for changes to the tool list held in the organisation's spreadsheet. |
| `tabs` | Reads the current tab's address and title so that a tool link can carry that context — for example, opening an internal form for the client record the user is already viewing. |
| `activeTab` | Grants access to the current page only when the user clicks a tool button, so that text they have selected can be passed to the tool they chose. |
| `scripting` | Reads the user's selected text from the current page, only at the moment they click a tool button configured to use it. Nothing is injected or modified on any page. |
| `management` | Optional, requested at runtime. Checks whether an internal extension in the list is installed, so its button can show "not installed" and link to it rather than silently failing. The extension works without it. |

**Host permission justification:**

```
https://script.google.com/* and https://script.googleusercontent.com/*

The list of tools is fetched from Together Homecare's own Google Apps Script
endpoint, which reads it from a private company spreadsheet. This is the only
host the extension contacts.
```

**Are you using remote code?** — **No.** All code is in the package. The Apps
Script endpoint returns data (JSON), never executable code.

**Data usage:** tick nothing under "collected data".

The extension sends no user data anywhere. It fetches a list of tool names and
links, and it does not report usage, analytics, or browsing activity to anyone.

> **One nuance worth reading before you tick the boxes.** If an administrator
> configures a tool link containing `{{url}}`, `{{title}}` or `{{selection}}`,
> then clicking that button passes the current page's address, title, or selected
> text into the link being opened — a Together Homecare web app. That is the user
> deliberately opening a link, not the extension collecting anything, and nothing
> reaches the developer. If your reviewer asks, that is the accurate description.
> If you would rather be conservative, tick **Website content** and explain it in
> exactly those terms. Over-disclosing is safe; under-disclosing is not.

**Three certifications at the bottom** — all three can be ticked truthfully:

- Not being sold to third parties ✓
- Not being used or transferred for purposes unrelated to the item's single purpose ✓
- Not being used or transferred to determine creditworthiness or for lending ✓

## Distribution

**Visibility: Private**, restricted to the togetherhomecare.org Workspace.

If Private isn't offered, your developer account isn't registered under the
Workspace domain — use **Unlisted** for now and move it later.

---

# 2. THC WellSky Shift Scanner

## Store listing

**Category:** Workflow & Planning

**Detailed description:**

```
An internal tool for Together Homecare staff.

WellSky Shift Scanner reads shift records shown in WellSky (ClearCare) — the
caregiver, the client, the date, the scheduled and actual clock times, and the
shift's status — and mirrors them into a Together Homecare Google Sheet, so the
office can reconcile scheduled hours against what was actually worked.

It reads only the pages a member of staff already has open, when they ask it to.
It does not change anything in WellSky.

This extension is built for Together Homecare's own staff and is not intended for
general use.
```

## Privacy

**Single purpose:**

```
Copy shift records from WellSky pages the user is viewing into a Together
Homecare Google Sheet.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `activeTab` | Grants access to the WellSky tab the user is on, only when they start a scan from the panel. |
| `scripting` | Reads shift details from the WellSky page the user is viewing, so they can be copied into the company spreadsheet. Nothing on the page is modified. |
| `downloads` | Saves an exported care log to the user's computer when they click Export. |
| `storage` | Stores the user's settings and the spreadsheet connection locally. |
| `sidePanel` | The extension's interface is a side panel. |

**Host permission justification:**

```
https://*.clearcareonline.com/* — the WellSky scheduling system this extension
reads shift records from. It is the only site the extension reads.

https://script.google.com/* and https://script.googleusercontent.com/* — the
Together Homecare Apps Script endpoint that writes the records into our own
Google Sheet.
```

**Remote code:** No. **CONFIRM** — true as long as nothing in the extension
loads a script from a URL at runtime.

**Data usage:** this one **does** handle personal information, and you should
say so.

Tick **Personally identifiable information** and explain:

```
The extension reads shift records that include caregiver and client names and
shift times from our own WellSky account, and writes them to our own Google
Sheet. This is Together Homecare's own operational data, handled by our own
staff, and is not transmitted to the developer or to any third party.
```

The three certifications can still be ticked: the data is not sold, is used only
for the stated purpose, and has nothing to do with lending.

## Distribution

**Visibility: Private**, same as the drawer.

---

# 3. THC Text Blaster

## Store listing

**Category:** Communication

**Detailed description:**

```
An internal tool for Together Homecare staff.

Text Blaster sends a Google Voice message to a chosen group of caregivers or
clients, one at a time rather than as a group thread, and records every send in a
Together Homecare Google Sheet so the office has a log of what was sent and to
whom.

It works inside the user's own Google Voice session, in their own browser.

This extension is built for Together Homecare's own staff and is not intended for
general use.
```

## Privacy

**Single purpose:**

```
Send a Google Voice message to each member of a chosen group of caregivers or
clients individually, and log every send to a Together Homecare Google Sheet.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `sidePanel` | The extension's interface is a side panel. |
| `storage` | Stores message templates, recipient groups and settings locally. |
| `activeTab` | Grants access to the Google Voice tab only when the user starts a send. |
| `scripting` | Fills the recipient and message into the Google Voice compose form on the user's behalf. |
| `tabs` | **CONFIRM** — likely: finds or opens the Google Voice tab so a send can be carried out there. Check what it's actually used for. |
| `debugger` | **CONFIRM — see the warning below.** |
| `identity` | **CONFIRM** — likely: signs the user in to their Google account so the log can be written to the company spreadsheet. Check before submitting. |

**Host permission justification:**

```
https://voice.google.com/* — where messages are sent from, in the user's own
signed-in session.

https://script.google.com/* and https://script.googleusercontent.com/* — the
Together Homecare Apps Script endpoint that records each send in our own sheet.
```

> ### The `debugger` permission will hold this listing up
>
> `debugger` gets far more scrutiny than anything else on this list. It can
> control a page completely, so reviewers ask precisely what it is for and reject
> vague answers. Expect this listing to take longer than the other two.
>
> If it is there because Google Voice ignores ordinary synthetic clicks and
> typing, say exactly that — it is a legitimate reason, and being specific is
> what gets it through:
>
> ```
> Google Voice does not respond to standard synthetic input events, so the
> extension uses the debugger API to deliver real input to the compose field on
> voice.google.com only. It is attached only while a send is in progress, only to
> that tab, and detached immediately afterwards. It is not used to read page
> content or to inspect any other site.
> ```
>
> **Check that this is true of your code before pasting it.** If `debugger` is
> left over from development and nothing needs it, delete it from the manifest —
> that will make this listing far easier to get approved.

**Data usage:** tick **Personally identifiable information**.

```
The extension handles caregiver and client phone numbers and the message text,
in order to send messages from the user's own Google Voice account and log them
to our own Google Sheet. This is Together Homecare's own operational data and is
not transmitted to the developer or to any third party.
```

## Distribution

**Visibility: Private**, same as the others.

---

## Things every listing needs that I cannot write for you

**Screenshots** — at least one, 1280×800 or 640×400 PNG. A screenshot of each
panel in use is enough. Crop out any real client or caregiver names.

**A small promo tile** — 440×280 PNG. Often optional; fill it in if the form
insists.

**A privacy policy URL** — required as soon as you declare that an extension
handles personal information, which both Scanner and Blaster do. A short page on
the Together Homecare site saying what the tools handle, that it stays within the
company's own Google account, and that nothing is sold or shared, is sufficient.

**Contact email**, verified in the dashboard under **Account**.
