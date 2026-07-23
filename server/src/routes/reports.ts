import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/validate';
import { Roles } from '../constants';

const router = Router();
router.use(requireAuth);

function dayBounds(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
function monthBounds(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start, end };
}

// Admin dashboard summary
router.get(
  '/dashboard',
  requireRole(Roles.ADMIN, Roles.DOCTOR, Roles.RECEPTIONIST, Roles.NURSE, Roles.PHARMACIST),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const { start: dStart, end: dEnd } = dayBounds(now);
    const { start: mStart, end: mEnd } = monthBounds(now);

    const [todaysAppointments, monthAppointments, newPatientsMonth] = await Promise.all([
      prisma.appointment.count({ where: { isDeleted: false, date: { gte: dStart, lt: dEnd } } }),
      prisma.appointment.findMany({ where: { isDeleted: false, date: { gte: mStart, lt: mEnd } } }),
      prisma.patient.count({ where: { createdAt: { gte: mStart, lt: mEnd }, isArchived: false } }),
    ]);

    const paymentsToday = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: dStart, lt: dEnd } },
    });
    const paymentsMonth = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: mStart, lt: mEnd } },
    });

    const totalMonthAppts = monthAppointments.length;
    const noShows = monthAppointments.filter((a) => a.status === 'NO_SHOW').length;
    const noShowRate = totalMonthAppts ? Math.round((noShows / totalMonthAppts) * 100) : 0;

    const outstanding = await prisma.invoice.findMany({
      where: { isDeleted: false, status: { in: ['UNPAID', 'PARTIAL'] } },
      include: { payments: true },
    });
    const outstandingTotal = outstanding.reduce((s, inv) => {
      const paid = inv.payments.reduce((x, p) => x + p.amount, 0);
      return s + Math.max(0, inv.total - paid);
    }, 0);

    res.json({
      todaysAppointments,
      revenueToday: paymentsToday._sum.amount || 0,
      revenueMonth: paymentsMonth._sum.amount || 0,
      newPatientsMonth,
      noShowRate,
      outstandingTotal,
    });
  })
);

// Revenue by doctor / by service, appointment volume, top diagnoses, outstanding balances
router.get(
  '/',
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().getFullYear(), 0, 1);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    to.setHours(23, 59, 59, 999);

    // Revenue by doctor: link payments -> invoice -> appointment -> doctor
    const payments = await prisma.payment.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { invoice: { include: { appointment: { include: { doctor: true } }, items: true } } },
    });
    const byDoctor: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    let totalRevenue = 0;
    for (const p of payments) {
      totalRevenue += p.amount;
      byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
      const docName = p.invoice.appointment?.doctor?.name || 'Unassigned';
      byDoctor[docName] = (byDoctor[docName] || 0) + p.amount;
    }

    // Revenue by service (invoice item descriptions on paid/partial invoices in range)
    const invoices = await prisma.invoice.findMany({
      where: { isDeleted: false, createdAt: { gte: from, lte: to } },
      include: { items: true, payments: true },
    });
    const byService: Record<string, number> = {};
    for (const inv of invoices) {
      for (const it of inv.items) {
        const key = it.description.split(' - ')[0].split(':')[0].trim();
        byService[key] = (byService[key] || 0) + it.amount;
      }
    }

    // Appointment volume
    const appts = await prisma.appointment.findMany({
      where: { isDeleted: false, date: { gte: from, lte: to } },
      include: { consultation: true },
    });
    const volumeByStatus: Record<string, number> = {};
    const diagnoses: Record<string, number> = {};
    for (const a of appts) {
      volumeByStatus[a.status] = (volumeByStatus[a.status] || 0) + 1;
      const dx = a.consultation?.diagnosis?.trim();
      if (dx) diagnoses[dx] = (diagnoses[dx] || 0) + 1;
    }
    const topDiagnoses = Object.entries(diagnoses)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([diagnosis, count]) => ({ diagnosis, count }));

    // Outstanding balances by patient
    const outstandingInvoices = await prisma.invoice.findMany({
      where: { isDeleted: false, status: { in: ['UNPAID', 'PARTIAL'] } },
      include: { payments: true, patient: { select: { fullName: true, patientNo: true } } },
    });
    const outstanding = outstandingInvoices
      .map((inv) => {
        const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
        return {
          invoiceNo: inv.invoiceNo,
          patient: inv.patient.fullName,
          patientNo: inv.patient.patientNo,
          total: inv.total,
          paid,
          balance: Math.max(0, inv.total - paid),
        };
      })
      .filter((x) => x.balance > 0);

    res.json({
      from,
      to,
      totalRevenue,
      revenueByDoctor: Object.entries(byDoctor).map(([name, amount]) => ({ name, amount })),
      revenueByService: Object.entries(byService).map(([name, amount]) => ({ name, amount })),
      revenueByMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })),
      appointmentVolume: Object.entries(volumeByStatus).map(([status, count]) => ({ status, count })),
      topDiagnoses,
      outstanding,
    });
  })
);

// Daily cash report: totals per payment method for a given day
router.get(
  '/daily-cash',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST),
  asyncHandler(async (req, res) => {
    const day = req.query.date ? new Date(req.query.date as string) : new Date();
    const { start, end } = dayBounds(day);
    const payments = await prisma.payment.findMany({
      where: { createdAt: { gte: start, lt: end } },
      include: { invoice: { select: { invoiceNo: true, patient: { select: { fullName: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    const byMethod: Record<string, number> = {};
    let total = 0;
    for (const p of payments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
      total += p.amount;
    }
    res.json({
      date: start,
      total,
      byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })),
      payments: payments.map((p) => ({
        time: p.createdAt,
        invoiceNo: p.invoice.invoiceNo,
        patient: p.invoice.patient.fullName,
        method: p.method,
        amount: p.amount,
      })),
    });
  })
);

export default router;
