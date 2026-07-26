import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { Roles, MED_FORMS, PaymentMethods } from '../constants';
import { nextInvoiceNo } from '../utils/sequences';
import { Prisma } from '@prisma/client';

const router = Router();
router.use(requireAuth);

// Anyone signed in may read the catalogue; only admin/pharmacist may mutate.
const CAN_MANAGE = [Roles.ADMIN, Roles.PHARMACIST];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function nextSku(): Promise<string> {
  const last = await prisma.medication.findFirst({ where: { sku: { startsWith: 'MED-' } }, orderBy: { sku: 'desc' } });
  let seq = 1;
  if (last) {
    const n = parseInt(last.sku.slice(4), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return 'MED-' + String(seq).padStart(5, '0');
}

async function nextDispenseNo(client: Prisma.TransactionClient = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DSP-${year}-`;
  const last = await client.dispense.findFirst({ where: { dispenseNo: { startsWith: prefix } }, orderBy: { dispenseNo: 'desc' } });
  let seq = 1;
  if (last) {
    const n = parseInt(last.dispenseNo.slice(prefix.length), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return prefix + String(seq).padStart(5, '0');
}

async function nextPurchaseNo(client: Prisma.TransactionClient = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PUR-${year}-`;
  const last = await client.purchase.findFirst({ where: { purchaseNo: { startsWith: prefix } }, orderBy: { purchaseNo: 'desc' } });
  let seq = 1;
  if (last) {
    const n = parseInt(last.purchaseNo.slice(prefix.length), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return prefix + String(seq).padStart(5, '0');
}

function soonExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 90); // "expiring soon" = within 90 days
  return d;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
const medSchema = z.object({
  name: z.string().min(1),
  genericName: z.string().optional().nullable(),
  form: z.enum(MED_FORMS as [string, ...string[]]).default('tablet'),
  strength: z.string().optional().nullable(),
  unit: z.string().min(1).default('unit'),
  reorderLevel: z.number().int().min(0).default(20),
  unitPrice: z.number().min(0).default(0),
  costPrice: z.number().min(0).default(0),
  batchNo: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  supplier: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  quantity: z.number().int().min(0).optional(), // only used on create as opening stock
});

function medData(b: z.infer<typeof medSchema>) {
  return {
    name: b.name,
    genericName: b.genericName || null,
    form: b.form,
    strength: b.strength || null,
    unit: b.unit,
    reorderLevel: b.reorderLevel,
    unitPrice: b.unitPrice,
    costPrice: b.costPrice,
    batchNo: b.batchNo || null,
    expiryDate: b.expiryDate ? new Date(b.expiryDate) : null,
    supplier: b.supplier || null,
    location: b.location || null,
  };
}

// List medications with search + filters (lowStock / expiring)
router.get(
  '/medications',
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) || '';
    const where: any = {};
    if (req.query.includeInactive !== 'true') where.isActive = true;
    if (q) where.OR = [{ name: { contains: q } }, { genericName: { contains: q } }, { sku: { contains: q } }];
    let meds = await prisma.medication.findMany({ where, orderBy: { name: 'asc' } });

    if (req.query.filter === 'low') meds = meds.filter((m) => m.quantity <= m.reorderLevel);
    if (req.query.filter === 'expiring') {
      const soon = soonExpiryDate();
      meds = meds.filter((m) => m.expiryDate && new Date(m.expiryDate) <= soon);
    }
    res.json(meds);
  })
);

router.get(
  '/medications/:id',
  asyncHandler(async (req, res) => {
    const med = await prisma.medication.findUnique({
      where: { id: req.params.id },
      include: { movements: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!med) return res.status(404).json({ error: 'Medication not found' });
    res.json(med);
  })
);

router.post(
  '/medications',
  requireRole(...CAN_MANAGE),
  validateBody(medSchema),
  asyncHandler(async (req, res) => {
    const opening = req.body.quantity ?? 0;
    const sku = await nextSku();
    const med = await prisma.medication.create({
      data: { ...medData(req.body), sku, quantity: opening, createdById: req.user!.id },
    });
    if (opening > 0) {
      await prisma.stockMovement.create({
        data: {
          medicationId: med.id,
          type: 'RECEIVE',
          quantity: opening,
          balanceAfter: opening,
          reason: 'Opening stock',
          batchNo: med.batchNo,
          expiryDate: med.expiryDate,
          createdById: req.user!.id,
          createdByName: req.user!.name,
        },
      });
    }
    await audit(req.user, 'CREATE', 'Medication', med.id, `${med.name} (${med.sku})`);
    res.status(201).json(med);
  })
);

router.put(
  '/medications/:id',
  requireRole(...CAN_MANAGE),
  validateBody(medSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.medication.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Medication not found' });
    const med = await prisma.medication.update({ where: { id: req.params.id }, data: medData(req.body) });
    await audit(req.user, 'UPDATE', 'Medication', med.id, `Edited ${med.name}`);
    res.json(med);
  })
);

// Deactivate (soft delete) — inventory is never hard-deleted
router.post(
  '/medications/:id/archive',
  requireRole(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    const med = await prisma.medication.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit(req.user, 'DELETE', 'Medication', med.id, `Deactivated ${med.name}`);
    res.json(med);
  })
);
router.post(
  '/medications/:id/restore',
  requireRole(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    const med = await prisma.medication.update({ where: { id: req.params.id }, data: { isActive: true } });
    await audit(req.user, 'UPDATE', 'Medication', med.id, `Reactivated ${med.name}`);
    res.json(med);
  })
);

// Receive stock (add) — optionally updates batch/expiry
const receiveSchema = z.object({
  quantity: z.number().int().positive(),
  batchNo: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
});
router.post(
  '/medications/:id/receive',
  requireRole(...CAN_MANAGE),
  validateBody(receiveSchema),
  asyncHandler(async (req, res) => {
    const med = await prisma.medication.findUnique({ where: { id: req.params.id } });
    if (!med) return res.status(404).json({ error: 'Medication not found' });
    const newQty = med.quantity + req.body.quantity;
    const updated = await prisma.medication.update({
      where: { id: med.id },
      data: {
        quantity: newQty,
        batchNo: req.body.batchNo || med.batchNo,
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : med.expiryDate,
      },
    });
    await prisma.stockMovement.create({
      data: {
        medicationId: med.id,
        type: 'RECEIVE',
        quantity: req.body.quantity,
        balanceAfter: newQty,
        reason: req.body.reason || 'Stock received',
        batchNo: req.body.batchNo || med.batchNo,
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : med.expiryDate,
        createdById: req.user!.id,
        createdByName: req.user!.name,
      },
    });
    await audit(req.user, 'UPDATE', 'Medication', med.id, `Received ${req.body.quantity} ${med.unit} of ${med.name}`);
    res.json(updated);
  })
);

// Manual adjustment (e.g. stock count correction, damage) — signed quantity
const adjustSchema = z.object({
  quantity: z.number().int().refine((n) => n !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(1, 'A reason is required for adjustments'),
});
router.post(
  '/medications/:id/adjust',
  requireRole(...CAN_MANAGE),
  validateBody(adjustSchema),
  asyncHandler(async (req, res) => {
    const med = await prisma.medication.findUnique({ where: { id: req.params.id } });
    if (!med) return res.status(404).json({ error: 'Medication not found' });
    const newQty = med.quantity + req.body.quantity;
    if (newQty < 0) return res.status(400).json({ error: 'Adjustment would make stock negative' });
    const updated = await prisma.medication.update({ where: { id: med.id }, data: { quantity: newQty } });
    await prisma.stockMovement.create({
      data: {
        medicationId: med.id,
        type: 'ADJUST',
        quantity: req.body.quantity,
        balanceAfter: newQty,
        reason: req.body.reason,
        createdById: req.user!.id,
        createdByName: req.user!.name,
      },
    });
    await audit(req.user, 'UPDATE', 'Medication', med.id, `Adjusted ${med.name} by ${req.body.quantity}: ${req.body.reason}`);
    res.json(updated);
  })
);

// ---------------------------------------------------------------------------
// Buying / Purchasing — bring stock in from a supplier and record its cost
// ---------------------------------------------------------------------------
const purchaseSchema = z.object({
  supplier: z.string().optional().nullable(),
  invoiceRef: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        medicationId: z.string().min(1),
        quantity: z.number().int().positive(),
        costPrice: z.number().min(0),
        batchNo: z.string().optional().nullable(),
        expiryDate: z.string().optional().nullable(),
      })
    )
    .min(1, 'Add at least one item to purchase'),
});

router.post(
  '/purchases',
  requireRole(...CAN_MANAGE),
  validateBody(purchaseSchema),
  asyncHandler(async (req, res) => {
    const { supplier, invoiceRef, notes, items } = req.body as z.infer<typeof purchaseSchema>;

    const meds = await prisma.medication.findMany({ where: { id: { in: items.map((i) => i.medicationId) } } });
    const medMap = new Map(meds.map((m) => [m.id, m]));
    for (const line of items) {
      if (!medMap.get(line.medicationId)) return res.status(400).json({ error: 'One or more medications no longer exist' });
    }

    const lineData = items.map((line) => {
      const med = medMap.get(line.medicationId)!;
      const amount = round2(line.costPrice * line.quantity);
      return { line, med, amount };
    });
    const total = round2(lineData.reduce((s, l) => s + l.amount, 0));

    const result = await prisma.$transaction(async (tx) => {
      const purchaseNo = await nextPurchaseNo(tx);
      const purchase = await tx.purchase.create({
        data: {
          purchaseNo,
          supplier: supplier || null,
          invoiceRef: invoiceRef || null,
          notes: notes || null,
          total,
          createdById: req.user!.id,
          items: {
            create: lineData.map((l) => ({
              medicationId: l.med.id,
              name: `${l.med.name}${l.med.strength ? ' ' + l.med.strength : ''}`,
              quantity: l.line.quantity,
              costPrice: l.line.costPrice,
              amount: l.amount,
              batchNo: l.line.batchNo || null,
              expiryDate: l.line.expiryDate ? new Date(l.line.expiryDate) : null,
            })),
          },
        },
        include: { items: true },
      });

      for (const l of lineData) {
        const newQty = l.med.quantity + l.line.quantity;
        await tx.medication.update({
          where: { id: l.med.id },
          data: {
            quantity: newQty,
            costPrice: l.line.costPrice, // remember the latest cost we paid
            batchNo: l.line.batchNo || l.med.batchNo,
            expiryDate: l.line.expiryDate ? new Date(l.line.expiryDate) : l.med.expiryDate,
            supplier: supplier || l.med.supplier,
          },
        });
        await tx.stockMovement.create({
          data: {
            medicationId: l.med.id,
            type: 'PURCHASE',
            quantity: l.line.quantity,
            balanceAfter: newQty,
            reason: `Purchased on ${purchaseNo}${supplier ? ` from ${supplier}` : ''}`,
            batchNo: l.line.batchNo || l.med.batchNo,
            expiryDate: l.line.expiryDate ? new Date(l.line.expiryDate) : l.med.expiryDate,
            createdById: req.user!.id,
            createdByName: req.user!.name,
          },
        });
      }
      return purchase;
    });

    await audit(req.user, 'PURCHASE', 'Purchase', result.id, `${result.purchaseNo} — ${items.length} item(s), total ${total}${supplier ? ` from ${supplier}` : ''}`);
    res.status(201).json(result);
  })
);

// Purchase history
router.get(
  '/purchases',
  asyncHandler(async (_req, res) => {
    const purchases = await prisma.purchase.findMany({
      include: { items: true, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(purchases);
  })
);

// ---------------------------------------------------------------------------
// Prescriptions awaiting dispensing
// ---------------------------------------------------------------------------
router.get(
  '/prescriptions/pending',
  asyncHandler(async (_req, res) => {
    const rx = await prisma.prescription.findMany({
      where: { dispensedAt: null },
      include: {
        items: true,
        patient: { select: { id: true, fullName: true, patientNo: true, allergies: true } },
        doctor: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    res.json(rx);
  })
);

// ---------------------------------------------------------------------------
// Dispensing
// ---------------------------------------------------------------------------
const dispenseSchema = z.object({
  patientId: z.string().optional().nullable(),
  prescriptionId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  paymentMethod: z.enum(PaymentMethods).optional().default('cash'),
  notes: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        medicationId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, 'Add at least one item to sell'),
  chargeToInvoice: z.boolean().optional().default(false),
});
router.post(
  '/dispense',
  requireRole(Roles.ADMIN, Roles.PHARMACIST),
  validateBody(dispenseSchema),
  asyncHandler(async (req, res) => {
    const { patientId, prescriptionId, customerName, customerPhone, notes, items } = req.body;
    // "Charge to invoice" is either the explicit flag or the invoice payment method.
    const toInvoice = Boolean(req.body.chargeToInvoice) || req.body.paymentMethod === 'invoice';
    const paymentMethod = toInvoice ? 'invoice' : req.body.paymentMethod || 'cash';
    if (toInvoice && !patientId) {
      return res.status(400).json({ error: 'A patient is required to charge medicines to an invoice' });
    }

    // Load all medications and validate stock up-front
    const meds = await prisma.medication.findMany({ where: { id: { in: items.map((i: any) => i.medicationId) } } });
    const medMap = new Map(meds.map((m) => [m.id, m]));
    for (const line of items) {
      const med = medMap.get(line.medicationId);
      if (!med) return res.status(400).json({ error: 'One or more medications no longer exist' });
      if (!med.isActive) return res.status(400).json({ error: `${med.name} is not active` });
      if (med.quantity < line.quantity) {
        return res.status(400).json({ error: `Not enough stock for ${med.name} (have ${med.quantity}, need ${line.quantity})` });
      }
    }

    const lineData = items.map((line: any) => {
      const med = medMap.get(line.medicationId)!;
      const amount = round2(med.unitPrice * line.quantity);
      const cost = round2(med.costPrice * line.quantity);
      return { med, quantity: line.quantity, unitPrice: med.unitPrice, amount, cost };
    });
    const total = round2(lineData.reduce((s: number, l: any) => s + l.amount, 0));
    const costTotal = round2(lineData.reduce((s: number, l: any) => s + l.cost, 0));

    // Transaction: create the dispense, its items, decrement stock, log movements
    const result = await prisma.$transaction(async (tx) => {
      const dispenseNo = await nextDispenseNo(tx);
      const dispense = await tx.dispense.create({
        data: {
          dispenseNo,
          patientId: patientId || null,
          prescriptionId: prescriptionId || null,
          dispensedById: req.user!.id,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          paymentMethod,
          notes: notes || null,
          total,
          costTotal,
          items: {
            create: lineData.map((l: any) => ({
              medicationId: l.med.id,
              name: `${l.med.name}${l.med.strength ? ' ' + l.med.strength : ''}`,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              amount: l.amount,
            })),
          },
        },
        include: { items: true },
      });

      for (const l of lineData) {
        const newQty = l.med.quantity - l.quantity;
        await tx.medication.update({ where: { id: l.med.id }, data: { quantity: newQty } });
        await tx.stockMovement.create({
          data: {
            medicationId: l.med.id,
            type: 'DISPENSE',
            quantity: -l.quantity,
            balanceAfter: newQty,
            reason: `Dispensed on ${dispenseNo}`,
            createdById: req.user!.id,
            createdByName: req.user!.name,
          },
        });
      }

      if (prescriptionId) {
        await tx.prescription.update({ where: { id: prescriptionId }, data: { dispensedAt: new Date() } });
      }

      // Optionally raise an invoice so the medicines are captured as revenue
      let invoice = null;
      if (toInvoice && patientId) {
        const invoiceNo = await nextInvoiceNo(tx);
        invoice = await tx.invoice.create({
          data: {
            invoiceNo,
            patientId,
            subtotal: total,
            taxRate: 0, // medicines priced tax-inclusive here; adjust in Billing if needed
            taxAmount: 0,
            total,
            status: 'UNPAID',
            createdById: req.user!.id,
            items: {
              create: lineData.map((l: any) => ({
                description: `Medicine: ${l.med.name}${l.med.strength ? ' ' + l.med.strength : ''}`,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                amount: l.amount,
              })),
            },
          },
        });
      }
      return { dispense, invoice };
    });

    await audit(req.user, 'DISPENSE', 'Dispense', result.dispense.id, `${result.dispense.dispenseNo} — ${items.length} item(s), total ${total}${result.invoice ? `, invoiced ${result.invoice.invoiceNo}` : ''}`);
    res.status(201).json({ ...result.dispense, invoice: result.invoice });
  })
);

// Dispensing history
router.get(
  '/dispenses',
  asyncHandler(async (req, res) => {
    const where: any = {};
    if (req.query.patientId) where.patientId = req.query.patientId;
    const dispenses = await prisma.dispense.findMany({
      where,
      include: {
        items: true,
        patient: { select: { fullName: true, patientNo: true } },
        dispensedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(dispenses);
  })
);

// ---------------------------------------------------------------------------
// Pharmacy stats (for the dashboard header)
// ---------------------------------------------------------------------------
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const meds = await prisma.medication.findMany({ where: { isActive: true } });
    const soon = soonExpiryDate();
    const lowStock = meds.filter((m) => m.quantity <= m.reorderLevel).length;
    const outOfStock = meds.filter((m) => m.quantity === 0).length;
    const expiringSoon = meds.filter((m) => m.expiryDate && new Date(m.expiryDate) <= soon).length;
    // Stock valued at what it would sell for, and at what it cost us.
    const stockValue = round2(meds.reduce((s, m) => s + m.quantity * m.unitPrice, 0));
    const stockCost = round2(meds.reduce((s, m) => s + m.quantity * m.costPrice, 0));
    const pendingRx = await prisma.prescription.count({ where: { dispensedAt: null } });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const salesToday = await prisma.dispense.findMany({
      where: { createdAt: { gte: today, lt: tomorrow } },
      select: { total: true, costTotal: true },
    });
    const dispensedToday = salesToday.length;
    const salesTotalToday = round2(salesToday.reduce((s, d) => s + d.total, 0));
    const profitToday = round2(salesToday.reduce((s, d) => s + (d.total - d.costTotal), 0));

    const purchasesToday = await prisma.purchase.findMany({
      where: { createdAt: { gte: today, lt: tomorrow } },
      select: { total: true },
    });
    const purchasedToday = purchasesToday.length;
    const purchaseTotalToday = round2(purchasesToday.reduce((s, p) => s + p.total, 0));

    // A day's takings mean little on their own — the header shows them against
    // the week behind. Seven buckets, oldest first, today last.
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekSales = await prisma.dispense.findMany({
      where: { createdAt: { gte: weekStart, lt: tomorrow } },
      select: { total: true, createdAt: true },
    });

    const salesTrend: { date: string; total: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const from = new Date(weekStart);
      from.setDate(from.getDate() + i);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      const total = weekSales
        .filter((d) => d.createdAt >= from && d.createdAt < to)
        .reduce((s, d) => s + d.total, 0);
      // Local date, not toISOString() — that would shift the label across the
      // date line for anyone east or west of UTC.
      const date = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      salesTrend.push({ date, total: round2(total) });
    }
    const salesTotalYesterday = salesTrend[5].total;

    res.json({
      totalItems: meds.length,
      lowStock,
      outOfStock,
      expiringSoon,
      stockValue,
      stockCost,
      pendingRx,
      dispensedToday,
      salesTotalToday,
      salesTotalYesterday,
      salesTrend,
      profitToday,
      purchasedToday,
      purchaseTotalToday,
    });
  })
);

export default router;
