const getRedis = require("../config/redis");

//TTL
const DEFAULT_TTL = parseInt(process.env.CHAT_TTL_SECONDS || "120", 10);

/**
 * Build a deterministic room key so chats are equal for both users
 */
function roomKey(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

/**
 * Save a message to a Redis list and reset the TTL.
 * returns the message
 */
async function saveMessage(uidA, uidB, senderUid, text, ttl = DEFAULT_TTL) {
  const redis = await getRedis();
  const key = `chat:${roomKey(uidA, uidB)}`;

  const msg = {
    senderUid,
    text,
    ts: Date.now(),
  };

  // Atomic: push + refresh TTL
  await redis.rPush(key, JSON.stringify(msg));
  await redis.expire(key, ttl);

  return { key, msg, ttl };
}

/**
 * get all messages in a conversation.
 */
async function getMessages(uidA, uidB) {
  const redis = await getRedis();
  const key = `chat:${roomKey(uidA, uidB)}`;
  const raw = await redis.lRange(key, 0, -1);
  const ttl = await redis.ttl(key);
  return {
    key,
    messages: raw.map((r) => JSON.parse(r)),
    ttl,
  };
}

/**
 * Bonus: Read-Once,fetch 1 message at the head and delete it atomically
 * using a MULTI/EXEC transaction.
 */
async function readOnce(uidA, uidB) {
  const redis = await getRedis();
  const key = `chat:${roomKey(uidA, uidB)}`;

  //WATCH + MULTI/EXEC for atomicity
  await redis.watch(key);
  const multi = redis.multi();
  multi.lPop(key);
  const [popped] = await multi.exec();

  if (!popped) return null;
  return JSON.parse(popped);
}

/**
 *deelete conversation
 */
async function wipeConversation(uidA, uidB) {
  const redis = await getRedis();
  const key = `chat:${roomKey(uidA, uidB)}`;
  await redis.del(key);
  return key;
}

/**
 *get remaining TTL for a conversation key.
 */
async function getTtl(uidA, uidB) {
  const redis = await getRedis();
  const key = `chat:${roomKey(uidA, uidB)}`;
  return redis.ttl(key);
}

module.exports = { saveMessage, getMessages, readOnce, wipeConversation, getTtl, roomKey, DEFAULT_TTL };