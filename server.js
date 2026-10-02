const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map(); // ws -> { userId, displayName, placeId, jobId }

function broadcast(obj, exclude) {
  const msg = JSON.stringify(obj);
  for (const [ws, info] of clients) {
    if (ws !== exclude && ws.readyState === 1) ws.send(msg);
  }
}

function userList() {
  const users = [];
  for (const [ws, info] of clients) if (info.userId) users.push(info);
  return { type: "userList", users };
}

wss.on("connection", (ws) => {
  clients.set(ws, {});

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const self = clients.get(ws);

    if (data.type === "identify") {
      Object.assign(self, data);
      ws.send(JSON.stringify(userList()));
      broadcast({ type: "userJoined", ...data }, ws);
    }
    else if (data.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", userId: data.userId }));
    }
    else if (data.type === "requestUserList") {
      ws.send(JSON.stringify(userList()));
    }
    else if (data.type === "execute") {
      for (const [targetWs, info] of clients) {
        if (info.userId === data.targetUserId) {
          targetWs.send(JSON.stringify(data));
          break;
        }
      }
    }
    else if (data.type === "output") {
      for (const [targetWs, info] of clients) {
        if (info.userId === data.targetUserId) {
          targetWs.send(JSON.stringify(data));
          break;
        }
      }
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);
    if (info?.userId) broadcast({ type: "userLeft", userId: info.userId });
    clients.delete(ws);
  });
});

// Serve the UI library as plain Lua text
app.get("/customui", (req, res) => {
  try {
    const lua = fs.readFileSync(path.join(__dirname, "customui.lua"), "utf8");
    res.set("Content-Type", "text/plain");
    res.send(lua);
  } catch (e) {
    res.status(500).send("-- customui.lua missing");
  }
});

app.get("/", (req, res) => res.send("Delta relay running"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Relay on " + PORT));
