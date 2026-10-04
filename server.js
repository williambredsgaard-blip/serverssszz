const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));
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
const ADSENSE_SLOT_VERTICAL = "1135972285";

if (!BLOCKONOMICS_API_KEY) console.error("[config] BLOCKONOMICS_API_KEY is not set.");

// ─── COOKIE PARSER ───
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  });
  return out;
}

// ─── ICONS ───
const S = 'style="display:inline-block;vertical-align:middle;flex-shrink:0"';
const ICONS = {
  eye: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  bolt: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="currentColor" ${S}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  key: (s) => `<svg viewBox="0 0 24 24" width="${s||13}" height="${s||13}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14.5 8.5l3 3"/></svg>`,
  phone: (s) => `<svg viewBox="0 0 24 24" width="${s||13}" height="${s||13}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><rect x="7" y="2" width="10" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>`,
  globe: (s) => `<svg viewBox="0 0 24 24" width="${s||13}" height="${s||13}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  copy: (s) => `<svg viewBox="0 0 24 24" width="${s||16}" height="${s||16}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  play: (s) => `<svg viewBox="0 0 24 24" width="${s||16}" height="${s||16}" fill="currentColor" ${S}><polygon points="6 3 21 12 6 21 6 3"/></svg>`,
  thumbUp: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><path d="M7 10v12"/><path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z"/></svg>`,
  thumbDown: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><path d="M17 14V2"/><path d="M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z"/></svg>`,
  star: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  starFilled: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="currentColor" ${S}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  share: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  flag: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="currentColor" ${S}><path d="M5 2v20h2v-8h10l-2-3 2-3H7V2H5z"/></svg>`,
  arrowLeft: (s) => `<svg viewBox="0 0 24 24" width="${s||16}" height="${s||16}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  arrowRight: (s) => `<svg viewBox="0 0 24 24" width="${s||16}" height="${s||16}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  plus: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  check: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${S}><polyline points="20 6 9 17 4 12"/></svg>`,
  verified: (s) => `<svg viewBox="0 0 24 24" width="${s||13}" height="${s||13}" ${S}><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M7 12.5l3.5 3.5L17 9" stroke="#0b0b10" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  document: (s) => `<svg viewBox="0 0 24 24" width="${s||28}" height="${s||28}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`,
  smiley: (s) => `<svg viewBox="0 0 24 24" width="${s||20}" height="${s||20}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${S}><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  reply: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  more: (s) => `<svg viewBox="0 0 24 24" width="${s||16}" height="${s||16}" fill="currentColor" ${S}><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
  send: (s) => `<svg viewBox="0 0 24 24" width="${s||15}" height="${s||15}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  user: (s) => `<svg viewBox="0 0 24 24" width="${s||16}" height="${s||16}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  externalLink: (s) => `<svg viewBox="0 0 24 24" width="${s||14}" height="${s||14}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  shield: (s) => `<svg viewBox="0 0 24 24" width="${s||16}" height="${s||16}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  upload: (s) => `<svg viewBox="0 0 24 24" width="${s||16}" height="${s||16}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${S}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`
};
function tagIcon(tag) {
  const t = String(tag).toLowerCase();
  if (t.includes("key")) return ICONS.key(13);
  if (t.includes("mobile") || t.includes("phone")) return ICONS.phone(13);
  if (t.includes("universal")) return ICONS.globe(13);
  return "";
}

// ─── AVATAR HELPERS ───
const AVATAR_GRADIENT = "linear-gradient(135deg,#7850ff,#2f8fff)";

// ─── SCRIPTS REGISTRY ───
const SCRIPTS = [
  {
    slug: "infinite-yield",
    name: "Infinite Yield",
    game: "Universal",
    subtitle: "Universal Admin Commands & Utilities",
    description: "Infinite Yield is one of the most widely used admin command scripts for Roblox. It ships with a full command bar, ESP, fly, teleport, waypoints, chat tools, and hundreds of utility commands. Works across almost every game out of the box and needs no key.",
    author: "Edge",
    authorTag: "#1",
    tags: ["Keyless", "Mobile friendly", "Universal"],
    primaryTag: "Keyless",
    thumbnail: "https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/IMG_1466.png",
    rawUrl: "https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/refs/heads/main/infiniteyield.lua",
    posted: "2w ago"
  }
];
function findScript(slug) { for (const s of SCRIPTS) if (s.slug === slug) return s; return null; }
function loaderFor(script) { return `loadstring(game:HttpGet("${script.rawUrl}"))()`; }
function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,"") + "M";
  if (n >= 1000)    return (n/1000).toFixed(1).replace(/\.0$/,"") + "K";
  return String(n);
}

// ─── WHITELIST READER ───
function readWhitelist() {
  const paths = [__dirname, path.join(__dirname, "scripts"), path.join(__dirname, "public"), process.cwd()];
  for (const dir of paths) {
    const full = path.join(dir, "wh.txt");
    if (fs.existsSync(full)) {
      try {
        const entries = fs.readFileSync(full, "utf8")
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l.length > 0 && !l.startsWith("#") && !l.startsWith("--"));
        return entries;
      } catch (e) {
        console.error("[whitelist] read error:", e.message);
        return [];
      }
    }
  }
  console.error("[whitelist] wh.txt not found in any search path");
  return [];
}
function isWhitelistedUsername(name) {
  if (!name) return false;
  const lower = String(name).trim().toLowerCase();
  if (!lower) return false;
  return readWhitelist().some(n => n.toLowerCase() === lower);
}

// ─── SOCIAL DATA ───
const SOCIAL_FILE = path.join(__dirname, "social.json");
let social = { scripts: {}, users: {}, comments: {} };
try {
  if (fs.existsSync(SOCIAL_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(SOCIAL_FILE, "utf8"));
    social.scripts = parsed.scripts || {};
    social.users = parsed.users || {};
    social.comments = parsed.comments || {};
    console.log(`[social] loaded - ${Object.keys(social.scripts).length} script stat groups, ${Object.keys(social.users).length} users, ${Object.keys(social.comments).length} comment threads`);
  }
} catch (e) { console.error("[social] load error:", e.message); }

let socialSaveTimer = null;
function saveSocial() {
  if (socialSaveTimer) return;
  socialSaveTimer = setTimeout(() => {
    socialSaveTimer = null;
    try { fs.writeFileSync(SOCIAL_FILE, JSON.stringify(social, null, 2)); } catch (e) { console.error("[social] save error:", e.message); }
  }, 300);
}

function getScriptStats(slug) {
  if (!social.scripts[slug]) {
    social.scripts[slug] = { views: 0, likes: 0, dislikes: 0, likedBy: {}, dislikedBy: {} };
  }
  const st = social.scripts[slug];
  if (!st.likedBy) st.likedBy = {};
  if (!st.dislikedBy) st.dislikedBy = {};
  return st;
}
function getUser(name) {
  if (!social.users[name]) {
    social.users[name] = { createdAt: Date.now(), followers: [], following: [] };
    saveSocial();
  }
  const u = social.users[name];
  if (!u.followers) u.followers = [];
  if (!u.following) u.following = [];
  return u;
}
function getComments(slug) {
  if (!social.comments[slug]) social.comments[slug] = [];
  return social.comments[slug];
}
function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// ─── PROFANITY FILTER ───
const ALLOWED_TEXT_CHARS = /^[a-zA-Zа-яА-ЯёЁ0-9 .,!?'"()\-_:;@#\n\r]+$/;
const USERNAME_RE = /^[a-zA-Zа-яА-ЯёЁ0-9_\-]{3,20}$/;

function normalizeForSwear(raw) {
  let t = String(raw).toLowerCase();
  const cyr = {
    'а':'a','б':'b','в':'b','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z',
    'и':'u','й':'i','к':'k','л':'l','м':'m','н':'h','о':'o','п':'n','р':'p',
    'с':'c','т':'t','у':'y','ф':'f','х':'x','ц':'c','ч':'ch','ш':'sh','щ':'sh',
    'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  let out = '';
  for (const ch of t) out += (cyr[ch] !== undefined ? cyr[ch] : ch);
  const leet = {
    '0':'o','1':'i','!':'i','|':'i','3':'e','4':'a','5':'s','$':'s',
    '7':'t','8':'b','9':'g','@':'a','+':'t','2':'z','6':'g','#':'h'
  };
  let out2 = '';
  for (const ch of out) out2 += (leet[ch] !== undefined ? leet[ch] : ch);
  out2 = out2.replace(/(.)\1{2,}/g, '$1');
  out2 = out2.replace(/[^a-zа-яё]/g, '');
  return out2;
}

const SWEAR_PATTERNS = [
  /\bf+u+c+k/i, /\bfck/i, /\bfuq/i, /\bfux\b/i,
  /\bsh+i+t/i, /\bshyt/i,
  /\bb+i+t+c+h/i, /\bbtch/i, /\bbiatch/i,
  /\bn+i+g+(a|er|uh)/i, /\bn1gg/i, /\bnigg/i, /\bnigr/i,
  /\bc+u+n+t/i, /\bkunt/i,
  /\bd+i+c+k\b/i, /\bd1ck/i,
  /\bc+o+c+k\b/i, /\bkock\b/i,
  /\bp+u+s+s+y/i, /\bpusi\b/i, /\bpusy\b/i,
  /\bw+h+o+r+e/i,
  /\bfag+ot/i, /\bfagg/i, /\bf4g/i,
  /retard/i,
  /\ba+s+s+h+o+l+e/i, /\bashole/i,
  /\bb+a+s+t+a+r+d/i, /\bbasterd/i,
  /\bs+l+u+t/i, /\bsloot/i,
  /\bd+o+u+c+h+e/i,
  /jackass/i,
  /\bcum\b/i, /jizz/i, /wank/i, /wanker/i,
  /\btits\b/i, /\bboobs\b/i, /\bpenis\b/i, /\bvagina\b/i, /\bdildo\b/i,
  /хуй/i, /хуя/i, /хую/i, /хуё/i, /хуи/i, /хуе/i,
  /пизд/i, /пизж/i,
  /бляд/i, /блят/i, /бляц/i,
  /ебал/i, /ебат/i, /ебут/i, /ебан/i, /ёб/i, /еби/i,
  /сука/i, /суки/i, /сучк/i, /сучар/i,
  /мудак/i, /мудил/i,
  /гандон/i, /гондон/i,
  /пидор/i, /пидар/i, /пидр/i, /педик/i,
  /долбоёб/i, /долбоеб/i,
  /залуп/i,
  /шлюх/i, /шлюш/i,
  /мразь/i, /ублюд/i,
  /говн/i, /гавн/i,
  /хер\b/i, /херн/i,
  /манда/i,
  /жоп/i, /сперм/i, /дроч/i,
  /xuy/i, /xuj/i, /huy/i, /hui/i, /hyi/i,
  /pizd/i, /pizdec/i,
  /blyad/i, /blyat/i,
  /ebat/i, /ebal/i, /yebat/i, /yebal/i, /jebat/i, /jebal/i,
  /suka/i, /suchk/i,
  /mudak/i, /mudil/i,
  /gandon/i, /gondon/i,
  /pidor/i, /pidar/i, /pider/i, /pedik/i,
  /dolboeb/i,
  /zalup/i,
  /shluh/i, /shlyuh/i,
  /govn/i, /gavn/i
];

function containsSwear(raw) {
  if (!raw) return false;
  const norm = normalizeForSwear(raw);
  for (const p of SWEAR_PATTERNS) {
    if (p.test(raw)) return true;
    if (p.test(norm)) return true;
  }
  return false;
}

function validateCommentText(text) {
  if (typeof text !== "string") return { ok: false, reason: "Invalid input" };
  const trimmed = text.trim();
  if (trimmed.length < 1) return { ok: false, reason: "Comment is empty" };
  if (trimmed.length > 500) return { ok: false, reason: "Comment is too long (max 500 characters)" };
  if (!ALLOWED_TEXT_CHARS.test(trimmed)) {
    return { ok: false, reason: "Only English and Russian letters, digits, and basic punctuation are allowed" };
  }
  if (containsSwear(trimmed)) {
    return { ok: false, reason: "Comment contains forbidden language" };
  }
  return { ok: true, cleaned: trimmed };
}

function validateUsernameInput(name) {
  if (typeof name !== "string") return { ok: false, reason: "Invalid username" };
  const trimmed = name.trim();
  if (trimmed.length < 3) return { ok: false, reason: "Username must be at least 3 characters" };
  if (trimmed.length > 20) return { ok: false, reason: "Username must be 20 characters or fewer" };
  if (!USERNAME_RE.test(trimmed)) return { ok: false, reason: "Username may only contain letters, digits, underscore, and dash" };
  if (containsSwear(trimmed)) return { ok: false, reason: "Username contains forbidden language" };
  return { ok: true, cleaned: trimmed };
}

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
process.on("SIGINT", () => { try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); fs.writeFileSync(SOCIAL_FILE, JSON.stringify(social, null, 2)); } catch {} process.exit(0); });
process.on("SIGTERM", () => { try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); fs.writeFileSync(SOCIAL_FILE, JSON.stringify(social, null, 2)); } catch {} process.exit(0); });

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
      console.log(`[state] loaded - issued: ${Object.keys(state.issued).length}, redeemed: ${Object.keys(state.redeemed).length}`);
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

// ─── BLOCKONOMICS ───
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
  if (!data || !data.address) { const err = new Error("Blockonomics: " + JSON.stringify(data)); err.data = data; throw err; }
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

async function checkOrderPayment(order) {
  if (order.status === "paid") return { status: "paid", confirmations: order.confirmations || REQUIRED_CONFIRMATIONS, txid: order.txid, keys: order.assignedKeys };
  if (Date.now() > order.expiresAt && order.status !== "paid") { order.status = "expired"; return { status: "expired", confirmations: 0 }; }

  if (order.coin === "BTC") {
    try {
      const raw = await fetchText(`https://mempool.space/api/address/${encodeURIComponent(order.address)}/txs`);
      const txs = JSON.parse(raw);
      if (!Array.isArray(txs) || txs.length === 0) return { status: "pending", confirmations: 0 };
      const tx = txs[0];
      order.txid = tx.txid;
      if (!tx.status || !tx.status.confirmed) return { status: "mempool", confirmations: 0, txid: tx.txid };
      let tip = tx.status.block_height;
      try { const rawTip = await fetchText("https://mempool.space/api/blocks/tip/height"); tip = parseInt(rawTip.trim(), 10) || tip; } catch (e) {}
      const confirmations = Math.max(0, tip - tx.status.block_height + 1);
      order.confirmations = confirmations;
      if (confirmations >= REQUIRED_CONFIRMATIONS) {
        if (order.status !== "paid") { order.status = "paid"; order.paidAt = Date.now(); assignKeysToOrder(order); }
        return { status: "paid", confirmations, txid: tx.txid, keys: order.assignedKeys };
      }
      return { status: "confirming", confirmations, txid: tx.txid };
    } catch (e) { return { status: "pending", confirmations: 0 }; }
  }

  if (!order.txid) return { status: "waiting-wallet", confirmations: 0 };
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
  } catch (e) { return { status: "waiting-wallet", confirmations: 0, txid: order.txid }; }
}

function assignKeysToOrder(order) {
  if (order.assignedKeys && order.assignedKeys.length > 0) return order.assignedKeys;
  const picked = [];
  for (const item of stock) { if (picked.length >= order.qty) break; if (item.soldTo) continue; picked.push(item); }
  if (picked.length < order.qty) console.error(`[order] ${order.id} wants ${order.qty} but only ${picked.length} in stock`);
  const keys = [];
  for (const item of picked) { item.soldTo = order.id; if (!state.issued[item.key]) state.issued[item.key] = { orderId: order.id, at: Date.now() }; keys.push(item.key); }
  saveState();
  order.assignedKeys = keys;
  console.log(`[order] ${order.id} PAID - issued ${keys.length} keys`);
  return keys;
}

// ─── CURSOR FOLLOWER ───
const CURSOR_SCRIPT = `
(function(){
  if (!matchMedia('(pointer:fine)').matches) return;
  if (window.__shCursor) return;
  window.__shCursor = true;
  const glow = document.createElement('div');
  glow.setAttribute('aria-hidden','true');
  glow.style.cssText = ['position:fixed','top:0','left:0','width:420px','height:420px','pointer-events:none','z-index:0','opacity:0','border-radius:50%','background:radial-gradient(circle, rgba(255,70,70,0.16) 0%, rgba(230,50,50,0.07) 35%, rgba(200,40,40,0) 70%)','transform:translate3d(0,0,0)','transition:opacity .4s ease','will-change:transform','mix-blend-mode:screen'].join(';');
  document.body.appendChild(glow);
  const dot = document.createElement('div');
  dot.setAttribute('aria-hidden','true');
  dot.style.cssText = ['position:fixed','top:0','left:0','width:7px','height:7px','pointer-events:none','z-index:0','opacity:0','border-radius:50%','background:radial-gradient(circle, rgba(255,140,140,0.9) 0%, rgba(230,60,60,0.35) 60%, transparent 100%)','transform:translate3d(0,0,0)','transition:opacity .4s ease, width .2s ease, height .2s ease','will-change:transform','mix-blend-mode:screen','box-shadow:0 0 12px rgba(255,80,80,0.7)'].join(';');
  document.body.appendChild(dot);
  let mx = innerWidth/2, my = innerHeight/2, gx = mx, gy = my, dx = mx, dy = my, visible = false;
  window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; if (!visible) { visible = true; glow.style.opacity = '1'; dot.style.opacity = '1'; } }, { passive: true });
  document.addEventListener('mouseleave', () => { visible = false; glow.style.opacity = '0'; dot.style.opacity = '0'; });
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

// ─── SHARED CLIENT COOKIE HELPERS ───
const COOKIE_HELPERS = `
function shSetCookie(name, value, days) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + (days || 365) * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  } catch (e) {}
}
function shGetCookie(name) {
  try {
    const key = name + '=';
    const parts = document.cookie.split(';');
    for (let p of parts) {
      p = p.trim();
      if (p.indexOf(key) === 0) {
        try { return decodeURIComponent(p.slice(key.length)); } catch (err) { return p.slice(key.length); }
      }
    }
  } catch (e) {}
  return '';
}
function shGetUsername() { return shGetCookie('hub_username') || ''; }
function shSetUsername(u) { shSetCookie('hub_username', u, 365); }
function shGetDeviceId() {
  let d = shGetCookie('hub_device_id');
  if (!d) {
    d = 'dev_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    shSetCookie('hub_device_id', d, 365);
  }
  return d;
}
function shGetSavedScripts() {
  try {
    const raw = shGetCookie('hub_saved');
    if (!raw) return [];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  } catch (e) { return []; }
}
function shSetSavedScripts(arr) { shSetCookie('hub_saved', arr.join(','), 365); }
function shIsSaved(slug) { return shGetSavedScripts().indexOf(slug) >= 0; }
function shToggleSaved(slug) {
  const cur = shGetSavedScripts();
  const i = cur.indexOf(slug);
  if (i >= 0) cur.splice(i, 1); else cur.push(slug);
  shSetSavedScripts(cur);
  return i < 0;
}
`;

// ─── PAGE SHELL ───
function pageShell(title, bodyHtml, extraCss = "", extraJs = "", layout = "standard") {
  const isWide = layout === "wide";
  const adBlockLeft = `
    <div class="ad-sidebar left" aria-label="Advertisement">
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="${ADSENSE_CLIENT}"
           data-ad-slot="${ADSENSE_SLOT_VERTICAL}"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  `;
  const adBlockRight = `
    <div class="ad-sidebar right" aria-label="Advertisement">
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="${ADSENSE_CLIENT}"
           data-ad-slot="${ADSENSE_SLOT_VERTICAL}"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  `;
  const wideCss = `
    .wide-content {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      gap: 20px;
      max-width: 1280px;
      margin: 0 auto;
      width: 100%;
    }
    .ad-sidebar {
      width: 180px;
      flex-shrink: 0;
      display: none;
      position: sticky;
      top: 24px;
      min-height: 620px;
      background: rgba(28,28,34,0.4);
      border: 1px dashed rgba(90,90,105,0.65);
      border-radius: 14px;
      padding: 12px 10px 14px;
      text-align: center;
      overflow: hidden;
    }
    .ad-sidebar::before {
      content: 'AD';
      display: block;
      font-size: 10px;
      color: #5a5a6a;
      letter-spacing: 1.5px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .ad-sidebar::after {
      content: 'Ad space';
      display: block;
      font-size: 11px;
      color: #4a4a58;
      letter-spacing: 0.4px;
      margin-top: 10px;
    }
    .ad-sidebar ins {
      display: block;
      width: 100%;
      min-height: 540px;
      background: transparent;
    }
    .main-content {
      flex: 1;
      min-width: 0;
      max-width: 880px;
    }
    @media (min-width: 1024px) {
      .ad-sidebar {
        display: block;
      }
    }
  `;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<style>
  *{box-sizing:border-box}
  html{overflow-x:hidden;min-height:100%}
  body{background:#0b0b10;color:#eee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;position:relative;overflow-x:hidden;min-height:100vh;padding:24px}
  #bg{position:fixed;inset:0;z-index:0;pointer-events:none}
  .orb{position:fixed;border-radius:50%;filter:blur(100px);opacity:0.4;z-index:0;pointer-events:none;will-change:transform}
  .orb1{width:560px;height:560px;background:radial-gradient(circle,#8a5cff,#5a34d6);top:-180px;left:-180px;animation:drift1 24s ease-in-out infinite}
  .orb2{width:640px;height:640px;background:radial-gradient(circle,#2f8fff,#1c5fb3);bottom:-220px;right:-200px;animation:drift2 28s ease-in-out infinite}
  .orb3{width:420px;height:420px;background:radial-gradient(circle,#ff4fa0,#b3306c);top:40%;left:55%;animation:drift3 32s ease-in-out infinite;opacity:0.2}
  @keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(90px,110px) scale(1.15)}}
  @keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-110px,-80px) scale(1.18)}}
  @keyframes drift3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-70px,70px) scale(0.92)}}
  .scanline{position:fixed;inset:0;z-index:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 3px);mix-blend-mode:overlay}
  .vignette{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,0.75) 100%)}
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
  .topnav-icons .discord img{width:34px;height:34px;border-radius:8px}
  .topnav-tabs{display:flex;gap:6px;margin-left:auto}
  .topnav-tabs a{padding:9px 18px;border-radius:10px;text-decoration:none;color:#a8a8b8;font-size:13px;font-weight:600;transition:background .15s,color .15s;position:relative}
  .topnav-tabs a:hover{background:rgba(255,255,255,0.05);color:#fff}
  .topnav-tabs a.active{background:linear-gradient(135deg,rgba(120,90,255,0.2),rgba(47,143,255,0.15));color:#fff;border:1px solid rgba(120,90,255,0.35)}
  @media (max-width:520px){.topnav{flex-wrap:wrap;gap:10px}.topnav-tabs{margin-left:0;width:100%;display:grid;grid-template-columns:repeat(6,1fr)}.topnav-tabs a{text-align:center;padding:9px 4px;font-size:11.5px}}
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
  ${wideCss}
  ${extraCss}
</style></head>
<body>
  <canvas id="bg"></canvas>
  <div class="orb orb1"></div><div class="orb orb2"></div><div class="orb orb3"></div>
  <div class="scanline"></div><div class="vignette"></div>
  <div class="${isWide ? 'content wide-content' : 'content'}">
    ${isWide ? adBlockLeft : ''}
    <div class="${isWide ? 'main-content' : ''}">${bodyHtml}</div>
    ${isWide ? adBlockRight : ''}
  </div>
<script>
${CURSOR_SCRIPT}
${COOKIE_HELPERS}
(function(){
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const DPR = Math.max(1, window.devicePixelRatio || 1);
  let W, H;
  function resize(){W = canvas.width = innerWidth*DPR;H = canvas.height = innerHeight*DPR;canvas.style.width = innerWidth+'px';canvas.style.height = innerHeight+'px';}
  resize(); addEventListener('resize', resize);
  const N = Math.min(80, Math.max(35, Math.floor(innerWidth/24)));
  const parts = Array.from({length:N}, () => ({x:Math.random()*W, y:Math.random()*H,vx:(Math.random()-0.5)*0.25*DPR, vy:(Math.random()-0.5)*0.25*DPR,r:(Math.random()*1.4+0.6)*DPR, hue:Math.random()<0.5?265:210}));
  const MAX_D = 150*DPR;
  function tick(){
    ctx.clearRect(0,0,W,H);
    for(let i=0;i<parts.length;i++){
      const a=parts[i];
      for(let j=i+1;j<parts.length;j++){
        const b=parts[j]; const dx=a.x-b.x, dy=a.y-b.y; const d2=dx*dx+dy*dy;
        if(d2<MAX_D*MAX_D){const alpha=(1-Math.sqrt(d2)/MAX_D)*0.22;ctx.strokeStyle='rgba(140,110,255,'+alpha+')'; ctx.lineWidth=0.7*DPR;ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();}}
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
  return `<div class="topnav">
    <div class="topnav-icons">
      <a class="discord" href="https://discord.gg/pZJnYzE7hb" target="_blank" rel="noopener noreferrer" title="Discord"><img src="https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/IMG_1454.png" alt="Discord" style="width:34px;height:34px;border-radius:8px;" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/williambredsgaard-blip/serverssszz@main/IMG_1454.png';"></a>
      <a class="steam" href="/nfa" title="Steam"><img src="https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/steam.png" alt="Steam" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/williambredsgaard-blip/serverssszz@main/steam.png';"></a>
    </div>
    <div class="topnav-tabs">
      <a href="/" class="${cls('store')}">Home</a>
      <a href="/upload" class="${cls('upload')}">Upload</a>
      <a href="/scripts" class="${cls('scripts')}">Scripts</a>
      <a href="/nfa" class="${cls('nfa')}">Steam</a>
      <a href="/redeem" class="${cls('redeem')}">Redeem</a>
      <a href="/control" class="${cls('control')}">Control</a>
    </div>
  </div>`;
}

// ─── ADS.TXT ───
app.get("/ads.txt", (req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(`google.com, ${ADSENSE_PUB_ID}, DIRECT, f08c47fec0942fa0\n`);
});

// ═══════════════════════════════════════════════════════════════
//  SOCIAL / STATS API
// ═══════════════════════════════════════════════════════════════
function sanitizeText(s) { return String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }

app.get("/api/script/:slug/stats", (req, res) => {
  const s = findScript(req.params.slug);
  if (!s) return res.status(404).json({ ok: false });
  const st = getScriptStats(s.slug);
  res.json({ ok: true, views: st.views, likes: st.likes, dislikes: st.dislikes });
});

app.get("/api/script/:slug/vote-state", (req, res) => {
  const s = findScript(req.params.slug);
  if (!s) return res.status(404).json({ ok: false });
  const device = String(req.query.device || "").slice(0, 80);
  const st = getScriptStats(s.slug);
  res.json({
    ok: true,
    views: st.views,
    likes: st.likes,
    dislikes: st.dislikes,
    liked: device ? !!st.likedBy[device] : false,
    disliked: device ? !!st.dislikedBy[device] : false
  });
});

app.post("/api/script/:slug/view", (req, res) => {
  const s = findScript(req.params.slug);
  if (!s) return res.status(404).json({ ok: false });
  const st = getScriptStats(s.slug);
  st.views += 1;
  saveSocial();
  res.json({ ok: true, views: st.views });
});

app.post("/api/script/:slug/vote", (req, res) => {
  const s = findScript(req.params.slug);
  if (!s) return res.status(404).json({ ok: false });
  const { device, vote } = req.body || {};
  if (!device || typeof device !== "string" || device.length < 4 || device.length > 80) {
    return res.status(400).json({ ok: false, error: "Missing device id" });
  }
  if (vote !== "like" && vote !== "dislike" && vote !== "none") {
    return res.status(400).json({ ok: false, error: "Invalid vote" });
  }
  const st = getScriptStats(s.slug);
  const wasLiked = !!st.likedBy[device];
  const wasDisliked = !!st.dislikedBy[device];

  if (vote === "none") {
    if (wasLiked) { delete st.likedBy[device]; st.likes = Math.max(0, st.likes - 1); }
    if (wasDisliked) { delete st.dislikedBy[device]; st.dislikes = Math.max(0, st.dislikes - 1); }
  } else if (vote === "like") {
    if (wasLiked) { delete st.likedBy[device]; st.likes = Math.max(0, st.likes - 1); }
    else {
      st.likedBy[device] = 1;
      st.likes += 1;
      if (wasDisliked) { delete st.dislikedBy[device]; st.dislikes = Math.max(0, st.dislikes - 1); }
    }
  } else if (vote === "dislike") {
    if (wasDisliked) { delete st.dislikedBy[device]; st.dislikes = Math.max(0, st.dislikes - 1); }
    else {
      st.dislikedBy[device] = 1;
      st.dislikes += 1;
      if (wasLiked) { delete st.likedBy[device]; st.likes = Math.max(0, st.likes - 1); }
    }
  }
  saveSocial();
  res.json({
    ok: true,
    views: st.views,
    likes: st.likes,
    dislikes: st.dislikes,
    liked: !!st.likedBy[device],
    disliked: !!st.dislikedBy[device]
  });
});

app.get("/api/script/:slug/comments", (req, res) => {
  const s = findScript(req.params.slug);
  if (!s) return res.status(404).json({ ok: false });
  res.json({ ok: true, comments: getComments(s.slug) });
});

app.post("/api/script/:slug/comment", (req, res) => {
  const s = findScript(req.params.slug);
  if (!s) return res.status(404).json({ ok: false, error: "Script not found" });
  const body = req.body || {};
  const uCheck = validateUsernameInput(body.username);
  if (!uCheck.ok) return res.status(400).json({ ok: false, error: uCheck.reason });
  const tCheck = validateCommentText(body.text);
  if (!tCheck.ok) return res.status(400).json({ ok: false, error: tCheck.reason });

  getUser(uCheck.cleaned);
  const comment = {
    id: newId("cmt_"),
    username: uCheck.cleaned,
    text: tCheck.cleaned,
    at: Date.now(),
    likes: 0,
    dislikes: 0,
    likedBy: {},
    dislikedBy: {},
    replies: []
  };
  const list = getComments(s.slug);
  list.unshift(comment);
  if (list.length > 500) list.length = 500;
  saveSocial();
  res.json({ ok: true, comment });
});

app.post("/api/script/:slug/comment/:id/vote", (req, res) => {
  const s = findScript(req.params.slug);
  if (!s) return res.status(404).json({ ok: false });
  const { device, vote } = req.body || {};
  if (!device || typeof device !== "string" || device.length < 4) return res.status(400).json({ ok: false });
  if (vote !== "like" && vote !== "dislike") return res.status(400).json({ ok: false });
  const list = getComments(s.slug);
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false });
  if (!c.likedBy) c.likedBy = {};
  if (!c.dislikedBy) c.dislikedBy = {};

  if (vote === "like") {
    if (c.likedBy[device]) { delete c.likedBy[device]; c.likes = Math.max(0, c.likes - 1); }
    else {
      c.likedBy[device] = 1; c.likes += 1;
      if (c.dislikedBy[device]) { delete c.dislikedBy[device]; c.dislikes = Math.max(0, c.dislikes - 1); }
    }
  } else {
    if (c.dislikedBy[device]) { delete c.dislikedBy[device]; c.dislikes = Math.max(0, c.dislikes - 1); }
    else {
      c.dislikedBy[device] = 1; c.dislikes += 1;
      if (c.likedBy[device]) { delete c.likedBy[device]; c.likes = Math.max(0, c.likes - 1); }
    }
  }
  saveSocial();
  res.json({ ok: true, likes: c.likes, dislikes: c.dislikes, liked: !!c.likedBy[device], disliked: !!c.dislikedBy[device] });
});

app.post("/api/user/:username/follow", (req, res) => {
  const target = String(req.params.username || "").trim();
  const tCheck = validateUsernameInput(target);
  if (!tCheck.ok) return res.status(400).json({ ok: false, error: tCheck.reason });
  const follower = String((req.body || {}).follower || "").trim();
  const fCheck = validateUsernameInput(follower);
  if (!fCheck.ok) return res.status(400).json({ ok: false, error: fCheck.reason });
  if (fCheck.cleaned.toLowerCase() === tCheck.cleaned.toLowerCase()) {
    return res.status(400).json({ ok: false, error: "You cannot follow yourself" });
  }
  const tUser = getUser(tCheck.cleaned);
  const fUser = getUser(fCheck.cleaned);
  const idx = tUser.followers.findIndex(n => n.toLowerCase() === fCheck.cleaned.toLowerCase());
  let isFollowing;
  if (idx >= 0) {
    tUser.followers.splice(idx, 1);
    const i2 = fUser.following.findIndex(n => n.toLowerCase() === tCheck.cleaned.toLowerCase());
    if (i2 >= 0) fUser.following.splice(i2, 1);
    isFollowing = false;
  } else {
    tUser.followers.push(fCheck.cleaned);
    fUser.following.push(tCheck.cleaned);
    isFollowing = true;
  }
  saveSocial();
  res.json({ ok: true, followers: tUser.followers.length, isFollowing });
});

app.get("/api/user/:username/follow-state", (req, res) => {
  const target = String(req.params.username || "").trim();
  const tCheck = validateUsernameInput(target);
  if (!tCheck.ok) return res.status(400).json({ ok: false, error: tCheck.reason });
  const follower = String(req.query.follower || "").trim();
  if (!follower) return res.json({ ok: true, isFollowing: false, followers: getUser(tCheck.cleaned).followers.length });
  const fCheck = validateUsernameInput(follower);
  if (!fCheck.ok) return res.json({ ok: true, isFollowing: false, followers: getUser(tCheck.cleaned).followers.length });
  const tUser = getUser(tCheck.cleaned);
  const isFollowing = tUser.followers.some(n => n.toLowerCase() === fCheck.cleaned.toLowerCase());
  res.json({ ok: true, isFollowing, followers: tUser.followers.length });
});

app.get("/api/user/:username", (req, res) => {
  const name = String(req.params.username || "").trim();
  const u = social.users[name];
  if (!u) return res.status(404).json({ ok: false, error: "User not found" });
  let commentsCount = 0;
  for (const slug in social.comments) {
    for (const c of social.comments[slug]) {
      if (c.username && c.username.toLowerCase() === name.toLowerCase()) commentsCount++;
    }
  }
  res.json({
    ok: true,
    username: name,
    createdAt: u.createdAt,
    followers: u.followers.length,
    following: u.following.length,
    commentsCount
  });
});

// ═══════════════════════════════════════════════════════════════
//  CONTROL PANEL AUTH
// ═══════════════════════════════════════════════════════════════
app.post("/api/control/auth", (req, res) => {
  const username = String((req.body || {}).username || "").trim();
  if (!username) return res.status(400).json({ ok: false, error: "No username provided" });
  if (!isWhitelistedUsername(username)) {
    return res.status(403).json({ ok: false, error: "This username is not on the whitelist." });
  }
  res.json({ ok: true, username });
});

// ═══════════════════════════════════════════════════════════════
//  SCRIPTS LIST + DETAIL
// ═══════════════════════════════════════════════════════════════
const SCRIPTS_LIST_CSS = `
  .scripts-hero{max-width:520px;margin:0 0 24px}
  .scripts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;max-width:1000px;margin:0 auto}
  .script-card{display:block;background:rgba(24,24,30,0.72);border:1px solid rgba(60,60,72,0.55);border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .2s,border-color .2s,box-shadow .25s;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
  .script-card:hover{transform:translateY(-4px);border-color:rgba(140,105,255,0.5);box-shadow:0 18px 44px rgba(0,0,0,0.5)}
  .script-card-thumb{position:relative;aspect-ratio:16/9;background:#12121a;overflow:hidden}
  .script-card-thumb img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s}
  .script-card:hover .script-card-thumb img{transform:scale(1.04)}
  .script-card-stats{position:absolute;top:10px;left:10px;display:flex;gap:6px;font-size:12px;color:#fff;font-weight:600;pointer-events:none}
  .script-card-stats span{background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);padding:4px 9px;border-radius:6px;display:inline-flex;align-items:center;gap:5px;line-height:1}
  .script-card-posted{position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);padding:4px 9px;border-radius:6px;font-size:12px;color:#e6e6e6;font-weight:600;pointer-events:none}
  .script-card-primary{position:absolute;bottom:10px;left:10px;background:rgba(240,170,60,0.92);color:#1a1204;padding:5px 11px;border-radius:6px;font-size:12px;font-weight:800;display:inline-flex;align-items:center;gap:6px;line-height:1;pointer-events:none}
  .script-card-body{padding:14px}
  .script-card-title{font-size:15px;font-weight:700;color:#fff;line-height:1.35;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:40px}
  .script-card-author{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#9a9aaa}
  .script-card-author-icon{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#7850ff,#2f8fff);display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;flex-shrink:0;overflow:hidden}
  .script-card-author-name{color:#c9c9d2;font-weight:600}
  .script-card-author .verified{color:#4f9bff;display:inline-flex;align-items:center}
  .script-card-author .sep{color:#555562}
  @media (max-width:520px){
    .scripts-grid{grid-template-columns:1fr;gap:12px}
    .script-card-title{font-size:14px;min-height:auto}
  }
`;

app.get("/scripts", (req, res) => {
  const cards = SCRIPTS.map(s => {
    const st = getScriptStats(s.slug);
    const primary = s.primaryTag || (s.tags && s.tags[0]) || "";
    return `
    <a href="/script/${s.slug}" class="script-card">
      <div class="script-card-thumb">
        <img src="${s.thumbnail}" alt="${sanitizeText(s.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.style.background='linear-gradient(135deg,#1a1a24,#2a2a3a)'">
        <div class="script-card-stats">
          <span>${ICONS.eye(14)} ${fmtCount(st.views)}</span>
          <span>${ICONS.bolt(14)} ${fmtCount(st.likes)}</span>
        </div>
        <div class="script-card-posted">${sanitizeText(s.posted)}</div>
        ${primary ? `<div class="script-card-primary">${tagIcon(primary)}${sanitizeText(primary)}</div>` : ''}
      </div>
      <div class="script-card-body">
        <div class="script-card-title">${sanitizeText(s.name)}</div>
        <div class="script-card-author">
          <span class="script-card-author-icon">${sanitizeText(s.author.substring(0,1).toUpperCase())}</span>
          <span class="script-card-author-name">${sanitizeText(s.author)}</span>
          ${s.authorTag ? `<span class="verified">${ICONS.verified(13)}</span>` : ''}
          <span class="sep">·</span>
          <span>${sanitizeText(s.game)}</span>
        </div>
      </div>
    </a>
  `;}).join("");

  const empty = SCRIPTS.length === 0 ? `<div class="card" style="text-align:center;padding:48px 24px;max-width:480px;margin:40px auto"><div style="color:#6a6a7a;display:flex;justify-content:center;margin-bottom:14px">${ICONS.document(48)}</div><div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:6px">No scripts yet</div><div style="color:#8a8a9a;font-size:13px">Check back soon.</div></div>` : "";

  const html = pageShell("Scripts - Roblox Script Hub", `
    ${topNav('scripts')}
    <div class="scripts-hero">
      <div class="tag">SCRIPTS</div>
      <div class="h1">Browse Scripts</div>
      <p class="sub">Every script we've verified. Click one to see the loader and copy it into your executor.</p>
    </div>
    ${empty || `<div class="scripts-grid">${cards}</div>`}
  `, SCRIPTS_LIST_CSS, `
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  `, "wide");
  res.set("Content-Type", "text/html").send(html);
});

// ─── SCRIPT DETAIL ───
app.get("/script/:slug", (req, res) => {
  const s = findScript(req.params.slug);
  if (!s) {
    return res.status(404).send(pageShell("Script not found - Roblox Script Hub", `
      ${topNav('scripts')}
      <div style="text-align:center;padding:60px 20px">
        <div class="h1">Script not found</div>
        <p class="sub" style="margin:8px auto 20px">That script isn't in our catalogue.</p>
        <a href="/scripts" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#7850ff,#2f8fff);color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Back to Scripts</a>
      </div>
    `));
  }

  const cookies = parseCookies(req);
  const viewer = cookies.hub_username || "";
  const composerLetter = viewer ? viewer.substring(0,1).toUpperCase() : "Y";

  const st = getScriptStats(s.slug);
  const loader = loaderFor(s);
  const loaderEscaped = loader.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tagPills = (s.tags || []).map(t => {
    const cls = String(t).toLowerCase().includes("key") ? "t-key"
              : String(t).toLowerCase().includes("mobile") ? "t-mobile"
              : "t-default";
    return `<span class="script-tag ${cls}">${tagIcon(t)}${sanitizeText(t)}</span>`;
  }).join("");

  const commentCount = getComments(s.slug).length;
  const authorUser = getUser(s.author);

  const detailCss = `
    .script-detail-back{display:inline-flex;align-items:center;gap:6px;color:#8a8a9a;text-decoration:none;font-size:13px;font-weight:600;margin-bottom:18px;transition:color .15s,transform .15s}
    .script-detail-back:hover{color:#fff;transform:translateX(-2px)}
    .script-detail-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:26px;align-items:start;margin-bottom:24px}
    .script-detail-thumb{position:relative;border-radius:12px;overflow:hidden;background:#12121a;border:1px solid rgba(60,60,72,0.55);aspect-ratio:16/9}
    .script-detail-thumb img{width:100%;height:100%;object-fit:cover;display:block}
    .script-detail-thumb .script-card-stats{position:absolute;top:10px;left:10px}
    .script-detail-thumb .script-card-posted{position:absolute;top:10px;right:10px}
    .script-detail-info{min-width:0;padding-top:2px}
    .script-detail-title{font-size:26px;font-weight:800;color:#fff;line-height:1.22;margin:0 0 8px;letter-spacing:-0.3px}
    .script-detail-sub{color:#8a8a9a;font-size:14px;margin-bottom:16px}
    .script-detail-author{display:flex;align-items:center;gap:11px;margin-bottom:18px;flex-wrap:wrap}
    .script-detail-author-icon{width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#7850ff,#2f8fff);display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:17px;flex-shrink:0;text-decoration:none}
    .script-detail-author-text{min-width:0}
    .script-detail-author-name{font-weight:700;color:#fff;font-size:15px;display:flex;align-items:center;gap:6px;line-height:1.2;text-decoration:none}
    .script-detail-author-name:hover{color:#b9a3ff}
    .script-detail-author-name .verified{color:#4f9bff;display:inline-flex;align-items:center}
    .script-detail-author-sub{font-size:12px;color:#8a8a9a;margin-top:3px}
    .script-detail-follow{background:rgba(40,40,48,0.9);border:1px solid rgba(70,70,82,0.7);color:#d8d8e0;padding:8px 15px;border-radius:20px;font-size:12.5px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:background .15s,border-color .15s,color .15s;margin-left:auto;cursor:pointer;font-family:inherit}
    .script-detail-follow:hover{background:rgba(60,60,72,1);border-color:rgba(140,105,255,0.5);color:#fff}
    .script-detail-follow.following{background:rgba(74,124,240,0.16);border-color:rgba(74,124,240,0.5);color:#a8bff0}
    .script-detail-cta{display:flex;gap:10px;margin-top:6px;flex-wrap:wrap}
    .script-detail-copy{flex:1;min-width:200px;padding:15px 20px;background:linear-gradient(135deg,#4a7cf0,#3b5fd9);border:none;border-radius:10px;color:#fff;font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:9px;transition:transform .15s,box-shadow .2s,filter .15s;box-shadow:0 10px 24px rgba(74,124,240,0.35)}
    .script-detail-copy:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(74,124,240,0.5);filter:brightness(1.06)}
    .script-detail-copy.copied{background:linear-gradient(135deg,#3aa663,#2f8a52);box-shadow:0 10px 26px rgba(58,166,99,0.4);filter:none;transform:none}
    .script-detail-view{padding:15px 24px;background:rgba(40,40,48,0.85);border:1px solid rgba(70,70,82,0.7);border-radius:10px;color:#e0e0e8;font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:9px;transition:background .15s,border-color .15s,transform .15s}
    .script-detail-view:hover{background:rgba(58,58,70,0.95);border-color:rgba(140,105,255,0.5);transform:translateY(-2px)}
    .script-detail-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}
    .script-tag{font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;display:inline-flex;align-items:center;gap:7px;line-height:1.1}
    .script-tag.t-default{background:rgba(60,60,72,0.6);border:1px solid rgba(90,90,105,0.6);color:#c4c4d0}
    .script-tag.t-key{background:rgba(240,170,60,0.14);border:1px solid rgba(240,170,60,0.4);color:#f0b356}
    .script-tag.t-mobile{background:rgba(90,190,220,0.1);border:1px solid rgba(90,190,220,0.35);color:#7dc9e0}
    .script-detail-actions{display:flex;gap:8px;margin-top:22px;padding-top:18px;border-top:1px solid rgba(70,70,82,0.4);flex-wrap:wrap;align-items:center}
    .script-detail-vote{display:flex;background:rgba(40,40,48,0.85);border:1px solid rgba(70,70,82,0.6);border-radius:10px;overflow:hidden;height:38px}
    .script-detail-vote button{background:transparent;border:none;color:#a8a8b8;font-family:inherit;font-size:13.5px;font-weight:700;padding:0 16px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:background .15s,color .15s}
    .script-detail-vote button:hover{background:rgba(255,255,255,0.05);color:#fff}
    .script-detail-vote .up.active{color:#7ddd9f}
    .script-detail-vote .down.active{color:#ff7a7a}
    .script-detail-vote .divider{width:1px;background:rgba(70,70,82,0.7)}
    .script-detail-action{background:rgba(40,40,48,0.85);border:1px solid rgba(70,70,82,0.6);border-radius:10px;color:#b8b8c4;font-family:inherit;font-size:13.5px;font-weight:600;padding:0 16px;height:38px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:background .15s,color .15s,border-color .15s;text-decoration:none}
    .script-detail-action:hover{background:rgba(58,58,70,0.95);color:#fff}
    .script-detail-action.saved{color:#f0c060;border-color:rgba(240,192,96,0.4)}
    .script-detail-action.saved:hover{color:#ffd784}

    .script-tabs{display:flex;gap:6px;margin-top:32px;border-bottom:1px solid rgba(70,70,82,0.4)}
    .script-tab{background:transparent;border:none;font-family:inherit;font-size:14.5px;font-weight:600;color:#8a8a9a;padding:12px 4px;margin-right:22px;cursor:pointer;position:relative;transition:color .15s}
    .script-tab:hover{color:#d0d0dc}
    .script-tab.active{color:#fff}
    .script-tab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#4a7cf0;border-radius:2px 2px 0 0}
    .script-tab-count{background:rgba(120,90,255,0.25);color:#c5b3ff;font-size:11px;font-weight:700;padding:1px 8px;border-radius:10px;margin-left:7px;display:inline-block;line-height:1.5}

    .script-panel{display:none;padding:24px 0}
    .script-panel.active{display:block}
    .script-panel h3{font-size:12px;font-weight:700;color:#8a8a9a;margin:0 0 12px;text-transform:uppercase;letter-spacing:1.2px}
    .script-panel p{color:#b4b4c0;font-size:14px;line-height:1.7;margin:0 0 14px}
    .script-loader{position:relative;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:rgba(10,10,16,0.95);border:1px solid rgba(60,60,72,0.7);border-radius:10px;padding:18px 18px;color:#b9a3ff;word-break:break-all;line-height:1.65;user-select:all;overflow-x:auto;white-space:pre-wrap}
    .script-loader-copy{position:absolute;top:10px;right:10px;background:rgba(74,124,240,0.18);border:1px solid rgba(74,124,240,0.5);color:#a8bff0;padding:6px 12px;border-radius:6px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;transition:background .15s}
    .script-loader-copy:hover{background:rgba(74,124,240,0.35);color:#fff}
    .script-loader-hint{color:#6a6a7a;font-size:12px;margin-top:10px;line-height:1.6}

    .comment-section{margin-top:8px}
    .comment-composer{display:flex;gap:14px;padding:20px;background:rgba(18,18,24,0.65);border:1px solid rgba(60,60,72,0.5);border-radius:14px}
    .comment-composer-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#7850ff,#2f8fff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0;overflow:hidden;border:1px solid rgba(120,90,255,0.3)}
    .comment-composer-body{flex:1;min-width:0}
    .comment-textarea{width:100%;min-height:80px;padding:12px 14px;background:rgba(10,10,16,0.85);border:1px solid rgba(60,60,72,0.65);border-radius:10px;color:#eee;font-family:inherit;font-size:14px;resize:vertical;outline:none;transition:border-color .15s;display:block;box-sizing:border-box;line-height:1.5}
    .comment-textarea:focus{border-color:rgba(74,124,240,0.65)}
    .comment-textarea::placeholder{color:#5a5a6a}
    .comment-composer-actions{display:flex;justify-content:space-between;align-items:center;margin-top:12px}
    .comment-smiley-wrap{position:relative}
    .comment-smiley{background:transparent;border:none;cursor:pointer;color:#8a8a9a;padding:4px;display:inline-flex;align-items:center;transition:color .15s;font-family:inherit}
    .comment-smiley:hover{color:#fff}
    .comment-emoji-panel{position:absolute;bottom:100%;left:0;margin-bottom:10px;background:rgba(24,24,30,0.98);border:1px solid rgba(70,70,82,0.7);border-radius:10px;padding:8px;display:none;grid-template-columns:repeat(4,1fr);gap:6px;box-shadow:0 12px 28px rgba(0,0,0,0.55);z-index:10}
    .comment-emoji-panel.open{display:grid}
    .comment-emoji-panel button{background:rgba(40,40,48,0.85);border:1px solid rgba(70,70,82,0.5);color:#ddd;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;padding:6px 10px;border-radius:6px;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap}
    .comment-emoji-panel button:hover{background:rgba(74,124,240,0.22);color:#fff}
    .comment-submit{padding:10px 20px;border-radius:10px;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(70,70,82,0.6);background:rgba(40,40,48,0.7);color:#6a6a7a;transition:background .15s, color .15s, border-color .15s, transform .15s, box-shadow .2s}
    .comment-submit.enabled{background:linear-gradient(135deg,#4a7cf0,#3b5fd9);border-color:transparent;color:#fff;box-shadow:0 8px 20px rgba(74,124,240,0.35)}
    .comment-submit.enabled:hover{transform:translateY(-1px);box-shadow:0 12px 26px rgba(74,124,240,0.5);filter:brightness(1.06)}
    .comment-submit:disabled{cursor:not-allowed}

    .comment-list{margin-top:26px;display:flex;flex-direction:column;gap:26px}
    .comment-empty{color:#6a6a7a;font-size:13.5px;text-align:center;padding:26px 0}
    .comment-item{display:flex;gap:14px;padding-bottom:22px;border-bottom:1px solid rgba(60,60,72,0.35)}
    .comment-item:last-child{border-bottom:none;padding-bottom:0}
    .comment-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#7850ff,#2f8fff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:17px;flex-shrink:0;text-decoration:none;transition:transform .15s}
    .comment-avatar:hover{transform:scale(1.05)}
    .comment-body{flex:1;min-width:0}
    .comment-header{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;flex-wrap:wrap}
    .comment-username{color:#fff;font-weight:700;font-size:14px;text-decoration:none}
    .comment-username:hover{color:#b9a3ff}
    .comment-dot{color:#5a5a6a;font-size:14px;line-height:1}
    .comment-time{color:#8a8a9a;font-size:12.5px}
    .comment-text{color:#d0d0d8;font-size:14px;line-height:1.55;word-break:break-word;white-space:pre-wrap}
    .comment-actions{display:flex;gap:18px;margin-top:12px;align-items:center;flex-wrap:wrap}
    .comment-action{background:transparent;border:none;cursor:pointer;color:#8a8a9a;padding:0;display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-size:12.5px;font-weight:600;transition:color .15s;text-decoration:none}
    .comment-action:hover{color:#fff}
    .comment-action.active-like{color:#4a7cf0}
    .comment-action.active-dislike{color:#e8665a}
    .comment-action svg{display:block}
    .comment-action-count{min-width:12px;text-align:left}

    .uname-modal{position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);z-index:200;display:none;align-items:center;justify-content:center;padding:20px}
    .uname-modal.open{display:flex}
    .uname-card{background:rgba(24,24,30,0.98);border:1px solid rgba(70,70,82,0.7);border-radius:14px;padding:26px;max-width:400px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,0.6)}
    .uname-title{font-size:17px;font-weight:700;color:#fff;margin:0 0 6px}
    .uname-sub{font-size:13px;color:#8a8a9a;line-height:1.55;margin:0 0 18px}
    .uname-input{width:100%;padding:12px 14px;background:rgba(14,14,20,0.9);border:1px solid rgba(60,60,72,0.6);border-radius:10px;color:#fff;font-family:inherit;font-size:14px;outline:none;box-sizing:border-box;transition:border-color .15s}
    .uname-input:focus{border-color:rgba(74,124,240,0.6)}
    .uname-error{color:#ff7a7a;font-size:12.5px;margin-top:8px;min-height:16px}
    .uname-actions{display:flex;gap:10px;margin-top:18px;justify-content:flex-end}
    .uname-btn{padding:10px 20px;border-radius:10px;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;border:1px solid rgba(70,70,82,0.6);background:rgba(40,40,48,0.8);color:#d8d8e0;transition:background .15s,color .15s,border-color .15s}
    .uname-btn:hover{background:rgba(58,58,70,0.95);color:#fff}
    .uname-btn.primary{background:linear-gradient(135deg,#4a7cf0,#3b5fd9);border-color:transparent;color:#fff;box-shadow:0 8px 20px rgba(74,124,240,0.35)}
    .uname-btn.primary:hover{transform:translateY(-1px);box-shadow:0 12px 26px rgba(74,124,240,0.5)}

    @media (max-width:760px){
      .script-detail-hero{grid-template-columns:1fr;gap:18px}
      .script-detail-title{font-size:20px}
      .script-detail-follow{margin-left:0}
    }
  `;

  const initialCommentsJson = JSON.stringify(getComments(s.slug).map(c => ({
    id: c.id, username: c.username, text: c.text, at: c.at,
    likes: c.likes || 0, dislikes: c.dislikes || 0
  })));

  const detailJs = `
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    (function(){
      const SLUG = ${JSON.stringify(s.slug)};
      const AUTHOR = ${JSON.stringify(s.author)};
      const INITIAL_COMMENTS = ${initialCommentsJson};
      const SHARE_URL = location.origin + '/script/' + SLUG;

      function fmtCount(n) {
        n = Number(n) || 0;
        if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\\.0$/,"") + "M";
        if (n >= 1000)    return (n/1000).toFixed(1).replace(/\\.0$/,"") + "K";
        return String(n);
      }

      const DEVICE = shGetDeviceId();

      const tabBtns = document.querySelectorAll('.script-tab');
      const panels = document.querySelectorAll('.script-panel');
      tabBtns.forEach(b => b.addEventListener('click', () => {
        const t = b.dataset.tab;
        tabBtns.forEach(x => x.classList.toggle('active', x === b));
        panels.forEach(p => p.classList.toggle('active', p.dataset.panel === t));
      }));

      (async function trackView() {
        try {
          const r = await fetch('/api/script/' + SLUG + '/view', { method: 'POST' });
          const d = await r.json();
          if (d.ok) {
            const el = document.getElementById('statViews');
            if (el) el.textContent = fmtCount(d.views);
          }
        } catch (e) {}
      })();

      const loaderText = document.getElementById('loaderText').innerText.replace(/Copy$/,'').trim();
      function copyToClipboard(text, done) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => {
            const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
            ta.select(); try { document.execCommand('copy'); } catch(e){}
            document.body.removeChild(ta); done();
          });
        } else {
          const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
          ta.select(); try { document.execCommand('copy'); } catch(e){}
          document.body.removeChild(ta); done();
        }
      }
      const bigBtn = document.getElementById('bigCopyBtn');
      if (bigBtn) bigBtn.addEventListener('click', () => {
        const lbl = bigBtn.querySelector('span');
        const orig = lbl.textContent;
        copyToClipboard(loaderText, () => {
          bigBtn.classList.add('copied'); lbl.textContent = 'Copied';
          setTimeout(() => { bigBtn.classList.remove('copied'); lbl.textContent = orig; }, 1600);
        });
      });
      const smallBtn = document.getElementById('loaderCopy');
      if (smallBtn) smallBtn.addEventListener('click', () => {
        const orig = smallBtn.textContent;
        copyToClipboard(loaderText, () => { smallBtn.textContent = 'Copied'; setTimeout(() => smallBtn.textContent = orig, 1600); });
      });

      const upBtn = document.getElementById('scriptUpBtn');
      const downBtn = document.getElementById('scriptDownBtn');
      const statLikes = document.getElementById('statLikes');
      const statDislikes = document.getElementById('statDislikes');
      const thumbLikes = document.getElementById('thumbLikes');
      function setVoteState(state) {
        if (upBtn) upBtn.classList.toggle('active', !!state.liked);
        if (downBtn) downBtn.classList.toggle('active', !!state.disliked);
        if (statLikes) statLikes.textContent = fmtCount(state.likes);
        if (statDislikes) statDislikes.textContent = fmtCount(state.dislikes);
        if (thumbLikes) thumbLikes.textContent = fmtCount(state.likes);
      }
      async function vote(v) {
        try {
          const r = await fetch('/api/script/' + SLUG + '/vote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: DEVICE, vote: v })
          });
          const d = await r.json();
          if (d.ok) setVoteState(d);
        } catch (e) {}
      }
      if (upBtn) upBtn.addEventListener('click', () => vote('like'));
      if (downBtn) downBtn.addEventListener('click', () => vote('dislike'));

      (async function loadVoteState() {
        try {
          const r = await fetch('/api/script/' + SLUG + '/vote-state?device=' + encodeURIComponent(DEVICE));
          const d = await r.json();
          if (d && d.ok) setVoteState(d);
        } catch (e) {}
      })();

      const saveBtn = document.getElementById('saveBtn');
      function paintSaveBtn() {
        if (!saveBtn) return;
        const isSaved = shIsSaved(SLUG);
        saveBtn.classList.toggle('saved', isSaved);
        saveBtn.innerHTML = (isSaved ? '${ICONS.starFilled(15)} Saved' : '${ICONS.star(15)} Save');
      }
      if (saveBtn) {
        paintSaveBtn();
        saveBtn.addEventListener('click', () => { shToggleSaved(SLUG); paintSaveBtn(); });
      }

      const shareBtn = document.getElementById('shareBtn');
      if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
          const title = ${JSON.stringify(s.name)};
          const text = 'Check out ' + title + ' on Roblox Script Hub';
          try {
            if (navigator.share) {
              await navigator.share({ title, text, url: SHARE_URL });
              return;
            }
          } catch (e) { }
          copyToClipboard(SHARE_URL, () => {
            const orig = shareBtn.innerHTML;
            shareBtn.innerHTML = '${ICONS.check(15)} Copied';
            setTimeout(() => { shareBtn.innerHTML = orig; }, 1600);
          });
        });
      }

      const followBtn = document.getElementById('followBtn');
      const followCountEl = document.getElementById('authorFollowerCount');
      function paintFollowBtn(isFollowing) {
        if (!followBtn) return;
        followBtn.classList.toggle('following', !!isFollowing);
        followBtn.innerHTML = (isFollowing ? 'Following' : '${ICONS.plus(14)} Follow');
      }
      if (followBtn) {
        followBtn.addEventListener('click', async () => {
          let uname = shGetUsername();
          if (!uname) {
            uname = prompt('Choose a username to follow as (3-20 chars, letters/digits/_- ):');
            if (!uname) return;
            const ok = await validateAndSaveUsername(uname);
            if (!ok) return;
            uname = shGetUsername();
          }
          try {
            const r = await fetch('/api/user/' + encodeURIComponent(AUTHOR) + '/follow', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ follower: uname })
            });
            const d = await r.json();
            if (!d.ok) { alert(d.error || 'Could not follow'); return; }
            paintFollowBtn(d.isFollowing);
            if (followCountEl) followCountEl.textContent = d.followers + ' follower' + (d.followers === 1 ? '' : 's');
          } catch (e) { alert('Network error'); }
        });
      }
      (async function loadFollowState() {
        const uname = shGetUsername();
        if (!uname) return;
        try {
          const r = await fetch('/api/user/' + encodeURIComponent(AUTHOR) + '/follow-state?follower=' + encodeURIComponent(uname));
          const d = await r.json();
          if (d && d.ok) paintFollowBtn(d.isFollowing);
        } catch (e) {}
      })();

      async function validateAndSaveUsername(name) {
        name = (name || '').trim();
        if (name.length < 3) { alert('Username must be at least 3 characters'); return false; }
        if (name.length > 20) { alert('Username must be 20 characters or fewer'); return false; }
        if (!/^[a-zA-Zа-яА-ЯёЁ0-9_\\-]+$/.test(name)) { alert('Username may only contain letters, digits, _ and -'); return false; }
        shSetUsername(name);
        return true;
      }

      const commentList = document.getElementById('commentList');
      const textarea = document.getElementById('commentText');
      const submitBtn = document.getElementById('commentSubmit');
      const smileyBtn = document.getElementById('commentSmiley');
      const emojiPanel = document.getElementById('emojiPanel');
      const composerAvatar = document.getElementById('composerAvatar');

      function updateComposerAvatar() {
        const u = shGetUsername() || 'You';
        composerAvatar.textContent = u.substring(0,1).toUpperCase();
      }
      updateComposerAvatar();

      function escapeHtml(s) {
        return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
      }
      function timeAgo(ms) {
        const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
        if (s < 60) return s + 's ago';
        const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
        const d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
        const w = Math.floor(d / 7); if (w < 5) return w + 'w ago';
        const mo = Math.floor(d / 30); if (mo < 12) return mo + 'mo ago';
        return Math.floor(d / 365) + 'y ago';
      }

      function renderComment(c) {
        const initial = c.username.substring(0,1).toUpperCase();
        const liked = c.likedBy && c.likedBy[DEVICE] ? ' active-like' : '';
        const disliked = c.dislikedBy && c.dislikedBy[DEVICE] ? ' active-dislike' : '';
        return \`<div class="comment-item" data-id="\${escapeHtml(c.id)}">
          <a class="comment-avatar" href="/user/\${encodeURIComponent(c.username)}">\${escapeHtml(initial)}</a>
          <div class="comment-body">
            <div class="comment-header">
              <a class="comment-username" href="/user/\${encodeURIComponent(c.username)}">\${escapeHtml(c.username)}</a>
              <span class="comment-dot">·</span>
              <span class="comment-time" data-at="\${c.at}">\${timeAgo(c.at)}</span>
            </div>
            <div class="comment-text">\${escapeHtml(c.text)}</div>
            <div class="comment-actions">
              <button class="comment-action comment-like\${liked}" data-id="\${escapeHtml(c.id)}" data-vote="like" title="Like">${ICONS.thumbUp(14)}<span class="comment-action-count">\${c.likes || 0}</span></button>
              <button class="comment-action comment-dislike\${disliked}" data-id="\${escapeHtml(c.id)}" data-vote="dislike" title="Dislike">${ICONS.thumbDown(14)}<span class="comment-action-count">\${c.dislikes || 0}</span></button>
              <a class="comment-action" href="/user/\${encodeURIComponent(c.username)}" title="View profile">${ICONS.user(14)}<span>Profile</span></a>
              <button class="comment-action" title="More" onclick="return false">${ICONS.more(16)}</button>
            </div>
          </div>
        </div>\`;
      }

      function renderAll(list) {
        if (!list || list.length === 0) {
          commentList.innerHTML = '<div class="comment-empty">No comments yet. Be the first to comment.</div>';
          return;
        }
        commentList.innerHTML = list.map(renderComment).join('');
      }
      renderAll(INITIAL_COMMENTS);

      function updateTextareaState() {
        const has = textarea.value.trim().length > 0;
        submitBtn.classList.toggle('enabled', has);
        submitBtn.disabled = !has;
      }
      textarea.addEventListener('input', updateTextareaState);
      updateTextareaState();

      const smileys = [':)', ':D', ';)', ':P', ':(', ':/', ':3', '-_-', '^_^', 'o_O', '\\\\(^o^)/', ':O'];
      smileys.forEach(s => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = s;
        b.addEventListener('click', () => {
          const start = textarea.selectionStart || 0;
          const end = textarea.selectionEnd || 0;
          textarea.value = textarea.value.slice(0, start) + s + textarea.value.slice(end);
          textarea.selectionStart = textarea.selectionEnd = start + s.length;
          textarea.focus();
          emojiPanel.classList.remove('open');
          updateTextareaState();
        });
        emojiPanel.appendChild(b);
      });
      smileyBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPanel.classList.toggle('open'); });
      document.addEventListener('click', () => emojiPanel.classList.remove('open'));
      emojiPanel.addEventListener('click', e => e.stopPropagation());

      async function askUsername() {
        return new Promise((resolve) => {
          const modal = document.getElementById('unameModal');
          const input = document.getElementById('unameInput');
          const err = document.getElementById('unameError');
          const okBtn = document.getElementById('unameOk');
          const cancelBtn = document.getElementById('unameCancel');
          input.value = shGetUsername() || '';
          err.textContent = '';
          modal.classList.add('open');
          setTimeout(() => input.focus(), 30);
          function close(result) {
            modal.classList.remove('open');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKey);
            resolve(result);
          }
          function onOk() {
            const v = input.value.trim();
            if (v.length < 3) { err.textContent = 'Username must be at least 3 characters'; return; }
            if (v.length > 20) { err.textContent = 'Username must be 20 characters or fewer'; return; }
            if (!/^[a-zA-Zа-яА-ЯёЁ0-9_\\-]+$/.test(v)) { err.textContent = 'Only letters, digits, _ and - are allowed'; return; }
            shSetUsername(v);
            close(v);
          }
          function onCancel() { close(null); }
          function onKey(e) { if (e.key === 'Enter') onOk(); else if (e.key === 'Escape') onCancel(); }
          okBtn.addEventListener('click', onOk);
          cancelBtn.addEventListener('click', onCancel);
          input.addEventListener('keydown', onKey);
        });
      }

      submitBtn.addEventListener('click', async () => {
        const text = textarea.value.trim();
        if (!text) return;
        let uname = shGetUsername();
        if (!uname) {
          uname = await askUsername();
          if (!uname) return;
          updateComposerAvatar();
        }
        submitBtn.disabled = true;
        try {
          const r = await fetch('/api/script/' + SLUG + '/comment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: uname, text })
          });
          const d = await r.json();
          if (!d.ok) {
            alert(d.error || 'Could not post comment');
            submitBtn.disabled = false;
            return;
          }
          textarea.value = '';
          updateTextareaState();
          INITIAL_COMMENTS.unshift(d.comment);
          renderAll(INITIAL_COMMENTS);
          const countEl = document.getElementById('commentTabCount');
          if (countEl) countEl.textContent = INITIAL_COMMENTS.length;
        } catch (e) {
          alert('Network error');
        }
        submitBtn.disabled = false;
      });

      commentList.addEventListener('click', async (e) => {
        const btn = e.target.closest('.comment-action[data-vote]');
        if (!btn) return;
        const id = btn.dataset.id;
        const vote = btn.dataset.vote;
        try {
          const r = await fetch('/api/script/' + SLUG + '/comment/' + id + '/vote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: DEVICE, vote })
          });
          const d = await r.json();
          if (!d.ok) return;
          const item = commentList.querySelector('[data-id="' + id + '"]');
          if (!item) return;
          const likeBtn = item.querySelector('.comment-like');
          const dislikeBtn = item.querySelector('.comment-dislike');
          likeBtn.querySelector('.comment-action-count').textContent = d.likes;
          dislikeBtn.querySelector('.comment-action-count').textContent = d.dislikes;
          likeBtn.classList.toggle('active-like', d.liked);
          dislikeBtn.classList.toggle('active-dislike', d.disliked);
        } catch (e) {}
      });

      setInterval(() => {
        document.querySelectorAll('.comment-time[data-at]').forEach(el => {
          const at = parseInt(el.dataset.at, 10);
          if (at) el.textContent = timeAgo(at);
        });
      }, 30000);
    })();
  `;

  const html = pageShell(`${sanitizeText(s.name)} - Roblox Script Hub`, `
    ${topNav('scripts')}
    <a href="/scripts" class="script-detail-back">${ICONS.arrowLeft(15)} Back to Scripts</a>

    <div class="script-detail-hero">
      <div class="script-detail-thumb">
        <img src="${s.thumbnail}" alt="${sanitizeText(s.name)}" onerror="this.style.display='none';this.parentElement.style.background='linear-gradient(135deg,#1a1a24,#2a2a3a)'">
        <div class="script-card-stats">
          <span>${ICONS.eye(14)} <span id="statViews">${fmtCount(st.views)}</span></span>
          <span>${ICONS.bolt(14)} <span id="thumbLikes">${fmtCount(st.likes)}</span></span>
        </div>
        <div class="script-card-posted">${sanitizeText(s.posted)}</div>
      </div>

      <div class="script-detail-info">
        <h1 class="script-detail-title">${sanitizeText(s.name)}</h1>
        <div class="script-detail-sub">${sanitizeText(s.subtitle)}</div>

        <div class="script-detail-author">
          <a class="script-detail-author-icon" href="/user/${encodeURIComponent(s.author)}">${sanitizeText(s.author.substring(0,1).toUpperCase())}</a>
          <div class="script-detail-author-text">
            <a class="script-detail-author-name" href="/user/${encodeURIComponent(s.author)}">${sanitizeText(s.author)} ${s.authorTag ? `<span class="verified">${ICONS.verified(14)}</span>` : ''}</a>
            <div class="script-detail-author-sub">${sanitizeText(s.posted)} · ${sanitizeText(s.game)} · <span id="authorFollowerCount">${authorUser.followers.length} follower${authorUser.followers.length === 1 ? '' : 's'}</span></div>
          </div>
          <button class="script-detail-follow" id="followBtn">${ICONS.plus(14)} Follow</button>
        </div>

        <div class="script-detail-cta">
          <button class="script-detail-copy" id="bigCopyBtn">${ICONS.copy(17)} <span>Copy Script</span></button>
          <a class="script-detail-view" href="${s.rawUrl}" target="_blank" rel="noopener noreferrer">${ICONS.eye(16)} <span>View</span></a>
        </div>

        <div class="script-detail-tags">${tagPills}</div>

        <div class="script-detail-actions">
          <div class="script-detail-vote">
            <button class="up" id="scriptUpBtn">${ICONS.thumbUp(15)} <span id="statLikes">${fmtCount(st.likes)}</span></button>
            <div class="divider"></div>
            <button class="down" id="scriptDownBtn">${ICONS.thumbDown(15)} <span id="statDislikes">${fmtCount(st.dislikes)}</span></button>
          </div>
          <button class="script-detail-action" id="saveBtn">${ICONS.star(15)} Save</button>
          <button class="script-detail-action" id="shareBtn">${ICONS.share(15)} Share</button>
        </div>
      </div>
    </div>

    <div class="script-tabs">
      <button class="script-tab active" data-tab="overview">Overview</button>
      <button class="script-tab" data-tab="getscript">Get script</button>
      <button class="script-tab" data-tab="comments">Comments <span class="script-tab-count" id="commentTabCount">${commentCount}</span></button>
    </div>

    <div class="script-panel active" data-panel="overview">
      <h3>About this script</h3>
      <p>${sanitizeText(s.description)}</p>
    </div>

    <div class="script-panel" data-panel="getscript">
      <h3>Loader</h3>
      <p>Paste this into your executor's script box and hit execute. The loader fetches the latest version of the script directly from the source, so you never need to re-copy when it updates.</p>
      <div class="script-loader" id="loaderText">${loaderEscaped}<button class="script-loader-copy" id="loaderCopy">Copy</button></div>
      <div class="script-loader-hint">Works with Synapse, Script-Ware, Krnl, Fluxus, Delta, Solara, and most other modern executors.</div>
    </div>

    <div class="script-panel" data-panel="comments">
      <div class="comment-section">
        <div class="comment-composer">
          <div class="comment-composer-avatar" id="composerAvatar">${sanitizeText(composerLetter)}</div>
          <div class="comment-composer-body">
            <textarea class="comment-textarea" id="commentText" placeholder="Add a comment..." maxlength="500"></textarea>
            <div class="comment-composer-actions">
              <div class="comment-smiley-wrap">
                <button class="comment-smiley" id="commentSmiley" type="button" title="Add a face">${ICONS.smiley(20)}</button>
                <div class="comment-emoji-panel" id="emojiPanel"></div>
              </div>
              <button class="comment-submit" id="commentSubmit" type="button" disabled>${ICONS.send(15)} <span>Comment</span></button>
            </div>
          </div>
        </div>
        <div class="comment-list" id="commentList"></div>
      </div>
    </div>

    <div class="uname-modal" id="unameModal">
      <div class="uname-card">
        <div class="uname-title">Choose a username</div>
        <div class="uname-sub">This is the name that will appear on your comment. It must be 3-20 characters and may only contain letters, digits, underscore, and dash. English and Russian characters are supported.</div>
        <input class="uname-input" id="unameInput" type="text" placeholder="Your username" maxlength="20" autocomplete="off">
        <div class="uname-error" id="unameError"></div>
        <div class="uname-actions">
          <button class="uname-btn" id="unameCancel" type="button">Cancel</button>
          <button class="uname-btn primary" id="unameOk" type="button">Confirm</button>
        </div>
      </div>
    </div>
  `, detailCss, detailJs, "wide");

  res.set("Content-Type", "text/html").send(html);
});

// ─── USER PROFILE ───
app.get("/user/:username", (req, res) => {
  const name = String(req.params.username || "").trim();
  const u = social.users[name];
  const user = u || { createdAt: Date.now(), followers: [], following: [] };
  const initial = name.substring(0,1).toUpperCase();

  const userComments = [];
  for (const slug of Object.keys(social.comments)) {
    const s = findScript(slug);
    if (!s) continue;
    for (const c of social.comments[slug]) {
      if (c.username && c.username.toLowerCase() === name.toLowerCase()) {
        userComments.push({ scriptSlug: slug, scriptName: s.name, comment: c });
      }
    }
  }
  userComments.sort((a, b) => b.comment.at - a.comment.at);

  const joined = new Date(user.createdAt);
  const joinedStr = joined.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  const commentsHtml = userComments.length === 0
    ? `<div class="comment-empty">This user hasn't posted any comments yet.</div>`
    : userComments.map(({ scriptSlug, scriptName, comment }) => `
      <div class="comment-item">
        <a class="comment-avatar" href="/user/${encodeURIComponent(name)}">${sanitizeText(initial)}</a>
        <div class="comment-body">
          <div class="comment-header">
            <a class="comment-username" href="/user/${encodeURIComponent(name)}">${sanitizeText(name)}</a>
            <span class="comment-dot">·</span>
            <span class="comment-time">on <a href="/script/${scriptSlug}" style="color:#b9a3ff;text-decoration:none">${sanitizeText(scriptName)}</a></span>
          </div>
          <div class="comment-text">${sanitizeText(comment.text)}</div>
        </div>
      </div>
    `).join("");

  const profileCss = `
    .profile-card{background:rgba(24,24,30,0.72);border:1px solid rgba(60,60,72,0.55);border-radius:16px;padding:26px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);display:flex;align-items:center;gap:22px;flex-wrap:wrap;margin-bottom:26px}
    .profile-avatar{width:82px;height:82px;border-radius:50%;background:linear-gradient(135deg,#7850ff,#2f8fff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:32px;flex-shrink:0;box-shadow:0 10px 24px rgba(0,0,0,0.35)}
    .profile-info{flex:1;min-width:220px}
    .profile-name{font-size:24px;font-weight:800;color:#fff;margin:0 0 4px;letter-spacing:-0.3px}
    .profile-meta{color:#8a8a9a;font-size:13px;margin-bottom:12px}
    .profile-stats{display:flex;gap:22px;flex-wrap:wrap}
    .profile-stat{display:flex;flex-direction:column}
    .profile-stat .v{font-size:18px;font-weight:800;color:#fff;line-height:1}
    .profile-stat .l{font-size:11px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1px;margin-top:4px;font-weight:600}
    .profile-follow{margin-left:auto}
    .profile-follow button{padding:11px 22px;border-radius:22px;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;border:1px solid rgba(74,124,240,0.5);background:linear-gradient(135deg,#4a7cf0,#3b5fd9);color:#fff;display:inline-flex;align-items:center;gap:8px;transition:transform .15s,box-shadow .2s,filter .15s;box-shadow:0 8px 20px rgba(74,124,240,0.35)}
    .profile-follow button:hover{transform:translateY(-1px);box-shadow:0 12px 26px rgba(74,124,240,0.5);filter:brightness(1.06)}
    .profile-follow button.following{background:rgba(40,40,48,0.85);border-color:rgba(70,70,82,0.7);color:#d8d8e0;box-shadow:none}
    .profile-follow button.following:hover{background:rgba(58,58,70,0.95);color:#fff}

    .profile-section-title{font-size:12px;font-weight:700;color:#8a8a9a;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 14px}
    .profile-list{background:rgba(24,24,30,0.55);border:1px solid rgba(60,60,72,0.5);border-radius:14px;padding:22px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
    .comment-item{display:flex;gap:14px;padding-bottom:22px;border-bottom:1px solid rgba(60,60,72,0.35);margin-bottom:22px}
    .comment-item:last-child{border-bottom:none;padding-bottom:0;margin-bottom:0}
    .comment-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#7850ff,#2f8fff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:17px;flex-shrink:0;text-decoration:none}
    .comment-body{flex:1;min-width:0}
    .comment-header{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;flex-wrap:wrap}
    .comment-username{color:#fff;font-weight:700;font-size:14px;text-decoration:none}
    .comment-dot{color:#5a5a6a}
    .comment-time{color:#8a8a9a;font-size:12.5px}
    .comment-text{color:#d0d0d8;font-size:14px;line-height:1.55;word-break:break-word;white-space:pre-wrap}
    .comment-empty{color:#6a6a7a;font-size:13.5px;text-align:center;padding:22px 0}

    @media (max-width:640px){
      .profile-card{padding:20px;gap:16px}
      .profile-avatar{width:64px;height:64px;font-size:26px}
      .profile-follow{margin-left:0;width:100%}
      .profile-follow button{width:100%;justify-content:center}
    }
  `;

  const profileJs = `
    (function(){
      const NAME = ${JSON.stringify(name)};
      const btn = document.getElementById('profileFollowBtn');
      if (!btn) return;
      const viewer = shGetUsername();
      if (viewer && viewer.toLowerCase() === NAME.toLowerCase()) {
        btn.style.display = 'none';
        return;
      }

      function paint(isFollowing) {
        btn.classList.toggle('following', !!isFollowing);
        btn.textContent = isFollowing ? 'Following' : 'Follow';
      }

      (async function loadFollowState() {
        if (!viewer) return;
        try {
          const r = await fetch('/api/user/' + encodeURIComponent(NAME) + '/follow-state?follower=' + encodeURIComponent(viewer));
          const d = await r.json();
          if (d && d.ok) paint(d.isFollowing);
        } catch (e) {}
      })();

      btn.addEventListener('click', async () => {
        let u = shGetUsername();
        if (!u) {
          u = prompt('Choose a username to follow as (3-20 chars, letters/digits/_- ):');
          if (!u) return;
          u = u.trim();
          if (u.length < 3 || u.length > 20 || !/^[a-zA-Zа-яА-ЯёЁ0-9_\\-]+$/.test(u)) { alert('Invalid username'); return; }
          shSetUsername(u);
        }
        try {
          const r = await fetch('/api/user/' + encodeURIComponent(NAME) + '/follow', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follower: u })
          });
          const d = await r.json();
          if (!d.ok) { alert(d.error || 'Could not follow'); return; }
          paint(d.isFollowing);
          document.getElementById('profileFollowers').textContent = d.followers;
        } catch (e) { alert('Network error'); }
      });
    })();
  `;

  const html = pageShell(`${sanitizeText(name)} - Profile`, `
    ${topNav('scripts')}
    <a href="/scripts" class="script-detail-back" style="display:inline-flex;align-items:center;gap:6px;color:#8a8a9a;text-decoration:none;font-size:13px;font-weight:600;margin-bottom:18px">${ICONS.arrowLeft(15)} Back to Scripts</a>

    <div class="profile-card">
      <div class="profile-avatar">${sanitizeText(initial)}</div>
      <div class="profile-info">
        <div class="profile-name">${sanitizeText(name)}</div>
        <div class="profile-meta">Joined ${sanitizeText(joinedStr)}</div>
        <div class="profile-stats">
          <div class="profile-stat"><span class="v" id="profileFollowers">${user.followers.length}</span><span class="l">Followers</span></div>
          <div class="profile-stat"><span class="v">${user.following.length}</span><span class="l">Following</span></div>
          <div class="profile-stat"><span class="v">${userComments.length}</span><span class="l">Comments</span></div>
        </div>
      </div>
      <div class="profile-follow"><button id="profileFollowBtn">Follow</button></div>
    </div>

    <div class="profile-section-title">Comments</div>
    <div class="profile-list">${commentsHtml}</div>
  `, profileCss, profileJs);

  res.set("Content-Type", "text/html").send(html);
});

// ─── /nfa ───
app.get("/nfa", (req, res) => {
  const available = availableStock().length;
  const stockColor = available > 0
    ? "background:rgba(40,90,60,0.6);border:1px solid rgba(90,220,140,0.4);color:#7ddd9f;"
    : "background:rgba(90,40,40,0.6);border:1px solid rgba(220,90,90,0.4);color:#ff9a9a;";
  const stockText = available > 0 ? (available + " in stock") : "Out of stock";

  const html = pageShell("NFA Loader - Roblox Script Hub", `
    ${topNav('nfa')}
    <div class="tag">NFA ACCOUNTS</div>
    <div class="h1">NFA Loader</div>
    <p class="sub">Prime enabled. Delivered instantly after payment. Pay with Bitcoin or USDT.</p>

    <div class="card" style="max-width:480px;border-color:rgba(200,60,60,0.5)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:18px;font-weight:600;color:#fff">CS2 Prime Account</div>
        <div style="${stockColor}padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">${stockText}</div>
      </div>
      <div style="color:#8a8a9a;font-size:13px;line-height:1.5;margin-bottom:18px">Prime enabled. Premier is not unlocked.</div>
      <div style="font-size:32px;font-weight:700;color:#fff;margin-bottom:20px">€<span id="unit">0.87</span></div>
      <div style="display:flex;align-items:center;border:1px solid rgba(90,90,100,0.6);border-radius:10px;overflow:hidden;margin-bottom:20px;background:rgba(18,18,24,0.4)">
        <button onclick="dec()" style="background:transparent;border:none;color:#eee;font-size:20px;padding:12px 22px;cursor:pointer;transition:background .15s">−</button>
        <div style="flex:1;text-align:center;font-size:18px;font-weight:600" id="qty">1</div>
        <button onclick="inc()" style="background:transparent;border:none;color:#eee;font-size:20px;padding:12px 22px;cursor:pointer;transition:background .15s">+</button>
      </div>
      <button class="btn" onclick="goCart()">Add to cart</button>
    </div>
    <script>
      let q = 1; const unit = 0.87;
      function render(){document.getElementById('qty').textContent=q;document.getElementById('unit').textContent=(unit*q).toFixed(2)}
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

  const html = pageShell("Cart - Roblox Script Hub", `
    ${topNav('nfa')}
    <div class="tag">NFA ACCOUNTS</div>
    <div class="h1">Your Cart</div>
    <p class="sub">Choose your payment method and review your order.</p>
    <div class="card" style="display:flex;align-items:center;gap:16px;max-width:640px;margin-bottom:20px">
      <div style="width:52px;height:52px;border-radius:10px;background:rgba(200,60,60,0.15);border:1px solid rgba(200,60,60,0.4);display:flex;align-items:center;justify-content:center;color:#ff9a9a">${ICONS.document(24)}</div>
      <div style="flex:1"><div class="label" style="margin:0">Total</div><div style="font-size:22px;font-weight:700;color:#fff">€<span id="cartTotal">${total}</span></div></div>
      <div style="color:#8a8a9a;font-size:13px"><span id="cartQty">${qty}</span> account${qty !== 1 ? "s" : ""}</div>
    </div>
    <div style="max-width:640px;margin-bottom:20px">
      <div class="label">Payment Method</div>
      <div class="coin-grid">
        <div class="coin selected" id="coinBTC" onclick="selectCoin('BTC')"><div class="coin-icon btc">B</div><div class="coin-meta"><div class="coin-name">Bitcoin</div><div class="coin-desc">BTC · 2 confirmations</div></div></div>
        <div class="coin" id="coinUSDT" onclick="selectCoin('USDT')"><div class="coin-icon usdt">T</div><div class="coin-meta"><div class="coin-name">USDT</div><div class="coin-desc">Tether · Ethereum</div></div></div>
      </div>
    </div>
    ${hasStock ? '' : `<div class="card" style="max-width:640px;border-color:rgba(200,60,60,0.5);color:#ff9a9a;margin-bottom:20px">Not enough stock - only ${available} available.</div>`}
    <button class="btn" style="max-width:640px" id="payBtn" onclick="checkout()" ${hasStock ? '' : 'disabled'}>Pay with Bitcoin</button>
    <div id="err" style="color:#ff7a7a;margin-top:16px;display:none;max-width:640px"></div>
    <script>
      const qty = ${qty};
      let coin = 'BTC';
      function selectCoin(c){coin = c;document.getElementById('coinBTC').classList.toggle('selected', c === 'BTC');document.getElementById('coinUSDT').classList.toggle('selected', c === 'USDT');document.getElementById('payBtn').textContent = 'Pay with ' + (c === 'BTC' ? 'Bitcoin' : 'USDT');}
      async function checkout(){
        const btn = document.getElementById('payBtn');
        btn.disabled = true; btn.textContent = 'Creating order...';
        try {
          const r = await fetch('/checkout', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ qty, coin }) });
          const data = await r.json();
          if (!data.ok) throw new Error(data.error || 'checkout failed');
          window.location.href = '/pay/' + data.orderId;
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Pay with ' + (coin === 'BTC' ? 'Bitcoin' : 'USDT');
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
    if (availableStock().length < qty) return res.status(400).json({ ok: false, error: `Not enough stock. Only ${availableStock().length} available.` });
    const totalUsd = PRODUCT_PRICE_USD * qty;
    const orderId = "ord_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const address = await createPaymentAddress(coin);
    const price = await getCryptoPriceUsd(coin);
    const cryptoAmount = coin === "BTC" ? (totalUsd / price).toFixed(8) : (totalUsd / price).toFixed(2);
    const order = { id: orderId, qty, coin, totalUsd, cryptoAmount, address, status: "pending", createdAt: Date.now(), expiresAt: Date.now() + PAYMENT_WINDOW_MS, txid: null, confirmations: 0, assignedKeys: null };
    orders.set(orderId, order);
    console.log(`[order] created ${orderId} - ${qty} x $${PRODUCT_PRICE_USD} = $${totalUsd} in ${coin} -> ${address}`);
    res.json({ ok: true, orderId });
  } catch (e) {
    console.error("[checkout] error:", e.message, e.data || "");
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── /pay/:orderId ───
app.get("/pay/:orderId", (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).send(pageShell("Order not found - Roblox Script Hub", `${topNav('nfa')}<div style="text-align:center;padding:60px 20px"><div class="h1">Order not found</div><p class="sub" style="margin:8px auto 20px">This order does not exist or has already expired.</p><a href="/nfa" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#7850ff,#2f8fff);color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Back to NFA</a></div>`));

  const required = REQUIRED_CONFIRMATIONS;
  const coinName = order.coin === "BTC" ? "Bitcoin" : "USDT";
  const coinSymbol = order.coin === "BTC" ? "BTC" : "USDT";
  const isBTC = order.coin === "BTC";
  const isUSDT = order.coin === "USDT";
  const qrData = isBTC ? `bitcoin:${order.address}?amount=${order.cryptoAmount}` : `${order.address}`;
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(qrData);
  let dotsHtml = '';
  for (let i = 0; i < required; i++) dotsHtml += `<div class="conf-dot" data-i="${i+1}"></div>`;
  const usdtWalletNotice = isUSDT ? `<div style="margin-top:20px;padding:16px;background:rgba(38,161,123,0.1);border:1px solid rgba(38,161,123,0.35);border-radius:12px;color:#a8d9c8;font-size:13px;line-height:1.6"><b style="color:#4fcf9b;display:block;margin-bottom:6px">Pay USDT with a browser wallet</b>USDT is an ERC-20 token on Ethereum. You'll need Chui Wallet or any WalletConnect-compatible browser wallet to sign the transfer. Use the widget below.<div id="usdt-widget-wrap" style="margin-top:14px"></div><div id="walletStatus" style="margin-top:10px;font-size:12px;color:#8a8a9a"></div></div>` : '';
  const widgetScript = isUSDT ? `<script src="https://blockonomics.co/js/web3-payment.js"></script>` : '';

  const html = pageShell(`Pay ${order.cryptoAmount} ${coinSymbol} - Roblox Script Hub`, `
    ${topNav('nfa')}
    <div style="max-width:560px;margin:0 auto;position:relative">
      <button id="cancelBtn" onclick="cancelOrder()" style="position:absolute;top:16px;left:16px;z-index:2;background:transparent;border:1px solid rgba(200,60,60,0.5);color:#ff7a7a;padding:6px 14px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;transition:background .15s,transform .15s">Cancel Transaction</button>
      <div class="card" style="padding:28px" id="payCard">
        <div style="text-align:center;margin-bottom:20px">
          <div style="display:inline-flex;align-items:center;gap:8px;padding:4px 12px;border-radius:20px;background:rgba(224,58,58,0.15);border:1px solid rgba(224,58,58,0.4);font-size:11px;font-weight:700;color:#ff9a9a;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">${coinName}</div>
          <div class="label" style="margin-bottom:6px">Send exactly</div>
          <div style="font-size:26px;font-weight:700;color:#fff">${order.cryptoAmount} <span style="color:#8a8a9a;font-size:16px">${coinSymbol}</span></div>
          <div style="color:#8a8a9a;font-size:12px;margin-top:4px">= €${order.totalUsd.toFixed(2)} · ${order.qty} account${order.qty !== 1 ? "s" : ""}</div>
        </div>
        <div style="display:flex;justify-content:center;margin-bottom:20px"><img src="${qrUrl}" alt="QR" style="border-radius:12px;background:#fff;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4)"/></div>
        <div class="label">${coinName} Address</div>
        <div id="address" onclick="copyAddr()" style="cursor:pointer;font-family:ui-monospace,monospace;font-size:12px;color:#b9a3ff;background:rgba(18,18,24,0.7);border:1px solid rgba(70,70,82,0.6);border-radius:8px;padding:10px 12px;word-break:break-all;text-align:center;margin-bottom:20px;transition:background .2s,transform .15s">${order.address}</div>
        <div style="text-align:center;margin-bottom:10px"><div class="label" style="margin-bottom:6px">Time remaining</div><div id="timer" style="font-size:36px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums">15:00</div></div>
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
          <div style="color:#7ddd9f;display:flex;justify-content:center;margin-bottom:8px">${ICONS.check(44)}</div>
          <div class="h1" style="font-size:20px;text-align:center">Payment confirmed</div>
          <p class="sub" style="text-align:center;margin:8px auto 16px;max-width:100%">Save your key${order.qty !== 1 ? "s" : ""} below. Redeem ${order.qty !== 1 ? "each one" : "it"} at <a href="/redeem">/redeem</a> to receive your account credential${order.qty !== 1 ? "s" : ""}.</p>
        </div>
        <div id="keysList"></div>
        <div style="margin-top:16px;padding:14px;background:rgba(60,40,20,0.3);border:1px solid rgba(220,160,60,0.4);border-radius:10px;color:#e8c07a;font-size:12px;line-height:1.5"><b>Important:</b> Screenshot or copy these now. They will not be shown again.</div>
      </div>
    </div>
    <div id="modal" style="display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);align-items:center;justify-content:center">
      <div style="max-width:420px;width:calc(100% - 40px);background:rgba(28,28,34,0.95);border:1px solid rgba(70,70,82,0.7);border-radius:16px;padding:32px 28px;text-align:center">
        <div style="display:flex;justify-content:center;margin-bottom:20px"><svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="#e8564a" stroke-width="3" stroke-linecap="round"><circle cx="36" cy="36" r="30"/><line x1="26" y1="26" x2="46" y2="46"/><line x1="46" y1="26" x2="26" y2="46"/></svg></div>
        <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:10px">Payment failed</div>
        <div style="color:#a8a8b8;font-size:14px;line-height:1.55;margin-bottom:24px">Transaction canceled because nothing was sent within the 15 minutes time. Please contact the owner if you actually sent the ${coinName}.</div>
        <a href="/nfa" style="display:inline-block;padding:11px 28px;background:linear-gradient(135deg,#7850ff,#2f8fff);color:#fff;font-weight:600;font-size:14px;border-radius:10px;text-decoration:none">Okay</a>
      </div>
    </div>
    <script>
      const ORDER_ID = ${JSON.stringify(order.id)};
      const EXPIRES_AT = ${order.expiresAt};
      const REQUIRED = ${required};
      const IS_USDT = ${isUSDT ? "true" : "false"};
      let cancelled = false, paid = false, lastConf = -1;
      function fmt(ms){const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
      function tick(){if(cancelled||paid)return;const left=EXPIRES_AT-Date.now();if(left<=0){document.getElementById('timer').textContent='00:00';if(!paid) document.getElementById('modal').style.display='flex';return;}document.getElementById('timer').textContent=fmt(left);setTimeout(tick,250);} tick();
      function paintConfirmations(n){if (n === lastConf) return;lastConf = n;const dots = document.querySelectorAll('.conf-dot');dots.forEach((d,i) => {if (i < n) d.classList.add('filled');else d.classList.remove('filled');});if (n === 0) document.getElementById('confCount').textContent = '';else if (n >= REQUIRED) document.getElementById('confCount').textContent = 'Confirmed';else document.getElementById('confCount').textContent = n + ' confirmation' + (n === 1 ? '' : 's');}
      function showKeys(keys){const list = document.getElementById('keysList');list.innerHTML = keys.map((k, i) => '<div style="margin-bottom:12px"><div style="font-size:11px;color:#8a8a9a;margin-bottom:6px">Key #' + (i+1) + '</div><div class="cred" style="color:#7ddd9f;cursor:pointer" onclick="copyText(this)">' + k + '</div></div>').join('');document.getElementById('payCard').style.display = 'none';document.getElementById('keysCard').style.display = 'block';document.getElementById('cancelBtn').style.display = 'none';window.scrollTo({top:0, behavior:'smooth'});}
      window.copyText = function(el){navigator.clipboard.writeText(el.textContent);const old = el.textContent;el.textContent = 'Copied';setTimeout(() => el.textContent = old, 1200);};
      if (IS_USDT) {(function initUsdt() {const wrap = document.getElementById('usdt-widget-wrap');if (!wrap) return;const w = document.createElement('web3-payment');w.id = 'web3_payment';w.setAttribute('order_amount', ${JSON.stringify(order.cryptoAmount)});w.setAttribute('receive_address', ${JSON.stringify(order.address)});wrap.appendChild(w);function bind() {const el = document.getElementById('web3_payment');if (!el) return;el.onTxnSubmitted = function(result) {const { txhash, crypto } = result || {};const status = document.getElementById('walletStatus');if (status) status.textContent = 'Transaction submitted: ' + (txhash || '');document.getElementById('confStatus').textContent = 'Transaction submitted. Waiting for confirmations...';fetch('/monitor-usdt/' + ORDER_ID, {method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ txhash, crypto })}).then(() => poll()).catch(() => {});};}if (window.customElements && customElements.whenDefined) {customElements.whenDefined('web3-payment').then(bind);} else {setTimeout(bind, 500);}})();}
      async function poll(){if(cancelled || paid) return;try{const r = await fetch('/check-payment/' + ORDER_ID + '?t=' + Date.now());const data = await r.json();if (data.status === 'paid'){paid = true;document.getElementById('timer').textContent = 'OK';document.getElementById('timer').style.color = '#7ddd9f';document.getElementById('confStatus').textContent = 'Payment confirmed!';paintConfirmations(REQUIRED);if (data.keys && data.keys.length > 0) showKeys(data.keys);else document.getElementById('confStatus').textContent = 'Payment confirmed, but no stock available. Please contact support.';return;}if (data.status === 'expired'){document.getElementById('modal').style.display = 'flex';return;}if (data.status === 'mempool'){document.getElementById('confStatus').textContent = 'Payment detected in mempool. Waiting for first confirmation...';paintConfirmations(0);} else if (data.status === 'confirming'){document.getElementById('confStatus').textContent = 'Confirming on the blockchain...';paintConfirmations(data.confirmations || 0);} else if (data.status === 'waiting-wallet'){document.getElementById('confStatus').textContent = IS_USDT ? 'Waiting for you to send USDT from your wallet...' : 'Waiting for payment...';} else {document.getElementById('confStatus').textContent = 'Waiting for payment...';}setTimeout(poll, 5000);}catch(e){setTimeout(poll, 5000);}}
      poll();
      function copyAddr(){navigator.clipboard.writeText(${JSON.stringify(order.address)});const el=document.getElementById('address');el.style.background='rgba(120,90,255,0.2)';el.style.transform='scale(1.02)';setTimeout(()=>{el.style.background='rgba(18,18,24,0.7)';el.style.transform='scale(1)'},300);}
      async function cancelOrder(){if(paid) return;if(!confirm('Cancel this transaction?'))return;cancelled=true;try{await fetch('/cancel/'+ORDER_ID,{method:'POST'})}catch(e){}document.getElementById('timer').textContent='00:00';document.getElementById('modal').style.display='flex';}
    </script>
    ${widgetScript}
  `);
  res.set("Content-Type", "text/html").send(html);
});

// ─── /check-payment ───
app.get("/check-payment/:orderId", async (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.json({ status: "expired" });
  const result = await checkOrderPayment(order);
  res.json(result);
});

app.post("/cancel/:orderId", (req, res) => {
  const order = orders.get(req.params.orderId);
  if (order && order.status === "pending") order.status = "cancelled";
  res.json({ ok: true });
});

app.post("/monitor-usdt/:orderId", async (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).json({ ok: false, error: "order not found" });
  const { txhash } = req.body || {};
  if (!txhash) return res.status(400).json({ ok: false, error: "missing txhash" });
  order.txid = txhash;
  console.log(`[usdt] ${order.id} txhash recorded: ${txhash}`);
  try { await blockonomicsPost("/api/monitor_tx", { txhash, crypto: "USDT", addr: order.address }); console.log(`[usdt] ${order.id} registered with Blockonomics monitor`); } catch (e) { console.error("[usdt] monitor registration failed:", e.message); }
  res.json({ ok: true });
});

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
          order.status = "paid"; order.txid = txid || order.txid; order.paidAt = Date.now(); assignKeysToOrder(order);
        }
        break;
      }
    }
  }
  res.json({ ok: true });
});

// ─── /redeem ───
app.get("/redeem", (req, res) => {
  const html = pageShell("Redeem - Roblox Script Hub", `
    ${topNav('redeem')}
    <div class="tag">NFA ACCOUNTS</div>
    <div class="h1">Redeem &amp; Replacements</div>
    <p class="sub">Redeem the key from your purchase, or request a replacement for an account you already have.</p>
    <div class="card" style="max-width:600px">
      <div class="label">Redeem a Key</div>
      <div style="color:#a8a8b8;font-size:13px;margin-bottom:12px">Your key</div>
      <input id="keyInput" class="input" type="text" placeholder="PREMIER..." autocomplete="off" spellcheck="false">
      <div style="color:#8a8a9a;font-size:12px;margin-top:10px;line-height:1.5">One at a time. Redeem only when you are ready to use the account right away.</div>
      <button id="redeemBtn" class="btn" style="margin-top:16px" onclick="doRedeem()">Redeem Key</button>
      <div id="result" class="result"><div class="result-title" id="resultTitle">Success</div><div id="resultBody"></div></div>
    </div>
    <div class="info" style="max-width:600px"><b>One key at a time.</b> Redeem as many as you bought, one after another. Each key is single-use and will never deliver twice. Save your credentials immediately after redeeming.</div>
    <a class="help" href="https://discord.gg/pZJnYzE7hb" target="_blank" rel="noopener noreferrer" style="max-width:600px"><svg class="help-icon" viewBox="0 0 24 24" fill="#cfd5ff"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18.3 18.3 0 0 1 4.4 1.4 13.4 13.4 0 0 0-11.2 0A18.3 18.3 0 0 1 13 3.4 19.8 19.8 0 0 0 8 4.4C2.7 12 .5 19.3 1.7 26.5a19.9 19.9 0 0 0 6 3l1-1.6a13 13 0 0 1-2.3-1.1l.6-.5a14 14 0 0 0 12 0l.6.5a13 13 0 0 1-2.3 1.1l1 1.6a19.9 19.9 0 0 0 6-3C24.6 18.7 22 11.6 20.3 4.4z" transform="translate(0 -2)"/></svg>Need help? Open a ticket on Discord</a>
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
          const r = await fetch('/redeem', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ key }) });
          const data = await r.json();
          if (data.ok) {
            title.textContent = 'Success - Save this now';
            result.classList.remove('error');
            body.innerHTML = '<div style="color:#a8a8b8;font-size:13px;margin-bottom:10px">Account credential (click to select, then copy):</div><div class="cred" id="credBox" onclick="copyCred()" style="cursor:pointer">' + data.credential.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</div><button class="copy-btn" onclick="copyCred()">Copy to clipboard</button><div style="color:#8a8a9a;font-size:12px;margin-top:12px">Store this somewhere safe. It will never be shown again.</div>';
            document.getElementById('keyInput').value = '';
            window.__cred = data.credential;
          } else {
            title.textContent = 'Failed';
            result.classList.add('error');
            body.innerHTML = '<div style="color:#ff9a9a;font-size:13px">' + (data.error || 'Could not redeem key.').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</div>';
          }
          result.style.display = 'block';
        } catch (e) {
          title.textContent = 'Error';
          result.classList.add('error');
          body.innerHTML = '<div style="color:#ff9a9a;font-size:13px">Network error. Try again.</div>';
          result.style.display = 'block';
        }
        btn.disabled = false; btn.textContent = 'Redeem Key';
      }
      function copyCred(){ if (!window.__cred) return; navigator.clipboard.writeText(window.__cred); }
      document.getElementById('keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') doRedeem(); });
    </script>
  `);
  res.set("Content-Type", "text/html").send(html);
});

app.post("/redeem", (req, res) => {
  const key = String(req.body.key || "").trim();
  if (!key) return res.json({ ok: false, error: "No key provided." });
  const item = findStockByKey(key);
  if (!item) return res.json({ ok: false, error: "Invalid key. Please check for typos and try again." });
  if (!state.issued[key]) return res.json({ ok: false, error: "This key has not been purchased yet. If you just paid, wait a moment for confirmations." });
  if (state.redeemed[key]) return res.json({ ok: false, error: "This key has already been redeemed." });
  state.redeemed[key] = { at: Date.now(), ip: req.ip };
  saveState();
  console.log(`[redeem] ${key} redeemed by ${req.ip}`);
  res.json({ ok: true, credential: item.credential });
});

// ═══════════════════════════════════════════════════════════════
//  WEB CONTROL PANEL  —  /control
// ═══════════════════════════════════════════════════════════════
app.get("/control", (req, res) => {
  const controlCss = `
    .ctrl-wrap{max-width:1100px;margin:0 auto}
    .ctrl-card{background:rgba(28,28,34,0.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(90,90,105,0.55);border-radius:14px;padding:24px;box-shadow:0 8px 24px rgba(0,0,0,0.3)}
    .ctrl-tabs{display:flex;gap:6px;margin-bottom:18px;border-bottom:1px solid rgba(70,70,82,0.5);padding-bottom:12px;flex-wrap:wrap}
    .ctrl-tab{padding:8px 16px;border-radius:8px;background:transparent;border:1px solid transparent;color:#a8a8b8;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
    .ctrl-tab:hover{background:rgba(255,255,255,0.05);color:#fff}
    .ctrl-tab.active{background:linear-gradient(135deg,rgba(120,90,255,0.22),rgba(47,143,255,0.15));color:#fff;border-color:rgba(120,90,255,0.4)}
    .ctrl-tab .tab-count{background:rgba(120,90,255,0.25);color:#c5b3ff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;margin-left:6px}
    .ctrl-panel{display:none}
    .ctrl-panel.active{display:block}
    .ctrl-user{display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(24,24,30,0.72);border:1px solid rgba(60,60,72,0.5);border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all .15s}
    .ctrl-user:hover{border-color:rgba(140,105,255,0.5);background:rgba(40,40,50,0.85)}
    .ctrl-user.selected{border-color:rgba(120,90,255,0.75);background:rgba(120,90,255,0.13);box-shadow:0 0 0 3px rgba(120,90,255,0.1)}
    .ctrl-user img{width:42px;height:42px;border-radius:10px;background:#2a2a34;flex-shrink:0;object-fit:cover;border:1px solid rgba(120,90,255,0.25)}
    .ctrl-user .meta{flex:1;min-width:0}
    .ctrl-user .nm{color:#fff;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ctrl-user .sub{color:#8a8a9a;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ctrl-user .badge{background:rgba(30,58,42,0.8);color:#7ddd9f;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:8px}
    .ctrl-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 16px;border-radius:10px;background:rgba(40,40,48,0.85);border:1px solid rgba(70,70,82,0.7);color:#d8d8e0;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
    .ctrl-btn:hover:not(:disabled){background:rgba(58,58,70,0.95);color:#fff;border-color:rgba(140,105,255,0.5);transform:translateY(-1px)}
    .ctrl-btn.danger{border-color:rgba(200,60,60,0.5);color:#ff9a9a}
    .ctrl-btn.danger:hover:not(:disabled){background:rgba(120,40,40,0.4);color:#fff;border-color:rgba(230,90,90,0.7)}
    .ctrl-btn:disabled{opacity:0.4;cursor:not-allowed}
    .ctrl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:10px}
    .ctrl-textarea{width:100%;min-height:220px;padding:14px;background:rgba(10,10,16,0.9);border:1px solid rgba(60,60,72,0.7);border-radius:10px;color:#b9a3ff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;resize:vertical;outline:none;line-height:1.55;box-sizing:border-box}
    .ctrl-textarea:focus{border-color:rgba(120,90,255,0.55);box-shadow:0 0 0 3px rgba(120,90,255,0.12)}
    .ctrl-output{background:rgba(10,10,16,0.92);border:1px solid rgba(60,60,72,0.7);border-radius:10px;padding:14px;color:#b9a3ff;font-family:ui-monospace,monospace;font-size:12px;min-height:220px;max-height:520px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;line-height:1.5}
    .ctrl-status{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:20px;font-size:11.5px;font-weight:700}
    .ctrl-status.online{background:rgba(30,58,42,0.8);color:#7ddd9f}
    .ctrl-status.offline{background:rgba(90,40,40,0.8);color:#ff9a9a}
    .ctrl-status.connecting{background:rgba(90,70,30,0.8);color:#e8c07a}
    .ctrl-status .dot{width:6px;height:6px;border-radius:50%;background:currentColor}
    .ctrl-toasts{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;max-width:320px;pointer-events:none}
    .ctrl-toast{background:rgba(28,28,34,0.96);border:1px solid rgba(70,70,82,0.7);border-radius:10px;padding:11px 14px;color:#eee;font-size:12.5px;min-width:220px;box-shadow:0 12px 30px rgba(0,0,0,0.5);pointer-events:auto;transition:opacity .3s,transform .3s}
    .ctrl-toast .tt{font-weight:700;font-size:12px;margin-bottom:3px;color:#fff}
    .ctrl-toast .tb{color:#b4b4c0;font-size:12px;line-height:1.4}
    .ctrl-toast.good{border-left:3px solid #7ddd9f}
    .ctrl-toast.bad{border-left:3px solid #ff7a7a}
    .ctrl-toast.warn{border-left:3px solid #e8c07a}
    .ctrl-target-bar{display:flex;align-items:center;gap:10px;padding:11px 14px;background:rgba(120,90,255,0.1);border:1px solid rgba(120,90,255,0.35);border-radius:10px;color:#c5b3ff;font-size:13px;margin-bottom:16px}
    .ctrl-target-bar.empty{background:rgba(28,28,34,0.6);border-color:rgba(70,70,82,0.5);color:#8a8a9a}
    .ctrl-label{font-size:11px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;margin:18px 0 8px}
    .ctrl-hint{color:#6a6a7a;font-size:11.5px;line-height:1.5;margin-top:6px}
  `;

  const controlJs = `
(function(){
  var SESSION_ID = null;
  var USERNAME = null;
  var MY_ROBLOX_ID = parseInt(localStorage.getItem('ctrl_roblox_id') || '0', 10) || null;
  var ws = null;
  var users = {};
  var selectedUserId = null;
  var reconnectTimer = null;

  function $(id){ return document.getElementById(id); }

  function toast(title, body, kind){
    var wrap = $('ctrlToasts');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'ctrlToasts';
      wrap.className = 'ctrl-toasts';
      document.body.appendChild(wrap);
    }
    var el = document.createElement('div');
    el.className = 'ctrl-toast ' + (kind || '');
    var t = document.createElement('div'); t.className = 'tt'; t.textContent = title;
    var b = document.createElement('div'); b.className = 'tb'; b.textContent = body || '';
    el.appendChild(t); el.appendChild(b);
    wrap.appendChild(el);
    setTimeout(function(){
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 3400);
  }

  function setStatus(cls, text){
    var b = $('statusBadge'); if (!b) return;
    b.className = 'ctrl-status ' + cls;
    b.innerHTML = '<span class="dot"></span> ' + text;
  }

  function fmtPlace(id){
    if (!id) return 'Unknown place';
    return 'Place ' + id;
  }

  var SCRIPT_KILL = [
    'local lp = game:GetService("Players").LocalPlayer',
    'if lp.Character then',
    '    local h = lp.Character:FindFirstChildOfClass("Humanoid")',
    '    if h then h.Health = 0 end',
    'end'
  ].join('\\n');

  var SCRIPT_TRIP = [
    'local lp = game:GetService("Players").LocalPlayer',
    'local char = lp.Character',
    'if char then',
    '    local hum = char:FindFirstChildOfClass("Humanoid")',
    '    local root = char:FindFirstChild("HumanoidRootPart")',
    '    if hum and root then',
    '        hum:ChangeState(Enum.HumanoidStateType.FallingDown)',
    '        root.Velocity = root.CFrame.LookVector * 30',
    '    end',
    'end'
  ].join('\\n');

  var SCRIPT_FLING = [
    'local lp = game:GetService("Players").LocalPlayer',
    'local char = lp.Character',
    'if char then',
    '    for _, p in pairs(char:GetDescendants()) do',
    '        if p:IsA("BasePart") then p.CanCollide = false end',
    '    end',
    '    local hrp = char:FindFirstChild("HumanoidRootPart")',
    '    if hrp then',
    '        local old = hrp:FindFirstChild("TrollFling")',
    '        if old then old:Destroy() end',
    '        local bav = Instance.new("BodyAngularVelocity")',
    '        bav.Name = "TrollFling"',
    '        bav.AngularVelocity = Vector3.new(999999, 999999, 999999)',
    '        bav.MaxTorque = Vector3.new(math.huge, math.huge, math.huge)',
    '        bav.P = 1250',
    '        bav.Parent = hrp',
    '        task.delay(4, function() if bav and bav.Parent then bav:Destroy() end end)',
    '    end',
    'end'
  ].join('\\n');

  var SCRIPT_FREEZE = [
    'local lp = game:GetService("Players").LocalPlayer',
    'local char = lp.Character',
    'if char then',
    '    for _, p in pairs(char:GetDescendants()) do',
    '        if p:IsA("BasePart") and not p.Anchored then p.Anchored = true end',
    '    end',
    'end'
  ].join('\\n');

  var SCRIPT_UNFREEZE = [
    'local lp = game:GetService("Players").LocalPlayer',
    'local char = lp.Character',
    'if char then',
    '    for _, p in pairs(char:GetDescendants()) do',
    '        if p:IsA("BasePart") and p.Anchored then p.Anchored = false end',
    '    end',
    'end'
  ].join('\\n');

  var SCRIPT_FIRE = [
    'local lp = game:GetService("Players").LocalPlayer',
    'local char = lp.Character',
    'if not char then return end',
    'for _, p in pairs(char:GetDescendants()) do',
    '    if p:IsA("Fire") and p.Name == "TrollFire" then p:Destroy() end',
    'end',
    'for _, p in pairs(char:GetDescendants()) do',
    '    if p:IsA("BasePart") then',
    '        local f = Instance.new("Fire")',
    '        f.Name = "TrollFire"',
    '        f.Size = 8',
    '        f.Heat = 10',
    '        f.Parent = p',
    '    end',
    'end'
  ].join('\\n');

  var SCRIPT_UNFIRE = [
    'local lp = game:GetService("Players").LocalPlayer',
    'local char = lp.Character',
    'if not char then return end',
    'for _, p in pairs(char:GetDescendants()) do',
    '    if p:IsA("Fire") and p.Name == "TrollFire" then p:Destroy() end',
    'end'
  ].join('\\n');

  var SCRIPT_SMOKE = [
    'local lp = game:GetService("Players").LocalPlayer',
    'local char = lp.Character',
    'if not char then return end',
    'for _, p in pairs(char:GetDescendants()) do',
    '    if p:IsA("Smoke") and p.Name == "TrollSmoke" then p:Destroy() end',
    'end',
    'for _, p in pairs(char:GetDescendants()) do',
    '    if p:IsA("BasePart") then',
    '        local s = Instance.new("Smoke")',
    '        s.Name = "TrollSmoke"',
    '        s.Size = 6',
    '        s.Opacity = 0.5',
    '        s.RiseVelocity = 3',
    '        s.Parent = p',
    '    end',
    'end'
  ].join('\\n');

  var SCRIPT_UNSMOKE = [
    'local lp = game:GetService("Players").LocalPlayer',
    'local char = lp.Character',
    'if not char then return end',
    'for _, p in pairs(char:GetDescendants()) do',
    '    if p:IsA("Smoke") and p.Name == "TrollSmoke" then p:Destroy() end',
    'end'
  ].join('\\n');

  var SCRIPT_UNBANG = [
    'if _G._IY_BangTrack then pcall(function() _G._IY_BangTrack:Stop() end) pcall(function() _G._IY_BangTrack:Destroy() end) _G._IY_BangTrack = nil end',
    'if _G._IY_BangAnim then pcall(function() _G._IY_BangAnim:Destroy() end) _G._IY_BangAnim = nil end',
    'if _G._IY_BangLoop then pcall(function() _G._IY_BangLoop:Disconnect() end) _G._IY_BangLoop = nil end'
  ].join('\\n');

  function findPlayerLua(varName, ctrlName){
    return [
      'local ' + varName + ' = nil',
      'do',
      '  local want = string.lower("' + ctrlName + '")',
      '  for _, plr in ipairs(Players:GetPlayers()) do',
      '    if string.lower(plr.Name) == want or string.lower(plr.DisplayName) == want then',
      '      ' + varName + ' = plr',
      '      break',
      '    end',
      '  end',
      'end'
    ];
  }

  function buildBangScript(ctrlName){
    return [
      'local Players = game:GetService("Players")',
      'local RunService = game:GetService("RunService")',
      'local lp = Players.LocalPlayer',
      'local char = lp.Character',
      'if not char then return end',
      'local hum = char:FindFirstChildOfClass("Humanoid")',
      'if not hum then return end',
      'if _G._IY_BangTrack then pcall(function() _G._IY_BangTrack:Stop() end) pcall(function() _G._IY_BangTrack:Destroy() end) _G._IY_BangTrack = nil end',
      'if _G._IY_BangLoop then pcall(function() _G._IY_BangLoop:Disconnect() end) _G._IY_BangLoop = nil end'
    ].concat(findPlayerLua('controller', ctrlName)).concat([
      'if not controller then return end',
      'local animator = hum:FindFirstChildOfClass("Animator")',
      'if not animator then animator = Instance.new("Animator") animator.Parent = hum end',
      'local anim = Instance.new("Animation")',
      'if hum.RigType == Enum.HumanoidRigType.R15 then anim.AnimationId = "rbxassetid://5918726674" else anim.AnimationId = "rbxassetid://148840371" end',
      'local ok, track = pcall(function() return animator:LoadAnimation(anim) end)',
      'if ok and track then',
      '  track.Priority = Enum.AnimationPriority.Action',
      '  track.Looped = true',
      '  pcall(function() track:Play(0.1, 1, 1) end)',
      '  pcall(function() track:AdjustSpeed(3) end)',
      '  _G._IY_BangTrack = track',
      '  _G._IY_BangAnim = anim',
      'end',
      'local offset = CFrame.new(0, 0, 1.1)',
      '_G._IY_BangLoop = RunService.Stepped:Connect(function()',
      '  local myChar = lp.Character',
      '  if not myChar then return end',
      '  local myRoot = myChar:FindFirstChild("HumanoidRootPart")',
      '  if not myRoot then return end',
      '  local cChar = controller.Character',
      '  if not cChar then return end',
      '  local cTorso = cChar:FindFirstChild("Torso") or cChar:FindFirstChild("UpperTorso") or cChar:FindFirstChild("LowerTorso") or cChar:FindFirstChild("HumanoidRootPart")',
      '  if not cTorso then return end',
      '  myRoot.CFrame = cTorso.CFrame * offset',
      'end)'
    ]).join('\\n');
  }

  function buildHeadsitScript(ctrlName){
    return [
      'local Players = game:GetService("Players")',
      'local RunService = game:GetService("RunService")',
      'local UserInputService = game:GetService("UserInputService")',
      'local lp = Players.LocalPlayer'
    ].concat(findPlayerLua('me', ctrlName)).concat([
      'if not me or not me.Character then return end',
      'if not lp.Character then return end',
      'local hum = lp.Character:FindFirstChildOfClass("Humanoid")',
      'if not hum then return end',
      'hum.Sit = true',
      'if _G._IY_HeadsitConn then pcall(function() _G._IY_HeadsitConn:Disconnect() end) _G._IY_HeadsitConn = nil end',
      'if _G._IY_HeadsitJump then pcall(function() _G._IY_HeadsitJump:Disconnect() end) _G._IY_HeadsitJump = nil end',
      'if _G._IY_HeadsitState then pcall(function() _G._IY_HeadsitState:Disconnect() end) _G._IY_HeadsitState = nil end',
      'local function stopHeadsit()',
      '  if _G._IY_HeadsitConn then pcall(function() _G._IY_HeadsitConn:Disconnect() end) _G._IY_HeadsitConn = nil end',
      '  if _G._IY_HeadsitJump then pcall(function() _G._IY_HeadsitJump:Disconnect() end) _G._IY_HeadsitJump = nil end',
      '  if _G._IY_HeadsitState then pcall(function() _G._IY_HeadsitState:Disconnect() end) _G._IY_HeadsitState = nil end',
      '  local h = lp.Character and lp.Character:FindFirstChildOfClass("Humanoid")',
      '  if h then pcall(function() h.Sit = false end) end',
      'end',
      '_G._IY_HeadsitJump = UserInputService.JumpRequest:Connect(function()',
      '  stopHeadsit()',
      'end)',
      '_G._IY_HeadsitState = hum.StateChanged:Connect(function(_, newState)',
      '  if newState == Enum.HumanoidStateType.Jumping or newState == Enum.HumanoidStateType.Freefall then',
      '    stopHeadsit()',
      '  end',
      'end)',
      '_G._IY_HeadsitConn = RunService.Heartbeat:Connect(function()',
      '  local controllerChar = me.Character',
      '  local myChar = lp.Character',
      '  if not controllerChar or not myChar then stopHeadsit() return end',
      '  local controllerRoot = controllerChar:FindFirstChild("HumanoidRootPart")',
      '  local myRoot = myChar:FindFirstChild("HumanoidRootPart")',
      '  local myHum = myChar:FindFirstChildOfClass("Humanoid")',
      '  if not (controllerRoot and myRoot and myHum and myHum.Sit) then',
      '    stopHeadsit()',
      '    return',
      '  end',
      '  myRoot.CFrame = controllerRoot.CFrame * CFrame.new(0, 1.6, 0.4)',
      'end)'
    ]).join('\\n');
  }

  function buildBringScript(ctrlName){
    return [
      'local Players = game:GetService("Players")',
      'local lp = Players.LocalPlayer'
    ].concat(findPlayerLua('me', ctrlName)).concat([
      'if not me or not me.Character then return end',
      'local myHRP = me.Character:FindFirstChild("HumanoidRootPart")',
      'if not myHRP then return end',
      'if not lp.Character then return end',
      'local h = lp.Character:FindFirstChild("HumanoidRootPart")',
      'if h then h.CFrame = myHRP.CFrame * CFrame.new(0, 3, 0) end'
    ]).join('\\n');
  }

  function send(msg){
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    toast('Not connected', 'WebSocket is not open', 'bad');
    return false;
  }

  function pickTarget(uid){
    selectedUserId = uid;
    renderUsers();
    updateTargetBars();
  }

  function updateTargetBars(){
    var u = selectedUserId ? users[selectedUserId] : null;
    var name = u ? (u.displayName || ('User ' + u.userId)) : null;
    var cls = 'ctrl-target-bar' + (name ? '' : ' empty');
    var txt = name ? ('Target: ' + name + ' (ID ' + selectedUserId + ')') : 'No target selected — pick one in the Players tab.';
    ['trollTargetInfo','execTargetInfo','joinTargetInfo'].forEach(function(id){
      var el = $(id); if (!el) return;
      el.className = cls;
      el.textContent = txt;
    });
    if (u && u.placeId) {
      var p = $('joinPlaceId'); if (p && !p.value) p.value = u.placeId;
      var j = $('joinJobId');  if (j && !j.value) j.value = u.jobId || '';
    }
  }

  function renderUsers(){
    var box = $('usersList'); if (!box) return;
    var ids = Object.keys(users);
    var cnt = $('playerCount');
    if (cnt) cnt.textContent = ids.length;
    if (ids.length === 0) {
      box.innerHTML = '<div class="ctrl-hint" style="text-align:center;padding:30px 0">No hub clients connected right now. Open hubscript.lua in an executor to see them here.</div>';
      return;
    }
    var html = '';
    ids.forEach(function(uid){
      var u = users[uid];
      var isSel = String(uid) === String(selectedUserId);
      var nm = (u.displayName || ('User ' + uid)).replace(/[<>&"]/g, function(c){ return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]; });
      var img = u.thumbnail || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42"><rect width="42" height="42" rx="9" fill="#2a2a34"/></svg>');
      html += '<div class="ctrl-user' + (isSel ? ' selected' : '') + '" data-uid="' + uid + '">' +
        '<img src="' + img + '" onerror="this.style.opacity=0.3">' +
        '<div class="meta">' +
          '<div class="nm">' + nm + '</div>' +
          '<div class="sub">' + fmtPlace(u.placeId) + ' · ' + (u.jobId || 'no job') + '</div>' +
        '</div>' +
        '<div class="badge">' + (u.transport || 'ws') + '</div>' +
      '</div>';
    });
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll('.ctrl-user'), function(el){
      el.addEventListener('click', function(){ pickTarget(el.getAttribute('data-uid')); });
    });
  }

  function handleMessage(data){
    if (!data || !data.type) return;
    if (data.type === 'authFailed') {
      toast('Authentication failed', data.reason || 'Not whitelisted', 'bad');
      try { ws.close(); } catch(e) {}
      return;
    }
    if (data.type === 'userList') {
      users = {};
      (data.users || []).forEach(function(u){ if (u.userId) users[u.userId] = u; });
      renderUsers(); updateTargetBars();
      return;
    }
    if (data.type === 'userJoined') {
      if (data.userId) {
        users[data.userId] = data;
        renderUsers();
        toast('Client connected', data.displayName || ('User ' + data.userId), 'good');
      }
      return;
    }
    if (data.type === 'userLeft') {
      if (data.userId && users[data.userId]) {
        var gone = users[data.userId];
        delete users[data.userId];
        if (String(selectedUserId) === String(data.userId)) { selectedUserId = null; updateTargetBars(); }
        renderUsers();
        toast('Client disconnected', gone.displayName || ('User ' + data.userId), 'bad');
      }
      return;
    }
    if (data.type === 'ping') {
      if (data.userId) { users[data.userId] = data; renderUsers(); }
      return;
    }
    if (data.type === 'output') {
      var out = $('outputBox'); if (!out) return;
      var stamp = new Date().toLocaleTimeString();
      var targetName = data.userId ? ('User ' + data.userId) : 'unknown';
      var line = '[' + stamp + '] from ' + targetName + ':\\n' + (data.output || '(no output)');
      if (data.error) line += '\\nERROR: ' + data.error;
      if (out.textContent === '> Waiting for target output...') out.textContent = '';
      out.textContent += (out.textContent ? '\\n\\n' : '') + line;
      out.scrollTop = out.scrollHeight;
      return;
    }
  }

  function connect(){
    setStatus('connecting', 'Connecting...');
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = proto + '//' + location.host;
    try { ws = new WebSocket(url); } catch (e) { setStatus('offline', 'Failed to open'); return; }
    ws.onopen = function(){
      setStatus('online', 'Connected');
      ws.send(JSON.stringify({
        type: 'identify',
        userId: SESSION_ID,
        username: USERNAME,
        displayName: USERNAME,
        isWeb: true
      }));
    };
    ws.onmessage = function(ev){
      var data; try { data = JSON.parse(ev.data); } catch(e){ return; }
      handleMessage(data);
    };
    ws.onclose = function(){
      setStatus('offline', 'Disconnected');
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = function(){ setStatus('offline', 'Connection error'); };
  }

  function sendToTarget(script, label){
    if (!selectedUserId) { toast('No target', 'Pick a user in the Players tab', 'bad'); return; }
    if (!send({ type: 'execute', targetUserId: selectedUserId, script: script, fromUserId: SESSION_ID })) return;
    toast('Sent', (label || 'Script') + ' → ' + (users[selectedUserId] ? users[selectedUserId].displayName : selectedUserId), 'good');
    setActiveTab('output');
  }

  function setActiveTab(name){
    Array.prototype.forEach.call(document.querySelectorAll('.ctrl-tab'), function(b){
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.ctrl-panel'), function(p){
      p.classList.toggle('active', p.getAttribute('data-panel') === name);
    });
  }

  function requiresMyId(handler){
    var name = String(USERNAME || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!name) {
      toast('Not logged in', 'Log in with your Roblox username first.', 'warn');
      return;
    }
    handler(name);
  }

  var TROLL_ACTIONS = {
    kill: function(){ sendToTarget(SCRIPT_KILL, 'Kill'); },
    fling: function(){ sendToTarget(SCRIPT_FLING, 'Fling'); },
    trip: function(){ sendToTarget(SCRIPT_TRIP, 'Trip'); },
    freeze: function(){ sendToTarget(SCRIPT_FREEZE, 'Freeze'); },
    unfreeze: function(){ sendToTarget(SCRIPT_UNFREEZE, 'Unfreeze'); },
    fire: function(){ sendToTarget(SCRIPT_FIRE, 'Fire'); },
    unfire: function(){ sendToTarget(SCRIPT_UNFIRE, 'Unfire'); },
    smoke: function(){ sendToTarget(SCRIPT_SMOKE, 'Smoke'); },
    unsmoke: function(){ sendToTarget(SCRIPT_UNSMOKE, 'Unsmoke'); },
    bang: function(){ requiresMyId(function(id){ sendToTarget(buildBangScript(id), 'Bang'); }); },
    unbang: function(){ sendToTarget(SCRIPT_UNBANG, 'Unbang'); },
    headsit: function(){ requiresMyId(function(id){ sendToTarget(buildHeadsitScript(id), 'Headsit'); }); },
    bring: function(){ requiresMyId(function(id){ sendToTarget(buildBringScript(id), 'Bring'); }); }
  };

  window.addEventListener('DOMContentLoaded', function(){
    var loginBtn = $('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', doLogin);
    var userInput = $('usernameInput');
    if (userInput) userInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') doLogin(); });

    var logout = $('logoutBtn');
    if (logout) logout.addEventListener('click', function(){
      try { if (ws) ws.close(); } catch(e){}
      location.reload();
    });

    Array.prototype.forEach.call(document.querySelectorAll('.ctrl-tab'), function(b){
      b.addEventListener('click', function(){ setActiveTab(b.getAttribute('data-tab')); });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.ctrl-btn[data-action]'), function(b){
      b.addEventListener('click', function(){
        var a = b.getAttribute('data-action');
        if (TROLL_ACTIONS[a]) TROLL_ACTIONS[a]();
      });
    });

    var execBtn = $('execBtn');
    if (execBtn) execBtn.addEventListener('click', function(){
      var code = $('execScript').value.trim();
      if (!code) { toast('Empty script', 'Write something first', 'bad'); return; }
      sendToTarget(code, 'Custom script');
    });

    var joinBtn = $('joinBtn');
    if (joinBtn) joinBtn.addEventListener('click', function(){
      var pid = $('joinPlaceId').value.trim();
      var jid = $('joinJobId').value.trim();
      if (!pid) { toast('Place ID needed', 'Enter a Place ID', 'bad'); return; }
      var deeplink = jid
        ? 'roblox://experiences/start?placeId=' + pid + '&gameInstanceId=' + jid
        : 'roblox://placeId=' + pid;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(deeplink).then(function(){
          toast('Deeplink copied', 'Paste in your browser address bar', 'good');
        }).catch(function(){
          toast('Copy failed', deeplink, 'bad');
        });
      } else {
        toast('Clipboard unavailable', deeplink, 'warn');
      }
    });

    var refresh = $('refreshUsersBtn');
    if (refresh) refresh.addEventListener('click', function(){
      if (send({ type: 'requestUserList', userId: SESSION_ID })) {
        toast('Refreshing', 'Requested fresh list', 'good');
      }
    });

    var clearBtn = $('clearOutputBtn');
    if (clearBtn) clearBtn.addEventListener('click', function(){
      $('outputBox').textContent = '> Waiting for target output...';
    });

    var selfName = $('trollSelfName');
    if (selfName && USERNAME) selfName.textContent = USERNAME;
  });

  function doLogin(){
    var username = ($('usernameInput').value || '').trim();
    if (!username) { toast('Enter a username', '', 'bad'); return; }
    $('loginError').style.display = 'none';
    var btn = $('loginBtn');
    btn.disabled = true; btn.textContent = 'Checking...';
    fetch('/api/control/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username })
    }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(res){
        btn.disabled = false; btn.textContent = 'Authenticate';
        if (!res.ok || !res.data.ok) {
          $('loginError').style.display = 'block';
          $('loginError').textContent = (res.data && res.data.error) || 'Authentication failed.';
          return;
        }
        USERNAME = res.data.username;
        SESSION_ID = 'web_' + USERNAME + '_' + Math.random().toString(36).slice(2, 10);
        $('currentUser').textContent = USERNAME;
        var sn = $('trollSelfName'); if (sn) sn.textContent = USERNAME;
        $('loginView').style.display = 'none';
        $('panelView').style.display = 'block';
        connect();
      })
      .catch(function(e){
        btn.disabled = false; btn.textContent = 'Authenticate';
        $('loginError').style.display = 'block';
        $('loginError').textContent = 'Network error: ' + e.message;
      });
  }
})();
  `;

  const bodyHtml = `
    ${topNav('control')}

    <div id="loginView" style="max-width:440px;margin:60px auto">
      <div class="tag">CONTROL PANEL</div>
      <div class="h1">Whitelist Access</div>
      <p class="sub">Enter your Roblox username to access the control panel. Only whitelisted users may proceed.</p>
      <div class="ctrl-card">
        <div class="label">Roblox Username</div>
        <input id="usernameInput" class="input" type="text" placeholder="Your Roblox username" autocomplete="off" spellcheck="false">
        <button id="loginBtn" class="btn" style="margin-top:16px">Authenticate</button>
        <div id="loginError" style="display:none;color:#ff7a7a;font-size:13px;margin-top:14px;line-height:1.5"></div>
      </div>
    </div>

    <div id="panelView" class="ctrl-wrap" style="display:none">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap">
        <div>
          <div class="tag" style="margin-bottom:6px">CONTROL PANEL</div>
          <div class="h1" style="margin:0;font-size:22px">Remote Controller</div>
        </div>
        <div id="statusBadge" class="ctrl-status connecting"><span class="dot"></span> Connecting...</div>
        <div style="color:#8a8a9a;font-size:13px">Logged in as <b id="currentUser" style="color:#fff">—</b></div>
        <button id="logoutBtn" class="ctrl-btn" style="margin-left:auto;padding:8px 14px;font-size:12px">Log out</button>
      </div>

      <div class="ctrl-tabs">
        <button class="ctrl-tab active" data-tab="players">Players <span class="tab-count" id="playerCount">0</span></button>
        <button class="ctrl-tab" data-tab="troll">Troll</button>
        <button class="ctrl-tab" data-tab="exec">Exec</button>
        <button class="ctrl-tab" data-tab="join">Join</button>
        <button class="ctrl-tab" data-tab="output">Output</button>
      </div>

      <div class="ctrl-panel active" data-panel="players">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <div class="ctrl-label" style="margin:0">Connected hub clients</div>
            <div class="ctrl-hint" style="margin-top:4px">Click a user to select them as your target.</div>
          </div>
          <button id="refreshUsersBtn" class="ctrl-btn" style="font-size:12px;padding:8px 14px">Refresh</button>
        </div>
        <div id="usersList"></div>
      </div>

      <div class="ctrl-panel" data-panel="troll">
        <div id="trollTargetInfo" class="ctrl-target-bar empty">No target selected.</div>

        <div class="ctrl-hint" style="margin-top:0">Bang, Headsit, and Bring find you in the target's server by username <b id="trollSelfName">—</b>. Be in the same Roblox server (hubscript not needed on your account).</div>

        <div class="ctrl-label">Character</div>
        <div class="ctrl-grid">
          <button class="ctrl-btn danger" data-action="kill">Kill</button>
          <button class="ctrl-btn danger" data-action="fling">Fling</button>
          <button class="ctrl-btn danger" data-action="trip">Trip</button>
          <button class="ctrl-btn" data-action="freeze">Freeze</button>
          <button class="ctrl-btn" data-action="unfreeze">Unfreeze</button>
        </div>

        <div class="ctrl-label">Follow / Bind</div>
        <div class="ctrl-grid">
          <button class="ctrl-btn" data-action="bang">Bang</button>
          <button class="ctrl-btn" data-action="unbang">Unbang</button>
          <button class="ctrl-btn" data-action="headsit">Headsit</button>
          <button class="ctrl-btn" data-action="bring">Bring to Me</button>
        </div>

        <div class="ctrl-label">Effects</div>
        <div class="ctrl-grid">
          <button class="ctrl-btn" data-action="fire">Fire</button>
          <button class="ctrl-btn" data-action="unfire">Unfire</button>
          <button class="ctrl-btn" data-action="smoke">Smoke</button>
          <button class="ctrl-btn" data-action="unsmoke">Unsmoke</button>
        </div>
      </div>

      <div class="ctrl-panel" data-panel="exec">
        <div id="execTargetInfo" class="ctrl-target-bar empty">No target selected.</div>
        <div class="ctrl-label" style="margin-top:0">Lua Script</div>
        <textarea id="execScript" class="ctrl-textarea" placeholder="-- script to run on target" spellcheck="false"></textarea>
        <button id="execBtn" class="btn" style="margin-top:14px;max-width:280px">Execute on Target</button>
      </div>

      <div class="ctrl-panel" data-panel="join">
        <div id="joinTargetInfo" class="ctrl-target-bar empty">No target selected.</div>
        <div class="ctrl-label" style="margin-top:0">Place ID</div>
        <input id="joinPlaceId" class="input" type="text" placeholder="Place ID" autocomplete="off">
        <div class="ctrl-label">Job ID (optional)</div>
        <input id="joinJobId" class="input" type="text" placeholder="Leave empty for any server" autocomplete="off">
        <button id="joinBtn" class="btn" style="margin-top:16px;max-width:280px">Copy Deeplink</button>
        <div class="ctrl-hint">The web panel can't launch Roblox directly. It copies a deeplink; paste it in your browser's address bar. If a target is selected, their Place/Job IDs are prefilled.</div>
      </div>

      <div class="ctrl-panel" data-panel="output">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="ctrl-label" style="margin:0">Live output from targets</div>
          <button id="clearOutputBtn" class="ctrl-btn" style="font-size:12px;padding:8px 14px">Clear</button>
        </div>
        <div id="outputBox" class="ctrl-output">&gt; Waiting for target output...</div>
      </div>
    </div>
  `;

  const html = pageShell("Control Panel - Roblox Script Hub", bodyHtml, controlCss, controlJs);
  res.set("Content-Type", "text/html").send(html);
});

// ─── RELAY ───
function userListPayload() {
  const users = [];
  for (const [ws, info] of wsClients) if (info.userId && !info.isWeb) users.push({ ...info, transport: "ws" });
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
  if (targetUserId == null) return false;
  const target = String(targetUserId);
  for (const [ws, info] of wsClients) {
    if (info.userId != null && String(info.userId) === target && ws.readyState === 1) {
      ws.send(JSON.stringify(obj));
      return true;
    }
  }
  for (const [uid, entry] of httpClients) {
    if (String(uid) === target) { entry.queue.push(obj); return true; }
  }
  return false;
}

wss.on("connection", (ws) => {
  wsClients.set(ws, {});
  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const self = wsClients.get(ws);
    if (data.type === "identify") {
      if (data.isWeb) {
        if (!isWhitelistedUsername(data.username)) {
          try { ws.send(JSON.stringify({ type: "authFailed", reason: "Username is not on the whitelist" })); } catch (e) {}
          try { ws.close(); } catch (e) {}
          return;
        }
      }
      Object.assign(self, data, { ts: Date.now(), transport: "ws" });
      ws.send(JSON.stringify({ type: "userList", users: userListPayload() }));
      if (!self.isWeb) broadcast({ type: "userJoined", ...self }, ws);
    } else if (data.type === "ping") {
      Object.assign(self, data, { ts: Date.now() });
      ws.send(JSON.stringify({ type: "pong", userId: data.userId }));
      if (!self.isWeb) {
        const msg = JSON.stringify({ type: "ping", ...data });
        for (const [otherWs, otherInfo] of wsClients) if (otherWs !== ws && otherInfo.userId && !otherInfo.isWeb && otherWs.readyState === 1) otherWs.send(msg);
        for (const [, entry] of httpClients) entry.queue.push({ type: "ping", ...data });
      }
    } else if (data.type === "requestUserList") {
      ws.send(JSON.stringify({ type: "userList", users: userListPayload() }));
    } else if (data.type === "execute" || data.type === "output") {
      deliverTo(data.targetUserId, data);
    }
  });
  ws.on("close", () => {
    const info = wsClients.get(ws);
    if (info?.userId && !info?.isWeb) broadcast({ type: "userLeft", userId: info.userId });
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

// ─── LUA FILES ───
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

// ═══════════════════════════════════════════════════════════════
//  FILE UPLOADS
// ═══════════════════════════════════════════════════════════════
const UPLOAD_DIR = path.join(__dirname, "uploads");
const UPLOADS_FILE = path.join(__dirname, "uploads.json");
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

if (!fs.existsSync(UPLOAD_DIR)) { try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { console.error("[uploads] mkdir failed:", e.message); } }

let uploads = {};
try { if (fs.existsSync(UPLOADS_FILE)) uploads = JSON.parse(fs.readFileSync(UPLOADS_FILE, "utf8")) || {}; } catch (e) { console.error("[uploads] load error:", e.message); }

let uploadsSaveTimer = null;
function saveUploads() {
  if (uploadsSaveTimer) return;
  uploadsSaveTimer = setTimeout(() => {
    uploadsSaveTimer = null;
    try { fs.writeFileSync(UPLOADS_FILE, JSON.stringify(uploads, null, 2)); } catch (e) { console.error("[uploads] save error:", e.message); }
  }, 300);
}
function newUploadId() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function extFromMime(mime) {
  if (!mime) return ".bin";
  const m = String(mime).toLowerCase();
  const map = {
    "video/mp4":".mp4", "video/webm":".webm", "video/quicktime":".mov", "video/x-matroska":".mkv",
    "video/x-msvideo":".avi", "video/mpeg":".mpeg", "video/ogg":".ogv",
    "image/png":".png", "image/jpeg":".jpg", "image/gif":".gif", "image/webp":".webp", "image/svg+xml":".svg",
    "audio/mpeg":".mp3", "audio/ogg":".ogg", "audio/wav":".wav", "audio/webm":".weba",
    "application/pdf":".pdf", "application/zip":".zip", "application/x-zip-compressed":".zip",
    "application/x-rar-compressed":".rar", "application/json":".json", "text/plain":".txt"
  };
  return map[m] || "";
}
function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024*1024) return (n/1024).toFixed(1) + " KB";
  if (n < 1024*1024*1024) return (n/(1024*1024)).toFixed(1) + " MB";
  return (n/(1024*1024*1024)).toFixed(2) + " GB";
}
function uploadUrlFor(u) { return "/f/" + u.id + "/" + encodeURIComponent(u.originalName); }
function shareUrlFor(u) { return "/v/" + u.id + "/" + encodeURIComponent(u.originalName); }

// ── Raw file server with HTTP Range support (used by the <video> player) ──
function serveUpload(req, res) {
  const meta = uploads[req.params.id];
  if (!meta) return res.status(404).set("Content-Type", "text/plain").send("File not found");
  const filePath = path.join(UPLOAD_DIR, meta.storedName);
  let stat;
  try { stat = fs.statSync(filePath); } catch (e) { return res.status(404).set("Content-Type", "text/plain").send("File not found"); }
  const total = stat.size;

  res.set("Content-Type", meta.contentType || "application/octet-stream");
  res.set("Accept-Ranges", "bytes");
  res.set("Content-Disposition", 'inline; filename="' + String(meta.originalName).replace(/["\r\n]/g, "_") + '"');
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  res.removeHeader("X-Frame-Options");

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] === "" ? null : parseInt(m[1], 10);
      let end = m[2] === "" ? null : parseInt(m[2], 10);
      if (start === null && end !== null) { start = Math.max(0, total - end); end = total - 1; }
      if (start === null) start = 0;
      if (end === null || end >= total) end = total - 1;
      if (isNaN(start) || isNaN(end) || start > end || start >= total) {
        res.status(416).set("Content-Range", "bytes */" + total).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.set("Content-Range", "bytes " + start + "-" + end + "/" + total);
      res.set("Content-Length", String(chunkSize));
      fs.createReadStream(filePath, { start, end }).on("error", () => res.end()).pipe(res);
      return;
    }
  }
  res.set("Content-Length", String(total));
  fs.createReadStream(filePath).on("error", () => res.end()).pipe(res);
}

app.get("/f/:id", serveUpload);
app.get("/f/:id/:filename", serveUpload);

// ── Share page with Open Graph / Twitter player meta tags for Discord embeds ──
app.get("/v/:id/:filename", (req, res) => {
  const meta = uploads[req.params.id];
  if (!meta) {
    return res.status(404).set("Content-Type", "text/html").send(
      pageShell("File not found - Roblox Script Hub", `
        ${topNav('upload')}
        <div style="text-align:center;padding:60px 20px">
          <div class="h1">File not found</div>
          <p class="sub" style="margin:8px auto 20px">This upload doesn't exist or has been removed.</p>
          <a href="/upload" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#7850ff,#2f8fff);color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Back to Upload</a>
        </div>
      `)
    );
  }

  const rawUrl = "/f/" + meta.id + "/" + encodeURIComponent(meta.originalName);
  const origin = (req.headers["x-forwarded-proto"] || req.protocol || "https") + "://" + (req.headers["x-forwarded-host"] || req.headers.host);
  const absoluteRaw = origin + rawUrl;
  const safeName = sanitizeText(meta.originalName);
  const ct = meta.contentType || "";

  const isVideo = ct.indexOf("video/") === 0;
  const isImage = ct.indexOf("image/") === 0;
  const isAudio = ct.indexOf("audio/") === 0;

  const videoMeta = isVideo ? `
    <meta property="og:video" content="${absoluteRaw}">
    <meta property="og:video:url" content="${absoluteRaw}">
    <meta property="og:video:secure_url" content="${absoluteRaw}">
    <meta property="og:video:type" content="${sanitizeText(ct)}">
    <meta property="og:video:width" content="1280">
    <meta property="og:video:height" content="720">
    <meta name="twitter:card" content="player">
    <meta name="twitter:player" content="${absoluteRaw}">
    <meta name="twitter:player:stream" content="${absoluteRaw}">
    <meta name="twitter:player:stream:content_type" content="${sanitizeText(ct)}">
  ` : "";

  const imageMeta = isImage ? `
    <meta property="og:image" content="${absoluteRaw}">
    <meta property="og:image:secure_url" content="${absoluteRaw}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${absoluteRaw}">
  ` : "";

  const audioMeta = isAudio ? `
    <meta property="og:audio" content="${absoluteRaw}">
    <meta property="og:audio:secure_url" content="${absoluteRaw}">
    <meta property="og:audio:type" content="${sanitizeText(ct)}">
    <meta name="twitter:card" content="player">
    <meta name="twitter:player" content="${absoluteRaw}">
    <meta name="twitter:player:stream" content="${absoluteRaw}">
    <meta name="twitter:player:stream:content_type" content="${sanitizeText(ct)}">
  ` : "";

  const previewHtml = isVideo
    ? `<video src="${rawUrl}" controls playsinline preload="metadata" style="max-width:100%;max-height:70vh;border-radius:12px;background:#000"></video>`
    : isImage
      ? `<img src="${rawUrl}" alt="${safeName}" style="max-width:100%;max-height:70vh;border-radius:12px">`
      : isAudio
        ? `<audio src="${rawUrl}" controls style="width:100%;max-width:520px"></audio>`
        : `<div class="card" style="max-width:420px;text-align:center;margin:0 auto"><div style="color:#6a6a7a;display:flex;justify-content:center;margin-bottom:12px">${ICONS.document(40)}</div><div style="color:#8a8a9a;font-size:13px">This file type can't be previewed inline.</div></div>`;

  const sharePageUrl = origin + "/v/" + meta.id + "/" + encodeURIComponent(meta.originalName);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeName} - Roblox Script Hub</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:site_name" content="Roblox Script Hub">
<meta property="og:title" content="${safeName}">
<meta property="og:description" content="Shared via Roblox Script Hub">
<meta property="og:type" content="${isVideo ? "video.other" : isAudio ? "music.song" : "website"}">
<meta property="og:url" content="${sharePageUrl}">
${videoMeta}
${imageMeta}
${audioMeta}
<meta name="theme-color" content="#0b0b10">
<style>
  *{box-sizing:border-box}
  body{background:#0b0b10;color:#eee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:24px;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
  a{color:#b9a3ff}
  .wrap{max-width:900px;width:100%;text-align:center}
  .back{display:inline-flex;align-items:center;gap:6px;color:#8a8a9a;text-decoration:none;font-size:13px;font-weight:600;margin-bottom:18px}
  .back:hover{color:#fff}
  .name{font-size:18px;font-weight:700;color:#fff;margin:16px 0 6px;word-break:break-all}
  .meta{color:#8a8a9a;font-size:12px;margin-bottom:18px}
  .actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px}
  .btn{padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(120,90,255,0.5);background:rgba(120,90,255,0.18);color:#c5b3ff;text-decoration:none;transition:all .15s;font-family:inherit;display:inline-flex;align-items:center;gap:8px}
  .btn:hover{background:rgba(120,90,255,0.32);color:#fff;transform:translateY(-1px)}
  .card{background:rgba(28,28,34,0.7);border:1px solid rgba(90,90,105,0.55);border-radius:14px;padding:22px}
</style>
</head>
<body>
<div class="wrap">
  <a href="/upload" class="back">← Back to Upload</a>
  <div>${previewHtml}</div>
  <div class="name">${safeName}</div>
  <div class="meta">${fmtBytes(meta.size)} · ${sanitizeText(ct || "unknown")}</div>
  <div class="actions">
    <a class="btn" href="${rawUrl}" download>Download</a>
    <a class="btn" href="${rawUrl}" target="_blank" rel="noopener noreferrer">Open raw</a>
    <button class="btn" id="copyShare" type="button">Copy share link</button>
  </div>
</div>
<script>
  document.getElementById('copyShare').addEventListener('click', function(){
    var u = ${JSON.stringify(sharePageUrl)};
    var b = this;
    function done(){ var o = b.textContent; b.textContent = 'Copied!'; setTimeout(function(){ b.textContent = o; }, 1400); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(u).then(done).catch(function(){ done(); });
    } else {
      var ta = document.createElement('textarea'); ta.value = u; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); } catch(e){}
      document.body.removeChild(ta); done();
    }
  });
</script>
</body>
</html>`;

  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=300");
  res.send(html);
});

app.post("/api/upload", (req, res) => {
  let filename = "file";
  try { filename = decodeURIComponent(String(req.headers["x-filename"] || "file")); } catch (e) {}
  filename = filename.replace(/[\/\\\r\n\t]/g, "_").slice(0, 200) || "file";
  const contentType = String(req.headers["content-type"] || "application/octet-stream").slice(0, 120);

  let ext = path.extname(filename).slice(0, 10);
  if (!ext) ext = extFromMime(contentType);

  const id = newUploadId();
  const storedName = id + ext;
  const filePath = path.join(UPLOAD_DIR, storedName);

  const writeStream = fs.createWriteStream(filePath);
  let size = 0;
  let finished = false;
  let failed = false;

  function cleanup() {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }

  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES && !failed) {
      failed = true;
      try { req.destroy(); } catch (e) {}
      try { writeStream.destroy(); } catch (e) {}
      cleanup();
      if (!res.headersSent) res.status(413).json({ ok: false, error: "File too large. Max " + fmtBytes(MAX_UPLOAD_BYTES) + "." });
      return;
    }
    if (!failed) {
      const ok = writeStream.write(chunk);
      if (!ok) { req.pause(); writeStream.once("drain", () => req.resume()); }
    }
  });

  req.on("end", () => {
    if (failed || finished) return;
    finished = true;
    writeStream.end(() => {
      if (size === 0) { cleanup(); return res.status(400).json({ ok: false, error: "Empty file" }); }
      uploads[id] = {
        id, originalName: filename, storedName,
        size, contentType, uploadedAt: Date.now()
      };
      saveUploads();
      console.log(`[upload] ${id} ${filename} (${fmtBytes(size)}) ${contentType}`);
      res.json({
        ok: true,
        id,
        url: uploadUrlFor(uploads[id]),
        shareUrl: shareUrlFor(uploads[id]),
        size,
        name: filename,
        contentType
      });
    });
  });

  req.on("error", (e) => {
    if (failed || finished) return;
    failed = true;
    try { writeStream.destroy(); } catch (err) {}
    cleanup();
    if (!res.headersSent) res.status(500).json({ ok: false, error: "Upload failed: " + e.message });
  });

  writeStream.on("error", (e) => {
    if (failed || finished) return;
    failed = true;
    cleanup();
    if (!res.headersSent) res.status(500).json({ ok: false, error: "Write failed: " + e.message });
  });
});

app.get("/api/uploads", (req, res) => {
  const list = Object.values(uploads)
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
    .slice(0, 60)
    .map(u => ({
      id: u.id, name: u.originalName, size: u.size, contentType: u.contentType,
      uploadedAt: u.uploadedAt,
      url: uploadUrlFor(u),
      shareUrl: shareUrlFor(u)
    }));
  res.json({ ok: true, uploads: list });
});

// ─── /upload page ───
app.get("/upload", (req, res) => {
  const uploadCss = `
    .upload-zone{border:2px dashed rgba(120,90,255,0.5);border-radius:16px;padding:48px 24px;text-align:center;background:rgba(28,28,34,0.55);cursor:pointer;transition:all .2s;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);position:relative}
    .upload-zone:hover{border-color:rgba(120,90,255,0.8);background:rgba(40,40,50,0.7)}
    .upload-zone.dragover{border-color:#7850ff;background:rgba(120,90,255,0.12);transform:scale(1.01);box-shadow:0 0 0 4px rgba(120,90,255,0.15)}
    .upload-zone .uz-icon{display:flex;justify-content:center;margin-bottom:14px;color:#b9a3ff}
    .upload-zone .uz-title{font-size:17px;font-weight:700;color:#fff;margin-bottom:6px}
    .upload-zone .uz-sub{font-size:13px;color:#8a8a9a;line-height:1.55}
    .progress-wrap{margin-top:20px;display:none}
    .progress-bar{width:100%;height:10px;background:rgba(18,18,24,0.9);border:1px solid rgba(70,70,82,0.6);border-radius:6px;overflow:hidden}
    .progress-fill{height:100%;width:0%;background:linear-gradient(90deg,#7850ff,#2f8fff);transition:width .2s ease;box-shadow:0 0 14px rgba(120,90,255,0.6)}
    .progress-meta{display:flex;justify-content:space-between;font-size:12px;color:#8a8a9a;margin-top:8px}
    .result-card{margin-top:22px;padding:20px;background:rgba(30,58,42,0.28);border:1px solid rgba(125,221,159,0.4);border-radius:14px;display:none}
    .result-card.error{background:rgba(60,30,30,0.3);border-color:rgba(255,122,122,0.4)}
    .result-card .rc-title{font-size:14px;font-weight:700;color:#7ddd9f;margin-bottom:14px;display:flex;align-items:center;gap:8px}
    .result-card.error .rc-title{color:#ff7a7a}
    .result-link{font-family:ui-monospace,monospace;font-size:12.5px;background:rgba(18,18,24,0.9);border:1px solid rgba(70,70,82,0.7);border-radius:10px;padding:12px 14px;color:#b9a3ff;word-break:break-all;user-select:all;line-height:1.5}
    .result-actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
    .result-btn{padding:9px 18px;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(120,90,255,0.5);background:rgba(120,90,255,0.18);color:#c5b3ff;transition:all .15s;text-decoration:none;display:inline-flex;align-items:center;gap:7px}
    .result-btn:hover{background:rgba(120,90,255,0.3);transform:translateY(-1px);color:#fff}
    .result-preview{margin-top:14px;border-radius:12px;overflow:hidden;background:#0a0a10;border:1px solid rgba(60,60,72,0.6);max-height:420px;display:flex;justify-content:center}
    .result-preview img,.result-preview video{max-width:100%;max-height:420px;display:block}
    .result-meta{font-size:12px;color:#8a8a9a;margin-top:10px;line-height:1.55}
    .recent-list{margin-top:24px}
    .recent-item{display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(24,24,30,0.7);border:1px solid rgba(60,60,72,0.5);border-radius:10px;margin-bottom:8px;transition:all .15s;min-width:0}
    .recent-item:hover{border-color:rgba(120,90,255,0.5);background:rgba(40,40,50,0.85)}
    .recent-icon{width:40px;height:40px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(120,90,255,0.22),rgba(47,143,255,0.14));border:1px solid rgba(120,90,255,0.35);color:#b9a3ff}
    .recent-meta{flex:1;min-width:0}
    .recent-name{font-size:13.5px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .recent-sub{font-size:11.5px;color:#8a8a9a;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .recent-copy{background:rgba(120,90,255,0.15);border:1px solid rgba(120,90,255,0.4);color:#c5b3ff;padding:7px 13px;border-radius:8px;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;transition:all .15s;flex-shrink:0}
    .recent-copy:hover{background:rgba(120,90,255,0.3);color:#fff}
    .recent-empty{color:#6a6a7a;font-size:13px;text-align:center;padding:22px 0}
    @media (max-width:520px){
      .upload-zone{padding:34px 18px}
      .upload-zone .uz-title{font-size:15px}
      .result-actions{flex-direction:column}
      .result-btn{justify-content:center;width:100%}
    }
  `;

  const uploadJs = `
  (function(){
    var drop = document.getElementById('drop');
    var input = document.getElementById('fileInput');
    var progressWrap = document.getElementById('progressWrap');
    var progressFill = document.getElementById('progressFill');
    var progressPct = document.getElementById('progressPct');
    var progressSize = document.getElementById('progressSize');
    var resultCard = document.getElementById('resultCard');
    var resultTitle = document.getElementById('resultTitle');
    var resultBody = document.getElementById('resultBody');
    var recentList = document.getElementById('recentList');
    var MAX = ${MAX_UPLOAD_BYTES};

    function fmtBytes(n){
      n = Number(n) || 0;
      if (n < 1024) return n + ' B';
      if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
      if (n < 1024*1024*1024) return (n/(1024*1024)).toFixed(1) + ' MB';
      return (n/(1024*1024*1024)).toFixed(2) + ' GB';
    }
    function escapeHtml(s){return String(s).replace(/[<>&"']/g, function(c){return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c];});}
    function fullUrl(u){ return location.origin + u; }

    function copyText(text, cb){
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(cb).catch(function(){
          var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
          ta.select(); try { document.execCommand('copy'); } catch(e){}
          document.body.removeChild(ta); cb();
        });
      } else {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); } catch(e){}
        document.body.removeChild(ta); cb();
      }
    }

    function showError(msg){
      resultCard.style.display = 'block';
      resultCard.classList.add('error');
      resultTitle.textContent = 'Upload failed';
      resultBody.innerHTML = '<div style="color:#ff9a9a;font-size:13px;line-height:1.55">' + escapeHtml(msg) + '</div>';
      progressWrap.style.display = 'none';
    }

    function showResult(data){
      resultCard.style.display = 'block';
      resultCard.classList.remove('error');
      resultTitle.textContent = 'Upload complete';
      // Use the share URL so the link embeds on Discord / social platforms
      var shareUrl = data.shareUrl ? fullUrl(data.shareUrl) : fullUrl(data.url);
      var rawUrl = data.url;
      var ct = data.contentType || '';
      var preview = '';
      if (ct.indexOf('image/') === 0) {
        preview = '<div class="result-preview"><img src="' + escapeHtml(rawUrl) + '" alt=""></div>';
      } else if (ct.indexOf('video/') === 0) {
        preview = '<div class="result-preview"><video src="' + escapeHtml(rawUrl) + '" controls playsinline preload="metadata"></video></div>';
      } else if (ct.indexOf('audio/') === 0) {
        preview = '<div class="result-preview" style="padding:16px"><audio src="' + escapeHtml(rawUrl) + '" controls style="width:100%"></audio></div>';
      }
      resultBody.innerHTML =
        '<div class="result-link" id="resLink">' + escapeHtml(shareUrl) + '</div>' +
        '<div class="result-actions">' +
          '<button class="result-btn" id="copyLinkBtn">Copy link</button>' +
          '<a class="result-btn" href="' + escapeHtml(shareUrl) + '" target="_blank" rel="noopener noreferrer">Open</a>' +
          '<a class="result-btn" href="' + escapeHtml(rawUrl) + '" download>Download</a>' +
        '</div>' +
        preview +
        '<div class="result-meta">' + escapeHtml(data.name) + ' · ' + fmtBytes(data.size) + ' · ' + escapeHtml(ct || 'unknown') + '<br>Paste this link on Discord, Twitter, or anywhere else to embed it.</div>';
      var btn = document.getElementById('copyLinkBtn');
      if (btn) btn.addEventListener('click', function(){
        copyText(shareUrl, function(){
          var orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(function(){ btn.textContent = orig; }, 1400);
        });
      });
      progressWrap.style.display = 'none';
    }

    function uploadFile(file){
      if (!file) return;
      if (file.size > MAX) { showError('File too large. Max ' + fmtBytes(MAX) + '.'); return; }
      if (file.size === 0) { showError('File is empty.'); return; }

      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      progressPct.textContent = '0%';
      progressSize.textContent = '0 / ' + fmtBytes(file.size);
      resultCard.style.display = 'none';

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name || 'file'));

      xhr.upload.onprogress = function(e){
        if (!e.lengthComputable) return;
        var pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        progressPct.textContent = pct + '%';
        progressSize.textContent = fmtBytes(e.loaded) + ' / ' + fmtBytes(e.total);
      };
      xhr.onload = function(){
        var data;
        try { data = JSON.parse(xhr.responseText); } catch (e) { return showError('Bad server response'); }
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
          showResult(data);
          loadRecent();
        } else {
          showError((data && data.error) || ('Server error ' + xhr.status));
        }
      };
      xhr.onerror = function(){ showError('Network error during upload'); };
      xhr.send(file);
    }

    drop.addEventListener('click', function(){ input.click(); });
    input.addEventListener('change', function(){ if (input.files && input.files[0]) uploadFile(input.files[0]); input.value = ''; });

    ['dragenter','dragover'].forEach(function(ev){
      drop.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); drop.classList.add('dragover'); });
    });
    ['dragleave','drop'].forEach(function(ev){
      drop.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); drop.classList.remove('dragover'); });
    });
    drop.addEventListener('drop', function(e){
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) uploadFile(files[0]);
    });

    function iconFor(ct){
      if (!ct) return '${ICONS.document(20)}';
      if (ct.indexOf('image/') === 0) return '${ICONS.eye(20)}';
      if (ct.indexOf('video/') === 0) return '${ICONS.play(20)}';
      return '${ICONS.document(20)}';
    }

    function timeAgo(ms){
      var s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
      if (s < 60) return s + 's ago';
      var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
      var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
      var d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
      var w = Math.floor(d / 7); if (w < 5) return w + 'w ago';
      return Math.floor(d / 30) + 'mo ago';
    }

    function renderRecent(list){
      if (!list || list.length === 0) {
        recentList.innerHTML = '<div class="recent-empty">No uploads yet.</div>';
        return;
      }
      recentList.innerHTML = list.map(function(u){
        var url = u.shareUrl ? fullUrl(u.shareUrl) : fullUrl(u.url);
        return '<div class="recent-item">' +
          '<div class="recent-icon">' + iconFor(u.contentType) + '</div>' +
          '<div class="recent-meta">' +
            '<div class="recent-name">' + escapeHtml(u.name) + '</div>' +
            '<div class="recent-sub">' + fmtBytes(u.size) + ' · ' + timeAgo(u.uploadedAt) + '</div>' +
          '</div>' +
          '<button class="recent-copy" data-url="' + escapeHtml(url) + '">Copy link</button>' +
        '</div>';
      }).join('');
      Array.prototype.forEach.call(recentList.querySelectorAll('.recent-copy'), function(b){
        b.addEventListener('click', function(){
          copyText(b.getAttribute('data-url'), function(){
            var o = b.textContent; b.textContent = 'Copied!';
            setTimeout(function(){ b.textContent = o; }, 1400);
          });
        });
      });
    }

    function loadRecent(){
      fetch('/api/uploads?t=' + Date.now())
        .then(function(r){ return r.json(); })
        .then(function(d){ if (d && d.ok) renderRecent(d.uploads); })
        .catch(function(){});
    }
    loadRecent();
    setInterval(loadRecent, 15000);
  })();
  `;

  const html = pageShell("Upload - Roblox Script Hub", `
    ${topNav('upload')}
    <div class="tag">FILE UPLOAD</div>
    <div class="h1">Upload &amp; Share</div>
    <p class="sub">Drop a video, image, zip, or any file. You get a permanent link that plays inline on Discord and other platforms.</p>

    <div style="max-width:720px">
      <div class="upload-zone" id="drop">
        <input type="file" id="fileInput" style="display:none">
        <div class="uz-icon">${ICONS.upload(48)}</div>
        <div class="uz-title">Click or drag a file here</div>
        <div class="uz-sub">Videos, images, archives, documents — up to ${fmtBytes(MAX_UPLOAD_BYTES)}</div>
      </div>

      <div class="progress-wrap" id="progressWrap">
        <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
        <div class="progress-meta"><span id="progressPct">0%</span><span id="progressSize">0 B</span></div>
      </div>

      <div class="result-card" id="resultCard">
        <div class="rc-title" id="resultTitle">Upload complete</div>
        <div id="resultBody"></div>
      </div>

      <div class="recent-list">
        <div class="label">Recent uploads</div>
        <div id="recentList"><div class="recent-empty">Loading…</div></div>
      </div>
    </div>
  `, uploadCss, uploadJs, "wide");

  res.set("Content-Type", "text/html").send(html);
});

// ─── DASHBOARD ───
app.get("/", (req, res) => {
  res.set("Content-Type", "text/html");
  const totalLikes = SCRIPTS.reduce((a, s) => a + getScriptStats(s.slug).likes, 0);
  const totalViews = SCRIPTS.reduce((a, s) => a + getScriptStats(s.slug).views, 0);

  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Roblox Script Hub Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4246726390307705" crossorigin="anonymous"></script>
<style>
  *{box-sizing:border-box}
  html{overflow-x:hidden;min-height:100%}
  body{background:#0b0b10;color:#eee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px 24px 40px;position:relative;overflow-x:hidden;min-height:100vh;margin:0}
  #bg{position:fixed;inset:0;z-index:0;pointer-events:none}
  .orb{position:fixed;border-radius:50%;filter:blur(110px);opacity:0.42;z-index:0;pointer-events:none;will-change:transform}
  .orb1{width:600px;height:600px;background:radial-gradient(circle,#8a5cff,#4a24c0);top:-200px;left:-200px;animation:drift1 26s ease-in-out infinite}
  .orb2{width:680px;height:680px;background:radial-gradient(circle,#2f8fff,#0d4f99);bottom:-240px;right:-220px;animation:drift2 30s ease-in-out infinite}
  .orb3{width:440px;height:440px;background:radial-gradient(circle,#ff4fa0,#a32866);top:40%;left:55%;animation:drift3 34s ease-in-out infinite;opacity:0.22}
  @keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(100px,120px) scale(1.18)}}
  @keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-120px,-90px) scale(1.2)}}
  @keyframes drift3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-80px,80px) scale(0.9)}}
  .scanline{position:fixed;inset:0;z-index:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 3px);mix-blend-mode:overlay}
  .vignette{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,0.78) 100%)}
  .content{position:relative;z-index:1;width:100%;max-width:1500px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px;color:#fff;background:linear-gradient(90deg,#fff,#c5b3ff 60%,#8a9fff);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:0.2px}
  .sub{color:#8a8a9a;font-size:13px;margin-bottom:24px}
  .topnav{display:flex;align-items:center;gap:14px;margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid rgba(70,70,82,0.4)}
  .topnav-icons{display:flex;gap:10px;flex-shrink:0}
  .topnav-icons a{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;text-decoration:none;transition:transform .2s cubic-bezier(.2,.9,.3,1.1),background .2s,box-shadow .2s}
  .topnav-icons a.discord{background:rgba(88,101,242,0.12);border:1px solid rgba(88,101,242,0.35)}
  .topnav-icons a.discord:hover{background:rgba(88,101,242,0.28);transform:translateY(-3px) scale(1.05);box-shadow:0 12px 26px rgba(88,101,242,0.4)}
  .topnav-icons a.steam{background:rgba(27,40,56,0.5);border:1px solid rgba(103,150,200,0.35)}
  .topnav-icons a.steam:hover{background:rgba(27,40,56,0.85);transform:translateY(-3px) scale(1.05);box-shadow:0 12px 26px rgba(103,150,200,0.35)}
  .topnav-icons img{width:28px;height:28px;border-radius:6px;object-fit:contain}
  .topnav-icons .discord img{width:34px;height:34px;border-radius:8px}
  .topnav-tabs{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
  .topnav-tabs a{padding:9px 18px;border-radius:10px;text-decoration:none;color:#a8a8b8;font-size:13px;font-weight:600;white-space:nowrap;transition:background .15s,color .15s,transform .15s,border-color .15s}
  .topnav-tabs a:hover{background:rgba(255,255,255,0.05);color:#fff;transform:translateY(-1px)}
  .topnav-tabs a.active{background:linear-gradient(135deg,rgba(120,90,255,0.22),rgba(47,143,255,0.16));color:#fff;border:1px solid rgba(120,90,255,0.4)}
  .header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:20px}
  .stats{display:flex;gap:10px;flex-wrap:wrap}
  .stat{background:rgba(28,28,34,0.7);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(90,90,105,0.55);padding:12px 18px;border-radius:14px;min-width:120px;box-shadow:0 8px 24px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.04);transition:transform .2s,border-color .2s,box-shadow .2s;position:relative;overflow:hidden}
  .stat::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(120,90,255,0.06),transparent 60%);pointer-events:none}
  .stat:hover{transform:translateY(-2px);border-color:rgba(120,90,255,0.4);box-shadow:0 12px 30px rgba(120,90,255,0.2),inset 0 1px 0 rgba(255,255,255,0.06)}
  .stat .label{font-size:10px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1px;font-weight:600;position:relative}
  .stat .value{font-size:22px;font-weight:700;color:#fff;margin-top:2px;position:relative}
  .stat .value.accent{color:#c5b3ff;text-shadow:0 0 20px rgba(140,105,255,0.5)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));grid-auto-rows:96px;gap:14px;width:100%;align-content:start;max-height:460px;overflow-y:auto;overflow-x:hidden;padding-right:6px;scrollbar-width:thin;scrollbar-color:rgba(120,90,255,0.4) rgba(28,28,34,0.4)}
  .grid::-webkit-scrollbar{width:8px}
  .grid::-webkit-scrollbar-track{background:rgba(28,28,34,0.4);border-radius:4px}
  .grid::-webkit-scrollbar-thumb{background:rgba(120,90,255,0.4);border-radius:4px}
  .card{background:rgba(28,28,34,0.6);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(90,90,105,0.5);border-radius:14px;padding:16px;display:flex;gap:14px;align-items:center;transition:transform .2s cubic-bezier(.2,.9,.3,1.1),border-color .2s,box-shadow .25s;min-width:0;position:relative;overflow:hidden;height:96px}
  .card::before{content:'';position:absolute;inset:0;border-radius:14px;background:linear-gradient(135deg,rgba(120,90,255,0.08),transparent 50%);opacity:0;transition:opacity .25s;pointer-events:none}
  .card:hover{transform:translateY(-3px);border-color:rgba(140,105,255,0.55);box-shadow:0 16px 40px rgba(0,0,0,0.4),0 0 0 1px rgba(140,105,255,0.15)}
  .card:hover::before{opacity:1}
  .av{width:60px;height:60px;border-radius:12px;background:#2a2a34;flex-shrink:0;border:1px solid rgba(120,90,255,0.3);object-fit:cover;display:block;position:relative;box-shadow:0 4px 12px rgba(0,0,0,0.3)}
  .meta{min-width:0;flex:1;position:relative}
  .name{font-weight:600;color:#fff;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .game{color:#9a9aaa;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;margin-top:6px}
  .ws{background:rgba(30,58,42,0.8);color:#7ddd9f}
  .http{background:rgba(58,47,30,0.8);color:#ddd47f}
  .empty{grid-column:1/-1;display:flex;align-items:center;justify-content:center;height:96px;color:#6a6a7a;font-size:14px;text-align:center;background:rgba(28,28,34,0.35);border:1px dashed rgba(90,90,105,0.5);border-radius:14px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .hub-info{max-width:970px;margin:24px auto 0;padding:22px 24px;background:rgba(28,28,34,0.55);border:1px solid rgba(90,90,105,0.5);border-radius:14px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .hub-info-title{font-size:18px;font-weight:700;color:#b8b8c4;margin-bottom:10px;letter-spacing:0.2px}
  .hub-info-body{font-size:14px;line-height:1.65;color:#8a8a9a}
  .scripts-card{display:flex;align-items:center;gap:14px;max-width:970px;margin:14px auto 0;padding:16px 20px;background:rgba(28,28,34,0.6);border:1px solid rgba(90,90,105,0.5);border-radius:14px;text-decoration:none;color:inherit;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);transition:transform .2s cubic-bezier(.2,.9,.3,1.1),border-color .2s,box-shadow .25s;position:relative;overflow:hidden;min-height:96px;cursor:pointer}
  .scripts-card::before{content:'';position:absolute;inset:0;border-radius:14px;background:linear-gradient(135deg,rgba(120,90,255,0.10),transparent 50%);opacity:0;transition:opacity .25s;pointer-events:none}
  .scripts-card:hover{transform:translateY(-3px);border-color:rgba(140,105,255,0.55);box-shadow:0 16px 40px rgba(0,0,0,0.4),0 0 0 1px rgba(140,105,255,0.15)}
  .scripts-card:hover::before{opacity:1}
  .scripts-card-icon{width:60px;height:60px;border-radius:12px;background:linear-gradient(135deg,rgba(120,90,255,0.22),rgba(47,143,255,0.14));border:1px solid rgba(120,90,255,0.35);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;box-shadow:0 4px 12px rgba(0,0,0,0.3);color:#b9a3ff}
  .scripts-card-meta{min-width:0;flex:1;position:relative}
  .scripts-card-name{font-weight:600;color:#fff;font-size:14px;display:flex;align-items:center;gap:8px}
  .scripts-card-sub{color:#9a9aaa;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .scripts-card-count{background:rgba(120,90,255,0.18);color:#b9a3ff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:10px;border:1px solid rgba(120,90,255,0.35)}
  .scripts-card-arrow{color:#6a6a7a;transition:color .15s,transform .15s;flex-shrink:0;display:flex;align-items:center}
  .scripts-card:hover .scripts-card-arrow{color:#b9a3ff;transform:translateX(3px)}
  .scripts-card-stats{display:flex;gap:14px;align-items:center;color:#8a8a9a;font-size:12px;font-weight:600;flex-shrink:0}
  .scripts-card-stats span{display:inline-flex;align-items:center;gap:6px}
  .promo-slot{width:100%;max-width:970px;margin:24px auto 0;padding:14px;background:rgba(28,28,34,0.4);border:1px solid rgba(70,70,82,0.5);border-radius:14px;text-align:center;min-height:120px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);overflow:hidden;contain:layout}
  .promo-tag{font-size:10px;color:#5a5a6a;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;margin-bottom:8px}
  .promo-slot .adsbygoogle{display:block !important;width:100%;min-height:90px;background:transparent}
  @media (max-width:640px){
    body{padding:16px 16px 32px}
    .content{max-width:100%}
    h1{font-size:18px}
    .sub{font-size:12px;margin-bottom:18px}
    .topnav{flex-wrap:wrap;gap:10px;padding-bottom:12px;margin-bottom:16px}
    .topnav-tabs{margin-left:0;width:100%;display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
    .topnav-tabs a{text-align:center;padding:9px 4px;font-size:11.5px}
    .header{flex-direction:column;align-items:stretch;gap:12px;margin-bottom:16px}
    .stats{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .stat{min-width:0;padding:10px 12px}
    .stat .value{font-size:20px}
    .grid{grid-template-columns:1fr;gap:10px;grid-auto-rows:88px;max-height:400px}
    .empty{height:88px;font-size:13px}
    .card{padding:12px;gap:10px;height:88px}
    .av{width:52px;height:52px}
    .name{font-size:13px}
    .game{font-size:11px}
    .hub-info{margin-top:16px;padding:18px;border-radius:12px}
    .hub-info-title{font-size:16px;margin-bottom:8px}
    .hub-info-body{font-size:13px}
    .scripts-card{margin-top:10px;padding:12px;min-height:88px;gap:10px}
    .scripts-card-icon{width:52px;height:52px}
    .scripts-card-stats{display:none}
    .promo-slot{max-width:100%;margin-top:16px;min-height:100px}
  }
</style></head>
<body>
  <canvas id="bg"></canvas>
  <div class="orb orb1"></div><div class="orb orb2"></div><div class="orb orb3"></div>
  <div class="scanline"></div><div class="vignette"></div>
  <div class="content">
    <div class="topnav">
      <div class="topnav-icons">
        <a class="discord" href="https://discord.gg/pZJnYzE7hb" target="_blank" rel="noopener noreferrer"><img src="https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/IMG_1454.png" alt="Discord" style="width:34px;height:34px;border-radius:8px;" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/williambredsgaard-blip/serverssszz@main/IMG_1454.png';"></a>
        <a class="steam" href="/nfa" title="Steam"><img src="https://raw.githubusercontent.com/williambredsgaard-blip/serverssszz/main/steam.png" alt="Steam" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/williambredsgaard-blip/serverssszz@main/steam.png';"></a>
      </div>
      <div class="topnav-tabs">
        <a href="/" class="active">Home</a>
        <a href="/upload">Upload</a>
        <a href="/scripts">Scripts</a>
        <a href="/nfa">Steam</a>
        <a href="/redeem">Redeem</a>
        <a href="/control">Control</a>
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

    <div class="hub-info">
      <div class="hub-info-title">What is Roblox Script Hub?</div>
      <div class="hub-info-body">Roblox Scripts Hub is a publicly available site where you can browse your favorite Scripts of your choice, just one click and you get access to the Script!</div>
    </div>

    <a href="/scripts" class="scripts-card">
      <div class="scripts-card-icon">${ICONS.document(30)}</div>
      <div class="scripts-card-meta">
        <div class="scripts-card-name">Scripts <span class="scripts-card-count">${SCRIPTS.length}</span></div>
        <div class="scripts-card-sub">Browse all available scripts</div>
      </div>
      <div class="scripts-card-stats">
        <span>${ICONS.eye(13)} ${fmtCount(totalViews)}</span>
        <span>${ICONS.bolt(13)} ${fmtCount(totalLikes)}</span>
      </div>
      <div class="scripts-card-arrow">${ICONS.arrowRight(18)}</div>
    </a>

    <a href="/upload" class="scripts-card">
      <div class="scripts-card-icon">${ICONS.upload(30)}</div>
      <div class="scripts-card-meta">
        <div class="scripts-card-name">Upload files</div>
        <div class="scripts-card-sub">Share videos, images, and files with a permanent link</div>
      </div>
      <div class="scripts-card-arrow">${ICONS.arrowRight(18)}</div>
    </a>

    <div class="promo-slot" id="promoSlot">
      <div class="promo-tag">Sponsored</div>
      <ins class="adsbygoogle" style="display:block;width:100%;min-height:90px" data-ad-client="ca-pub-4246726390307705" data-ad-slot="0000000000" data-ad-format="auto" data-full-width-responsive="true"></ins>
    </div>

    <div class="promo-slot" id="promoSlot2">
      <div class="promo-tag">Advertisements</div>
      <ins class="adsbygoogle" style="display:block;width:100%;min-height:90px" data-ad-client="ca-pub-4246726390307705" data-ad-slot="7741832522" data-ad-format="auto" data-full-width-responsive="true"></ins>
    </div>
  </div>
<script>
${CURSOR_SCRIPT}
${COOKIE_HELPERS}
const FB = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" rx="10" fill="#2a2a34"/><text x="28" y="37" font-family="sans-serif" font-size="24" font-weight="600" fill="#8a8a9a" text-anchor="middle">?</text></svg>');
(function(){
  const c=document.getElementById('bg');if(!c)return;
  const ctx=c.getContext('2d');const D=Math.max(1,devicePixelRatio||1);let W,H;
  function rz(){W=c.width=innerWidth*D;H=c.height=innerHeight*D;c.style.width=innerWidth+'px';c.style.height=innerHeight+'px'}
  rz();addEventListener('resize',rz);
  const N=Math.min(90,Math.max(40,Math.floor(innerWidth/22)));
  const P=Array.from({length:N},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.25*D,vy:(Math.random()-.5)*.25*D,r:(Math.random()*1.4+.6)*D,h:Math.random()<.5?265:210}));
  const MD=150*D;
  function tk(){ctx.clearRect(0,0,W,H);for(let i=0;i<P.length;i++){const a=P[i];for(let j=i+1;j<P.length;j++){const b=P[j];const dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy;if(d2<MD*MD){const al=(1-Math.sqrt(d2)/MD)*.22;ctx.strokeStyle='rgba(140,110,255,'+al+')';ctx.lineWidth=.7*D;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}}for(const p of P){p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);g.addColorStop(0,'hsla('+p.h+',90%,75%,.9)');g.addColorStop(1,'hsla('+p.h+',90%,75%,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r*4,0,Math.PI*2);ctx.fill();}requestAnimationFrame(tk)}tk()
})();

(function(){
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) {}
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
  res.status(404).set("Content-Type", "text/html").send(pageShell("Not Found - Roblox Script Hub", `
    ${topNav('none')}
    <div style="max-width:520px;margin:0 auto;text-align:center;padding:36px 24px">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:16px;margin-bottom:16px;background:rgba(120,90,255,0.14);border:1px solid rgba(120,90,255,0.4);color:#b9a3ff">
        <svg viewBox="0 0 24 24" style="width:34px;height:34px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none"/></svg>
      </div>
      <div class="h1" style="text-align:center">Page Not Found</div>
      <p class="sub" style="text-align:center;margin:8px auto 20px">The link you tried to go to doesn't exist yet. Please try again later.</p>
      <div style="display:inline-block;padding:8px 14px;background:rgba(18,18,24,0.7);border:1px solid rgba(70,70,82,0.6);border-radius:8px;font-family:ui-monospace,monospace;font-size:12px;color:#8a8a9a;margin-bottom:22px">${safePath}</div>
      <div><a href="/" style="display:inline-block;padding:11px 28px;background:linear-gradient(135deg,#7850ff,#2f8fff);color:#fff;font-weight:600;font-size:14px;border-radius:10px;text-decoration:none">Okay</a></div>
    </div>
  `));
});

// ─── BOOT ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log("Relay on " + PORT);
  loadState();
  const wl = readWhitelist();
  console.log(`[boot] whitelist entries: ${wl.length} (${wl.join(", ")})`);
  console.log(`[boot] store callback configured as: ${STORE_CALLBACK}`);
  console.log(`[boot] ads.txt will serve: google.com, ${ADSENSE_PUB_ID}, DIRECT, f08c47fec0942fa0`);
  console.log(`[boot] AdSense client: ${ADSENSE_CLIENT}`);
  console.log(`[boot] scripts loaded: ${SCRIPTS.length} (${SCRIPTS.map(s => s.slug).join(", ")})`);
  console.log(`[boot] uploads: ${Object.keys(uploads).length} file(s) stored, max ${fmtBytes(MAX_UPLOAD_BYTES)} each`);
  console.log(`[boot] upload dir: ${UPLOAD_DIR}`);
});
