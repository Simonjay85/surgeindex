import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnvFileInto, parseEnvFile } from "../lib/trends/env-file";
import { unfetchableBoard } from "../lib/trends/ingest";
import type { TrendBoard } from "../lib/trends/types";

const liveYoutube: TrendBoard = {
  id: "youtube-vn",
  source: "youtube",
  region: "vn",
  status: "live",
  fetchedAt: "2026-10-27T09:46:00.000Z",
  via: "test",
  items: [{ id: "v1", title: "Video 1", url: "https://www.youtube.com/watch?v=v1", metric: 10, rank: 1, prevRank: null, movement: "none", rankHistory: [1], velocityPerHour: null, velocityMeasured: false, heat: 50, why: "x" }],
};

describe("ingest env file", () => {
  it("parses comments, export, quotes and empty values", () => {
    expect(parseEnvFile('# c\nexport A=1\nB="two words"\nC=\'3\'\nYOUTUBE_API_KEY=\nbad line\n')).toEqual({ A: "1", B: "two words", C: "3", YOUTUBE_API_KEY: "" });
  });

  it("fills missing keys, keeps non-empty ones, and reports unreadable files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "trends-env-"));
    const file = path.join(dir, "ingest.env");
    writeFileSync(file, "YOUTUBE_API_KEY=abc\nTRENDS_DATA_DIR=/x\nEMPTY=\n");
    const env: Record<string, string | undefined> = { TRENDS_DATA_DIR: "/keep", YOUTUBE_API_KEY: "" };
    const res = loadEnvFileInto(file, env);
    expect(res).toEqual({ ok: true, set: ["YOUTUBE_API_KEY"] });
    expect(env.YOUTUBE_API_KEY).toBe("abc");
    expect(env.TRENDS_DATA_DIR).toBe("/keep");
    expect(env.EMPTY).toBeUndefined();
    expect(loadEnvFileInto(path.join(dir, "missing.env"), env)).toMatchObject({ ok: false, error: "ENOENT" });
  });
});

describe("boards whose API key is missing this run", () => {
  const spec = { source: "youtube" as const, region: "vn" as const, soonNote: "YouTube Data API key not configured yet.", missingKey: "YOUTUBE_API_KEY" };

  it("keeps a previously live board as stale instead of Coming soon", () => {
    const { board, log } = unfetchableBoard(spec, liveYoutube);
    expect(board.status).toBe("stale");
    expect(board.items).toHaveLength(1);
    expect(board.note).not.toContain("not configured yet");
    expect(log.status).toBe("stale");
  });

  it("shows Coming soon when there was never a live board", () => {
    expect(unfetchableBoard(spec, undefined).board.status).toBe("soon");
    expect(unfetchableBoard({ source: "x", region: "global", soonNote: "planned" }, { ...liveYoutube, id: "x", source: "x", region: "global" }).board.status).toBe("soon");
  });
});
