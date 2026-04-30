const twilio = require("twilio");
const getRedis = require("../config/redis");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendOtp = async (uid) => {
  const verification = await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SID)
    .verifications.create({
      to: process.env.MFA_PHONE_NUMBER,
      channel: "sms",
    });

  // Store PENDING state in Redis — 5 minute TTL
  const redis = await getRedis();
  await redis.setEx(`mfa:${uid}`, 300, "PENDING");

  return verification.sid;
};

const verifyOtp = async (uid, code) => {
  const result = await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SID)
    .verificationChecks.create({
      to: process.env.MFA_PHONE_NUMBER,
      code,
    });

  if (result.status === "approved") {
    const redis = await getRedis();
    await redis.del(`mfa:${uid}`);
    return true;
  }
  return false;
};

module.exports = { sendOtp, verifyOtp };