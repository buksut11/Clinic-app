import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { Roles } from '../constants';

const router = Router();
router.use(requireAuth);

const consultSchema = z.object({
  chiefComplaint: z.string().optional().nullable(),
  symptoms: z.string().optional().nullable(),
  examinationNotes: z.string().optional().nullable(),
  diagnosis: z.string().optional().nullable(),
  icd10: z.string().optional().nullable(),
  treatmentPlan: z.string().optional().nullable(),
  followUpDate: z.string().optional().nullable(),
});

function toData(b: z.infer<typeof consultSchema>) {
  return {
    chiefComplaint: b.chiefComplaint || null,
    symptoms: b.symptoms || null,
    examinationNotes: b.examinationNotes || null,
    diagnosis: b.diagnosis || null,
    icd10: b.icd10 || null,
    treatmentPlan: b.treatmentPlan || null,
    followUpDate: b.followUpDate ? new Date(b.followUpDate) : null,
  };
}

// Create or update the consultation for an appointment (append-only edit history).
router.put(
  '/appointment/:appointmentId',
  requireRole(Roles.ADMIN, Roles.DOCTOR),
  validateBody(consultSchema),
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.appointmentId },
      include: { consultation: true },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    let consultation;
    if (appt.consultation) {
      // Snapshot the previous state before amending
      const prev = appt.consultation;
      await prisma.consultationEdit.create({
        data: {
          consultationId: prev.id,
          editedById: req.user!.id,
          editedByName: req.user!.name,
          snapshot: JSON.stringify({
            chiefComplaint: prev.chiefComplaint,
            symptoms: prev.symptoms,
            examinationNotes: prev.examinationNotes,
            diagnosis: prev.diagnosis,
            icd10: prev.icd10,
            treatmentPlan: prev.treatmentPlan,
            followUpDate: prev.followUpDate,
          }),
        },
      });
      consultation = await prisma.consultation.update({
        where: { id: prev.id },
        data: toData(req.body),
        include: { edits: { orderBy: { createdAt: 'desc' } } },
      });
      await audit(req.user, 'UPDATE', 'Consultation', consultation.id, 'Amended consultation note');
    } else {
      consultation = await prisma.consultation.create({
        data: {
          appointmentId: appt.id,
          patientId: appt.patientId,
          doctorId: req.user!.id,
          ...toData(req.body),
        },
        include: { edits: true },
      });
      // Move appointment forward if still checked-in
      if (appt.status === 'CHECKED_IN' || appt.status === 'SCHEDULED') {
        await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'IN_CONSULTATION' } });
      }
      await audit(req.user, 'CREATE', 'Consultation', consultation.id, 'Recorded consultation');
    }
    res.json(consultation);
  })
);

// Mark consultation complete (completes the appointment too)
router.post(
  '/appointment/:appointmentId/complete',
  requireRole(Roles.ADMIN, Roles.DOCTOR),
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.update({
      where: { id: req.params.appointmentId },
      data: { status: 'COMPLETED' },
    });
    await audit(req.user, 'UPDATE', 'Appointment', appt.id, 'Consultation completed');
    res.json(appt);
  })
);

export default router;
