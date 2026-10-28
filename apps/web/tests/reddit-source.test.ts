import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReddit } from "../lib/trends/sources";

const post = {
  data: { children: [{ data: {
    id: "abc", title: "Example", subreddit_name_prefixed: "r/example", author: "someone",
    score: 100, num_comments: 7, created_utc: 1_700_000_000, permalink: "/r/example/comments/abc/example/",
    url: "https://example.com/", is_self: false,
  } }] },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Reddit collector", () => {
  it("explains a missing OAuth configuration and endpoint failures without exposing secrets", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    await expect(fetchReddit(Date.now())).rejects.toThrow(/approved Reddit credentials are not configured.*responded 403/);
  });

  it("uses the approved OAuth API before public sources", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "client");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "secret");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "token" })).mockResolvedValueOnce(Response.json(post));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchReddit(1_700_003_600_000);
    expect(result.via).toBe("reddit oauth api");
    expect(result.items[0]).toMatchObject({ id: "abc", metric: 100, comments: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports transient errors and empty source responses instead of an empty diagnostic", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "client");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({}))
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce(Response.json({ data: { children: [] } }))
      .mockResolvedValueOnce(new Response("<feed></feed>"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchReddit(Date.now())).rejects.toThrow(/OAuth response did not contain an access token.*network timeout.*no usable posts returned/);
  });
});
