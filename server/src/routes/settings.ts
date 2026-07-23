import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { Roles, ALL_ROLES } from '../constants';
import { upload } from '../utils/uploads';

const router = Router();
router.use(requireAuth);

// -------------------------------------------------------------------------
// Clinic profile
// -------------------------------------------------------------------------
router.get(
  '/clinic',
  asyncHandler(async (_req, res) => {
    let clinic = await prisma.clinic.findFirst();
    if (!clinic) clinic = await prisma.clinic.create({ data: { id: 1 } });
    res.json(clinic);
  })
);

const clinicSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  currency: z.string().min(1).default('USD'),
  taxRate: z.number().min(0).max(100).default(0),
});
router.put(
  '/clinic',
  requireRole(Roles.ADMIN),
  validateBody(clinicSchema),
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.upsert({
      where: { id: 1 },
      update: req.body,
      create: { id: 1, ...req.body },
    });
    await audit(req.user, 'UPDATE', 'Clinic', '1', 'Updated clinic profile');
    res.json(clinic);
  })
);

router.post(
  '/clinic/logo',
  requireRole(Roles.ADMIN),
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const clinic = await prisma.clinic.upsert({
      where: { id: 1 },
      update: { logoPath: req.file.filename },
      create: { id: 1, logoPath: req.file.filename },
    });
    await audit(req.user, 'UPDATE', 'Clinic', '1', 'Updated logo');
    res.json(clinic);
  })
);

// -------------------------------------------------------------------------
// Staff / users (Admin)
// -------------------------------------------------------------------------
router.get(
  '/users',
  requireRole(Roles.ADMIN),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, isActive: true,
        specialty: true, signatureLine: true, slotLength: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  })
);

// List doctors (needed by receptionists for booking) - limited fields
router.get(
  '/doctors',
  asyncHandler(async (_req, res) => {
    const docs = await prisma.user.findMany({
      where: { role: Roles.DOCTOR, isActive: true },
      select: { id: true, name: true, specialty: true, slotLength: true },
      orderBy: { name: 'asc' },
    });
    res.json(docs);
  })
);

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(ALL_ROLES as [string, ...string[]]),
  specialty: z.string().optional().nullable(),
  signatureLine: z.string().optional().nullable(),
  slotLength: z.number().int().min(5).max(120).default(20),
});
router.post(
  '/users',
  requireRole(Roles.ADMIN),
  validateBody(userSchema),
  asyncHandler(async (req, res) => {
    const exists = await prisma.user.findUnique({ where: { email: req.body.email.toLowerCase() } });
    if (exists) return res.status(409).json({ error: 'A user with that email already exists' });
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const user = await prisma.user.create({
      data: {
        name: req.body.name,
        email: req.body.email.toLowerCase(),
        passwordHash,
        role: req.body.role,
        specialty: req.body.specialty || null,
        signatureLine: req.body.signatureLine || null,
        slotLength: req.body.slotLength,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    await audit(req.user, 'CREATE', 'User', user.id, `Created ${user.role} ${user.name}`);
    res.status(201).json(user);
  })
);

const userUpdateSchema = z.object({
  name: z.string().min(1),
  role: z.enum(ALL_ROLES as [string, ...string[]]),
  specialty: z.string().optional().nullable(),
  signatureLine: z.string().optional().nullable(),
  slotLength: z.number().int().min(5).max(120).default(20),
  isActive: z.boolean().default(true),
});
router.put(
  '/users/:id',
  requireRole(Roles.ADMIN),
  validateBody(userUpdateSchema),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name,
        role: req.body.role,
        specialty: req.body.specialty || null,
        signatureLine: req.body.signatureLine || null,
        slotLength: req.body.slotLength,
        isActive: req.body.isActive,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    await audit(req.user, 'UPDATE', 'User', user.id, `Updated ${user.name}`);
    res.json(user);
  })
);

const resetPwSchema = z.object({ password: z.string().min(6) });
router.post(
  '/users/:id/reset-password',
  requireRole(Roles.ADMIN),
  validateBody(resetPwSchema),
  asyncHandler(async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
    await audit(req.user, 'UPDATE', 'User', req.params.id, 'Reset password');
    res.json({ success: true });
  })
);

// -------------------------------------------------------------------------
// Doctor schedules
// -------------------------------------------------------------------------
router.get(
  '/schedules/:doctorId',
  asyncHandler(async (req, res) => {
    const schedules = await prisma.doctorSchedule.findMany({
      where: { doctorId: req.params.doctorId },
      orderBy: { weekday: 'asc' },
    });
    res.json(schedules);
  })
);

const scheduleSchema = z.object({
  schedules: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
  ),
});
router.put(
  '/schedules/:doctorId',
  requireRole(Roles.ADMIN, Roles.DOCTOR),
  validateBody(scheduleSchema),
  asyncHandler(async (req, res) => {
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: req.params.doctorId } });
    await prisma.doctorSchedule.createMany({
      data: req.body.schedules.map((s: any) => ({ ...s, doctorId: req.params.doctorId })),
    });
    await audit(req.user, 'UPDATE', 'DoctorSchedule', req.params.doctorId, 'Updated working hours');
    const schedules = await prisma.doctorSchedule.findMany({ where: { doctorId: req.params.doctorId } });
    res.json(schedules);
  })
);

// -------------------------------------------------------------------------
// Price list
// -------------------------------------------------------------------------
router.get(
  '/prices',
  asyncHandler(async (_req, res) => {
    const prices = await prisma.priceItem.findMany({
      include: { doctor: { select: { name: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    res.json(prices);
  })
);

const priceSchema = z.object({
  type: z.enum(['consultation', 'procedure', 'labtest']),
  name: z.string().min(1),
  visitType: z.string().optional().nullable(),
  doctorId: z.string().optional().nullable(),
  price: z.number().min(0),
  isActive: z.boolean().default(true),
});
router.post(
  '/prices',
  requireRole(Roles.ADMIN),
  validateBody(priceSchema),
  asyncHandler(async (req, res) => {
    const p = await prisma.priceItem.create({
      data: {
        type: req.body.type,
        name: req.body.name,
        visitType: req.body.visitType || null,
        doctorId: req.body.doctorId || null,
        price: req.body.price,
        isActive: req.body.isActive,
      },
    });
    await audit(req.user, 'CREATE', 'PriceItem', p.id, `${p.name} = ${p.price}`);
    res.status(201).json(p);
  })
);
router.put(
  '/prices/:id',
  requireRole(Roles.ADMIN),
  validateBody(priceSchema),
  asyncHandler(async (req, res) => {
    const p = await prisma.priceItem.update({
      where: { id: req.params.id },
      data: {
        type: req.body.type,
        name: req.body.name,
        visitType: req.body.visitType || null,
        doctorId: req.body.doctorId || null,
        price: req.body.price,
        isActive: req.body.isActive,
      },
    });
    await audit(req.user, 'UPDATE', 'PriceItem', p.id, `${p.name} = ${p.price}`);
    res.json(p);
  })
);
router.delete(
  '/prices/:id',
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    await prisma.priceItem.delete({ where: { id: req.params.id } });
    await audit(req.user, 'DELETE', 'PriceItem', req.params.id);
    res.json({ success: true });
  })
);

// -------------------------------------------------------------------------
// Lab test catalog
// -------------------------------------------------------------------------
router.get(
  '/lab-tests',
  asyncHandler(async (_req, res) => {
    const tests = await prisma.labTest.findMany({ orderBy: { name: 'asc' } });
    res.json(tests);
  })
);

const labTestSchema = z.object({
  name: z.string().min(1),
  price: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
});
router.post(
  '/lab-tests',
  requireRole(Roles.ADMIN),
  validateBody(labTestSchema),
  asyncHandler(async (req, res) => {
    const exists = await prisma.labTest.findUnique({ where: { name: req.body.name } });
    if (exists) return res.status(409).json({ error: 'That test already exists' });
    const t = await prisma.labTest.create({ data: req.body });
    await audit(req.user, 'CREATE', 'LabTest', t.id, t.name);
    res.status(201).json(t);
  })
);
router.put(
  '/lab-tests/:id',
  requireRole(Roles.ADMIN),
  validateBody(labTestSchema),
  asyncHandler(async (req, res) => {
    const t = await prisma.labTest.update({ where: { id: req.params.id }, data: req.body });
    await audit(req.user, 'UPDATE', 'LabTest', t.id, t.name);
    res.json(t);
  })
);
router.delete(
  '/lab-tests/:id',
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    await prisma.labTest.delete({ where: { id: req.params.id } });
    await audit(req.user, 'DELETE', 'LabTest', req.params.id);
    res.json({ success: true });
  })
);

// -------------------------------------------------------------------------
// Audit log (Admin)
// -------------------------------------------------------------------------
router.get(
  '/audit',
  requireRole(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const take = Math.min(parseInt((req.query.take as string) || '200', 10), 500);
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take });
    res.json(logs);
  })
);

export default router;
