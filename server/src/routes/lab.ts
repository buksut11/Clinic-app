import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody, asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { Roles, ALL_LAB_STATUSES } from '../constants';
import { upload } from '../utils/uploads';

const router = Router();
router.use(requireAuth);

const orderSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional().nullable(),
  testName: z.string().min(1),
});

// Order a test (doctor/admin)
router.post(
  '/',
  requireRole(Roles.ADMIN, Roles.DOCTOR),
  validateBody(orderSchema),
  asyncHandler(async (req, res) => {
    const order = await prisma.labOrder.create({
      data: {
        patientId: req.body.patientId,
        appointmentId: req.body.appointmentId || null,
        doctorId: req.user!.id,
        testName: req.body.testName,
      },
    });
    await audit(req.user, 'CREATE', 'LabOrder', order.id, `Ordered ${order.testName}`);
    res.status(201).json(order);
  })
);

// List orders (optionally by status)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.patientId) where.patientId = req.query.patientId;
    const orders = await prisma.labOrder.findMany({
      where,
      include: { patient: { select: { fullName: true, patientNo: true } }, doctor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  })
);

// Update status
const statusSchema = z.object({ status: z.enum(ALL_LAB_STATUSES as [string, ...string[]]) });
router.put(
  '/:id/status',
  requireRole(Roles.ADMIN, Roles.DOCTOR, Roles.NURSE),
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    const order = await prisma.labOrder.update({ where: { id: req.params.id }, data: { status: req.body.status } });
    await audit(req.user, 'UPDATE', 'LabOrder', order.id, `Status → ${req.body.status}`);
    res.json(order);
  })
);

// Enter text/numeric result
const resultSchema = z.object({ resultText: z.string().min(1) });
router.put(
  '/:id/result',
  requireRole(Roles.ADMIN, Roles.DOCTOR, Roles.NURSE),
  validateBody(resultSchema),
  asyncHandler(async (req, res) => {
    const order = await prisma.labOrder.update({
      where: { id: req.params.id },
      data: { resultText: req.body.resultText, status: 'RESULT_READY' },
    });
    await audit(req.user, 'UPDATE', 'LabOrder', order.id, 'Entered result');
    res.json(order);
  })
);

// Upload a result PDF/image
router.post(
  '/:id/result-file',
  requireRole(Roles.ADMIN, Roles.DOCTOR, Roles.NURSE),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const order = await prisma.labOrder.update({
      where: { id: req.params.id },
      data: { resultFilePath: req.file.filename, status: 'RESULT_READY' },
    });
    await audit(req.user, 'UPDATE', 'LabOrder', order.id, 'Uploaded result file');
    res.json(order);
  })
);

export default router;
