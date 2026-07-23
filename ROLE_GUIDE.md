# Plain-language guide: how each role uses the clinic system

This guide explains, in everyday language, how the four types of staff use the
system. No technical knowledge needed. Each person logs in with their own email and
password, and **only sees the menus they're allowed to use**.

---

## 🧑‍💼 Admin — "the manager"

The admin runs the whole clinic and can see everything.

**A typical day:**
1. **Log in** and check the **Dashboard** — today's appointments, money collected
   today and this month, new patients, no-show rate, and unpaid balances at a glance.
2. Go to **Settings → Staff** to add a new doctor or receptionist, deactivate someone
   who left, or reset a forgotten password.
3. In **Settings → Clinic profile**, update the clinic name, address, phone, upload
   the **logo** (it appears on printed prescriptions and invoices), set the currency
   and tax rate.
4. In **Settings → Price list** and **Lab catalog**, set consultation fees (per doctor
   and visit type), procedure prices and the list of lab tests the clinic offers.
5. In **Settings → Doctor schedules**, set each doctor's working days, hours and
   appointment slot length.
6. Open **Reports**, pick a date range, and review revenue by doctor/service, busiest
   days, top diagnoses and who still owes money. **Export any report to CSV** for
   accounting.
7. Use **Settings → Audit log** to see exactly who did what and when.

> The admin can also do anything the other roles can (register patients, book
> appointments, etc.) if needed.

---

## 🧑‍💻 Receptionist — "the front desk"

The receptionist is the busiest daily user — booking, checking in and taking money.

**A typical day:**
1. A new patient walks in → **Patients → Register patient**. Fill in name, phone,
   date of birth, etc. The system creates a unique patient ID like `P-2026-00001`.
2. To book a visit → **Appointments → Book appointment**. Search the patient (or
   register a brand-new one right there), pick the doctor, date and time. The system
   **won't let you double-book** a doctor's slot. You can choose *new visit* or
   *follow-up*.
3. When patients arrive → open **Today's Queue** and tap **Check in**. Big,
   touch-friendly buttons make this fast on a tablet.
4. Need to move or cancel a visit? Use **Reschedule** or **Cancel** (a reason is
   required for cancellations).
5. After the doctor finishes, create the bill → **Billing → New invoice**. Pick the
   patient and **auto-fill the line items from their completed visit** (consultation
   fee + any lab tests), add a discount if needed — tax is applied automatically.
6. Take payment → open the invoice, click **Take payment**, choose cash, card or
   insurance (record the insurer + claim number). **Partial payments** are supported;
   the outstanding balance is tracked automatically.
7. Click **Print / PDF** to hand the patient a receipt.
8. At end of day, the admin (or you) can view the **daily cash report** of totals by
   payment method.

---

## 👩‍⚕️ Nurse — "vitals & queue"

The nurse prepares patients before they see the doctor.

**A typical day:**
1. Open **Today's Queue** to see who has checked in and is waiting.
2. Tap **Record vitals** on a waiting patient. Enter weight, height, blood pressure,
   temperature and pulse. These are saved to that visit and the doctor sees them
   instantly.
3. In **Lab Orders**, the nurse can move a test to *Sample collected* and enter or
   upload results when ready.
4. The nurse can view patient records and search patients, but does not handle
   billing or clinic settings.

---

## 🩺 Doctor — "consultations & prescriptions"

The doctor sees their own schedule and patients, and writes the medical record.

**A typical day:**
1. Open **Today's Queue** (or **Appointments**, filtered to your own schedule) and
   click **Start consultation** on the next checked-in patient.
2. The consultation screen shows a **patient summary at the top** with **allergies and
   chronic conditions highlighted in red** so you never miss them, plus the vitals the
   nurse recorded.
3. Fill in the **consultation notes**: chief complaint, symptoms, examination,
   diagnosis (with an optional ICD-10 code), treatment plan and a follow-up date.
   Notes are **append-only** — if you amend them later, the previous version is kept
   and viewable under **Edit history**.
4. Write a **prescription**: add each medicine with dosage, frequency, duration and
   instructions, then click **Create & print prescription** to open a clean PDF with
   the clinic header and your signature line.
5. **Order lab tests** from the catalog directly on the same screen.
6. When done, click **Complete visit** — this marks the appointment completed and lets
   reception bill it.
7. You can open any patient's profile to review their full history: past visits,
   prescriptions, lab results and uploaded documents (scans, external lab reports).

---

## 🔁 How it all flows together

```
Receptionist books  →  Patient arrives, Receptionist checks in
        ↓                         ↓
   Appointment              Nurse records vitals
        ↓                         ↓
   Doctor consults  →  writes notes, prescription, lab orders  →  Completes visit
        ↓
   Receptionist creates invoice (auto-filled)  →  takes payment  →  prints receipt
        ↓
   Admin reviews reports, dashboard and audit log
```

Everyone works from the same patient record, so nothing gets lost between the front
desk, the nurse's station and the doctor's office.
