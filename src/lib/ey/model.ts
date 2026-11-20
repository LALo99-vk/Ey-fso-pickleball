/**
 * EY Pickleball Tournament: the tournament model.
 *
 * Five events. Men's Singles and Men's Doubles are straight knockouts. Mixed
 * Doubles plays two groups, then crossover semis and a final. Women's Singles
 * and Women's Doubles play one group and the top two go straight to the final.
 *
 * Everything here is pure: the server reads the sheet, these functions turn
 * the grids into entries, matches and tables. Tables are always computed from
 * scores, never typed.
 */

export type EventId = "MS" | "MD" | "XD" | "WS" | "WD";

export type EventMeta = {
  id: EventId;
  name: string;
  format: "knockout" | "groups";
  /** Short format line for cards: "Knockout", "Groups, then semis". */
  formatLabel: string;
  /** When players should be at the ground. Matches have no times; the desk calls them in order. */
  start: string;
  doubles: boolean;
};

export const EVENTS: EventMeta[] = [
  {
    id: "MS",
    name: "Men's Singles",
    start: "9:30 AM",
    format: "knockout",
    formatLabel: "Knockout",
    doubles: false,
  },
  {
    id: "MD",
    name: "Men's Doubles",
    start: "12:00 PM",
    format: "knockout",
    formatLabel: "Knockout",
    doubles: true,
  },
  {
    id: "XD",
    name: "Mixed Doubles",
    start: "12:30 PM",
    format: "groups",
    formatLabel: "Groups, then semis",
    doubles: true,
  },
  {
    id: "WS",
    name: "Women's Singles",
    start: "9:30 AM",
    format: "groups",
    formatLabel: "Group, then final",
    doubles: false,
  },
  {
    id: "WD",
    name: "Women's Doubles",
    start: "9:30 AM",
    format: "groups",
    formatLabel: "Group, then final",
    doubles: true,
  },
];

export const KNOCKOUT_EVENTS = EVENTS.filter((e) => e.format === "knockout");
export const GROUP_EVENTS = EVENTS.filter((e) => e.format === "groups");

/** Points for a group win. Not confirmed by the organiser yet. */
export const POINTS_PER_WIN = 2;

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function findEvent(raw: string | undefined): EventMeta | undefined {
  if (!raw) return undefined;
  const s = norm(raw);
  if (!s) return undefined;
  const byId = EVENTS.find((e) => norm(e.id) === s);
  if (byId) return byId;
  if (/^xd$|mixed/.test(s)) return EVENTS.find((e) => e.id === "XD");
  const women = /\b(women|womens|ladies|female|w)\b/.test(s) || /^w[sd]$/.test(s);
  const men = /\b(men|mens|male|m)\b/.test(s) || /^m[sd]$/.test(s);
  const doubles = /double|\bd\b|^.d$/.test(s);
  const singles = /single|\bs\b|^.s$/.test(s);
  if (!doubles && !singles) return undefined;
  if (women) return EVENTS.find((e) => e.id === (doubles ? "WD" : "WS"));
  if (men) return EVENTS.find((e) => e.id === (doubles ? "MD" : "MS"));
  return undefined;
}

export const eventMeta = (id: EventId) => EVENTS.find((e) => e.id === id)!;

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** One entry in one event: a player, or a pair. */
export type Entry = {
  event: EventId;
  players: string[];
  seed?: number | undefined;
};

export type Player = {
  name: string;
  /** Every event this player is in, with their partner for doubles. */
  events: { event: EventId; partner?: string | undefined }[];
};

export type Stage = "group" | "ko";

export type Match = {
  id: string;
  /** Match number from the sheet; "Winner M12" points here. */
  no?: number | undefined;
  event: EventId;
  stage: Stage;
  group?: string | undefined;
  /** Display label: "Round of 32", "Quarter-final", "Final", "Group A". */
  round?: string | undefined;
  /** Entries left in the round (32, 16, ... 2); 0 for group matches. */
  size: number;
  minutes?: number | undefined;
  /** End of a time window ("9:30 – 11:45"); the desk calls the match inside it. */
  windowEnd?: number | undefined;
  time?: string | undefined;
  date?: string | undefined;
  court?: string | undefined;
  /** As typed: names ("A & B"), or a slot like "Winner M12", "1st Group A", "BYE". */
  side1: string;
  side2: string;
  players1: string[];
  players2: string[];
  /** Game scores, one pair per game played. */
  games: [number, number][];
  /** The sheet named a winner without scores (walkover). */
  winnerSide?: 1 | 2 | undefined;
  /** Status "Live" in the sheet. */
  live?: boolean | undefined;
};

export type Tournament = {
  players: Player[];
  entries: Entry[];
  matches: Match[];
  /** True when the fixtures tab exists and has rows. */
  fixturesPosted: boolean;
  updatedAt: number;
  demo?: boolean | undefined;
  /** Demo only: the clock the sample schedule is frozen at. */
  nowOverride?: number | undefined;
  error?: string | undefined;
};

type Grid = string[][];

/* ------------------------------------------------------------------ *
 * Entries: the Microsoft Forms tabs, one per event
 * ------------------------------------------------------------------ */

const cleanName = (raw: string | undefined) =>
  (raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*\.\s*$/, "")
    .trim();

const looksLikeName = (s: string) =>
  s.length > 1 && !/@/.test(s) && !/^(n\/?a|na|tbd|-)$/i.test(s) && /[a-z]/i.test(s);

/**
 * An event tab: header row with "Name" (singles) or "Partner 1 Name" and
 * "Partner 2 Name" (doubles), and an optional "Seeding" column. Only names and
 * seeds are read; emails and phone numbers never leave the server.
 */
export function parseEntries(grid: Grid | undefined, event: EventMeta): Entry[] {
  if (!grid || grid.length === 0) return [];
  const headerRow = grid.findIndex((row) =>
    row.some((c) => /^(name|partner 1 name|player 1|player)$/.test(norm(c ?? ""))),
  );
  if (headerRow < 0) return [];
  const header = grid[headerRow]!.map((c) => norm(c ?? ""));
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const c1 = find("partner 1 name", "player 1", "name", "player");
  const c2 = find("partner 2 name", "player 2");
  const cSeed = find("seeding", "seed");

  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const row of grid.slice(headerRow + 1)) {
    const p1 = cleanName(row[c1]);
    if (!looksLikeName(p1)) continue;
    const players = [p1];
    if (event.doubles && c2 >= 0) {
      const p2 = cleanName(row[c2]);
      if (looksLikeName(p2)) players.push(p2);
    }
    const key = players.map(norm).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const seed = cSeed >= 0 ? Number(row[cSeed]) : NaN;
    entries.push({
      event: event.id,
      players,
      seed: Number.isFinite(seed) && seed > 0 ? seed : undefined,
    });
  }
  // A doubles player listed alone on another row is the same entry, not a second one.
  if (!event.doubles) return entries;
  const paired = new Set(
    entries.filter((e) => e.players.length > 1).flatMap((e) => e.players.map(norm)),
  );
  return entries.filter((e) => e.players.length > 1 || !paired.has(norm(e.players[0]!)));
}

/** Every side named in the draws, once per event: the entry list when the sheet has no form tabs. */
export function entriesFromMatches(matches: Match[]): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const m of matches) {
    for (const players of [m.players1, m.players2]) {
      const named = players.filter((p) => !/^(tbd|tba)$/i.test(p));
      if (!named.length) continue;
      const key = `${m.event}|${named.map(norm).sort().join("|")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ event: m.event, players: named });
    }
  }
  return out;
}

/** Everyone, once, with the events they are in. Fixture names fill any gaps. */
export function buildPlayers(entries: Entry[], matches: Match[]): Player[] {
  const map = new Map<string, Player>();
  const add = (name: string, event: EventId, partner?: string) => {
    const key = norm(name);
    if (!key) return;
    let p = map.get(key);
    if (!p) {
      p = { name, events: [] };
      map.set(key, p);
    }
    const existing = p.events.find((e) => e.event === event);
    if (!existing) p.events.push({ event, partner });
    else if (!existing.partner && partner) existing.partner = partner;
  };
  for (const e of entries) {
    e.players.forEach((name, i) => add(name, e.event, e.players[1 - i]));
  }
  for (const m of matches) {
    for (const side of [m.players1, m.players2]) {
      side.forEach((name, i) => add(name, m.event, side[1 - i]));
    }
  }
  const order = (id: EventId) => EVENTS.findIndex((e) => e.id === id);
  const list = [...map.values()];
  for (const p of list) p.events.sort((a, b) => order(a.event) - order(b.event));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ *
 * Clock
 * ------------------------------------------------------------------ */

export function parseClock(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm)?/i);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  // A bare "1:30" at a daytime event is after lunch, not the middle of the night.
  if (!ap && h >= 1 && h <= 6) h += 12;
  if (h > 23 || min > 59) return undefined;
  return h * 60 + min;
}

/** "9:30 – 11:45" (or "9:30-11:45", "9:30 to 11:45") → the end, in minutes. */
export function parseWindowEnd(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parts = raw.split(/\s*(?:[–—-]|\bto\b)\s*/i).filter(Boolean);
  if (parts.length < 2) return undefined;
  const start = parseClock(parts[0]);
  const end = parseClock(parts[1]);
  if (end === undefined) return undefined;
  return start !== undefined && end < start ? end + 12 * 60 : end;
}

/** "9:30 AM", or for a window "9:30 – 11:45 AM" / "11:45 AM – 2:00 PM". */
export function timeLabel(m: {
  minutes?: number | undefined;
  windowEnd?: number | undefined;
  time?: string | undefined;
}): string | undefined {
  if (m.minutes === undefined) return m.time;
  if (m.windowEnd === undefined) return `${formatClock(m.minutes)} ${meridiem(m.minutes)}`;
  const sameHalf = meridiem(m.minutes) === meridiem(m.windowEnd);
  return `${formatClock(m.minutes)}${sameHalf ? "" : ` ${meridiem(m.minutes)}`} – ${formatClock(m.windowEnd)} ${meridiem(m.windowEnd)}`;
}

export function formatClock(minutes: number | undefined, raw?: string): string {
  if (minutes === undefined) return raw ?? "TBA";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")}`;
}

export function meridiem(minutes: number | undefined): string {
  if (minutes === undefined) return "";
  return minutes >= 12 * 60 ? "PM" : "AM";
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/** "R32", "Round of 16", "QF", "Semi", "Final" → entries left in the round. */
export function roundSize(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const s = norm(raw);
  if (/3rd|third|bronze/.test(s)) return 2;
  if (/quarter|\bqf\b/.test(s)) return 8;
  if (/semi|\bsf\b/.test(s)) return 4;
  if (/final|^f$/.test(s)) return 2;
  const n = s.match(/(?:^r|round of|last|r of)\s*(\d+)/) ?? s.match(/^(\d+)$/);
  if (n?.[1]) {
    const v = Number(n[1]);
    if (v >= 4 && (v & (v - 1)) === 0) return v;
  }
  if (/prelim|play ?in|qualif|r64/.test(s)) return 64;
  return undefined;
}

export function roundLabel(size: number): string {
  if (size === 2) return "Final";
  if (size === 4) return "Semi-final";
  if (size === 8) return "Quarter-final";
  if (size === 64) return "Round of 64";
  if (size > 64) return "Preliminary round";
  return `Round of ${size}`;
}

export function roundsLabel(size: number): string {
  if (size === 2) return "Final";
  if (size === 4) return "Semi-finals";
  if (size === 8) return "Quarter-finals";
  return roundLabel(size);
}

export const splitPlayers = (raw: string | undefined) =>
  (raw ?? "")
    .split(/\s*(?:&|\+|\/|,|\band\b)\s*/i)
    .map(cleanName)
    .filter(Boolean);

const numbers = (raw: string | undefined) =>
  (raw ?? "")
    .split(/[^\d]+/)
    .filter(Boolean)
    .map(Number);

/** A slot rather than names: "Winner M12", "Loser SF1", "1st Group A", "BYE", "TBD". */
export function isSlot(raw: string): boolean {
  const s = norm(raw);
  return (
    !s ||
    /^(bye|tbd|tba|-)$/.test(s) ||
    /\b(winner|loser|runner ?up)\b/.test(s) ||
    /^w\s*\d+$|^l\s*\d+$/.test(s) ||
    /\b(1st|2nd|3rd|first|second|top)\b/.test(s)
  );
}

export const isBye = (raw: string) => /^bye$/i.test(raw.trim());

function headerIndex(header: string[], ...names: string[]): number {
  for (const n of names) {
    const i = header.findIndex((h) => h === n);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Fixtures tab, one row per match. Headers are matched loosely:
 *   Match | Event | Round | Group | Date | Time | Court |
 *   Player 1 | Player 2 | Score 1 | Score 2 | Winner | Status
 * "Player 1" may be called Team 1, Side 1, Pair 1 or Entry 1. Doubles go in one
 * cell, "A & B". Scores take one number per game ("11" or "11, 9, 11"), or a
 * single Score column "11-7, 9-11, 11-5". A later round links back with
 * "Winner M12" (or W12), and the women's final with "1st Group A".
 */
export function parseFixtures(grid: Grid | undefined, defaultEvent?: EventMeta): Match[] {
  if (!grid || grid.length === 0) return [];
  const side1Names = ["player 1", "team 1", "side 1", "pair 1", "entry 1", "player a", "team a"];
  const side2Names = ["player 2", "team 2", "side 2", "pair 2", "entry 2", "player b", "team b"];
  const headerRow = grid.findIndex((row) => row.some((c) => side1Names.includes(norm(c ?? ""))));
  if (headerRow < 0) return [];
  const header = grid[headerRow]!.map((c) => norm(c ?? ""));

  const c = {
    id: headerIndex(header, "match", "match no", "match #", "match id", "no", "#", "id"),
    event: headerIndex(header, "event", "category", "draw"),
    round: headerIndex(header, "round", "stage", "rd"),
    group: headerIndex(header, "group", "pool"),
    date: headerIndex(header, "date", "day"),
    time: headerIndex(header, "time", "start", "start time"),
    court: headerIndex(header, "court"),
    side1: headerIndex(header, ...side1Names),
    side2: headerIndex(header, ...side2Names),
    s1: headerIndex(header, "score 1", "player 1 score", "team 1 score", "points 1"),
    s2: headerIndex(header, "score 2", "player 2 score", "team 2 score", "points 2"),
    score: headerIndex(header, "score", "result", "scores"),
    winner: headerIndex(header, "winner", "won by"),
    status: headerIndex(header, "status", "live"),
  };

  const get = (row: string[], i: number) => (i >= 0 ? row[i]?.trim() : undefined) || undefined;

  const matches: Match[] = [];
  let lastEvent: EventMeta | undefined;
  let lastRound: string | undefined;
  for (const [index, row] of grid.slice(headerRow + 1).entries()) {
    if (!row || row.every((cell) => !cell?.trim())) continue;
    const side1 = get(row, c.side1);
    const side2 = get(row, c.side2);
    if (!side1 && !side2) continue;
    const event = findEvent(get(row, c.event)) ?? lastEvent ?? defaultEvent;
    if (!event) continue;
    lastEvent = event;

    const roundRaw = get(row, c.round) ?? (get(row, c.event) ? undefined : lastRound);
    lastRound = roundRaw;
    const groupRaw =
      get(row, c.group) ?? (roundRaw?.match(/group\s*(\w+)/i)?.[1] ? roundRaw : undefined);
    let size = roundSize(roundRaw);
    const isGroup =
      event.format === "groups" &&
      (size === undefined || /group|league|pool/i.test(roundRaw ?? ""));
    if (isGroup) size = 0;

    const idRaw = get(row, c.id);
    const no = idRaw ? numbers(idRaw)[0] : undefined;

    let games: [number, number][] = [];
    const s1 = numbers(get(row, c.s1));
    const s2 = numbers(get(row, c.s2));
    if (s1.length && s2.length) {
      games = s1.slice(0, s2.length).map((v, i) => [v, s2[i]!] as [number, number]);
    } else if (c.score >= 0) {
      const all = numbers(get(row, c.score));
      for (let i = 0; i + 1 < all.length; i += 2) games.push([all[i]!, all[i + 1]!]);
    }
    games = games.filter(([a, b]) => a !== b || a > 0);

    const winnerRaw = get(row, c.winner);
    let winnerSide: 1 | 2 | undefined;
    const w = norm(winnerRaw ?? "");
    if (w && side1 && side2) {
      if (w === "1" || (norm(side1) && norm(side1).startsWith(w)) || norm(side1) === w)
        winnerSide = 1;
      else if (w === "2" || norm(side2) === w || norm(side2).startsWith(w)) winnerSide = 2;
      else {
        const hit = (side: string) =>
          splitPlayers(side).some((p) => norm(p) === w || w.includes(norm(p)));
        winnerSide = hit(side1) ? 1 : hit(side2) ? 2 : undefined;
      }
    }

    const s1raw = side1 ?? "TBD";
    const s2raw = side2 ?? "TBD";
    const groupLabel = groupRaw?.replace(/^(group|pool)\s*/i, "").trim();
    matches.push({
      id: idRaw ?? `${event.id}-${index}`,
      no,
      event: event.id,
      stage: isGroup ? "group" : "ko",
      group: isGroup ? groupLabel || undefined : undefined,
      round: isGroup
        ? groupLabel
          ? `Group ${groupLabel}`
          : "Group stage"
        : size
          ? roundLabel(size)
          : roundRaw,
      size: size ?? 0,
      date: get(row, c.date),
      time: get(row, c.time),
      minutes: parseClock(get(row, c.time)),
      windowEnd: parseWindowEnd(get(row, c.time)),
      court: get(row, c.court)?.replace(/^court\s*/i, ""),
      side1: s1raw,
      side2: s2raw,
      players1: isSlot(s1raw) ? [] : splitPlayers(s1raw),
      players2: isSlot(s2raw) ? [] : splitPlayers(s2raw),
      games,
      winnerSide,
      live:
        /^(live|on court|ongoing|in progress|playing|true)$/i.test(get(row, c.status) ?? "") ||
        undefined,
    });
  }

  return sortMatches(matches);
}

export function sortMatches(matches: Match[]): Match[] {
  const order = (id: EventId) => EVENTS.findIndex((e) => e.id === id);
  return [...matches].sort(
    (a, b) =>
      (a.minutes ?? 9999) - (b.minutes ?? 9999) ||
      (a.no ?? 9999) - (b.no ?? 9999) ||
      (a.court ?? "").localeCompare(b.court ?? "", undefined, { numeric: true }) ||
      order(a.event) - order(b.event),
  );
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

export type Score = {
  /** Games won by each side (a single-game match counts as 1-0). */
  games1: number;
  games2: number;
  /** Rally points over all games. */
  points1: number;
  points2: number;
  started: boolean;
  done: boolean;
  winner: 0 | 1 | 2;
  walkover: boolean;
};

export function matchScore(match: Match): Score {
  let games1 = 0;
  let games2 = 0;
  let points1 = 0;
  let points2 = 0;
  for (const [a, b] of match.games) {
    points1 += a;
    points2 += b;
    if (a > b) games1++;
    else if (b > a) games2++;
  }
  const bye1 = isBye(match.side1);
  const bye2 = isBye(match.side2);
  let winner: 0 | 1 | 2 = 0;
  let walkover = false;
  if (match.winnerSide) {
    winner = match.winnerSide;
    walkover = match.games.length === 0;
  } else if (bye1 !== bye2) {
    winner = bye1 ? 2 : 1;
    walkover = true;
  } else if (match.games.length && games1 !== games2 && !match.live) {
    winner = games1 > games2 ? 1 : 2;
  }
  return {
    games1,
    games2,
    points1,
    points2,
    started: match.games.length > 0,
    done: winner !== 0,
    winner,
    walkover,
  };
}

/** Display name of a side: "A & B", or the slot text. */
export function sideName(match: Match, side: 1 | 2): string {
  const players = side === 1 ? match.players1 : match.players2;
  const raw = side === 1 ? match.side1 : match.side2;
  return players.length ? players.join(" & ") : raw;
}

export function winnerOf(match: Match): { players: string[]; name: string } | undefined {
  const s = matchScore(match);
  if (!s.winner) return undefined;
  const players = s.winner === 1 ? match.players1 : match.players2;
  if (!players.length) return undefined;
  return { players, name: players.join(" & ") };
}

export function loserOf(match: Match): { players: string[]; name: string } | undefined {
  const s = matchScore(match);
  if (!s.winner) return undefined;
  const players = s.winner === 1 ? match.players2 : match.players1;
  if (!players.length) return undefined;
  return { players, name: players.join(" & ") };
}

/* ------------------------------------------------------------------ *
 * Group tables (women's events only)
 * ------------------------------------------------------------------ */

export type StandingRow = {
  key: string;
  name: string;
  players: string[];
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  points: number;
};

const sideKey = (players: string[]) => players.map(norm).sort().join("|");

export function groupsOf(matches: Match[], event: EventId): string[] {
  const set = new Set<string>();
  for (const m of matches) if (m.event === event && m.stage === "group") set.add(m.group ?? "");
  return [...set].sort();
}

/**
 * Ranked on wins (points = wins × POINTS_PER_WIN), then head-to-head among the
 * sides level on wins, then points difference, then points won. Entries from
 * the event tab appear with zeros before any result is in.
 */
export function standings(
  matches: Match[],
  event: EventId,
  group: string,
  entries: Entry[] = [],
): StandingRow[] {
  const groupMatches = matches.filter(
    (m) => m.event === event && m.stage === "group" && (m.group ?? "") === group,
  );
  const rows = new Map<string, StandingRow>();
  const ensure = (players: string[]) => {
    const key = sideKey(players);
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        name: players.join(" & "),
        players,
        played: 0,
        won: 0,
        lost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        points: 0,
      });
    }
    return rows.get(key)!;
  };
  for (const m of groupMatches) {
    if (m.players1.length) ensure(m.players1);
    if (m.players2.length) ensure(m.players2);
  }
  // With no fixtures yet and a single group, the entry list is the table.
  if (groupMatches.length === 0 && group === "") {
    for (const e of entries.filter((x) => x.event === event)) ensure(e.players);
  }
  for (const m of groupMatches) {
    const s = matchScore(m);
    if (!s.done || !m.players1.length || !m.players2.length) continue;
    const a = ensure(m.players1);
    const b = ensure(m.players2);
    a.played++;
    b.played++;
    if (s.winner === 1) {
      a.won++;
      b.lost++;
    } else {
      b.won++;
      a.lost++;
    }
    a.pointsFor += s.points1;
    a.pointsAgainst += s.points2;
    b.pointsFor += s.points2;
    b.pointsAgainst += s.points1;
  }
  const list = [...rows.values()];
  for (const r of list) r.points = r.won * POINTS_PER_WIN;

  const h2hWins = (key: string, level: string[]) =>
    groupMatches.filter((m) => {
      const k1 = sideKey(m.players1);
      const k2 = sideKey(m.players2);
      if (k1 !== key && k2 !== key) return false;
      const other = k1 === key ? k2 : k1;
      if (!level.includes(other)) return false;
      const w = matchScore(m).winner;
      return (w === 1 && k1 === key) || (w === 2 && k2 === key);
    }).length;

  return list.sort((a, b) => {
    if (b.won !== a.won) return b.won - a.won;
    const level = list.filter((r) => r.won === a.won).map((r) => r.key);
    const h = h2hWins(b.key, level) - h2hWins(a.key, level);
    if (h) return h;
    const pd = b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst);
    if (pd) return pd;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.name.localeCompare(b.name);
  });
}

export function groupComplete(matches: Match[], event: EventId, group: string): boolean {
  const g = matches.filter(
    (m) => m.event === event && m.stage === "group" && (m.group ?? "") === group,
  );
  return g.length > 0 && g.every((m) => matchScore(m).done);
}

export function formatPd(row: StandingRow): string {
  const d = row.pointsFor - row.pointsAgainst;
  return d > 0 ? `+${d}` : String(d);
}

/* ------------------------------------------------------------------ *
 * Slots: "Winner M12" and "1st Group A" turn into names as results land
 * ------------------------------------------------------------------ */

const ordinal = (s: string): number | undefined => {
  if (/\b(1st|first|top|winner)\b/.test(s)) return 1;
  if (/\b(2nd|second|runner ?up)\b/.test(s)) return 2;
  if (/\b(3rd|third)\b/.test(s)) return 3;
  return undefined;
};

/** Resolve every slot to players where results allow; leave a readable label otherwise. */
export function resolveMatches(matches: Match[]): Match[] {
  const byNo = new Map<number, Match>();
  for (const m of matches) if (m.no !== undefined) byNo.set(m.no, m);
  const done = new Map<string, Match>();

  const resolve = (m: Match, depth = 0): Match => {
    const cached = done.get(m.id);
    if (cached) return cached;
    if (depth > 12) return m;
    const fill = (raw: string, current: string[]): { players: string[]; label: string } => {
      if (current.length) return { players: current, label: raw };
      const s = norm(raw);
      const ref =
        s.match(/\b(winner|loser|w|l)\b(?: of)?(?: match| m| game)?\s*m?\s*(\d+)\b/) ??
        s.match(/^(w|l)\s*(\d+)$/);
      if (ref?.[1] && ref[2]) {
        const wins = ref[1].startsWith("w");
        const label = `${wins ? "Winner" : "Loser"} M${ref[2]}`;
        const src = byNo.get(Number(ref[2]));
        if (!src) return { players: [], label };
        const r = resolve(src, depth + 1);
        const who = wins ? winnerOf(r) : loserOf(r);
        return who ? { players: who.players, label: raw } : { players: [], label };
      }
      const place = ordinal(s);
      if (place && m.stage === "ko") {
        const g = s.match(/\b(?:group|grp|pool)\s*([a-z0-9]+)\b/)?.[1];
        const groups = groupsOf(matches, m.event);
        const group = g
          ? (groups.find((x) => norm(x) === g) ?? g.toUpperCase())
          : (groups[0] ?? "");
        const gLabel = group ? `Group ${group}` : "the group";
        const label = `${place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"} in ${gLabel}`;
        if (!groupComplete(matches, m.event, group)) return { players: [], label };
        const row = standings(matches, m.event, group)[place - 1];
        return row ? { players: row.players, label: raw } : { players: [], label };
      }
      return { players: [], label: raw };
    };
    const a = fill(m.side1, m.players1);
    const b = fill(m.side2, m.players2);
    const out: Match = {
      ...m,
      players1: a.players,
      players2: b.players,
      side1: a.label,
      side2: b.label,
    };
    done.set(m.id, out);
    return out;
  };

  return matches.map((m) => resolve(m));
}

/* ------------------------------------------------------------------ *
 * Who is the visitor?
 * ------------------------------------------------------------------ */

export const samePerson = (a: string, b: string) => norm(a) === norm(b);

export const inSide = (players: string[], name: string) => players.some((p) => samePerson(p, name));

export function playerSide(match: Match, name: string): 0 | 1 | 2 {
  if (inSide(match.players1, name)) return 1;
  if (inSide(match.players2, name)) return 2;
  return 0;
}

/** Matches the player is named in, in schedule order. */
export function playerMatches(matches: Match[], name: string): Match[] {
  return matches.filter((m) => playerSide(m, name) !== 0);
}

/**
 * The match a player reaches by winning `match`: a later match whose slot reads
 * "Winner M<no>". Only for knockouts with match numbers.
 */
export function nextIfWin(matches: Match[], match: Match): Match | undefined {
  if (match.no === undefined) return undefined;
  const re = new RegExp(`\\b(winner|w)\\b(?: of)?(?: match| m)?\\s*m?\\s*${match.no}\\b`, "i");
  return matches.find((m) => m.id !== match.id && (re.test(m.side1) || re.test(m.side2)));
}

export function stageLabel(match: Match): string {
  return match.round ?? (match.stage === "group" ? "Group stage" : "Knockout");
}

export const opponentOf = (match: Match, name: string) => {
  const side = playerSide(match, name);
  return side === 1 ? sideName(match, 2) : sideName(match, 1);
};

export const partnerOf = (match: Match, name: string) => {
  const side = playerSide(match, name);
  const players = side === 1 ? match.players1 : side === 2 ? match.players2 : [];
  return players.filter((p) => !samePerson(p, name));
};
