import { PrismaClient, Prisma } from '@prisma/client';

// Next invoice number like INV-2026-00001. Accepts a transaction client so it can
// run inside $transaction for atomic numbering.
export async function nextInvoiceNo(
  client: PrismaClient | Prisma.TransactionClient
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const last = await client.invoice.findFirst({
    where: { invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: 'desc' },
  });
  let seq = 1;
  if (last) {
    const n = parseInt(last.invoiceNo.slice(prefix.length), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return prefix + String(seq).padStart(5, '0');
}
