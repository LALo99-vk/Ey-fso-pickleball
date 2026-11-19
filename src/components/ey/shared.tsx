import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { eventMeta, matchScore, type EventId, type Match } from "@/lib/ey/model";

/** An event as a small colour chip: "MS", "WD". */
export function EventChip({
  event,
  className,
}: {
  event: EventId;
  className?: string | undefined;
}) {
  const meta = eventMeta(event);
  return (
    <span
      className={cn(
        "font-semi-narrow inline-grid h-6 min-w-9 shrink-0 place-items-center rounded-md px-1.5 text-[11px] font-black tracking-wide ring-1 ring-current/30 ring-inset",
        className,
      )}
      title={meta.name}
    >
      {meta.id}
    </span>
  );
}

export type Clock = {
  /** Minutes after midnight, or null when today is not match day. */
  now: number | null;
};

/** Minutes after midnight, ticking every 30s. */
export function useClock(override?: number | undefined, matchDay?: boolean | undefined): Clock {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (override !== undefined) {
      setNow(override);
      return;
    }
    if (!matchDay) {
      setNow(null);
      return;
    }
    const tick = () => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [override, matchDay]);
  return { now };
}

export type MatchState = "done" | "live" | "later";

/** Live only when the sheet says so (a game's Status is Live, or scores are in); never from the clock. */
export function matchState(match: Match, _now: number | null): MatchState {
  const s = matchScore(match);
  if (s.done) return "done";
  if (match.live || s.started) return "live";
  return "later";
}

export function untilLabel(minutes: number | undefined, now: number | null): string | null {
  if (minutes === undefined || now === null) return null;
  const d = minutes - now;
  if (d <= 0) return null;
  if (d < 60) return `in ${d} min`;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return `in ${h}h${m ? ` ${m}m` : ""}`;
}

export function LivePill({
  className,
  label = "On court",
}: {
  className?: string | undefined;
  label?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-[11px] font-extrabold text-white",
        className,
      )}
    >
      <span className="live-dot size-1.5 rounded-full bg-white" />
      {label}
    </span>
  );
}
