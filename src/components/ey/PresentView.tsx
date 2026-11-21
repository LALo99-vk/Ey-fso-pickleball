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

export function PresentView({ data, matches, onExit }: Props) {
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
  const { spot, pinned, toggle, cycleKey } = useSpotlight();
  const event = EVENTS[spot]!.id;

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
            <Spotlight key={event} event={event} data={data} matches={matches} />
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
          "absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-extrabold text-white backdrop-blur transition-opacity duration-300",
          controls ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <X className="size-4" strokeWidth={3} /> Exit
      </button>
    </div>
  );
}

/** Which event the spotlight shows. Turns on its own; a tap on a card holds it, a second tap lets go. */
function useSpotlight() {
  const [spot, setSpot] = useState(0);
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
  return { spot, pinned, toggle, cycleKey };
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
              "relative flex h-[132px] flex-col overflow-hidden rounded-[20px] px-5 pb-4 pt-4 text-left transition-colors duration-500",
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
                ? `Champion · ${s.champion}`
                : s.started
                  ? `${s.stage} · ${s.played} of ${s.total} played`
                  : `Starts ${s.meta.start} · ${s.meta.formatLabel}`}
            </span>
            <span
              className={cn(
                "mt-auto h-[6px] overflow-hidden rounded-full",
                on ? "bg-ink/15" : "bg-white/10",
              )}
            >
              <span
                className={cn("block h-full rounded-full", on ? "bg-ink" : "bg-optic")}
                style={{ width: `${pct}%` }}
              />
            </span>
            {on && !pinned && (
              <span
                key={cycleKey}
                className="spot-timer absolute inset-x-0 bottom-0 h-[3px] origin-left bg-ink/40"
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

function Spotlight({
  event,
  data,
  matches,
}: {
  event: EventId;
  data: Tournament;
  matches: Match[];
}) {
  const meta = eventMeta(event);
  const status = eventStatus(matches, meta);
  return (
    <section className="spot-in flex min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-4">
        <span className="h-[3px] w-10 bg-optic" />
        <h2 className="text-[38px] font-black leading-none tracking-[-0.02em]">{meta.name}</h2>
        <span className="text-[20px] font-bold text-white/55">
          {status.champion ? "Complete" : status.started ? status.stage : `Starts ${meta.start}`}
        </span>
        <span className="h-[3px] flex-1 bg-white/10" />
      </div>
      <div className="mt-4 min-h-0 flex-1">
        {status.champion ? (
          <ChampionHero meta={meta} name={status.champion} matches={matches} />
        ) : meta.format === "knockout" ? (
          <KnockoutSpot event={event} matches={matches} />
        ) : (
          <GroupSpot event={event} data={data} matches={matches} />
        )}
      </div>
    </section>
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

/** The round being played now; with a small round, the one after it too. */
function KnockoutSpot({ event, matches }: { event: EventId; matches: Match[] }) {
  const ko = playable(matches.filter((m) => m.event === event && m.stage === "ko"));
  const sizes = [...new Set(ko.map((m) => m.size))].sort((a, b) => b - a);
  const current = sizes.find((sz) => ko.some((m) => m.size === sz && !isDone(m))) ?? sizes.at(-1);
  if (current === undefined) return <Empty text="Draw coming up" />;
  const round = ko.filter((m) => m.size === current).sort(byNo);
  const nextSize = sizes[sizes.indexOf(current) + 1];
  const showNext = round.length <= 4 && nextSize !== undefined;
  const next = showNext ? ko.filter((m) => m.size === nextSize).sort(byNo) : [];

  return (
    <div className="flex h-full flex-col gap-4">
      <RoundPath sizes={sizes} current={current} />
      <div className={cn("grid min-h-0 flex-1 gap-6", showNext && "grid-cols-[1fr_1fr]")}>
        <RoundBlock title={roundsLabel(current)} matches={round} wide={!showNext} />
        {showNext && <RoundBlock title={`Then: ${roundsLabel(nextSize!)}`} matches={next} faded />}
      </div>
    </div>
  );
}

function RoundPath({ sizes, current }: { sizes: number[]; current: number }) {
  const short = (sz: number) => (sz === 2 ? "Final" : sz === 4 ? "SF" : sz === 8 ? "QF" : `R${sz}`);
  return (
    <ol className="flex shrink-0 items-center gap-2">
      {sizes.map((sz, i) => {
        const state = sz > current ? "done" : sz === current ? "now" : "later";
        return (
          <li key={sz} className="flex items-center gap-2">
            {i > 0 && <span className="h-[2px] w-6 bg-white/15" />}
            <span
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[15px] font-black uppercase tracking-[0.08em]",
                state === "now" && "bg-optic text-ink",
                state === "done" && "bg-white/10 text-white/45 line-through decoration-2",
                state === "later" && "text-white/45 ring-2 ring-white/15 ring-inset",
              )}
            >
              {short(sz)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RoundBlock({
  title,
  matches,
  wide = false,
  faded = false,
}: {
  title: string;
  matches: Match[];
  wide?: boolean;
  faded?: boolean;
}) {
  const n = matches.length;
  const cols = wide ? (n > 8 ? 4 : n > 2 ? 2 : n) : 1;
  const rows = Math.ceil(n / cols);
  const size = n > 8 || (!wide && n > 4) ? "sm" : n > 4 ? "md" : "lg";
  return (
    <div className={cn("flex min-h-0 flex-col", faded && "opacity-60")}>
      {!wide && (
        <p className="mb-3 text-[15px] font-black uppercase tracking-[0.2em] text-white/55">
          {title}
        </p>
      )}
      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, auto))`,
          alignContent: "start",
        }}
      >
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} size={size} />
        ))}
      </div>
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
          <div className={cn("grid gap-3", two ? "grid-cols-3" : "grid-cols-1")}>
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
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[22px] bg-white text-ink">
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
            <tr key={r.key} className={cn("border-t border-ink/10", i < 2 && "bg-optic/35")}>
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

function MatchCard({
  match,
  size,
  tone = "dark",
  label = false,
}: {
  match: Match;
  size: "sm" | "md" | "lg";
  tone?: "dark" | "light";
  label?: boolean;
}) {
  const s = matchScore(match);
  const live = isLive(match);
  const name = { sm: "text-[16px]", md: "text-[20px]", lg: "text-[26px]" }[size];
  const num = { sm: "text-[24px] w-8", md: "text-[30px] w-10", lg: "text-[40px] w-12" }[size];
  const pad = { sm: "px-3.5 py-2.5 gap-1", md: "px-4 py-3 gap-1.5", lg: "px-6 py-5 gap-2.5" }[size];
  const sideRow = (side: 1 | 2) => {
    const players = side === 1 ? match.players1 : match.players2;
    const won = s.winner === side;
    const lost = s.winner !== 0 && !won;
    const score = s.started ? (side === 1 ? s.points1 : s.points2) : null;
    return (
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-extrabold",
            name,
            !players.length && "font-bold opacity-50",
            lost && "opacity-45",
          )}
        >
          {sideName(match, side)}
        </span>
        {won && s.walkover && (
          <span className="text-[12px] font-black uppercase opacity-60">W/O</span>
        )}
        <span
          className={cn(
            "font-narrow shrink-0 text-right font-black leading-none tabular-nums",
            num,
            won && tone === "dark" && "text-optic",
            lost && "opacity-45",
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
        "flex flex-col rounded-[16px]",
        pad,
        tone === "light" ? "bg-ink/[0.08] text-ink" : "bg-white/[0.07] text-white",
        live && "ring-[3px] ring-live",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[12px] font-black uppercase tracking-[0.12em] opacity-55">
        <span className="truncate">
          {match.no !== undefined ? `M${match.no}` : ""}
          {label && match.round ? ` · ${match.round}` : ""}
          {match.court ? ` · Court ${match.court}` : ""}
        </span>
        {live && (
          <span className="flex items-center gap-1.5 text-live opacity-100">
            <span className="live-dot size-1.5 rounded-full bg-live" /> Live
          </span>
        )}
      </div>
      {sideRow(1)}
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
