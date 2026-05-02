import { io } from "socket.io-client";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000", {
      autoConnect: false,
      transports: ["websocket"],
    });
  }
  return socket;
}

export function connectSocket(uid, onPulse, onPresence, onMessage, onWipe, onTyping, onOnlineList) {
  const s = getSocket();

  if (s.connected) {
    s.emit("register", uid);
    return s;
  }

  s.connect();

  s.once("connect", () => {
    s.emit("register", uid);
  });

  s.on("pulse", onPulse);
  s.on("presence", onPresence);
  s.on("message", onMessage);
  s.on("wipe", onWipe);
  s.on("typing", onTyping);
  s.on("onlineList", onOnlineList);

  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}