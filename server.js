const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const wsClients = new Map();
const httpClients = new Map();
const STALE_MS = 5_000;

// ─── CONFIG ───
const BLOCKONOMICS_API_KEY = process.env.BLOCKONOMICS_API_KEY;
const PRODUCT_PRICE_USD = 0.87;
const PAYMENT_WINDOW_MS = 15 * 60 * 1000;
const REQUIRED_CONFIRMATIONS = 2;
const STORE_CALLBACK = "https://serverssszz.onrender.com/webhook/blockonomics";
const ADSENSE_CLIENT = "ca-pub-4246726390307705";
const ADSENSE_PUB_ID = "pub-4246726390307705";

if (!BLOCKONOMICS_API_KEY) console.error("[config] BLOCKONOMICS_API_KEY is not set.");

// ─── STATS ───
const STATS_FILE = path.join(__dirname, "stats.json");
let stats = { executions: 0 };
try { if (fs.existsSync(STATS_FILE)) stats = Object.assign(stats, JSON.parse(fs.readFileSync(STATS_FILE, "utf8"))); } catch (e) {}
let saveTimer = null;
function saveStats() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); } catch (e) {}
  }, 500);
}
function bumpExecutions() { stats.executions += 1; saveStats(); return stats.executions; }
process.on("SIGINT", () => { try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); } catch {} process.exit(0); });
process.on("SIGTERM", () => { try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); } catch {} process.exit(0); });

// ─── STOCK & STATE ───
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "state.json");
let stock = [];
let state = { issued: {}, redeemed: {} };

function normalizeStock(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (typeof item === "string") out.push({ key: null, credential: item, soldTo: null });
    else if (item && typeof item.credential === "string") out.push({ key: item.key || null, credential: item.credential, soldTo: null });
  }
  return out;
}
function randomKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "PREMIER";
  for (let i = 0; i < 24; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function loadState() {
  if (process.env.STOCK_JSON) {
    try {
      stock = normalizeStock(JSON.parse(process.env.STOCK_JSON));
      console.log(`[stock] loaded ${stock.length} credentials from STOCK_JSON env`);
    } catch (e) { console.error("[stock] STOCK_JSON parse error:", e.message); }
  } else {
    const stockFile = path.join(__dirname, "stock.json");
    try {
      if (fs.existsSync(stockFile)) {
        stock = normalizeStock(JSON.parse(fs.readFileSync(stockFile, "utf8")));
        console.log(`[stock] loaded ${stock.length} credentials from stock.json`);
      } else {
        console.warn("[stock] no stock source found");
      }
    } catch (e) { console.error("[stock] load error:", e.message); }
  }
  for (const item of stock) if (!item.key) item.key = randomKey();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (raw.issued) state.issued = raw.issued;
      if (raw.redeemed) state.redeemed = raw.redeemed;
      if (Array.isArray(raw.soldTo)) for (const item of stock) if (raw.soldTo[item.key]) item.soldTo = raw.soldTo[item.key];
      console.log(`[state] loaded — issued: ${Object.keys(state.issued).length}, redeemed: ${Object.keys(state.redeemed).length}`);
    }
  } catch (e) { console.error("[state] load error:", e.message); }
}
function saveState() {
  try {
    const soldTo = {};
    for (const item of stock) if (item.soldTo) soldTo[item.key] = item.soldTo;
    fs.writeFileSync(STATE_FILE, JSON.stringify({ issued: state.issued, redeemed: state.redeemed, soldTo }, null, 2));
  } catch (e) { console.error("[state] save error:", e.message); }
}
function availableStock() { return stock.filter(i => !i.soldTo); }
function findStockByKey(key) { for (const item of stock) if (item.key === key) return item; return null; }

// ─── ROBLOX THUMBNAILS ───
const thumbCache = new Map();
const THUMB_TTL = 60 * 60 * 1000;
const THUMB_NEG_TTL = 60 * 1000;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (resp) => {
      let raw = "";
      resp.on("data", (c) => { raw += c; });
      resp.on("end", () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("timeout")));
  });
}

async function getThumbnails(userIds) {
  const now = Date.now();
  const result = {};
  const missing = [];
  for (const id of userIds) {
    const c = thumbCache.get(id);
    if (c && now - c.at < (c.url ? THUMB_TTL : THUMB_NEG_TTL)) { result[id] = c.url; continue; }
    missing.push(id);
  }
  if (missing.length === 0) return result;
  const chunk = missing.slice(0, 100);
  try {
    const data = await fetchJson("https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=" + chunk.join(",") + "&size=150x150&format=Png&isCircular=false");
    if (data && Array.isArray(data.data)) {
      const seen = new Set();
      for (const entry of data.data) {
        seen.add(entry.targetId);
        if (entry.state === "Completed" && entry.imageUrl) {
          result[entry.targetId] = entry.imageUrl;
          thumbCache.set(entry.targetId, { url: entry.imageUrl, at: now });
        } else {
          result[entry.targetId] = null;
          thumbCache.set(entry.targetId, { url: null, at: now });
        }
      }
      for (const uid of chunk) if (!seen.has(uid)) { result[uid] = null; thumbCache.set(uid, { url: null, at: now }); }
    }
  } catch (e) { for (const uid of chunk) if (result[uid] === undefined) result[uid] = null; }
  return result;
}

const LUA_SEARCH_PATHS = [__dirname, path.join(__dirname, "scripts"), path.join(__dirname, "public"), process.cwd()];
function findLuaFile(name) {
  for (const dir of LUA_SEARCH_PATHS) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

// ─── ORDERS ───
const orders = new Map();

// ─── HELPERS ───
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "ScriptHub/1.0" } }, (resp) => {
      let raw = "";
      resp.on("data", (c) => { raw += c; });
      resp.on("end", () => resolve(raw));
    });
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("timeout")));
  });
}

// ─── BLOCKONOMICS API ───
function blockonomicsPost(pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: "www.blockonomics.co", path: pathname, method: "POST",
      headers: {
        "Authorization": "Bearer " + BLOCKONOMICS_API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (resp) => {
      let raw = "";
      resp.on("data", (c) => { raw += c; });
      resp.on("end", () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error("bad json: " + raw.slice(0, 200))); } });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("timeout")));
    req.write(payload);
    req.end();
  });
}

function blockonomicsGet(pathname) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "www.blockonomics.co", path: pathname, method: "GET",
      headers: { "Authorization": "Bearer " + BLOCKONOMICS_API_KEY },
    }, (resp) => {
      let raw = "";
      resp.on("data", (c) => { raw += c; });
      resp.on("end", () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error("bad json: " + raw.slice(0, 200))); } });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function createPaymentAddress(coin) {
  const qs = "?match_callback=" + encodeURIComponent(STORE_CALLBACK) + "&crypto=" + encodeURIComponent(coin);
  const data = await blockonomicsPost("/api/new_address" + qs, {});
  if (!data || !data.address) {
    const err = new Error("Blockonomics: " + JSON.stringify(data));
    err.data = data;
    throw err;
  }
  console.log(`[blockonomics] new ${coin} address: ${data.address}`);
  return data.address;
}

async function getCryptoPriceUsd(coin) {
  try {
    const raw = await fetchText(`https://www.blockonomics.co/api/price?crypto=${encodeURIComponent(coin)}&currency=USD`);
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data[0] && data[0].price) return Number(data[0].price);
    if (data && data.price) return Number(data.price);
  } catch (e) {}
  if (coin === "BTC") {
    try {
      const raw = await fetchText("https://mempool.space/api/v1/prices");
      const data = JSON.parse(raw);
      if (data && data.USD) return data.USD;
    } catch (e) {}
  }
  if (coin === "USDT") return 1;
  throw new Error("Price fetch failed for " + coin);
}

// ─── PAYMENT CHECK ───
async function checkOrderPayment(order) {
  if (order.status === "paid") {
    return { status: "paid", confirmations: order.confirmations || REQUIRED_CONFIRMATIONS, txid: order.txid, keys: order.assignedKeys };
  }
  if (Date.now() > order.expiresAt && order.status !== "paid") {
    order.status = "expired";
    return { status: "expired", confirmations: 0 };
  }

  if (order.coin === "BTC") {
    try {
      const raw = await fetchText(`https://mempool.space/api/address/${encodeURIComponent(order.address)}/txs`);
      const txs = JSON.parse(raw);
      if (!Array.isArray(txs) || txs.length === 0) return { status: "pending", confirmations: 0 };
      const tx = txs[0];
      order.txid = tx.txid;
      if (!tx.status || !tx.status.confirmed) return { status: "mempool", confirmations: 0, txid: tx.txid };
      let tip = tx.status.block_height;
      try {
        const rawTip = await fetchText("https://mempool.space/api/blocks/tip/height");
        tip = parseInt(rawTip.trim(), 10) || tip;
      } catch (e) {}
      const confirmations = Math.max(0, tip - tx.status.block_height + 1);
      order.confirmations = confirmations;
      if (confirmations >= REQUIRED_CONFIRMATIONS) {
        if (order.status !== "paid") { order.status = "paid"; order.paidAt = Date.now(); assignKeysToOrder(order); }
        return { status: "paid", confirmations, txid: tx.txid, keys: order.assignedKeys };
      }
      return { status: "confirming", confirmations, txid: tx.txid };
    } catch (e) { return { status: "pending", confirmations: 0 }; }
  }

  if (!order.txid) {
    return { status: "waiting-wallet", confirmations: 0 };
  }
  try {
    const info = await blockonomicsGet("/api/address?addr=" + encodeURIComponent(order.address));
    const confs = Number(info.confirmations || info.confirmation_count || 0);
    order.confirmations = confs;
    if (confs >= REQUIRED_CONFIRMATIONS) {
      if (order.status !== "paid") { order.status = "paid"; order.paidAt = Date.now(); assignKeysToOrder(order); }
      return { status: "paid", confirmations: confs, txid: order.txid, keys: order.assignedKeys };
    }
    if (confs === 0 && info.tx > 0) return { status: "mempool", confirmations: 0, txid: order.txid };
    if (confs === 0) return { status: "waiting-wallet", confirmations: 0, txid: order.txid };
    return { status: "confirming", confirmations: confs, txid: order.txid };
  } catch (e) {
    return { status: "waiting-wallet", confirmations: 0, txid: order.txid };
  }
}

function assignKeysToOrder(order) {
  if (order.assignedKeys && order.assignedKeys.length > 0) return order.assignedKeys;
  const picked = [];
  for (const item of stock) {
    if (picked.length >= order.qty) break;
    if (item.soldTo) continue;
    picked.push(item);
  }
  if (picked.length < order.qty) console.error(`[order] ${order.id} wants ${order.qty} but only ${picked.length} in stock`);
  const keys = [];
  for (const item of picked) {
    item.soldTo = order.id;
    if (!state.issued[item.key]) state.issued[item.key] = { orderId: order.id, at: Date.now() };
    keys.push(item.key);
  }
  saveState();
  order.assignedKeys = keys;
  console.log(`[order] ${order.id} PAID — issued ${keys.length} keys`);
  return keys;
}

// ─── SHARED CURSOR FOLLOWER (red spotlight, injected into every page) ───
const CURSOR_SCRIPT = `
(function(){
  if (!matchMedia('(pointer:fine)').matches) return;
  if (window.__shCursor) return;
  window.__shCursor = true;

  const glow = document.createElement('div');
  glow.setAttribute('aria-hidden','true');
  glow.style.cssText = [
    'position:fixed','top:0','left:0','width:420px','height:420px',
    'pointer-events:none','z-index:0','opacity:0','border-radius:50%',
    'background:radial-gradient(circle, rgba(255,70,70,0.16) 0%, rgba(230,50,50,0.07) 35%, rgba(200,40,40,0) 70%)',
    'transform:translate3d(0,0,0)','transition:opacity .4s ease','will-change:transform','mix-blend-mode:screen'
  ].join(';');
  document.body.appendChild(glow);

  const dot = document.createElement('div');
  dot.setAttribute('aria-hidden','true');
  dot.style.cssText = [
    'position:fixed','top:0','left:0','width:7px','height:7px',
    'pointer-events:none','z-index:0','opacity:0','border-radius:50%',
    'background:radial-gradient(circle, rgba(255,140,140,0.9) 0%, rgba(230,60,60,0.35) 60%, transparent 100%)',
    'transform:translate3d(0,0,0)','transition:opacity .4s ease, width .2s ease, height .2s ease',
    'will-change:transform','mix-blend-mode:screen','box-shadow:0 0 12px rgba(255,80,80,0.7)'
  ].join(';');
  document.body.appendChild(dot);

  let mx = innerWidth/2, my = innerHeight/2;
  let gx = mx, gy = my, dx = mx, dy = my, visible = false;

  window.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (!visible) { visible = true; glow.style.opacity = '1'; dot.style.opacity = '1'; }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    visible = false; glow.style.opacity = '0'; dot.style.opacity = '0';
  });
  document.addEventListener('mousedown', () => { dot.style.width = '20px'; dot.style.height = '20px'; });
  document.addEventListener('mouseup',   () => { dot.style.width = '7px';  dot.style.height = '7px'; });

  function loop() {
    gx += (mx - gx) * 0.08; gy += (my - gy) * 0.08;
    dx += (mx - dx) * 0.22; dy += (my - dy) * 0.22;
    glow.style.transform = 'translate3d(' + (gx - 210) + 'px,' + (gy - 210) + 'px,0)';
    dot.style.transform  = 'translate3d(' + (dx - 3.5) + 'px,' + (dy - 3.5) + 'px,0)';
    requestAnimationFrame(loop);
  }
  loop();
})();
`;

// ─── PAGE SHELL ───
// NOTE: AdSense Auto Ads script is now injected into every page shell,
// so it loads on /nfa, /cart, /pay/*, /redeem, 404, etc.
function pageShell(title, bodyHtml, extraCss = "", extraJs = "") {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<style>
  *{box-sizing:border-box}
  html{overflow-x:hidden}
  html,body{height:100%;margin:0}
  body{background:#0b0b10;color:#eee;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    position:relative;overflow-x:hidden;min-height:100vh;padding:24px}
  #bg{position:fixed;inset:0;z-index:0;pointer-events:none}
  .orb{position:fixed;border-radius:50%;filter:blur(100px);opacity:0.4;z-index:0;pointer-events:none;will-change:transform}
  .orb1{width:560px;height:560px;background:radial-gradient(circle,#8a5cff,#5a34d6);top:-180px;left:-180px;animation:drift1 24s ease-in-out infinite}
  .orb2{width:640px;height:640px;background:radial-gradient(circle,#2f8fff,#1c5fb3);bottom:-220px;right:-200px;animation:drift2 28s ease-in-out infinite}
  .orb3{width:420px;height:420px;background:radial-gradient(circle,#ff4fa0,#b3306c);top:40%;left:55%;animation:drift3 32s ease-in-out infinite;opacity:0.2}
  @keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(90px,110px) scale(1.15)}}
  @keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-110px,-80px) scale(1.18)}}
  @keyframes drift3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-70px,70px) scale(0.92)}}
  .scanline{position:fixed;inset:0;z-index:0;pointer-events:none;
    background:repeating-linear-gradient(0deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 3px);mix-blend-mode:overlay}
  .vignette{position:fixed;inset:0;z-index:0;pointer-events:none;
    background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,0.75) 100%)}
  .content{position:relative;z-index:1;max-width:880px;margin:0 auto}
  a{color:#b9a3ff}
  .topnav{display:flex;align-items:center;gap:14px;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid rgba(70,70,82,0.4)}
  .topnav-icons{display:flex;gap:10px}
  .topnav-icons a{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;text-decoration:none;transition:transform .2s cubic-bezier(.2,.9,.3,1.1),background .2s,border-color .2s,box-shadow .2s}
  .topnav-icons a:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 10px 24px rgba(0,0,0,0.5)}
  .topnav-icons a.discord{background:rgba(88,101,242,0.12);border:1px solid rgba(88,101,242,0.35)}
  .topnav-icons a.discord:hover{background:rgba(88,101,242,0.28);border-color:rgba(88,101,242,0.8);box-shadow:0 10px 24px rgba(88,101,242,0.35)}
  .topnav-icons a.steam{background:rgba(27,40,56,0.5);border:1px solid rgba(103,150,200,0.35)}
  .topnav-icons a.steam:hover{background:rgba(27,40,56,0.85);border-color:rgba(103,150,200,0.8);box-shadow:0 10px 24px rgba(103,150,200,0.3)}
  .topnav-icons img{width:28px;height:28px;display:block;border-radius:6px;object-fit:contain}
  .topnav-tabs{display:flex;gap:6px;margin-left:auto}
  .topnav-tabs a{padding:9px 18px;border-radius:10px;text-decoration:none;color:#a8a8b8;font-size:13px;font-weight:600;transition:background .15s,color .15s;position:relative}
  .topnav-tabs a:hover{background:rgba(255,255,255,0.05);color:#fff}
  .topnav-tabs a.active{background:linear-gradient(135deg,rgba(120,90,255,0.2),rgba(47,143,255,0.15));color:#fff;border:1px solid rgba(120,90,255,0.35)}
  @media (max-width:520px){.topnav{flex-wrap:wrap;gap:10px}.topnav-tabs{margin-left:0;width:100%;display:grid;grid-template-columns:repeat(3,1fr)}.topnav-tabs a{text-align:center;padding:9px 6px}}
  .tag{display:inline-block;padding:4px 10px;border-radius:6px;background:rgba(200,60,60,0.15);color:#ff7a7a;font-size:11px;font-weight:700;letter-spacing:0.6px;margin-bottom:14px}
  .h1{font-size:26px;font-weight:700;margin:0 0 8px;color:#fff;background:linear-gradient(90deg,#fff,#c5b3ff);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{color:#8a8a9a;font-size:13px;line-height:1.55;margin:0 0 24px;max-width:600px}
  .card{background:rgba(28,28,34,0.7);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(90,90,105,0.55);border-radius:14px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.04)}
  .label{font-size:11px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;margin-bottom:10px}
  .input{width:100%;padding:14px 16px;background:rgba(18,18,24,0.8);border:1px solid rgba(200,60,60,0.6);border-radius:10px;color:#fff;font-family:ui-monospace,monospace;font-size:13px;outline:none;transition:border-color .15s,box-shadow .15s}
  .input:focus{border-color:#e03a3a;box-shadow:0 0 0 3px rgba(224,58,58,0.15)}
  .btn{width:100%;padding:14px;background:linear-gradient(135deg,#e03a3a,#c02626);color:#fff;font-weight:600;font-size:15px;border:none;border-radius:10px;cursor:pointer;box-shadow:0 8px 24px rgba(224,58,58,0.4);transition:filter .15s,transform .15s,box-shadow .2s;font-family:inherit}
  .btn:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 12px 30px rgba(224,58,58,0.5)}
  .btn:active{transform:translateY(0)}
  .btn:disabled{opacity:0.6;cursor:not-allowed;transform:none;filter:none}
  .info{background:rgba(28,28,34,0.55);border:1px solid rgba(70,70,82,0.5);border-radius:12px;padding:16px;color:#a8a8b8;font-size:13px;line-height:1.6;margin-top:16px}
  .info b{color:#fff}
  .help{display:flex;align-items:center;gap:12px;background:rgba(88,101,242,0.08);border:1px solid rgba(88,101,242,0.3);border-radius:12px;padding:14px 18px;color:#cfd5ff;font-size:13px;margin-top:16px;text-decoration:none;transition:background .15s,border-color .15s,transform .15s}
  .help:hover{background:rgba(88,101,242,0.15);border-color:rgba(88,101,242,0.55);transform:translateY(-1px)}
  .help-icon{width:20px;height:20px;flex-shrink:0}
  .result{margin-top:20px;padding:20px;background:rgba(30,58,42,0.3);border:1px solid rgba(125,221,159,0.4);border-radius:12px;display:none}
  .result.error{background:rgba(60,30,30,0.3);border-color:rgba(255,122,122,0.4)}
  .result-title{font-size:14px;font-weight:700;color:#7ddd9f;margin-bottom:12px}
  .result.error .result-title{color:#ff7a7a}
  .cred{font-family:ui-monospace,monospace;font-size:12px;background:rgba(18,18,24,0.9);border:1px solid rgba(70,70,82,0.6);border-radius:8px;padding:14px;color:#b9a3ff;word-break:break-all;line-height:1.5;user-select:all}
  .copy-btn{margin-top:12px;padding:10px 20px;background:rgba(120,90,255,0.2);border:1px solid rgba(120,90,255,0.5);border-radius:8px;color:#b9a3ff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,transform .15s}
  .copy-btn:hover{background:rgba(120,90,255,0.3);transform:translateY(-1px)}
  .conf-tracker{display:flex;justify-content:center;gap:8px;margin:20px 0}
  .conf-dot{width:14px;height:14px;border-radius:50%;background:rgba(70,70,82,0.5);border:2px solid rgba(70,70,82,0.7);transition:all .4s ease}
  .conf-dot.filled{background:#7ddd9f;border-color:#7ddd9f;box-shadow:0 0 12px rgba(125,221,159,0.6)}
  .conf-status{text-align:center;font-size:14px;color:#a8a8b8;margin-top:8px}
  .conf-count{text-align:center;font-size:15px;font-weight:700;color:#fff;margin-top:4px}
  .coin-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
  .coin{display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;background:rgba(18,18,24,0.6);border:2px solid rgba(70,70,82,0.5);cursor:pointer;transition:border-color .15s,background .15s,transform .15s,box-shadow .15s;user-select:none}
  .coin:hover{background:rgba(28,28,34,0.85);transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,0.35)}
  .coin.selected{border-color:#e03a3a;background:rgba(224,58,58,0.12);box-shadow:0 0 0 3px rgba(224,58,58,0.12)}
  .coin-icon{width:32px;height:32px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff}
  .coin-icon.btc{background:linear-gradient(135deg,#f7931a,#ffb84d)}
  .coin-icon.usdt{background:linear-gradient(135deg,#26a17b,#4fcf9b)}
  .coin-meta{flex:1;min-width:0}
  .coin-name{font-size:14px;font-weight:700;color:#fff}
  .coin-desc{font-size:11px;color:#8a8a9a;margin-top:2px}
  @media (max-width:520px){.coin-grid{grid-template-columns:1fr}}
  ${extraCss}
</style></head>
<body>
  <canvas id="bg"></canvas>
  <div class="orb orb1"></div><div class="orb orb2"></div><div class="orb orb3"></div>
  <div class="scanline"></div><div class="vignette"></div>
  <div class="content">${bodyHtml}</div>
<script>
${CURSOR_SCRIPT}
(function(){
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const DPR = Math.max(1, window.devicePixelRatio || 1);
  let W, H;
  function resize(){W = canvas.width = innerWidth*DPR;H = canvas.height = innerHeight*DPR;
    canvas.style.width = innerWidth+'px';canvas.style.height = innerHeight+'px';}
  resize(); addEventListener('resize', resize);
  const N = Math.min(80, Math.max(35, Math.floor(innerWidth/24)));
  const parts = Array.from({length:N}, () => ({
    x:Math.random()*W, y:Math.random()*H,
    vx:(Math.random()-0.5)*0.25*DPR, vy:(Math.random()-0.5)*0.25*DPR,
    r:(Math.random()*1.4+0.6)*DPR, hue:Math.random()<0.5?265:210}));
  const MAX_D = 150*DPR;
  function tick(){
    ctx.clearRect(0,0,W,H);
    for(let i=0;i<parts.length;i++){
      const a=parts[i];
      for(let j=i+1;j<parts.length;j++){
        const b=parts[j]; const dx=a.x-b.x, dy=a.y-b.y; const d2=dx*dx+dy*dy;
        if(d2<MAX_D*MAX_D){
          const alpha=(1-Math.sqrt(d2)/MAX_D)*0.22;
          ctx.strokeStyle='rgba(140,110,255,'+alpha+')'; ctx.lineWidth=0.7*DPR;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();}}
    }
    for(const p of parts){
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>W) p.vx*=-1; if(p.y<0||p.y>H) p.vy*=-1;
      const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);
      grad.addColorStop(0,'hsla('+p.hue+',90%,75%,0.9)');
      grad.addColorStop(1,'hsla('+p.hue+',90%,75%,0)');
      ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*4,0,Math.PI*2); ctx.fill();}
    requestAnimationFrame(tick);}
  tick();
})();
${extraJs}
</script></body></html>`;
}

function topNav(active) {
  const cls = (name) => active === name ? "active" : "";
  return `
    <div class="topnav">
      <div class="topnav-icons">
        <a class="discord" href="https://discord.gg/pZJnYzE7hb" target="_blank" rel="noopener noreferrer" title="Discord">
          <img src="https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/IMG_1454.png" alt="Discord"
               onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/williambredsgaard-blip/serverssszz@main/IMG_1454.png';">
        </a>
        <a class="steam" href="/nfa" title="Steam">
          <img src="https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/steam.png" alt="Steam"
               onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/williambredsgaard-blip/serverssszz@main/steam.png';">
        </a>
      </div>
      <div class="topnav-tabs">
        <a href="/" class="${cls('store')}">Home</a>
        <a href="/nfa" class="${cls('nfa')}">Steam</a>
        <a href="/redeem" class="${cls('redeem')}">Redeem</a>
      </div>
    </div>
  `;
}

// ─── ADS.TXT (required for AdSense site verification) ───
app.get("/ads.txt", (req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(`google.com, ${ADSENSE_PUB_ID}, DIRECT, f08c47fec0942fa0\n`);
});

// ─── /nfa ───
app.get("/nfa", (req, res) => {
  const available = availableStock().length;
  const stockColor = available > 0
    ? "background:rgba(40,90,60,0.6);border:1px solid rgba(90,220,140,0.4);color:#7ddd9f;"
    : "background:rgba(90,40,40,0.6);border:1px solid rgba(220,90,90,0.4);color:#ff9a9a;";
  const stockText = available > 0 ? (available + " in stock") : "Out of stock";

  const html = pageShell("NFA Loader — Roblox Script Hub", `
    ${topNav('nfa')}
    <div class="tag">NFA ACCOUNTS</div>
    <div class="h1">NFA Loader</div>
    <p class="sub">Prime enabled. Delivered instantly after payment. Pay with Bitcoin or USDT.</p>

    <div class="card" style="max-width:480px;border-color:rgba(200,60,60,0.5)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:18px;font-weight:600;color:#fff">CS2 Prime Account</div>
        <div style="${stockColor}padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">● ${stockText}</div>
      </div>
      <div style="color:#8a8a9a;font-size:13px;line-height:1.5;margin-bottom:18px">
        Prime enabled. Premier is not unlocked.
      </div>
      <div style="font-size:32px;font-weight:700;color:#fff;margin-bottom:20px">€<span id="unit">0.87</span></div>
      <div style="display:flex;align-items:center;border:1px solid rgba(90,90,100,0.6);
                  border-radius:10px;overflow:hidden;margin-bottom:20px;background:rgba(18,18,24,0.4)">
        <button onclick="dec()" style="background:transparent;border:none;color:#eee;
                font-size:20px;padding:12px 22px;cursor:pointer;transition:background .15s">−</button>
        <div style="flex:1;text-align:center;font-size:18px;font-weight:600" id="qty">1</div>
        <button onclick="inc()" style="background:transparent;border:none;color:#eee;
                font-size:20px;padding:12px 22px;cursor:pointer;transition:background .15s">+</button>
      </div>
      <button class="btn" onclick="goCart()">Add to cart →</button>
    </div>

    <script>
      let q = 1; const unit = 0.87;
      function render(){document.getElementById('qty').textContent=q;
        document.getElementById('unit').textContent=(unit*q).toFixed(2)}
      function inc(){q=Math.min(q+1,999);render()}
      function dec(){q=Math.max(q-1,1);render()}
      function goCart(){window.location.href='/cart?qty='+q}
      render();
    </script>
  `);
  res.set("Content-Type", "text/html").send(html);
});

// ─── /cart ───
app.get("/cart", (req, res) => {
  const qty = Math.max(1, Math.min(999, parseInt(req.query.qty) || 1));
  const total = (PRODUCT_PRICE_USD * qty).toFixed(2);
  const available = availableStock().length;
  const hasStock = available >= qty;

  const html = pageShell("Cart — Roblox Script Hub", `
    ${topNav('nfa')}
    <div class="tag">NFA ACCOUNTS</div>
    <div class="h1">Your Cart</div>
    <p class="sub">Choose your payment method and review your order.</p>

    <div class="card" style="display:flex;align-items:center;gap:16px;max-width:640px;margin-bottom:20px">
      <div style="width:52px;height:52px;border-radius:10px;background:rgba(200,60,60,0.15);
                  border:1px solid rgba(200,60,60,0.4);display:flex;align-items:center;
                  justify-content:center;font-size:22px">🛒</div>
      <div style="flex:1">
        <div class="label" style="margin:0">Total</div>
        <div style="font-size:22px;font-weight:700;color:#fff">€<span id="cartTotal">${total}</span></div>
      </div>
      <div style="color:#8a8a9a;font-size:13px"><span id="cartQty">${qty}</span> account${qty !== 1 ? "s" : ""}</div>
    </div>

    <div style="max-width:640px;margin-bottom:20px">
      <div class="label">Payment Method</div>
      <div class="coin-grid">
        <div class="coin selected" id="coinBTC" onclick="selectCoin('BTC')">
          <div class="coin-icon btc">₿</div>
          <div class="coin-meta">
            <div class="coin-name">Bitcoin</div>
            <div class="coin-desc">BTC · 2 confirmations</div>
          </div>
        </div>
        <div class="coin" id="coinUSDT" onclick="selectCoin('USDT')">
          <div class="coin-icon usdt">₮</div>
          <div class="coin-meta">
            <div class="coin-name">USDT</div>
            <div class="coin-desc">Tether · Ethereum</div>
          </div>
        </div>
      </div>
    </div>

    ${hasStock ? '' : `<div class="card" style="max-width:640px;border-color:rgba(200,60,60,0.5);color:#ff9a9a;margin-bottom:20px">
      Not enough stock — only ${available} available.
    </div>`}

    <button class="btn" style="max-width:640px" id="payBtn" onclick="checkout()" ${hasStock ? '' : 'disabled'}>Pay with Bitcoin →</button>
    <div id="err" style="color:#ff7a7a;margin-top:16px;display:none;max-width:640px"></div>

    <script>
      const qty = ${qty};
      let coin = 'BTC';

      function selectCoin(c){
        coin = c;
        document.getElementById('coinBTC').classList.toggle('selected', c === 'BTC');
        document.getElementById('coinUSDT').classList.toggle('selected', c === 'USDT');
        document.getElementById('payBtn').textContent = 'Pay with ' + (c === 'BTC' ? 'Bitcoin' : 'USDT') + ' →';
      }

      async function checkout(){
        const btn = document.getElementById('payBtn');
        btn.disabled = true; btn.textContent = 'Creating order...';
        try {
          const r = await fetch('/checkout', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ qty, coin })
          });
          const data = await r.json();
          if (!data.ok) throw new Error(data.error || 'checkout failed');
          window.location.href = '/pay/' + data.orderId;
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Pay with ' + (coin === 'BTC' ? 'Bitcoin' : 'USDT') + ' →';
          document.getElementById('err').style.display = 'block';
          document.getElementById('err').textContent = 'Error: ' + e.message;
        }
      }
    </script>
  `);
  res.set("Content-Type", "text/html").send(html);
});

// ─── /checkout ───
app.post("/checkout", async (req, res) => {
  try {
    const qty = Math.max(1, Math.min(999, parseInt(req.body.qty) || 1));
    let coin = String(req.body.coin || "BTC").toUpperCase();
    if (coin !== "BTC" && coin !== "USDT") coin = "BTC";

    if (availableStock().length < qty) {
      return res.status(400).json({ ok: false, error: `Not enough stock. Only ${availableStock().length} available.` });
    }

    const totalUsd = PRODUCT_PRICE_USD * qty;
    const orderId = "ord_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    const address = await createPaymentAddress(coin);
    const price = await getCryptoPriceUsd(coin);
    const cryptoAmount = coin === "BTC" ? (totalUsd / price).toFixed(8) : (totalUsd / price).toFixed(2);

    const order = {
      id: orderId, qty, coin, totalUsd, cryptoAmount,
      address, status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + PAYMENT_WINDOW_MS,
      txid: null, confirmations: 0, assignedKeys: null,
    };
    orders.set(orderId, order);
    console.log(`[order] created ${orderId} — ${qty} × $${PRODUCT_PRICE_USD} = $${totalUsd} in ${coin} → ${address}`);

    res.json({ ok: true, orderId });
  } catch (e) {
    console.error("[checkout] error:", e.message, e.data || "");
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── /pay/:orderId ───
app.get("/pay/:orderId", (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) {
    return res.status(404).send(pageShell("Order not found — Roblox Script Hub", `
      ${topNav('nfa')}
      <div style="text-align:center;padding:60px 20px">
        <div class="h1">Order not found</div>
        <p class="sub" style="margin:8px auto 20px">This order does not exist or has already expired.</p>
        <a href="/nfa" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#7850ff,#2f8fff);color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Back to NFA</a>
      </div>
    `));
  }

  const required = REQUIRED_CONFIRMATIONS;
  const coinName = order.coin === "BTC" ? "Bitcoin" : "USDT";
  const coinSymbol = order.coin === "BTC" ? "BTC" : "USDT";
  const isBTC = order.coin === "BTC";
  const isUSDT = order.coin === "USDT";

  const qrData = isBTC
    ? `bitcoin:${order.address}?amount=${order.cryptoAmount}`
    : `${order.address}`;
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(qrData);

  let dotsHtml = '';
  for (let i = 0; i < required; i++) dotsHtml += `<div class="conf-dot" data-i="${i+1}"></div>`;

  const usdtWalletNotice = isUSDT ? `
        <div style="margin-top:20px;padding:16px;background:rgba(38,161,123,0.1);
                    border:1px solid rgba(38,161,123,0.35);border-radius:12px;
                    color:#a8d9c8;font-size:13px;line-height:1.6">
          <b style="color:#4fcf9b;display:block;margin-bottom:6px">Pay USDT with a browser wallet</b>
          USDT is an ERC-20 token on Ethereum. You'll need Chui Wallet or any WalletConnect-compatible
          browser wallet to sign the transfer. Use the widget below.
          <div id="usdt-widget-wrap" style="margin-top:14px"></div>
          <div id="walletStatus" style="margin-top:10px;font-size:12px;color:#8a8a9a"></div>
        </div>
  ` : '';

  const widgetScript = isUSDT
    ? `<script src="https://blockonomics.co/js/web3-payment.js"></script>`
    : '';

  const html = pageShell(`Pay ${order.cryptoAmount} ${coinSymbol} — Roblox Script Hub`, `
    ${topNav('nfa')}
    <div style="max-width:560px;margin:0 auto;position:relative">
      <button id="cancelBtn" onclick="cancelOrder()" style="position:absolute;top:16px;left:16px;z-index:2;
              background:transparent;border:1px solid rgba(200,60,60,0.5);color:#ff7a7a;
              padding:6px 14px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;transition:background .15s,transform .15s">
        Cancel Transaction
      </button>
      <div class="card" style="padding:28px" id="payCard">
        <div style="text-align:center;margin-bottom:20px">
          <div style="display:inline-flex;align-items:center;gap:8px;padding:4px 12px;border-radius:20px;
                      background:rgba(224,58,58,0.15);border:1px solid rgba(224,58,58,0.4);
                      font-size:11px;font-weight:700;color:#ff9a9a;text-transform:uppercase;
                      letter-spacing:1px;margin-bottom:12px">
            ${isBTC ? "₿" : "₮"} ${coinName}
          </div>
          <div class="label" style="margin-bottom:6px">Send exactly</div>
          <div style="font-size:26px;font-weight:700;color:#fff">${order.cryptoAmount} <span style="color:#8a8a9a;font-size:16px">${coinSymbol}</span></div>
          <div style="color:#8a8a9a;font-size:12px;margin-top:4px">≈ €${order.totalUsd.toFixed(2)} · ${order.qty} account${order.qty !== 1 ? "s" : ""}</div>
        </div>
        <div style="display:flex;justify-content:center;margin-bottom:20px">
          <img src="${qrUrl}" alt="QR" style="border-radius:12px;background:#fff;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4)"/>
        </div>
        <div class="label">${coinName} Address</div>
        <div id="address" onclick="copyAddr()" style="cursor:pointer;font-family:ui-monospace,monospace;
                    font-size:12px;color:#b9a3ff;background:rgba(18,18,24,0.7);
                    border:1px solid rgba(70,70,82,0.6);border-radius:8px;padding:10px 12px;
                    word-break:break-all;text-align:center;margin-bottom:20px;transition:background .2s,transform .15s">
          ${order.address}
        </div>

        <div style="text-align:center;margin-bottom:10px">
          <div class="label" style="margin-bottom:6px">Time remaining</div>
          <div id="timer" style="font-size:36px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums">15:00</div>
        </div>

        <div style="text-align:center">
          <div class="label" style="margin-bottom:6px">Confirmations (${required} required)</div>
          <div class="conf-tracker" id="confTracker">${dotsHtml}</div>
          <div class="conf-status" id="confStatus">Waiting for payment...</div>
          <div class="conf-count" id="confCount"></div>
        </div>
        ${usdtWalletNotice}
      </div>

      <div class="card" id="keysCard" style="display:none;padding:28px;border-color:rgba(125,221,159,0.5);margin-top:20px">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:44px;margin-bottom:8px">✓</div>
          <div class="h1" style="font-size:20px;text-align:center">Payment confirmed</div>
          <p class="sub" style="text-align:center;margin:8px auto 16px;max-width:100%">
            Save your key${order.qty !== 1 ? "s" : ""} below. Redeem ${order.qty !== 1 ? "each one" : "it"} at
            <a href="/redeem">/redeem</a> to receive your account credential${order.qty !== 1 ? "s" : ""}.
          </p>
        </div>
        <div id="keysList"></div>
        <div style="margin-top:16px;padding:14px;background:rgba(60,40,20,0.3);
                    border:1px solid rgba(220,160,60,0.4);border-radius:10px;
                    color:#e8c07a;font-size:12px;line-height:1.5">
          <b>Important:</b> Screenshot or copy these now. They will not be shown again.
        </div>
      </div>
    </div>

    <div id="modal" style="display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.75);
                backdrop-filter:blur(6px);align-items:center;justify-content:center">
      <div style="max-width:420px;width:calc(100% - 40px);background:rgba(28,28,34,0.95);
                  border:1px solid rgba(70,70,82,0.7);border-radius:16px;padding:32px 28px;text-align:center">
        <div style="display:flex;justify-content:center;margin-bottom:20px">
          <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="#e8564a" stroke-width="3" stroke-linecap="round">
            <circle cx="36" cy="36" r="30"/>
            <line x1="26" y1="26" x2="46" y2="46"/>
            <line x1="46" y1="26" x2="26" y2="46"/>
          </svg>
        </div>
        <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:10px">Payment failed</div>
        <div style="color:#a8a8b8;font-size:14px;line-height:1.55;margin-bottom:24px">
          Transaction canceled because nothing was sent within the 15 minutes time,
          Please contact the owner if you actually sent the ${coinName}.
        </div>
        <a href="/nfa" style="display:inline-block;padding:11px 28px;background:linear-gradient(135deg,#7850ff,#2f8fff);
           color:#fff;font-weight:600;font-size:14px;border-radius:10px;text-decoration:none">Okay</a>
      </div>
    </div>

    <script>
      const ORDER_ID = ${JSON.stringify(order.id)};
      const EXPIRES_AT = ${order.expiresAt};
      const REQUIRED = ${required};
      const IS_USDT = ${isUSDT ? "true" : "false"};
      let cancelled = false, paid = false, lastConf = -1;

      function fmt(ms){const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}

      function tick(){
        if(cancelled||paid)return;
        const left=EXPIRES_AT-Date.now();
        if(left<=0){
          document.getElementById('timer').textContent='00:00';
          if(!paid) document.getElementById('modal').style.display='flex';
          return;
        }
        document.getElementById('timer').textContent=fmt(left);
        setTimeout(tick,250);
      } tick();

      function paintConfirmations(n){
        if (n === lastConf) return;
        lastConf = n;
        const dots = document.querySelectorAll('.conf-dot');
        dots.forEach((d,i) => {
          if (i < n) d.classList.add('filled');
          else d.classList.remove('filled');
        });
        if (n === 0) document.getElementById('confCount').textContent = '';
        else if (n >= REQUIRED) document.getElementById('confCount').textContent = 'Confirmed';
        else document.getElementById('confCount').textContent = n + ' confirmation' + (n === 1 ? '' : 's');
      }

      function showKeys(keys){
        const list = document.getElementById('keysList');
        list.innerHTML = keys.map((k, i) =>
          '<div style="margin-bottom:12px">' +
            '<div style="font-size:11px;color:#8a8a9a;margin-bottom:6px">Key #' + (i+1) + '</div>' +
            '<div class="cred" style="color:#7ddd9f;cursor:pointer" onclick="copyText(this)">' + k + '</div>' +
          '</div>'
        ).join('');
        document.getElementById('payCard').style.display = 'none';
        document.getElementById('keysCard').style.display = 'block';
        document.getElementById('cancelBtn').style.display = 'none';
        window.scrollTo({top:0, behavior:'smooth'});
      }

      window.copyText = function(el){
        navigator.clipboard.writeText(el.textContent);
        const old = el.textContent;
        el.textContent = '✓ Copied!';
        setTimeout(() => el.textContent = old, 1200);
      };

      if (IS_USDT) {
        (function initUsdt() {
          const wrap = document.getElementById('usdt-widget-wrap');
          if (!wrap) return;
          const w = document.createElement('web3-payment');
          w.id = 'web3_payment';
          w.setAttribute('order_amount', ${JSON.stringify(order.cryptoAmount)});
          w.setAttribute('receive_address', ${JSON.stringify(order.address)});
          wrap.appendChild(w);

          function bind() {
            const el = document.getElementById('web3_payment');
            if (!el) return;
            el.onTxnSubmitted = function(result) {
              const { txhash, crypto } = result || {};
              const status = document.getElementById('walletStatus');
              if (status) status.textContent = 'Transaction submitted: ' + (txhash || '');
              document.getElementById('confStatus').textContent = 'Transaction submitted. Waiting for confirmations...';
              fetch('/monitor-usdt/' + ORDER_ID, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txhash, crypto })
              }).then(() => poll()).catch(() => {});
            };
          }
          if (window.customElements && customElements.whenDefined) {
            customElements.whenDefined('web3-payment').then(bind);
          } else {
            setTimeout(bind, 500);
          }
        })();
      }

      async function poll(){
        if(cancelled || paid) return;
        try{
          const r = await fetch('/check-payment/' + ORDER_ID + '?t=' + Date.now());
          const data = await r.json();

          if (data.status === 'paid'){
            paid = true;
            document.getElementById('timer').textContent = '✓';
            document.getElementById('timer').style.color = '#7ddd9f';
            document.getElementById('confStatus').textContent = 'Payment confirmed!';
            paintConfirmations(REQUIRED);
            if (data.keys && data.keys.length > 0) showKeys(data.keys);
            else document.getElementById('confStatus').textContent = 'Payment confirmed, but no stock available. Please contact support.';
            return;
          }

          if (data.status === 'expired'){
            document.getElementById('modal').style.display = 'flex';
            return;
          }

          if (data.status === 'mempool'){
            document.getElementById('confStatus').textContent = 'Payment detected in mempool. Waiting for first confirmation...';
            paintConfirmations(0);
          } else if (data.status === 'confirming'){
            document.getElementById('confStatus').textContent = 'Confirming on the blockchain...';
            paintConfirmations(data.confirmations || 0);
          } else if (data.status === 'waiting-wallet'){
            document.getElementById('confStatus').textContent = IS_USDT
              ? 'Waiting for you to send USDT from your wallet...'
              : 'Waiting for payment...';
          } else {
            document.getElementById('confStatus').textContent = 'Waiting for payment...';
          }

          setTimeout(poll, 5000);
        }catch(e){
          setTimeout(poll, 5000);
        }
      }
      poll();

      function copyAddr(){
        navigator.clipboard.writeText(${JSON.stringify(order.address)});
        const el=document.getElementById('address');
        el.style.background='rgba(120,90,255,0.2)';
        el.style.transform='scale(1.02)';
        setTimeout(()=>{el.style.background='rgba(18,18,24,0.7)';el.style.transform='scale(1)'},300);
      }
      async function cancelOrder(){
        if(paid) return;
        if(!confirm('Cancel this transaction?'))return;
        cancelled=true;
        try{await fetch('/cancel/'+ORDER_ID,{method:'POST'})}catch(e){}
        document.getElementById('timer').textContent='00:00';
        document.getElementById('modal').style.display='flex';
      }
    </script>
    ${widgetScript}
  `);
  res.set("Content-Type", "text/html").send(html);
});

// ─── /check-payment/:orderId ───
app.get("/check-payment/:orderId", async (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.json({ status: "expired" });
  const result = await checkOrderPayment(order);
  res.json(result);
});

// ─── /cancel/:orderId ───
app.post("/cancel/:orderId", (req, res) => {
  const order = orders.get(req.params.orderId);
  if (order && order.status === "pending") order.status = "cancelled";
  res.json({ ok: true });
});

// ─── /monitor-usdt/:orderId ───
app.post("/monitor-usdt/:orderId", async (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).json({ ok: false, error: "order not found" });

  const { txhash } = req.body || {};
  if (!txhash) return res.status(400).json({ ok: false, error: "missing txhash" });

  order.txid = txhash;
  console.log(`[usdt] ${order.id} txhash recorded: ${txhash}`);

  try {
    await blockonomicsPost("/api/monitor_tx", {
      txhash,
      crypto: "USDT",
      addr: order.address,
    });
    console.log(`[usdt] ${order.id} registered with Blockonomics monitor`);
  } catch (e) {
    console.error("[usdt] monitor registration failed:", e.message);
  }

  res.json({ ok: true });
});

// ─── /webhook/blockonomics ───
app.get("/webhook/blockonomics", (req, res) => {
  const addr = req.query.addr;
  const status = parseInt(req.query.status, 10);
  const txid = req.query.txid;
  const crypto = req.query.crypto || "BTC";

  console.log(`[webhook] addr=${addr} crypto=${crypto} status=${status} txid=${txid}`);

  if (addr) {
    for (const [id, order] of orders) {
      if (order.address === addr) {
        if (!isNaN(status) && status >= REQUIRED_CONFIRMATIONS && order.status !== "paid") {
          order.status = "paid";
          order.txid = txid || order.txid;
          order.paidAt = Date.now();
          assignKeysToOrder(order);
        }
        break;
      }
    }
  }
  res.json({ ok: true });
});

// ─── /redeem ───
app.get("/redeem", (req, res) => {
  const html = pageShell("Redeem — Roblox Script Hub", `
    ${topNav('redeem')}
    <div class="tag">NFA ACCOUNTS</div>
    <div class="h1">Redeem &amp; Replacements</div>
    <p class="sub">Redeem the key from your purchase, or request a replacement for an account you already have.</p>

    <div class="card" style="max-width:600px">
      <div class="label">Redeem a Key</div>
      <div style="color:#a8a8b8;font-size:13px;margin-bottom:12px">Your key</div>
      <input id="keyInput" class="input" type="text" placeholder="PREMIER..." autocomplete="off" spellcheck="false">
      <div style="color:#8a8a9a;font-size:12px;margin-top:10px;line-height:1.5">
        One at a time. Redeem only when you are ready to use the account right away.
      </div>
      <button id="redeemBtn" class="btn" style="margin-top:16px" onclick="doRedeem()">Redeem Key</button>

      <div id="result" class="result">
        <div class="result-title" id="resultTitle">Success</div>
        <div id="resultBody"></div>
      </div>
    </div>

    <div class="info" style="max-width:600px">
      <b>One key at a time.</b> Redeem as many as you bought, one after another.
      Each key is single-use and will never deliver twice. Save your credentials immediately after redeeming.
    </div>

    <a class="help" href="https://discord.gg/pZJnYzE7hb" target="_blank" rel="noopener noreferrer" style="max-width:600px">
      <svg class="help-icon" viewBox="0 0 24 24" fill="#cfd5ff">
        <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18.3 18.3 0 0 1 4.4 1.4 13.4 13.4 0 0 0-11.2 0A18.3 18.3 0 0 1 13 3.4 19.8 19.8 0 0 0 8 4.4C2.7 12 .5 19.3 1.7 26.5a19.9 19.9 0 0 0 6 3l1-1.6a13 13 0 0 1-2.3-1.1l.6-.5a14 14 0 0 0 12 0l.6.5a13 13 0 0 1-2.3 1.1l1 1.6a19.9 19.9 0 0 0 6-3C24.6 18.7 22 11.6 20.3 4.4z" transform="translate(0 -2)"/>
      </svg>
      Need help? Open a ticket on Discord
    </a>

    <script>
      async function doRedeem(){
        const btn = document.getElementById('redeemBtn');
        const key = document.getElementById('keyInput').value.trim();
        if (!key) return;
        btn.disabled = true; btn.textContent = 'Redeeming...';
        const result = document.getElementById('result');
        const title = document.getElementById('resultTitle');
        const body = document.getElementById('resultBody');
        try {
          const r = await fetch('/redeem', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ key })
          });
          const data = await r.json();
          if (data.ok) {
            title.textContent = '✓ Success — Save this now';
            result.classList.remove('error');
            body.innerHTML = '<div style="color:#a8a8b8;font-size:13px;margin-bottom:10px">Account credential (click to select, then copy):</div>' +
              '<div class="cred" id="credBox" onclick="copyCred()" style="cursor:pointer">' + data.credential.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</div>' +
              '<button class="copy-btn" onclick="copyCred()">Copy to clipboard</button>' +
              '<div style="color:#8a8a9a;font-size:12px;margin-top:12px">Store this somewhere safe. It will never be shown again.</div>';
            document.getElementById('keyInput').value = '';
            window.__cred = data.credential;
          } else {
            title.textContent = '✗ Failed';
            result.classList.add('error');
            body.innerHTML = '<div style="color:#ff9a9a;font-size:13px">' + (data.error || 'Could not redeem key.').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</div>';
          }
          result.style.display = 'block';
        } catch (e) {
          title.textContent = '✗ Error';
          result.classList.add('error');
          body.innerHTML = '<div style="color:#ff9a9a;font-size:13px">Network error. Try again.</div>';
          result.style.display = 'block';
        }
        btn.disabled = false; btn.textContent = 'Redeem Key';
      }
      function copyCred(){
        if (!window.__cred) return;
        navigator.clipboard.writeText(window.__cred);
      }
      document.getElementById('keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') doRedeem(); });
    </script>
  `);
  res.set("Content-Type", "text/html").send(html);
});

// ─── POST /redeem ───
app.post("/redeem", (req, res) => {
  const key = String(req.body.key || "").trim();
  if (!key) return res.json({ ok: false, error: "No key provided." });

  const item = findStockByKey(key);
  if (!item) return res.json({ ok: false, error: "Invalid key. Please check for typos and try again." });

  if (!state.issued[key]) {
    return res.json({ ok: false, error: "This key has not been purchased yet. If you just paid, wait a moment for confirmations." });
  }

  if (state.redeemed[key]) {
    return res.json({ ok: false, error: "This key has already been redeemed." });
  }

  state.redeemed[key] = { at: Date.now(), ip: req.ip };
  saveState();

  console.log(`[redeem] ${key} redeemed by ${req.ip}`);

  res.json({ ok: true, credential: item.credential });
});

// ─── ROBLOX RELAY ───
function userListPayload() {
  const users = [];
  for (const [ws, info] of wsClients) if (info.userId) users.push({ ...info, transport: "ws" });
  const now = Date.now();
  for (const [uid, entry] of httpClients) if (now - entry.info.ts < STALE_MS) users.push({ ...entry.info, transport: "http" });
  return users;
}
function broadcast(obj, excludeWs) {
  const msg = JSON.stringify(obj);
  for (const [ws] of wsClients) if (ws !== excludeWs && ws.readyState === 1) ws.send(msg);
  for (const [, entry] of httpClients) entry.queue.push(obj);
}
function deliverTo(targetUserId, obj) {
  for (const [ws, info] of wsClients) if (info.userId === targetUserId && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
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
    } else if (data.type === "ping") {
      Object.assign(self, data, { ts: Date.now() });
      ws.send(JSON.stringify({ type: "pong", userId: data.userId }));
      const msg = JSON.stringify({ type: "ping", ...data });
      for (const [otherWs, otherInfo] of wsClients) if (otherWs !== ws && otherInfo.userId && otherWs.readyState === 1) otherWs.send(msg);
      for (const [, entry] of httpClients) entry.queue.push({ type: "ping", ...data });
    } else if (data.type === "requestUserList") {
      ws.send(JSON.stringify({ type: "userList", users: userListPayload() }));
    } else if (data.type === "execute" || data.type === "output") {
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
  if (!entry) { entry = { info: { userId: uid, ts: Date.now(), transport: "http" }, queue: [] }; httpClients.set(uid, entry); broadcast({ type: "userJoined", ...entry.info }, null); }
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
  if (msg.type === "execute" || msg.type === "output") { deliverTo(msg.targetUserId, msg); return res.json({ ok: true }); }
  if (msg.type === "ping" || msg.type === "identify") {
    const entry = httpClients.get(msg.userId);
    if (entry) { Object.assign(entry.info, msg, { ts: Date.now() }); broadcast(msg, null); }
    return res.json({ ok: true });
  }
  if (msg.type === "requestUserList") return res.json({ ok: true, users: userListPayload() });
  res.json({ ok: true });
});

// ─── EXECUTION COUNTER ───
app.post("/execution", (req, res) => { const count = bumpExecutions(); res.json({ ok: true, count }); });
app.get("/stats", (req, res) => res.json({ executions: stats.executions }));
app.post("/stats/reset", (req, res) => { stats.executions = 0; saveStats(); res.json({ ok: true, count: 0 }); });
app.get("/thumbnail", async (req, res) => {
  const uid = parseInt(req.query.userId);
  if (!uid) return res.status(400).json({ ok: false });
  const map = await getThumbnails([uid]);
  res.json({ ok: !!map[uid], url: map[uid] || null });
});

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of httpClients) if (now - entry.info.ts > STALE_MS) { httpClients.delete(uid); broadcast({ type: "userLeft", userId: uid }, null); }
}, 2000);

// ─── LUA FILE SERVING ───
function serveLua(name) {
  return (req, res) => {
    const filePath = findLuaFile(name);
    if (!filePath) return res.status(404).set("Content-Type", "text/plain").send(`-- ${name} not found`);
    try { res.set("Content-Type", "text/plain").send(fs.readFileSync(filePath, "utf8")); }
    catch (e) { res.status(500).set("Content-Type", "text/plain").send(`-- error: ${e.message}`); }
  };
}
app.get("/hubscript.lua", serveLua("hubscript.lua"));
app.get("/controller.lua", serveLua("controller.lua"));
app.get("/ddg.lua", serveLua("ddg.lua"));
app.get("/mm2.lua", serveLua("mm2.lua"));
app.get("/wh.txt", serveLua("wh.txt"));

app.get("/files", (req, res) => {
  const found = {};
  for (const dir of LUA_SEARCH_PATHS) {
    try { found[dir] = fs.readdirSync(dir).filter(f => f.endsWith(".lua") || f.endsWith(".js") || f.endsWith(".txt")); }
    catch (e) { found[dir] = `error: ${e.message}`; }
  }
  res.json({ files: found, stock: stock.length, available: availableStock().length, issued: Object.keys(state.issued).length, redeemed: Object.keys(state.redeemed).length });
});

app.get("/clients", async (req, res) => {
  const users = userListPayload();
  const ids = users.map(u => u.userId).filter(Boolean);
  let thumbs = {};
  if (ids.length > 0) { try { thumbs = await getThumbnails(ids); } catch (e) {} }
  res.json({ users: users.map(u => ({ ...u, thumbnail: thumbs[u.userId] || null })), executions: stats.executions });
});

// ─── MAIN DASHBOARD ───
app.get("/", (req, res) => {
  res.set("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Roblox Script Hub Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<style>
  *{box-sizing:border-box}
  html{overflow-x:hidden}
  html,body{height:100%;margin:0}
  body{
    background:#0b0b10;color:#eee;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    padding:24px 24px 40px;position:relative;overflow-x:hidden;min-height:100vh;
  }
  #bg{position:fixed;inset:0;z-index:0;pointer-events:none}
  .orb{position:fixed;border-radius:50%;filter:blur(110px);opacity:0.42;z-index:0;pointer-events:none;will-change:transform}
  .orb1{width:600px;height:600px;background:radial-gradient(circle,#8a5cff,#4a24c0);top:-200px;left:-200px;animation:drift1 26s ease-in-out infinite}
  .orb2{width:680px;height:680px;background:radial-gradient(circle,#2f8fff,#0d4f99);bottom:-240px;right:-220px;animation:drift2 30s ease-in-out infinite}
  .orb3{width:440px;height:440px;background:radial-gradient(circle,#ff4fa0,#a32866);top:40%;left:55%;animation:drift3 34s ease-in-out infinite;opacity:0.22}
  @keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(100px,120px) scale(1.18)}}
  @keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-120px,-90px) scale(1.2)}}
  @keyframes drift3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-80px,80px) scale(0.9)}}
  .scanline{
    position:fixed;inset:0;z-index:0;pointer-events:none;
    background:repeating-linear-gradient(0deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 3px);
    mix-blend-mode:overlay
  }
  .vignette{
    position:fixed;inset:0;z-index:0;pointer-events:none;
    background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,0.78) 100%)
  }

  .content{position:relative;z-index:1;width:100%;max-width:1500px;margin:0 auto}

  h1{
    font-size:22px;margin:0 0 4px;color:#fff;
    background:linear-gradient(90deg,#fff,#c5b3ff 60%,#8a9fff);
    -webkit-background-clip:text;background-clip:text;color:transparent;
    letter-spacing:0.2px;
  }
  .sub{color:#8a8a9a;font-size:13px;margin-bottom:24px}

  .topnav{
    display:flex;align-items:center;gap:14px;
    margin-bottom:22px;padding-bottom:16px;
    border-bottom:1px solid rgba(70,70,82,0.4);
  }
  .topnav-icons{display:flex;gap:10px;flex-shrink:0}
  .topnav-icons a{
    display:inline-flex;align-items:center;justify-content:center;
    width:42px;height:42px;border-radius:12px;text-decoration:none;
    transition:transform .2s cubic-bezier(.2,.9,.3,1.1),background .2s,box-shadow .2s
  }
  .topnav-icons a.discord{background:rgba(88,101,242,0.12);border:1px solid rgba(88,101,242,0.35)}
  .topnav-icons a.discord:hover{background:rgba(88,101,242,0.28);transform:translateY(-3px) scale(1.05);box-shadow:0 12px 26px rgba(88,101,242,0.4)}
  .topnav-icons a.steam{background:rgba(27,40,56,0.5);border:1px solid rgba(103,150,200,0.35)}
  .topnav-icons a.steam:hover{background:rgba(27,40,56,0.85);transform:translateY(-3px) scale(1.05);box-shadow:0 12px 26px rgba(103,150,200,0.35)}
  .topnav-icons img{width:28px;height:28px;border-radius:6px;object-fit:contain}
  .topnav-tabs{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
  .topnav-tabs a{
    padding:9px 18px;border-radius:10px;text-decoration:none;
    color:#a8a8b8;font-size:13px;font-weight:600;white-space:nowrap;
    transition:background .15s,color .15s,transform .15s,border-color .15s
  }
  .topnav-tabs a:hover{background:rgba(255,255,255,0.05);color:#fff;transform:translateY(-1px)}
  .topnav-tabs a.active{background:linear-gradient(135deg,rgba(120,90,255,0.22),rgba(47,143,255,0.16));color:#fff;border:1px solid rgba(120,90,255,0.4)}

  .header{
    display:flex;justify-content:space-between;align-items:flex-start;
    flex-wrap:wrap;gap:16px;margin-bottom:20px;
  }
  .stats{display:flex;gap:10px;flex-wrap:wrap}
  .stat{
    background:rgba(28,28,34,0.7);
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
    border:1px solid rgba(90,90,105,0.55);
    padding:12px 18px;border-radius:14px;min-width:120px;
    box-shadow:0 8px 24px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.04);
    transition:transform .2s,border-color .2s,box-shadow .2s;
    position:relative;overflow:hidden;
  }
  .stat::before{
    content:'';position:absolute;inset:0;
    background:linear-gradient(135deg,rgba(120,90,255,0.06),transparent 60%);
    pointer-events:none;
  }
  .stat:hover{transform:translateY(-2px);border-color:rgba(120,90,255,0.4);box-shadow:0 12px 30px rgba(120,90,255,0.2),inset 0 1px 0 rgba(255,255,255,0.06)}
  .stat .label{
    font-size:10px;color:#8a8a9a;text-transform:uppercase;
    letter-spacing:1px;font-weight:600;position:relative
  }
  .stat .value{font-size:22px;font-weight:700;color:#fff;margin-top:2px;position:relative}
  .stat .value.accent{color:#c5b3ff;text-shadow:0 0 20px rgba(140,105,255,0.5)}

  /* ── Grid: fixed row height, no stretch, scroll when overflowing ── */
  .grid{
    display:grid;
    grid-template-columns:repeat(auto-fill,minmax(320px,1fr));
    grid-auto-rows:96px;              /* every card slot is exactly 96px tall */
    gap:14px;
    width:100%;
    align-content:start;              /* stop rows from stretching to fill height */
    max-height:460px;                 /* where scrolling kicks in */
    overflow-y:auto;
    overflow-x:hidden;
    padding-right:6px;                /* breathing room for the scrollbar */
    scrollbar-width:thin;
    scrollbar-color:rgba(120,90,255,0.4) rgba(28,28,34,0.4);
  }
  .grid::-webkit-scrollbar{width:8px}
  .grid::-webkit-scrollbar-track{background:rgba(28,28,34,0.4);border-radius:4px}
  .grid::-webkit-scrollbar-thumb{background:rgba(120,90,255,0.4);border-radius:4px}
  .grid::-webkit-scrollbar-thumb:hover{background:rgba(120,90,255,0.65)}

  .card{
    background:rgba(28,28,34,0.6);
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
    border:1px solid rgba(90,90,105,0.5);
    border-radius:14px;padding:16px;
    display:flex;gap:14px;align-items:center;
    transition:transform .2s cubic-bezier(.2,.9,.3,1.1),border-color .2s,box-shadow .25s;
    min-width:0;position:relative;overflow:hidden;
    height:96px;                      /* fixed height — never stretches */
  }
  .card::before{
    content:'';position:absolute;inset:0;border-radius:14px;
    background:linear-gradient(135deg,rgba(120,90,255,0.08),transparent 50%);
    opacity:0;transition:opacity .25s;pointer-events:none;
  }
  .card:hover{transform:translateY(-3px);border-color:rgba(140,105,255,0.55);box-shadow:0 16px 40px rgba(0,0,0,0.4),0 0 0 1px rgba(140,105,255,0.15)}
  .card:hover::before{opacity:1}
  .av{
    width:60px;height:60px;border-radius:12px;background:#2a2a34;
    flex-shrink:0;border:1px solid rgba(120,90,255,0.3);
    object-fit:cover;display:block;position:relative;
    box-shadow:0 4px 12px rgba(0,0,0,0.3);
  }
  .meta{min-width:0;flex:1;position:relative}
  .name{
    font-weight:600;color:#fff;font-size:14px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .game{
    color:#9a9aaa;font-size:12px;margin-top:2px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .badge{
    display:inline-block;padding:2px 8px;border-radius:10px;
    font-size:10px;font-weight:600;text-transform:uppercase;margin-top:6px;
  }
  .ws{background:rgba(30,58,42,0.8);color:#7ddd9f}
  .http{background:rgba(58,47,30,0.8);color:#ddd47f}

  /* ── Empty state: spans full width, fixed modest height, never stretches ── */
  .empty{
    grid-column:1/-1;
    display:flex;align-items:center;justify-content:center;
    height:96px;
    color:#6a6a7a;font-size:14px;text-align:center;
    background:rgba(28,28,34,0.35);
    border:1px dashed rgba(90,90,105,0.5);
    border-radius:14px;
    backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  }

  /* ── Promo slot: neutrally-named so uBlock/EasyList do NOT cosmetic-filter it.
        Reserves real height so no layout jump when AdSense fills or collapses. ── */
  .promo-slot{
    width:100%;
    max-width:970px;
    margin:24px auto 0;
    padding:14px;
    background:rgba(28,28,34,0.4);
    border:1px solid rgba(70,70,82,0.5);
    border-radius:14px;
    text-align:center;
    min-height:120px;
    backdrop-filter:blur(8px);
    -webkit-backdrop-filter:blur(8px);
    overflow:hidden;
    contain:layout;
  }
  .promo-tag{
    font-size:10px;color:#5a5a6a;text-transform:uppercase;
    letter-spacing:1.2px;font-weight:600;margin-bottom:8px;
  }
  .promo-slot .adsbygoogle{
    display:block !important;
    width:100%;
    min-height:90px;
    background:transparent;
  }

  @media (max-width:640px){
    body{padding:16px 16px 32px}
    .content{max-width:100%}
    h1{font-size:18px}
    .sub{font-size:12px;margin-bottom:18px}

    .topnav{
      flex-wrap:wrap;gap:10px;
      padding-bottom:12px;margin-bottom:16px;
    }
    .topnav-tabs{
      margin-left:0;width:100%;
      display:grid;grid-template-columns:repeat(3,1fr);gap:6px;
    }
    .topnav-tabs a{
      text-align:center;padding:9px 4px;font-size:12px;
    }

    .header{flex-direction:column;align-items:stretch;gap:12px;margin-bottom:16px}
    .stats{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .stat{min-width:0;padding:10px 12px}
    .stat .value{font-size:20px}

    .grid{
      grid-template-columns:1fr;gap:10px;
      grid-auto-rows:88px;
      max-height:400px;
    }
    .empty{height:88px;font-size:13px}
    .card{padding:12px;gap:10px;height:88px}
    .av{width:52px;height:52px}
    .name{font-size:13px}
    .game{font-size:11px}

    .promo-slot{
      max-width:100%;
      margin-top:16px;
      min-height:100px;
    }
  }
</style></head>
<body>
  <canvas id="bg"></canvas>
  <div class="orb orb1"></div><div class="orb orb2"></div><div class="orb orb3"></div>
  <div class="scanline"></div><div class="vignette"></div>
  <div class="content">
    <div class="topnav">
      <div class="topnav-icons">
        <a class="discord" href="https://discord.gg/pZJnYzE7hb" target="_blank" rel="noopener noreferrer">
          <img src="https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/IMG_1454.png" alt="Discord"
               onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/williambredsgaard-blip/serverssszz@main/IMG_1454.png';">
        </a>
        <a class="steam" href="/nfa" title="Steam">
          <img src="https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/steam.png" alt="Steam"
               onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/williambredsgaard-blip/serverssszz@main/steam.png';">
        </a>
      </div>
      <div class="topnav-tabs">
        <a href="/" class="active">Home</a>
        <a href="/nfa">Steam</a>
        <a href="/redeem">Redeem</a>
      </div>
    </div>

    <div class="header">
      <div>
        <h1>Roblox Script Hub Dashboard</h1>
        <div class="sub">Live view of every client running the hub script</div>
      </div>
      <div class="stats">
        <div class="stat"><div class="label">Executions</div><div class="value accent" id="exec">0</div></div>
        <div class="stat"><div class="label">Online</div><div class="value" id="count">0</div></div>
      </div>
    </div>

    <div class="grid" id="grid"><div class="empty">No clients connected</div></div>

    <div class="promo-slot" id="promoSlot">
      <div class="promo-tag">Sponsored</div>
      <!--
        Replace data-ad-slot with your real AdSense ad unit ID.
        "0000000000" is a placeholder and will never serve a real ad.
      -->
      <ins class="adsbygoogle"
           style="display:block;width:100%;min-height:90px"
           data-ad-client="${ADSENSE_CLIENT}"
           data-ad-slot="0000000000"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  </div>
<script>
${CURSOR_SCRIPT}
const FB = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" rx="10" fill="#2a2a34"/><text x="28" y="37" font-family="sans-serif" font-size="24" font-weight="600" fill="#8a8a9a" text-anchor="middle">?</text></svg>');
(function(){
  const c=document.getElementById('bg');if(!c)return;
  const ctx=c.getContext('2d');const D=Math.max(1,devicePixelRatio||1);let W,H;
  function rz(){W=c.width=innerWidth*D;H=c.height=innerHeight*D;
    c.style.width=innerWidth+'px';c.style.height=innerHeight+'px'}
  rz();addEventListener('resize',rz);
  const N=Math.min(90,Math.max(40,Math.floor(innerWidth/22)));
  const P=Array.from({length:N},()=>({
    x:Math.random()*W,y:Math.random()*H,
    vx:(Math.random()-.5)*.25*D,vy:(Math.random()-.5)*.25*D,
    r:(Math.random()*1.4+.6)*D,h:Math.random()<.5?265:210
  }));
  const MD=150*D;
  function tk(){
    ctx.clearRect(0,0,W,H);
    for(let i=0;i<P.length;i++){
      const a=P[i];
      for(let j=i+1;j<P.length;j++){
        const b=P[j];const dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy;
        if(d2<MD*MD){
          const al=(1-Math.sqrt(d2)/MD)*.22;
          ctx.strokeStyle='rgba(140,110,255,'+al+')';
          ctx.lineWidth=.7*D;
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        }
      }
    }
    for(const p of P){
      p.x+=p.vx;p.y+=p.vy;
      if(p.x<0||p.x>W)p.vx*=-1;
      if(p.y<0||p.y>H)p.vy*=-1;
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);
      g.addColorStop(0,'hsla('+p.h+',90%,75%,.9)');
      g.addColorStop(1,'hsla('+p.h+',90%,75%,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r*4,0,Math.PI*2);ctx.fill();
    }
    requestAnimationFrame(tk)
  }
  tk()
})();

// AdSense push — wrapped so a throw can never kill the client-list renderer below.
(function(){
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) {
    // AdSense not ready / blocked — safe to ignore, layout keeps its reserved height.
  }
})();

async function rf(){
  try{
    const r=await fetch('/clients?t='+Date.now());
    const d=await r.json();
    const u=d.users||[];
    document.getElementById('count').textContent=u.length;
    document.getElementById('exec').textContent=(d.executions??0).toLocaleString();
    const g=document.getElementById('grid');
    if(u.length===0){g.innerHTML='<div class="empty">No clients connected</div>';return}
    g.innerHTML=u.map(x=>{
      const t=x.thumbnail||FB;
      const b=x.transport==='ws'?'<span class="badge ws">ws</span>':'<span class="badge http">http</span>';
      const p=x.placeId?('Place '+x.placeId):'Unknown';
      const n=(x.displayName||('User '+x.userId)).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
      return '<div class="card"><img class="av" src="'+t+'" onerror="this.src=\\''+FB+'\\'"><div class="meta"><div class="name">'+n+'</div><div class="game">'+p+'</div>'+b+'</div></div>';
    }).join('');
  }catch(e){
    document.getElementById('grid').innerHTML='<div class="empty">Error: '+e.message+'</div>';
  }
}
rf();
setInterval(rf,2000);
</script></body></html>`);
});

// ─── 404 ───
app.use((req, res) => {
  const safePath = String(req.originalUrl || "/").replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  res.status(404).set("Content-Type", "text/html").send(pageShell("Not Found — Roblox Script Hub", `
    ${topNav('none')}
    <div style="max-width:520px;margin:0 auto;text-align:center;padding:36px 24px">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;
                  border-radius:16px;margin-bottom:16px;background:rgba(120,90,255,0.14);border:1px solid rgba(120,90,255,0.4)">
        <svg viewBox="0 0 24 24" style="width:34px;height:34px;stroke:#b9a3ff;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round">
          <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/>
          <circle cx="12" cy="16.5" r="0.9" fill="#b9a3ff" stroke="none"/>
        </svg>
      </div>
      <div class="h1" style="text-align:center">Page Not Found</div>
      <p class="sub" style="text-align:center;margin:8px auto 20px">The link you tried to go to doesn't exist yet. Please try again later.</p>
      <div style="display:inline-block;padding:8px 14px;background:rgba(18,18,24,0.7);border:1px solid rgba(70,70,82,0.6);
                  border-radius:8px;font-family:ui-monospace,monospace;font-size:12px;color:#8a8a9a;margin-bottom:22px">${safePath}</div>
      <div><a href="/" style="display:inline-block;padding:11px 28px;background:linear-gradient(135deg,#7850ff,#2f8fff);
         color:#fff;font-weight:600;font-size:14px;border-radius:10px;text-decoration:none">Okay</a></div>
    </div>
  `));
});

// ─── BOOT ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log("Relay on " + PORT);
  loadState();
  console.log(`[boot] store callback configured as: ${STORE_CALLBACK}`);
  console.log(`[boot] ads.txt will serve: google.com, ${ADSENSE_PUB_ID}, DIRECT, f08c47fec0942fa0`);
  console.log(`[boot] Auto Ads client: ${ADSENSE_CLIENT}`);
});
