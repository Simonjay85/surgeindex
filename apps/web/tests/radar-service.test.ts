import { describe, expect, it } from "vitest";
import { normalizeRadarMetadata, normalizeRadarOutages, normalizeRadarSummary, normalizeRadarWindow } from "../lib/server/radar-service";

describe("Cloudflare Radar normalization", () => {
  it("accepts the documented summary_0 map and preserves percentage metadata", () => {
    const summary = normalizeRadarSummary({ DESKTOP: "61.5", MOBILE: "38.5", INVALID: "not-a-number" }, {
      normalization: "PERCENTAGE",
      units: [{ name: "*", value: "requests" }],
      dateRange: [{ startTime: "2026-08-24T00:00:00.000Z", endTime: "2026-08-25T00:00:00.000Z" }],
      lastUpdated: "2026-08-25T00:05:00.000Z",
      confidenceInfo: { level: 5 },
    });

    expect(summary.dimensions.map((item) => item.label)).toEqual(["DESKTOP", "MOBILE"]);
    expect(summary.dimensions[0]?.value).toBe(61.5);
    expect(summary.dimensions[0]?.normalization).toBe("PERCENTAGE");
    expect(summary.metadata.unit).toBe("requests");
    expect(summary.metadata.confidenceLevel).toBe(5);
  });

  it("keeps outage records safe for links and readable for the UI", () => {
    const outages = normalizeRadarOutages([{
      id: "outage-1",
      description: "A regional network anomaly",
      scope: "Example region",
      locations: ["US"],
      locationsDetails: [{ name: "United States" }],
      origins: ["example-origin"],
      originsDetails: [{ name: "Example origin" }],
      outage: { outageCause: "CABLE_CUT", outageType: "NATIONWIDE" },
      startDate: "2026-08-25T00:00:00.000Z",
      linkedUrl: "javascript:alert(1)",
    }]);

    expect(outages[0]).toMatchObject({ id: "outage-1", title: "A regional network anomaly", origin: "Example origin", cause: "CABLE_CUT", type: "NATIONWIDE" });
    expect(outages[0]?.locations).toEqual(["United States", "US"]);
    expect(outages[0]?.linkedUrl).toBeNull();
  });

  it("uses the supported public windows and fails closed for unknown input", () => {
    expect(normalizeRadarWindow("30d")).toBe("30d");
    expect(normalizeRadarWindow("365d")).toBe("7d");
    expect(normalizeRadarMetadata({}).lastUpdated).toBeNull();
  });
});
