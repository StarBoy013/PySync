import jwt from "jsonwebtoken";
import Project from "../models/Project.js";
import { runCode } from "../executor.js";

const rooms = new Map();
const disconnectedUsers = new Map();
const runCooldown = new Map();
const runSaveTimers = new Map();
const colors = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#fb7185", "#22d3ee", "#a3e635"];

function isRoomId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{6,20}$/.test(value);
}

function serializeUsers(room) {
  return [...room.users.values()].map((user) => ({
    socketId: user.socketId,
    userId: user.userId,
    username: user.username,
    color: user.color
  }));
}

async function saveRoom(roomId, code) {
  await Project.updateOne({ roomId }, { $set: { code, updatedAt: new Date() } });
}

export function registerSockets(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required"));
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join-room", async (payload = {}, acknowledge) => {
      try {
        const roomId = String(payload.roomId || "");
        if (!isRoomId(roomId)) {
          acknowledge?.({ error: "Invalid Room ID" });
          return;
        }

        if (socket.roomId) socket.leave(socket.roomId);
        const project = await Project.findOne({ roomId });
        if (!project) {
          acknowledge?.({ error: "Room not found" });
          return;
        }

        let room = rooms.get(roomId);
        if (!room) {
          room = {
            code: project.code || "",
            driverSocketId: null,
            users: new Map(),
            graceTimer: null
          };
          rooms.set(roomId, room);
        }

        await socket.join(roomId);
        socket.roomId = roomId;

        const disconnected = disconnectedUsers.get(`${roomId}:${socket.user.userId}`);
        let color = colors[room.users.size % colors.length];
        if (disconnected?.color) color = disconnected.color;

        const user = {
          socketId: socket.id,
          userId: socket.user.userId,
          username: socket.user.username,
          color
        };
        room.users.set(socket.id, user);

        if (disconnected) {
          clearTimeout(room.graceTimer);
          room.graceTimer = null;
          disconnectedUsers.delete(`${roomId}:${socket.user.userId}`);
          if (disconnected.wasDriver) room.driverSocketId = socket.id;
        } else if (!room.driverSocketId) {
          room.driverSocketId = socket.id;
        }

        socket.emit("room-state", {
          code: room.code,
          driverSocketId: room.driverSocketId,
          users: serializeUsers(room)
        });
        socket.to(roomId).emit("user-joined", { userId: user.userId, username: user.username, color: user.color });
        io.to(roomId).emit("driver-changed", {
          driverSocketId: room.driverSocketId,
          username: room.users.get(room.driverSocketId)?.username || ""
        });
      } catch (error) {
        console.error("join-room failed:", error);
        acknowledge?.({ error: "Could not join room" });
      }
    });

    socket.on("code-change", (payload = {}) => {
      try {
        const roomId = socket.roomId;
        const room = roomId ? rooms.get(roomId) : null;
        if (!room || socket.id !== room.driverSocketId) return;
        if (typeof payload.code !== "string" || payload.code.length > 100 * 1024) return;
        room.code = payload.code;
        socket.to(roomId).emit("code-change", { code: payload.code });
      } catch (error) {
        console.error("code-change failed:", error);
      }
    });

    socket.on("send-message", (payload = {}) => {
      try {
        const roomId = socket.roomId;
        const room = roomId ? rooms.get(roomId) : null;
        const sender = room?.users.get(socket.id);
        if (!room || !sender) return;
        const text = String(payload.text || "").trim();
        if (!text || text.length > 2000) return;
        io.to(roomId).emit("receive-message", {
          userId: sender.userId,
          username: sender.username,
          color: sender.color,
          text,
          sentAt: new Date().toISOString()
        });
      } catch (error) {
        console.error("send-message failed:", error);
      }
    });

    socket.on("run-code", async (payload = {}) => {
      try {
        const roomId = socket.roomId;
        const room = roomId ? rooms.get(roomId) : null;
        if (!room || !room.users.has(socket.id)) return;
        if (typeof payload.code !== "string" || typeof payload.stdin !== "string") return;

        const now = Date.now();
        const lastRun = runCooldown.get(roomId) || 0;
        if (now - lastRun < 2000) {
          socket.emit("run-output", {
            stdout: "",
            stderr: "Please wait before running again",
            exitCode: 1,
            timedOut: false,
            ranBy: room.users.get(socket.id)?.username || "Unknown"
          });
          return;
        }
        runCooldown.set(roomId, now);
        room.code = payload.code;
        clearTimeout(runSaveTimers.get(roomId));
        const saveTimer = setTimeout(() => {
          saveRoom(roomId, room.code).catch((error) => console.error("Debounced run save failed:", error));
          runSaveTimers.delete(roomId);
        }, 750);
        runSaveTimers.set(roomId, saveTimer);

        const result = await runCode(payload.code, payload.stdin);
        io.to(roomId).emit("run-output", {
          ...result,
          ranBy: room.users.get(socket.id)?.username || "Unknown"
        });
      } catch (error) {
        console.error("run-code failed:", error);
        socket.emit("run-output", { stdout: "", stderr: "Run failed", exitCode: 1, timedOut: false, ranBy: "System" });
      }
    });

    socket.on("request-control", () => {
      try {
        const roomId = socket.roomId;
        const room = roomId ? rooms.get(roomId) : null;
        if (!room) return;
        if (socket.id === room.driverSocketId) return;
        const requester = room.users.get(socket.id);
        const driver = room.users.get(room.driverSocketId);
        if (requester && driver) io.to(room.driverSocketId).emit("control-request", {
          requesterSocketId: socket.id,
          requesterName: requester.username
        });
      } catch (error) {
        console.error("request-control failed:", error);
      }
    });

    socket.on("grant-control", (payload = {}) => {
      try {
        const roomId = socket.roomId;
        const room = roomId ? rooms.get(roomId) : null;
        if (!room || socket.id !== room.driverSocketId) return;
        const targetId = String(payload.requesterSocketId || "");
        if (!room.users.has(targetId)) return;
        room.driverSocketId = targetId;
        io.to(roomId).emit("driver-changed", {
          driverSocketId: room.driverSocketId,
          username: room.users.get(room.driverSocketId)?.username || ""
        });
      } catch (error) {
        console.error("grant-control failed:", error);
      }
    });

    socket.on("release-control", () => {
      try {
        const roomId = socket.roomId;
        const room = roomId ? rooms.get(roomId) : null;
        if (!room || socket.id !== room.driverSocketId) return;
        const next = [...room.users.keys()].find((id) => id !== socket.id);
        if (!next) return;
        room.driverSocketId = next;
        io.to(roomId).emit("driver-changed", {
          driverSocketId: room.driverSocketId,
          username: room.users.get(room.driverSocketId)?.username || ""
        });
      } catch (error) {
        console.error("release-control failed:", error);
      }
    });

    socket.on("disconnect", () => {
      try {
        const roomId = socket.roomId;
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const disconnected = room.users.get(socket.id);
        if (!disconnected) return;
        room.users.delete(socket.id);

        io.to(roomId).emit("user-left", {
          userId: disconnected.userId,
          username: disconnected.username,
          color: disconnected.color
        });

        if (room.driverSocketId === socket.id) {
          disconnectedUsers.set(`${roomId}:${disconnected.userId}`, {
            ...disconnected,
            socketId: null,
            wasDriver: true,
            color: disconnected.color
          });
        } else {
          disconnectedUsers.set(`${roomId}:${disconnected.userId}`, {
            ...disconnected,
            socketId: null,
            wasDriver: false,
            color: disconnected.color
          });
        }

        clearTimeout(room.graceTimer);
        room.graceTimer = setTimeout(async () => {
          try {
            disconnectedUsers.delete(`${roomId}:${disconnected.userId}`);
            if (room.driverSocketId === socket.id) {
              const nextId = [...room.users.keys()][0] || null;
              room.driverSocketId = nextId;
              if (nextId) io.to(roomId).emit("driver-changed", {
                driverSocketId: nextId,
                username: room.users.get(nextId)?.username || ""
              });
            }
            if (room.users.size === 0) {
              await saveRoom(roomId, room.code).catch((error) => console.error("Empty room save failed:", error));
              rooms.delete(roomId);
              runCooldown.delete(roomId);
            }
          } catch (error) {
            console.error("Disconnect grace failed:", error);
          }
        }, 4000);
      } catch (error) {
        console.error("disconnect failed:", error);
      }
    });
  });
}
