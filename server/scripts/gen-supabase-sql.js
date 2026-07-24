// Regenerates supabase/schema.sql from prisma/schema.postgres.prisma, keeping a
// friendly header. Run with: npm run prisma:pg:sql
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', '..', 'supabase', 'schema.sql');
const header = `-- ============================================================================
-- Clinic Management System — Supabase / PostgreSQL schema
-- ============================================================================
-- Creates every table, index and foreign key the app needs. Generated from
-- prisma/schema.postgres.prisma so it always matches the application models.
--
-- HOW TO RUN (pick one):
--   A) Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   B) psql "<your-direct-connection-string>" -f supabase/schema.sql
--   C) Let Prisma create them:  npm run prisma:pg:push   (see SUPABASE.md)
--
-- Safe to run on a fresh database. To re-run on an existing one, drop the
-- tables first (or use a clean project). See SUPABASE.md for the full guide.
-- ============================================================================

`;

// Placeholder URLs so the postgres provider parses; `migrate diff` never connects.
const ddl = execSync(
  'npx --no-install prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.postgres.prisma --script',
  {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://u:p@localhost:6543/postgres?pgbouncer=true',
      DIRECT_URL: 'postgresql://u:p@localhost:5432/postgres',
    },
  }
);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, header + ddl);
console.log(`Wrote ${out} (${(header + ddl).split('\n').length} lines).`);
