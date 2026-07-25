-- ============================================================================
-- Clinic Management System — "Buy & Sell" upgrade for an EXISTING MySQL database
-- ============================================================================
-- Run this ONLY on a database that already has the app's tables and data
-- (e.g. your XAMPP / phpMyAdmin "clinic" database). It adds the new pharmacy
-- buy/sell features WITHOUT touching your existing rows:
--   • Medication.costPrice           (buy/cost price, for profit margins)
--   • Dispense customer + payment     (walk-in name/phone, payment method, cost)
--   • Purchase / PurchaseItem tables  (buying stock from suppliers)
--
-- HOW TO RUN:
--   phpMyAdmin → pick your "clinic" database (left sidebar) → SQL tab →
--   paste this whole file → Go.
--
-- The column/table steps (1-3) are safe to re-run (they use IF NOT EXISTS).
-- Run the foreign-key step (4) only ONCE — if you paste the whole file a
-- second time, skip section 4 (the constraints will already exist).
-- (XAMPP ships MariaDB, which supports IF NOT EXISTS on ADD COLUMN.)
-- ============================================================================

-- 1) Cost (buy) price on each medication ------------------------------------
ALTER TABLE `Medication`
  ADD COLUMN IF NOT EXISTS `costPrice` DOUBLE NOT NULL DEFAULT 0;

-- 2) Sell-side additions on each dispense (sale) -----------------------------
ALTER TABLE `Dispense`
  ADD COLUMN IF NOT EXISTS `customerName`  VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `customerPhone` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS `costTotal`     DOUBLE NOT NULL DEFAULT 0;

-- 3) Buying stock from suppliers --------------------------------------------
CREATE TABLE IF NOT EXISTS `Purchase` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseNo` VARCHAR(191) NOT NULL,
    `supplier` VARCHAR(191) NULL,
    `invoiceRef` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `total` DOUBLE NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Purchase_purchaseNo_key`(`purchaseNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PurchaseItem` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseId` VARCHAR(191) NOT NULL,
    `medicationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `costPrice` DOUBLE NOT NULL DEFAULT 0,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `batchNo` VARCHAR(191) NULL,
    `expiryDate` DATETIME(3) NULL,

    INDEX `PurchaseItem_purchaseId_idx`(`purchaseId`),
    INDEX `PurchaseItem_medicationId_idx`(`medicationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4) Foreign keys for the new tables ----------------------------------------
ALTER TABLE `Purchase`
  ADD CONSTRAINT `Purchase_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PurchaseItem`
  ADD CONSTRAINT `PurchaseItem_purchaseId_fkey`
  FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PurchaseItem`
  ADD CONSTRAINT `PurchaseItem_medicationId_fkey`
  FOREIGN KEY (`medicationId`) REFERENCES `Medication`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Done. Restart the server (npm run dev) so Prisma picks up the new columns.
