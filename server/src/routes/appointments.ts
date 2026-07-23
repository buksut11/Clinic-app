import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { Roles, ALL_APPT_STATUSES } from '../constants';

const router = Router();
router.use(requireAuth);

function dayBounds(dateStr: string) {
  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// "Log" reminder stub — real SMS/email can be wired here later.
function logReminder(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[REMINDER STUB] ${msg}`);
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Verify a requested time falls on a working day and within working hours for the
// doctor. Returns an error string, or null when the slot is valid.
async function checkAgainstSchedule(
  doctorId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<string | null> {
  const weekday = new Date(date).getDay(); // 0=Sun..6=Sat
  const schedule = await prisma.doctorSchedule.findUnique({
    where: { doctorId_weekday: { doctorId, weekday } },
  });
  if (!schedule) return 'The doctor does not work on that day';
  if (toMin(startTime) < toMin(schedule.startTime) || toMin(endTime) > toMin(schedule.endTime)) {
    return `Outside the doctor's working hours (${schedule.startTime}–${schedule.endTime})`;
  }
  return null;
}

const apptSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  date: z.string().min(1), // ISO date
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().optional().nullable(),
  visitType: z.enum(['new', 'follow-up']).default('new'),
});

// List appointments in a date range, optionally filtered by doctor
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to, doctorId } = req.query as Record<string, string>;
    const where: any = { isDeleted: false };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    if (doctorId) where.doctorId = doctorId;
    // Doctors default to only their own appointments
    if (req.user!.role === Roles.DOCTOR && !doctorId) where.doctorId = req.user!.id;

    const appts = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, fullName: true, patientNo: true, phone: true } },
        doctor: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    res.json(appts);
  })
);

// Today's queue
router.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const { start, end } = dayBounds(new Date().toISOString());
    const where: any = {
      isDeleted: false,
      date: { gte: start, lt: end },
      status: { in: ['SCHEDULED', 'CHECKED_IN', 'IN_CONSULTATION'] },
    };
    if (req.user!.role === Roles.DOCTOR) where.doctorId = req.user!.id;
    const appts = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, fullName: true, patientNo: true, allergies: true } },
        doctor: { select: { id: true, name: true } },
        vitals: true,
      },
      orderBy: [{ startTime: 'asc' }],
    });
    res.json(appts);
  })
);

// Available slots for a doctor on a given date (respects working hours + slot length,
// excludes already-booked slots and past times for today).
router.get(
  '/available-slots',
  asyncHandler(async (req, res) => {
    const { doctorId, date } = req.query as Record<string, string>;
    if (!doctorId || !date) return res.status(400).json({ error: 'doctorId and date are required' });

    const doctor = await prisma.user.findUnique({ where: { id: doctorId } });
    if (!doctor || doctor.role !== Roles.DOCTOR) return res.status(404).json({ error: 'Doctor not found' });
    const slotLen = doctor.slotLength || 20;

    const weekday = new Date(date).getDay();
    const schedule = await prisma.doctorSchedule.findUnique({ where: { doctorId_weekday: { doctorId, weekday } } });
    if (!schedule) return res.json({ working: false, slots: [] });

    const { start, end } = dayBounds(date);
    const booked = await prisma.appointment.findMany({
      where: { doctorId, isDeleted: false, status: { notIn: ['CANCELLED', 'NO_SHOW'] }, date: { gte: start, lt: end } },
    });

    // Don't offer times already in the past when the date is today.
    const now = new Date();
    const isToday = start.toDateString() === now.toDateString();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const slots: string[] = [];
    for (let t = toMin(schedule.startTime); t + slotLen <= toMin(schedule.endTime); t += slotLen) {
      const s = toHHMM(t);
      const e = toHHMM(t + slotLen);
      const clash = booked.some((a) => s < a.endTime && e > a.startTime);
      const past = isToday && t < nowMin;
      if (!clash && !past) slots.push(s);
    }
    res.json({ working: true, slotLength: slotLen, workingHours: { start: schedule.startTime, end: schedule.endTime }, slots });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: {
        patient: true,
        doctor: { select: { id: true, name: true, signatureLine: true } },
        consultation: { include: { edits: true } },
        vitals: true,
        invoice: true,
        labOrders: true,
      },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    res.json(appt);
  })
);

// Book appointment
router.post(
  '/',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST, Roles.DOCTOR),
  validateBody(apptSchema),
  asyncHandler(async (req, res) => {
    const { patientId, doctorId, date, startTime, endTime, reason, visitType } = req.body;
    const { start, end } = dayBounds(date);

    if (toMin(endTime) <= toMin(startTime)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    // Respect the doctor's configured working days and hours
    const scheduleError = await checkAgainstSchedule(doctorId, date, startTime, endTime);
    if (scheduleError) return res.status(422).json({ error: scheduleError });

    // Prevent double-booking: any active appointment for this doctor overlapping the slot
    const sameDay = await prisma.appointment.findMany({
      where: {
        doctorId,
        isDeleted: false,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        date: { gte: start, lt: end },
      },
    });
    const clash = sameDay.some((a) => startTime < a.endTime && endTime > a.startTime);
    if (clash) {
      return res.status(409).json({ error: 'That time slot is already booked for this doctor' });
    }

    const appt = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        date: start,
        startTime,
        endTime,
        reason: reason || null,
        visitType,
        createdById: req.user!.id,
      },
      include: { patient: { select: { fullName: true } }, doctor: { select: { name: true } } },
    });
    logReminder(
      `Appointment for ${appt.patient.fullName} with ${appt.doctor.name} on ${start.toDateString()} at ${startTime}.`
    );
    await audit(req.user, 'CREATE', 'Appointment', appt.id, `Booked for ${appt.patient.fullName}`);
    res.status(201).json(appt);
  })
);

// Reschedule
const rescheduleSchema = z.object({
  date: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  doctorId: z.string().optional(),
});
router.put(
  '/:id/reschedule',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST, Roles.DOCTOR),
  validateBody(rescheduleSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });
    const doctorId = req.body.doctorId || existing.doctorId;
    const { start, end } = dayBounds(req.body.date);
    if (toMin(req.body.endTime) <= toMin(req.body.startTime)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    const scheduleError = await checkAgainstSchedule(doctorId, req.body.date, req.body.startTime, req.body.endTime);
    if (scheduleError) return res.status(422).json({ error: scheduleError });
    const sameDay = await prisma.appointment.findMany({
      where: {
        doctorId,
        isDeleted: false,
        id: { not: existing.id },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        date: { gte: start, lt: end },
      },
    });
    const clash = sameDay.some((a) => req.body.startTime < a.endTime && req.body.endTime > a.startTime);
    if (clash) return res.status(409).json({ error: 'That time slot is already booked for this doctor' });

    const appt = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { date: start, startTime: req.body.startTime, endTime: req.body.endTime, doctorId },
    });
    await audit(req.user, 'UPDATE', 'Appointment', appt.id, 'Rescheduled');
    res.json(appt);
  })
);

// Change status (check-in, start consult, complete, no-show)
const statusSchema = z.object({ status: z.enum(ALL_APPT_STATUSES as [string, ...string[]]) });
router.put(
  '/:id/status',
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    });
    await audit(req.user, 'UPDATE', 'Appointment', appt.id, `Status → ${req.body.status}`);
    res.json(appt);
  })
);

// Cancel with reason
const cancelSchema = z.object({ reason: z.string().min(1, 'A reason is required') });
router.put(
  '/:id/cancel',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST, Roles.DOCTOR),
  validateBody(cancelSchema),
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', cancelReason: req.body.reason },
    });
    await audit(req.user, 'UPDATE', 'Appointment', appt.id, `Cancelled: ${req.body.reason}`);
    res.json(appt);
  })
);

export default router;
