import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/validate';
import { audit } from '../utils/audit';
import { upload, UPLOAD_DIR } from '../utils/uploads';

const router = Router();
router.use(requireAuth);

// Upload a document to a patient profile
router.post(
  '/patient/:patientId',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const doc = await prisma.document.create({
      data: {
        patientId: req.params.patientId,
        filename: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedById: req.user!.id,
      },
    });
    await audit(req.user, 'CREATE', 'Document', doc.id, `Uploaded ${doc.filename}`);
    res.status(201).json(doc);
  })
);

// Download / view a stored file (documents or lab results)
router.get(
  '/file/:storedName',
  asyncHandler(async (req, res) => {
    const safe = path.basename(req.params.storedName);
    const abs = path.join(UPLOAD_DIR, safe);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not found' });
    res.sendFile(abs);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await prisma.document.delete({ where: { id: doc.id } });
    const abs = path.join(UPLOAD_DIR, doc.storedName);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    await audit(req.user, 'DELETE', 'Document', doc.id, `Deleted ${doc.filename}`);
    res.json({ success: true });
  })
);

export default router;
