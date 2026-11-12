import path from "path";
import fs from "fs";
import dotenv from "dotenv";

process.env.NODE_ENV = "production";

const prodEnvPath = path.resolve(process.cwd(), ".env.production");
if (fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath, override: true });
}

// Inicia o servidor com o ambiente de produção já configurado
const { startServer } = await import("../src/server.js");

startServer();
