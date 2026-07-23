import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { Roles } from '../constants';
import { startDoc, drawHeader, ClinicHeader } from '../utils/pdf';
import { nextInvoiceNo } from '../utils/sequences';

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
});

const invoiceSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, 'Add at least one line item'),
  discountType: z.enum(['amount', 'percent']).default('amount'),
  discountValue: z.number().min(0).default(0),
  taxRate: z.number().min(0).default(0),
});

// Compute totals from items + discount + tax
function computeTotals(
  items: { quantity: number; unitPrice: number }[],
  discountType: string,
  discountValue: number,
  taxRate: number
) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discount = discountType === 'percent' ? (subtotal * discountValue) / 100 : discountValue;
  const afterDiscount = Math.max(0, subtotal - discount);
  const taxAmount = (afterDiscount * taxRate) / 100;
  const total = afterDiscount + taxAmount;
  return { subtotal, taxAmount, total };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Suggest line items from a completed visit (consultation fee + labs)
router.get(
  '/suggest/:appointmentId',
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.appointmentId },
      include: { labOrders: true, doctor: true },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const items: { description: string; quantity: number; unitPrice: number }[] = [];

    // Consultation fee: match price list by doctor + visitType, else generic consultation
    const consultPrice =
      (await prisma.priceItem.findFirst({
        where: { type: 'consultation', doctorId: appt.doctorId, visitType: appt.visitType, isActive: true },
      })) ||
      (await prisma.priceItem.findFirst({
        where: { type: 'consultation', doctorId: appt.doctorId, isActive: true },
      })) ||
      (await prisma.priceItem.findFirst({ where: { type: 'consultation', isActive: true } }));
    items.push({
      description: `Consultation (${appt.visitType}) - ${appt.doctor.name}`,
      quantity: 1,
      unitPrice: consultPrice?.price ?? 0,
    });

    // Lab tests
    for (const lab of appt.labOrders) {
      const p = await prisma.priceItem.findFirst({ where: { type: 'labtest', name: lab.testName, isActive: true } });
      const lt = await prisma.labTest.findFirst({ where: { name: lab.testName } });
      items.push({ description: `Lab: ${lab.testName}`, quantity: 1, unitPrice: p?.price ?? lt?.price ?? 0 });
    }
    res.json({ items, patientId: appt.patientId });
  })
);

// List invoices
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where: any = { isDeleted: false };
    if (req.query.patientId) where.patientId = req.query.patientId;
    if (req.query.status) where.status = req.query.status;
    const include = {
      patient: { select: { fullName: true, patientNo: true } },
      payments: true,
    };

    if (req.query.page !== undefined) {
      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || '20', 10)));
      const [items, total] = await Promise.all([
        prisma.invoice.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.invoice.count({ where }),
      ]);
      return res.json({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
    }

    const invoices = await prisma.invoice.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json(invoices);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const inv = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { items: true, payments: { orderBy: { createdAt: 'desc' } }, patient: true },
    });
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    res.json(inv);
  })
);

// Create invoice
router.post(
  '/',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST),
  validateBody(invoiceSchema),
  asyncHandler(async (req, res) => {
    const { items, discountType, discountValue, taxRate } = req.body;
    const { subtotal, taxAmount, total } = computeTotals(items, discountType, discountValue, taxRate);
    const invoiceNo = await nextInvoiceNo(prisma);
    const inv = await prisma.invoice.create({
      data: {
        invoiceNo,
        patientId: req.body.patientId,
        appointmentId: req.body.appointmentId || null,
        subtotal: round2(subtotal),
        discountType,
        discountValue,
        taxRate,
        taxAmount: round2(taxAmount),
        total: round2(total),
        createdById: req.user!.id,
        items: {
          create: items.map((i: any) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            amount: round2(i.quantity * i.unitPrice),
          })),
        },
      },
      include: { items: true, payments: true },
    });
    await audit(req.user, 'CREATE', 'Invoice', inv.id, `${inv.invoiceNo} total ${inv.total}`);
    res.status(201).json(inv);
  })
);

// Update invoice (edit line items) while unpaid
router.put(
  '/:id',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST),
  validateBody(invoiceSchema.partial({ patientId: true })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { payments: true } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    if (existing.status === 'PAID' || existing.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Cannot edit a paid or cancelled invoice' });
    }
    const items = req.body.items;
    const discountType = req.body.discountType ?? existing.discountType;
    const discountValue = req.body.discountValue ?? existing.discountValue;
    const taxRate = req.body.taxRate ?? existing.taxRate;
    const { subtotal, taxAmount, total } = computeTotals(items, discountType, discountValue, taxRate);

    await prisma.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
    const paid = existing.payments.reduce((s, p) => s + p.amount, 0);
    const status = paid >= round2(total) ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    const inv = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        subtotal: round2(subtotal),
        discountType,
        discountValue,
        taxRate,
        taxAmount: round2(taxAmount),
        total: round2(total),
        status,
        items: {
          create: items.map((i: any) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            amount: round2(i.quantity * i.unitPrice),
          })),
        },
      },
      include: { items: true, payments: true },
    });
    await audit(req.user, 'UPDATE', 'Invoice', inv.id, `Edited ${inv.invoiceNo}`);
    res.json(inv);
  })
);

// Cancel invoice (soft)
router.post(
  '/:id/cancel',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST),
  asyncHandler(async (req, res) => {
    const inv = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', isDeleted: true },
    });
    await audit(req.user, 'DELETE', 'Invoice', inv.id, `Cancelled ${inv.invoiceNo}`);
    res.json(inv);
  })
);

// Record a payment
const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'insurance']),
  insurerName: z.string().optional().nullable(),
  claimRef: z.string().optional().nullable(),
});
router.post(
  '/:id/payments',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST),
  validateBody(paymentSchema),
  asyncHandler(async (req, res) => {
    const inv = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { payments: true } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.status === 'CANCELLED') return res.status(400).json({ error: 'Invoice is cancelled' });

    const payment = await prisma.payment.create({
      data: {
        invoiceId: inv.id,
        amount: req.body.amount,
        method: req.body.method,
        insurerName: req.body.insurerName || null,
        claimRef: req.body.claimRef || null,
        createdById: req.user!.id,
      },
    });
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0) + req.body.amount;
    const status = paid >= inv.total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    await prisma.invoice.update({ where: { id: inv.id }, data: { status } });
    await audit(req.user, 'PAYMENT', 'Invoice', inv.id, `${req.body.method} ${req.body.amount} on ${inv.invoiceNo}`);
    res.status(201).json({ payment, status });
  })
);

// Invoice / receipt PDF
router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const inv = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { items: true, payments: true, patient: true },
    });
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    const clinic = (await prisma.clinic.findFirst()) as unknown as ClinicHeader | null;
    const header: ClinicHeader = clinic || { name: 'My Clinic', address: '', phone: '', email: '' };
    const currency = (clinic as any)?.currency || 'USD';
    const money = (n: number) => `${currency} ${n.toFixed(2)}`;

    const doc = startDoc(res, `${inv.invoiceNo}.pdf`);
    let y = drawHeader(doc, header, `Invoice ${inv.invoiceNo}`);

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#64748b').text('Bill To', 50, y);
    doc.font('Helvetica').fontSize(11).fillColor('#0f172a').text(`${inv.patient.fullName} (${inv.patient.patientNo})`, 50, y + 12);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#64748b').text('Date', 420, y);
    doc.font('Helvetica').fontSize(11).fillColor('#0f172a').text(new Date(inv.createdAt).toLocaleDateString(), 420, y + 12);
    y += 44;

    // Table header
    doc.rect(50, y, 495, 20).fill('#f1f5f9');
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(10);
    doc.text('Description', 56, y + 5);
    doc.text('Qty', 360, y + 5);
    doc.text('Unit', 410, y + 5);
    doc.text('Amount', 480, y + 5);
    y += 24;

    doc.font('Helvetica').fontSize(10).fillColor('#0f172a');
    inv.items.forEach((it) => {
      doc.text(it.description, 56, y, { width: 290 });
      doc.text(String(it.quantity), 360, y);
      doc.text(it.unitPrice.toFixed(2), 410, y);
      doc.text(it.amount.toFixed(2), 480, y);
      y += 20;
    });

    y += 6;
    doc.moveTo(340, y).lineTo(545, y).strokeColor('#e2e8f0').stroke();
    y += 8;
    const rightLabel = (label: string, val: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#0f172a');
      doc.text(label, 360, y);
      doc.text(val, 470, y, { width: 75, align: 'right' });
      y += 16;
    };
    rightLabel('Subtotal', money(inv.subtotal));
    const discount =
      inv.discountType === 'percent' ? (inv.subtotal * inv.discountValue) / 100 : inv.discountValue;
    if (discount > 0) rightLabel(`Discount${inv.discountType === 'percent' ? ` (${inv.discountValue}%)` : ''}`, `-${money(discount)}`);
    if (inv.taxAmount > 0) rightLabel(`Tax (${inv.taxRate}%)`, money(inv.taxAmount));
    rightLabel('Total', money(inv.total), true);
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    rightLabel('Paid', money(paid));
    rightLabel('Balance', money(Math.max(0, inv.total - paid)), true);

    // Payments list
    if (inv.payments.length) {
      y += 16;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Payments', 50, y);
      y += 16;
      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      inv.payments.forEach((p) => {
        doc.text(
          `${new Date(p.createdAt).toLocaleDateString()}  -  ${p.method}${p.insurerName ? ` (${p.insurerName}${p.claimRef ? ' / ' + p.claimRef : ''})` : ''}  -  ${money(p.amount)}`,
          56,
          y
        );
        y += 14;
      });
    }

    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text('Thank you for choosing ' + header.name, 50, 780, { align: 'center', width: 495 });
    doc.end();
  })
);

export default router;
