import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { BoardFreshness, LiveSourceCount } from "../components/trends/freshness";
import { effectiveBoardStatus, FRESHNESS_LIMIT_MS } from "../lib/trends/freshness";

const fetchedAt = "2026-10-28T05:05:00.000Z";
const fetched = Date.parse(fetchedAt);

describe("board freshness", () => {
  it("marks a live board delayed when its last successful fetch gets too old", () => {
    const board = { status: "live", fetchedAt } as const;
    expect(effectiveBoardStatus(board, fetched + FRESHNESS_LIMIT_MS)).toBe("live");
    expect(effectiveBoardStatus(board, fetched + FRESHNESS_LIMIT_MS + 1)).toBe("stale");
  });

  it("never reports live when a timestamp is missing or invalid", () => {
    expect(effectiveBoardStatus({ status: "live", fetchedAt: null }, fetched)).toBe("unavailable");
    expect(effectiveBoardStatus({ status: "live", fetchedAt: "bad" }, fetched)).toBe("unavailable");
  });

  it("preserves collector failure and planned statuses even when the timestamp is recent", () => {
    expect(effectiveBoardStatus({ status: "stale", fetchedAt }, fetched)).toBe("stale");
    expect(effectiveBoardStatus({ status: "unavailable", fetchedAt: null }, fetched)).toBe("unavailable");
    expect(effectiveBoardStatus({ status: "soon", fetchedAt: null }, fetched)).toBe("soon");
  });

  it("keeps archive statuses independent of the current clock", () => {
    expect(effectiveBoardStatus({ status: "live", fetchedAt }, null)).toBe("live");
  });

  it("renders delayed status and excludes old boards from the server-rendered count", () => {
    const board = { status: "live", fetchedAt } as const;
    const serverNow = fetched + FRESHNESS_LIMIT_MS + 1;
    expect(renderToString(createElement(BoardFreshness, { board, serverNow }))).toContain("Delayed");
    expect(renderToString(createElement(LiveSourceCount, { boards: [board], serverNow }))).toBe("0");
    expect(renderToString(createElement(BoardFreshness, { board, serverNow, archive: true }))).toContain("At capture: Live");
  });
});
