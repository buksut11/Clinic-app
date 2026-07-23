export type Role = 'ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'NURSE' | 'PHARMACIST';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive?: boolean;
  specialty?: string | null;
  signatureLine?: string | null;
  slotLength?: number;
}

export interface Patient {
  id: string;
  patientNo: string;
  fullName: string;
  dob?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  nationalId?: string | null;
  insuranceNo?: string | null;
  emergencyContact?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  bloodType?: string | null;
  isArchived?: boolean;
  createdAt?: string;
  appointments?: Appointment[];
  prescriptions?: Prescription[];
  labOrders?: LabOrder[];
  invoices?: Invoice[];
  documents?: PatientDocument[];
}

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CHECKED_IN'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED';

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  visitType: string;
  status: AppointmentStatus;
  cancelReason?: string | null;
  patient?: Patient;
  doctor?: User;
  consultation?: Consultation | null;
  vitals?: Vitals | null;
  invoice?: Invoice | null;
  labOrders?: LabOrder[];
}

export interface Consultation {
  id: string;
  appointmentId: string;
  chiefComplaint?: string | null;
  symptoms?: string | null;
  examinationNotes?: string | null;
  diagnosis?: string | null;
  icd10?: string | null;
  treatmentPlan?: string | null;
  followUpDate?: string | null;
  createdAt: string;
  updatedAt: string;
  edits?: ConsultationEdit[];
}

export interface ConsultationEdit {
  id: string;
  editedByName: string;
  snapshot: string;
  createdAt: string;
}

export interface Vitals {
  id: string;
  weight?: number | null;
  height?: number | null;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  temperature?: number | null;
  pulse?: number | null;
  notes?: string | null;
}

export interface PrescriptionItem {
  id?: string;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
}

export interface Prescription {
  id: string;
  createdAt: string;
  notes?: string | null;
  items: PrescriptionItem[];
  doctor?: { name: string };
}

export type LabStatus = 'ORDERED' | 'SAMPLE_COLLECTED' | 'RESULT_READY';

export interface LabOrder {
  id: string;
  testName: string;
  status: LabStatus;
  resultText?: string | null;
  resultFilePath?: string | null;
  createdAt: string;
  patient?: { fullName: string; patientNo: string };
  doctor?: { name: string };
}

export interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
}

export interface Payment {
  id: string;
  amount: number;
  method: string;
  insurerName?: string | null;
  claimRef?: string | null;
  createdAt: string;
}

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface Invoice {
  id: string;
  invoiceNo: string;
  patientId: string;
  subtotal: number;
  discountType: string;
  discountValue: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: InvoiceStatus;
  createdAt: string;
  items?: InvoiceItem[];
  payments?: Payment[];
  patient?: { fullName: string; patientNo: string };
}

export interface PatientDocument {
  id: string;
  filename: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface PriceItem {
  id: string;
  type: string;
  name: string;
  visitType?: string | null;
  doctorId?: string | null;
  price: number;
  isActive: boolean;
  doctor?: { name: string } | null;
}

export interface LabTest {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
}

export interface AuditLog {
  id: string;
  userName?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
}

export interface Medication {
  id: string;
  sku: string;
  name: string;
  genericName?: string | null;
  form: string;
  strength?: string | null;
  unit: string;
  quantity: number;
  reorderLevel: number;
  unitPrice: number;
  batchNo?: string | null;
  expiryDate?: string | null;
  supplier?: string | null;
  location?: string | null;
  isActive: boolean;
  movements?: StockMovement[];
}

export interface StockMovement {
  id: string;
  type: 'RECEIVE' | 'DISPENSE' | 'ADJUST';
  quantity: number;
  balanceAfter: number;
  reason?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface DispenseItemRow {
  id?: string;
  medicationId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Dispense {
  id: string;
  dispenseNo: string;
  patientId?: string | null;
  prescriptionId?: string | null;
  notes?: string | null;
  total: number;
  createdAt: string;
  items: DispenseItemRow[];
  patient?: { fullName: string; patientNo: string } | null;
  dispensedBy?: { name: string } | null;
}

export interface PharmacyStats {
  totalItems: number;
  lowStock: number;
  outOfStock: number;
  expiringSoon: number;
  stockValue: number;
  pendingRx: number;
  dispensedToday: number;
}

export interface PendingPrescription {
  id: string;
  createdAt: string;
  notes?: string | null;
  items: PrescriptionItem[];
  patient: { id: string; fullName: string; patientNo: string; allergies?: string | null };
  doctor?: { name: string };
}

export interface Clinic {
  id: number;
  name: string;
  logoPath?: string | null;
  address: string;
  phone: string;
  email: string;
  currency: string;
  taxRate: number;
}
