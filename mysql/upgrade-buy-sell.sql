-- ============================================================================
-- Clinic Management System — "Buy & Sell" upgrade for an EXISTING database
-- ============================================================================
-- Run this ONLY on a database that already has the app's tables and data
-- (e.g. your XAMPP / phpMyAdmin "clinic" database). It adds the new pharmacy
-- buy/sell features WITHOUT touching your existing rows:
--   • Medication.costPrice            (buy/cost price, for profit margins)
--   • Dispense customer + payment     (walk-in name/phone, payment method, cost)
--   • Purchase / PurchaseItem tables  (buying stock from suppliers)
--
-- Works on BOTH MySQL and MariaDB (plain syntax — no MariaDB-only extensions).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HOW TO RUN (phpMyAdmin)
--   1. Click your database (e.g. `clinic`) in the LEFT SIDEBAR first. This is
--      essential — if no database is selected, every statement below fails.
--   2. Click the  SQL  tab at the top.
--   3. Run the STEPS BELOW ONE AT A TIME (paste one step, press Go, repeat).
--      Running them one at a time matters: if you paste everything and one
--      statement errors, phpMyAdmin stops and the rest never run.
--   4. Finish with STEP 5 to verify.
--
-- ⚠ If a step says "Duplicate column name" or "Table already exists", that step
--   was already applied — that error is harmless. Just move to the next step.
-- ─────────────────────────────────────────────────────────────────────────────


-- STEP 1 ─ Cost (buy) price on each medication ───────────────────────────────
ALTER TABLE `Medication`
  ADD COLUMN `costPrice` DOUBLE NOT NULL DEFAULT 0;


-- STEP 2 ─ Sell-side fields on each sale ─────────────────────────────────────
ALTER TABLE `Dispense`
  ADD COLUMN `customerName`  VARCHAR(191) NULL,
  ADD COLUMN `customerPhone` VARCHAR(191) NULL,
  ADD COLUMN `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'cash',
  ADD COLUMN `costTotal`     DOUBLE NOT NULL DEFAULT 0;


-- STEP 3 ─ The two new tables for buying stock ───────────────────────────────
CREATE TABLE IF NOT EXISTS `Purchase` (
    `id`          VARCHAR(191) NOT NULL,
    `purchaseNo`  VARCHAR(191) NOT NULL,
    `supplier`    VARCHAR(191) NULL,
    `invoiceRef`  VARCHAR(191) NULL,
    `notes`       VARCHAR(191) NULL,
    `total`       DOUBLE NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Purchase_purchaseNo_key`(`purchaseNo`),
    INDEX `Purchase_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PurchaseItem` (
    `id`           VARCHAR(191) NOT NULL,
    `purchaseId`   VARCHAR(191) NOT NULL,
    `medicationId` VARCHAR(191) NOT NULL,
    `name`         VARCHAR(191) NOT NULL,
    `quantity`     INTEGER NOT NULL,
    `costPrice`    DOUBLE NOT NULL DEFAULT 0,
    `amount`       DOUBLE NOT NULL DEFAULT 0,
    `batchNo`      VARCHAR(191) NULL,
    `expiryDate`   DATETIME(3) NULL,

    INDEX `PurchaseItem_purchaseId_idx`(`purchaseId`),
    INDEX `PurchaseItem_medicationId_idx`(`medicationId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- STEP 4 ─ Foreign keys (OPTIONAL) ───────────────────────────────────────────
-- These add referential integrity. The app works fine without them, so if this
-- step errors, you can safely skip it and carry on.
ALTER TABLE `Purchase`
  ADD CONSTRAINT `Purchase_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PurchaseItem`
  ADD CONSTRAINT `PurchaseItem_purchaseId_fkey`
  FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PurchaseItem`
  ADD CONSTRAINT `PurchaseItem_medicationId_fkey`
  FOREIGN KEY (`medicationId`) REFERENCES `Medication`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- STEP 5 ─ Verify it all worked ──────────────────────────────────────────────
-- Expected: 2 rows (Purchase, PurchaseItem), then 1 row, then 4 rows.
SHOW TABLES LIKE 'Purchase%';
SHOW COLUMNS FROM `Medication` LIKE 'costPrice';
SHOW COLUMNS FROM `Dispense` WHERE `Field` IN ('customerName','customerPhone','paymentMethod','costTotal');

-- Done. Now restart the app (stop the server and run it again) so it picks up
-- the new columns.
