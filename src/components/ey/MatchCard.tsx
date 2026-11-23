import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { inSide, isBye, matchScore, stageLabel, type Match } from "@/lib/ey/model";
import { EventChip, matchState, type Clock } from "./shared";

type Props = {
  match: Match;
  clock: Clock;
  /** The visitor's name: their row is lit. */
  me?: string | undefined;
  showEvent?: boolean | undefined;
  showRound?: boolean | undefined;
};

/**
 * One match, built for a narrow column: a quiet header line (event, round,
 * court, status), then one row per side with every player on their own line
 * and the scores in a fixed column on the right. Long names wrap inside their
 * row; nothing else moves.
 */
export function MatchCard({ match, clock, me, showEvent = true, showRound = true }: Props) {
  const s = matchScore(match);
  const state = matchState(match, clock.now);

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-card">
      <div className="flex min-h-10 items-center gap-2 px-3.5 pt-1">
        {showEvent && <EventChip event={match.event} className="h-5 min-w-8 text-[10px]" />}
        <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-dim">
          {showRound && <span className="text-ink">{stageLabel(match)}</span>}
          {showRound && " · "}
          {match.court ? `Court ${match.court}` : "Court TBA"}
        </p>
        <Status state={state} walkover={s.walkover} />
      </div>
      <div className="px-1.5 pb-1.5">
        <Side match={match} side={1} win={s.winner === 1} lose={s.winner === 2} me={me} />
        <div className="mx-2 h-px bg-line" aria-hidden="true" />
        <Side match={match} side={2} win={s.winner === 2} lose={s.winner === 1} me={me} />
      </div>
    </div>
  );
}

function Status({ state, walkover }: { state: string; walkover: boolean }) {
  if (state === "done") {
    return (
      <span className="shrink-0 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-ink">
        {walkover ? "Walkover" : "Final"}
      </span>
    );
  }
  if (state === "live") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-live px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-white">
        <span className="live-dot size-1.5 rounded-full bg-white" />
        Live
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.08em] text-dim">
      Upcoming
    </span>
  );
}

export function Side({
  match,
  side,
  win,
  lose,
  me,
}: {
  match: Match;
  side: 1 | 2;
  win: boolean;
  lose: boolean;
  me?: string | undefined;
}) {
  const players = side === 1 ? match.players1 : match.players2;
  const raw = side === 1 ? match.side1 : match.side2;
  const known = players.length > 0;
  const mine = me ? inSide(players, me) : false;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-2 py-2.5",
        mine && "bg-optic",
        lose && !mine && "text-dim",
      )}
    >
      <div className="min-w-0 flex-1">
        {known ? (
          players.map((p) => (
            <p
              key={p}
              className={cn(
                "text-[15px] leading-[1.25] [overflow-wrap:anywhere]",
                win ? "font-extrabold" : "font-semibold",
              )}
            >
              {p}
            </p>
          ))
        ) : (
          <p className="text-[15px] italic leading-[1.25] text-dim">{isBye(raw) ? "Bye" : raw}</p>
        )}
      </div>
      {win && !match.games.length && (
        <Check className="size-4 shrink-0" strokeWidth={3} aria-label="Winner" />
      )}
      {match.games.length > 0 && (
        <div className="flex shrink-0 items-center gap-2">
          {win && <Check className="size-4" strokeWidth={3} aria-label="Winner" />}
          {match.games.map((g, i) => {
            const ours = side === 1 ? g[0] : g[1];
            const theirs = side === 1 ? g[1] : g[0];
            return (
              <span
                key={i}
                className={cn(
                  "font-narrow w-7 text-right text-[24px] leading-none tabular-nums",
                  ours > theirs ? "font-black" : "font-bold opacity-60",
                )}
              >
                {ours}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
