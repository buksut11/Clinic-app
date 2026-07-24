// Regenerates mysql/schema.sql from prisma/schema.mysql.prisma, keeping a friendly
// header. Run with: npm run prisma:mysql:sql
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', '..', 'mysql', 'schema.sql');
const header = `-- ============================================================================
-- Clinic Management System — MySQL schema (XAMPP / phpMyAdmin)
-- ============================================================================
-- Creates every table, index and foreign key the app needs.
--
-- HOW TO USE IN phpMyAdmin:
--   1) Start MySQL in the XAMPP Control Panel.
--   2) Open http://localhost/phpmyadmin
--   3) Left side: New -> create a database named:  clinic  -> Create
--   4) Select the "clinic" database, open the "Import" tab, choose this file,
--      and click "Import".
--
-- (Advanced) Or let Prisma create the tables:  npm run prisma:mysql:push
-- ============================================================================

`;

// Placeholder URL so the mysql provider parses; `migrate diff` never connects.
const ddl = execSync(
  'npx --no-install prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.mysql.prisma --script',
  {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'mysql://root:@localhost:3306/clinic' },
  }
);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, header + ddl);
console.log(`Wrote ${out} (${(header + ddl).split('\n').length} lines).`);
