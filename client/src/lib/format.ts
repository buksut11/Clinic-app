import { format, parseISO, differenceInYears } from 'date-fns';

export function fmtDate(d?: string | null): string {
  if (!d) return '-';
  try {
    return format(typeof d === 'string' ? parseISO(d) : d, 'dd MMM yyyy');
  } catch {
    return '-';
  }
}

export function fmtDateTime(d?: string | null): string {
  if (!d) return '-';
  try {
    return format(parseISO(d), 'dd MMM yyyy, HH:mm');
  } catch {
    return '-';
  }
}

export function age(dob?: string | null): string {
  if (!dob) return '-';
  try {
    return `${differenceInYears(new Date(), parseISO(dob))} yrs`;
  } catch {
    return '-';
  }
}

export function money(n: number, currency = 'USD'): string {
  return `${currency} ${Number(n || 0).toFixed(2)}`;
}

export function paidOf(inv: { payments?: { amount: number }[] }): number {
  return (inv.payments || []).reduce((s, p) => s + p.amount, 0);
}
