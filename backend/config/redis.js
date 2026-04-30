const { createClient } = require("redis");

let client;

const getRedis = async () => {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });

    client.on("error", (err) => console.error("Redis error:", err));

    await client.connect();
    console.log("Redis connected");
  }
  return client;
};

module.exports = getRedis;