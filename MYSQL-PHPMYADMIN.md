# Run the app with XAMPP + phpMyAdmin (MySQL) — beginner step-by-step

This guide switches the app's database from the built-in SQLite file to **MySQL**,
which is what **phpMyAdmin** manages. You'll install **XAMPP** (it bundles MySQL and
phpMyAdmin together), create the database in the phpMyAdmin screen, load the tables,
and point the app at it. No prior experience needed — just follow each step.

> ℹ️ You only need this if you specifically want to use phpMyAdmin. The app already
> works with zero setup on SQLite (see the main README). phpMyAdmin cannot open
> SQLite, which is why we move to MySQL here.

---

## Part 1 — Install XAMPP and start MySQL

1. Download XAMPP from **https://www.apachefriends.org** and install it (accept the
   defaults). This gives you Apache, MySQL and phpMyAdmin.
2. Open the **XAMPP Control Panel**.
3. Click **Start** next to **Apache**, then **Start** next to **MySQL**.
   Both should turn green. (Apache is needed so phpMyAdmin opens in your browser;
   MySQL is the database itself.)

> If MySQL won't start, another program is using its port. The most common cause is
> another MySQL/MariaDB already running — stop it, or change XAMPP's MySQL port.

---

## Part 2 — Create the database in phpMyAdmin

1. In your browser go to **http://localhost/phpmyadmin**
2. On the left, click **New**.
3. For the database name type exactly: **`clinic`**
4. Leave the collation as-is and click **Create**.

You now have an empty database called `clinic`.

---

## Part 3 — Load the tables (import the ready-made SQL)

The repo already contains a file with all the tables:
**[`mysql/schema.sql`](mysql/schema.sql)**.

1. In phpMyAdmin, click the **`clinic`** database on the left (make sure it's
   selected — you should see its name at the top).
2. Click the **Import** tab at the top.
3. Under *File to import*, click **Choose File** and pick **`mysql/schema.sql`** from
   this project folder.
4. Scroll down and click **Import**.

You should see a green "Import has been successfully finished" message, and 22 tables
will appear on the left (User, Patient, Appointment, Invoice, Medication, …).

---

## Part 4 — Point the app at MySQL

1. Open the file **`server/.env`** in a text editor (Notepad is fine).
   - If it doesn't exist yet, run `npm run setup` once first, or copy
     `server/.env.example` to `server/.env`.
2. Find the line that starts with `DATABASE_URL=` and change it to:

   ```
   DATABASE_URL="mysql://root:@localhost:3306/clinic"
   ```

   That's the XAMPP default: user **root**, **no password**, database **clinic**.
   (If you set a MySQL password, put it between the `:` and the `@`, e.g.
   `mysql://root:MyPassword@localhost:3306/clinic`.)
3. Save the file.

---

## Part 5 — Fill the app's database with the demo data

In a terminal, from the **`server`** folder, run:

```bash
cd server
npm run prisma:mysql:generate   # tell the app to talk to MySQL
npm run seed                    # add the demo clinic, patients, appointments, etc.
```

> Tip: `npm run setup:mysql` does the generate + create-tables + seed in one go — but
> since you already imported the tables in Part 3, just `prisma:mysql:generate` +
> `seed` is enough.

Refresh phpMyAdmin and open, say, the **Patient** table → **Browse** — you'll see the
20 demo patients. 🎉

---

## Part 6 — Run the app

From the **project root**:

```bash
npm start
```

Open **http://localhost:4000** and log in with a demo account (e.g.
`admin@clinic.com` / `admin123`, listed in the main README). The app now reads and
writes to your MySQL database, and you can view or edit any table live in phpMyAdmin.

---

## Everyday use after setup

- Start XAMPP → Start **MySQL** (and **Apache** if you want phpMyAdmin).
- In the project root run `npm start`, open **http://localhost:4000**.
- Manage data anytime at **http://localhost/phpmyadmin** → `clinic` database.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Can't reach database server at localhost:3306` | MySQL isn't started — open XAMPP and Start MySQL. |
| `Access denied for user 'root'` | You have a MySQL password set. Put it in `DATABASE_URL` before the `@`. |
| Import fails "table already exists" | The tables are already there — skip Part 3, go to Part 4. |
| App still shows old data | You're still on SQLite — re-check the `DATABASE_URL` line and that you ran `npm run prisma:mysql:generate`. |
| Want to start fresh | In phpMyAdmin drop the `clinic` database, recreate it, re-import `mysql/schema.sql`, then `npm run seed`. |

## Switching back to SQLite (no XAMPP needed)

Set `DATABASE_URL="file:./dev.db"` in `server/.env`, run
`npm --prefix server run prisma:generate`, and you're back to the zero-setup mode.
