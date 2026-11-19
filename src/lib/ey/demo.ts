/**
 * ?demo=1: a sample day built from the real entry lists so the site can be
 * previewed before the fixtures are posted. Clearly labelled as not the real
 * draw. Four courts, 20-minute slots from 9 AM, the clock frozen mid-morning.
 */
import { EVENTS, roundLabel, sortMatches, type Entry, type EventId, type Match } from "./model";

const COURTS = 4;
const SLOT_MIN = 20;
const START = 9 * 60;

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Draft = Omit<Match, "minutes" | "time" | "court" | "games"> & {
  feeders: number[];
  level: number;
};

export function demoMatches(entries: Entry[]): { matches: Match[]; now: number } {
  const rand = rng(20261121);
  const shuffle = <T>(list: T[]) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };

  const drafts: Draft[] = [];
  let no = 0;
  const add = (d: Omit<Draft, "id" | "no">) => {
    no++;
    drafts.push({ ...d, id: `M${no}`, no });
    return no;
  };
  const names = (e: Entry) => e.players.join(" & ");

  for (const event of EVENTS) {
    // Unpaired doubles entries sit out of the sample draw.
    const list = shuffle(
      entries.filter((e) => e.event === event.id && e.players.length === (event.doubles ? 2 : 1)),
    );
    if (list.length < 2) continue;
    const id = event.id as EventId;

    if (event.format === "groups") {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          add({
            event: id,
            stage: "group",
            round: "Group stage",
            size: 0,
            side1: names(list[i]!),
            side2: names(list[j]!),
            players1: list[i]!.players,
            players2: list[j]!.players,
            feeders: [],
            level: 0,
          });
        }
      }
      add({
        event: id,
        stage: "ko",
        round: "Final",
        size: 2,
        side1: "1st in group",
        side2: "2nd in group",
        players1: [],
        players2: [],
        feeders: [],
        level: 9,
      });
      continue;
    }

    // Knockout: a short preliminary round when only a few are over a power of two, else byes.
    let size = 2;
    while (size < list.length) size *= 2;
    let slots: { label: string; players: string[]; from?: number }[];
    let level = 1;
    if (list.length - size / 2 <= size / 8 && list.length > size / 2) {
      const extra = list.length - size / 2;
      const prelim = list.slice(0, extra * 2);
      const direct = list.slice(extra * 2);
      const winners = [];
      for (let i = 0; i < prelim.length; i += 2) {
        const m = add({
          event: id,
          stage: "ko",
          round: "Preliminary round",
          size: 64,
          side1: names(prelim[i]!),
          side2: names(prelim[i + 1]!),
          players1: prelim[i]!.players,
          players2: prelim[i + 1]!.players,
          feeders: [],
          level: 0,
        });
        winners.push({ label: `Winner M${m}`, players: [], from: m });
      }
      size /= 2;
      slots = direct.map((e) => ({ label: names(e), players: e.players }));
      // Spread the qualifiers through the draw.
      winners.forEach((w, i) =>
        slots.splice(Math.floor(((i + 0.5) * slots.length) / winners.length) + i, 0, w),
      );
    } else {
      slots = list.map((e) => ({ label: names(e), players: e.players }));
      const byes = size - list.length;
      // Each bye is a pairing of one entry with nobody: the entry walks into round 2.
      for (let i = 0; i < byes; i++) slots.splice(i * 2 + 1, 0, { label: "BYE", players: [] });
    }

    let round = slots;
    while (size >= 2) {
      const next: typeof slots = [];
      for (let i = 0; i < round.length; i += 2) {
        const a = round[i]!;
        const b = round[i + 1]!;
        if (b.label === "BYE") {
          next.push(a);
          continue;
        }
        const m = add({
          event: id,
          stage: "ko",
          round: roundLabel(size),
          size,
          side1: a.label,
          side2: b.label,
          players1: a.players,
          players2: b.players,
          feeders: [a.from, b.from].filter((x): x is number => x !== undefined),
          level,
        });
        next.push({ label: `Winner M${m}`, players: [], from: m });
      }
      round = next;
      size /= 2;
      level++;
    }
  }

  // Schedule: earliest slot after the feeders, one match per player per slot.
  const slotOf = new Map<number, number>();
  const busy = new Map<number, Set<string>>();
  const courts = new Map<number, number>();
  const order = [...drafts].sort((a, b) => a.level - b.level || a.no! - b.no!);
  const placed: Match[] = [];
  for (const d of order) {
    let slot = Math.max(0, ...d.feeders.map((f) => (slotOf.get(f) ?? 0) + 1));
    if (d.level === 9)
      slot = Math.max(
        slot,
        ...placed
          .filter((p) => p.event === d.event)
          .map((p) => (p.minutes! - START) / SLOT_MIN + 1),
      );
    const people = [...d.players1, ...d.players2];
    while ((courts.get(slot) ?? 0) >= COURTS || people.some((p) => busy.get(slot)?.has(p))) slot++;
    courts.set(slot, (courts.get(slot) ?? 0) + 1);
    busy.set(slot, new Set([...(busy.get(slot) ?? []), ...people]));
    slotOf.set(d.no!, slot);
    const minutes = START + slot * SLOT_MIN;
    const { feeders: _f, level: _l, ...rest } = d;
    placed.push({ ...rest, minutes, court: String(courts.get(slot)), games: [] });
  }

  // Results for the first stretch of the morning; one match live.
  const sorted = sortMatches(placed);
  const nowSlot = 5;
  const now = START + nowSlot * SLOT_MIN + 4;
  for (const m of sorted) {
    const slot = (m.minutes! - START) / SLOT_MIN;
    if (slot < nowSlot) {
      const win = rand() < 0.5;
      const lose = Math.floor(rand() * 9) + 2;
      m.games = [win ? [11, lose] : [lose, 11]];
    } else if (slot === nowSlot && m.court === "1") {
      m.live = true;
      m.games = [[6, 4]];
    }
  }
  return { matches: sorted, now };
}
