import express from "express";
import http from "http";
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
app.use("/api", batchesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/universal-sheet", universalSheetRouter);
app.use("/api/catalog", catalogRouter);

// Tratamento de rotas inexistentes
app.use((_req, res) => {
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
