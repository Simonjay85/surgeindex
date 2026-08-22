import { eq, sql } from "drizzle-orm";
import { closeDb, getPostgresDb, user } from "@surge/db";

const email = process.argv.slice(2).find((argument) => argument !== "--")?.trim().toLowerCase();
const confirmation = process.env.ADMIN_BOOTSTRAP_CONFIRM;

if (!email || confirmation !== email) {
  console.error("Usage: ADMIN_BOOTSTRAP_CONFIRM=<exact-email> pnpm admin:promote -- <exact-email>");
  process.exit(1);
}

async function main(): Promise<number> {
  const db = getPostgresDb();
  try {
    const [{ count: adminCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(user).where(eq(user.role, "admin"));
    if (Number(adminCount) > 0 && process.env.ADMIN_BOOTSTRAP_ALLOW_EXISTING !== "true") {
      console.error("An administrator already exists. Set ADMIN_BOOTSTRAP_ALLOW_EXISTING=true for an explicit subsequent promotion.");
      return 1;
    }

    const [updated] = await db.update(user).set({ role: "admin", updatedAt: new Date() }).where(eq(user.email, email)).returning({ id: user.id, email: user.email });
    if (!updated) {
      console.error(`No user exists for ${email}. Create the account first, then run this command again.`);
      return 1;
    }
    console.log(`Promoted ${updated.email} (${updated.id}) to admin.`);
    return 0;
  } finally {
    await closeDb();
  }
}

void main().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Admin promotion failed.");
  process.exitCode = 1;
});
