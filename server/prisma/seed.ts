import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FIRST = ['Ahmed', 'Sara', 'John', 'Maria', 'Omar', 'Fatima', 'David', 'Aisha', 'Michael', 'Layla', 'James', 'Noor', 'Robert', 'Huda', 'William', 'Zainab', 'Daniel', 'Mona', 'Joseph', 'Rania'];
const LAST = ['Khan', 'Smith', 'Garcia', 'Hassan', 'Johnson', 'Ali', 'Brown', 'Ahmed', 'Jones', 'Farah', 'Miller', 'Saleh', 'Davis', 'Nasser', 'Wilson', 'Ibrahim', 'Moore', 'Yousef', 'Taylor', 'Karim'];
const GENDERS = ['Male', 'Female'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const ALLERGIES = ['None', 'Penicillin', 'Peanuts', 'Aspirin', 'None', 'Latex', 'None'];
const CHRONIC = ['None', 'Hypertension', 'Diabetes Type 2', 'Asthma', 'None', 'None', 'Hypothyroidism'];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pad(n: number, w = 5) {
  return String(n).padStart(w, '0');
}
function hhmm(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function main() {
  console.log('🌱 Seeding database...');

  // Wipe (dev only) — order matters for FKs
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.prescriptionItem.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.labOrder.deleteMany();
  await prisma.consultationEdit.deleteMany();
  await prisma.consultation.deleteMany();
  await prisma.vitals.deleteMany();
  await prisma.document.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctorSchedule.deleteMany();
  await prisma.priceItem.deleteMany();
  await prisma.labTest.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();
  await prisma.clinic.deleteMany();

  // Clinic
  await prisma.clinic.create({
    data: {
      id: 1,
      name: 'Riverside Medical Clinic',
      address: '123 Health Street, Wellness City',
      phone: '+1 (555) 010-2030',
      email: 'reception@riverside-clinic.example',
      currency: 'USD',
      taxRate: 5,
    },
  });

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  // Users
  const admin = await prisma.user.create({
    data: { name: 'Alice Admin', email: 'admin@clinic.com', passwordHash: hash('admin123'), role: 'ADMIN' },
  });
  const drSmith = await prisma.user.create({
    data: {
      name: 'John Smith', email: 'dr.smith@clinic.com', passwordHash: hash('doctor123'),
      role: 'DOCTOR', specialty: 'General Practice', signatureLine: 'Dr. John Smith, MD', slotLength: 20,
    },
  });
  const drJones = await prisma.user.create({
    data: {
      name: 'Emily Jones', email: 'dr.jones@clinic.com', passwordHash: hash('doctor123'),
      role: 'DOCTOR', specialty: 'Pediatrics', signatureLine: 'Dr. Emily Jones, MD', slotLength: 30,
    },
  });
  const reception = await prisma.user.create({
    data: { name: 'Rachel Reception', email: 'reception@clinic.com', passwordHash: hash('reception123'), role: 'RECEPTIONIST' },
  });
  const nurse = await prisma.user.create({
    data: { name: 'Nancy Nurse', email: 'nurse@clinic.com', passwordHash: hash('nurse123'), role: 'NURSE' },
  });

  const doctors = [drSmith, drJones];

  // Doctor schedules: Mon-Fri (weekday 1..5)
  for (const doc of doctors) {
    for (let wd = 1; wd <= 5; wd++) {
      await prisma.doctorSchedule.create({
        data: { doctorId: doc.id, weekday: wd, startTime: '09:00', endTime: '17:00' },
      });
    }
  }

  // Lab test catalog
  const labTests = [
    { name: 'Complete Blood Count (CBC)', price: 25 },
    { name: 'Blood Glucose', price: 15 },
    { name: 'Lipid Panel', price: 40 },
    { name: 'Thyroid Panel (TSH)', price: 45 },
    { name: 'Urinalysis', price: 20 },
    { name: 'Liver Function Test', price: 50 },
  ];
  for (const t of labTests) await prisma.labTest.create({ data: t });

  // Price list
  await prisma.priceItem.create({ data: { type: 'consultation', name: 'General Consultation', visitType: 'new', doctorId: drSmith.id, price: 60 } });
  await prisma.priceItem.create({ data: { type: 'consultation', name: 'Follow-up Consultation', visitType: 'follow-up', doctorId: drSmith.id, price: 40 } });
  await prisma.priceItem.create({ data: { type: 'consultation', name: 'Pediatric Consultation', visitType: 'new', doctorId: drJones.id, price: 70 } });
  await prisma.priceItem.create({ data: { type: 'consultation', name: 'Pediatric Follow-up', visitType: 'follow-up', doctorId: drJones.id, price: 50 } });
  await prisma.priceItem.create({ data: { type: 'consultation', name: 'General Consultation', price: 50 } });
  await prisma.priceItem.create({ data: { type: 'procedure', name: 'Wound Dressing', price: 30 } });
  await prisma.priceItem.create({ data: { type: 'procedure', name: 'ECG', price: 55 } });
  await prisma.priceItem.create({ data: { type: 'procedure', name: 'Nebulization', price: 25 } });
  for (const t of labTests) {
    await prisma.priceItem.create({ data: { type: 'labtest', name: t.name, price: t.price } });
  }

  // 20 patients
  const year = new Date().getFullYear();
  const patients = [];
  for (let i = 0; i < 20; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 3) % LAST.length];
    const age = 5 + Math.floor(Math.random() * 70);
    const dob = new Date(year - age, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));
    const p = await prisma.patient.create({
      data: {
        patientNo: `P-${year}-${pad(i + 1)}`,
        fullName: `${first} ${last}`,
        dob,
        gender: rand(GENDERS),
        phone: `+1 (555) ${pad(1000 + i, 4)}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
        address: `${10 + i} Main Street, Wellness City`,
        nationalId: `ID${pad(100000 + i * 7, 6)}`,
        insuranceNo: i % 3 === 0 ? `INS-${pad(2000 + i, 5)}` : null,
        emergencyContact: `Family member: +1 (555) ${pad(9000 + i, 4)}`,
        allergies: rand(ALLERGIES),
        chronicConditions: rand(CHRONIC),
        bloodType: rand(BLOOD),
        createdById: reception.id,
      },
    });
    patients.push(p);
  }

  // Appointments this week (Mon-Fri around today)
  const today = new Date();
  const monday = new Date(today);
  const dow = today.getDay(); // 0 Sun ..6 Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  monday.setDate(today.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);

  const reasons = ['Fever and cough', 'Routine check-up', 'Follow-up visit', 'Headache', 'Back pain', 'Skin rash', 'Blood pressure review', 'Child vaccination'];
  let apptCount = 0;
  for (let d = 0; d < 5; d++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + d);
    for (const doc of doctors) {
      const slot = doc.slotLength;
      let mins = 9 * 60; // 09:00
      const nAppts = 3 + Math.floor(Math.random() * 3);
      for (let a = 0; a < nAppts; a++) {
        const patient = rand(patients);
        const startH = Math.floor(mins / 60);
        const startM = mins % 60;
        const endMins = mins + slot;
        const start = hhmm(startH, startM);
        const end = hhmm(Math.floor(endMins / 60), endMins % 60);
        mins = endMins + slot; // leave a gap

        // Status: past days completed, today mixed, future scheduled
        const dayDate = new Date(day);
        let status = 'SCHEDULED';
        const isPast = dayDate < new Date(new Date().setHours(0, 0, 0, 0));
        const isToday = dayDate.getTime() === new Date(new Date().setHours(0, 0, 0, 0)).getTime();
        if (isPast) status = Math.random() < 0.15 ? 'NO_SHOW' : 'COMPLETED';
        else if (isToday) status = rand(['SCHEDULED', 'CHECKED_IN', 'COMPLETED', 'SCHEDULED']);

        const appt = await prisma.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: doc.id,
            date: day,
            startTime: start,
            endTime: end,
            reason: rand(reasons),
            visitType: Math.random() < 0.5 ? 'new' : 'follow-up',
            status,
            createdById: reception.id,
          },
        });
        apptCount++;

        // For completed appointments, add vitals + consultation + maybe invoice
        if (status === 'COMPLETED') {
          await prisma.vitals.create({
            data: {
              appointmentId: appt.id,
              patientId: patient.id,
              weight: 50 + Math.floor(Math.random() * 45),
              height: 150 + Math.floor(Math.random() * 40),
              bpSystolic: 110 + Math.floor(Math.random() * 30),
              bpDiastolic: 70 + Math.floor(Math.random() * 20),
              temperature: 36.4 + Math.random() * 1.5,
              pulse: 65 + Math.floor(Math.random() * 25),
              recordedById: nurse.id,
            },
          });
          const diagnoses = ['Upper respiratory infection', 'Hypertension', 'Type 2 Diabetes', 'Migraine', 'Gastritis', 'Seasonal allergy'];
          const dx = rand(diagnoses);
          const consult = await prisma.consultation.create({
            data: {
              appointmentId: appt.id,
              patientId: patient.id,
              doctorId: doc.id,
              chiefComplaint: appt.reason,
              symptoms: 'As reported by patient.',
              examinationNotes: 'Vitals stable. Examination unremarkable.',
              diagnosis: dx,
              treatmentPlan: 'Prescribed medication and rest. Follow up if symptoms persist.',
            },
          });

          // Prescription
          if (Math.random() < 0.7) {
            await prisma.prescription.create({
              data: {
                patientId: patient.id,
                doctorId: doc.id,
                consultationId: consult.id,
                items: {
                  create: [
                    { name: 'Paracetamol 500mg', dosage: '1 tablet', frequency: '3x daily', duration: '5 days', instructions: 'After meals' },
                    { name: 'Amoxicillin 500mg', dosage: '1 capsule', frequency: '2x daily', duration: '7 days', instructions: 'Complete the full course' },
                  ],
                },
              },
            });
          }

          // Invoice (some paid, some partial/unpaid)
          const consultPrice = doc.id === drSmith.id ? 60 : 70;
          const invYear = new Date().getFullYear();
          const invCount = await prisma.invoice.count();
          const subtotal = consultPrice;
          const taxAmount = Math.round(subtotal * 0.05 * 100) / 100;
          const total = subtotal + taxAmount;
          const inv = await prisma.invoice.create({
            data: {
              invoiceNo: `INV-${invYear}-${pad(invCount + 1)}`,
              patientId: patient.id,
              appointmentId: appt.id,
              subtotal,
              taxRate: 5,
              taxAmount,
              total,
              createdById: reception.id,
              items: {
                create: [{ description: `Consultation (${appt.visitType}) - ${doc.name}`, quantity: 1, unitPrice: consultPrice, amount: consultPrice }],
              },
            },
          });
          const r = Math.random();
          if (r < 0.6) {
            await prisma.payment.create({ data: { invoiceId: inv.id, amount: total, method: rand(['cash', 'card', 'insurance']), createdById: reception.id } });
            await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'PAID' } });
          } else if (r < 0.8) {
            await prisma.payment.create({ data: { invoiceId: inv.id, amount: Math.round(total / 2), method: 'cash', createdById: reception.id } });
            await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'PARTIAL' } });
          }
        }
      }
    }
  }

  // A few lab orders
  for (let i = 0; i < 6; i++) {
    const patient = rand(patients);
    await prisma.labOrder.create({
      data: {
        patientId: patient.id,
        doctorId: rand(doctors).id,
        testName: rand(labTests).name,
        status: rand(['ORDERED', 'SAMPLE_COLLECTED', 'RESULT_READY']),
        resultText: i % 3 === 0 ? 'Within normal range.' : null,
      },
    });
  }

  await prisma.auditLog.create({ data: { userId: admin.id, userName: admin.name, action: 'SEED', details: 'Database seeded with demo data' } });

  console.log(`✅ Seed complete: ${patients.length} patients, ${apptCount} appointments.`);
  console.log('\n🔐 Demo logins:');
  console.log('   Admin:        admin@clinic.com / admin123');
  console.log('   Doctor:       dr.smith@clinic.com / doctor123');
  console.log('   Doctor:       dr.jones@clinic.com / doctor123');
  console.log('   Receptionist: reception@clinic.com / reception123');
  console.log('   Nurse:        nurse@clinic.com / nurse123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
