import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { Roles } from '../constants';

const router = Router();
router.use(requireAuth);

const vitalsSchema = z.object({
  weight: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  bpSystolic: z.number().int().nullable().optional(),
  bpDiastolic: z.number().int().nullable().optional(),
  temperature: z.number().nullable().optional(),
  pulse: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Nurses, doctors and admins can record vitals for a visit
router.put(
  '/appointment/:appointmentId',
  requireRole(Roles.ADMIN, Roles.NURSE, Roles.DOCTOR),
  validateBody(vitalsSchema),
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.findUnique({ where: { id: req.params.appointmentId } });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const data = {
      weight: req.body.weight ?? null,
      height: req.body.height ?? null,
      bpSystolic: req.body.bpSystolic ?? null,
      bpDiastolic: req.body.bpDiastolic ?? null,
      temperature: req.body.temperature ?? null,
      pulse: req.body.pulse ?? null,
      notes: req.body.notes ?? null,
    };
    const vitals = await prisma.vitals.upsert({
      where: { appointmentId: appt.id },
      update: { ...data, recordedById: req.user!.id },
      create: {
        appointmentId: appt.id,
        patientId: appt.patientId,
        recordedById: req.user!.id,
        ...data,
      },
    });
    await audit(req.user, 'UPDATE', 'Vitals', vitals.id, 'Recorded vitals');
    res.json(vitals);
  })
);

export default router;
