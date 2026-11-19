# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
EY (Ernst & Young) GDS employees playing the US BTC FSO Pickleball Tournament on Saturday 21 November 2026, plus colleagues following along. They open the link on a phone at the venue, between matches, often in daylight, and want one answer: when and where is my next match, and against whom.

## Product Purpose
A one-day tournament microsite read live from the organiser's Google Sheet. A player types their name and gets their next match (time, court, opponent, partner), their whole day across every event they entered, the draws and the group tables. Success: nobody asks the desk "when do I play?".

## Positioning
Name-first: the site opens on "When do I play?", not on a bracket. The sheet is the only source of truth; the site never writes and never guesses live state from the clock.

## Operating Context
- Five events: Men's Singles, Men's Doubles, Mixed Doubles (straight knockout, round of 32 / 16 onward) and Women's Singles, Women's Doubles (group round robin; the top play the final directly).
- Entries come from a Microsoft Forms export (tabs Master List and one tab per event). Fixtures are posted later into a Fixtures tab; results are typed there on the day.
- A player can be in up to three events, so their day spans events.

## Capabilities and Constraints
- Read-only over the Google Sheet via a service account; refresh within about a minute.
- Only the two women's events have points tables. The three knockout events have none.
- Undecided (inferred, not confirmed): points per win and the tiebreak order for the women's groups; match format (games to 11/15, best of 3); number of courts and start times.
- Phone numbers and emails sit in the entry tabs; the site must never show them.

## Brand Commitments
- Client: EY. Official EY logo (yellow beam over the EY wordmark), public/brand/ey.svg, sourced from Wikimedia Commons "EY_logo_2019.svg". EY yellow #FFE600 and EY dark grey #2E2E38 are the brand colours.
- The user asked for the exact structure and UI of the earlier PlayMo pickleball site (pickleball-rally-hub, SBPL Season 2): "When do I play?" finder, the pass, the sticky-time schedule, tables and knockouts.
- Keep it simple and easy to use.

## Evidence on Hand
- Participant list: ../sheet/US BTC FSO Pickleball Tournament Participant List_V1 (unlocked).xlsx (as of 19 Nov: MS 36 players, MD 16 pairs, XD 17 rows of which 6 men have no partner named, WS 6, WD 4 pairs).
- No fixtures yet. No partner/sponsor logos supplied; do not invent any.

## Product Principles
1. Your next match first, everything else second.
2. The sheet decides; the site only reads and explains.
3. One glance in sunlight: big time, big court, plain words.
4. Never show anything a player didn't need (no phones, no emails).
