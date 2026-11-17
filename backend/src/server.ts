import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { authRouter } from "./routes/auth.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { sectorsRouter } from "./routes/sectors.routes.js";
import { sewingRouter } from "./routes/sewing.routes.js";
import { auditRouter } from "./routes/audit.routes.js";
import { customersRouter } from "./routes/customers.routes.js";
import { quotationsRouter } from "./routes/quotations.routes.js";
import { designRouter } from "./routes/design.routes.js";
import { approvalRouter } from "./routes/approval.routes.js";
import { conversionRouter } from "./routes/conversion.routes.js";
import { sacRouter } from "./routes/sac.routes.js";
import { filesRouter } from "./routes/files.routes.js";
import { batchesRouter } from "./routes/batches.routes.js";
import { productionRouter } from "./routes/production.routes.js";
import { dispatchRouter } from "./routes/dispatch.routes.js";
import { costuraRouter } from "./routes/costura.routes.js";
import { qualityRouter } from "./routes/quality.routes.js";
import { expedicaoRouter } from "./routes/expedicao.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { universalSheetRouter } from "./routes/universalSheet.routes.js";
import { catalogRouter } from "./routes/catalog.routes.js";

import { verifyToken } from "./utils/security.js";
import { prisma } from "./prisma.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// Configuração do Socket.io para comunicação em tempo real no chão de fábrica
export const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

// Middleware de autenticação obrigatória no handshake do Socket.io
io.use(async (socket, next) => {
  try {
    const rawToken =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!rawToken) {
      return next(
        new Error("AUTHENTICATION_ERROR: Token de autenticação não fornecido no handshake.")
      );
    }

    const payload = verifyToken(rawToken) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { sector: true },
    });

    if (!user || !user.isActive) {
      return next(
        new Error("AUTHENTICATION_ERROR: Usuário inativo ou não cadastrado.")
      );
    }

    // Armazenar os dados autenticados do usuário de forma confiável
    socket.data.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sectorId: user.sectorId,
      sectorCode: user.sector?.code || null,
      sectorName: user.sector?.name || null,
    };

    next();
  } catch (err: any) {
    return next(
      new Error(`AUTHENTICATION_ERROR: Token inválido ou expirado (${err.message}).`)
    );
  }
});

io.on("connection", (socket) => {
  const user = socket.data.user;
  console.log(`[Socket.io] Usuário autenticado conectado: ${user.name} (${user.role}) - Socket ID: ${socket.id}`);

  // Ingressar automaticamente na sala individual do usuário
  socket.join(`user_${user.id}`);

  // Ingressar automaticamente na sala do seu próprio setor
  if (user.sectorCode) {
    socket.join(`sector_${user.sectorCode}`);
    if (user.sectorCode === "DESIGNER") socket.join("sector_DESIGN");
    if (user.sectorCode === "DESIGN") socket.join("sector_DESIGNER");
    console.log(`[Socket.io] Usuário ${user.name} ingressou na sala sector_${user.sectorCode}`);
  }

  // Perfis administrativos ingressam nas salas de gestão e controle
  if (user.role === "ADMIN" || user.role === "GESTOR") {
    socket.join("sector_ADMIN");
    socket.join("sector_GESTAO");
  }

  // Operadores e telas solicitam ingresso em sala de setor com validação estrita
  socket.on("join_sector", async (sectorCode: string) => {
    // 1. ADMIN e GESTOR podem monitorar qualquer setor fabril válido
    if (user.role === "ADMIN" || user.role === "GESTOR") {
      const sector = await prisma.sector.findUnique({ where: { code: sectorCode } });
      if (sector) {
        socket.join(`sector_${sectorCode}`);
        console.log(`[Socket.io Security] Gestor/Admin ${user.name} ingressou na sala sector_${sectorCode}`);
      } else {
        socket.emit("sector_access_denied", { error: `Setor '${sectorCode}' inexistente no sistema.` });
      }
      return;
    }

    // 2. Operadores, Vendedores e Designers só podem ingressar no seu setor de lotação
    const isAuthorizedSector =
      user.sectorCode === sectorCode ||
      (user.sectorCode === "DESIGNER" && sectorCode === "DESIGN") ||
      (user.sectorCode === "DESIGN" && sectorCode === "DESIGNER");

    if (isAuthorizedSector) {
      socket.join(`sector_${sectorCode}`);
      console.log(`[Socket.io Security] Usuário ${user.name} confirmou sala autorizada sector_${sectorCode}`);
    } else {
      console.warn(
        `[Socket.io Security] Acesso negado: Usuário ${user.name} (${user.role}, Setor: ${user.sectorCode}) tentou ingressar na sala não autorizada 'sector_${sectorCode}'.`
      );
      socket.emit("sector_access_denied", {
        error: `Acesso negado: Você não possui autorização para ingressar na sala do setor ${sectorCode}.`,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[Socket.io] Cliente desconectado: ${socket.id} (${user.name})`);
  });
});

app.use(cors());
app.use(express.json());

// Detecção dinâmica de build estático do frontend (SPA) para produção / rede local
const candidateDistDirs = [
  path.resolve(process.cwd(), "frontend", "dist"),
  path.resolve(process.cwd(), "..", "frontend", "dist"),
];
const frontendDistPath = candidateDistDirs.find((dir) =>
  fs.existsSync(path.join(dir, "index.html"))
);

if (frontendDistPath) {
  app.use(express.static(frontendDistPath));
}

// Request logger simples
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check para monitoramento de rede e status da fábrica
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    system: "PCP Industrial - Fábrica de Uniformes",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Rota raiz amigável quando o build do frontend não estiver presente
if (!frontendDistPath) {
  app.get("/", (req, res) => {
    if (req.accepts("html")) {
      return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="2;url=http://localhost:5173">
  <title>PCP Industrial Labella Sports - Backend Online</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; }
    .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #334155; text-align: center; max-width: 520px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    .badge { background: #10b981; color: #022c22; font-weight: bold; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block; margin-bottom: 1.25rem; }
    h1 { margin: 0 0 0.75rem 0; font-size: 1.5rem; color: #ffffff; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; }
    a.btn { display: inline-block; background: #2563eb; color: #ffffff; padding: 0.85rem 1.75rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; font-size: 1rem; transition: background 0.2s; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.4); }
    a.btn:hover { background: #1d4ed8; }
    .footer { margin-top: 1.5rem; font-size: 0.82rem; color: #64748b; }
    .footer strong { color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● Backend Online (Porta 4000)</div>
    <h1>API PCP Industrial Labella Sports</h1>
    <p>O servidor backend da fábrica está <strong>100% online e operando</strong>. A interface visual do sistema roda na porta <strong>5173</strong>. Clique no botão abaixo para acessar:</p>
    <a href="http://localhost:5173" class="btn">Acessar Sistema Visual (Porta 5173) &rarr;</a>
    <div class="footer">Redirecionando automaticamente em 2 segundos...<br/>Acesso Celular / LAN: <strong>http://192.168.1.35:5173</strong></div>
  </div>
</body>
</html>`);
    }
    res.json({
      system: "PCP Industrial - Fábrica de Uniformes Labella Sports",
      status: "online",
      message: "Servidor backend operando normalmente na porta 4000.",
      frontendUrl: "http://localhost:5173",
      healthCheck: "/api/health",
    });
  });
}

app.get("/api", (_req, res) => {
  res.json({
    system: "PCP Industrial - Fábrica de Uniformes Labella Sports",
    status: "online",
    version: "2.0.0",
    modules: [
      "auth",
      "users",
      "sectors",
      "customers",
      "quotations",
      "production",
      "design",
      "batches",
      "dashboard",
      "universal-sheet",
      "catalog"
    ]
  });
});

// Rotas da API
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/sectors", sectorsRouter);
app.use("/api/sewing-partners", sewingRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/customers", customersRouter);
app.use("/api/quotations", quotationsRouter);
app.use("/api/quotations", approvalRouter);
app.use("/api/quotations", conversionRouter);
app.use("/api/design", designRouter);
app.use("/api/sac", sacRouter);
app.use("/api/files", filesRouter);
app.use("/api/production", productionRouter);
app.use("/api/production", dispatchRouter);
app.use("/api/production", costuraRouter);
app.use("/api/production", qualityRouter);
app.use("/api/production", expedicaoRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/universal-sheet", universalSheetRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api", batchesRouter);

// Fallback SPA: qualquer navegação fora de /api entrega o index.html compilado do React
if (frontendDistPath) {
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

// Tratamento de rotas inexistentes da API
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Endpoint não encontrado." });
});

// Tratamento geral de rotas inexistentes
app.use((_req, res) => {
  if (frontendDistPath) {
    return res.sendFile(path.join(frontendDistPath, "index.html"));
  }
  res.status(404).json({ error: "Endpoint não encontrado." });
});

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";

// Exportar app para testes
export { app, server };

export function startServer(port = PORT, host = HOST) {
  return server.listen(port, host, () => {
    console.log(`=======================================================`);
    console.log(` SISTEMA DE GESTÃO DE PRODUÇÃO E PCP INDUSTRIAL`);
    console.log(` Servidor rodando em: http://${host}:${port}`);
    console.log(` Acesso LAN: Conecte via IP local da máquina na porta ${port}`);
    console.log(` Modo de Operação: ${process.env.NODE_ENV || "development"}`);
    console.log(`=======================================================`);
  });
}

// Inicia apenas se executado diretamente como processo principal do servidor
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") ||
    process.argv[1].endsWith("server.js") ||
    process.argv[1].endsWith("index.js") ||
    process.argv[1].endsWith("start-prod.ts") ||
    process.argv[1].endsWith("start-prod.js"));

if (isMain && process.env.NODE_ENV !== "test") {
  startServer();
}
