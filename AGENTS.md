## Project

- EY FSO Pickleball Tournament microsite (TanStack Start). Mobile-first single page with in-page
  tabs: You, Draws, Groups, Players.
- The Google Sheet is the only source of truth and is read-only from here. Live state comes only
  from the sheet (a Status of Live, or scores entered), never from the clock.
- Never show phone numbers or emails; never commit player names (tests use made-up names).
- Look: EY dark grey + EY yellow only, no per-event colours. Overpass for words, condensed
  Archivo for times and scores.
- Avoid rewriting pushed git history.
