/**
 * One-off: links the PlayMo app match recordings to the sheet matches and writes
 * src/lib/ey/videos.json.
 *
 * The output holds only the event, the sheet match id and the clip URLs. Player names stay
 * in the input file, which is kept outside the repo. The site gets the names from the sheet.
 *
 * Run from the site root:
 *   node --experimental-strip-types --env-file=.env scripts/match-videos.ts <app-recordings.json>
 *
 * Input: every app match of the day (with or without video), as a JSON list of
 * { appMatchId, startTime, sides: string[][], games: [n, n][], clips: [{ url, thumbnailUrl,
 * seconds }] }, taken from GET /matches/badminton?matchStatus=ENDED&sports=PICKLEBALL.
 *
 * Matching rules:
 * - same number of players on each side, every app name found on the sheet side. A name also
 *   fits when one is the start of the other ("Varun" and "Varun S Shetty");
 * - app matches are taken oldest first, and each sheet match is used once. So when a pair
 *   plays twice (group, then final), the earlier app match takes the earlier sheet match;
 * - when several sheet matches still fit, the one with the same first-game score wins, else
 *   the lowest match number.
 */
import { readFile, writeFile } from "node:fs/promises";

import { fetchAllTabs, readSheetsConfig } from "../src/lib/sheets/client.ts";
import { EVENTS, norm, parseFixtures, resolveMatches, type Match } from "../src/lib/ey/model.ts";

declare const process: { argv: string[]; exit: (code: number) => never };

/** Shorter clips are test starts or black clips from a paused phone. */
const MIN_SECONDS = 90;

type AppClip = { url: string; thumbnailUrl?: string | null; seconds: number };
type AppMatch = {
  appMatchId: string;
  startTime: string;
  sides: string[][];
  games: (number | null)[][];
  clips: AppClip[];
};

const input = process.argv[2];
if (!input) {
  console.error(
    "Usage: node --experimental-strip-types --env-file=.env scripts/match-videos.ts <file>",
  );
  process.exit(1);
}

const config = readSheetsConfig();
if (!config) {
  console.error("Sheet not configured (.env)");
  process.exit(1);
}

const tabs = await fetchAllTabs(config);
let sheet: Match[] = [];
for (const [title, grid] of Object.entries(tabs)) {
  const event = EVENTS.find((e) => norm(e.name) === norm(title));
  if (event) sheet.push(...parseFixtures(grid, event));
}
sheet = resolveMatches(sheet);

const app = JSON.parse(await readFile(input, "utf8")) as AppMatch[];

const fitsName = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `);
};
const covers = (sheetSide: string[], appSide: string[]) =>
  appSide.length > 0 &&
  appSide.length === sheetSide.length &&
  appSide.every((n) => sheetSide.some((p) => fitsName(p, n)));

const used = new Set<string>();
const key = (m: Match) => `${m.event}:${m.id}`;
const out: { event: string; matchId: string; clips: AppClip[] }[] = [];

// Oldest app match first, so when two players meet twice (group, then final) the earlier
// app match takes the earlier sheet match.
for (const a of [...app].sort((x, y) => x.startTime.localeCompare(y.startTime))) {
  const clips = a.clips.filter((c) => c.seconds >= MIN_SECONDS);
  const [s1, s2] = a.sides.map((s) => s.filter(Boolean));
  const fits = sheet
    .filter((m) => !used.has(key(m)) && s1 && s2)
    .map((m) => ({
      m,
      straight: covers(m.players1, s1!) && covers(m.players2, s2!),
      swapped: covers(m.players1, s2!) && covers(m.players2, s1!),
    }))
    .filter((f) => f.straight || f.swapped);
  const first = a.games[0];
  const sameScore = (f: (typeof fits)[number]) => {
    const g = f.m.games[0];
    if (!g || !first) return false;
    return f.straight
      ? g[0] === first[0] && g[1] === first[1]
      : g[0] === first[1] && g[1] === first[0];
  };
  const pick = (fits.find(sameScore) ?? [...fits].sort((x, y) => (x.m.no ?? 0) - (y.m.no ?? 0))[0])
    ?.m;
  const tag = `${a.appMatchId.slice(0, 8)} ${a.startTime.slice(11, 16)}Z`;
  if (!pick) {
    if (clips.length) console.log(`NO MATCH   ${tag}  clips=${clips.length}`);
    continue;
  }
  used.add(key(pick));
  if (clips.length)
    console.log(
      `${fits.length > 1 ? "PICKED 1/" + fits.length : "OK        "} ${tag} -> ${pick.event} #${pick.id} ${pick.round ?? ""}  clips=${clips.length}`,
    );
  if (clips.length) out.push({ event: pick.event, matchId: pick.id, clips });
}

await writeFile("src/lib/ey/videos.json", JSON.stringify(out, null, 2) + "\n");
console.log(`\nWrote ${out.length} matches, ${out.reduce((n, m) => n + m.clips.length, 0)} clips`);
