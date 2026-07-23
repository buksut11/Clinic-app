# Hosting the database on Supabase (PostgreSQL)

The app runs on **SQLite** locally with zero setup. To host the database on
**Supabase**, point the backend at a Supabase Postgres database and create the
tables. Everything you need is in the `supabase/` folder and the
`prisma/schema.postgres.prisma` schema — the application code does **not** change.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Choose a name, a strong **database password** (save it), and a region.
3. Wait for the project to finish provisioning.

## 2. Get your connection strings

In the dashboard: **Project Settings → Database → Connection string**.
You need two of them:

| Variable | Which string | Port | Used for |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Transaction pooler** + append `?pgbouncer=true` | `6543` | the app's normal queries |
| `DIRECT_URL` | **Session / direct** connection | `5432` | schema migrations |

They look like:

```
DATABASE_URL="postgresql://postgres.xxxx:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxx:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
```

Replace `[PASSWORD]` with the database password from step 1.

## 3. Create the tables

Pick **one** of these:

**Option A — paste the SQL (no tooling needed).**
Open **Supabase → SQL Editor**, paste the entire contents of
[`supabase/schema.sql`](supabase/schema.sql), and click **Run**. That creates all
22 tables with their indexes and foreign keys.

**Option B — let Prisma create them.**
Put the two connection strings in `server/.env`, then:

```bash
cd server
npm run prisma:pg:push        # creates the tables from schema.postgres.prisma
```

## 4. Point the app at Supabase & seed demo data

In `server/.env`, set `DATABASE_URL` and `DIRECT_URL` (from step 2) and comment out
the SQLite line. Then generate the Postgres client and load the demo data:

```bash
cd server
npm run setup:supabase        # generate client + push schema + seed demo data
# ...or, if the tables already exist (Option A):
npm run prisma:pg:generate && npm run seed
```

Start the API as usual (`npm run dev` / `npm start`). Log in with the same demo
accounts listed in the main README.

## 5. (Recommended) Lock down the public API

Tables created via SQL/Prisma are reachable through Supabase's auto-generated REST
API with the public `anon` key. Since this app only ever talks to Postgres through
its **own** backend (which uses the connection string and bypasses RLS), you should
enable **Row Level Security** so nobody can read clinical data through that public
API. Run [`supabase/enable-rls.sql`](supabase/enable-rls.sql) in the SQL Editor
after step 3. It won't affect the app.

---

## Notes & gotchas

- **Keep the two schemas in sync.** `prisma/schema.prisma` (SQLite, local) and
  `prisma/schema.postgres.prisma` (Postgres) have identical models — only the
  datasource differs. If you change models, update both, then regenerate the SQL
  with `npm run prisma:pg:sql`.
- **File uploads.** Uploaded documents/logos are written to `server/uploads` on
  local disk. On hosts with ephemeral disks that won't persist — for production,
  move uploads to **Supabase Storage** (or any object store) and save the returned
  URL instead of a local filename. The database tables are already Storage-ready
  (they only store the file's name/reference).
- **Secrets.** Set a strong `JWT_SECRET` in production. Never commit real
  connection strings — keep them in `server/.env` (git-ignored) or your host's
  environment settings.
- **Enums.** Status fields (roles, appointment/lab/invoice status) are stored as
  plain `TEXT` for portability; valid values are enforced in the API with Zod.
