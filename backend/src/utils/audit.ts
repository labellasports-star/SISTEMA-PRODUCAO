import { prisma } from "../prisma.js";

export async function logAudit(params: {
  userId?: string | null;
  action: string;
  entityName: string;
  entityId?: string | null;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        entityName: params.entityName,
        entityId: params.entityId || null,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });
  } catch (err) {
    console.error("Falha ao registrar log de auditoria:", err);
  }
}
