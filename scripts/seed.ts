import { CATEGORIES } from "@surge/shared";
import { category, closeDb, getPostgresDb } from "@surge/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = getPostgresDb();
  const rows = CATEGORIES.map((item, index) => ({
    slug: item.slug,
    name: item.name,
    description: item.description,
    sortOrder: index + 1,
    updatedAt: new Date(),
  }));

  await db
    .insert(category)
    .values(rows)
    .onConflictDoUpdate({
      target: category.slug,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        sortOrder: sql`excluded.sort_order`,
        updatedAt: new Date(),
      },
    });

  console.log(JSON.stringify({ status: "ok", categories: rows.length, demoSitesCreated: 0 }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Database seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
