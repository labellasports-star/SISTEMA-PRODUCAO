import { io, Socket } from "socket.io-client";
import { getToken } from "./api.js";

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    const token = getToken();
    socketInstance = io("/", {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketInstance.on("connect", () => {
      console.log(`[Socket.io] Conectado ao servidor industrial (ID: ${socketInstance?.id})`);
    });

    socketInstance.on("disconnect", (reason) => {
      console.warn(`[Socket.io] Desconectado: ${reason}`);
    });

    socketInstance.on("connect_error", (error) => {
      console.error("[Socket.io] Erro de conexão:", error.message);
    });
  }

  return socketInstance;
}

export function joinSectorRoom(sectorCode: string): void {
  const socket = getSocket();
  if (socket.connected) {
    socket.emit("join_sector", sectorCode);
  } else {
    socket.once("connect", () => {
      socket.emit("join_sector", sectorCode);
    });
  }
}
