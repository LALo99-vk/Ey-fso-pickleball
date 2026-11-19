# EY FSO Pickleball Tournament

Microsite for the EY FSO Pickleball Tournament (Sat 21 Nov 2026): players type their name and
get their next match (time, court, opponent), the knockout brackets, the women's group tables
and the entry lists. Everything is read live from the organiser's Google Sheet; the site never
writes to it.

## The sheet

One tab per event (`Men's Singles`, `Men's Doubles`, `Mixed Doubles`, `Women's Singles`,
`Women's Doubles`), one row per match:

`Match No | Round | Player/Team 1 | Player/Team 2 | Score 1 | Score 2 | Court | Time | Winner | Status`

- Later rounds read `Winner Match N` until a winner is picked, then show the name.
- Women's finals read `1st in group` / `2nd in group`; the site works them out from the table.
- Status: Upcoming / Live / Completed / Walkover / Cancelled. "Live" puts the match on court.
- The `Fixtures` tab is the overall timetable; it is only read if no event tab has matches.

Results show on the site within about 45 seconds (15 s server cache + 30 s page refresh).
Only code changes need a redeploy.

## Environment

| Variable | Value |
| --- | --- |
| `GOOGLE_SHEETS_ID` | the spreadsheet id |
| `GOOGLE_SA_EMAIL` | service account with Viewer access to the sheet |
| `GOOGLE_SA_PRIVATE_KEY` | its PEM key (literal `\n` sequences are fine) |

Without them the site shows "Sheet not connected". `?demo=1` shows a sample draw built from the
entry list, clearly labelled.

## Develop

```sh
bun install        # npm trips over the rolldown override
bun run dev
bun run test
```

## Deploy

- **Vercel:** `vercel.json` builds with `NITRO_PRESET=vercel`. Add the three variables above in
  the project settings.
- **Node / Docker:** `NITRO_PRESET=node_server bun run build`, then `node .output/server/index.mjs`
  (listens on `PORT`, default 3000).
