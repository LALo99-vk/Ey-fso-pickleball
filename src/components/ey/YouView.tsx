import { useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, CornerDownRight, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  EVENTS,
  eventMeta,
  formatClock,
  matchScore,
  meridiem,
  nextIfWin,
  norm,
  opponentOf,
  partnerOf,
  playerMatches,
  playerSide,
  stageLabel,
  type EventId,
  type Match,
  type Player,
  type Tournament,
} from "@/lib/ey/model";
import { MatchCard } from "./MatchCard";
import { EventChip, LivePill, matchState, untilLabel, type Clock } from "./shared";

export type Me = { name: string; at?: { x: number; y: number } };

/* ------------------------------------------------------------------ *
 * Finder: the front door. Type a name, get your day.
 * ------------------------------------------------------------------ */

export function Finder({
  data,
  onPick,
  onEvent,
}: {
  data: Tournament;
  onPick: (me: Me) => void;
  onEvent: (event: EventId) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const query = norm(q);
    if (!query) return [];
    const words = query.split(" ");
    return data.players
      .filter((p) => {
        const n = norm(p.name);
        const parts = n.split(" ");
        return words.every((w) => parts.some((part) => part.startsWith(w))) || n.includes(query);
      })
      .slice(0, 8);
  }, [q, data.players]);

  const pick = (name: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    onPick({ name, at: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
  };

  const counts = (id: EventId) =>
    data.entries.filter(
      (e) => e.event === id && e.players.length === (eventMeta(id).doubles ? 2 : 1),
    ).length;

  return (
    <section className="px-5 pb-8 pt-4 sm:px-8 lg:px-0">
      <h1 className="font-wide text-[clamp(3rem,15vw,5.25rem)] font-black leading-[0.86] tracking-[-0.035em] lg:text-[4.6rem]">
        When do
        <br />I play?
      </h1>
      <p className="mt-4 max-w-[30ch] text-[17px] font-medium leading-snug text-dim">
        Type your name. This phone remembers you, so next time it opens straight to your match.
      </p>

      <label className="relative mt-7 block">
        <span className="sr-only">Your name</span>
        <Search
          className="pointer-events-none absolute left-5 top-1/2 size-6 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Your name"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          data-finder=""
          onFocus={(e) => {
            // On phones, lift the box to the top once the keyboard is up so results get the screen.
            const el = e.currentTarget;
            if (!window.matchMedia("(max-width: 1023px)").matches) return;
            window.setTimeout(() => {
              const top = el.getBoundingClientRect().top + window.scrollY - 68;
              window.scrollTo({ top, behavior: "smooth" });
            }, 250);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) pick(results[0].name, e.currentTarget);
          }}
          className="h-[68px] w-full rounded-[20px] border-[2.5px] border-ink bg-card pl-14 pr-14 text-[20px] font-bold placeholder:font-semibold placeholder:text-dim/75 focus:outline-none focus:ring-[5px] focus:ring-optic"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full hover:bg-secondary"
            aria-label="Clear"
          >
            <X className="size-5" />
          </button>
        )}
      </label>

      {q ? (
        <ul
          className="mt-3 overflow-hidden rounded-[20px] border border-line bg-card"
          aria-live="polite"
        >
          {results.length === 0 && (
            <li className="px-5 py-5 text-[15px] text-dim">
              {data.players.length === 0
                ? "The player list hasn't loaded yet. Pick your event below instead."
                : `No one called “${q}”. Try your first name, or pick your event below.`}
            </li>
          )}
          {results.map((p) => (
            <li key={p.name} className="border-b border-line last:border-0">
              <button
                type="button"
                onClick={(e) => pick(p.name, e.currentTarget)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-optic focus-visible:bg-optic"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-extrabold">{p.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {p.events.map((e) => (
                      <EventChip
                        key={e.event}
                        event={e.event}
                        className="h-5 min-w-8 text-[10px]"
                      />
                    ))}
                  </span>
                </span>
                <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-9">
        <h2 className="text-[15px] font-extrabold">Or pick your event</h2>
        <ul className="mt-3 border-t-[3px] border-ink">
          {EVENTS.map((e) => (
            <li key={e.id} className="border-b border-line">
              <button
                type="button"
                onClick={() => onEvent(e.id)}
                style={{ "--team": "var(--ink)", "--team-ink": "var(--optic)" } as CSSProperties}
                className="team-row group relative flex min-h-[60px] w-full items-center gap-3.5 overflow-hidden px-1 text-left"
              >
                <span className="team-row-fill" aria-hidden="true" />
                <span className="font-narrow relative w-10 text-[28px] font-black leading-none">
                  {e.id}
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-[19px] font-extrabold tracking-[-0.01em]">
                    {e.name}
                  </span>
                  <span className="block text-[12.5px] font-semibold opacity-75">
                    {e.format === "knockout" ? "Knockout" : "Group, then final"}
                    {counts(e.id) ? ` · ${counts(e.id)} ${e.doubles ? "pairs" : "players"}` : ""}
                  </span>
                </span>
                <ArrowRight
                  className="relative size-5 shrink-0 -translate-x-1 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Pass: your next match, huge, in EY yellow.
 * ------------------------------------------------------------------ */

export function Pass({
  data,
  matches,
  me,
  clock,
  onClear,
}: {
  data: Tournament;
  matches: Match[];
  me: Me;
  clock: Clock;
  onClear: () => void;
}) {
  const player = data.players.find((p) => norm(p.name) === norm(me.name));
  const mine = playerMatches(matches, me.name);
  const next = mine.find((m) => !matchScore(m).done);

  const floodStyle = {
    "--fx": me.at ? `${me.at.x}px` : "50%",
    "--fy": me.at ? `${me.at.y}px` : "0%",
  } as CSSProperties;

  return (
    <div className="pb-10">
      <section
        key={me.name}
        style={floodStyle}
        className="flood-in relative mx-3 overflow-hidden rounded-[28px] bg-optic px-5 pb-6 pt-4 text-ink sm:mx-6 lg:mx-0"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-[14px] font-bold opacity-80">
            {player?.events.length
              ? `${player.events.length} event${player.events.length > 1 ? "s" : ""}`
              : "Player"}
          </p>
          <button
            type="button"
            onClick={onClear}
            className="-mr-2 flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-extrabold hover:bg-black/10"
          >
            Not you?
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <h1 className="font-wide mt-1 text-[clamp(2rem,10.5vw,3.25rem)] font-black leading-[0.92] tracking-[-0.03em] text-balance">
          {player?.name ?? me.name}
        </h1>
        {player && player.events.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {player.events.map((e) => (
              <li
                key={e.event}
                className="flex items-start gap-2 text-[14px] font-bold leading-snug"
              >
                <EventChip event={e.event} className="mt-[-1px]" />
                <span className="min-w-0">
                  {eventMeta(e.event).name}
                  {e.partner && <span className="font-semibold opacity-80"> with {e.partner}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 border-t-2 border-current/25 pt-4">
          <NextUp
            next={next}
            mine={mine}
            name={me.name}
            matches={matches}
            clock={clock}
            posted={data.fixturesPosted}
          />
        </div>
      </section>

      {mine.length > 0 && (
        <section className="mt-8 px-5 sm:px-8 lg:px-0">
          <h2 className="font-wide text-[22px] font-black tracking-[-0.02em]">Your day</h2>
          <ol className="mt-4 space-y-6">
            {mine.map((match) => {
              const ahead = !matchScore(match).done ? nextIfWin(matches, match) : undefined;
              return (
                <li key={match.id}>
                  <div className="grid grid-cols-[4.25rem_1fr] gap-3">
                    <TimeStamp minutes={match.minutes} raw={match.time} />
                    <MatchCard match={match} clock={clock} me={me.name} />
                  </div>
                  {ahead && playerSide(ahead, me.name) === 0 && (
                    <div className="mt-1.5 grid grid-cols-[4.25rem_1fr] gap-3">
                      <span />
                      <p className="flex items-center gap-2 px-1 text-[13px] font-semibold leading-snug text-dim">
                        <CornerDownRight className="size-4 shrink-0" aria-hidden="true" />
                        <span>
                          Win and you play the{" "}
                          <span className="font-extrabold text-ink">
                            {stageLabel(ahead).toLowerCase()}
                          </span>
                          {ahead.minutes !== undefined && (
                            <span className="whitespace-nowrap">
                              {` · ${formatClock(ahead.minutes)} ${meridiem(ahead.minutes)}`}
                            </span>
                          )}
                          {ahead.court && (
                            <span className="whitespace-nowrap">{` · Court ${ahead.court}`}</span>
                          )}
                        </span>
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function NextUp({
  next,
  mine,
  name,
  matches,
  clock,
  posted,
}: {
  next?: Match | undefined;
  mine: Match[];
  name: string;
  matches: Match[];
  clock: Clock;
  posted: boolean;
}) {
  if (!posted) {
    return (
      <>
        <p className="font-narrow text-[clamp(5.5rem,30vw,9rem)] font-black leading-[0.8] tracking-[-0.02em]">
          soon.
        </p>
        <p className="mt-3 max-w-[32ch] text-[16px] font-bold leading-snug">
          Fixtures aren't out yet. Your times and courts land here the moment they're posted.
        </p>
      </>
    );
  }

  if (!next) {
    const wins = mine.filter((m) => matchScore(m).winner === playerSide(m, name)).length;
    return (
      <>
        <p className="font-narrow text-[clamp(4.5rem,25vw,8rem)] font-black leading-[0.8] tracking-[-0.02em]">
          {mine.length ? "all played." : "not listed."}
        </p>
        <p className="mt-3 max-w-[32ch] text-[16px] font-bold leading-snug">
          {mine.length
            ? `That's every match on your card: ${wins} won from ${mine.length}. Thanks for playing.`
            : "Your name isn't on the schedule yet. If that looks wrong, check with the desk."}
        </p>
      </>
    );
  }

  const state = matchState(next, clock.now);
  const until = untilLabel(next.minutes, clock.now);
  const partner = partnerOf(next, name);
  const s = matchScore(next);
  const side = playerSide(next, name);
  const ahead = nextIfWin(matches, next);

  return (
    <>
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        {state === "live" ? (
          <LivePill className="bg-ink text-optic" label="On court now" />
        ) : (
          <span className="text-[14px] font-extrabold">
            {until ? `Next up · ${until}` : "Next up"}
          </span>
        )}
        <span className="text-[13px] font-bold opacity-75">
          {eventMeta(next.event).name} · {stageLabel(next)}
        </span>
      </div>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-narrow text-[clamp(6rem,34vw,10.5rem)] font-black leading-[0.8] tracking-[-0.02em] tabular-nums">
          {formatClock(next.minutes, next.time)}
        </span>
        <span className="font-narrow text-[clamp(1.5rem,7vw,2.25rem)] font-black">
          {meridiem(next.minutes)}
        </span>
      </p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2.5 text-[17px]">
        <dt className="text-[13px] font-bold opacity-75">Court</dt>
        <dd className="font-narrow text-[30px] font-black leading-none">{next.court ?? "TBA"}</dd>
        <dt className="text-[13px] font-bold opacity-75">Against</dt>
        <dd className="min-w-0 font-extrabold leading-snug">
          {opponentPlayers(next, name).map((p) => (
            <span key={p} className="block">
              {p}
            </span>
          ))}
        </dd>
        {partner.length > 0 && (
          <>
            <dt className="text-[13px] font-bold opacity-75">With</dt>
            <dd className="min-w-0 font-extrabold leading-snug">
              {partner.map((p) => (
                <span key={p} className="block">
                  {p}
                </span>
              ))}
            </dd>
          </>
        )}
        {s.started && (
          <>
            <dt className="text-[13px] font-bold opacity-75">Score</dt>
            <dd className="font-narrow text-[30px] font-black leading-none tabular-nums">
              {next.games
                .map((g) => (side === 2 ? `${g[1]}–${g[0]}` : `${g[0]}–${g[1]}`))
                .join("  ")}
            </dd>
          </>
        )}
      </dl>
      {ahead && (
        <p className="mt-5 rounded-2xl bg-current/12 px-4 py-3 text-[15px] font-bold leading-snug">
          Win and you're into the {stageLabel(ahead).toLowerCase()}
          {ahead.minutes !== undefined
            ? ` at ${formatClock(ahead.minutes)} ${meridiem(ahead.minutes)}`
            : ""}
          {ahead.court ? `, Court ${ahead.court}` : ""}.
        </p>
      )}
    </>
  );
}

/** The other side's players, or its slot text ("Winner M12") while unknown. */
function opponentPlayers(match: Match, name: string): string[] {
  const side = playerSide(match, name);
  const players = side === 1 ? match.players2 : match.players1;
  return players.length ? players : [opponentOf(match, name)];
}

export function TimeStamp({
  minutes,
  raw,
  className,
}: {
  minutes?: number | undefined;
  raw?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("pt-2.5 text-right", className)}>
      <p className="font-narrow text-[30px] font-black leading-none tabular-nums">
        {formatClock(minutes, raw)}
      </p>
      <p className="mt-0.5 text-[11px] font-extrabold text-dim">{meridiem(minutes)}</p>
    </div>
  );
}

export type { Player };
