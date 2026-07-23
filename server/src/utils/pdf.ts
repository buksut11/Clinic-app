import PDFDocument from 'pdfkit';
import { Response } from 'express';
import fs from 'fs';
import path from 'path';

export interface ClinicHeader {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoPath?: string | null;
}

const ACCENT = '#0d9488'; // teal-600

export function startDoc(res: Response, filename: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

export function drawHeader(doc: PDFKit.PDFDocument, clinic: ClinicHeader, title: string) {
  const top = 50;
  // Logo
  if (clinic.logoPath) {
    const abs = path.join(process.cwd(), 'uploads', path.basename(clinic.logoPath));
    if (fs.existsSync(abs)) {
      try {
        doc.image(abs, 50, top, { fit: [70, 70] });
      } catch {
        /* ignore bad image */
      }
    }
  }
  doc
    .fillColor(ACCENT)
    .fontSize(20)
    .font('Helvetica-Bold')
    .text(clinic.name, 130, top);
  doc
    .fillColor('#334155')
    .fontSize(9)
    .font('Helvetica')
    .text(clinic.address || '', 130, top + 26)
    .text([clinic.phone, clinic.email].filter(Boolean).join('  ·  '), 130, top + 38);

  doc.moveTo(50, top + 78).lineTo(545, top + 78).strokeColor(ACCENT).lineWidth(2).stroke();

  doc
    .fillColor('#0f172a')
    .fontSize(15)
    .font('Helvetica-Bold')
    .text(title, 50, top + 92);
  doc.moveDown(1);
  doc.fillColor('#0f172a').font('Helvetica').fontSize(10);
  return top + 120;
}

export function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b').text(label, x, y);
  doc.font('Helvetica').fontSize(11).fillColor('#0f172a').text(value || '-', x, y + 12);
}
