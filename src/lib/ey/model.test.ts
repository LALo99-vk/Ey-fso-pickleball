import { describe, expect, it } from "vitest";

import { eventMeta, matchScore, parseFixtures, resolveMatches, standings } from "./model";

const MD = eventMeta("MD");
const WS = eventMeta("WS");

describe("event result tabs", () => {
  it("reads a Baddy-style tab and carries the winner forward", () => {
    // As the sheet shows it after the desk picks M44's winner: M57's first cell now holds the name.
    const grid = [
      [
        "Match No",
        "Round",
        "Team 1",
        "Team 2",
        "Score 1",
        "Score 2",
        "Court",
        "Time",
        "Winner",
        "Status",
      ],
      [
        "44",
        "Round of 16",
        "Arun A & Bala B",
        "Chetan C & TBD",
        "11",
        "6",
        "2",
        "12:15 pm",
        "Arun A & Bala B",
        "Completed",
      ],
      [
        "46",
        "Round of 16",
        "Dev D & Eshan E",
        "Farhan F & Gopal G",
        "",
        "",
        "1",
        "12:30 pm",
        "",
        "Upcoming",
      ],
      [
        "57",
        "Quarter-final",
        "Arun A & Bala B",
        "Winner Match 46",
        "",
        "",
        "1",
        "1:15 pm",
        "",
        "Upcoming",
      ],
    ];
    const matches = resolveMatches(parseFixtures(grid, MD));
    expect(matches).toHaveLength(3);
    const m44 = matches.find((m) => m.no === 44)!;
    expect(matchScore(m44).winner).toBe(1);
    expect(m44.minutes).toBe(12 * 60 + 15);
    const m57 = matches.find((m) => m.no === 57)!;
    expect(m57.event).toBe("MD");
    expect(m57.players1).toEqual(["Arun A", "Bala B"]);
    expect(m57.players2).toEqual([]);
    expect(m57.side2).toBe("Winner M46");
  });

  it("a Winner pick with no score settles the match (walkover)", () => {
    const grid = [
      [
        "Match No",
        "Round",
        "Player 1",
        "Player 2",
        "Score 1",
        "Score 2",
        "Court",
        "Time",
        "Winner",
        "Status",
      ],
      ["12", "Group", "Asha A", "Bina B", "", "", "4", "10:00 am", "Bina B", "Walkover"],
      ["16", "Group", "Chitra C", "Divya D", "11", "4", "4", "10:15 am", "", "Completed"],
    ];
    const matches = parseFixtures(grid, WS);
    expect(matchScore(matches[0]!)).toMatchObject({ winner: 2, walkover: true });
    const table = standings(matches, "WS", "");
    expect(table[0]!.points).toBe(2);
    expect(table.find((r) => r.name === "Chitra C")!.won).toBe(1);
  });
});
