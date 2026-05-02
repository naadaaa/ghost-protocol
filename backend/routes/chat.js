const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { saveMessage, getMessages, readOnce, wipeConversation, getTtl, DEFAULT_TTL } = require("../services/chat");
const User = require("../models/User");

/**
 * GET /chat/users
 * Return all users in MongoDB so the frontend can build a contacts list.
 */
router.get("/users", verifyToken, async (req, res) => {
  try {
    const users = await User.find({ uid: { $ne: req.user.uid } }, "uid displayName email photoURL");
    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /chat/history/:targetUid
 * get messages  between caller and targetUid.
 */
router.get("/history/:targetUid", verifyToken, async (req, res) => {
  const { uid } = req.user;
  const { targetUid } = req.params;
  const io = req.io;

  try {
    const { key, messages, ttl } = await getMessages(uid, targetUid);
    io?.to(uid).emit("pulse", {
      type: "REDIS",
      message: `Fetched history for key '${key}' — ${messages.length} message(s), TTL: ${ttl}s`,
      ts: Date.now(),
    });
    return res.json({ messages, ttl, key });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /chat/send
 * Saves message to Redis, resets TTL, emits via Socket.io to recipients priv room.
 */
router.post("/send", verifyToken, async (req, res) => {
  const { uid, name } = req.user;
  const { targetUid, text, ttl } = req.body;
  const io = req.io;

  if (!targetUid || !text) {
    return res.status(400).json({ error: "targetUid and text are required" });
  }

  try {
    const usedTtl = ttl || DEFAULT_TTL;
    const { key, msg } = await saveMessage(uid, targetUid, uid, text, usedTtl);

    io?.to(uid).emit("pulse", {
      type: "REDIS",
      message: `Key '${key}' updated. TTL reset to ${usedTtl}s.`,
      ts: Date.now(),
    });

    //deliver message in real-time to recipient and sender
    const payload = { ...msg, senderName: name || uid, key, ttl: usedTtl };
    io?.to(targetUid).emit("message", payload);
    io?.to(uid).emit("message", payload);

    // Schedule a "Ghost" notification via TTL watcher
    return res.json({ ok: true, msg, ttl: usedTtl, key });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /chat/read-once
 * Bonus: Atomically pop and delete the oldest message from a conversation.
 */
router.post("/read-once", verifyToken, async (req, res) => {
  const { uid } = req.user;
  const { targetUid } = req.body;
  const io = req.io;

  try {
    const msg = await readOnce(uid, targetUid);
    if (!msg) return res.json({ msg: null });

    io?.to(uid).emit("pulse", {
      type: "REDIS",
      message: `[READ-ONCE] Message atomically consumed & deleted.`,
      ts: Date.now(),
    });

    return res.json({ msg });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /chat/:targetUid
 * wipe a conversation from Redis.
 */
router.delete("/:targetUid", verifyToken, async (req, res) => {
  const { uid } = req.user;
  const { targetUid } = req.params;
  const io = req.io;

  try {
    const key = await wipeConversation(uid, targetUid);
    io?.to(uid).emit("pulse", {
      type: "GHOST",
      message: `Key '${key}' manually purged from Redis.`,
      ts: Date.now(),
    });
    io?.to(uid).emit("wipe", { key });
    io?.to(targetUid).emit("wipe", { key });
    return res.json({ ok: true, key });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /chat/ttl/:targetUid
 * Check remaining TTL for a conversation.
 */
router.get("/ttl/:targetUid", verifyToken, async (req, res) => {
  const { uid } = req.user;
  const { targetUid } = req.params;
  try {
    const ttl = await getTtl(uid, targetUid);
    return res.json({ ttl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;