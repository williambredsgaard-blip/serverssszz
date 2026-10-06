// ═══════════════════════════════════════════════════════════════
//  WATCH 3D  —  scene cache + live stream + three.js viewer
// ═══════════════════════════════════════════════════════════════
const WATCH_DIR = path.join(__dirname, "watch_data");
if (!fs.existsSync(WATCH_DIR)) {
  try { fs.mkdirSync(WATCH_DIR, { recursive: true }); } catch (e) { console.error("[watch] mkdir:", e.message); }
}

const watchStreams = new Map();   // userId -> latest stream payload
const WATCH_STALE_MS = 15_000;

// ── Scene (static world) cache ──
function scenePath(pid) {
  return path.join(WATCH_DIR, "scene_" + String(pid).replace(/[^0-9]/g, "") + ".json");
}

app.get("/api/watch/scene/:placeId", (req, res) => {
  const pid = String(req.params.placeId).replace(/[^0-9]/g, "");
  if (!pid) return res.status(400).json({ ok: false });
  const p = scenePath(pid);
  if (fs.existsSync(p)) {
    let parts = 0, at = 0;
    try { const j = JSON.parse(fs.readFileSync(p, "utf8")); parts = (j.parts || []).length; at = j.at || 0; } catch (e) {}
    return res.json({ ok: true, exists: true, parts, at, url: "/watch-data/scene_" + pid + ".json" });
  }
  res.json({ ok: true, exists: false });
});

app.post("/api/watch/scene/:placeId", (req, res) => {
  const pid = String(req.params.placeId).replace(/[^0-9]/g, "");
  if (!pid) return res.status(400).json({ ok: false, error: "bad placeId" });
  const body = req.body || {};
  if (!Array.isArray(body.parts)) return res.status(400).json({ ok: false, error: "parts[] required" });
  const p = scenePath(pid);
  const data = { placeId: pid, at: Date.now(), placeName: body.placeName || ("Place " + pid), parts: body.parts };
  try { fs.writeFileSync(p, JSON.stringify(data)); }
  catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  console.log(`[watch] scene cached place=${pid} parts=${body.parts.length}`);
  res.json({ ok: true, parts: body.parts.length, url: "/watch-data/scene_" + pid + ".json" });
});

app.get("/watch-data/:file", (req, res) => {
  const file = String(req.params.file).replace(/[^a-zA-Z0-9_\-\.]/g, "");
  const p = path.join(WATCH_DIR, file);
  if (!p.startsWith(WATCH_DIR) || !fs.existsSync(p)) return res.status(404).send("not found");
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  fs.createReadStream(p).pipe(res);
});

// ── Live stream store ──
app.post("/api/watch/stream", (req, res) => {
  const data = req.body || {};
  if (!data.userId) return res.status(400).json({ ok: false });
  data.ts = Date.now();
  watchStreams.set(String(data.userId), data);
  res.json({ ok: true });
});

app.get("/api/watch/stream/:userId", async (req, res) => {
  const s = watchStreams.get(String(req.params.userId));
  if (!s) return res.json({ ok: false, stale: true });
  const age = Date.now() - s.ts;
  let thumb = null;
  try { const m = await getThumbnails([Number(req.params.userId)]); thumb = m[req.params.userId] || null; } catch (e) {}
  res.json({ ok: true, stale: age > WATCH_STALE_MS, age, thumbnail: thumb, data: s });
});

// ── 3D Viewer page ──
app.get("/watch/:userId", (req, res) => {
  const userId = String(req.params.userId).replace(/[^0-9]/g, "");
  if (!userId) return res.status(400).send("bad userId");

  const viewerCss = `
    html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#0b0b10}
    #app{position:fixed;inset:0;display:grid;grid-template-columns:1fr 320px;grid-template-rows:1fr}
    @media (max-width:900px){#app{grid-template-columns:1fr;grid-template-rows:1fr 280px}}
    #viewport{position:relative;background:#0a0a12;overflow:hidden}
    #viewport canvas{display:block;width:100%;height:100%}
    #hud{position:absolute;top:14px;left:14px;display:flex;gap:8px;flex-wrap:wrap;z-index:5;pointer-events:none}
    .pill{background:rgba(0,0,0,0.72);backdrop-filter:blur(8px);color:#d8d8e0;font-size:11.5px;font-weight:600;padding:6px 11px;border-radius:9px;display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(90,90,105,0.55);font-family:-apple-system,sans-serif}
    .pill.live{color:#7ddd9f;border-color:rgba(125,221,159,0.45)}
    .pill.dead{color:#ff9a9a;border-color:rgba(255,154,154,0.45)}
    .pill .dot{width:7px;height:7px;border-radius:50%;background:currentColor;animation:pulse 1.4s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
    #controls{position:absolute;top:14px;right:14px;display:flex;flex-direction:column;gap:8px;z-index:6}
    .ctrlbtn{background:rgba(24,24,30,0.85);border:1px solid rgba(90,90,105,0.6);color:#d8d8e0;font-size:12px;font-weight:600;padding:8px 14px;border-radius:9px;cursor:pointer;backdrop-filter:blur(8px);font-family:inherit;transition:all .15s}
    .ctrlbtn:hover{background:rgba(40,40,52,0.95);color:#fff;border-color:rgba(120,90,255,0.55)}
    .ctrlbtn.active{background:linear-gradient(135deg,rgba(120,90,255,0.32),rgba(47,143,255,0.22));color:#fff;border-color:rgba(120,90,255,0.6)}
    #side{background:#0d0d14;border-left:1px solid rgba(60,60,72,0.6);overflow-y:auto;padding:14px;font-family:-apple-system,sans-serif}
    @media (max-width:900px){#side{border-left:none;border-top:1px solid rgba(60,60,72,0.6)}}
    .scard{background:rgba(24,24,30,0.72);border:1px solid rgba(60,60,72,0.55);border-radius:12px;padding:13px;margin-bottom:11px}
    .scard .lbl{font-size:10px;color:#8a8a9a;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;margin-bottom:9px}
    .target{display:flex;align-items:center;gap:11px}
    .target img{width:48px;height:48px;border-radius:50%;background:#2a2a34;border:1px solid rgba(120,90,255,0.4);flex-shrink:0;object-fit:cover}
    .target .meta{min-width:0;flex:1}
    .target .nm{font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .target .sub{font-size:11.5px;color:#8a8a9a;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .plist{display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto}
    .prow{display:flex;align-items:center;gap:9px;padding:7px 9px;background:rgba(18,18,24,0.6);border:1px solid rgba(60,60,72,0.5);border-radius:8px;transition:all .15s}
    .prow.is-local{border-color:rgba(120,90,255,0.65);background:rgba(120,90,255,0.1)}
    .prow .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;box-shadow:0 0 8px currentColor}
    .prow .pn{flex:1;min-width:0;font-size:12px;color:#e8e8ec;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .prow .hpbar{width:44px;height:5px;border-radius:3px;background:rgba(70,70,82,0.6);overflow:hidden;flex-shrink:0}
    .prow .hpfill{height:100%;background:#7ddd9f;transition:width .2s}
    .prow .ph{font-size:10.5px;color:#8a8a9a;font-weight:600;min-width:22px;text-align:right}
    .hidden{display:none}
  `;

  const viewerJs = `
(function(){
  var USER_ID = ${JSON.stringify(userId)};
  var staleEl = document.getElementById('staleMsg');
  var hudStatus = document.getElementById('hudStatus');
  var hudPlace = document.getElementById('hudPlace');
  var hudPlayers = document.getElementById('hudPlayers');
  var hudParts = document.getElementById('hudParts');
  var targetImg = document.getElementById('targetImg');
  var targetName = document.getElementById('targetName');
  var targetSub = document.getElementById('targetSub');
  var playerList = document.getElementById('playerList');

  var sceneRoot, renderer, camera, controls, worldGroup, playersGroup, dynamicGroup;
  var playerMeshes = {};   // userId -> Group
  var dynamicMeshes = [];  // array of Mesh
  var sceneLoaded = false;
  var currentData = null;
  var camMode = 'orbit';   // orbit | follow | pov
  var followOffset = new THREE.Vector3(25, 20, 25);

  // ── three.js bootstrap ──
  function initThree() {
    var vp = document.getElementById('viewport');
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(vp.clientWidth, vp.clientHeight);
    renderer.setClearColor(0x0a0a12, 1);
    vp.appendChild(renderer.domElement);

    sceneRoot = new THREE.Scene();
    sceneRoot.fog = new THREE.Fog(0x0a0a12, 800, 4000);

    camera = new THREE.PerspectiveCamera(70, vp.clientWidth / vp.clientHeight, 0.5, 20000);
    camera.position.set(50, 60, 80);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);

    var ambient = new THREE.AmbientLight(0xffffff, 0.9);
    sceneRoot.add(ambient);
    var sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(1, 1.4, 0.8);
    sceneRoot.add(sun);
    var fill = new THREE.DirectionalLight(0x8090ff, 0.35);
    fill.position.set(-1, 0.6, -0.8);
    sceneRoot.add(fill);

    worldGroup = new THREE.Group();
    playersGroup = new THREE.Group();
    dynamicGroup = new THREE.Group();
    sceneRoot.add(worldGroup);
    sceneRoot.add(playersGroup);
    sceneRoot.add(dynamicGroup);

    window.addEventListener('resize', onResize);
    animate();
  }

  function onResize() {
    var vp = document.getElementById('viewport');
    camera.aspect = vp.clientWidth / vp.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(vp.clientWidth, vp.clientHeight);
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (camMode === 'follow' && currentData) {
      var me = (currentData.players || []).find(function(p){ return p.isLocal; });
      if (me && me.cf) {
        var p = new THREE.Vector3(me.cf[0], me.cf[1], me.cf[2]);
        var target = p.clone().add(new THREE.Vector3(0, 3, 0));
        controls.target.lerp(target, 0.15);
        if (camera.position.distanceTo(target) > 60) {
          camera.position.copy(target).add(followOffset);
        }
      }
    } else if (camMode === 'pov' && currentData && currentData.camera) {
      var cf = currentData.camera.cf;
      camera.position.set(cf[0], cf[1], cf[2]);
      var rot = new THREE.Matrix4().set(
        cf[3], cf[4], cf[5], 0,
        cf[6], cf[7], cf[8], 0,
        cf[9], cf[10], cf[11], 0,
        0, 0, 0, 1
      );
      var q = new THREE.Quaternion().setFromRotationMatrix(rot);
      camera.quaternion.copy(q);
      camera.fov = currentData.camera.fov || 70;
      camera.updateProjectionMatrix();
    }
    renderer.render(sceneRoot, camera);
  }

  // ── Unit geometries ──
  var GEO_BOX = new THREE.BoxGeometry(1, 1, 1);
  var GEO_BALL = new THREE.SphereGeometry(1, 10, 7);
  var GEO_CYL = (function(){
    var g = new THREE.CylinderGeometry(1, 1, 1, 12);
    g.rotateZ(Math.PI / 2);
    return g;
  })();
  var GEO_WEDGE = (function(){
    var g = new THREE.BufferGeometry();
    var hx = 0.5, hy = 0.5, hz = 0.5;
    var v = new Float32Array([
      -hx,-hy,-hz,  hx,-hy,-hz,  hx, hy,-hz,
      -hx,-hy, hz,  hx,-hy, hz,  hx, hy, hz,
    ]);
    var idx = [
      0,1,2,        // back
      3,5,4,        // front
      0,3,4, 0,4,1, // bottom
      0,2,5, 0,5,3, // slope
      1,4,5, 1,5,2, // right
    ];
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();

  var MAT_OPAQUE = new THREE.MeshLambertMaterial({ vertexColors: false, color: 0xffffff });
  var MAT_TRANSPARENT = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });

  // Build InstancedMesh groups for the scene
  function buildStaticScene(parts) {
    while (worldGroup.children.length) worldGroup.remove(worldGroup.children[0]);
    var byShape = { 0: [], 1: [], 2: [], 3: [] };
    var transparentIdx = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var transp = p[19];
      var shape = p[20] | 0;
      if (transp >= 0.98) continue;
      if (transp > 0.5) { transparentIdx.push(i); continue; }
      byShape[shape].push(p);
    }
    function makeInstanced(list, shape, geo, mat) {
      if (list.length === 0) return;
      var mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      var m = new THREE.Matrix4();
      var q = new THREE.Quaternion();
      var pos = new THREE.Vector3();
      var scale = new THREE.Vector3();
      var rotM = new THREE.Matrix4();
      var color = new THREE.Color();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        pos.set(p[0], p[1], p[2]);
        rotM.set(
          p[3], p[4], p[5], 0,
          p[6], p[7], p[8], 0,
          p[9], p[10], p[11], 0,
          0, 0, 0, 1
        );
        q.setFromRotationMatrix(rotM);
        var sx = p[12], sy = p[13], sz = p[14];
        if (shape === 1) { sx = sx/2; sy = sy/2; sz = sz/2; }
        else if (shape === 2) { sy = sy/2; sz = sz/2; }
        scale.set(sx, sy, sz);
        m.compose(pos, q, scale);
        mesh.setMatrixAt(i, m);
        color.setRGB(p[15], p[16], p[17]);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      worldGroup.add(mesh);
    }
    makeInstanced(byShape[0], 0, GEO_BOX, MAT_OPAQUE);
    makeInstanced(byShape[1], 1, GEO_BALL, MAT_OPAQUE);
    makeInstanced(byShape[2], 2, GEO_CYL, MAT_OPAQUE);
    makeInstanced(byShape[3], 3, GEO_WEDGE, MAT_OPAQUE);

    // transparent parts as individual meshes (usually far fewer)
    for (var t = 0; t < transparentIdx.length; t++) {
      var p = parts[transparentIdx[t]];
      var geo = p[20] === 1 ? GEO_BALL : p[20] === 2 ? GEO_CYL : p[20] === 3 ? GEO_WEDGE : GEO_BOX;
      var mesh = new THREE.Mesh(geo, MAT_TRANSPARENT.clone());
      mesh.material.color.setRGB(p[15], p[16], p[17]);
      mesh.material.opacity = 1 - p[19];
      var mm = new THREE.Matrix4();
      var qq = new THREE.Quaternion();
      var pp = new THREE.Vector3(p[0], p[1], p[2]);
      var rotM2 = new THREE.Matrix4().set(
        p[3], p[4], p[5], 0,
        p[6], p[7], p[8], 0,
        p[9], p[10], p[11], 0,
        0, 0, 0, 1
      );
      qq.setFromRotationMatrix(rotM2);
      var ss = new THREE.Vector3(
        p[12], p[13], p[14]
      );
      if (p[20] === 1) { ss.multiplyScalar(0.5); ss.z = p[14]/2; }
      else if (p[20] === 2) { ss.y = p[13]/2; ss.z = p[14]/2; }
      mm.compose(pp, qq, ss);
      mesh.applyMatrix4(mm);
      worldGroup.add(mesh);
    }
    sceneLoaded = true;
  }

  // ── Player blocky avatars ──
  function makePlayerMesh(color) {
    var g = new THREE.Group();
    var torsoMat = new THREE.MeshLambertMaterial({ color: color });
    var skinMat = new THREE.MeshLambertMaterial({ color: 0xf5c98a });
    // Roblox R6 proportions. Root is at HRP center (~torso center in R6).
    var torso = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), torsoMat);
    g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), skinMat);
    head.position.set(0, 1.5, 0);
    g.add(head);
    var larm = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), torsoMat);
    larm.position.set(-1.5, 0, 0); g.add(larm);
    var rarm = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), torsoMat);
    rarm.position.set(1.5, 0, 0); g.add(rarm);
    var lleg = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), torsoMat);
    lleg.position.set(-0.5, -2, 0); g.add(lleg);
    var rleg = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), torsoMat);
    rleg.position.set(0.5, -2, 0); g.add(rleg);
    // Name label
    var canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    var cctx = canvas.getContext('2d');
    cctx.fillStyle = 'rgba(0,0,0,0.75)';
    cctx.fillRect(0, 0, 256, 64);
    cctx.fillStyle = '#fff';
    cctx.font = 'bold 26px -apple-system,sans-serif';
    cctx.textAlign = 'center';
    cctx.textBaseline = 'middle';
    cctx.fillText('', 128, 34); // set later
    var tex = new THREE.CanvasTexture(canvas);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(6, 1.5, 1);
    sprite.position.set(0, 3.2, 0);
    g.add(sprite);
    g.userData.labelCanvas = canvas;
    g.userData.labelCtx = cctx;
    g.userData.labelTex = tex;
    return g;
  }

  function setPlayerLabel(group, text) {
    var c = group.userData.labelCanvas;
    var ctx = group.userData.labelCtx;
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    group.userData.labelTex.needsUpdate = true;
  }

  function updatePlayers(players) {
    var seen = {};
    players.forEach(function(p) {
      seen[p.userId] = true;
      var g = playerMeshes[p.userId];
      if (!g) {
        var col = 0x7dc9e0;
        if (p.teamColor) col = ((Math.round(p.teamColor[0]*255) << 16) | (Math.round(p.teamColor[1]*255) << 8) | Math.round(p.teamColor[2]*255));
        else if (p.isLocal) col = 0x7850ff;
        g = makePlayerMesh(col);
        playerMeshes[p.userId] = g;
        playersGroup.add(g);
      }
      var cf = p.cf;
      g.position.set(cf[0], cf[1], cf[2]);
      var rotM = new THREE.Matrix4().set(
        cf[3], cf[4], cf[5], 0,
        cf[6], cf[7], cf[8], 0,
        cf[9], cf[10], cf[11], 0,
        0, 0, 0, 1
      );
      var q = new THREE.Quaternion().setFromRotationMatrix(rotM);
      g.quaternion.copy(q);
      setPlayerLabel(g, p.displayName || p.name || ('User ' + p.userId));
    });
    Object.keys(playerMeshes).forEach(function(id) {
      if (!seen[id]) {
        playersGroup.remove(playerMeshes[id]);
        delete playerMeshes[id];
      }
    });
  }

  // ── Dynamic parts (unanchored, streaming) ──
  function rebuildDynamic(parts) {
    while (dynamicGroup.children.length) dynamicGroup.remove(dynamicGroup.children[0]);
    if (!parts || parts.length === 0) return;
    var byShape = { 0: [], 1: [], 2: [], 3: [] };
    for (var i = 0; i < parts.length; i++) {
      var shape = parts[i][20] | 0;
      byShape[shape].push(parts[i]);
    }
    function makeInst(list, shape, geo) {
      if (list.length === 0) return;
      var mesh = new THREE.InstancedMesh(geo, MAT_OPAQUE, list.length);
      var m = new THREE.Matrix4();
      var q = new THREE.Quaternion();
      var pos = new THREE.Vector3();
      var scale = new THREE.Vector3();
      var rotM = new THREE.Matrix4();
      var color = new THREE.Color();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        pos.set(p[0], p[1], p[2]);
        rotM.set(p[3],p[4],p[5],0, p[6],p[7],p[8],0, p[9],p[10],p[11],0, 0,0,0,1);
        q.setFromRotationMatrix(rotM);
        var sx = p[12], sy = p[13], sz = p[14];
        if (shape === 1) { sx/=2; sy/=2; sz/=2; }
        else if (shape === 2) { sy/=2; sz/=2; }
        scale.set(sx, sy, sz);
        m.compose(pos, q, scale);
        mesh.setMatrixAt(i, m);
        color.setRGB(p[15], p[16], p[17]);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      dynamicGroup.add(mesh);
    }
    makeInst(byShape[0], 0, GEO_BOX);
    makeInst(byShape[1], 1, GEO_BALL);
    makeInst(byShape[2], 2, GEO_CYL);
    makeInst(byShape[3], 3, GEO_WEDGE);
  }

  // ── Scene loader ──
  async function loadScene(placeId) {
    try {
      var r = await fetch('/api/watch/scene/' + placeId);
      var info = await r.json();
      if (!info.ok || !info.exists) {
        hudParts.textContent = 'scene not cached yet';
        return;
      }
      var s = await fetch('/watch-data/' + 'scene_' + placeId + '.json');
      var data = await s.json();
      hudParts.textContent = (data.parts || []).length.toLocaleString() + ' parts';
      buildStaticScene(data.parts || []);
    } catch (e) {
      console.warn('scene load failed', e);
      hudParts.textContent = 'scene load failed';
    }
  }

  // ── Player list in sidebar ──
  function colorCss(p) {
    if (p.teamColor) {
      return 'rgb(' + Math.round(p.teamColor[0]*255) + ',' + Math.round(p.teamColor[1]*255) + ',' + Math.round(p.teamColor[2]*255) + ')';
    }
    return p.isLocal ? '#7850ff' : '#7dc9e0';
  }
  function renderPlayerList(players) {
    if (!players || players.length === 0) {
      playerList.innerHTML = '<div style="color:#6a6a7a;font-size:12px;text-align:center;padding:14px 0">No players</div>';
      return;
    }
    var sorted = players.slice().sort(function(a,b){
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
    playerList.innerHTML = sorted.map(function(p){
      var col = colorCss(p);
      var hp = p.maxHealth ? Math.max(0, Math.min(100, (p.health / p.maxHealth) * 100)) : 0;
      var nm = (p.displayName || p.name || ('User ' + p.userId)).replace(/[<>&"]/g, function(c){return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c];});
      return '<div class="prow ' + (p.isLocal ? 'is-local' : '') + '">' +
        '<span class="dot" style="background:' + col + ';color:' + col + '"></span>' +
        '<span class="pn">' + nm + (p.isLocal ? ' (target)' : '') + '</span>' +
        '<span class="hpbar"><span class="hpfill" style="width:' + hp + '%;background:' + (hp > 50 ? '#7ddd9f' : hp > 25 ? '#e8c07a' : '#ff7a7a') + '"></span></span>' +
        '<span class="ph">' + Math.round(p.health || 0) + '</span>' +
      '</div>';
    }).join('');
  }

  // ── Poll loop ──
  var lastPlaceId = null;
  async function poll() {
    try {
      var r = await fetch('/api/watch/stream/' + USER_ID + '?t=' + Date.now());
      var res = await r.json();
      if (!res.ok) {
        hudStatus.classList.remove('live');
        hudStatus.classList.add('dead');
        hudStatus.innerHTML = '<span class="dot"></span> OFFLINE';
        staleEl.classList.remove('hidden');
        staleEl.textContent = 'No stream. Toggle "Enable 3D Watch" on the target.';
      } else {
        var d = res.data;
        currentData = d;

        if (!sceneLoaded && d.placeId && d.placeId !== lastPlaceId) {
          lastPlaceId = d.placeId;
          loadScene(d.placeId);
        }

        updatePlayers(d.players || []);
        rebuildDynamic(d.dynamic || []);
        renderPlayerList(d.players || []);

        hudStatus.classList.remove('dead');
        hudStatus.classList.add('live');
        hudStatus.innerHTML = '<span class="dot"></span> LIVE';
        hudPlace.textContent = 'Place ' + d.placeId;
        hudPlayers.textContent = (d.players || []).length + ' players';
        staleEl.classList.add('hidden');

        var me = (d.players || []).find(function(p){ return String(p.userId) === USER_ID; });
        if (me) {
          targetName.textContent = me.displayName || me.name;
          targetSub.textContent = 'ID ' + USER_ID + ' · ' + Math.round(me.health) + '/' + Math.round(me.maxHealth);
        } else {
          targetName.textContent = 'User ' + USER_ID;
          targetSub.textContent = 'Not currently in game';
        }
        if (res.thumbnail) targetImg.src = res.thumbnail;
      }
    } catch (e) {
      hudStatus.classList.remove('live');
      hudStatus.classList.add('dead');
      hudStatus.innerHTML = '<span class="dot"></span> ERROR';
    }
    setTimeout(poll, 120);
  }

  // ── Camera mode buttons ──
  document.getElementById('btnOrbit').addEventListener('click', function(){
    camMode = 'orbit';
    ['btnOrbit','btnFollow','btnPov'].forEach(function(id){ document.getElementById(id).classList.remove('active'); });
    this.classList.add('active');
  });
  document.getElementById('btnFollow').addEventListener('click', function(){
    camMode = 'follow';
    ['btnOrbit','btnFollow','btnPov'].forEach(function(id){ document.getElementById(id).classList.remove('active'); });
    this.classList.add('active');
  });
  document.getElementById('btnPov').addEventListener('click', function(){
    camMode = 'pov';
    ['btnOrbit','btnFollow','btnPov'].forEach(function(id){ document.getElementById(id).classList.remove('active'); });
    this.classList.add('active');
  });

  // ── Init ──
  function boot() {
    if (!window.THREE) { setTimeout(boot, 50); return; }
    initThree();
    poll();
  }
  boot();
})();
  `;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>3D Watch - User ${userId}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
<style>${viewerCss}</style>
</head>
<body>
<div id="app">
  <div id="viewport">
    <div id="hud">
      <span class="pill" id="hudStatus"><span class="dot"></span> CONNECTING</span>
      <span class="pill" id="hudPlace">—</span>
      <span class="pill" id="hudPlayers">0 players</span>
      <span class="pill" id="hudParts">loading scene…</span>
    </div>
    <div id="controls">
      <button class="ctrlbtn active" id="btnOrbit">Free Orbit</button>
      <button class="ctrlbtn" id="btnFollow">Follow Player</button>
      <button class="ctrlbtn" id="btnPov">Target POV</button>
    </div>
  </div>
  <div id="side">
    <div class="scard">
      <div class="lbl">Target</div>
      <div class="target">
        <img id="targetImg" src="data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' rx='24' fill='%232a2a34'/%3E%3C/svg%3E">
        <div class="meta">
          <div class="nm" id="targetName">User ${userId}</div>
          <div class="sub" id="targetSub">Loading…</div>
        </div>
      </div>
    </div>
    <div class="scard">
      <div class="lbl">Players</div>
      <div class="plist" id="playerList"></div>
    </div>
    <div class="scard">
      <div class="lbl">Status</div>
      <div id="staleMsg" class="hidden" style="color:#ff9a9a;font-size:12px;text-align:center;padding:8px 0"></div>
    </div>
  </div>
</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
window.THREE = THREE;
window.OrbitControls = OrbitControls;
${viewerJs.replace(/^\(function\(\)\{/, '').replace(/\}\)\(\);\s*$/, '')}
</script>
<script>
// Re-inject viewer JS as a classic script so it runs after three.js module loads.
// (Uses window.THREE / window.OrbitControls installed by the module script above.)
(function waitForThree(){
  if (!window.THREE || !window.OrbitControls) { setTimeout(waitForThree, 60); return; }
  ${viewerJs.replace(/^\s*\(function\(\)\{/, '(function(){').replace(/\}\)\(\);\s*$/, '})();')}
})();
</script>
</body>
</html>`;

  res.set("Content-Type", "text/html").send(html);
});
