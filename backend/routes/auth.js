const express = require("express");
const router = express.Router();
const User = require("../models/User");
const verifyToken = require("../middleware/verifyToken");
const { sendOtp, verifyOtp } = require("../services/mfa");

// POST /auth/login — called right after Firebase login
router.post("/login", verifyToken, async (req, res) => {
  const { uid, name, email, picture } = req.user;
  const io = req.io;

  try {
    let user = await User.findOne({ uid });

    if (!user) {
      user = await User.create({
        uid,
        displayName: name,
        email,
        photoURL: picture,
      });
      io?.to(uid).emit("pulse", { type: "AUTH", message: `New user registered: ${email}`, ts: Date.now() });
    } else {
      io?.to(uid).emit("pulse", { type: "AUTH", message: `Returning user: ${email}`, ts: Date.now() });
    }

    // Try MFA — if Twilio fails, skip it gracefully so we can still test
    try {
      await sendOtp(uid);
      io?.to(uid).emit("pulse", { type: "TWILIO", message: `MFA challenge dispatched to ${process.env.MFA_PHONE_NUMBER}`, ts: Date.now() });
      io?.to(uid).emit("pulse", { type: "AUTH", message: "Awaiting SMS code verification.", ts: Date.now() });
      return res.json({ status: "PENDING_MFA", user: { uid, displayName: name, email, photoURL: picture } });
    } catch (twilioErr) {
      console.error("⚠️ Twilio MFA failed (skipping for now):", twilioErr.message);
      io?.to(uid).emit("pulse", { type: "TWILIO", message: `MFA skipped: ${twilioErr.message}`, ts: Date.now() });
      // Skip MFA — go straight to SECURE so you can test the rest of the app
      return res.json({ status: "SECURE", user: { uid, displayName: name, email, photoURL: picture } });
    }

  } catch (err) {
    console.error("❌ /auth/login error:", err.message);
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /auth/verify-mfa
router.post("/verify-mfa", verifyToken, async (req, res) => {
  const { uid } = req.user;
  const { code } = req.body;
  const io = req.io;

  try {
    const approved = await verifyOtp(uid, code);

    if (!approved) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    await User.updateOne({ uid }, { mfaVerified: true });
    io?.to(uid).emit("pulse", { type: "TWILIO", message: "SMS code verified. Session promoted to SECURE.", ts: Date.now() });

    return res.json({ status: "SECURE" });
  } catch (err) {
    console.error("❌ /auth/verify-mfa error:", err.message);
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;