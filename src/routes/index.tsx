import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { GitFork, ListOrdered, Tv, UserRound, UsersRound } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  EVENTS,
  GROUP_EVENTS,
  KNOCKOUT_EVENTS,
  eventMeta,
  norm,
  resolveMatches,
  type EventId,
  type Tournament,
} from "@/lib/ey/model";
import { getTournament } from "@/lib/ey/server";
import { useClock } from "@/components/ey/shared";
import { Finder, Pass, type Me } from "@/components/ey/YouView";
import { DrawsView, GroupsView, PlayersView } from "@/components/ey/BoardViews";
import { PresentView } from "@/components/ey/PresentView";

type Tab = "you" | "draws" | "groups" | "players";
const TABS: { id: Tab; label: string; icon: typeof UserRound }[] = [
  { id: "you", label: "You", icon: UserRound },
  { id: "draws", label: "Draws", icon: GitFork },
  { id: "groups", label: "Groups", icon: ListOrdered },
  { id: "players", label: "Players", icon: UsersRound },
];

/** Match day (local time). Countdowns and the "now" line only show on this day. */
const MATCH_DAY = "2026-11-21";

const tournamentQuery = (demo: boolean) =>
  queryOptions({
    queryKey: ["ey", demo],
    queryFn: () => getTournament({ data: { demo } }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

const EVENT_IDS = EVENTS.map((e) => e.id);

export const Route = createFileRoute("/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tab?: Tab | undefined;
    ev?: EventId | undefined;
    demo?: 1 | undefined;
    present?: 1 | undefined;
  } => ({
    tab: TABS.some((t) => t.id === search["tab"]) ? (search["tab"] as Tab) : undefined,
    ev: EVENT_IDS.includes(search["ev"] as EventId) ? (search["ev"] as EventId) : undefined,
    demo: search["demo"] === 1 || search["demo"] === "1" ? 1 : undefined,
    present: search["present"] === 1 || search["present"] === "1" ? 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ demo: Boolean(search.demo) }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(tournamentQuery(deps.demo)),
  head: () => ({
    meta: [
      { title: "EY FSO Pickleball Tournament · When do I play?" },
      {
        name: "description",
        content:
          "Type your name, get your next match: time, court and opponent for the EY FSO Pickleball Tournament.",
      },
      { property: "og:title", content: "EY FSO Pickleball Tournament · When do I play?" },
      {
        property: "og:description",
        content: "Your next match, court and opponent, live from the desk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: App,
});

const STORE_KEY = "ey-pickleball-me";

function App() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const demo = Boolean(search.demo);
  // The loader's copy is serialised into the page, so the first paint already has the entries.
  const initial = Route.useLoaderData();
  const { data } = useQuery({
    ...tournamentQuery(demo),
    initialData: initial,
    initialDataUpdatedAt: initial.updatedAt,
    // The TV board refreshes faster, and keeps going while the phone is casting.
    ...(search.present ? { refetchInterval: 15_000, refetchIntervalInBackground: true } : {}),
  });
  const [me, setMeState] = useState<Me | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) setMeState(JSON.parse(raw) as Me);
    } catch {
      /* private mode: just don't remember */
    }
  }, []);

  const setMe = useCallback(
    (next: Me | null) => {
      setMeState(next);
      try {
        if (next) window.localStorage.setItem(STORE_KEY, JSON.stringify({ name: next.name }));
        else window.localStorage.removeItem(STORE_KEY);
      } catch {
        /* ignore */
      }
      void navigate({ search: (s) => ({ ...s, tab: undefined }), replace: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [navigate],
  );

  const tournament: Tournament = data ?? {
    players: [],
    entries: [],
    matches: [],
    fixturesPosted: false,
    updatedAt: 0,
  };
  const matches = useMemo(() => resolveMatches(tournament.matches), [tournament.matches]);
  const matchDay = useMemo(() => new Date().toLocaleDateString("en-CA") === MATCH_DAY, []);
  const clock = useClock(tournament.nowOverride, matchDay);

  // A remembered name that has since left the lists falls back to the finder.
  const validMe =
    me &&
    (tournament.players.length === 0 ||
      tournament.players.some((p) => norm(p.name) === norm(me.name)))
      ? me
      : null;
  const myName = validMe?.name;
  const myEvents =
    tournament.players.find((p) => myName && norm(p.name) === norm(myName))?.events ?? [];

  const tab: Tab = search.tab ?? "you";
  // On wide screens "You" lives in the left column, so the right column shows the draws.
  const wideTab: Tab = tab === "you" ? "draws" : tab;
  const go = (t: Tab, ev?: EventId) => {
    void navigate({
      search: (s) => ({ ...s, tab: t === "you" ? undefined : t, ev: ev ?? s.ev }),
      replace: true,
    });
    window.scrollTo({ top: 0 });
  };
  const openEvent = (ev: EventId) =>
    go(eventMeta(ev).format === "knockout" ? "draws" : "groups", ev);

  // The event a tab opens on: the one asked for, else the visitor's own, else the first.
  const pickEvent = (pool: typeof EVENTS) =>
    (
      pool.find((e) => e.id === search.ev) ??
      pool.find((e) => myEvents.some((m) => m.event === e.id)) ??
      pool[0]!
    ).id;
  const setEvent = (t: Tab) => (ev: EventId) =>
    void navigate({ search: (s) => ({ ...s, tab: t, ev }), replace: true });

  const present = () => {
    // Full screen needs the tap itself; iPhones without support just get the board.
    void document.documentElement.requestFullscreen?.().catch(() => {});
    void navigate({ search: (s) => ({ ...s, present: 1 }) });
  };
  const exitPresent = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    void navigate({ search: (s) => ({ ...s, present: undefined }), replace: true });
  };

  if (search.present) {
    return <PresentView data={tournament} matches={matches} onExit={exitPresent} />;
  }

  const you = validMe ? (
    <Pass
      data={tournament}
      matches={matches}
      me={validMe}
      clock={clock}
      onClear={() => setMe(null)}
    />
  ) : (
    <Finder data={tournament} onPick={setMe} onEvent={openEvent} />
  );

  const board = (t: Tab) =>
    t === "draws" ? (
      <DrawsView
        data={tournament}
        matches={matches}
        clock={clock}
        me={myName}
        event={pickEvent(KNOCKOUT_EVENTS)}
        onEvent={setEvent("draws")}
      />
    ) : t === "groups" ? (
      <GroupsView
        data={tournament}
        matches={matches}
        clock={clock}
        me={myName}
        event={pickEvent(GROUP_EVENTS)}
        onEvent={setEvent("groups")}
      />
    ) : t === "players" ? (
      <PlayersView
        data={tournament}
        me={myName}
        event={pickEvent(EVENTS)}
        onEvent={setEvent("players")}
        onPick={setMe}
      />
    ) : null;

  return (
    <div className="min-h-dvh bg-background pb-28 text-foreground lg:pb-12">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-background">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-5 sm:px-8">
          <button
            type="button"
            onClick={() => go("you")}
            className="flex min-w-0 items-center gap-3"
            aria-label="EY FSO Pickleball Tournament, your schedule"
          >
            <img src="/brand/ey.svg" alt="EY" width={69} height={69} className="size-9 shrink-0" />
            <span className="min-w-0 text-left leading-none">
              <span className="block truncate text-[17px] font-black tracking-[-0.01em]">
                EY FSO Pickleball
              </span>
              <span className="mt-1 block truncate text-[10.5px] font-bold uppercase tracking-[0.16em] text-dim">
                Tournament · Sat 21 Nov
              </span>
            </span>
          </button>
          <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
            {TABS.filter((t) => t.id !== "you").map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => go(t.id)}
                aria-current={wideTab === t.id ? "page" : undefined}
                className={cn(
                  "h-10 rounded-full px-4 text-[14px] font-extrabold transition-colors",
                  wideTab === t.id ? "bg-ink text-optic" : "hover:bg-secondary",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-5">
            <PoweredBy className="hidden lg:flex" />
            <button
              type="button"
              onClick={present}
              className="flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-extrabold text-optic"
            >
              <Tv className="size-4" strokeWidth={2.4} aria-hidden="true" />
              Present
            </button>
          </div>
        </div>
      </header>

      <div className="bg-ink lg:hidden">
        <div className="mx-auto flex h-9 max-w-[1280px] items-center justify-end px-5 sm:px-8">
          <PoweredBy dark />
        </div>
      </div>

      {tournament.demo && (
        <p className="mx-auto max-w-[1280px] px-5 pt-3 sm:px-8">
          <span className="inline-block rounded-full bg-live px-3 py-1.5 text-[12px] font-extrabold text-white">
            Sample draw for preview. Not the real one.
          </span>
        </p>
      )}

      <main className="mx-auto max-w-[1280px] pt-4 lg:grid lg:grid-cols-[minmax(360px,440px)_1fr] lg:gap-12 lg:px-8 lg:pt-8">
        <aside
          className={cn(
            tab === "you" ? "block" : "hidden",
            "lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-6 lg:[scrollbar-width:thin]",
          )}
        >
          {you}
        </aside>
        <section
          className={cn(tab === "you" ? "hidden" : "block", "px-5 pb-10 sm:px-8 lg:block lg:px-0")}
        >
          <div className="lg:hidden">{board(tab)}</div>
          <div className="hidden lg:block">{board(wideTab)}</div>
        </section>
      </main>

      <nav
        aria-label="Sections"
        className="bottom-nav fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[22px] bg-ink p-1.5 shadow-[0_12px_32px_-12px_oklch(0.25_0.02_285/0.7)]">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 rounded-[16px] text-[10.5px] font-extrabold transition-colors duration-200",
                tab === id ? "bg-optic text-ink" : "text-white/70 hover:text-white",
              )}
            >
              <Icon className="size-5" strokeWidth={2.4} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** The technology partner: "Sports Tech Partner ATHLETIQ". */
function PoweredBy({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-2 text-[12px] font-semibold",
        dark ? "text-white/70" : "text-dim",
        className,
      )}
    >
      Sports Tech Partner
      <img
        src="/brand/athletiq.webp"
        alt="Athletiq"
        width={96}
        height={16}
        className="h-4 w-auto"
      />
    </span>
  );
}
