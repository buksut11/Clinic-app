import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { Roles } from '../constants';
import { startDoc, drawHeader, ClinicHeader } from '../utils/pdf';

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  name: z.string().min(1),
  dosage: z.string().optional().nullable(),
  frequency: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
});

const rxSchema = z.object({
  patientId: z.string().min(1),
  consultationId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, 'Add at least one medicine'),
});

// Create a prescription
router.post(
  '/',
  requireRole(Roles.ADMIN, Roles.DOCTOR),
  validateBody(rxSchema),
  asyncHandler(async (req, res) => {
    let consultationId = req.body.consultationId || null;
    if (!consultationId && req.body.appointmentId) {
      const c = await prisma.consultation.findUnique({ where: { appointmentId: req.body.appointmentId } });
      consultationId = c?.id || null;
    }
    const rx = await prisma.prescription.create({
      data: {
        patientId: req.body.patientId,
        doctorId: req.user!.id,
        consultationId,
        notes: req.body.notes || null,
        items: { create: req.body.items.map((i: any) => ({ ...i })) },
      },
      include: { items: true },
    });
    await audit(req.user, 'CREATE', 'Prescription', rx.id, `${rx.items.length} item(s)`);
    res.status(201).json(rx);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rx = await prisma.prescription.findUnique({
      where: { id: req.params.id },
      include: { items: true, patient: true, doctor: true },
    });
    if (!rx) return res.status(404).json({ error: 'Prescription not found' });
    res.json(rx);
  })
);

// Printable PDF
router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const rx = await prisma.prescription.findUnique({
      where: { id: req.params.id },
      include: { items: true, patient: true, doctor: true },
    });
    if (!rx) return res.status(404).json({ error: 'Prescription not found' });
    const clinic = (await prisma.clinic.findFirst()) as unknown as ClinicHeader | null;
    const header: ClinicHeader = clinic || { name: 'My Clinic', address: '', phone: '', email: '' };

    const doc = startDoc(res, `prescription-${rx.id}.pdf`);
    let y = drawHeader(doc, header, 'Prescription (Rx)');

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#64748b').text('Patient', 50, y);
    doc.font('Helvetica').fontSize(11).fillColor('#0f172a').text(rx.patient.fullName + `  (${rx.patient.patientNo})`, 50, y + 12);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#64748b').text('Date', 400, y);
    doc.font('Helvetica').fontSize(11).fillColor('#0f172a').text(new Date(rx.createdAt).toLocaleDateString(), 400, y + 12);
    y += 44;

    doc.moveTo(50, y).lineTo(545, y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    y += 14;
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#0d9488').text('Rx', 50, y);
    y += 34;

    rx.items.forEach((it, idx) => {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(`${idx + 1}. ${it.name}`, 60, y);
      y += 16;
      const line = [
        it.dosage ? `Dosage: ${it.dosage}` : null,
        it.frequency ? `Frequency: ${it.frequency}` : null,
        it.duration ? `Duration: ${it.duration}` : null,
      ]
        .filter(Boolean)
        .join('   |   ');
      if (line) {
        doc.font('Helvetica').fontSize(10).fillColor('#475569').text(line, 72, y);
        y += 14;
      }
      if (it.instructions) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#475569').text(`Instructions: ${it.instructions}`, 72, y);
        y += 14;
      }
      y += 6;
    });

    if (rx.notes) {
      y += 10;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#64748b').text('Notes', 50, y);
      y += 12;
      doc.font('Helvetica').fontSize(10).fillColor('#0f172a').text(rx.notes, 50, y, { width: 495 });
    }

    // Signature
    const sigY = 720;
    doc.moveTo(360, sigY).lineTo(545, sigY).strokeColor('#94a3b8').lineWidth(1).stroke();
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#0f172a')
      .text(rx.doctor.signatureLine || `Dr. ${rx.doctor.name}`, 360, sigY + 6, { width: 185 });
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text('Doctor signature', 360, sigY + 22);

    doc.end();
  })
);

export default router;
