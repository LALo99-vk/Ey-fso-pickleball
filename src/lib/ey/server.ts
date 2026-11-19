import { createServerFn } from "@tanstack/react-start";

import { fetchAllTabs, readSheetsConfig, type SheetGrid } from "../sheets/client";
import { demoMatches } from "./demo";
import {
  EVENTS,
  buildPlayers,
  entriesFromMatches,
  norm,
  parseEntries,
  parseFixtures,
  sortMatches,
  type Entry,
  type Match,
  type Tournament,
} from "./model";

declare const process: { env: Record<string, string | undefined> };

/** The fixtures tab may be called any of these; the first one found wins. */
const FIXTURE_TABS = ["fixtures", "matches", "schedule", "fixtures & results", "draws"];

const CACHE_MS = 15_000;
let cache: { at: number; data: Tournament } | null = null;

/**
 * Local preview only: LOCAL_TABS_JSON points at a JSON file of { tabName: grid }
 * kept outside the repo, so player names never ship with the code.
 */
async function readLocalTabs(): Promise<Record<string, SheetGrid> | null> {
  const path = process.env["LOCAL_TABS_JSON"]?.trim();
  if (!path) return null;
  const fs = await import("node:fs/promises");
  return JSON.parse(await fs.readFile(path, "utf8")) as Record<string, SheetGrid>;
}

function toTournament(tabs: Record<string, SheetGrid>): Tournament {
  const lower = Object.fromEntries(Object.entries(tabs).map(([k, v]) => [norm(k), v]));
  // Results live in the per-event tabs (Match No | Round | Team 1 | Team 2 | Score… | Winner | Status).
  // The Fixtures tab is the organiser's overall timetable; it is only read if no event tab has matches.
  let matches: Match[] = [];
  let entries: Entry[] = [];
  for (const [title, grid] of Object.entries(tabs)) {
    const event = EVENTS.find((e) => norm(e.name) === norm(title));
    if (!event) continue;
    const found = parseFixtures(grid, event);
    if (found.length) matches.push(...found);
    else entries.push(...parseEntries(grid, event));
  }
  if (matches.length) matches = sortMatches(matches);
  else matches = parseFixtures(FIXTURE_TABS.map((n) => lower[norm(n)]).find(Boolean));
  if (!entries.length) entries = entriesFromMatches(matches);
  return {
    players: buildPlayers(entries, matches),
    entries,
    matches,
    fixturesPosted: matches.length > 0,
    updatedAt: Date.now(),
  };
}

const empty = (error: string): Tournament => ({
  players: [],
  entries: [],
  matches: [],
  fixturesPosted: false,
  updatedAt: Date.now(),
  error,
});

async function readSheet(): Promise<Tournament> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const config = readSheetsConfig();
  try {
    const tabs = config ? await fetchAllTabs(config) : await readLocalTabs();
    if (!tabs) return empty("Sheet not connected");
    const data = toTournament(tabs);
    cache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.error("[sheets] read failed:", error);
    // Serve the last good copy rather than blanking the site mid-event.
    if (cache) return cache.data;
    return empty(error instanceof Error ? error.message : String(error));
  }
}

export const getTournament = createServerFn({ method: "GET" })
  .validator((input: { demo?: boolean } | undefined) => ({ demo: Boolean(input?.demo) }))
  .handler(async ({ data }): Promise<Tournament> => {
    const live = await readSheet();
    if (!data.demo) return live;
    const { matches, now } = demoMatches(live.entries);
    return {
      ...live,
      players: buildPlayers(live.entries, matches),
      matches,
      fixturesPosted: true,
      demo: true,
      nowOverride: now,
    };
  });
