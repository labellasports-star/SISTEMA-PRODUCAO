import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const prodEnvPath = path.resolve(process.cwd(), ".env.production");
if (process.env.NODE_ENV === "production" && fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath, override: true });
} else {
  dotenv.config();
}

function getRequiredEnv(key: string, legacyFallbackKey?: string): string {
  const val = process.env[key] || (legacyFallbackKey ? process.env[legacyFallbackKey] : undefined);
  if (!val || val.trim() === "") {
    throw new Error(`FATAL: Variável de ambiente obrigatória '${key}' não está configurada no ambiente operacional.`);
  }
  return val.trim();
}

const JWT_SECRET = getRequiredEnv("JWT_SECRET");
const HMAC_SIGNATURE_SECRET =
  process.env.HMAC_SECRET ||
  process.env.HMAC_SIGNATURE_SECRET ||
  process.env.SIGNATURE_SALT ||
  "";

if (!HMAC_SIGNATURE_SECRET || HMAC_SIGNATURE_SECRET.trim() === "") {
  throw new Error("FATAL: Variável de ambiente obrigatória 'HMAC_SECRET' (ou 'HMAC_SIGNATURE_SECRET') não está configurada no ambiente operacional.");
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

const DEV_DEFAULT_SECRETS = [
  "pcp_industrial_secret_super_seguro_2026_uniformes",
  "pcp_master_hmac_sha256_secret_key_server_env_2026_producao_confidencial",
  "insira_aqui_sua_chave_jwt_secreta_de_alta_entropia",
  "insira_aqui_sua_chave_hmac_secreta_de_alta_entropia",
  "default_secret",
  "secret",
];

if (process.env.NODE_ENV === "production") {
  if (DEV_DEFAULT_SECRETS.includes(JWT_SECRET) || JWT_SECRET.length < 32) {
    console.error("FATAL: Em ambiente de produção (NODE_ENV=production), a variável JWT_SECRET deve ser forte (mínimo 32 caracteres) e não pode usar valor padrão de desenvolvimento.");
    process.exit(1);
  }
  if (DEV_DEFAULT_SECRETS.includes(HMAC_SIGNATURE_SECRET) || HMAC_SIGNATURE_SECRET.length < 32) {
    console.error("FATAL: Em ambiente de produção (NODE_ENV=production), a variável HMAC_SECRET (ou HMAC_SIGNATURE_SECRET) deve ser forte (mínimo 32 caracteres) e não pode usar valor padrão de desenvolvimento.");
    process.exit(1);
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function hashPin(pin: string): Promise<string> {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error("O PIN de assinatura deve conter entre 4 e 8 dígitos numéricos.");
  }
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export async function assertAndVerifyUserPin(
  userId: string,
  pin: string | undefined | null
): Promise<{ success: boolean; status: number; error?: string }> {
  if (!pin || typeof pin !== "string" || !/^\d{4,8}$/.test(pin.trim())) {
    return {
      success: false,
      status: 400,
      error: "PIN de assinatura digital individual obrigatório (4 a 8 dígitos numéricos).",
    };
  }

  const { prisma } = await import("../prisma.js");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { signaturePinHash: true, name: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return {
      success: false,
      status: 403,
      error: "Usuário inválido ou inativo para assinar operações industriais.",
    };
  }

  if (!user.signaturePinHash) {
    return {
      success: false,
      status: 403,
      error: "Usuário não possui PIN de assinatura digital cadastrado. Cadastre seu PIN no perfil.",
    };
  }

  const isMatch = await bcrypt.compare(pin.trim(), user.signaturePinHash);
  if (!isMatch) {
    return {
      success: false,
      status: 403,
      error: "PIN de assinatura incorreto. Operação negada.",
    };
  }

  return { success: true, status: 200 };
}

export function generateToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}


export function generateDigitalSignature(params: {
  batchId: string;
  operatorId: string;
  fromSectorId: string;
  toSectorId: string;
  timestamp: string;
}): string {
  const payload = `${params.batchId}|${params.operatorId}|${params.fromSectorId}|${params.toSectorId}|${params.timestamp}`;
  return crypto.createHmac("sha256", HMAC_SIGNATURE_SECRET).update(payload).digest("hex");
}

export function verifyDigitalSignature(
  expectedSignature: string,
  params: {
    batchId: string;
    operatorId: string;
    fromSectorId: string;
    toSectorId: string;
    timestamp: string;
  }
): boolean {
  try {
    // 1. Tentar validação estrita com HMAC-SHA-256 (padrão oficial)
    const currentHmac = generateDigitalSignature(params);
    const bufExpected = Buffer.from(expectedSignature, "hex");
    const bufCurrent = Buffer.from(currentHmac, "hex");

    if (bufExpected.length === bufCurrent.length && crypto.timingSafeEqual(bufExpected, bufCurrent)) {
      return true;
    }

    // 2. Fallback de compatibilidade para assinaturas geradas no formato legado (SHA-256 simples com salt concatenado)
    const legacySalt = process.env.SIGNATURE_SALT || HMAC_SIGNATURE_SECRET;
    const legacyData = `${params.batchId}|${params.operatorId}|${params.fromSectorId}|${params.toSectorId}|${params.timestamp}|${legacySalt}`;
    const legacyHash = crypto.createHash("sha256").update(legacyData).digest("hex");
    const bufLegacy = Buffer.from(legacyHash, "hex");

    if (bufExpected.length === bufLegacy.length && crypto.timingSafeEqual(bufExpected, bufLegacy)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
