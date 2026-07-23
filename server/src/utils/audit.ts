import { prisma } from '../prisma';
import { AuthUser } from '../middleware/auth';

// Record an entry in the audit log. Never throws — auditing must not break the request.
export async function audit(
  user: AuthUser | undefined,
  action: string,
  entity?: string,
  entityId?: string,
  details?: string
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: user?.id,
        userName: user?.name,
        action,
        entity,
        entityId,
        details,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Audit log failed:', e);
  }
}
