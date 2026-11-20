import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  eventMeta,
  formatClock,
  inSide,
  isBye,
  matchScore,
  meridiem,
  timeLabel,
  nextIfWin,
  norm,
  playerSide,
  roundLabel,
  sideName,
  stageLabel,
  winnerOf,
  type EventId,
  type Match,
} from "@/lib/ey/model";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { matchState, type Clock } from "./shared";

/*
 * A knockout bracket built for phones.
 *
 * Two rounds at a time: the round in focus as a full column, the next round
 * peeking in on the right, joined by lines that show where each winner goes.
 * Swipe (or tap a round chip) and the bracket slides one round across; the new
 * round in focus closes up so nothing is spread thin. Wider screens show more
 * rounds side by side with the same mechanism.
 */

const H = 78; // tile height
const META = 20; // the time / court line at the top of a tile
const ROW = 29; // one side
const G = 12; // vertical gap between tiles in the round in focus
const GAP = 30; // horizontal gap between rounds (where the lines run)
const rowCenter = (slot: 0 | 1) => META + ROW * slot + ROW / 2;

type Bracket = {
  cols: Match[][];
  feeders: Map<string, [Match | undefined, Match | undefined]>;
  parent: Map<string, Match>;
};

const refNo = (raw: string) => {
  const m =
    raw.match(/\b(?:winner|w)\b(?:\s+of)?(?:\s*match|\s*m)?\s*m?\s*(\d+)\b/i) ??
    raw.match(/^w\s*(\d+)$/i);
  return m?.[1] ? Number(m[1]) : undefined;
};

/** Columns in bracket order (feeders adjacent), and who feeds whom. */
function buildBracket(list: Match[]): Bracket {
  const sizes = [...new Set(list.map((m) => m.size))].sort((a, b) => b - a);
  const colOf = (m: Match) => sizes.indexOf(m.size);
  const byNo = new Map<number, Match>();
  for (const m of list) if (m.no !== undefined) byNo.set(m.no, m);

  const feeders = new Map<string, [Match | undefined, Match | undefined]>();
  let linked = false;
  for (const m of list) {
    const pair: [Match | undefined, Match | undefined] = [m.side1, m.side2].map((raw, i) => {
      const n = refNo(raw);
      let f = n !== undefined ? byNo.get(n) : undefined;
      // Once a winner is picked the sheet shows their name instead of "Winner Match N":
      // the feeder is the earlier match that this side won.
      if (!f) {
        const players = (i === 0 ? m.players1 : m.players2).map(norm).sort().join("|");
        if (players)
          f = list.find(
            (x) =>
              colOf(x) < colOf(m) &&
              (winnerOf(x)?.players.map(norm).sort().join("|") ?? "") === players,
          );
      }
      if (f) linked = true;
      return f && colOf(f) < colOf(m) ? f : undefined;
    }) as [Match | undefined, Match | undefined];
    feeders.set(m.id, pair);
  }

  const byCol: Match[][] = sizes.map((s) =>
    list.filter((m) => m.size === s).sort((a, b) => (a.no ?? 0) - (b.no ?? 0)),
  );
  // No "Winner M#" links in the sheet: pair matches in order, 1 and 2 feed 1.
  if (!linked) {
    for (let c = 1; c < byCol.length; c++) {
      const prev = byCol[c - 1]!;
      byCol[c]!.forEach((m, i) => {
        if (prev.length === byCol[c]!.length * 2) feeders.set(m.id, [prev[2 * i], prev[2 * i + 1]]);
      });
    }
  }

  const parent = new Map<string, Match>();
  for (const m of list) for (const f of feeders.get(m.id) ?? []) if (f) parent.set(f.id, m);

  // Walk down from the final so each round lists its matches top to bottom.
  const cols: Match[][] = sizes.map(() => []);
  const seen = new Set<string>();
  const visit = (m: Match) => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    cols[colOf(m)]!.push(m);
    for (const f of feeders.get(m.id) ?? []) if (f) visit(f);
  };
  for (const root of byCol[byCol.length - 1] ?? []) visit(root);
  for (let c = byCol.length - 1; c >= 0; c--) for (const m of byCol[c]!) visit(m);
  return { cols, feeders, parent };
}

/** Tops for every tile with round `base` in focus. */
function layout(b: Bracket, base: number): Map<string, number> {
  const top = new Map<string, number>();
  b.cols[base]?.forEach((m, i) => top.set(m.id, i * (H + G)));
  for (let c = base + 1; c < b.cols.length; c++) {
    let prevBottom = -G;
    for (const m of b.cols[c]!) {
      const targets: number[] = [];
      (b.feeders.get(m.id) ?? []).forEach((f, slot) => {
        const y = f ? top.get(f.id) : undefined;
        if (y !== undefined) targets.push(y + H / 2 - rowCenter(slot as 0 | 1));
      });
      let y = targets.length ? targets.reduce((s, v) => s + v, 0) / targets.length : prevBottom + G;
      y = Math.max(y, prevBottom + G);
      top.set(m.id, y);
      prevBottom = y + H;
    }
  }
  // Rounds already passed slide out to the left, folded into the match they fed.
  for (let c = base - 1; c >= 0; c--) {
    for (const m of b.cols[c]!) {
      const p = b.parent.get(m.id);
      top.set(m.id, (p && top.get(p.id)) ?? 0);
    }
  }
  return top;
}

const firstName = (name: string) =>
  name.split(/\s+/).find((w) => w.replace(/[^a-z]/gi, "").length >= 3) ?? name;

/** Singles: the full name. Doubles: first names, "Santosh & Starling". */
function shortSide(m: Match, side: 1 | 2): string {
  const players = side === 1 ? m.players1 : m.players2;
  const raw = side === 1 ? m.side1 : m.side2;
  if (!players.length) return isBye(raw) ? "Bye" : raw.replace(/^Winner\s+/i, "Winner ");
  return players.length > 1 ? players.map(firstName).join(" & ") : players[0]!;
}

const chipLabel = (size: number) =>
  size > 64
    ? "Prelim"
    : size === 64
      ? "R64"
      : size === 2
        ? "Final"
        : size === 4
          ? "SF"
          : size === 8
            ? "QF"
            : `R${size}`;

export function BracketView({
  event,
  list,
  all,
  clock,
  me,
}: {
  event: EventId;
  /** This event's knockout matches, resolved. */
  list: Match[];
  /** Every match, for "winner plays next". */
  all: Match[];
  clock: Clock;
  me?: string | undefined;
}) {
  const meta = eventMeta(event);
  const bracket = useMemo(() => buildBracket(list), [list]);
  const ncols = bracket.cols.length;
  const sizes = bracket.cols.map((c) => c[0]?.size ?? 0);

  // Your route: every match you're in, then on up the draw while you're still alive.
  const path = useMemo(() => {
    const ids = new Set<string>();
    if (!me) return ids;
    const mine = list.filter((m) => playerSide(m, me) !== 0);
    for (const m of mine) ids.add(m.id);
    const last = mine.sort((a, b) => a.size - b.size)[0];
    if (last) {
      const w = matchScore(last).winner;
      if (!w || w === playerSide(last, me)) {
        let p = bracket.parent.get(last.id);
        while (p) {
          ids.add(p.id);
          p = bracket.parent.get(p.id);
        }
      }
    }
    return ids;
  }, [bracket, list, me]);

  const startCol = useMemo(() => {
    const colIdx = (m: Match) => bracket.cols.findIndex((c) => c.includes(m));
    if (me) {
      const mine = list.filter((m) => playerSide(m, me) !== 0);
      const current =
        mine.find((m) => !matchScore(m).done) ?? mine.sort((a, b) => a.size - b.size)[0];
      if (current) return Math.max(0, Math.min(colIdx(current), ncols - 2));
    }
    const open = bracket.cols.findIndex((c) => c.some((m) => !matchScore(m).done));
    return Math.max(0, Math.min(open < 0 ? ncols - 1 : open, Math.max(0, ncols - 2)));
  }, [bracket, list, me, ncols]);

  const [base, setBase] = useState(startCol);
  const [open, setOpen] = useState<Match | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const colW = Math.round(Math.min(250, Math.max(190, (width - GAP) * 0.64)));
  const x = (c: number) => (c - base) * (colW + GAP);
  const top = useMemo(() => layout(bracket, base), [bracket, base]);

  const final = bracket.cols[ncols - 1]?.[0];
  const champion = final ? winnerOf(final) : undefined;
  const champTop = final ? (top.get(final.id) ?? 0) + (H - 64) / 2 : 0;
  const champCol = ncols; // a column of its own after the final

  // Height: the tallest column from the round in focus onwards.
  let height = 0;
  for (let c = base; c < ncols; c++)
    for (const m of bracket.cols[c]!) height = Math.max(height, (top.get(m.id) ?? 0) + H);

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(ncols - 1, next));
    if (clamped === base) return;
    setBase(clamped);
    const el = boxRef.current;
    if (el && el.getBoundingClientRect().top < 120) {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 130,
        behavior: "smooth",
      });
    }
  };

  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div>
      <div className="sticky top-14 z-10 -mx-5 bg-background/95 px-5 py-3 backdrop-blur-sm sm:mx-0 sm:px-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(base - 1)}
            disabled={base === 0}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-card disabled:opacity-35"
            aria-label="Previous round"
          >
            <ChevronLeft className="size-4" strokeWidth={2.6} />
          </button>
          <div
            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] pr-6 [scrollbar-width:none]"
            role="tablist"
            aria-label="Rounds"
          >
            {sizes.map((size, c) => (
              <button
                key={size}
                type="button"
                role="tab"
                aria-selected={c === base}
                onClick={() => go(c)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-extrabold transition-colors",
                  c === base
                    ? "bg-ink text-optic"
                    : c === base + 1
                      ? "border border-ink/40 bg-card"
                      : "border border-line bg-card text-dim hover:text-ink",
                )}
              >
                {chipLabel(size)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(base + 1)}
            disabled={base >= ncols - 1}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-card disabled:opacity-35"
            aria-label="Next round"
          >
            <ChevronRight className="size-4" strokeWidth={2.6} />
          </button>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3 text-[12px] font-bold text-dim">
          <span className="text-ink">
            {roundLabel(sizes[base] ?? 2)}
            {base + 1 < ncols && (
              <span className="text-dim"> → {roundLabel(sizes[base + 1]!)}</span>
            )}
          </span>
          {base + 1 < ncols && <span className="lg:hidden">Swipe for the next round</span>}
        </div>
      </div>

      <div
        ref={boxRef}
        className="bracket relative mt-2 overflow-hidden"
        style={{ height: Math.max(height, H) + 8 }}
        onTouchStart={(e) => {
          const t = e.touches[0]!;
          touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const t = e.changedTouches[0]!;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) go(base + (dx < 0 ? 1 : -1));
        }}
      >
        {/* Lines: from each match to the slot its winner takes. */}
        {bracket.cols.flatMap((col, c) =>
          c === 0
            ? []
            : col.flatMap((m) =>
                (bracket.feeders.get(m.id) ?? []).map((f, slot) => {
                  if (!f) return null;
                  const y1 = (top.get(f.id) ?? 0) + H / 2;
                  const y2 = (top.get(m.id) ?? 0) + rowCenter(slot as 0 | 1);
                  const x1 = x(c - 1) + colW;
                  const tone =
                    path.has(f.id) && path.has(m.id) ? "me" : winnerOf(f) ? "won" : "idle";
                  return (
                    <Elbow
                      key={`${f.id}>${m.id}`}
                      x1={x1}
                      y1={y1}
                      x2={x(c)}
                      y2={y2}
                      tone={tone}
                      hidden={c - 1 < base}
                    />
                  );
                }),
              ),
        )}
        {final && (
          <Elbow
            x1={x(ncols - 1) + colW}
            y1={(top.get(final.id) ?? 0) + H / 2}
            x2={x(champCol)}
            y2={champTop + 32}
            tone={champion ? "won" : "idle"}
            hidden={false}
          />
        )}

        {bracket.cols.flatMap((col, c) =>
          col.map((m) => (
            <Tile
              key={m.id}
              match={m}
              me={me}
              onPath={path.has(m.id)}
              clock={clock}
              left={x(c)}
              top={top.get(m.id) ?? 0}
              width={colW}
              hidden={c < base}
              byeSlots={
                // A bye only when the round before was a full round, not a short preliminary.
                c > 0 && (sizes[c - 1] ?? 0) < 64
                  ? (bracket.feeders.get(m.id) ?? []).map((f) => !f)
                  : [false, false]
              }
              onOpen={() => setOpen(m)}
            />
          )),
        )}

        {final && (
          <div
            className="bracket-move absolute flex h-16 items-center gap-3 rounded-[16px] px-3.5"
            style={{
              left: x(champCol),
              top: champTop,
              width: colW,
              background: champion ? "var(--ink)" : "var(--card)",
              color: champion ? "white" : undefined,
              border: champion ? undefined : "1px dashed var(--line)",
            }}
          >
            <Trophy
              className={cn("size-6 shrink-0", champion ? "text-optic" : "text-dim")}
              aria-hidden="true"
            />
            <span className="min-w-0 leading-tight">
              <span
                className={cn("block text-[11px] font-bold", champion ? "opacity-80" : "text-dim")}
              >
                Champion{meta.doubles ? "s" : ""}
              </span>
              <span className="block truncate text-[15px] font-extrabold">
                {champion ? champion.name : "To be decided"}
              </span>
            </span>
          </div>
        )}
      </div>

      <MatchSheet match={open} all={all} me={me} onClose={() => setOpen(null)} />
    </div>
  );
}

function Elbow({
  x1,
  y1,
  x2,
  y2,
  tone,
  hidden,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone: "me" | "won" | "idle";
  hidden: boolean;
}) {
  const xm = x1 + (x2 - x1) / 2;
  const w = tone === "me" ? 3 : tone === "won" ? 2 : 1.5;
  const color = tone === "me" ? "var(--ink)" : tone === "won" ? "var(--dim)" : "var(--line)";
  const down = y2 >= y1;
  const style = { borderColor: color, opacity: hidden ? 0 : 1 };
  return (
    <>
      <span
        aria-hidden="true"
        className="bracket-move pointer-events-none absolute"
        style={{
          ...style,
          left: x1,
          top: (down ? y1 : y2) - w / 2,
          width: xm - x1,
          height: Math.abs(y2 - y1) + w,
          borderStyle: "solid",
          borderWidth: 0,
          borderRightWidth: w,
          [down ? "borderTopWidth" : "borderBottomWidth"]: w,
          borderTopRightRadius: down ? 6 : 0,
          borderBottomRightRadius: down ? 0 : 6,
        }}
      />
      <span
        aria-hidden="true"
        className="bracket-move pointer-events-none absolute"
        style={{
          ...style,
          left: xm,
          top: y2 - w / 2,
          width: x2 - xm,
          height: 0,
          borderStyle: "solid",
          borderWidth: 0,
          borderTopWidth: w,
        }}
      />
    </>
  );
}

function Tile({
  match,
  me,
  onPath,
  clock,
  left,
  top,
  width,
  hidden,
  byeSlots,
  onOpen,
}: {
  match: Match;
  me?: string | undefined;
  onPath: boolean;
  clock: Clock;
  left: number;
  top: number;
  width: number;
  hidden: boolean;
  byeSlots: boolean[];
  onOpen: () => void;
}) {
  const s = matchScore(match);
  const state = matchState(match, clock.now);
  return (
    <button
      type="button"
      onClick={onOpen}
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
      className={cn(
        "bracket-move absolute overflow-hidden rounded-md border bg-card text-left transition-shadow hover:shadow-[0_6px_16px_-10px_oklch(0.3_0.018_285/0.6)]",
        onPath ? "border-ink border-2" : "border-line",
        hidden && "pointer-events-none",
      )}
      style={{ left, top, width, height: H, opacity: hidden ? 0 : 1 }}
    >
      <span className="flex h-[20px] items-center gap-1.5 px-2.5 text-[10.5px] font-bold text-dim">
        {match.no !== undefined && <span className="text-ink">M{match.no}</span>}
        {timeLabel(match) && <span className="tabular-nums">{timeLabel(match)}</span>}
        {match.court && <span>· Ct {match.court}</span>}
        <span className="ml-auto">
          {state === "live" ? (
            <span className="inline-flex items-center gap-1 font-extrabold text-live">
              <span className="live-dot size-1.5 rounded-full bg-live" />
              LIVE
            </span>
          ) : s.walkover && s.done ? (
            "W/O"
          ) : null}
        </span>
      </span>
      {([1, 2] as const).map((side) => {
        const players = side === 1 ? match.players1 : match.players2;
        const known = players.length > 0;
        const win = s.winner === side;
        const lose = s.winner !== 0 && !win;
        const mine = me ? inSide(players, me) : false;
        return (
          <span
            key={side}
            className={cn(
              "flex h-[29px] items-center gap-2 border-t border-line/70 px-2.5",
              mine && "bg-optic",
            )}
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13.5px] leading-none",
                known ? "font-semibold" : "italic text-dim",
                win && "font-extrabold",
                lose && !mine && "text-dim",
              )}
            >
              {shortSide(match, side)}
            </span>
            {known && byeSlots[side - 1] && !match.games.length && (
              <span className="shrink-0 rounded bg-secondary px-1 text-[9.5px] font-extrabold uppercase text-dim">
                bye
              </span>
            )}
            {match.games.length > 0 && (
              <span className="flex shrink-0 gap-1.5">
                {match.games.map((g, i) => {
                  const ours = side === 1 ? g[0] : g[1];
                  const theirs = side === 1 ? g[1] : g[0];
                  return (
                    <span
                      key={i}
                      className={cn(
                        "w-5 text-right text-[13.5px] tabular-nums",
                        ours > theirs ? "font-extrabold" : "font-semibold text-dim",
                      )}
                    >
                      {ours}
                    </span>
                  );
                })}
              </span>
            )}
          </span>
        );
      })}
    </button>
  );
}

/** Tap a tile: full names, time, court, score, and where the winner goes. */
function MatchSheet({
  match,
  all,
  me,
  onClose,
}: {
  match: Match | null;
  all: Match[];
  me?: string | undefined;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<Match | null>(match);
  useEffect(() => {
    if (match) setShown(match);
  }, [match]);
  const m = shown;
  const s = m ? matchScore(m) : undefined;
  const ahead = m ? nextIfWin(all, m) : undefined;
  const meta = m ? eventMeta(m.event) : undefined;

  return (
    <Drawer open={Boolean(match)} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-lg border-line bg-background">
        {m && s && meta && (
          <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <DrawerHeader className="px-0 text-left">
              <DrawerDescription className="text-[13px] font-bold text-dim">
                {meta.name}
                {m.no !== undefined && ` · M${m.no}`}
              </DrawerDescription>
              <DrawerTitle className="font-wide text-[28px] font-black leading-none tracking-[-0.02em] text-ink">
                {stageLabel(m)}
              </DrawerTitle>
            </DrawerHeader>
            <dl className="grid grid-cols-3 gap-2">
              <Fact label="Time" value={timeLabel(m) ?? "Desk calls"} />
              <Fact label="Court" value={m.court ?? "TBA"} />
              <Fact
                label="Status"
                value={
                  s.done
                    ? s.walkover
                      ? "Walkover"
                      : "Final"
                    : m.live || s.started
                      ? "Live"
                      : "Upcoming"
                }
              />
            </dl>
            <div className="mt-4 overflow-hidden rounded-md border border-line bg-card">
              {([1, 2] as const).map((side) => {
                const players = side === 1 ? m.players1 : m.players2;
                const raw = side === 1 ? m.side1 : m.side2;
                const win = s.winner === side;
                const mine = me ? inSide(players, me) : false;
                return (
                  <div
                    key={side}
                    className={cn(
                      "flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0",
                      mine && "bg-optic",
                      s.winner !== 0 && !win && !mine && "text-dim",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      {players.length ? (
                        players.map((p) => (
                          <span
                            key={p}
                            className={cn(
                              "block text-[16px] leading-snug",
                              win ? "font-extrabold" : "font-semibold",
                            )}
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="block text-[16px] italic text-dim">
                          {isBye(raw) ? "Bye" : raw}
                        </span>
                      )}
                    </span>
                    {m.games.map((g, i) => (
                      <span
                        key={i}
                        className={cn(
                          "font-narrow w-7 text-right text-[26px] leading-none tabular-nums",
                          (side === 1 ? g[0] > g[1] : g[1] > g[0])
                            ? "font-black"
                            : "font-bold text-dim",
                        )}
                      >
                        {side === 1 ? g[0] : g[1]}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
            {ahead && (
              <p className="mt-4 rounded-md bg-secondary px-4 py-3 text-[14.5px] font-semibold leading-snug">
                {s.done
                  ? `${sideName(m, s.winner as 1 | 2)} play${winnerOf(m)!.players.length > 1 ? "" : "s"}`
                  : "The winner plays"}{" "}
                the <span className="font-extrabold">{stageLabel(ahead).toLowerCase()}</span>
                {timeLabel(ahead) && ` (${timeLabel(ahead)})`}
                {ahead.court && `, Court ${ahead.court}`}.
              </p>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-card px-3 py-2.5 ring-1 ring-line">
      <dt className="text-[11px] font-bold text-dim">{label}</dt>
      <dd className="font-narrow mt-0.5 text-[24px] font-black leading-none">{value}</dd>
    </div>
  );
}
