import { useState } from "react";
import { Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  EVENTS,
  eventMeta,
  matchScore,
  stageLabel,
  type EventId,
  type Match,
} from "@/lib/ey/model";
import { clipsFor, durationLabel, eventsWithVideo, matchesWithVideo } from "@/lib/ey/videos";
import { EventPills, ViewTitle } from "./BoardViews";
import { Side } from "./MatchCard";

/**
 * Videos: the matches streamed from the courts with the PlayMo app, one event at a time,
 * grouped by round (final first). Each match is one card: the video, then who played and
 * the score, inside the same frame.
 */
export function VideosView({
  matches,
  me,
  event,
  onEvent,
}: {
  matches: Match[];
  me?: string | undefined;
  event: EventId;
  onEvent: (e: EventId) => void;
}) {
  const withVideo = eventsWithVideo();
  const events = EVENTS.filter((e) => withVideo.has(e.id));
  const active = events.some((e) => e.id === event) ? event : (events[0]?.id ?? event);
  const rounds = byRound(matchesWithVideo(matches, active));

  return (
    <div>
      <ViewTitle>Videos</ViewTitle>
      {events.length > 0 && <EventPills events={events} active={active} onChange={onEvent} />}
      <p className="mt-4 max-w-[52ch] text-[14px] text-dim">
        Matches streamed from the courts on Sat 21 Nov. Not every match was filmed, and some videos
        show only part of a match.
      </p>

      {rounds.length === 0 ? (
        <p className="mt-6 text-[15px] font-semibold">No videos for {eventMeta(active).name}.</p>
      ) : (
        rounds.map(({ label, list }) => (
          <section key={label} className="mt-9 first-of-type:mt-7">
            <h3 className="flex items-baseline gap-2 border-b border-line pb-2 text-[18px] font-black tracking-[-0.01em]">
              {label}
              <span className="text-[13px] font-bold text-dim">
                {list.length} {list.length === 1 ? "video" : "videos"}
              </span>
            </h3>
            <ul className="mt-4 grid gap-5">
              {list.map((m) => (
                <li key={m.id}>
                  <VideoCard match={m} me={me} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/** Matches come in final-first order; keep that order and start a section at each new round. */
function byRound(list: Match[]): { label: string; list: Match[] }[] {
  const out: { label: string; list: Match[] }[] = [];
  for (const m of list) {
    const label = stageLabel(m);
    const last = out[out.length - 1];
    if (last && last.label === label) last.list.push(m);
    else out.push({ label, list: [m] });
  }
  return out.map((r) => ({
    ...r,
    label: r.list.length > 1 && r.list[0]!.stage === "ko" ? `${r.label}s` : r.label,
  }));
}

function VideoCard({ match, me }: { match: Match; me?: string | undefined }) {
  const clips = clipsFor(match);
  const [part, setPart] = useState(0);
  const clip = clips[part] ?? clips[0];
  if (!clip) return null;
  const s = matchScore(match);

  return (
    <article className="overflow-hidden rounded-[18px] border border-line bg-card">
      <video
        // A new source needs a new element, or some browsers keep playing the old part.
        key={clip.url}
        className="block aspect-video w-full bg-ink"
        src={clip.url}
        poster={clip.thumbnailUrl ?? undefined}
        controls
        playsInline
        preload="none"
        aria-label={`${stageLabel(match)} video${clips.length > 1 ? `, part ${part + 1}` : ""}`}
      />

      <div className="flex min-h-11 items-center gap-3 px-3.5 pt-2">
        {clips.length > 1 ? (
          <div
            className="flex gap-1 rounded-full bg-secondary p-1"
            role="tablist"
            aria-label="Video parts"
          >
            {clips.map((c, i) => (
              <button
                key={c.url}
                type="button"
                role="tab"
                aria-selected={i === part}
                onClick={() => setPart(i)}
                className={cn(
                  "h-8 rounded-full px-3 text-[12.5px] font-extrabold tabular-nums transition-colors duration-200",
                  i === part ? "bg-ink text-optic" : "text-ink hover:bg-card",
                )}
              >
                Part {i + 1} · {durationLabel(c.seconds)}
              </button>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-dim tabular-nums">
            <Clock3 className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
            {durationLabel(clip.seconds)}
          </p>
        )}
        {match.no !== undefined && (
          <span className="ml-auto text-[12px] font-bold text-dim">Match {match.no}</span>
        )}
      </div>

      <div className="px-1.5 pb-1.5 pt-1">
        <Side match={match} side={1} win={s.winner === 1} lose={s.winner === 2} me={me} />
        <div className="mx-2 h-px bg-line" aria-hidden="true" />
        <Side match={match} side={2} win={s.winner === 2} lose={s.winner === 1} me={me} />
      </div>
    </article>
  );
}
