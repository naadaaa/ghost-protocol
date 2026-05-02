const admin = require("../config/firebase");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // contains uid, name, email, picture, etc.

    // Emit pulse event if io is attached
    req.io
      ?.to(decoded.uid)
      .emit("pulse", {
        type: "AUTH",
        message: `Token verified for ${decoded.uid}`,
        ts: Date.now(),
      });

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

module.exports = verifyToken;