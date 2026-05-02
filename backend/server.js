require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const getRedis = require("./config/redis");
require("./config/firebase"); // initialize admin SDK

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL || "http://localhost:3000", methods: ["GET", "POST"] },
});

// Attach io to every request so routes can emit pulses
app.use((req, _res, next) => {
  req.io = io;
  next();
});

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/auth", require("./routes/auth"));
app.use("/chat", require("./routes/chat"));

// ── Socket.io ───────────────────────────────────────────────────────────────
// Map uid → Set of socketIds for presence tracking
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log(`[SOCKET] New connection: ${socket.id}`);

  // Client registers immediately after connecting
  socket.on("register", async (uid) => {
    socket.uid = uid;
    socket.join(uid); // private room = uid

    if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
    onlineUsers.get(uid).add(socket.id);

    try {
      const redis = await getRedis();
      await redis.set(`presence:${uid}`, "ACTIVE");
      io.emit("presence", { uid, status: "ACTIVE" });
    } catch (err) {
      console.error("Redis presence error:", err);
    }

    io.to(uid).emit("pulse", {
      type: "SOCKET",
      message: `User ${uid} joined. Presence set to ACTIVE.`,
      ts: Date.now(),
    });

    // Send current online list to this user
    const onlineList = [...onlineUsers.keys()];
    socket.emit("onlineList", onlineList);
  });

  // Join a private chat room with another user
  socket.on("joinRoom", ({ myUid, targetUid }) => {
    const room = [myUid, targetUid].sort().join("_");
    socket.join(room);
    io.to(myUid).emit("pulse", {
      type: "SOCKET",
      message: `User ${myUid} joined private room: ${room}`,
      ts: Date.now(),
    });
  });

  // Typing indicator
  socket.on("typing", ({ myUid, targetUid, isTyping }) => {
    io.to(targetUid).emit("typing", { uid: myUid, isTyping });
  });

  // ── Burn-on-Disconnect (Bonus) ────────────────────────────────────────────
  socket.on("disconnect", async () => {
    const uid = socket.uid;
    if (!uid) return;

    const sockets = onlineUsers.get(uid);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(uid);
        // Wipe presence instantly
        try {
          const redis = await getRedis();
          await redis.del(`presence:${uid}`);
          io.emit("presence", { uid, status: "OFFLINE" });
        } catch (err) {
          console.error("Redis presence cleanup error:", err);
        }
        io.emit("pulse", {
          type: "SOCKET",
          message: `User ${uid} disconnected. Presence wiped (burn-on-disconnect).`,
          ts: Date.now(),
        });
      }
    }
  });
});

// Redis  KEA
// Subscribe to Redis expired events so we can push "GHOST" pulses to clients
// when a chat key TTL hits 0.
async function watchRedisExpiry() {
  try {
    // We need a separate subscriber client — the main client cannot be in subscribe mode
    const { createClient } = require("redis");
    const subscriber = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
    subscriber.on("error", (err) => console.error("Redis subscriber error:", err));
    await subscriber.connect();

    // Enable keyspace notifications KEA
    // This requires `notify-keyspace-events` to be set  programmatically:
    const mainRedis = await getRedis();
    await mainRedis.configSet("notify-keyspace-events", "KEA");

    await subscriber.subscribe("__keyevent@0__:expired", (expiredKey) => {
      console.log(`[REDIS] Key expired: ${expiredKey}`);

      if (expiredKey.startsWith("chat:")) {
        // Parse the two UIDs from the key
        const roomPart = expiredKey.replace("chat:", "");
        const [uidA, uidB] = roomPart.split("_");

        const pulse = {
          type: "GHOST",
          message: `TTL reached 0. Redis key '${expiredKey}' purged. Ghost has cleared the memory.`,
          ts: Date.now(),
        };

        io.to(uidA).emit("pulse", pulse);
        io.to(uidB).emit("pulse", pulse);
        io.to(uidA).emit("wipe", { key: expiredKey });
        io.to(uidB).emit("wipe", { key: expiredKey });
      }

      if (expiredKey.startsWith("mfa:")) {
        const uid = expiredKey.replace("mfa:", "");
        io.to(uid).emit("pulse", {
          type: "TWILIO",
          message: `MFA session expired for ${uid}.`,
          ts: Date.now(),
        });
      }
    });

    console.log("[REDIS] Keyspace expiry watcher active.");
  } catch (err) {
    console.warn("[REDIS] Keyspace watcher failed (non-fatal):", err.message);
  }
}

//boot
connectDB().then(async () => {
  await getRedis(); 
  watchRedisExpiry(); 
  httpServer.listen(process.env.PORT || 4000, () =>
    console.log(`[SERVER] Running on port ${process.env.PORT || 4000}`)
  );
});