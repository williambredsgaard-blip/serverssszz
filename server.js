const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const wsClients = new Map();
const httpClients = new Map();

const STALE_MS = 5_000;

// Where to look for .lua files
const LUA_SEARCH_PATHS = [
  __dirname,
  path.join(__dirname, "scripts"),
  path.join(__dirname, "public"),
  process.cwd(),
];

function findLuaFile(name) {
  for (const dir of LUA_SEARCH_PATHS) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function userListPayload() {
  const users = [];
  for (const [ws, info] of wsClients) if (info.userId) users.push({ ...info, transport: "ws" });
  const now = Date.now();
  for (const [uid, entry] of httpClients) {
    if (now - entry.info.ts < STALE_MS) users.push({ ...entry.info, transport: "http" });
  }
  return users;
}

function broadcast(obj, excludeWs) {
  const msg = JSON.stringify(obj);
  for (const [ws] of wsClients) {
    if (ws !== excludeWs && ws.readyState === 1) ws.send(msg);
  }
  for (const [, entry] of httpClients) {
    entry.queue.push(obj);
    if (entry.queue.length > 200) entry.queue.splice(0, entry.queue.length - 200);
  }
}

function deliverTo(targetUserId, obj) {
  for (const [ws, info] of wsClients) {
    if (info.userId === targetUserId && ws.readyState === 1) {
      ws.send(JSON.stringify(obj));
      return true;
    }
  }
  const entry = httpClients.get(targetUserId);
  if (entry) { entry.queue.push(obj); return true; }
  return false;
}

wss.on("connection", (ws) => {
  wsClients.set(ws, {});

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const self = wsClients.get(ws);

    if (data.type === "identify") {
      Object.assign(self, data, { ts: Date.now(), transport: "ws" });
      ws.send(JSON.stringify({ type: "userList", users: userListPayload() }));
      broadcast({ type: "userJoined", ...self }, ws);
    }
    else if (data.type === "ping") {
      Object.assign(self, data, { ts: Date.now() });
      ws.send(JSON.stringify({ type: "pong", userId: data.userId }));
      const msg = JSON.stringify({ type: "ping", ...data });
      for (const [otherWs, otherInfo] of wsClients) {
        if (otherWs !== ws && otherInfo.userId && otherWs.readyState === 1) otherWs.send(msg);
      }
      for (const [, entry] of httpClients) entry.queue.push({ type: "ping", ...data });
    }
    else if (data.type === "requestUserList") {
      ws.send(JSON.stringify({ type: "userList", users: userListPayload() }));
    }
    else if (data.type === "execute" || data.type === "output") {
      deliverTo(data.targetUserId, data);
    }
  });

  ws.on("close", () => {
    const info = wsClients.get(ws);
    if (info?.userId) broadcast({ type: "userLeft", userId: info.userId });
    wsClients.delete(ws);
  });
});

app.get("/poll", (req, res) => {
  const uid = parseInt(req.query.userId);
  if (!uid) return res.json({ messages: [], users: userListPayload() });

  let entry = httpClients.get(uid);
  if (!entry) {
    entry = { info: { userId: uid, ts: Date.now(), transport: "http" }, queue: [] };
    httpClients.set(uid, entry);
    broadcast({ type: "userJoined", ...entry.info }, null);
  }

  if (req.query.displayName) {
    entry.info.displayName = String(req.query.displayName);
    entry.info.placeId = parseInt(req.query.placeId) || 0;
    entry.info.jobId = String(req.query.jobId || "");
    entry.info.gameId = parseInt(req.query.gameId) || 0;
  }
  entry.info.ts = Date.now();

  const messages = entry.queue.splice(0, entry.queue.length);
  res.json({ messages, users: userListPayload() });
});

app.post("/send", (req, res) => {
  const msg = req.body;
  if (!msg || !msg.type) return res.json({ ok: false });

  if (msg.type === "execute" || msg.type === "output") {
    deliverTo(msg.targetUserId, msg);
    return res.json({ ok: true });
  }
  if (msg.type === "ping" || msg.type === "identify") {
    const entry = httpClients.get(msg.userId);
    if (entry) {
      Object.assign(entry.info, msg, { ts: Date.now() });
      broadcast(msg, null);
    }
    return res.json({ ok: true });
  }
  if (msg.type === "requestUserList") {
    return res.json({ ok: true, users: userListPayload() });
  }
  res.json({ ok: true });
});

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of httpClients) {
    if (now - entry.info.ts > STALE_MS) {
      httpClients.delete(uid);
      broadcast({ type: "userLeft", userId: uid }, null);
    }
  }
}, 2000);

// ─────────── Lua file serving ───────────
function serveLua(name) {
  return (req, res) => {
    const filePath = findLuaFile(name);
    if (!filePath) {
      console.error(`[serveLua] ${name} not found. Looked in:`, LUA_SEARCH_PATHS);
      res.status(404).set("Content-Type", "text/plain")
         .send(`-- ${name} not found on server. Searched: ${LUA_SEARCH_PATHS.join(", ")}`);
      return;
    }
    try {
      const lua = fs.readFileSync(filePath, "utf8");
      res.set("Content-Type", "text/plain");
      res.send(lua);
    } catch (e) {
      console.error(`[serveLua] read error for ${name}:`, e.message);
      res.status(500).set("Content-Type", "text/plain")
         .send(`-- error reading ${name}: ${e.message}`);
    }
  };
}

app.get("/hubscript.lua",  serveLua("hubscript.lua"));
app.get("/controller.lua", serveLua("controller.lua"));

// Diagnostic endpoint — see what files the server can find
app.get("/files", (req, res) => {
  const found = {};
  for (const dir of LUA_SEARCH_PATHS) {
    try {
      const entries = fs.readdirSync(dir).filter(f => f.endsWith(".lua") || f.endsWith(".js"));
      found[dir] = entries;
    } catch (e) {
      found[dir] = `error: ${e.message}`;
    }
  }
  res.json({ searchPaths: LUA_SEARCH_PATHS, files: found, cwd: process.cwd(), dirname: __dirname });
});

app.get("/clients", (req, res) => res.json({ users: userListPayload() }));

app.get("/", (req, res) => {
  res.set("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Delta Hub Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  body{background:#121216;color:#eee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:24px}
  h1{font-size:20px;margin:0 0 4px;color:#fff}
  .sub{color:#8a8a9a;font-size:13px;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;max-width:1200px}
  .card{background:#1c1c22;border:1px solid #2e2e38;border-radius:10px;padding:14px;display:flex;gap:12px;align-items:center;transition:background .2s}
  .card:hover{background:#22222a}
  .av{width:56px;height:56px;border-radius:8px;background:#2a2a34;flex-shrink:0}
  .meta{min-width:0;flex:1}
  .name{font-weight:600;color:#fff;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .game{color:#9a9aaa;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;margin-top:6px}
  .ws{background:#1e3a2a;color:#7ddd9f}
  .http{background:#3a2f1e;color:#ddd47f}
  .empty{color:#666;padding:40px;text-align:center;grid-column:1/-1}
  .pill{position:fixed;top:24px;right:24px;background:#1c1c22;border:1px solid #2e2e38;padding:6px 12px;border-radius:20px;font-size:12px;color:#8a8a9a}
</style></head>
<body>
  <h1>Delta Hub Dashboard</h1>
  <div class="sub">Live view of every client running the hub script</div>
  <div class="pill" id="count">0 online</div>
  <div class="grid" id="grid"><div class="empty">Loading...</div></div>
<script>
async function refresh() {
  try {
    const r = await fetch('/clients?t=' + Date.now());
    const data = await r.json();
    const users = data.users || [];
    document.getElementById('count').textContent = users.length + ' online';
    const grid = document.getElementById('grid');
    if (users.length === 0) {
      grid.innerHTML = '<div class="empty">No clients connected</div>';
      return;
    }
    grid.innerHTML = users.map(u => {
      const uid = u.userId;
      const thumb = 'https://www.roblox.com/headshot-thumbnail/image?userId=' + uid + '&width=100&height=100&format=png';
      const badge = u.transport === 'ws' ? '<span class="badge ws">ws</span>' : '<span class="badge http">http</span>';
      const place = u.placeId ? ('Place ' + u.placeId) : 'Unknown';
      return '<div class="card">' +
        '<img class="av" src="' + thumb + '" onerror="this.style.background=\\'#2a2a34\\'">' +
        '<div class="meta">' +
          '<div class="name">' + (u.displayName || ('User ' + uid)) + '</div>' +
          '<div class="game">' + place + '</div>' +
          badge +
        '</div></div>';
    }).join('');
  } catch(e) {
    document.getElementById('grid').innerHTML = '<div class="empty">Error: ' + e.message + '</div>';
  }
}
refresh();
setInterval(refresh, 2000);
</script></body></html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Relay on " + PORT));
