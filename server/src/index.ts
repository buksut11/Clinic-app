import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import appointmentRoutes from './routes/appointments';
import consultationRoutes from './routes/consultations';
import vitalsRoutes from './routes/vitals';
import prescriptionRoutes from './routes/prescriptions';
import labRoutes from './routes/lab';
import documentRoutes from './routes/documents';
import invoiceRoutes from './routes/invoices';
import reportRoutes from './routes/reports';
import settingsRoutes from './routes/settings';
import pharmacyRoutes from './routes/pharmacy';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Security headers. crossOriginResourcePolicy is relaxed so the SPA on :5173 can
// load uploaded images/files served from this origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: [CLIENT_ORIGIN, 'http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json({ limit: '2mb' }));

// Throttle login attempts to blunt brute-force / credential-stuffing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
});
app.use('/api/auth/login', loginLimiter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/vitals', vitalsRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/pharmacy', pharmacyRoutes);

// 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---------------------------------------------------------------------------
// Single-port mode: if the React app has been built, serve it from this same
// server so the whole app runs at http://localhost:<PORT> — no second process,
// no CORS, no proxy. (In dev you instead run Vite on :5173.)
// Resolves to <repo>/client/dist whether running via tsx (src) or compiled (dist).
// ---------------------------------------------------------------------------
const clientDist = path.resolve(__dirname, '../../client/dist');
const hasClientBuild = fs.existsSync(path.join(clientDist, 'index.html'));

if (hasClientBuild) {
  app.use(express.static(clientDist));
  // SPA fallback: send index.html for any non-API GET so client-side routes work.
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Central error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  if (err?.message?.includes('Only PDF and image')) {
    return res.status(400).json({ error: err.message });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large (max 15 MB)' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  if (hasClientBuild) {
    console.log(`✅ Clinic app running on http://localhost:${PORT}  (UI + API on one port)`);
  } else {
    console.log(`✅ Clinic API running on http://localhost:${PORT}  (run the client with: cd client && npm run dev)`);
  }
});
