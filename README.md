# Riverside Clinic — Clinic Management System

A complete, production-quality web application for small-to-medium medical clinics
(1–20 doctors). It manages patients, appointments, medical records, prescriptions,
lab orders, billing, reporting and clinic settings — simple enough for a
non-technical receptionist to use every day.

![Dashboard](docs/screenshot-dashboard.png)

---

## ✨ Features

| Module | What it does |
| --- | --- |
| **Patients** | Register, as-you-type search, full profile (visits, prescriptions, invoices, documents), edit, soft-delete (archive), file uploads |
| **Appointments** | Day/week calendar, filter by doctor, book (with inline new-patient registration), configurable slot length, double-booking prevention, statuses, reschedule, cancel with reason, **Today's Queue** |
| **Consultations (EMR)** | Patient summary with allergies/chronic conditions highlighted in red, consultation form (complaint, symptoms, exam, diagnosis + ICD-10, plan, follow-up), append-only notes with **visible edit history** |
| **Vitals** | Weight, height, blood pressure, temperature, pulse — recorded by nurses/doctors |
| **Prescriptions** | Multi-medicine prescriptions linked to a visit, **printable PDF** with clinic header + doctor signature line |
| **Lab orders** | Order from a configurable catalog, status workflow (Ordered → Sample collected → Result ready), text results or **file upload** |
| **Billing** | Configurable price list, invoices auto-filled from a visit, discounts (amount/%) + tax, payments (cash/card/insurance), partial payments & outstanding balances, **PDF invoice/receipt**, daily cash report |
| **Reports** | Dashboard KPIs, revenue by doctor/service/method, appointment volume, top diagnoses, outstanding balances — all **exportable to CSV** |
| **Settings (Admin)** | Clinic profile + logo, staff management (create/deactivate/reset password), doctor schedules, price list, lab catalog, **audit log** |
| **Security** | bcrypt-hashed passwords, JWT sessions, **role-based access enforced on the server**, server-side validation (Zod), soft deletes, created/updated timestamps, audit trail |
| **i18n** | English + Arabic with **RTL-ready** layout (toggle in the top bar) |

---

## 🧱 Tech stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS + React Router
- **Backend:** Node.js + Express + TypeScript
- **Database:** SQLite via Prisma ORM (switch to PostgreSQL by changing one line — see below)
- **Auth:** Email + password (bcrypt), JWT, role-based access control
- **PDFs:** PDFKit (prescriptions, invoices, receipts)

```
Clinic-app/
├── server/                 # Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema (all tables)
│   │   └── seed.ts         # Demo data seeder
│   ├── src/
│   │   ├── index.ts        # App entry, route wiring, error handling
│   │   ├── constants.ts    # Role / status constants
│   │   ├── middleware/auth.ts   # JWT + requireRole guards
│   │   ├── utils/          # audit, validation, uploads, PDF helpers
│   │   └── routes/         # auth, patients, appointments, consultations,
│   │                       #   vitals, prescriptions, lab, documents,
│   │                       #   invoices, reports, settings
│   └── uploads/            # Uploaded documents & logos (git-ignored)
└── client/                 # React app
    └── src/
        ├── pages/          # One file per screen
        ├── components/     # Layout, UI kit, forms, modals, icons
        ├── context/        # Auth context
        ├── i18n/           # English + Arabic dictionaries
        └── lib/            # API client, types, formatters
```

---

## 🚀 Getting started

You need **Node.js 18+** (built and tested on Node 22). No external database required —
SQLite runs from a local file.

### 1. Backend

```bash
cd server
npm install
npm run setup      # generates Prisma client, creates the DB, seeds demo data
npm run dev        # starts the API on http://localhost:4000
```

`npm run setup` is a one-time command equal to
`prisma generate && prisma db push && tsx prisma/seed.ts`.
To re-seed later (wipes and repopulates demo data): `npm run seed`.

### 2. Frontend (in a second terminal)

```bash
cd client
npm install
npm run dev        # starts the app on http://localhost:5173
```

Open **http://localhost:5173** and log in with one of the demo accounts below.
The Vite dev server proxies `/api` to the backend automatically.

### Production build

```bash
# Backend
cd server && npm run build && npm start
# Frontend
cd client && npm run build   # outputs static files to client/dist
```

---

## 🔐 Demo login credentials

The seed script creates these accounts (also printed to the console when seeding).
On the login screen you can **click any demo card to auto-fill** the fields.

| Role | Email | Password |
| --- | --- | --- |
| **Admin** | `admin@clinic.com` | `admin123` |
| **Doctor** (General Practice) | `dr.smith@clinic.com` | `doctor123` |
| **Doctor** (Pediatrics) | `dr.jones@clinic.com` | `doctor123` |
| **Receptionist** | `reception@clinic.com` | `reception123` |
| **Nurse** | `nurse@clinic.com` | `nurse123` |

Seed data also includes: 1 clinic profile, 20 sample patients, this week's
appointments (with vitals, consultations, prescriptions and invoices for completed
ones), a price list, and a lab-test catalog — so you can explore immediately.

---

## ⚙️ Configuration

Backend config lives in `server/.env`. It is created automatically from
`server/.env.example` the first time you run `npm run setup` or `npm run dev`, with
these working local-dev defaults:

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-this-in-production-..."
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
```

> **Change `JWT_SECRET` before any real deployment.**

### Switching to PostgreSQL

1. In `server/prisma/schema.prisma`, change the datasource:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` to your Postgres connection string.
3. The schema uses `String` fields (instead of native enums) for portability, so no
   other changes are needed. Run `npm run setup` again.

---

## 🔒 Security notes

- Passwords are hashed with **bcrypt** — never stored in plain text.
- Every API route requires authentication except `POST /api/auth/login`.
- **Role checks run on the server** (`requireRole` middleware), not just in the UI.
- All forms are validated server-side with **Zod**.
- Patients, appointments and invoices are **soft-deleted** (archived), never hard-deleted.
- Every record carries created/updated timestamps and a created-by user.
- An **audit log** records logins, edits, deletions and payments.

> ⚠️ Real clinic software must comply with your country's health-data privacy laws
> (e.g. HIPAA in the US). Have a professional review security before storing real
> patient data. This project is a strong starting point, not a certified product.

---

## 📖 How each role uses the system

See **[ROLE_GUIDE.md](ROLE_GUIDE.md)** for a plain-language walkthrough of a typical
day for the admin, receptionist, nurse and doctor.
