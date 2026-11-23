import { Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  EVENTS,
  GROUP_EVENTS,
  KNOCKOUT_EVENTS,
  POINTS_PER_WIN,
  eventMeta,
  formatClock,
  formatPd,
  groupsOf,
  meridiem,
  timeLabel,
  norm,
  standings,
  winnerOf,
  type EventId,
  type EventMeta,
  type Match,
  type Tournament,
} from "@/lib/ey/model";
import { BracketView } from "./Bracket";
import { MatchCard } from "./MatchCard";
import { type Clock } from "./shared";
import { type Me } from "./YouView";

/* ------------------------------------------------------------------ *
 * Draws: the three knockout events, round by round.
 * ------------------------------------------------------------------ */

export function DrawsView({
  data,
  matches,
  clock,
  me,
  event,
  onEvent,
}: {
  data: Tournament;
  matches: Match[];
  clock: Clock;
  me?: string | undefined;
  event: EventId;
  onEvent: (e: EventId) => void;
}) {
  const meta = eventMeta(event);
  const list = matches.filter((m) => m.event === event && m.stage === "ko");
  const final = list.find((m) => m.size === 2);
  const champion = final ? winnerOf(final) : undefined;
  const entries = data.entries.filter((e) => e.event === event).length;

  return (
    <div>
      <ViewTitle>Draws</ViewTitle>
      <EventPills events={KNOCKOUT_EVENTS} active={event} onChange={onEvent} />
      <p className="mt-4 text-[15px] font-extrabold">
        Starts {meta.start}
        <span className="font-semibold text-dim">
          {" "}
          · be at the ground by then. No fixed match times, the desk calls each match.
        </span>
      </p>

      {champion && <Champion meta={meta} name={champion.name} />}

      {list.length === 0 ? (
        <EmptyCard
          big="Draw drops soon."
          body={`${entries ? `${entries} ${meta.doubles ? "pairs" : "players"} are in ${meta.name}. ` : ""}Straight knockout: lose once and you're out. The draw appears here once it's made.`}
        />
      ) : (
        <>
          <p className="mt-4 max-w-[48ch] text-[14px] text-dim">
            Straight knockout. Lines show where each winner goes; tap a match for its details.
          </p>
          <BracketView
            key={`${event}|${me ?? ""}`}
            event={event}
            list={list}
            all={matches}
            clock={clock}
            me={me}
          />
        </>
      )}
    </div>
  );
}

/** A match with its number and time above it, for the draw and group lists. */
function MatchRow({ match, clock, me }: { match: Match; clock: Clock; me?: string | undefined }) {
  return (
    <div>
      <p className="mb-1 flex items-baseline gap-2 px-1 text-[12px] font-bold text-dim">
        {match.no !== undefined && <span className="text-ink">M{match.no}</span>}
        {timeLabel(match) && <span className="tabular-nums">{timeLabel(match)}</span>}
      </p>
      <MatchCard match={match} clock={clock} me={me} showEvent={false} showRound={false} />
    </div>
  );
}

function Champion({ meta, name }: { meta: EventMeta; name: string }) {
  return (
    <div className="mt-6 flex items-center gap-4 rounded-[24px] bg-ink px-5 py-5 text-white">
      <Trophy className="size-10 shrink-0 text-optic" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[13px] font-bold opacity-80">
          {meta.name} champion{meta.doubles ? "s" : ""}
        </p>
        <p className="font-wide text-[26px] font-black leading-[1.02] tracking-[-0.02em] text-balance">
          {name}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Groups: the two women's events. Table from scores, never typed.
 * ------------------------------------------------------------------ */

export function GroupsView({
  data,
  matches,
  clock,
  me,
  event,
  onEvent,
}: {
  data: Tournament;
  matches: Match[];
  clock: Clock;
  me?: string | undefined;
  event: EventId;
  onEvent: (e: EventId) => void;
}) {
  const meta = eventMeta(event);
  const groupMatches = matches.filter((m) => m.event === event && m.stage === "group");
  const groups = groupsOf(matches, event);
  const tableGroups = groups.length ? groups : [""];
  const ko = matches
    .filter((m) => m.event === event && m.stage === "ko")
    .sort((a, b) => b.size - a.size);
  const final = ko.find((m) => m.size === 2);
  const champion = final ? winnerOf(final) : undefined;

  return (
    <div>
      <ViewTitle>Groups</ViewTitle>
      <EventPills events={GROUP_EVENTS} active={event} onChange={onEvent} />
      <p className="mt-4 text-[15px] font-extrabold">
        Starts {meta.start}
        <span className="font-semibold text-dim">
          {" "}
          · be at the ground by then. No fixed match times, the desk calls each match.
        </span>
      </p>
      <p className="mt-4 max-w-[52ch] text-[14px] text-dim">
        Everyone plays everyone in the group. A win is worth {POINTS_PER_WIN} points. Level on
        points: head-to-head, then points difference (PD: points won minus lost).{" "}
        {event === "XD"
          ? "The top 2 of each group play the semi-finals (1st v 2nd of the other group)."
          : "The top go straight to the final."}
      </p>

      {champion && <Champion meta={meta} name={champion.name} />}

      <div className="mt-6 grid max-w-3xl gap-10">
        {tableGroups.map((g) => (
          <GroupTable
            key={g}
            label={g ? `Group ${g}` : meta.name}
            rows={standings(matches, event, g, data.entries)}
            played={
              groupMatches
                .filter((m) => (m.group ?? "") === g)
                .filter((m) => m.games.length || m.winnerSide).length
            }
            total={groupMatches.filter((m) => (m.group ?? "") === g).length}
            me={me}
            cut={final ? 2 : 0}
          />
        ))}
      </div>

      {ko.length > 0 && (
        <section className="mt-10 max-w-3xl">
          <h3 className="font-wide border-b-[3px] border-ink pb-2 text-[22px] font-black tracking-[-0.02em]">
            {final && ko.length === 1 ? "Final" : "Knockouts"}
          </h3>
          <ul className="mt-3 space-y-3">
            {ko.map((m) => (
              <li key={m.id}>
                <MatchRow match={m} clock={clock} me={me} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {groupMatches.length > 0 && (
        <section className="mt-10 max-w-3xl">
          <h3 className="font-wide border-b-[3px] border-ink pb-2 text-[22px] font-black tracking-[-0.02em]">
            Group matches
          </h3>
          <ul className="mt-3 space-y-3">
            {groupMatches.map((m) => (
              <li key={m.id}>
                <MatchRow match={m} clock={clock} me={me} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const COLS =
  "grid grid-cols-[1.25rem_1fr_repeat(3,1.5rem)_2.25rem_2.1rem] items-center gap-x-1 sm:grid-cols-[2.25rem_1fr_repeat(3,2.75rem)_3.25rem_3.5rem]";

function GroupTable({
  label,
  rows,
  played,
  total,
  me,
  cut,
}: {
  label: string;
  rows: ReturnType<typeof standings>;
  played: number;
  total: number;
  me?: string | undefined;
  cut: number;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between border-b-[3px] border-ink pb-2">
        <h3 className="font-wide text-[22px] font-black tracking-[-0.02em]">{label}</h3>
        {total > 0 && (
          <span className="text-[13px] font-bold text-dim">
            {played}/{total} played
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-[15px] text-dim">The table fills in once the group is posted.</p>
      ) : (
        <>
          <div className={cn(COLS, "px-1 pt-2 text-[11px] font-extrabold text-dim")}>
            <span />
            <span>{rows[0]!.players.length > 1 ? "Pair" : "Player"}</span>
            <span className="text-center" title="Played">
              P
            </span>
            <span className="text-center" title="Won">
              W
            </span>
            <span className="text-center" title="Lost">
              L
            </span>
            <span className="text-center" title="Points difference (points won minus lost)">
              PD
            </span>
            <span className="text-center text-ink" title="Points">
              Pts
            </span>
          </div>
          <ol>
            {rows.map((r, i) => {
              const isMe = me ? r.players.some((p) => norm(p) === norm(me)) : false;
              return (
                <li key={r.key}>
                  <div className={cn(COLS, "rounded-xl px-1 py-2.5", isMe && "bg-optic")}>
                    <span className="font-narrow text-[24px] font-black leading-none sm:text-[30px]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 text-[15px] font-extrabold leading-tight">
                      {r.players.map((p) => (
                        <span key={p} className="block truncate">
                          {p}
                        </span>
                      ))}
                    </span>
                    <Num>{r.played}</Num>
                    <Num>{r.won}</Num>
                    <Num>{r.lost}</Num>
                    <Num>{formatPd(r)}</Num>
                    <span className="font-narrow text-center text-[22px] font-black leading-none tabular-nums sm:text-[26px]">
                      {r.points}
                    </span>
                  </div>
                  {cut > 0 && i === cut - 1 && rows.length > cut && (
                    <div className="my-1 flex items-center gap-2 px-1" aria-hidden="true">
                      <span className="h-0 flex-1 border-t-2 border-dashed border-ink/40" />
                      <span className="text-[11px] font-extrabold text-dim">Final above</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-semi-narrow text-center text-[15px] font-semibold tabular-nums text-dim sm:text-[16px]">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Players: everyone entered, event by event.
 * ------------------------------------------------------------------ */

export function PlayersView({
  data,
  me,
  event,
  onEvent,
  onPick,
}: {
  data: Tournament;
  me?: string | undefined;
  event: EventId;
  onEvent: (e: EventId) => void;
  onPick: (me: Me) => void;
}) {
  const meta = eventMeta(event);
  const entries = data.entries.filter((e) => e.event === event);
  return (
    <div>
      <ViewTitle>Players</ViewTitle>
      <EventPills events={EVENTS} active={event} onChange={onEvent} />
      <section className="mt-5 overflow-hidden rounded-[28px] bg-ink text-white">
        <div className="px-5 pb-5 pt-4">
          <p className="text-[14px] font-bold opacity-80">
            {meta.formatLabel} · starts {meta.start}
          </p>
          <h3 className="font-wide mt-1 text-[clamp(2rem,9vw,3rem)] font-black leading-[0.92] tracking-[-0.03em] text-balance">
            {meta.name}
          </h3>
          <p className="mt-2 text-[15px] font-bold">
            {entries.filter((e) => !meta.doubles || e.players.length === 2).length}{" "}
            {meta.doubles ? "pairs" : "players"}
            {meta.doubles && entries.some((e) => e.players.length === 1) && (
              <span className="font-semibold opacity-75">
                {" "}
                · {entries.filter((e) => e.players.length === 1).length} without a partner
              </span>
            )}
          </p>
        </div>
      </section>
      {entries.length ? (
        <>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {entries.map((e) => (
              <li
                key={e.players.join("|")}
                className="flex flex-wrap items-center gap-x-1 px-2 py-1"
              >
                {e.players.map((p, i) => {
                  const isMe = me ? norm(me) === norm(p) : false;
                  return (
                    <span key={p} className="flex items-center">
                      {i > 0 && <span className="px-1 text-[13px] font-bold text-dim">&amp;</span>}
                      <button
                        type="button"
                        onClick={() => onPick({ name: p })}
                        aria-current={isMe ? "true" : undefined}
                        className={cn(
                          "min-h-11 rounded-lg px-2 text-left text-[15px] font-semibold transition-colors",
                          isMe ? "bg-optic" : "hover:bg-secondary",
                        )}
                      >
                        {p}
                      </button>
                    </span>
                  );
                })}
                {meta.doubles && e.players.length === 1 && (
                  <span className="px-1 text-[13px] font-semibold text-dim">· partner TBC</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-dim">Tap a name to see that player's day.</p>
        </>
      ) : (
        <p className="mt-4 text-[15px] text-dim">Entry list loading from the sheet.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Events as an even segmented control: every event visible, no sideways scrolling. */
export function EventPills({
  events,
  active,
  onChange,
}: {
  events: EventMeta[];
  active: EventId;
  onChange: (e: EventId) => void;
}) {
  return (
    <div
      className="mt-5 grid gap-1.5 rounded-[18px] bg-secondary p-1.5"
      style={{ gridTemplateColumns: `repeat(${events.length}, minmax(0, 1fr))` }}
      role="tablist"
      aria-label="Events"
    >
      {events.map((e) => {
        const on = active === e.id;
        const [first, ...rest] = e.name.split(" ");
        return (
          <button
            key={e.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(e.id)}
            className={cn(
              "relative flex min-h-[52px] flex-col items-center justify-center overflow-hidden rounded-[13px] px-1 text-center leading-[1.1] transition-[background-color,color,box-shadow] duration-200",
              on
                ? "bg-ink text-optic shadow-[0_6px_16px_-10px_oklch(0.3_0.018_285/0.7)]"
                : "text-ink hover:bg-card/70",
            )}
          >
            <span className="text-[11.5px] font-bold opacity-80">{first}</span>
            <span className="text-[13.5px] font-extrabold">{rest.join(" ")}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ViewTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-wide text-[clamp(2.25rem,10vw,3.25rem)] font-black leading-[0.9] tracking-[-0.03em]">
      {children}
    </h2>
  );
}

function EmptyCard({ big, body }: { big: string; body: string }) {
  return (
    <div className="mt-6 rounded-[28px] bg-optic px-5 py-8">
      <p className="font-narrow text-[clamp(3.5rem,18vw,6rem)] font-black leading-[0.85] tracking-[-0.02em]">
        {big}
      </p>
      <p className="mt-4 max-w-[36ch] text-[16px] font-semibold leading-snug">{body}</p>
    </div>
  );
}
