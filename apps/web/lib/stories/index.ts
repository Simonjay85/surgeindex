import { storySchema, type Story } from "./schema";
import truongGiang from "../../content/stories/vn/truong-giang.json";

/**
 * Registry of every published Surge Story. To add one, create the JSON file
 * and add one import + one entry below (see CONTENT_SURGE_STORY.md).
 * Static imports keep this free of filesystem access at runtime.
 */
const RAW: unknown[] = [truongGiang];

function load(): Story[] {
  const stories = RAW.map((raw, i) => {
    const parsed = storySchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid Surge Story #${i}: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
    }
    return parsed.data;
  });
  const slugs = stories.map((s) => `${s.region}/${s.slug}`);
  const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
  if (dup) throw new Error(`Duplicate Surge Story slug: ${dup}`);
  return stories.sort((a, b) => b.last_updated.localeCompare(a.last_updated));
}

export const STORIES: readonly Story[] = load();

export function listStories(region?: Story["region"]): readonly Story[] {
  return region ? STORIES.filter((s) => s.region === region) : STORIES;
}

export function getStory(region: Story["region"], slug: string): Story | undefined {
  return STORIES.find((s) => s.region === region && s.slug === slug);
}

/** "2026-10-26" → "26/10/2026" */
export function formatViDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}
