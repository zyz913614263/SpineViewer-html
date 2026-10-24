const RUNTIMES = {
  "3.3": "vendor/spine-player-3.7.js",
  "3.4": "vendor/spine-player-3.7.js",
  "3.5": "vendor/spine-player-3.7.js",
  "3.6": "vendor/spine-player-3.7.js",
  "3.7": "vendor/spine-player-3.7.js",
  "3.8": "vendor/spine-player-3.8.js",
  "4.0": "vendor/spine-player-4.0.js",
  "4.1": "vendor/spine-player-4.1.js",
  "4.2": "vendor/spine-player-4.2.js",
  "4.3": "vendor/spine-player-4.3.js",
};

const LEGACY_37 = new Set(["3.3", "3.4", "3.5", "3.6", "3.7"]);

const BACKGROUNDS = {
  checker: "#00000000",
  white: "#ffffffff",
  black: "#000000ff",
  gray: "#737373ff",
};

const SAMPLE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAFElEQVR4nGP4z8DwH4Sh1H8GdAEABykP8fcOk50AAAAASUVORK5CYII=";

const els = {
  stage: document.querySelector("#stage"),
  player: document.querySelector("#player"),
  empty: document.querySelector("#empty"),
  status: document.querySelector("#status"),
  info: document.querySelector("#info"),
  clock: document.querySelector("#clock"),
  animations: document.querySelector("#animations"),
  skins: document.querySelector("#skins"),
  slots: document.querySelector("#slots"),
  timeline: document.querySelector("#timeline"),
  play: document.querySelector("#play"),
  prev: document.querySelector("#prev"),
  next: document.querySelector("#next"),
  speed: document.querySelector("#speed"),
  loop: document.querySelector("#loop"),
  background: document.querySelector("#background"),
  bones: document.querySelector("#bones"),
  fps: document.querySelector("#fps"),
  exportPng: document.querySelector("#export-png"),
  exportGif: document.querySelector("#export-gif"),
};

let player = null;
let runtimeKey = "";
let loadedSrc = "";
let hiddenSlots = new Set();
let enabledSkins = [];
let syncing = false;
let exporting = false;
let baseName = "spine";
let assetSets = [];
let loadGeneration = 0;

document.querySelector("#open-files").onclick = () => document.querySelector("#file-input").click();
document.querySelector("#open-folder").onclick = () => document.querySelector("#folder-input").click();
document.querySelector("#file-input").onchange = (event) => {
  loadFileList(event.target.files);
  event.target.value = "";
};
document.querySelector("#folder-input").onchange = (event) => {
  loadFileList(event.target.files);
  event.target.value = "";
};
document.querySelector("#open-sample").onclick = loadSample;
els.play.onclick = togglePlay;
els.prev.onclick = () => step(-1);
els.next.onclick = () => step(1);
els.speed.onchange = applySpeed;
els.loop.onchange = applyLoop;
els.timeline.oninput = onTimeline;
els.background.onchange = applyBackground;
els.bones.onchange = () => {
  if (player) player.config.debug.bones = els.bones.checked;
};
els.exportPng.onclick = exportPng;
els.exportGif.onclick = exportGif;

window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.code === "ArrowLeft") {
    step(-1);
  } else if (event.code === "ArrowRight") {
    step(1);
  }
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
  document.body.classList.add("drag");
});
window.addEventListener("dragleave", () => document.body.classList.remove("drag"));
window.addEventListener("drop", async (event) => {
  event.preventDefault();
  document.body.classList.remove("drag");
  const files = await filesFromDrop(event.dataTransfer);
  if (files.length) loadFileList(files);
});

function setStatus(text) {
  els.status.textContent = text;
}

function setBusy(busy) {
  for (const id of ["play", "prev", "next", "export-png", "export-gif"]) {
    document.getElementById(id).disabled = busy || !player;
  }
}

async function loadSample() {
  const json = {
    skeleton: { spine: "4.2.0", x: -2, y: -1, width: 4, height: 2, fps: 30 },
    bones: [{ name: "root" }],
    slots: [{ name: "region", bone: "root", attachment: "box" }],
    skins: [
      {
        name: "default",
        attachments: {
          region: { box: { type: "region", path: "box", width: 4, height: 2 } },
        },
      },
    ],
    animations: {
      idle: {
        bones: {
          root: {
            rotate: [
              { time: 0, value: 0 },
              { time: 1, value: 90 },
            ],
          },
        },
      },
    },
  };
  const atlas = [
    "page.png",
    "size: 4, 2",
    "format: RGBA8888",
    "filter: Linear, Linear",
    "repeat: none",
    "box",
    "  rotate: false",
    "  xy: 0, 0",
    "  size: 4, 2",
    "  orig: 4, 2",
    "  offset: 0, 0",
    "  index: -1",
    "",
  ].join("\n");
  baseName = "sample";
  await openAssets({
    version: "4.2.0",
    binary: false,
    jsonText: JSON.stringify(json),
    atlasText: atlas,
    pages: { "page.png": SAMPLE_PNG },
  });
}

async function loadFileList(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const sets = buildSets(files);
  if (!sets.length) {
    setStatus("需要同名的 JSON（或 skel）、atlas 和贴图，例如 hero.json、hero.atlas、hero.png。");
    return;
  }
  assetSets = sets;
  renderSets(sets);
  await openSet(sets[0]);
}

function buildSets(files) {
  const sets = new Map();
  const images = [];
  for (const file of files) {
    const path = filePath(file);
    const name = path.split("/").pop();
    const dir = directoryOf(path);
    const atlas = name.match(/^(.*)\.atlas(?:\.txt)?$/i);
    const json = name.match(/^(.*)\.json$/i);
    const skel = name.match(/^(.*)\.skel$/i);
    if (/\.(png|jpe?g|webp)$/i.test(name)) images.push(file);
    if (!atlas && !json && !skel) continue;
    const stem = (atlas || json || skel)[1];
    const key = `${dir}\0${stem}`.toLowerCase();
    const set = sets.get(key) || { key, dir, stem, label: dir ? `${dir}/${stem}` : stem, atlas: null, json: null, skel: null };
    if (atlas) set.atlas = file;
    if (json) set.json = file;
    if (skel) set.skel = file;
    sets.set(key, set);
  }
  return [...sets.values()]
    .filter((set) => set.atlas && (set.json || set.skel))
    .sort((a, b) => a.label.localeCompare(b.label, "zh"))
    .map((set) => ({ ...set, images }));
}

function renderSets(sets) {
  const section = document.querySelector("#skeletons-section");
  const list = document.querySelector("#skeletons");
  if (sets.length < 2) {
    section.hidden = true;
    list.replaceChildren();
    return;
  }
  section.hidden = false;
  list.replaceChildren();
  for (const set of sets) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.key = set.key;
    button.textContent = set.label;
    button.onclick = () => openSet(set);
    list.appendChild(button);
  }
}

function markSet(key) {
  for (const button of document.querySelectorAll("#skeletons button")) {
    button.classList.toggle("selected", button.dataset.key === key);
  }
}

async function openSet(set) {
  const generation = ++loadGeneration;
  markSet(set.key);
  const atlasText = await set.atlas.text();
  if (generation !== loadGeneration) return;
  const pages = atlasPageNames(atlasText);
  const pageData = {};
  for (const page of pages) {
    const image = findPage(set.images, page, set.dir);
    if (!image) {
      setStatus(`找不到贴图 ${page}`);
      return;
    }
    pageData[page] = await dataUri(image);
    if (generation !== loadGeneration) return;
  }
  baseName = set.stem;
  if (set.json) {
    const jsonText = await set.json.text();
    if (generation !== loadGeneration) return;
    let version = "";
    try {
      version = JSON.parse(jsonText).skeleton?.spine || "";
    } catch (_error) {
      setStatus("骨骼 JSON 无法解析。");
      return;
    }
    await openAssets({ version, binary: false, jsonText, atlasText, pages: pageData });
  } else {
    const bytes = new Uint8Array(await set.skel.arrayBuffer());
    if (generation !== loadGeneration) return;
    await openAssets({
      version: sniffBinaryVersion(bytes) || "",
      binary: true,
      binaryUri: await dataUri(set.skel),
      atlasText,
      pages: pageData,
    });
  }
  if (generation === loadGeneration) markSet(set.key);
}

async function openAssets(asset) {
  const key = runtimeFor(asset.version);
  if (!key) {
    setStatus(`网页播放器支持 Spine 3.3–3.8 与 4.0–4.3，当前版本是 ${asset.version || "未知"}。`);
    return;
  }
  const binary = Boolean(asset.binary);
  if (binary && LEGACY_37.has(key)) {
    setStatus("3.7 及更早的网页播放器只能打开 JSON，请导出 JSON 后再打开。");
    return;
  }
  setStatus("正在加载…");
  hiddenSlots = new Set();
  enabledSkins = [];
  try {
    await ensureRuntime(key);
    stopPlayer(player);
    player = null;
    els.player.replaceChildren();
    const jsonText = asset.jsonText && LEGACY_37.has(key) ? adaptLegacyJson(asset.jsonText) : asset.jsonText;
    const raw = { "skeleton.atlas": textDataUri(asset.atlasText, "text/plain") };
    for (const [name, uri] of Object.entries(asset.pages)) raw[name] = uri;
    if (binary) raw["skeleton.skel"] = asset.binaryUri;
    else raw["skeleton.json"] = textDataUri(jsonText, "application/json");
    window.__spineRaw = raw;
    const pma = /^\s*pma:\s*true\s*$/im.test(asset.atlasText);
    const config = {
      jsonUrl: binary ? undefined : "skeleton.json",
      binaryUrl: binary ? "skeleton.skel" : undefined,
      skeleton: binary ? "skeleton.skel" : "skeleton.json",
      atlasUrl: "skeleton.atlas",
      atlas: "skeleton.atlas",
      rawDataURIs: raw,
      showControls: false,
      showLoading: false,
      alpha: true,
      premultipliedAlpha: pma,
      preserveDrawingBuffer: true,
      backgroundColor: BACKGROUNDS[els.background.value],
      viewport: { padLeft: "8%", padRight: "8%", padTop: "8%", padBottom: "8%", animations: {} },
      debug: {
        bones: els.bones.checked,
        regions: false,
        meshes: false,
        bounds: false,
        paths: false,
        clipping: false,
        points: false,
        hulls: false,
      },
      update: (view) => hideSlots(view),
      frame: () => {
        if (!exporting) refreshClock();
      },
      success: (view) => {
        player = view;
        hookSlotHiding(view);
        els.empty.hidden = true;
        buildLists();
        applySpeed();
        const animations = view.skeleton.data.animations;
        if (animations.length) {
          playNamed(animations[0].name);
          view.play();
          els.play.textContent = "暂停";
        } else {
          view.pause();
          els.play.textContent = "播放";
        }
        setBusy(false);
        const version = view.skeleton.data.version || asset.version;
        els.info.textContent = `Spine ${version} · 骨骼 ${view.skeleton.data.bones.length} · 插槽 ${view.skeleton.slots.length} · 动画 ${animations.length}`;
        setStatus(`已打开 ${baseName}`);
        markAnimation(animations[0] && animations[0].name);
      },
      error: (_view, message) => {
        const text = message && message.message ? message.message : String(message);
        setStatus(text);
        els.info.textContent = text;
      },
    };
    if (key === "3.8" && binary) config.skelUrl = "skeleton.skel";
    player = new spine.SpinePlayer(els.player, config);
    guardDraw(player);
  } catch (error) {
    setStatus(error.message || String(error));
  }
}

function runtimeFor(version) {
  const match = String(version || "").match(/^(\d+)\.(\d+)/);
  if (!match) return null;
  const key = `${match[1]}.${match[2]}`;
  if (RUNTIMES[key]) return key;
  if (match[1] === "4" && Number(match[2]) > 3) return "4.3";
  return null;
}

function ensureRuntime(key) {
  const src = RUNTIMES[key];
  if (loadedSrc === src && window.spine && window.spine.SpinePlayer) {
    runtimeKey = key;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const previous = document.querySelector("#spine-runtime");
    if (previous) previous.remove();
    window.spine = {};
    const script = document.createElement("script");
    script.id = "spine-runtime";
    script.src = src;
    script.onload = () => {
      loadedSrc = src;
      runtimeKey = key;
      if (src.includes("spine-player-3.")) installRawLoader();
      resolve();
    };
    script.onerror = () => reject(new Error("播放器运行时加载失败"));
    document.head.appendChild(script);
  });
}

function stopPlayer(current) {
  if (!current) return;
  current._stopped = true;
  if (typeof current.stopRendering === "function") current.stopRendering();
  if (typeof current.dispose === "function") {
    try {
      current.dispose();
    } catch (_error) {
      /* 旧播放器卸下时画布可能已经不在页面上。 */
    }
  }
  if (current.dom && current.dom.parentNode) current.dom.remove();
}

function guardDraw(current) {
  if (!current || typeof current.drawFrame !== "function" || current._guarded) return;
  const draw = current.drawFrame.bind(current);
  current.drawFrame = function drawGuarded(...args) {
    if (current._stopped) return;
    return draw(...args);
  };
  current._guarded = true;
}

function playNamed(name) {
  if (player.setAnimation.length >= 2) player.setAnimation(name, els.loop.checked);
  else player.setAnimation(name);
  const entry = currentEntry();
  if (entry) entry.loop = els.loop.checked;
}

function hookSlotHiding(view) {
  const state = view.animationState;
  if (!state || state._hideWrapped) return;
  const apply = state.apply.bind(state);
  state.apply = function hideOnApply(...args) {
    const result = apply(...args);
    hideSlots(view);
    return result;
  };
  state._hideWrapped = true;
}

function adaptLegacyJson(text) {
  let root;
  try {
    root = JSON.parse(text);
  } catch (_error) {
    return text;
  }
  if (root.animations) {
    for (const animation of Object.values(root.animations)) {
      if (animation && animation.ffd && !animation.deform) {
        animation.deform = animation.ffd;
        delete animation.ffd;
      }
    }
  }
  if (Array.isArray(root.bones)) {
    for (const bone of root.bones) {
      if (bone.flipX) {
        bone.scaleX = -(bone.scaleX == null ? 1 : bone.scaleX);
        delete bone.flipX;
      }
      if (bone.flipY) {
        bone.scaleY = -(bone.scaleY == null ? 1 : bone.scaleY);
        delete bone.flipY;
      }
      if (bone.transform == null && (bone.inheritRotation != null || bone.inheritScale != null)) {
        const rotation = bone.inheritRotation !== false;
        const scale = bone.inheritScale !== false;
        if (rotation && scale) bone.transform = "normal";
        else if (rotation) bone.transform = "noScale";
        else if (scale) bone.transform = "noRotationOrReflection";
        else bone.transform = "onlyTranslation";
        delete bone.inheritRotation;
        delete bone.inheritScale;
      }
    }
  }
  return JSON.stringify(root);
}

function installRawLoader() {
  const manager = spine.AssetManager;
  if (!manager || manager.__spineRaw) return;
  manager.__spineRaw = true;
  const originalText = manager.downloadText;
  const originalBinary = manager.downloadBinary;
  const originalProtoText = manager.prototype.downloadText;
  const originalProtoBinary = manager.prototype.downloadBinary;
  const originalLoad = manager.prototype.loadTexture;
  if (typeof originalText === "function") {
    manager.downloadText = function downloadRawText(url, success, error) {
      const raw = lookupRaw(url);
      if (raw) {
        success(decodeRawText(raw));
        return;
      }
      return originalText(url, success, error);
    };
  }
  if (typeof originalBinary === "function") {
    manager.downloadBinary = function downloadRawBinary(url, success, error) {
      const raw = lookupRaw(url);
      if (raw && String(raw).startsWith("data:")) {
        success(decodeRawBytes(raw));
        return;
      }
      return originalBinary(url, success, error);
    };
  }
  if (typeof originalProtoText === "function") {
    manager.prototype.downloadText = function downloadRawText(url, success, error) {
      const raw = (this.rawDataUris && this.rawDataUris[url]) || lookupRaw(url);
      if (raw && String(raw).startsWith("data:")) {
        success(decodeRawText(raw));
        return;
      }
      return originalProtoText.call(this, url, success, error);
    };
  }
  if (typeof originalProtoBinary === "function") {
    manager.prototype.downloadBinary = function downloadRawBinary(url, success, error) {
      const raw = (this.rawDataUris && this.rawDataUris[url]) || lookupRaw(url);
      if (raw && String(raw).startsWith("data:")) {
        success(decodeRawBytes(raw));
        return;
      }
      return originalProtoBinary.call(this, url, success, error);
    };
  }
  if (typeof originalLoad === "function") {
    manager.prototype.loadTexture = function loadRawTexture(path, success, error) {
      const raw = lookupRaw(String(path).replace(/^\//, ""));
      if (raw && typeof this.loadTextureData === "function" && !(this.rawDataUris && this.rawDataUris[path])) {
        this.loadTextureData(path, raw, success, error);
        return;
      }
      return originalLoad.call(this, path, success, error);
    };
  }
}

function lookupRaw(url) {
  const raw = window.__spineRaw || {};
  if (raw[url]) return raw[url];
  const bare = String(url || "").replace(/^\//, "");
  if (raw[bare]) return raw[bare];
  return raw[bare.split("/").pop()] || null;
}

function decodeRawText(value) {
  const uri = String(value);
  if (!uri.startsWith("data:")) return uri;
  const comma = uri.indexOf(",");
  const meta = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  if (!/;base64/i.test(meta)) return decodeURIComponent(payload);
  return new TextDecoder().decode(decodeRawBytes(uri));
}

function decodeRawBytes(uri) {
  const comma = uri.indexOf(",");
  const binary = atob(uri.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function buildLists() {
  const data = player.skeleton.data;
  els.animations.replaceChildren();
  if (!data.animations.length) {
    els.animations.textContent = "没有动画，显示设置姿势。";
  }
  for (const animation of data.animations) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${animation.name}    ${animation.duration.toFixed(2)}s`;
    button.onclick = () => {
      playNamed(animation.name);
      applySpeed();
      if (els.play.textContent === "暂停") player.play();
      else player.pause();
      markAnimation(animation.name);
    };
    els.animations.appendChild(button);
  }
  els.skins.replaceChildren();
  const note = document.createElement("div");
  note.textContent = "default 皮肤始终参与绘制";
  els.skins.appendChild(note);
  for (const skin of data.skins) {
    if (skin === data.defaultSkin || skin.name === "default") continue;
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.onchange = () => {
      if (input.checked) enabledSkins.push(skin.name);
      else enabledSkins = enabledSkins.filter((name) => name !== skin.name);
      applySkins();
    };
    label.append(input, document.createTextNode(skin.name));
    els.skins.appendChild(label);
  }
  els.slots.replaceChildren();
  for (const slot of player.skeleton.slots) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    input.onchange = () => {
      if (input.checked) hiddenSlots.delete(slot.data.name);
      else hiddenSlots.add(slot.data.name);
      restoreSlots();
    };
    label.append(input, document.createTextNode(slot.data.name));
    els.slots.appendChild(label);
  }
  els.timeline.disabled = !data.animations.length;
}

function markAnimation(name) {
  for (const button of els.animations.querySelectorAll("button")) {
    button.classList.toggle("selected", button.textContent.startsWith(`${name} `) || button.textContent.startsWith(`${name}    `));
  }
}

function applySkins() {
  if (!player || !player.skeleton) return;
  const skeleton = player.skeleton;
  const data = skeleton.data;
  const Skin = spine.Skin;
  const selected = enabledSkins.map((name) => data.findSkin(name)).filter(Boolean);
  if (!selected.length || !Skin) {
    const fallback = data.defaultSkin || data.findSkin("default");
    if (fallback) skeleton.setSkin(fallback);
  } else {
    const combined = new Skin("combined");
    if (data.defaultSkin) copySkin(combined, data.defaultSkin);
    for (const skin of selected) copySkin(combined, skin);
    skeleton.setSkin(combined);
  }
  if (skeleton.setSlotsToSetupPose) skeleton.setSlotsToSetupPose();
  else if (skeleton.setupPoseSlots) skeleton.setupPoseSlots();
  const entry = player.animationState.getCurrent(0);
  if (entry) {
    player.animationState.apply(skeleton);
    if (player.setViewport) player.setViewport(entry.animation);
  }
  updateWorld(skeleton);
}

function copySkin(target, source) {
  if (typeof target.addSkin === "function") {
    target.addSkin(source);
    return;
  }
  const maps = source.attachments || [];
  for (let slotIndex = 0; slotIndex < maps.length; slotIndex++) {
    const map = maps[slotIndex];
    if (!map) continue;
    for (const name of Object.keys(map)) target.addAttachment(slotIndex, name, map[name]);
  }
}

function hideSlots(view) {
  if (!view.skeleton) return;
  for (const slot of view.skeleton.slots) {
    if (hiddenSlots.has(slot.data.name)) slot.setAttachment(null);
  }
}

function restoreSlots() {
  if (!player || !player.skeleton) return;
  const skeleton = player.skeleton;
  if (skeleton.setSlotsToSetupPose) skeleton.setSlotsToSetupPose();
  else if (skeleton.setupPoseSlots) skeleton.setupPoseSlots();
  const entry = currentEntry();
  if (entry) player.animationState.apply(skeleton);
  updateWorld(skeleton);
  hideSlots(player);
}

function updateWorld(skeleton) {
  const physics = window.spine && spine.Physics;
  if (physics) skeleton.updateWorldTransform(physics.update);
  else skeleton.updateWorldTransform();
}

function currentEntry() {
  return player && player.animationState ? player.animationState.getCurrent(0) : null;
}

function currentTime() {
  const entry = currentEntry();
  if (!entry || !entry.animation) return { time: 0, duration: 0 };
  const duration = entry.animation.duration || 0;
  let time = entry.trackTime || 0;
  if (entry.loop && duration > 0) time %= duration;
  else if (duration > 0) time = Math.min(time, duration);
  return { time, duration };
}

function refreshClock() {
  if (!player) return;
  const { time, duration } = currentTime();
  syncing = true;
  els.timeline.max = String(duration || 1);
  els.timeline.value = String(Math.min(time, duration || 1));
  syncing = false;
  els.clock.textContent = `${time.toFixed(2)} / ${duration.toFixed(2)}`;
}

function onTimeline() {
  if (syncing || !player) return;
  player.pause();
  els.play.textContent = "播放";
  seek(Number(els.timeline.value));
  refreshClock();
}

function seek(time) {
  const entry = currentEntry();
  if (!entry) return;
  entry.trackTime = Math.max(0, time);
  player.animationState.apply(player.skeleton);
  updateWorld(player.skeleton);
  hideSlots(player);
}

function togglePlay() {
  if (!player || !player.skeleton) return;
  if (!currentEntry()) {
    setStatus("当前没有动画。");
    return;
  }
  if (player.paused) {
    player.play();
    els.play.textContent = "暂停";
  } else {
    player.pause();
    els.play.textContent = "播放";
  }
}

function step(direction) {
  if (!player) return;
  player.pause();
  els.play.textContent = "播放";
  const fps = Number(els.fps.value) || 30;
  const { time, duration } = currentTime();
  let next = time + direction / fps;
  if (els.loop.checked && duration > 0) next = (next % duration + duration) % duration;
  else next = Math.max(0, Math.min(duration, next));
  seek(next);
  refreshClock();
}

function applySpeed() {
  const value = Number(els.speed.value);
  if (player && value > 0) player.speed = value;
}

function applyLoop() {
  const entry = currentEntry();
  if (entry) entry.loop = els.loop.checked;
}

function applyBackground() {
  const stage = els.stage;
  const mode = els.background.value;
  stage.classList.toggle("checker", mode === "checker");
  stage.classList.toggle("solid", mode !== "checker");
  if (mode === "white") stage.style.backgroundColor = "#fff";
  else if (mode === "black") stage.style.backgroundColor = "#000";
  else if (mode === "gray") stage.style.backgroundColor = "#737373";
  else stage.style.backgroundColor = "";
  const hex = BACKGROUNDS[mode];
  if (player && player.bg && player.bg.setFromString) player.bg.setFromString(hex);
  if (player && player.config) player.config.backgroundColor = hex;
}

function exportPng() {
  if (!player || !player.canvas) return;
  const wasPaused = player.paused;
  if (!wasPaused) player.pause();
  player.drawFrame(false);
  player.canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${baseName}.png`);
    if (!wasPaused) player.play();
    setStatus(`已导出 ${baseName}.png`);
  }, "image/png");
}

async function exportGif() {
  if (!player || !player.canvas || exporting) return;
  const { GIFEncoder, quantize, applyPalette } = gifenc;
  const entry = currentEntry();
  const duration = entry && entry.animation ? entry.animation.duration : 0;
  const fps = Math.min(30, Math.max(1, Number(els.fps.value) || 12));
  const count = duration > 0 ? Math.min(150, Math.max(1, Math.round(duration * fps))) : 1;
  const wasPaused = player.paused;
  exporting = true;
  setBusy(true);
  player.pause();
  const gif = GIFEncoder();
  try {
    for (let index = 0; index < count; index++) {
      seek(duration > 0 ? (index / count) * duration : 0);
      player.drawFrame(false);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const image = captureImage(480);
      const palette = quantize(image.data, 256);
      const indexed = applyPalette(image.data, palette);
      gif.writeFrame(indexed, image.width, image.height, {
        palette,
        delay: Math.round(1000 / fps),
        repeat: els.loop.checked ? 0 : -1,
      });
      setStatus(`正在导出 GIF ${index + 1}/${count}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    gif.finish();
    downloadBlob(new Blob([gif.bytes()], { type: "image/gif" }), `${baseName}.gif`);
    setStatus(`已导出 ${baseName}.gif`);
  } catch (error) {
    setStatus(error.message || String(error));
  } finally {
    exporting = false;
    setBusy(false);
    if (!wasPaused) {
      player.play();
      els.play.textContent = "暂停";
    }
  }
}

function captureImage(maxEdge) {
  const source = player.canvas;
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height, 1));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function atlasPageNames(text) {
  const lines = text.split(/\r?\n/);
  const pages = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line || /^[ \t]/.test(line)) continue;
    const next = (lines[index + 1] || "").trim();
    if (next.startsWith("size:")) pages.push(line.trim());
  }
  return pages;
}

function filePath(file) {
  return file.webkitRelativePath || file._relativePath || file.name;
}

function directoryOf(path) {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index) : "";
}

function findPage(files, page, dir) {
  const base = page.split("/").pop();
  const inDir = files.filter((file) => directoryOf(filePath(file)).toLowerCase() === dir.toLowerCase());
  const named = (file) => {
    const path = filePath(file);
    return file.name === base || path === page || path.endsWith(`/${page}`);
  };
  return inDir.find(named) || files.find(named);
}

function dataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function textDataUri(text, mime) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

function sniffBinaryVersion(bytes) {
  const from = (index) => {
    try {
      const [length, next] = readVarint(bytes, index);
      if (length <= 1 || next + length - 1 > bytes.length) return "";
      const text = new TextDecoder().decode(bytes.slice(next, next + length - 1));
      return /^\d+\.\d+/.test(text) ? text : "";
    } catch (_error) {
      return "";
    }
  };
  return from(8) || from(readVarint(bytes, 0)[1]);
}

function readVarint(bytes, index) {
  let value = 0;
  let shift = 0;
  while (index < bytes.length && shift < 28) {
    const byte = bytes[index++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [value, index];
    shift += 7;
  }
  return [0, index];
}

async function filesFromDrop(dataTransfer) {
  const items = [...dataTransfer.items];
  const entries = items.map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return [...dataTransfer.files];
  const files = [];
  for (const entry of entries) await walkEntry(entry, files);
  return files;
}

function watchClock() {
  if (player && !exporting) refreshClock();
  requestAnimationFrame(watchClock);
}
watchClock();

async function walkEntry(entry, files) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    const relative = String(entry.fullPath || file.name).replace(/^\/+/, "");
    if (relative && relative !== file.name) file._relativePath = relative;
    files.push(file);
    return;
  }
  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const child of batch) await walkEntry(child, files);
  }
}
