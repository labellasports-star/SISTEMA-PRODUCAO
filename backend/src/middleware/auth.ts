import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/security.js";
import { prisma } from "../prisma.js";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  sectorId: string | null;
  sectorCode?: string | null;
  sectorName?: string | null;
  sector?: {
    id: string;
    name: string;
    code: string;
    sequenceOrder: number;
  };
  hasPin: boolean;
}

export interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: AuthenticatedUser;
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.split(" ")[1];

  // Suporte a token via query parameter para downloads diretos e URLs autenticadas
  if (!token && req.query.token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: "Token de autenticação não fornecido." });
    return;
  }

  try {
    const payload = verifyToken(token) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { sector: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Usuário inativo ou não encontrado." });
      return;
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sectorId: user.sectorId,
      sectorCode: user.sector?.code || null,
      sectorName: user.sector?.name || null,
      sector: user.sector ? {
        id: user.sector.id,
        name: user.sector.name,
        code: user.sector.code,
        sequenceOrder: user.sector.sequenceOrder,
      } : undefined,
      hasPin: !!user.signaturePinHash,
    };

    next();
  } catch (error) {
    res.status(403).json({ error: "Sessão inválida ou expirada." });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Acesso negado. Ação permitida apenas para os perfis: ${allowedRoles.join(", ")}.`,
      });
      return;
    }

    next();
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireRole("ADMIN")(req, res, next);
}
