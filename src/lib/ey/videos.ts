import { type EventId, type Match } from "./model";
import raw from "./videos.json";

/**
 * Match videos recorded by the PlayMo app on match day. videos.json is made once by
 * scripts/match-videos.ts: it links each app recording to a sheet match (event + match id)
 * and holds no player names. Names, round and score come from the sheet, like everywhere else.
 */
export type Clip = { url: string; thumbnailUrl?: string | null | undefined; seconds: number };

type Entry = { event: string; matchId: string; clips: Clip[] };

const byKey = new Map<string, Clip[]>(
  (raw as Entry[]).map((v) => [`${v.event}:${v.matchId}`, v.clips]),
);

export function clipsFor(match: Pick<Match, "event" | "id">): Clip[] {
  return byKey.get(`${match.event}:${match.id}`) ?? [];
}

/** Matches with a video, final first, then semis, quarters and group games; then by number. */
export function matchesWithVideo(matches: Match[], event: EventId): Match[] {
  const order = (m: Match) => (m.size > 0 ? m.size : 1000);
  return matches
    .filter((m) => m.event === event && clipsFor(m).length > 0)
    .sort((a, b) => order(a) - order(b) || (a.no ?? 0) - (b.no ?? 0));
}

export function eventsWithVideo(): Set<string> {
  return new Set((raw as Entry[]).map((v) => v.event));
}

/** "8 min", "45 sec". */
export function durationLabel(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  return `${Math.round(seconds / 60)} min`;
}
