import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { Roles } from '../constants';

const router = Router();
router.use(requireAuth);

// Generate the next patient number like P-2026-00001
async function nextPatientNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `P-${year}-`;
  const last = await prisma.patient.findFirst({
    where: { patientNo: { startsWith: prefix } },
    orderBy: { patientNo: 'desc' },
  });
  let seq = 1;
  if (last) {
    const n = parseInt(last.patientNo.slice(prefix.length), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return prefix + String(seq).padStart(5, '0');
}

const patientSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  dob: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  insuranceNo: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  chronicConditions: z.string().optional().nullable(),
  bloodType: z.string().optional().nullable(),
});

function toData(body: z.infer<typeof patientSchema>) {
  return {
    fullName: body.fullName,
    dob: body.dob ? new Date(body.dob) : null,
    gender: body.gender || null,
    phone: body.phone || null,
    email: body.email || null,
    address: body.address || null,
    nationalId: body.nationalId || null,
    insuranceNo: body.insuranceNo || null,
    emergencyContact: body.emergencyContact || null,
    allergies: body.allergies || null,
    chronicConditions: body.chronicConditions || null,
    bloodType: body.bloodType || null,
  };
}

// List / search patients (as-you-type)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) || '';
    const includeArchived = req.query.includeArchived === 'true';
    const where: any = {};
    if (!includeArchived) where.isArchived = false;
    if (q) {
      where.OR = [
        { fullName: { contains: q } },
        { phone: { contains: q } },
        { patientNo: { contains: q } },
        { nationalId: { contains: q } },
      ];
    }
    const patients = await prisma.patient.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(patients);
  })
);

// Get a single patient with full profile
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        appointments: {
          include: { doctor: { select: { id: true, name: true } }, consultation: true, vitals: true },
          orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        },
        prescriptions: {
          include: { items: true, doctor: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        labOrders: { orderBy: { createdAt: 'desc' } },
        invoices: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json(patient);
  })
);

// Register a patient (admin, receptionist)
router.post(
  '/',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST),
  validateBody(patientSchema),
  asyncHandler(async (req, res) => {
    const patientNo = await nextPatientNo();
    const patient = await prisma.patient.create({
      data: { ...toData(req.body), patientNo, createdById: req.user!.id },
    });
    await audit(req.user, 'CREATE', 'Patient', patient.id, `Registered ${patient.fullName} (${patient.patientNo})`);
    res.status(201).json(patient);
  })
);

// Edit a patient
router.put(
  '/:id',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST, Roles.NURSE),
  validateBody(patientSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.patient.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Patient not found' });
    const patient = await prisma.patient.update({
      where: { id: req.params.id },
      data: toData(req.body),
    });
    await audit(req.user, 'UPDATE', 'Patient', patient.id, `Edited ${patient.fullName}`);
    res.json(patient);
  })
);

// Archive (soft-delete) a patient
router.post(
  '/:id/archive',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST),
  asyncHandler(async (req, res) => {
    const patient = await prisma.patient.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });
    await audit(req.user, 'DELETE', 'Patient', patient.id, `Archived ${patient.fullName}`);
    res.json(patient);
  })
);

router.post(
  '/:id/restore',
  requireRole(Roles.ADMIN, Roles.RECEPTIONIST),
  asyncHandler(async (req, res) => {
    const patient = await prisma.patient.update({
      where: { id: req.params.id },
      data: { isArchived: false },
    });
    await audit(req.user, 'UPDATE', 'Patient', patient.id, `Restored ${patient.fullName}`);
    res.json(patient);
  })
);

export default router;
