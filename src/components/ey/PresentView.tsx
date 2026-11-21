/**
 * Present mode: a TV board for screencasting a phone or laptop to a big screen.
 *
 * Five separate events, one board. A fixed 1600×900 stage scaled to fit, so a phone
 * held sideways and a TV show the same picture:
 *   - a strip of five event cards (where each event is, how far through, its champion);
 *   - a spotlight that turns through the events every few seconds (tap a card to hold one);
 *   - a right rail across every event: on court now, called next, latest results.
 * What is on court comes only from the sheet (Status = Live, or scores in and not finished).
 */
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  EVENTS,
  eventMeta,
  formatPd,
  groupsOf,
  isBye,
  matchScore,
  roundsLabel,
  sideName,
  standings,
  winnerOf,
  type EventId,
  type EventMeta,
  type Match,
  type Tournament,
} from "@/lib/ey/model";

const W = 1600;
const H = 900;
const SPOT_MS = 14_000;

type Props = {
  data: Tournament;
  matches: Match[];
  onExit: () => void;
  /** Open the spotlight on this event (the page's ?ev=). */
  initialEvent?: EventId | undefined;
};

/* ------------------------------------------------------------------ *
 * Match helpers
 * ------------------------------------------------------------------ */

const isDone = (m: Match) => matchScore(m).done;
const isLive = (m: Match) => {
  const s = matchScore(m);
  return !s.done && (Boolean(m.live) || s.started);
};
/** A row that is only a bye carrying a player through: not a match anyone plays. */
const isByeRow = (m: Match) => isBye(m.side1) || isBye(m.side2);
const playable = (ms: Match[]) => ms.filter((m) => !isByeRow(m));
const byNo = (a: Match, b: Match) => (a.no ?? 9999) - (b.no ?? 9999);

type EventStatus = {
  meta: EventMeta;
  played: number;
  total: number;
  live: number;
  /** "Round of 32", "Group stage", "Semi-finals", "Final". */
  stage: string;
  champion?: string | undefined;
  started: boolean;
};

function eventStatus(matches: Match[], meta: EventMeta): EventStatus {
  const ms = playable(matches.filter((m) => m.event === meta.id));
  const played = ms.filter(isDone).length;
  const live = ms.filter(isLive).length;
  const final = ms.find((m) => m.stage === "ko" && m.size === 2);
  const champion = final ? winnerOf(final)?.name : undefined;
  const open = ms.filter((m) => !isDone(m));
  let stage = "";
  if (open.some((m) => m.stage === "group")) stage = "Group stage";
  else {
    const size = Math.max(0, ...open.map((m) => m.size));
    stage = size ? roundsLabel(size) : "Complete";
  }
  return {
    meta,
    played,
    total: ms.length,
    live,
    stage,
    champion,
    started: played > 0 || live > 0,
  };
}

/* ------------------------------------------------------------------ *
 * Board
 * ------------------------------------------------------------------ */

export function PresentView({ data, matches, onExit, initialEvent }: Props) {
  const scale = useStageScale();
  const portrait = usePortrait();
  useWakeLock();
  const controls = useIdleControls();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onExit();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const statuses = useMemo(() => EVENTS.map((e) => eventStatus(matches, e)), [matches]);
  const { spot, pinned, toggle, hold, cycleKey } = useSpotlight(
    Math.max(
      0,
      EVENTS.findIndex((e) => e.id === initialEvent),
    ),
  );
  const event = EVENTS[spot]!.id;
  // The desk calls from the match list; the draw / table is one tap away. Kept across events.
  const [view, setView] = useState<SpotView>("matches");

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#1d1d24] text-white">
      <div
        className="absolute left-1/2 top-1/2 origin-center"
        style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <div className="flex h-full flex-col bg-ink">
          <TopBar demo={data.demo} nowOverride={data.nowOverride} />
          <EventStrip
            statuses={statuses}
            spot={spot}
            pinned={pinned}
            cycleKey={cycleKey}
            onPick={toggle}
          />
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_430px] gap-6 px-7 pb-6 pt-5">
            <Spotlight
              key={event}
              event={event}
              data={data}
              matches={matches}
              onHold={hold}
              view={view}
              onView={setView}
            />
            <Rail matches={matches} />
          </div>
        </div>
      </div>

      {portrait && (
        <p className="absolute inset-x-0 top-6 mx-auto w-fit rounded-full bg-optic px-4 py-2 text-[13px] font-extrabold text-ink">
          Turn your phone sideways to fill the TV
        </p>
      )}

      <button
        type="button"
        onClick={onExit}
        aria-label="Exit present mode"
        className={cn(
          "absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-extrabold text-white backdrop-blur transition-opacity duration-300",
          controls ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <X className="size-4" strokeWidth={3} /> Exit
      </button>
    </div>
  );
}

/** Which event the spotlight shows. Turns on its own; a tap on a card holds it, a second tap lets go. */
function useSpotlight(start: number) {
  const [spot, setSpot] = useState(start);
  const [pinned, setPinned] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);
  useEffect(() => {
    if (pinned) return;
    const id = window.setTimeout(() => {
      setSpot((s) => (s + 1) % EVENTS.length);
      setCycleKey((k) => k + 1);
    }, SPOT_MS);
    return () => window.clearTimeout(id);
  }, [spot, pinned, cycleKey]);
  const toggle = (i: number) => {
    if (pinned && i === spot) setPinned(false);
    else {
      setSpot(i);
      setPinned(true);
    }
    setCycleKey((k) => k + 1);
  };
  /** Stay on the current event (someone is browsing its rounds). */
  const hold = () => {
    setPinned(true);
    setCycleKey((k) => k + 1);
  };
  return { spot, pinned, toggle, hold, cycleKey };
}

/* ------------------------------------------------------------------ *
 * Top bar
 * ------------------------------------------------------------------ */

function TopBar({
  demo,
  nowOverride,
}: {
  demo?: boolean | undefined;
  nowOverride?: number | undefined;
}) {
  const time = useWallClock(demo ? nowOverride : undefined);
  return (
    <header className="flex h-[96px] shrink-0 items-center justify-between px-7">
      <div className="flex items-center gap-4">
        <img src="/brand/ey-on-dark.svg" alt="EY" width={69} height={69} className="size-[62px]" />
        <span className="leading-none">
          <span className="block text-[34px] font-black tracking-[-0.02em]">EY FSO Pickleball</span>
          <span className="mt-2 block text-[13px] font-bold uppercase tracking-[0.3em] text-white/60">
            Tournament · Sat 21 Nov · 5 events
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 rounded-full bg-live px-4 py-2 text-[16px] font-black uppercase tracking-[0.14em]">
          <span className="live-dot size-2.5 rounded-full bg-white" />
          Live scores
        </span>
        {demo && (
          <span className="rounded-full bg-white/15 px-3 py-2 text-[13px] font-extrabold">
            Sample data
          </span>
        )}
      </div>

      <div className="flex items-center gap-7">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold text-white/60">
          Sports Tech Partner
          <img
            src="/brand/athletiq.webp"
            alt="Athletiq"
            width={96}
            height={16}
            className="h-[22px] w-auto brightness-0 invert"
          />
        </span>
        <span className="font-narrow text-[48px] font-black leading-none tabular-nums text-optic">
          {time}
        </span>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * The five events
 * ------------------------------------------------------------------ */

function EventStrip({
  statuses,
  spot,
  pinned,
  cycleKey,
  onPick,
}: {
  statuses: EventStatus[];
  spot: number;
  pinned: boolean;
  cycleKey: number;
  onPick: (i: number) => void;
}) {
  return (
    <nav aria-label="Events" className="grid shrink-0 grid-cols-5 gap-3 px-7">
      {statuses.map((s, i) => {
        const on = i === spot;
        const pct = s.total ? Math.round((s.played / s.total) * 100) : 0;
        return (
          <button
            key={s.meta.id}
            type="button"
            onClick={() => onPick(i)}
            aria-pressed={on}
            className={cn(
              "relative flex h-[128px] flex-col overflow-hidden rounded-[20px] px-5 pb-4 pt-4 text-left transition-colors duration-500",
              on ? "bg-optic text-ink" : "bg-white/[0.07] text-white",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-narrow text-[40px] font-black leading-none">{s.meta.id}</span>
              {s.live > 0 ? (
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black uppercase tracking-[0.1em]",
                    on ? "bg-ink text-white" : "bg-live text-white",
                  )}
                >
                  <span className="live-dot size-1.5 rounded-full bg-white" />
                  {s.live} on court
                </span>
              ) : s.champion ? (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[12px] font-black uppercase tracking-[0.1em]",
                    on ? "bg-ink text-optic" : "bg-optic text-ink",
                  )}
                >
                  Decided
                </span>
              ) : null}
            </span>
            <span className="mt-1.5 truncate text-[18px] font-extrabold">{s.meta.name}</span>
            <span
              className={cn("truncate text-[14px] font-bold", on ? "text-ink/65" : "text-white/55")}
            >
              {s.champion
                ? `Champion: ${s.champion}`
                : s.started
                  ? `${s.stage}, ${s.played}/${s.total} played`
                  : `Starts ${s.meta.start}`}
            </span>
            {s.started && !s.champion && (
              <span
                className={cn(
                  "mt-auto h-[5px] overflow-hidden rounded-full",
                  on ? "bg-ink/15" : "bg-white/10",
                )}
              >
                <span
                  className={cn("block h-full rounded-full", on ? "bg-ink" : "bg-optic")}
                  style={{ width: `${pct}%` }}
                />
              </span>
            )}
            {on && !pinned && (
              <span
                key={cycleKey}
                className="spot-timer absolute inset-x-0 bottom-0 h-[4px] origin-left bg-ink/35"
                style={{ animationDuration: `${SPOT_MS}ms` }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * Spotlight: one event, large
 * ------------------------------------------------------------------ */

type SpotView = "matches" | "draw";

function Spotlight({
  event,
  data,
  matches,
  onHold,
  view,
  onView,
}: {
  event: EventId;
  data: Tournament;
  matches: Match[];
  onHold: () => void;
  view: SpotView;
  onView: (v: SpotView) => void;
}) {
  const meta = eventMeta(event);
  const status = eventStatus(matches, meta);
  return (
    <section className="spot-in flex min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-4">
        <span className="h-[3px] w-10 bg-optic" />
        <h2 className="text-[38px] font-black leading-none tracking-[-0.02em]">{meta.name}</h2>
        <span className="flex items-center gap-3 text-[20px] font-bold text-white/55">
          {status.champion ? (
            "Complete"
          ) : (
            <>
              <span>{meta.formatLabel}</span>
              <span className="size-1.5 rounded-full bg-white/30" />
              <span>Starts {meta.start}</span>
            </>
          )}
        </span>
        <span className="h-[3px] flex-1 bg-white/10" />
        <ViewSwitch
          view={view}
          drawLabel={meta.format === "knockout" ? "Draw" : "Table"}
          onView={(v) => {
            onView(v);
            onHold();
          }}
        />
      </div>
      <div className="mt-4 min-h-0 flex-1">
        {view === "matches" ? (
          <MatchList event={event} matches={matches} />
        ) : status.champion ? (
          <ChampionHero meta={meta} name={status.champion} matches={matches} />
        ) : meta.format === "knockout" ? (
          <KnockoutSpot event={event} matches={matches} onHold={onHold} />
        ) : (
          <GroupSpot event={event} data={data} matches={matches} />
        )}
      </div>
    </section>
  );
}

function ViewSwitch({
  view,
  drawLabel,
  onView,
}: {
  view: SpotView;
  drawLabel: string;
  onView: (v: SpotView) => void;
}) {
  const opts: { id: SpotView; label: string }[] = [
    { id: "matches", label: "All matches" },
    { id: "draw", label: drawLabel },
  ];
  return (
    <div className="flex shrink-0 rounded-full bg-white/[0.07] p-1">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onView(o.id)}
          aria-pressed={view === o.id}
          className={cn(
            "h-9 rounded-full px-4 text-[15px] font-black transition-colors duration-200",
            view === o.id ? "bg-optic text-ink" : "text-white/60 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const LIST_ROW = 46;
const LIST_ROWS = 10;

/**
 * Every match of the event in calling order (match number), flowing down then across, so
 * the desk can read who to call: live in red, ready to call in yellow, results with scores.
 */
function MatchList({ event, matches }: { event: EventId; matches: Match[] }) {
  const list = playable(matches.filter((m) => m.event === event)).sort(byNo);
  if (!list.length) return <Empty text="Fixtures coming up" />;
  const cols = Math.max(1, Math.ceil(list.length / LIST_ROWS));
  const rows = Math.ceil(list.length / cols);
  const done = list.filter(isDone).length;
  const live = list.filter(isLive).length;
  const ready = list.filter((m) => !isDone(m) && !isLive(m) && sidesKnown(m)).length;
  return (
    <div className="spot-in flex h-full flex-col gap-3">
      <p className="flex shrink-0 items-center gap-5 text-[14px] font-black uppercase tracking-[0.16em] text-white/50">
        <span>{list.length} matches</span>
        {live > 0 && (
          <span className="flex items-center gap-2 text-live">
            <span className="live-dot size-2 rounded-full bg-live" /> {live} on court
          </span>
        )}
        {ready > 0 && <span className="text-optic">{ready} ready to call</span>}
        <span>{done} done</span>
      </p>
      <ol
        className="grid min-h-0 gap-x-3 gap-y-1.5"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, ${LIST_ROW}px)`,
          gridAutoFlow: "column",
        }}
      >
        {list.map((m) => (
          <ListRow key={m.id} match={m} />
        ))}
      </ol>
    </div>
  );
}

const sidesKnown = (m: Match) => m.players1.length > 0 && m.players2.length > 0;

const shortRound = (m: Match) => {
  if (m.stage === "group") return m.group ? `Grp ${m.group}` : "Group";
  if (m.size === 2) return "Final";
  if (m.size === 4) return "SF";
  if (m.size === 8) return "QF";
  return m.size ? `R${m.size}` : (m.round ?? "");
};

function ListRow({ match }: { match: Match }) {
  const s = matchScore(match);
  const live = isLive(match);
  const ready = !s.done && !live && sidesKnown(match);
  const side = (n: 1 | 2) => {
    const players = n === 1 ? match.players1 : match.players2;
    const won = s.winner === n;
    const lost = s.winner !== 0 && !won;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[15px] leading-[19px]",
            players.length ? "font-extrabold" : "font-semibold italic text-white/40",
            lost && "opacity-45",
          )}
        >
          {sideName(match, n)}
        </span>
        {s.started && (
          <span
            className={cn(
              "font-narrow w-6 shrink-0 text-right text-[19px] font-black leading-none",
              won && "text-optic",
              lost && "opacity-45",
            )}
          >
            {n === 1 ? s.points1 : s.points2}
          </span>
        )}
      </span>
    );
  };
  return (
    <li
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-[11px] pr-3",
        live ? "bg-white/[0.1] ring-2 ring-live ring-inset" : "bg-white/[0.05]",
        s.done && "bg-white/[0.025]",
      )}
    >
      <span
        className={cn(
          "flex h-full w-[52px] shrink-0 flex-col items-center justify-center rounded-l-[11px] leading-none",
          live
            ? "bg-live text-white"
            : ready
              ? "bg-optic text-ink"
              : "bg-white/[0.06] text-white/55",
        )}
      >
        <span className="font-narrow text-[19px] font-black">M{match.no ?? ""}</span>
        <span className="mt-0.5 text-[9.5px] font-black uppercase tracking-[0.06em]">
          {match.court ? `C${match.court}` : shortRound(match)}
        </span>
      </span>
      <span className={cn("flex min-w-0 flex-1 flex-col", s.done && "opacity-70")}>
        {side(1)}
        {side(2)}
      </span>
    </li>
  );
}

function ChampionHero({
  meta,
  name,
  matches,
}: {
  meta: EventMeta;
  name: string;
  matches: Match[];
}) {
  const final = matches.find((m) => m.event === meta.id && m.stage === "ko" && m.size === 2);
  return (
    <div className="flex h-full flex-col justify-center rounded-[28px] bg-optic px-14 text-ink">
      <p className="text-[22px] font-black uppercase tracking-[0.3em] text-ink/60">
        {meta.name} champion{meta.doubles ? "s" : ""}
      </p>
      <p className="mt-4 text-[76px] font-black leading-[0.95] tracking-[-0.03em]">{name}</p>
      {final && (
        <div className="mt-10 max-w-[640px]">
          <p className="text-[16px] font-black uppercase tracking-[0.2em] text-ink/55">Final</p>
          <div className="mt-2">
            <MatchCard match={final} size="lg" tone="light" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The round being played now; beside it the next round, when both are small (QF → SF, SF → F).
 * Tap a round in the path to look at it instead; that holds the board on this event.
 */
function KnockoutSpot({
  event,
  matches,
  onHold,
}: {
  event: EventId;
  matches: Match[];
  onHold: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const ko = playable(matches.filter((m) => m.event === event && m.stage === "ko"));
  const sizes = [...new Set(ko.map((m) => m.size))].sort((a, b) => b - a);
  const current = sizes.find((sz) => ko.some((m) => m.size === sz && !isDone(m))) ?? sizes.at(-1);
  if (current === undefined) return <Empty text="Draw coming up" />;
  const shown = picked !== null && sizes.includes(picked) ? picked : current;
  const round = ko.filter((m) => m.size === shown).sort(byNo);
  const nextSize = sizes[sizes.indexOf(shown) + 1];
  const next = nextSize !== undefined ? ko.filter((m) => m.size === nextSize).sort(byNo) : [];
  const pair = picked === null && round.length <= 4 && next.length > 0 && next.length <= 4;
  const pick = (sz: number) => {
    setPicked(sz === current ? null : sz);
    onHold();
  };

  return (
    <div className="flex h-full flex-col gap-5">
      <RoundPath sizes={sizes} current={current} shown={shown} onPick={pick} />
      {pair ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-6">
          <RoundColumn title={roundsLabel(shown)} matches={round} />
          <RoundColumn title={`Next: ${roundsLabel(nextSize!)}`} matches={next} faded />
        </div>
      ) : (
        <RoundGrid key={shown} matches={round} />
      )}
    </div>
  );
}

function RoundPath({
  sizes,
  current,
  shown,
  onPick,
}: {
  sizes: number[];
  current: number;
  shown: number;
  onPick: (size: number) => void;
}) {
  const short = (sz: number) => (sz === 2 ? "Final" : sz === 4 ? "SF" : sz === 8 ? "QF" : `R${sz}`);
  return (
    <div className="flex shrink-0 items-center gap-5">
      <ol className="flex items-center">
        {sizes.map((sz, i) => {
          const state = sz > current ? "done" : sz === current ? "now" : "later";
          const on = sz === shown;
          return (
            <li key={sz} className="flex items-center">
              {i > 0 && (
                <span
                  className={cn("h-[2px] w-8", state === "later" ? "bg-white/12" : "bg-optic/50")}
                />
              )}
              <button
                type="button"
                onClick={() => onPick(sz)}
                aria-pressed={on}
                className={cn(
                  "grid h-10 min-w-[68px] place-items-center rounded-full px-4 text-[15px] font-black uppercase tracking-[0.08em] transition-colors duration-200",
                  state === "now" && "bg-optic text-ink",
                  state === "done" && "bg-optic/20 text-optic",
                  state === "later" && "bg-white/[0.06] text-white/50 hover:bg-white/[0.12]",
                  on && state !== "now" && "bg-white text-ink hover:bg-white",
                  on && "ring-[3px] ring-white/40 ring-offset-2 ring-offset-ink",
                )}
              >
                {short(sz)}
              </button>
            </li>
          );
        })}
      </ol>
      {shown !== current && (
        <span className="text-[15px] font-bold text-white/45">
          Viewing {roundsLabel(shown)} · tap {short(current)} for the round on now
        </span>
      )}
    </div>
  );
}

/** A whole round as a grid of equal cards that always fits: 2 across up to 8, 4 across up to 16. */
function RoundGrid({ matches }: { matches: Match[] }) {
  const n = matches.length;
  const cols = n <= 1 ? 1 : n <= 8 ? 2 : 4;
  const size = n <= 4 ? "lg" : n <= 8 ? "md" : "sm";
  return (
    <div
      className="spot-in grid min-h-0 content-start gap-4 overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {matches.map((m) => (
        <MatchCard key={m.id} match={m} size={size} />
      ))}
    </div>
  );
}

function RoundColumn({
  title,
  matches,
  faded = false,
}: {
  title: string;
  matches: Match[];
  faded?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
      <p
        className={cn(
          "text-[14px] font-black uppercase tracking-[0.2em]",
          faded ? "text-white/40" : "text-optic",
        )}
      >
        {title}
      </p>
      {matches.map((m) => (
        <MatchCard key={m.id} match={m} size="md" faded={faded} />
      ))}
    </div>
  );
}

function GroupSpot({
  event,
  data,
  matches,
}: {
  event: EventId;
  data: Tournament;
  matches: Match[];
}) {
  const groups = groupsOf(matches, event);
  const tableGroups = groups.length ? groups : [""];
  const ko = playable(matches.filter((m) => m.event === event && m.stage === "ko")).sort(
    (a, b) => b.size - a.size || byNo(a, b),
  );
  const two = tableGroups.length > 1;
  return (
    <div
      className={cn("grid h-full gap-6", two ? "grid-rows-[1fr_auto]" : "grid-cols-[1fr_380px]")}
    >
      <div className={cn("grid min-h-0 gap-6", two && "grid-cols-2")}>
        {tableGroups.map((g) => {
          const gm = matches.filter(
            (m) => m.event === event && m.stage === "group" && (m.group ?? "") === g,
          );
          return (
            <GroupTable
              key={g}
              title={g ? `Group ${g}` : "Group table"}
              rows={standings(matches, event, g, data.entries)}
              played={gm.filter(isDone).length}
              total={gm.length}
              doubles={eventMeta(event).doubles}
            />
          );
        })}
      </div>
      {ko.length > 0 && (
        <div className="flex min-h-0 flex-col">
          <p className="mb-3 text-[15px] font-black uppercase tracking-[0.2em] text-white/55">
            {two ? "Top 2 of each group → semi-finals → final" : "Top 2 → the final"}
          </p>
          <div className={cn("grid content-start gap-3", two ? "grid-cols-3" : "grid-cols-1")}>
            {ko.map((m) => (
              <MatchCard key={m.id} match={m} size="md" label />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupTable({
  title,
  rows,
  played,
  total,
  doubles,
}: {
  title: string;
  rows: ReturnType<typeof standings>;
  played: number;
  total: number;
  doubles: boolean;
}) {
  const compact = rows.length > 5 || doubles;
  return (
    <div className="flex min-h-0 flex-col self-start overflow-hidden rounded-[22px] bg-white text-ink">
      <div className="flex h-[48px] shrink-0 items-center justify-between bg-ink/[0.06] px-5">
        <span className="text-[18px] font-black uppercase tracking-[0.14em]">{title}</span>
        <span className="text-[15px] font-bold text-ink/55">
          {played} of {total} played
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[13px] font-black uppercase tracking-[0.12em] text-ink/50">
            <th className="w-12 py-2 pl-5 text-left">#</th>
            <th className="py-2 text-left">{doubles ? "Pair" : "Player"}</th>
            <th className="w-12 py-2 text-center">P</th>
            <th className="w-12 py-2 text-center">W</th>
            <th className="w-14 py-2 text-center">PD</th>
            <th className="w-16 py-2 pr-5 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.key}
              className={cn("border-t border-ink/10", i < 2 && r.played > 0 && "bg-optic/35")}
            >
              <td className="py-0 pl-5">
                <span className="font-narrow text-[24px] font-black">{i + 1}</span>
              </td>
              <td
                className={cn(
                  "max-w-0 truncate font-extrabold",
                  compact ? "py-2 text-[18px]" : "py-3 text-[22px]",
                )}
              >
                {r.name}
              </td>
              <td className="font-narrow text-center text-[22px] font-bold text-ink/60">
                {r.played}
              </td>
              <td className="font-narrow text-center text-[22px] font-bold">{r.won}</td>
              <td className="font-narrow text-center text-[22px] font-bold text-ink/60">
                {formatPd(r)}
              </td>
              <td className="font-narrow pr-5 text-right text-[28px] font-black">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A match
 * ------------------------------------------------------------------ */

const CARD = {
  sm: { h: "h-[106px]", px: "px-4", name: "text-[17px]", num: "text-[26px] w-8" },
  md: { h: "h-[112px]", px: "px-5", name: "text-[20px]", num: "text-[30px] w-10" },
  lg: { h: "h-[190px]", px: "px-7", name: "text-[30px]", num: "text-[44px] w-14" },
} as const;

function MatchCard({
  match,
  size,
  tone = "dark",
  label = false,
  faded = false,
}: {
  match: Match;
  size: keyof typeof CARD;
  tone?: "dark" | "light";
  label?: boolean;
  faded?: boolean;
}) {
  const s = matchScore(match);
  const live = isLive(match);
  const c = CARD[size];
  const dark = tone === "dark";
  const sideRow = (side: 1 | 2) => {
    const players = side === 1 ? match.players1 : match.players2;
    const won = s.winner === side;
    const lost = s.winner !== 0 && !won;
    const score = s.started ? (side === 1 ? s.points1 : s.points2) : null;
    return (
      <div className={cn("flex min-h-0 flex-1 items-center gap-3", lost && "opacity-40")}>
        <span
          className={cn(
            "h-[60%] w-[4px] shrink-0 rounded-full",
            won ? (dark ? "bg-optic" : "bg-ink") : "bg-transparent",
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate leading-tight",
            c.name,
            players.length ? "font-extrabold" : "font-semibold italic opacity-55",
          )}
        >
          {sideName(match, side)}
        </span>
        {won && s.walkover && (
          <span className="text-[12px] font-black uppercase tracking-[0.1em] opacity-60">W/O</span>
        )}
        <span
          className={cn(
            "font-narrow shrink-0 text-right font-black leading-none tabular-nums",
            c.num,
            won && dark && "text-optic",
          )}
        >
          {score ?? ""}
        </span>
      </div>
    );
  };
  return (
    <article
      className={cn(
        "flex shrink-0 flex-col overflow-hidden rounded-[16px] pb-1.5 pt-2.5",
        c.h,
        c.px,
        dark ? "bg-white/[0.07] text-white" : "bg-ink/[0.08] text-ink",
        live && "ring-[3px] ring-live ring-inset",
        faded && "opacity-60",
      )}
    >
      <div className="flex h-[16px] shrink-0 items-center justify-between gap-2 text-[11.5px] font-black uppercase tracking-[0.14em]">
        <span className="truncate opacity-45">
          {match.no !== undefined ? `Match ${match.no}` : ""}
          {label && match.round ? ` · ${match.round}` : ""}
          {match.court ? ` · Court ${match.court}` : ""}
        </span>
        {live && (
          <span className="flex items-center gap-1.5 text-live">
            <span className="live-dot size-1.5 rounded-full bg-live" /> Live
          </span>
        )}
      </div>
      {sideRow(1)}
      <span className={cn("ml-[16px] h-px shrink-0", dark ? "bg-white/10" : "bg-ink/10")} />
      {sideRow(2)}
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center rounded-[28px] bg-white/5">
      <p className="text-[36px] font-black text-white/70">{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Right rail: every event at once
 * ------------------------------------------------------------------ */

function Rail({ matches }: { matches: Match[] }) {
  const all = playable(matches);
  const live = all.filter(isLive).sort(byNo);
  // Match numbers run in calling order, so the lowest open number is called next.
  const ready = (m: Match) => m.players1.length > 0 && m.players2.length > 0;
  const next = all
    .filter((m) => !isDone(m) && !isLive(m) && ready(m))
    .sort(byNo)
    .slice(0, 4);
  const results = all.filter(isDone).sort((a, b) => byNo(b, a));
  const resultCount = Math.max(2, 7 - Math.min(live.length, 4) - next.length);

  return (
    <aside className="flex min-h-0 flex-col gap-5 overflow-hidden">
      <RailBlock title="On court now" live>
        {live.length ? (
          live.slice(0, 4).map((m) => <RailRow key={m.id} match={m} />)
        ) : (
          <p className="px-1 text-[17px] font-semibold text-white/45">Waiting for the next call.</p>
        )}
      </RailBlock>
      {next.length > 0 && (
        <RailBlock title="Called next">
          {next.map((m) => (
            <RailRow key={m.id} match={m} />
          ))}
        </RailBlock>
      )}
      {results.length > 0 && (
        <RailBlock title="Latest results">
          {results.slice(0, resultCount).map((m) => (
            <RailRow key={m.id} match={m} />
          ))}
        </RailBlock>
      )}
    </aside>
  );
}

function RailBlock({
  title,
  live,
  children,
}: {
  title: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col gap-2">
      <h3 className="flex items-center gap-2 text-[15px] font-black uppercase tracking-[0.2em] text-white/55">
        {live && <span className="live-dot size-2 rounded-full bg-live" />}
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function RailRow({ match }: { match: Match }) {
  const s = matchScore(match);
  const live = isLive(match);
  const side = (n: 1 | 2) => {
    const won = s.winner === n;
    const lost = s.winner !== 0 && !won;
    return (
      <div className="flex items-center gap-2">
        <span
          className={cn("min-w-0 flex-1 truncate text-[16px] font-extrabold", lost && "opacity-45")}
        >
          {sideName(match, n)}
        </span>
        <span
          className={cn(
            "font-narrow w-7 shrink-0 text-right text-[22px] font-black leading-none",
            won && "text-optic",
            lost && "opacity-45",
          )}
        >
          {s.started ? (n === 1 ? s.points1 : s.points2) : ""}
        </span>
      </div>
    );
  };
  return (
    <div
      className={cn(
        "flex items-stretch gap-3 rounded-[14px] px-3 py-2",
        live ? "bg-white/[0.1] ring-2 ring-live" : "bg-white/[0.05]",
      )}
    >
      <span className="flex w-12 shrink-0 flex-col items-center justify-center rounded-[10px] bg-optic text-ink">
        <span className="font-narrow text-[20px] font-black leading-none">{match.event}</span>
        <span className="mt-0.5 text-[10px] font-black">
          {match.court ? `C${match.court}` : match.no !== undefined ? `M${match.no}` : ""}
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {side(1)}
        {side(2)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Screen helpers
 * ------------------------------------------------------------------ */

function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

function usePortrait() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return portrait;
}

/** Stop the phone dimming mid-cast. Re-acquired when the tab comes back. */
function useWakeLock() {
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<Lock> };
    };
    let lock: Lock | null = null;
    const get = async () => {
      try {
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        /* not allowed or not supported */
      }
    };
    const onVis = () => document.visibilityState === "visible" && void get();
    void get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/** The exit button shows on tap or mouse move, then fades so the TV stays clean. */
function useIdleControls() {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let t = window.setTimeout(() => setShown(false), 3000);
    const wake = () => {
      setShown(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setShown(false), 3000);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, []);
  return shown;
}

/** Wall-clock time (or the demo's frozen minutes), as "11:42". */
function useWallClock(frozen: number | undefined) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const fmt = (min: number) => {
      const h = Math.floor(min / 60) % 12 || 12;
      return `${h}:${String(min % 60).padStart(2, "0")}`;
    };
    if (frozen !== undefined) {
      setLabel(fmt(frozen));
      return;
    }
    const tick = () => {
      const d = new Date();
      setLabel(fmt(d.getHours() * 60 + d.getMinutes()));
    };
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, [frozen]);
  return label;
}
