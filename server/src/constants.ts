// Shared constant "enum" values (SQLite has no native enums).

export const Roles = {
  ADMIN: 'ADMIN',
  DOCTOR: 'DOCTOR',
  RECEPTIONIST: 'RECEPTIONIST',
  NURSE: 'NURSE',
} as const;
export type Role = (typeof Roles)[keyof typeof Roles];
export const ALL_ROLES = Object.values(Roles);

export const AppointmentStatuses = {
  SCHEDULED: 'SCHEDULED',
  CHECKED_IN: 'CHECKED_IN',
  IN_CONSULTATION: 'IN_CONSULTATION',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO_SHOW',
  CANCELLED: 'CANCELLED',
} as const;
export const ALL_APPT_STATUSES = Object.values(AppointmentStatuses);

export const LabStatuses = {
  ORDERED: 'ORDERED',
  SAMPLE_COLLECTED: 'SAMPLE_COLLECTED',
  RESULT_READY: 'RESULT_READY',
} as const;
export const ALL_LAB_STATUSES = Object.values(LabStatuses);

export const InvoiceStatuses = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
