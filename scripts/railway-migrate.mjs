/**
 * Applies supabase/migrations and, on a fresh database, supabase/seed.sql.
 *
 * This is the Railway counterpart to scripts/dev-setup.sh, which cannot run
 * there: it needs psql, createdb and a local socket. The semantics are
 * deliberately the same as that script's --  migrations are re-runnable by
 * construction and applied in filename order, and the seed is loaded only when
 * the database is not already seeded, so a redeploy never truncates data
 * someone is mid-demo on. Reseeding stays an explicit, human act.
 *
 * Runs as the portal's pre-deploy command, inside Railway's private network,
 * so the database needs no public TCP proxy.
 *
 * Concept prototype. The seed it loads is fictional data only.
 */
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// `postgres` is a dependency of @csa/api-client, not of the workspace root, so
// resolve it from that package rather than from this file's own directory.
const require = createRequire(new URL("../packages/api-client/", import.meta.url));
const postgres = require("postgres");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SEED_FILE = path.join(ROOT, "supabase", "seed.sql");

/** The four fictional identities seed.sql creates. Contract demo identities. */
const DEMO_EMAILS = [
  "member@demo.local",
  "nonmember@demo.local",
  "admin@demo.local",
  "staff@demo.local",
];

const url = process.env["CSA_DATABASE_URL"] || process.env["DATABASE_URL"];
if (!url) {
  console.error("[migrate] neither CSA_DATABASE_URL nor DATABASE_URL is set");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  // The migrations are re-runnable, so replaying them emits a wall of
  // "already exists, skipping" NOTICEs that would hide a real warning.
  connection: { client_min_messages: "warning" },
  onnotice: () => {},
  idle_timeout: 20,
  connect_timeout: 30,
});

async function applyMigrations() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error(`no .sql migrations found in ${MIGRATIONS_DIR}`);

  for (const file of files) {
    const body = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await sql.unsafe(body).simple();
    } catch (error) {
      throw new Error(`migration failed: ${file}\n${error.message}`);
    }
    console.log(`[migrate] applied ${file}`);
  }
  console.log(`[migrate] ${files.length} migrations applied`);
}

async function isSeeded() {
  try {
    const rows = await sql`
      select count(*)::int as n from public.users where email = any(${DEMO_EMAILS})
    `;
    return rows[0].n === DEMO_EMAILS.length;
  } catch {
    return false;
  }
}

async function loadSeed() {
  const body = await readFile(SEED_FILE, "utf8");
  try {
    await sql.unsafe(body).simple();
  } catch (error) {
    throw new Error(`seed failed: supabase/seed.sql\n${error.message}`);
  }
}

async function rowCounts() {
  const rows = await sql`
    select
      (select count(*)::int from public.events)        as events,
      (select count(*)::int from public.users)         as users,
      (select count(*)::int from public.registrations) as registrations,
      (select count(*)::int from public.partners)      as partners
  `;
  const r = rows[0];
  return `${r.events} events, ${r.users} users, ${r.registrations} registrations, ${r.partners} partners`;
}

try {
  await applyMigrations();

  if (await isSeeded()) {
    console.log(`[migrate] already seeded — ${await rowCounts()}; leaving data untouched`);
  } else {
    await loadSeed();
    console.log(`[migrate] seed loaded — ${await rowCounts()}`);
  }

  await sql.end({ timeout: 5 });
  console.log("[migrate] done");
} catch (error) {
  console.error(`[migrate] ${error.message}`);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
