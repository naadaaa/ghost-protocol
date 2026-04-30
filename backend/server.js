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
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] },
});

// Attach io to every request
app.use((req, _res, next) => {
  req.io = io;
  next();
});
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// Routes
app.use("/auth", require("./routes/auth"));

// Socket.io — presence pulse (A6)
io.on("connection", (socket) => {
  // Client emits "register" with their uid right after connecting
  socket.on("register", async (uid) => {
    socket.uid = uid; // store for disconnect handler
    socket.join(uid);

    // Set presence as Active in Redis
    try {
      const redis = await getRedis();
      await redis.set(`presence:${uid}`, "ACTIVE");
      io.emit("presence", { uid, status: "ACTIVE" }); // broadcast to everyone
    } catch (err) {
      console.error("Redis presence error:", err);
    }

    io.to(uid).emit("pulse", {
      type: "SOCKET",
      message: `User ${uid} joined. Presence set to ACTIVE.`,
      ts: Date.now(),
    });
  });

  socket.on("disconnect", async () => {
    const uid = socket.uid;
    if (!uid) return;

    // Burn-on-disconnect: wipe presence instantly
    try {
      const redis = await getRedis();
      await redis.del(`presence:${uid}`);
      io.emit("presence", { uid, status: "OFFLINE" }); // broadcast to everyone
    } catch (err) {
      console.error("Redis presence cleanup error:", err);
    }

    io.emit("pulse", {
      type: "SOCKET",
      message: `User ${uid} disconnected. Presence wiped.`,
      ts: Date.now(),
    });
  });
});

connectDB().then(() => {
  httpServer.listen(process.env.PORT, () =>
    console.log(`Server running on port ${process.env.PORT}`)
  );
});