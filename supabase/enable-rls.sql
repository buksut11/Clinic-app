-- ============================================================================
-- Optional hardening: enable Row Level Security (RLS) on every table.
-- ============================================================================
-- This app talks to Postgres only through its own Express backend using the
-- database connection string (which connects as a privileged role and BYPASSES
-- RLS), so enabling RLS does NOT break the app.
--
-- What it DOES do: it locks down Supabase's auto-generated REST/GraphQL API so
-- that anon/public API keys cannot read or write your clinical data directly.
-- With RLS enabled and no policies defined, the public API returns nothing.
--
-- Run this AFTER schema.sql, in the Supabase SQL Editor.
-- ============================================================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Clinic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Patient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DoctorSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consultation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsultationEdit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vitals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prescription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrescriptionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LabTest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LabOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Medication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dispense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DispenseItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
