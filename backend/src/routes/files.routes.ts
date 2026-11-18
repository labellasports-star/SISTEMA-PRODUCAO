import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest, AuthenticatedUser } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

import {
  getReferencesDir,
  getArtworkDir,
  ensureUploadDirectoriesExist,
} from "../utils/storageConfig.js";

export const filesRouter = Router();

// Garantir estrutura de diretórios do ambiente ativo
ensureUploadDirectoriesExist();

// Extensões executáveis bloqueadas por segurança operacional
const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "sh", "ps1", "msi", "vbs", "com", "scr", "jar", "reg", "pif", "gadget", "ws", "wsf", "wsc", "wsh"
]);

// Magic bytes validation
function validateMagicBytes(filePath: string, ext: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    const extLower = ext.toLowerCase();

    // Bloquear executáveis disfarçados (MZ header Windows PE ou ELF Linux)
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      // MZ header
      return false;
    }
    if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
      // ELF header
      return false;
    }

    // PNG: 89 50 4E 47 (0x89 0x50 0x4e 0x47)
    if (extLower === "png") {
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    }

    // JPG / JPEG: FF D8 FF
    if (extLower === "jpg" || extLower === "jpeg") {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    // PDF: 25 50 44 46 (%PDF)
    if (extLower === "pdf") {
      return (
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46
      );
    }

    // PSD: 38 42 50 53 (8BPS)
    if (extLower === "psd") {
      return (
        buffer[0] === 0x38 &&
        buffer[1] === 0x42 &&
        buffer[2] === 0x50 &&
        buffer[3] === 0x53
      );
    }

    // CDR: ZIP (PK..: 50 4B 03 04) or RIFF (52 49 46 46)
    if (extLower === "cdr") {
      const isZip =
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
      const isRiff =
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46;
      return isZip || isRiff;
    }

    // AI: PDF-based (%PDF) or PostScript (%!PS: 25 21 50 53)
    if (extLower === "ai") {
      const isPdf =
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46;
      const isPostScript =
        buffer[0] === 0x25 &&
        buffer[1] === 0x21 &&
        buffer[2] === 0x50 &&
        buffer[3] === 0x53;
      return isPdf || isPostScript;
    }

    // Para demais extensões não-executáveis (ex: SVG, EPS, ZIP, RAR, TXT, DOCX), aceitar se não for executável
    return true;
  } catch (err) {
    console.error("Erro na validação de magic bytes:", err);
    return false;
  }
}

// Configuração do multer com armazenamento em disco
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const url = req.originalUrl || req.baseUrl || req.url || "";
    const rawCategory =
      (req.params as any)?.category ||
      (req.query.category as string) ||
      (req.body?.category as string) ||
      (url.toLowerCase().includes("artwork") ? "artwork" : "references");
    const category = rawCategory === "artwork" ? "artwork" : "references";
    const targetDir = category === "artwork" ? getArtworkDir() : getReferencesDir();
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const sanitizedBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 50);
    const uniqueName = `${crypto.randomUUID()}-${sanitizedBase}${ext}`;
    cb(null, uniqueName);
  },
});

// Limite configurável via ambiente, padrão de 3GB (3072MB) para acomodar arquivos pesados de arte (CDR, PSD, AI)
const MAX_FILE_SIZE = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 3072) * 1024 * 1024;

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(".", "").toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return cb(
        new Error(
          `Extensão .${ext} não permitida por motivos de segurança operacional.`
        )
      );
    }
    cb(null, true);
  },
});

// Todas as rotas de arquivos exigem autenticação
filesRouter.use(authenticateToken);

// Função de validação profunda de autorização para download
async function verifyFileAccess(
  user: AuthenticatedUser,
  filename: string,
  category?: string
): Promise<boolean> {
  // 1. ADMIN e GESTOR têm acesso administrativo total
  if (user.role === "ADMIN" || user.role === "GESTOR") {
    return true;
  }

  // 2. Verificar se o arquivo é um anexo de orçamento (QuotationAttachment)
  const attachment = await prisma.quotationAttachment.findFirst({
    where: {
      OR: [
        { fileUrl: { contains: filename } },
        { fileName: filename },
      ],
    },
    include: {
      quotation: {
        include: {
          productionOrder: {
            include: { batches: true },
          },
        },
      },
    },
  });

  if (attachment) {
    const q = attachment.quotation;

    // VENDEDOR: isolamento estrito — somente o dono da cotação ou autor do upload tem acesso
    if (user.role === "VENDEDOR") {
      return q.sellerId === user.id || attachment.uploadedById === user.id;
    }

    // DESIGNER: autorizado para referências se a cotação foi encaminhada ao design
    if (user.role === "DESIGNER") {
      const designStatuses = [
        "SOLICITACAO_ARTE",
        "DESENVOLVIMENTO_ARTE",
        "AGUARDANDO_APROVACAO_ARTE",
        "ARTE_EM_ALTERACAO",
        "ORCAMENTO_APROVADO",
        "CONVERTIDA_VENDA",
      ];
      if (designStatuses.includes(q.status) || q.designerId === user.id) {
        return true;
      }
      return false;
    }

    // OPERADOR: só pode acessar se o orçamento virou OP e o lote chegou ao seu setor (ou SAC Interno)
    if (user.role === "OPERADOR") {
      if (user.sectorCode === "SAC_INTERNO") {
        return true;
      }
      if (!q.productionOrder) {
        return false;
      }
      return q.productionOrder.batches.some(
        (b) => b.currentSectorId === user.sectorId || b.assignedOperatorId === user.id
      );
    }

    return false;
  }

  // 3. Verificar se o arquivo é uma versão de arte (ArtworkVersion)
  const artwork = await prisma.artworkVersion.findFirst({
    where: {
      OR: [
        { previewUrl: { contains: filename } },
        { vectorUrl: { contains: filename } },
      ],
    },
    include: {
      designBrief: {
        include: {
          quotation: {
            include: {
              productionOrder: {
                include: { batches: true },
              },
            },
          },
        },
      },
    },
  });

  if (artwork) {
    const q = artwork.designBrief.quotation;

    if (user.role === "VENDEDOR") {
      return q.sellerId === user.id;
    }

    if (user.role === "DESIGNER") {
      return true;
    }

    if (user.role === "OPERADOR") {
      if (user.sectorCode === "SAC_INTERNO") {
        return true;
      }
      if (!q.productionOrder) {
        return false;
      }
      const artSectors = ["SAC_INTERNO", "PRE_DIAGRAMACAO", "DIAGRAMACAO", "IMPRESSAO"];
      if (user.sectorCode && artSectors.includes(user.sectorCode)) {
        return true;
      }
      return q.productionOrder.batches.some((b) => b.currentSectorId === user.sectorId);
    }

    return false;
  }

  // 4. Verificar se é a arte aprovada na Ordem de Produção (ProductionOrder.artworkUrl)
  const prodOrder = await prisma.productionOrder.findFirst({
    where: { artworkUrl: { contains: filename } },
    include: { quotation: true, batches: true },
  });

  if (prodOrder) {
    if (user.role === "VENDEDOR") {
      return prodOrder.quotation?.sellerId === user.id;
    }
    if (user.role === "DESIGNER") {
      return true;
    }
    if (user.role === "OPERADOR") {
      const artSectors = ["SAC_INTERNO", "PRE_DIAGRAMACAO", "DIAGRAMACAO", "IMPRESSAO"];
      if (user.sectorCode && artSectors.includes(user.sectorCode)) {
        return true;
      }
      return prodOrder.batches.some((b) => b.currentSectorId === user.sectorId);
    }
    return false;
  }

  // 5. Se foi um upload recente ainda não atrelado a registros relacionais, verificar histórico de auditoria
  const uploadLog = await prisma.auditLog.findFirst({
    where: {
      action: "UPLOAD_FILE",
      newValues: { contains: filename },
    },
    orderBy: { createdAt: "desc" },
  });

  if (uploadLog) {
    if (uploadLog.userId === user.id) {
      return true;
    }
    return false;
  }

  return false;
}

// Resolver o nome original para download
async function resolveDownloadFileName(filename: string): Promise<string> {
  const attachment = await prisma.quotationAttachment.findFirst({
    where: {
      OR: [
        { fileUrl: { contains: filename } },
        { fileName: filename },
      ],
    },
    select: { originalName: true, fileName: true },
  });

  if (attachment) {
    return attachment.originalName || attachment.fileName;
  }

  const uploadLog = await prisma.auditLog.findFirst({
    where: {
      action: "UPLOAD_FILE",
      newValues: { contains: filename },
    },
    orderBy: { createdAt: "desc" },
  });

  if (uploadLog && uploadLog.newValues) {
    try {
      const parsed = typeof uploadLog.newValues === "string" ? JSON.parse(uploadLog.newValues) : uploadLog.newValues;
      if (parsed.originalName) {
        return parsed.originalName;
      }
    } catch (_) {}
  }

  // Remove o prefixo UUID se houver
  const stripped = filename.replace(/^[0-9a-fA-F-]{36}-/, "");
  return stripped || filename;
}

// Função segura para entrega de arquivos (suporta inline preview para imagens ou download seguro)
function sendAsSafeDownload(res: Response, filePath: string, originalName: string, inline = false) {
  const safeOriginalName = originalName.replace(/["\r\n]/g, "_");
  const ext = path.extname(filePath).toLowerCase();

  res.setHeader("X-Content-Type-Options", "nosniff");

  if (inline) {
    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
    };
    if (mimeMap[ext]) {
      res.setHeader("Content-Type", mimeMap[ext]);
    }
    return res.sendFile(filePath);
  }

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(safeOriginalName)}"; filename*=UTF-8''${encodeURIComponent(safeOriginalName)}`
  );
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.setHeader("X-Download-Options", "noopen");

  return res.download(filePath, safeOriginalName, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Erro ao realizar download do arquivo." });
    }
  });
}

// Upload multipart com controle de perfis autorizados (RBAC granular por categoria)
filesRouter.post(
  ["/upload", "/upload/:category"],
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const rawCategory =
      req.params.category || (req.query.category as string) || (req.body?.category as string) || "references";
    const category =
      rawCategory === "reference" || rawCategory === "references"
        ? "references"
        : rawCategory === "artwork"
        ? "artwork"
        : rawCategory;

    // Validação estrita de perfis autorizados para upload
    if (category === "artwork") {
      if (user.role !== "DESIGNER" && user.role !== "ADMIN" && user.role !== "GESTOR") {
        return res.status(403).json({
          error: "Acesso negado: Apenas Designers, Gestores e Administradores possuem autorização para upload de arte final.",
        });
      }
    } else if (category === "references") {
      if (
        user.role !== "VENDEDOR" &&
        user.role !== "ADMIN" &&
        user.role !== "GESTOR" &&
        user.role !== "DESIGNER"
      ) {
        return res.status(403).json({
          error: "Acesso negado: Operadores fabris não possuem permissão para upload de referências comerciais.",
        });
      }
    } else {
      return res.status(400).json({
        error: "Categoria de arquivo inválida. Permitido apenas 'references' ou 'artwork'.",
      });
    }

    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            const limitMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));
            const limitStr = limitMb >= 1024 ? `${(limitMb / 1024).toFixed(0)}GB` : `${limitMb}MB`;
            return res.status(400).json({
              error: `Tamanho do arquivo excede o limite permitido de ${limitStr}.`,
            });
          }
          return res.status(400).json({ error: `Erro no upload: ${err.message}` });
        }
        return res.status(400).json({ error: err.message || "Erro durante o upload." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado no campo 'file'." });
      }

      const ext = path.extname(req.file.originalname).replace(".", "").toLowerCase();
      const isValidMagic = validateMagicBytes(req.file.path, ext);

      if (!isValidMagic) {
        // Remover arquivo falso/corrompido
        try {
          fs.unlinkSync(req.file.path);
        } catch (_) {}

        return res.status(400).json({
          error:
            "Arquivo inválido ou corrompido: os magic bytes do conteúdo não correspondem à extensão declarada.",
        });
      }

      // Registrar auditoria
      await logAudit({
        userId: user.id,
        action: "UPLOAD_FILE",
        entityName: "FileAttachment",
        newValues: {
          originalName: req.file.originalname,
          storedName: req.file.filename,
          category,
          sizeBytes: req.file.size,
          mimetype: req.file.mimetype,
        },
      });

      return res.status(201).json({
        message: "Arquivo enviado com sucesso.",
        fileName: req.file.filename,
        originalName: req.file.originalname,
        category,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        fileUrl: `/api/files/${category}/${req.file.filename}`,
      });
    });
  }
);

// Obter arquivo autenticado com segurança e autorização granular (download seguro ou inline)
filesRouter.get("/:category/:filename", async (req: AuthenticatedRequest, res: Response) => {
  const category = Array.isArray(req.params.category) ? req.params.category[0] : req.params.category;
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;

  if (category !== "references" && category !== "artwork") {
    return res.status(400).json({ error: "Categoria de arquivo inválida." });
  }

  // Prevenção contra Directory Traversal
  const safeFilename = path.basename(filename || "");
  const primaryDir = category === "artwork" ? getArtworkDir() : getReferencesDir();
  const secondaryDir = category === "artwork" ? getReferencesDir() : getArtworkDir();

  let filePath = path.join(primaryDir, safeFilename);
  if (!fs.existsSync(filePath)) {
    // Fallback: verificar diretório alternativo
    const altPath = path.join(secondaryDir, safeFilename);
    if (fs.existsSync(altPath)) {
      filePath = altPath;
    } else {
      return res.status(404).json({ error: "Arquivo não encontrado." });
    }
  }

  // Verificação estrita de autorização granular
  const user = req.user!;
  const hasAccess = await verifyFileAccess(user, safeFilename, category);
  if (!hasAccess) {
    return res.status(403).json({
      error: "Acesso negado: Você não possui autorização para acessar este arquivo.",
    });
  }

  const originalName = await resolveDownloadFileName(safeFilename);
  const isInline = req.query.inline === "true" || req.query.inline === "1";
  return sendAsSafeDownload(res, filePath, originalName, isInline);
});

// Fallback sem categoria na URL (procura em referências e arte com validação)
filesRouter.get("/:filename", async (req: AuthenticatedRequest, res: Response) => {
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const safeFilename = path.basename(filename || "");

  let targetPath = "";
  let resolvedCategory = "references";

  const refPath = path.join(getReferencesDir(), safeFilename);
  if (fs.existsSync(refPath)) {
    targetPath = refPath;
    resolvedCategory = "references";
  } else {
    const artPath = path.join(getArtworkDir(), safeFilename);
    if (fs.existsSync(artPath)) {
      targetPath = artPath;
      resolvedCategory = "artwork";
    }
  }

  if (!targetPath) {
    return res.status(404).json({ error: "Arquivo não encontrado." });
  }

  const user = req.user!;
  const hasAccess = await verifyFileAccess(user, safeFilename, resolvedCategory);
  if (!hasAccess) {
    return res.status(403).json({
      error: "Acesso negado: Você não possui autorização para acessar este arquivo.",
    });
  }

  const originalName = await resolveDownloadFileName(safeFilename);
  const isInline = req.query.inline === "true" || req.query.inline === "1";
  return sendAsSafeDownload(res, targetPath, originalName, isInline);
});
