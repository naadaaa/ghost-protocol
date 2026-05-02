import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getUsers(token) {
  const res = await axios.get(`${BASE}/chat/users`, { headers: authHeaders(token) });
  return res.data.users;
}

export async function getChatHistory(token, targetUid) {
  const res = await axios.get(`${BASE}/chat/history/${targetUid}`, { headers: authHeaders(token) });
  return res.data;
}

export async function sendMessage(token, targetUid, text, ttl) {
  const res = await axios.post(
    `${BASE}/chat/send`,
    { targetUid, text, ttl },
    { headers: authHeaders(token) }
  );
  return res.data;
}

export async function getTtl(token, targetUid) {
  const res = await axios.get(`${BASE}/chat/ttl/${targetUid}`, { headers: authHeaders(token) });
  return res.data.ttl;
}

export async function wipeChat(token, targetUid) {
  const res = await axios.delete(`${BASE}/chat/${targetUid}`, { headers: authHeaders(token) });
  return res.data;
}