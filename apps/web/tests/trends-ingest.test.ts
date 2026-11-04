import { describe, expect, it } from "vitest";
import { buildBoard } from "../lib/trends/ingest";
import { decodeEntities } from "../lib/trends/sources";
import type { RawTrendItem, TrendBoard } from "../lib/trends/types";

const raw = (id: string, metric: number | null): RawTrendItem => ({ id, title: id, url: `https://example.com/${id}`, metric, velocityHint: metric });

describe("trend ingest", () => {
  it("decodes XML/HTML entities", () => {
    expect(decodeEntities("Tom &amp; Jerry &#39;s &lt;3 &#x2014;")).toBe("Tom & Jerry 's <3 —");
  });

  it("marks movement, new entries and measured velocity against the previous board", () => {
    const t0 = Date.parse("2026-10-26T08:00:00Z");
    const first = buildBoard({ source: "hackernews", region: "global" }, { items: [raw("a", 100), raw("b", 50)], via: "test" }, undefined, t0);
    expect(first.items.map((i) => i.movement)).toEqual(["none", "none"]);

    const second = buildBoard({ source: "hackernews", region: "global" }, { items: [raw("b", 150), raw("a", 120), raw("c", 10)], via: "test" }, first as TrendBoard, t0 + 3_600_000);
    const [b, a, c] = second.items;
    expect(b!.movement).toBe("up");
    expect(b!.velocityMeasured).toBe(true);
    expect(b!.velocityPerHour).toBe(100);
    expect(a!.movement).toBe("down");
    expect(c!.movement).toBe("new");
    expect(c!.rankHistory).toEqual([11, 3]);
    expect(b!.heat).toBeGreaterThan(a!.heat);
    expect(b!.why).toContain("Climbed 1 spot");
  });
});
