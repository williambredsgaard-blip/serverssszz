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

// ─── CONFIG — EDIT THESE ───
const BLOCKONOMICS_API_KEY = process.env.BLOCKONOMICS_API_KEY || "YOUR_BLOCKONOMICS_API_KEY";
const PRODUCT_PRICE_USD = 0.87;
const PRODUCT_NAME = "CS2 Prime Account";
const PAYMENT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ─── Persistent executions counter ───
const STATS_FILE = path.join(__dirname, "stats.json");
let stats = { executions: 0 };
try {
  if (fs.existsSync(STATS_FILE)) {
    stats = Object.assign(stats, JSON.parse(fs.readFileSync(STATS_FILE, "utf8")));
  }
} catch (e) { console.error("[stats] load error:", e.message); }

let saveTimer = null;
function saveStats() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); }
    catch (e) { console.error("[stats] save error:", e.message); }
  }, 500);
}

function bumpExecutions() {
  stats.executions += 1;
  saveStats();
  return stats.executions;
}

process.on("SIGINT", () => { try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); } catch {} process.exit(0); });
process.on("SIGTERM", () => { try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); } catch {} process.exit(0); });

// ─── Roblox thumbnail proxy (with cache) ───
const thumbCache = new Map();
const THUMB_TTL   = 60 * 60 * 1000;
const THUMB_NEG_TTL = 60 * 1000;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (resp) => {
      let raw = "";
      resp.on("data", (chunk) => { raw += chunk; });
      resp.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error("bad json: " + raw.slice(0, 120))); }
      });
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
    if (c) {
      const ttl = c.url ? THUMB_TTL : THUMB_NEG_TTL;
      if (now - c.at < ttl) {
        result[id] = c.url;
        continue;
      }
    }
    missing.push(id);
  }

  if (missing.length === 0) return result;

  const chunk = missing.slice(0, 100);
  try {
    const data = await fetchJson(
      "https://thumbnails.roblox.com/v1/users/avatar-headshot" +
      "?userIds=" + chunk.join(",") +
      "&size=150x150&format=Png&isCircular=false"
    );
    if (data && Array.isArray(data.data)) {
      const seen = new Set();
      for (const entry of data.data) {
        const uid = entry.targetId;
        seen.add(uid);
        if (entry.state === "Completed" && entry.imageUrl) {
          result[uid] = entry.imageUrl;
          thumbCache.set(uid, { url: entry.imageUrl, at: now });
        } else {
          result[uid] = null;
          thumbCache.set(uid, { url: null, at: now });
        }
      }
      for (const uid of chunk) {
        if (!seen.has(uid)) {
          result[uid] = null;
          thumbCache.set(uid, { url: null, at: now });
        }
      }
    }
  } catch (e) {
    console.error("[thumbnails] fetch failed:", e.message);
    for (const uid of chunk) if (result[uid] === undefined) result[uid] = null;
  }

  return result;
}

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

// ─── ORDERS (in-memory; swap for SQLite in production) ───
const orders = new Map();

// ─── BLOCKONOMICS API helpers ───
function blockonomicsPost(pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: "www.blockonomics.co",
      path: pathname,
      method: "POST",
      headers: {
        "Authorization": "Bearer " + BLOCKONOMICS_API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (resp) => {
      let raw = "";
      resp.on("data", (c) => { raw += c; });
      resp.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error("blockonomics bad json: " + raw.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("blockonomics timeout")));
    req.write(payload);
    req.end();
  });
}

function blockonomicsGet(pathname) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "www.blockonomics.co",
      path: pathname,
      method: "GET",
      headers: { "Authorization": "Bearer " + BLOCKONOMICS_API_KEY },
    }, (resp) => {
      let raw = "";
      resp.on("data", (c) => { raw += c; });
      resp.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error("blockonomics bad json: " + raw.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("blockonomics timeout")));
    req.end();
  });
}

async function createBitcoinAddress(orderId) {
  const data = await blockonomicsPost("/api/new_address", {
    match_callback: "https://serverssszz.onrender.com/webhook/blockonomics?order=" + orderId,
  });
  if (!data || !data.address) {
    throw new Error("Blockonomics did not return an address: " + JSON.stringify(data));
  }
  return data.address;
}

async function getBtcPriceUsd() {
  const data = await blockonomicsGet("/api/price?currency=USD");
  if (Array.isArray(data) && data[0] && data[0].price) return data[0].price;
  if (data && data.price) return data.price;
  throw new Error("Could not fetch BTC price: " + JSON.stringify(data));
}

// ─── Shared page shell (background + fonts) ───
function pageShell(title, bodyHtml, extraCss = "", extraJs = "") {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  html,body{height:100%;margin:0}
  body{background:#0b0b10;color:#eee;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    position:relative;overflow-x:hidden;min-height:100vh;padding:24px}
  #bg{position:fixed;inset:0;z-index:0;pointer-events:none}
  .orb{position:fixed;border-radius:50%;filter:blur(90px);opacity:0.35;
    z-index:0;pointer-events:none;will-change:transform}
  .orb1{width:480px;height:480px;background:#7850ff;top:-140px;left:-140px;
    animation:drift1 22s ease-in-out infinite}
  .orb2{width:560px;height:560px;background:#2f8fff;bottom:-180px;right:-160px;
    animation:drift2 26s ease-in-out infinite}
  .orb3{width:360px;height:360px;background:#ff4fa0;top:40%;left:55%;
    animation:drift3 30s ease-in-out infinite;opacity:0.18}
  @keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(70px,90px) scale(1.1)}}
  @keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-90px,-60px) scale(1.15)}}
  @keyframes drift3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-60px,60px) scale(0.9)}}
  .scanline{position:fixed;inset:0;z-index:0;pointer-events:none;
    background:repeating-linear-gradient(0deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 3px);
    mix-blend-mode:overlay}
  .vignette{position:fixed;inset:0;z-index:0;pointer-events:none;
    background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.7) 100%)}
  .content{position:relative;z-index:1;max-width:880px;margin:0 auto}
  a{color:#b9a3ff}
  ${extraCss}
</style></head>
<body>
  <canvas id="bg"></canvas>
  <div class="orb orb1"></div><div class="orb orb2"></div><div class="orb orb3"></div>
  <div class="scanline"></div><div class="vignette"></div>
  <div class="content">${bodyHtml}</div>
<script>
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

// ─── Product page ───
app.get("/product", (req, res) => {
  const html = pageShell("Buy CS2 Prime Accounts", `
    <a href="/" style="color:#8a8a9a;text-decoration:none;font-size:13px">← Back to dashboard</a>
    <h1 style="font-size:24px;margin:16px 0 4px;color:#fff">Counter-Strike 2 — Prime Accounts</h1>
    <p style="color:#8a8a9a;font-size:13px;margin:0 0 24px">Prime enabled. Delivered instantly after payment.</p>

    <div style="background:rgba(28,28,34,0.7);backdrop-filter:blur(14px);
                border:1px solid rgba(200,60,60,0.5);border-radius:16px;padding:24px;
                max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:18px;font-weight:600;color:#fff">CS2 Prime Account</div>
        <div style="background:rgba(40,90,60,0.6);border:1px solid rgba(90,220,140,0.4);
                    color:#7ddd9f;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">
          ● 138
        </div>
      </div>
      <div style="color:#8a8a9a;font-size:13px;line-height:1.5;margin-bottom:18px">
        Prime enabled. Premier is not unlocked.
      </div>
      <div style="font-size:32px;font-weight:700;color:#fff;margin-bottom:20px">
        €<span id="unit">0.87</span>
      </div>

      <div style="display:flex;align-items:center;border:1px solid rgba(90,90,100,0.6);
                  border-radius:10px;overflow:hidden;margin-bottom:20px">
        <button onclick="dec()" style="background:transparent;border:none;color:#eee;
                font-size:20px;padding:12px 22px;cursor:pointer;flex:0 0 auto">−</button>
        <div style="flex:1;text-align:center;font-size:18px;font-weight:600" id="qty">1</div>
        <button onclick="inc()" style="background:transparent;border:none;color:#eee;
                font-size:20px;padding:12px 22px;cursor:pointer;flex:0 0 auto">+</button>
      </div>

      <button onclick="goCart()" style="width:100%;padding:14px;background:#e03a3a;
              color:#fff;font-weight:600;font-size:15px;border:none;border-radius:10px;
              cursor:pointer;box-shadow:0 8px 24px rgba(224,58,58,0.4)">
        Add to cart →
      </button>
    </div>

    <script>
      let q = 1;
      const unit = 0.87;
      function render(){
        document.getElementById('qty').textContent = q;
        document.getElementById('unit').textContent = (unit * q).toFixed(2);
      }
      function inc(){ q = Math.min(q + 1, 999); render(); }
      function dec(){ q = Math.max(q - 1, 1); render(); }
      function goCart(){
        window.location.href = '/cart?qty=' + q;
      }
      render();
    </script>
  `);
  res.set("Content-Type", "text/html").send(html);
});

// ─── Cart page ───
app.get("/cart", (req, res) => {
  const qty = Math.max(1, Math.min(999, parseInt(req.query.qty) || 1));
  const total = (PRODUCT_PRICE_USD * qty).toFixed(2);

  const html = pageShell("Cart — Script Hub", `
    <a href="/product" style="color:#8a8a9a;text-decoration:none;font-size:13px">← Back to product</a>
    <h1 style="font-size:22px;margin:16px 0 24px;color:#fff">Your Cart</h1>

    <div style="background:rgba(28,28,34,0.75);backdrop-filter:blur(14px);
                border:1px solid rgba(70,70,82,0.6);border-radius:14px;padding:20px;
                display:flex;align-items:center;gap:16px;max-width:640px;margin-bottom:20px">
      <div style="width:52px;height:52px;border-radius:10px;background:rgba(200,60,60,0.15);
                  border:1px solid rgba(200,60,60,0.4);display:flex;align-items:center;
                  justify-content:center;font-size:22px">🛒</div>
      <div style="flex:1">
        <div style="font-size:12px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1px;
                    font-weight:600">Total</div>
        <div style="font-size:22px;font-weight:700;color:#fff">€<span id="cartTotal">${total}</span></div>
      </div>
      <div style="color:#8a8a9a;font-size:13px"><span id="cartQty">${qty}</span> account${qty !== 1 ? "s" : ""}</div>
    </div>

    <button onclick="checkout()" style="padding:14px 28px;background:#e03a3a;color:#fff;
            font-weight:600;font-size:15px;border:none;border-radius:10px;cursor:pointer;
            box-shadow:0 8px 24px rgba(224,58,58,0.4)">
      Go to cart → Pay with Bitcoin
    </button>

    <div id="err" style="color:#ff7a7a;margin-top:16px;display:none"></div>

    <script>
      const qty = ${qty};
      async function checkout(){
        const btn = event.target;
        btn.disabled = true;
        btn.textContent = 'Creating order...';
        try {
          const r = await fetch('/checkout', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ qty })
          });
          const data = await r.json();
          if (!data.ok) throw new Error(data.error || 'checkout failed');
          window.location.href = '/pay/' + data.orderId;
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Go to cart → Pay with Bitcoin';
          document.getElementById('err').style.display = 'block';
          document.getElementById('err').textContent = 'Error: ' + e.message;
        }
      }
    </script>
  `);
  res.set("Content-Type", "text/html").send(html);
});

// ─── Create order + get BTC address ───
app.post("/checkout", async (req, res) => {
  try {
    const qty = Math.max(1, Math.min(999, parseInt(req.body.qty) || 1));
    const totalUsd = PRODUCT_PRICE_USD * qty;

    const orderId = "ord_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    const address = await createBitcoinAddress(orderId);
    const btcPrice = await getBtcPriceUsd();
    const btcAmount = (totalUsd / btcPrice).toFixed(8);

    const order = {
      id: orderId,
      qty,
      totalUsd,
      btcAmount,
      btcPrice,
      address,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + PAYMENT_WINDOW_MS,
      txid: null,
    };
    orders.set(orderId, order);

    console.log(`[order] created ${orderId} — ${qty} × $${PRODUCT_PRICE_USD} = $${totalUsd} = ${btcAmount} BTC → ${address}`);

    res.json({ ok: true, orderId });
  } catch (e) {
    console.error("[checkout] error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Payment page ───
app.get("/pay/:orderId", (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) {
    return res.status(404).send(pageShell("Order not found", `
      <div style="text-align:center;padding:60px 20px">
        <h1 style="color:#fff">Order not found</h1>
        <p style="color:#8a8a9a">This order does not exist or has already expired.</p>
        <a href="/product" style="display:inline-block;margin-top:16px;padding:12px 24px;
           background:#7850ff;color:#fff;border-radius:8px;text-decoration:none">Back to product</a>
      </div>
    `));
  }

  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" +
    encodeURIComponent("bitcoin:" + order.address + "?amount=" + order.btcAmount);

  const html = pageShell(`Pay ${order.btcAmount} BTC`, `
    <div style="max-width:560px;margin:0 auto;background:rgba(28,28,34,0.78);
                backdrop-filter:blur(16px);border:1px solid rgba(70,70,82,0.6);
                border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.55)">

      <button id="cancelBtn" onclick="cancelOrder()" style="position:absolute;top:18px;left:18px;
              background:transparent;border:1px solid rgba(200,60,60,0.5);color:#ff7a7a;
              padding:6px 14px;border-radius:8px;font-size:12px;cursor:pointer">
        Cancel Transaction
      </button>

      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:12px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1.2px;
                    font-weight:600;margin-bottom:6px">Send exactly</div>
        <div style="font-size:26px;font-weight:700;color:#fff">
          ${order.btcAmount} <span style="color:#8a8a9a;font-size:16px">BTC</span>
        </div>
        <div style="color:#8a8a9a;font-size:12px;margin-top:4px">≈ €${order.totalUsd.toFixed(2)} · ${order.qty} account${order.qty !== 1 ? "s" : ""}</div>
      </div>

      <div style="display:flex;justify-content:center;margin-bottom:20px">
        <img src="${qrUrl}" alt="Bitcoin QR" style="border-radius:12px;background:#fff;padding:8px"/>
      </div>

      <div style="font-size:12px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1.2px;
                  font-weight:600;margin-bottom:6px">Bitcoin Address</div>
      <div id="address" onclick="copyAddr()" style="cursor:pointer;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
                  font-size:12px;color:#b9a3ff;background:rgba(18,18,24,0.7);
                  border:1px solid rgba(70,70,82,0.6);border-radius:8px;padding:10px 12px;
                  word-break:break-all;text-align:center;margin-bottom:20px;
                  transition:background .2s" title="Click to copy">
        ${order.address}
      </div>

      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:12px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1.2px;
                    font-weight:600;margin-bottom:6px">Time remaining</div>
        <div id="timer" style="font-size:36px;font-weight:700;color:#fff;
                    font-variant-numeric:tabular-nums">15:00</div>
      </div>

      <div id="status" style="text-align:center;color:#8a8a9a;font-size:13px">
        Waiting for payment...
      </div>
    </div>

    <!-- Timeout modal -->
    <div id="modal" style="display:none;position:fixed;inset:0;z-index:50;
                background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);
                align-items:center;justify-content:center">
      <div style="max-width:420px;width:calc(100% - 40px);background:rgba(28,28,34,0.95);
                  border:1px solid rgba(70,70,82,0.7);border-radius:16px;padding:28px;
                  text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.6)">
        <div style="font-size:40px;margin-bottom:12px">⏰</div>
        <div style="font-size:17px;font-weight:600;color:#fff;margin-bottom:12px">Transaction Cancelled</div>
        <div style="color:#a8a8b8;font-size:14px;line-height:1.55;margin-bottom:20px">
          Transaction canceled because nothing was sent within the 15 minutes time,
          Please contact the owner if you actually sent the Bitcoin.
        </div>
        <a href="/" style="display:inline-block;padding:11px 28px;
           background:linear-gradient(135deg,#7850ff,#2f8fff);color:#fff;
           font-weight:600;font-size:14px;border-radius:10px;text-decoration:none;
           box-shadow:0 8px 24px rgba(120,80,255,0.4)">Okay</a>
      </div>
    </div>

    <script>
      const ORDER_ID = ${JSON.stringify(order.id)};
      const EXPIRES_AT = ${order.expiresAt};
      let cancelled = false;
      let paid = false;

      function fmt(ms){
        const s = Math.max(0, Math.floor(ms/1000));
        return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
      }

      function tick(){
        if (cancelled || paid) return;
        const left = EXPIRES_AT - Date.now();
        if (left <= 0){
          document.getElementById('timer').textContent = '00:00';
          document.getElementById('modal').style.display = 'flex';
          return;
        }
        document.getElementById('timer').textContent = fmt(left);
        setTimeout(tick, 250);
      }
      tick();

      async function poll(){
        if (cancelled || paid) return;
        try {
          const r = await fetch('/check-payment/' + ORDER_ID + '?t=' + Date.now());
          const data = await r.json();
          if (data.status === 'paid'){
            paid = true;
            document.getElementById('timer').textContent = '✓';
            document.getElementById('timer').style.color = '#7ddd9f';
            document.getElementById('status').textContent = 'Payment received! Thank you.';
            document.getElementById('cancelBtn').style.display = 'none';
            return;
          }
          if (data.status === 'expired'){
            document.getElementById('modal').style.display = 'flex';
            return;
          }
        } catch (e) { /* ignore */ }
        setTimeout(poll, 10000);
      }
      poll();

      function copyAddr(){
        navigator.clipboard.writeText(${JSON.stringify(order.address)});
        const el = document.getElementById('address');
        el.style.background = 'rgba(120,90,255,0.2)';
        setTimeout(() => el.style.background = 'rgba(18,18,24,0.7)', 300);
      }

      async function cancelOrder(){
        if (!confirm('Cancel this transaction? Your order will be removed.')) return;
        cancelled = true;
        try {
          await fetch('/cancel/' + ORDER_ID, { method: 'POST' });
        } catch (e) {}
        document.getElementById('timer').textContent = '00:00';
        document.getElementById('modal').style.display = 'flex';
      }
    </script>
  `);
  res.set("Content-Type", "text/html").send(html);
});

// ─── Poll for payment status (called by the payment page) ───
app.get("/check-payment/:orderId", async (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.json({ status: "expired" });

  if (order.status === "paid") return res.json({ status: "paid" });

  if (Date.now() > order.expiresAt && order.status === "pending") {
    order.status = "expired";
    return res.json({ status: "expired" });
  }

  // Ask Blockonomics whether the address has received anything
  try {
    const data = await blockonomicsGet("/api/address?addr=" + encodeURIComponent(order.address));
    const txCount = (data && data.tx || 0);
    if (txCount > 0 && order.status !== "paid") {
      order.status = "paid";
      order.txid = data && data.tx_list && data.tx_list[0] && data.tx_list[0].txid;
      console.log(`[order] ${order.id} marked PAID (tx: ${order.txid})`);
      return res.json({ status: "paid", txid: order.txid });
    }
  } catch (e) {
    console.error("[check-payment] blockonomics error:", e.message);
  }

  res.json({ status: "pending" });
});

// ─── Cancel order ───
app.post("/cancel/:orderId", (req, res) => {
  const order = orders.get(req.params.orderId);
  if (order && order.status === "pending") {
    order.status = "cancelled";
    console.log(`[order] ${order.id} cancelled by user`);
  }
  res.json({ ok: true });
});

// ─── Blockonomics webhook (fires when payment hits mempool / confirms) ───
app.get("/webhook/blockonomics", (req, res) => {
  const orderId = req.query.order;
  const status = parseInt(req.query.status, 10);
  const order = orders.get(orderId);

  console.log(`[webhook] blockonomics order=${orderId} status=${status}`);

  if (order) {
    if (status === 0 || status === 1) {
      order.status = "paid";
      order.txid = req.query.txid || null;
      console.log(`[webhook] ${orderId} marked PAID (mempool)`);
    } else if (status === 2) {
      order.status = "paid";
      order.txid = req.query.txid || order.txid;
      console.log(`[webhook] ${orderId} confirmed on-chain`);
    }
  }

  res.json({ ok: true });
});

// ─── Existing endpoints below (unchanged) ───

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

app.post("/execution", (req, res) => {
  const count = bumpExecutions();
  const body = req.body || {};
  console.log(`[execution] +1 → ${count}${body.userId ? ` (user ${body.userId})` : ""}`);
  res.json({ ok: true, count });
});

app.get("/stats", (req, res) => {
  res.json({ executions: stats.executions });
});

app.post("/stats/reset", (req, res) => {
  stats.executions = 0;
  saveStats();
  res.json({ ok: true, count: 0 });
});

app.get("/thumbnail", async (req, res) => {
  const uid = parseInt(req.query.userId);
  if (!uid) return res.status(400).json({ ok: false, error: "missing userId" });
  const map = await getThumbnails([uid]);
  res.json({ ok: !!map[uid], url: map[uid] || null });
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
app.get("/ddg.lua",        serveLua("ddg.lua"));
app.get("/mm2.lua",        serveLua("mm2.lua"));
app.get("/wh.txt",         serveLua("wh.txt"));

app.get("/files", (req, res) => {
  const found = {};
  for (const dir of LUA_SEARCH_PATHS) {
    try {
      const entries = fs.readdirSync(dir).filter(f => f.endsWith(".lua") || f.endsWith(".js") || f.endsWith(".txt"));
      found[dir] = entries;
    } catch (e) {
      found[dir] = `error: ${e.message}`;
    }
  }
  res.json({ searchPaths: LUA_SEARCH_PATHS, files: found, cwd: process.cwd(), dirname: __dirname });
});

app.get("/clients", async (req, res) => {
  const users = userListPayload();
  const ids = users.map(u => u.userId).filter(Boolean);
  let thumbs = {};
  if (ids.length > 0) {
    try { thumbs = await getThumbnails(ids); }
    catch (e) { console.error("[clients] thumb fetch error:", e.message); }
  }
  const enriched = users.map(u => ({
    ...u,
    thumbnail: thumbs[u.userId] || null,
  }));
  res.json({ users: enriched, executions: stats.executions });
});

app.get("/", (req, res) => {
  res.set("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Script Hub Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4246726390307705" crossorigin="anonymous"></script>
<style>
  *{box-sizing:border-box}
  html,body{height:100%}
  body{background:#0b0b10;color:#eee;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    margin:0;padding:24px;position:relative;overflow-x:hidden;min-height:100vh}
  #bg{position:fixed;inset:0;z-index:0;pointer-events:none}
  .orb{position:fixed;border-radius:50%;filter:blur(90px);opacity:0.35;
    z-index:0;pointer-events:none;will-change:transform}
  .orb1{width:480px;height:480px;background:#7850ff;top:-140px;left:-140px;animation:drift1 22s ease-in-out infinite}
  .orb2{width:560px;height:560px;background:#2f8fff;bottom:-180px;right:-160px;animation:drift2 26s ease-in-out infinite}
  .orb3{width:360px;height:360px;background:#ff4fa0;top:40%;left:55%;animation:drift3 30s ease-in-out infinite;opacity:0.18}
  @keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(70px,90px) scale(1.1)}}
  @keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-90px,-60px) scale(1.15)}}
  @keyframes drift3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-60px,60px) scale(0.9)}}
  .scanline{position:fixed;inset:0;z-index:0;pointer-events:none;
    background:repeating-linear-gradient(0deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 3px);
    mix-blend-mode:overlay}
  .vignette{position:fixed;inset:0;z-index:0;pointer-events:none;
    background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.6) 100%)}
  .content{position:relative;z-index:1}
  h1{font-size:22px;margin:0 0 4px;color:#fff;
    background:linear-gradient(90deg,#fff,#b9a3ff);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{color:#8a8a9a;font-size:13px;margin-bottom:24px}
  .brand{display:flex;align-items:flex-start;gap:14px;margin-bottom:6px}
  .discord-link{display:inline-flex;align-items:center;justify-content:center;
    width:44px;height:44px;border-radius:12px;background:rgba(88,101,242,0.12);
    border:1px solid rgba(88,101,242,0.35);flex-shrink:0;text-decoration:none;margin-top:4px;
    transition:transform .15s ease,background .2s,border-color .2s,box-shadow .2s}
  .discord-link:hover{background:rgba(88,101,242,0.25);border-color:rgba(88,101,242,0.7);
    transform:translateY(-2px);box-shadow:0 6px 20px rgba(88,101,242,0.35)}
  .discord-link img{width:30px;height:30px;display:block;border-radius:6px;object-fit:contain}
  .header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:18px}
  .stats{display:flex;gap:10px;flex-wrap:wrap}
  .stat{background:rgba(28,28,34,0.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
    border:1px solid rgba(70,70,82,0.7);padding:10px 16px;border-radius:12px;min-width:110px;text-align:left}
  .stat .label{font-size:10px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1px;font-weight:600}
  .stat .value{font-size:22px;font-weight:700;color:#fff;margin-top:2px;line-height:1.1}
  .stat .value.accent{color:#b9a3ff}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;max-width:1200px}
  .card{background:rgba(28,28,34,0.65);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
    border:1px solid rgba(70,70,82,0.6);border-radius:12px;padding:14px;display:flex;gap:12px;align-items:center;
    transition:transform .15s ease,border-color .2s,background .2s}
  .card:hover{transform:translateY(-2px);border-color:rgba(120,90,255,0.6);background:rgba(34,34,42,0.75)}
  .av{width:56px;height:56px;border-radius:10px;background:#2a2a34;flex-shrink:0;
    border:1px solid rgba(120,90,255,0.25);object-fit:cover;display:block}
  .meta{min-width:0;flex:1}
  .name{font-weight:600;color:#fff;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .game{color:#9a9aaa;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;margin-top:6px;letter-spacing:0.5px}
  .ws{background:rgba(30,58,42,0.8);color:#7ddd9f;border:1px solid rgba(125,221,159,0.2)}
  .http{background:rgba(58,47,30,0.8);color:#ddd47f;border:1px solid rgba(221,212,127,0.2)}
  .empty{color:#666;padding:60px 20px;text-align:center;grid-column:1/-1;
    background:rgba(28,28,34,0.4);border:1px dashed rgba(70,70,82,0.5);border-radius:12px}
  .shop-link{display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#7850ff,#2f8fff);
    color:#fff;font-weight:600;font-size:13px;border-radius:10px;text-decoration:none;margin-bottom:20px;
    box-shadow:0 6px 20px rgba(120,80,255,0.35)}
  .ad-wrap{max-width:1200px;margin-top:24px;padding:14px;background:rgba(28,28,34,0.4);
    border:1px solid rgba(70,70,82,0.5);border-radius:12px;text-align:center;min-height:100px}
  .ad-label{font-size:10px;color:#5a5a6a;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;margin-bottom:8px}
  @media (max-width:520px){.grid{grid-template-columns:1fr}h1{font-size:18px}}
</style></head>
<body>
  <canvas id="bg"></canvas>
  <div class="orb orb1"></div><div class="orb orb2"></div><div class="orb orb3"></div>
  <div class="scanline"></div><div class="vignette"></div>
  <div class="content">
    <div class="header">
      <div class="brand">
        <a class="discord-link" href="https://discord.gg/pZJnYzE7hb" target="_blank" rel="noopener noreferrer">
          <img src="https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/IMG_1454.png" alt="Discord"
               onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/williambredsgaard-blip/serverssszz@main/IMG_1454.png';">
        </a>
        <div class="title-block">
          <h1>Script Hub Dashboard</h1>
          <div class="sub">Live view of every client running the hub script</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="label">Executions</div><div class="value accent" id="exec">0</div></div>
        <div class="stat"><div class="label">Online</div><div class="value" id="count">0</div></div>
      </div>
    </div>

    <a class="shop-link" href="/product">🛒 Buy CS2 Prime Accounts — €0.87 each</a>

    <div class="grid" id="grid"><div class="empty">Loading...</div></div>

    <div class="ad-wrap">
      <div class="ad-label">Advertisement</div>
      <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-4246726390307705"
           data-ad-slot="0000000000" data-ad-format="auto" data-full-width-responsive="true"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
    </div>
  </div>
<script>
const FALLBACK_THUMB = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">' +
  '<rect width="56" height="56" rx="10" fill="#2a2a34"/>' +
  '<text x="28" y="37" font-family="sans-serif" font-size="24" font-weight="600" fill="#8a8a9a" text-anchor="middle">?</text></svg>');
(function(){const canvas=document.getElementById('bg');if(!canvas)return;
const ctx=canvas.getContext('2d');const DPR=Math.max(1,window.devicePixelRatio||1);let W,H;
function resize(){W=canvas.width=innerWidth*DPR;H=canvas.height=innerHeight*DPR;
canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px'}
resize();addEventListener('resize',resize);
const N=Math.min(90,Math.max(40,Math.floor(innerWidth/22)));
const parts=Array.from({length:N},()=>({x:Math.random()*W,y:Math.random()*H,
vx:(Math.random()-0.5)*0.25*DPR,vy:(Math.random()-0.5)*0.25*DPR,
r:(Math.random()*1.4+0.6)*DPR,hue:Math.random()<0.5?265:210}));
const MAX_D=150*DPR;function tick(){ctx.clearRect(0,0,W,H);
for(let i=0;i<parts.length;i++){const a=parts[i];for(let j=i+1;j<parts.length;j++){const b=parts[j];
const dx=a.x-b.x,dy=a.y-b.y;const d2=dx*dx+dy*dy;if(d2<MAX_D*MAX_D){
const alpha=(1-Math.sqrt(d2)/MAX_D)*0.22;ctx.strokeStyle='rgba(140,110,255,'+alpha+')';
ctx.lineWidth=0.7*DPR;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}}
for(const p of parts){p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);
grad.addColorStop(0,'hsla('+p.hue+',90%,75%,0.9)');
grad.addColorStop(1,'hsla('+p.hue+',90%,75%,0)');
ctx.fillStyle=grad;ctx.beginPath();ctx.arc(p.x,p.y,p.r*4,0,Math.PI*2);ctx.fill()}
requestAnimationFrame(tick)}tick()})();
async function refresh(){try{const r=await fetch('/clients?t='+Date.now());const data=await r.json();
const users=data.users||[];document.getElementById('count').textContent=users.length;
document.getElementById('exec').textContent=(data.executions??0).toLocaleString();
const grid=document.getElementById('grid');
if(users.length===0){grid.innerHTML='<div class="empty">No clients connected</div>';return}
grid.innerHTML=users.map(u=>{const uid=u.userId;const thumb=u.thumbnail||FALLBACK_THUMB;
const badge=u.transport==='ws'?'<span class="badge ws">ws</span>':'<span class="badge http">http</span>';
const place=u.placeId?('Place '+u.placeId):'Unknown';
const safeName=(u.displayName||('User '+uid)).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
return '<div class="card"><img class="av" src="'+thumb+'" alt="" onerror="this.src=\\''+FALLBACK_THUMB+'\\'">'+
'<div class="meta"><div class="name">'+safeName+'</div><div class="game">'+place+'</div>'+badge+'</div></div>'}).join('')}
catch(e){document.getElementById('grid').innerHTML='<div class="empty">Error: '+e.message+'</div>'}}
refresh();setInterval(refresh,2000);
</script></body></html>`);
});

// ─── 404 catch-all ───
app.use((req, res) => {
  const requestedPath = req.originalUrl || req.url || "/";
  const safePath = String(requestedPath).replace(/[<>&"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;'
  }[c]));

  res.status(404).set("Content-Type", "text/html").send(pageShell("Page Not Found — Script Hub", `
    <div style="max-width:520px;margin:0 auto;padding:36px 32px;background:rgba(28,28,34,0.72);
                backdrop-filter:blur(16px);border:1px solid rgba(70,70,82,0.7);border-radius:16px;
                text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.55)">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;
                  border-radius:16px;margin-bottom:16px;background:rgba(120,90,255,0.14);
                  border:1px solid rgba(120,90,255,0.4)">
        <svg viewBox="0 0 24 24" style="width:34px;height:34px;stroke:#b9a3ff;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round">
          <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/>
          <circle cx="12" cy="16.5" r="0.9" fill="#b9a3ff" stroke="none"/>
        </svg>
      </div>
      <h1 style="font-size:20px;margin:0 0 10px;color:#fff;
                 background:linear-gradient(90deg,#fff,#b9a3ff);-webkit-background-clip:text;background-clip:text;color:transparent">
        Page Not Found
      </h1>
      <p style="color:#a8a8b8;font-size:14px;line-height:1.55;margin:0 0 20px">
        The link you tried to go to doesn't exist yet. Please try again later.
      </p>
      <span style="display:block;margin:0 auto 22px;padding:8px 12px;background:rgba(18,18,24,0.7);
                   border:1px solid rgba(70,70,82,0.6);border-radius:8px;
                   font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#8a8a9a;
                   word-break:break-all">${safePath}</span>
      <a href="/" style="display:inline-block;padding:11px 28px;
         background:linear-gradient(135deg,#7850ff,#2f8fff);color:#fff;font-weight:600;font-size:14px;
         border-radius:10px;text-decoration:none;box-shadow:0 8px 24px rgba(120,80,255,0.4)">Okay</a>
    </div>
  `));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Relay on " + PORT));
