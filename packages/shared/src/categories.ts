export interface CategoryDefinition {
  slug: string;
  name: string;
  description: string;
}

export const CATEGORIES: CategoryDefinition[] = [
  {
    slug: "ai-tools",
    name: "AI Tools",
    description:
      "AI assistants, model products, prompt tools, and machine-learning workflows.",
  },
  {
    slug: "saas",
    name: "SaaS",
    description: "Business software delivered as a service, from CRM to HR.",
  },
  {
    slug: "ecommerce",
    name: "Ecommerce",
    description: "Stores, marketplaces, and commerce enablement platforms.",
  },
  {
    slug: "marketing",
    name: "Marketing",
    description: "Growth, email, SEO, ads, and marketing intelligence tools.",
  },
  {
    slug: "design",
    name: "Design",
    description: "Design tools, asset libraries, and creative software.",
  },
  {
    slug: "developer-tools",
    name: "Developer Tools",
    description: "Editors, DevOps, APIs, and everything built for builders.",
  },
  {
    slug: "productivity",
    name: "Productivity",
    description: "Notes, planning, automation, and getting-things-done apps.",
  },
  {
    slug: "finance",
    name: "Finance",
    description: "Fintech, investing tools, budgeting, and money software.",
  },
  {
    slug: "media",
    name: "Media",
    description: "Publishing platforms, video, audio, and content creation.",
  },
  {
    slug: "other",
    name: "Other",
    description: "Notable websites that do not fit a primary category yet.",
  },
];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);

export function getCategory(slug: string): CategoryDefinition | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function isCategorySlug(slug: string): boolean {
  return CATEGORY_SLUGS.includes(slug);
}
