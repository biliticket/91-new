const main = document.getElementById("main");
const catsEl = document.getElementById("cats");
const topbar = document.getElementById("topbar");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");

// Media-only app: top chips switch library types
const MEDIA_TABS = [
  { type: "images", name: "图片" },
  { type: "videos", name: "视频表" },
  { type: "media_videos", name: "帖子视频" },
];
const DEFAULT_CATS = MEDIA_TABS.map((t) => ({
  slug: t.type,
  name: t.name,
  href: `#/media/${t.type}`,
}));

let activePlayers = [];

function destroyPlayers() {
  for (const p of activePlayers) {
    try {
      if (typeof p.destroy === "function") p.destroy();
    } catch {}
  }
  activePlayers = [];
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs || "");
  const parts = (path || "").split("/").filter(Boolean);
  // Media-only: any route resolves to media library
  let type = "images";
  if (parts[0] === "media" && parts[1]) type = parts[1];
  else if (parts[0] === "videos" || parts[0] === "media_videos" || parts[0] === "images")
    type = parts[0];
  else if (params.get("type")) type = params.get("type");
  if (!["images", "videos", "media_videos"].includes(type)) type = "images";
  return {
    view: "media",
    type,
    page: Math.max(1, parseInt(params.get("p") || "1", 10) || 1),
    q: params.get("q") || (parts[0] === "search" ? decodeURIComponent(parts[1] || "") : ""),
    pageSize: Math.max(12, parseInt(params.get("ps") || "48", 10) || 48),
  };
}

function setState(html) {
  destroyPlayers();
  main.innerHTML = html;
}

function imgUrl(src) {
  if (!src) return "";
  if (src.startsWith("/api/")) return src;
  return `/api/img?url=${encodeURIComponent(src)}`;
}

function formatDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d.slice(0, 10);
    return dt.toLocaleDateString("zh-CN");
  } catch {
    return "";
  }
}

function renderCats(activeType = "images") {
  const items = DEFAULT_CATS.map((c) => {
    const href = c.href || `#/media/${c.slug}`;
    const active = (activeType || "images") === (c.slug || "") ? "active" : "";
    return `<a class="cat ${active}" href="${href}">${c.name}</a>`;
  }).join("");
  catsEl.innerHTML = items;
  const activeEl = catsEl.querySelector(".cat.active");
  if (activeEl) {
    activeEl.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "auto",
    });
  }
}

function cardHtml(p) {
  const cover = p.cover ? imgUrl(p.cover) : "";
  const style = cover ? `style="background-image:url('${cover}')"` : "";
  const date = formatDate(p.date);
  return `
    <a class="card" href="#/post/${p.id}">
      <div class="card-cover" ${style}></div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(p.title)}</div>
        ${date ? `<div class="card-meta">${date}</div>` : ""}
      </div>
    </a>`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadingHtml() {
  return `<div class="state"><span class="spinner" aria-hidden="true"></span></div>`;
}

function messageHtml(title, sub, isError) {
  return `
    <div class="state${isError ? " error" : ""}">
      <div class="state-title">${escapeHtml(title)}</div>
      ${sub ? `<div class="state-sub">${escapeHtml(sub)}</div>` : ""}
    </div>`;
}

function pagerHtml(route) {
  const page = route.page || 1;
  let prevHref = "";
  let nextHref = "";
  if (route.view === "home") {
    prevHref = page > 2 ? `#/page/${page - 1}` : "#/";
    nextHref = `#/page/${page + 1}`;
  } else if (route.view === "category") {
    prevHref = page > 2 ? `#/c/${route.slug}?p=${page - 1}` : `#/c/${route.slug}`;
    nextHref = `#/c/${route.slug}?p=${page + 1}`;
  } else if (route.view === "search") {
    const q = encodeURIComponent(route.q || "");
    prevHref = page > 2 ? `#/search/${q}?p=${page - 1}` : `#/search/${q}`;
    nextHref = `#/search/${q}?p=${page + 1}`;
  }
  return `
    <div class="pager">
      <button class="pager-nav" ${page <= 1 ? "disabled" : ""} data-href="${prevHref}">上一页</button>
      <button class="pager-page" disabled>第 ${page} 页</button>
      <button class="pager-nav" data-href="${nextHref}">下一页</button>
    </div>`;
}

async function api(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "请求失败");
  return data;
}

async function renderList(route) {
  setState(loadingHtml());
  renderCats(route.view === "category" ? route.slug : "");
  let url = "";
  if (route.view === "category") {
    url = `/api/category/${encodeURIComponent(route.slug)}?page=${route.page || 1}`;
  } else if (route.view === "search") {
    url = `/api/search?q=${encodeURIComponent(route.q || "")}&page=${route.page || 1}`;
  } else {
    url = `/api/home?page=${route.page || 1}`;
  }
  try {
    const data = await api(url);
    if (!data.posts?.length) {
      setState(
        `${messageHtml("没有内容", "换个分类或关键词试试", false)}${pagerHtml(route)}`
      );
      bindPager();
      return;
    }
    const grid = data.posts.map(cardHtml).join("");
    setState(`
      <div class="grid enter">${grid}</div>
      ${pagerHtml({ ...route, page: data.page || route.page || 1 })}
    `);
    bindPager();
  } catch (e) {
    setState(messageHtml("加载失败", e.message, true));
  }
}

function bindPager() {
  main.querySelectorAll(".pager button[data-href]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const href = btn.getAttribute("data-href");
      if (href) location.hash = href.replace(/^#/, "#");
    });
  });
}

/* =========================================================
   Custom video player — Apple TV / iOS inspired
   ========================================================= */

// SVG glyphs (24x24 viewBox, currentColor)
const ICONS = {
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.14v13.72c0 .8.86 1.29 1.54.88l10.98-6.86a1.04 1.04 0 0 0 0-1.76L9.54 4.26A1.04 1.04 0 0 0 8 5.14Z" fill="currentColor"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5A1.5 1.5 0 0 1 8.5 6v12A1.5 1.5 0 0 1 5.5 18V6A1.5 1.5 0 0 1 7 4.5Zm10 0A1.5 1.5 0 0 1 18.5 6v12a1.5 1.5 0 0 1-3 0V6A1.5 1.5 0 0 1 17 4.5Z" fill="currentColor"/></svg>`,
  volume: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4.5 6.5 8H3.6A1.1 1.1 0 0 0 2.5 9.1v5.8A1.1 1.1 0 0 0 3.6 16h2.9L11 19.5c.7.55 1.75.06 1.75-.85V5.35c0-.9-1.05-1.4-1.75-.85Z" fill="currentColor"/><path d="M15.5 8.8a4 4 0 0 1 0 6.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 6.5a7.2 7.2 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  mute: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4.5 6.5 8H3.6A1.1 1.1 0 0 0 2.5 9.1v5.8A1.1 1.1 0 0 0 3.6 16h2.9L11 19.5c.7.55 1.75.06 1.75-.85V5.35c0-.9-1.05-1.4-1.75-.85Z" fill="currentColor"/><path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  enterFs: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9m6 0h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`,
  exitFs: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4m16 0h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`,
  theater: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 6v12M16 6v12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/></svg>`,
  theaterOff: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8.5A1.5 1.5 0 0 1 7.5 7h9A1.5 1.5 0 0 1 18 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 15.5v-7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10v4M20.5 10v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
};

function fmtTime(t) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const s = Math.floor(t % 60);
  const m = Math.floor((t / 60) % 60);
  const h = Math.floor(t / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Only one video plays at a time across the page.
let playingVideo = null;
function claimPlayback(video) {
  if (playingVideo && playingVideo !== video) {
    try { playingVideo.pause(); } catch {}
  }
  playingVideo = video;
}

const PLAYER_SIZE_KEY = "clean.player.h";
const PLAYER_THEATER_KEY = "clean.player.theater";
function readStoredHeight() {
  try {
    const n = Number(localStorage.getItem(PLAYER_SIZE_KEY));
    if (Number.isFinite(n) && n >= 180 && n <= 4000) return n;
  } catch {}
  return null;
}
function writeStoredHeight(h) {
  try { localStorage.setItem(PLAYER_SIZE_KEY, String(Math.round(h))); } catch {}
}
function readTheaterPref() {
  try { return localStorage.getItem(PLAYER_THEATER_KEY) === "1"; } catch { return false; }
}
function writeTheaterPref(on) {
  try { localStorage.setItem(PLAYER_THEATER_KEY, on ? "1" : "0"); } catch {}
}

const RATE_MIN = 0.25;
const RATE_MAX = 3;
const RATE_STEP = 0.05;
const RATE_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function createPlayer(card, sources, startIndex = 0) {
  const video = card.querySelector("video");
  const root = card.querySelector(".player-shell");
  const partsWrap = card.querySelector(".player-parts");
  let hls = null;
  let index = startIndex;
  let hideTimer = null;
  let scrubbing = false;
  let destroyed = false;
  let wasPlaying = false;

  // ---- build chrome ----
  root.insertAdjacentHTML(
    "beforeend",
    `
    <div class="pl-tap" data-role="tap"></div>
    <div class="pl-center">
      <button class="pl-big" data-role="bigplay" aria-label="播放">${ICONS.play}</button>
    </div>
    <div class="pl-spinner" data-role="spinner" hidden><span class="spinner"></span></div>
    <div class="pl-error" data-role="error" hidden>
      <div class="pl-error-title">播放失败</div>
      <button class="pl-retry" data-role="retry">重试</button>
    </div>
    <div class="pl-toast" data-role="toast" hidden>下一段</div>
    <div class="pl-bar" data-role="bar">
      <button class="pl-icon" data-role="play" aria-label="播放">${ICONS.play}</button>
      <span class="pl-time" data-role="cur">0:00</span>
      <div class="pl-scrub" data-role="scrub" tabindex="0" role="slider" aria-label="进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="pl-track">
          <div class="pl-buffered" data-role="buffered"></div>
          <div class="pl-played" data-role="played"></div>
          <div class="pl-knob" data-role="knob"></div>
        </div>
        <div class="pl-tip" data-role="tip" hidden>0:00</div>
      </div>
      <span class="pl-time" data-role="dur">0:00</span>
      <div class="pl-vol" data-role="volwrap">
        <button class="pl-icon" data-role="mute" aria-label="静音" type="button">${ICONS.volume}</button>
        <div class="pl-vol-rail" data-role="volrail" role="slider" tabindex="0" aria-label="音量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
          <div class="pl-vol-track">
            <div class="pl-vol-fill" data-role="volfill"></div>
            <div class="pl-vol-knob" data-role="volknob"></div>
          </div>
        </div>
      </div>
      <div class="pl-rate-wrap" data-role="ratewrap">
        <button class="pl-icon pl-rate" data-role="rate" aria-label="播放速度" type="button" aria-haspopup="dialog" aria-expanded="false">1×</button>
        <div class="pl-rate-menu" data-role="ratemenu" role="dialog" aria-label="播放速度" hidden>
          <div class="pl-rate-head">
            <span class="pl-rate-label">倍速</span>
            <div class="pl-rate-value-row">
              <button type="button" class="pl-rate-step" data-role="rate-minus" aria-label="减慢">−</button>
              <input class="pl-rate-input" data-role="rate-input" type="number" min="${RATE_MIN}" max="${RATE_MAX}" step="${RATE_STEP}" value="1" inputmode="decimal" aria-label="自定义倍速" />
              <button type="button" class="pl-rate-step" data-role="rate-plus" aria-label="加快">+</button>
              <span class="pl-rate-unit">×</span>
            </div>
          </div>
          <div class="pl-rate-slider-row">
            <input class="pl-rate-slider" data-role="rate-slider" type="range" min="${RATE_MIN}" max="${RATE_MAX}" step="${RATE_STEP}" value="1" aria-label="倍速滑条" />
          </div>
          <div class="pl-rate-presets" data-role="rate-presets">
            ${RATE_PRESETS.map((r) => `<button type="button" class="pl-rate-opt" data-rate="${r}">${Number.isInteger(r) ? r : r}×</button>`).join("")}
          </div>
        </div>
      </div>
      <button class="pl-icon" data-role="theater" aria-label="网页全屏" type="button" title="网页全屏">${ICONS.theater}</button>
      <button class="pl-icon" data-role="fs" aria-label="系统全屏" type="button" title="系统全屏">${ICONS.enterFs}</button>
    </div>
    <div class="pl-resize" data-role="resize" title="拖动调整高度" aria-label="调整播放器高度" role="separator" aria-orientation="horizontal" tabindex="0"></div>`
  );

  const el = (r) => root.querySelector(`[data-role="${r}"]`);
  const bigPlay = el("bigplay");
  const playBtn = el("play");
  const muteBtn = el("mute");
  const rateBtn = el("rate");
  const rateMenu = el("ratemenu");
  const rateWrap = el("ratewrap");
  const rateSlider = el("rate-slider");
  const rateInput = el("rate-input");
  const rateMinus = el("rate-minus");
  const ratePlus = el("rate-plus");
  const ratePresets = el("rate-presets");
  const volRail = el("volrail");
  const volFill = el("volfill");
  const volKnob = el("volknob");
  const fsBtn = el("fs");
  const theaterBtn = el("theater");
  const resizeHandle = el("resize");
  let lastVolume = 1;
  let desiredRate = 1;
  let volDragging = false;
  let resizing = false;
  let theaterOn = false;
  const retryBtn = el("retry");
  const scrub = el("scrub");
  const played = el("played");
  const buffered = el("buffered");
  const knob = el("knob");
  const tip = el("tip");
  const curEl = el("cur");
  const durEl = el("dur");
  const spinner = el("spinner");
  const errorEl = el("error");
  const toast = el("toast");
  const tapLayer = el("tap");

  // ---- HLS / source loading ----
  let loadToken = 0;
  let hasPlayback = false;
  let stallTimer = null;

  function hideSpinner() {
    clearTimeout(stallTimer);
    stallTimer = null;
    spinner.hidden = true;
  }

  function showSpinner() {
    // Only show loading chrome when we truly need it
    spinner.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  function showError(force = false) {
    if (hasPlayback || !video.paused || video.readyState >= 3) {
      clearError();
      hideSpinner();
      return;
    }
    if (!force && !video.error) return;
    hideSpinner();
    errorEl.hidden = false;
  }

  function notePlayback() {
    hasPlayback = true;
    hideSpinner();
    clearError();
  }

  function loadSource(i) {
    index = i;
    const src = sources[i].url;
    const proxied = `/api/proxy?url=${encodeURIComponent(src)}`;
    const token = ++loadToken;
    hasPlayback = false;
    if (hls) { try { hls.destroy(); } catch {} hls = null; }
    clearError();
    showSpinner();
    try {
      video.removeAttribute("src");
      video.load();
    } catch {}

    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        xhrSetup(xhr) {
          try { xhr.withCredentials = false; } catch {}
        },
      });
      hls.loadSource(proxied);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (token !== loadToken) return;
        // Manifest ready — hide spinner; buffer events may re-show briefly
        hideSpinner();
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (token !== loadToken) return;
        if (!video.paused || hasPlayback) hideSpinner();
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (token !== loadToken || !data) return;
        if (!data.fatal) return;
        if (hasPlayback || !video.paused) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError(); } catch {}
          }
          clearError();
          hideSpinner();
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try { hls.startLoad(); return; } catch {}
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); return; } catch {}
        }
        setTimeout(() => {
          if (destroyed || token !== loadToken) return;
          if (hasPlayback || !video.paused || video.readyState >= 2) {
            clearError();
            hideSpinner();
            return;
          }
          showError(true);
        }, 800);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = proxied;
    } else {
      video.src = proxied;
    }
    // Keep user volume/rate across part switches
    try {
      video.volume = lastVolume;
      if (!video.muted) video.volume = Math.max(video.volume, 0.01);
      applyRate(desiredRate, { close: true });
    } catch {}
    updateParts();
  }

  // ---- parts strip ----
  function updateParts() {
    if (!partsWrap) return;
    partsWrap.querySelectorAll(".pl-part").forEach((b, i) => {
      b.classList.toggle("active", i === index);
    });
  }

  function switchPart(i, autoplay) {
    if (i < 0 || i >= sources.length || i === index) return;
    loadSource(i);
    if (autoplay) video.play().catch(() => {});
  }

  if (partsWrap) {
    partsWrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".pl-part");
      if (!btn) return;
      switchPart(Number(btn.dataset.i), true);
    });
  }

  // ---- controls visibility ----
  function showControls() {
    root.classList.add("show-controls");
    clearTimeout(hideTimer);
    if (!video.paused) {
      hideTimer = setTimeout(() => {
        if (!video.paused && !scrubbing && !volDragging && rateMenu.hidden)
          root.classList.remove("show-controls");
      }, 2500);
    }
  }
  function keepControls() {
    root.classList.add("show-controls");
    clearTimeout(hideTimer);
  }

  // ---- play/pause ----
  function togglePlay() {
    if (video.paused) {
      claimPlayback(video);
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }
  function syncPlayIcon() {
    const icon = video.paused ? ICONS.play : ICONS.pause;
    playBtn.innerHTML = icon;
    bigPlay.innerHTML = video.paused ? ICONS.play : ICONS.pause;
    playBtn.setAttribute("aria-label", video.paused ? "播放" : "暂停");
    root.classList.toggle("paused", video.paused);
  }

  // ---- volume ----
  function setVolume(v, { unmute = true } = {}) {
    v = Math.min(1, Math.max(0, Number(v) || 0));
    video.volume = v;
    if (v > 0.001) {
      lastVolume = v;
      if (unmute) video.muted = false;
    } else {
      video.muted = true;
    }
    paintVolume();
    syncMuteIcon();
  }

  function paintVolume() {
    const effective = video.muted ? 0 : video.volume;
    const pct = Math.round(effective * 100);
    volFill.style.width = pct + "%";
    volKnob.style.left = pct + "%";
    volRail.setAttribute("aria-valuenow", String(pct));
  }

  function syncMuteIcon() {
    const off = video.muted || video.volume === 0;
    muteBtn.innerHTML = off ? ICONS.mute : ICONS.volume;
    muteBtn.setAttribute("aria-label", off ? "取消静音" : "静音");
    paintVolume();
  }

  function toggleMute() {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = lastVolume > 0.01 ? lastVolume : 1;
    } else {
      if (video.volume > 0.01) lastVolume = video.volume;
      video.muted = true;
    }
    syncMuteIcon();
  }

  function volPctFromEvent(e) {
    const rect = volRail.getBoundingClientRect();
    const x = (e.clientX ?? 0) - rect.left;
    return Math.min(1, Math.max(0, x / Math.max(1, rect.width)));
  }

  function onVolDown(e) {
    if (e.button != null && e.button !== 0) return;
    volDragging = true;
    keepControls();
    try { volRail.setPointerCapture(e.pointerId); } catch {}
    setVolume(volPctFromEvent(e));
    e.preventDefault();
    e.stopPropagation();
  }
  function onVolMove(e) {
    if (!volDragging) return;
    setVolume(volPctFromEvent(e));
    e.preventDefault();
  }
  function onVolUp(e) {
    if (!volDragging) return;
    volDragging = false;
    try { volRail.releasePointerCapture(e.pointerId); } catch {}
    showControls();
  }

  // ---- rate (free continuous 0.25×–3×) ----
  function clampRate(v) {
    let n = Number(v);
    if (!Number.isFinite(n)) n = 1;
    n = Math.min(RATE_MAX, Math.max(RATE_MIN, n));
    // snap to step to avoid float junk like 1.0000002
    n = Math.round(n / RATE_STEP) * RATE_STEP;
    return Math.round(n * 100) / 100;
  }

  function formatRate(r) {
    const n = clampRate(r);
    // strip trailing zeros: 1 → 1, 1.5 → 1.5, 1.25 → 1.25
    const s = Number.isInteger(n) ? String(n) : String(n);
    return s + "×";
  }

  function formatRateValue(r) {
    const n = clampRate(r);
    return Number.isInteger(n) ? String(n) : String(n);
  }

  function syncRateUI() {
    const label = formatRate(desiredRate);
    rateBtn.textContent = label;
    if (rateSlider) rateSlider.value = String(desiredRate);
    if (rateInput) rateInput.value = formatRateValue(desiredRate);
    if (ratePresets) {
      ratePresets.querySelectorAll(".pl-rate-opt").forEach((btn) => {
        const on = Math.abs(Number(btn.dataset.rate) - desiredRate) < 0.001;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  }

  function applyRate(r, { close = false, toast = false } = {}) {
    desiredRate = clampRate(r);
    try { video.playbackRate = desiredRate; } catch {}
    syncRateUI();
    if (toast) flashToast(formatRate(desiredRate));
    if (close) closeRateMenu();
  }

  function openRateMenu() {
    rateMenu.hidden = false;
    rateBtn.setAttribute("aria-expanded", "true");
    rateWrap.classList.add("open");
    syncRateUI();
    keepControls();
    // focus slider for keyboard tweak
    try { rateSlider?.focus({ preventScroll: true }); } catch {}
  }
  function closeRateMenu() {
    rateMenu.hidden = true;
    rateBtn.setAttribute("aria-expanded", "false");
    rateWrap.classList.remove("open");
  }
  function toggleRateMenu(e) {
    e?.stopPropagation?.();
    if (rateMenu.hidden) openRateMenu();
    else closeRateMenu();
  }
  function nudgeRate(delta) {
    applyRate((desiredRate || 1) + delta, { close: false });
  }

  // ---- size / theater / system fullscreen ----
  function isFs() {
    const elFs = document.fullscreenElement || document.webkitFullscreenElement;
    return elFs === card || elFs === document.documentElement || elFs === document.body;
  }

  function clampPlayerHeight(h) {
    const minH = 200;
    const maxH = Math.max(minH, Math.floor(window.innerHeight * 0.92));
    return Math.min(maxH, Math.max(minH, Math.round(h)));
  }

  function applyPlayerHeight(h, { persist = true } = {}) {
    if (h == null) {
      root.style.removeProperty("--pl-h");
      root.classList.remove("sized");
      if (persist) {
        try { localStorage.removeItem(PLAYER_SIZE_KEY); } catch {}
      }
      return;
    }
    const v = clampPlayerHeight(h);
    root.style.setProperty("--pl-h", v + "px");
    root.classList.add("sized");
    if (persist) writeStoredHeight(v);
  }

  function setTheater(on, { persist = true } = {}) {
    theaterOn = !!on;
    document.documentElement.classList.toggle("theater-mode", theaterOn);
    document.body.classList.toggle("theater-mode", theaterOn);
    card.classList.toggle("theater", theaterOn);
    root.classList.toggle("theater", theaterOn);
    theaterBtn.innerHTML = theaterOn ? ICONS.theaterOff : ICONS.theater;
    theaterBtn.setAttribute("aria-label", theaterOn ? "退出网页全屏" : "网页全屏");
    theaterBtn.setAttribute("aria-pressed", theaterOn ? "true" : "false");
    theaterBtn.title = theaterOn ? "退出网页全屏" : "网页全屏";
    if (persist) writeTheaterPref(theaterOn);
    // In theater, default to filling most of the viewport if no custom height yet
    if (theaterOn && !root.classList.contains("sized")) {
      applyPlayerHeight(Math.floor(window.innerHeight * 0.78), { persist: false });
    }
    showControls();
  }

  function toggleTheater() {
    // Exit system fullscreen first so theater layout is visible
    if (isFs()) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
    setTheater(!theaterOn);
  }

  async function toggleFs() {
    try {
      if (isFs()) {
        await (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      } else {
        // Prefer full document (website fullscreen), fallback to player card
        const target = document.documentElement;
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        } else if (target.webkitRequestFullscreen) {
          target.webkitRequestFullscreen();
        } else if (card.requestFullscreen) {
          await card.requestFullscreen();
        } else if (card.webkitRequestFullscreen) {
          card.webkitRequestFullscreen();
        } else if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        }
        // Pair with theater chrome for best fill
        if (!theaterOn) setTheater(true, { persist: false });
      }
    } catch {}
    syncFsIcon();
    showControls();
  }

  function syncFsIcon() {
    const on = isFs();
    fsBtn.innerHTML = on ? ICONS.exitFs : ICONS.enterFs;
    fsBtn.setAttribute("aria-label", on ? "退出系统全屏" : "系统全屏");
    fsBtn.title = on ? "退出系统全屏" : "系统全屏";
    card.classList.toggle("is-fs", on);
    root.classList.toggle("is-fs", on);
  }

  // Drag resize handle (free height)
  function onResizeDown(e) {
    if (e.button != null && e.button !== 0) return;
    resizing = true;
    keepControls();
    root.classList.add("resizing");
    try { resizeHandle.setPointerCapture(e.pointerId); } catch {}
    const startY = e.clientY;
    const startH = root.getBoundingClientRect().height;
    const move = (ev) => {
      if (!resizing) return;
      const next = clampPlayerHeight(startH + (ev.clientY - startY));
      applyPlayerHeight(next, { persist: false });
    };
    const up = (ev) => {
      if (!resizing) return;
      resizing = false;
      root.classList.remove("resizing");
      try { resizeHandle.releasePointerCapture(ev.pointerId); } catch {}
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const h = root.getBoundingClientRect().height;
      applyPlayerHeight(h, { persist: true });
      showControls();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    e.preventDefault();
    e.stopPropagation();
  }

  function onResizeKey(e) {
    const cur = root.getBoundingClientRect().height;
    if (e.key === "ArrowUp") {
      applyPlayerHeight(cur - 24); e.preventDefault();
    } else if (e.key === "ArrowDown") {
      applyPlayerHeight(cur + 24); e.preventDefault();
    } else if (e.key === "Home") {
      applyPlayerHeight(null); e.preventDefault(); // reset auto
    } else if (e.key === "End") {
      applyPlayerHeight(window.innerHeight * 0.9); e.preventDefault();
    }
  }

  // ---- scrubber ----
  function pctFromEvent(e) {
    const rect = scrub.getBoundingClientRect();
    const x = (e.clientX ?? 0) - rect.left;
    return Math.min(1, Math.max(0, x / rect.width));
  }
  function paintProgress() {
    const d = video.duration || 0;
    const pct = d ? (video.currentTime / d) * 100 : 0;
    played.style.width = pct + "%";
    knob.style.left = pct + "%";
    scrub.setAttribute("aria-valuenow", String(Math.round(pct)));
  }
  function paintBuffered() {
    const d = video.duration || 0;
    if (!d || !video.buffered.length) { buffered.style.width = "0%"; return; }
    let end = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime) end = video.buffered.end(i);
    }
    buffered.style.width = Math.min(100, (end / d) * 100) + "%";
  }
  function showTip(pct) {
    const d = video.duration || 0;
    tip.hidden = false;
    tip.textContent = fmtTime(pct * d);
    tip.style.left = pct * 100 + "%";
  }

  function onScrubDown(e) {
    if (e.button != null && e.button !== 0) return;
    scrubbing = true;
    wasPlaying = !video.paused;
    keepControls();
    scrub.classList.add("active");
    try { scrub.setPointerCapture(e.pointerId); } catch {}
    const pct = pctFromEvent(e);
    seekTo(pct);
    showTip(pct);
    e.preventDefault();
  }
  function onScrubMove(e) {
    if (!scrubbing) return;
    const pct = pctFromEvent(e);
    seekTo(pct);
    showTip(pct);
  }
  function onScrubUp(e) {
    if (!scrubbing) return;
    scrubbing = false;
    scrub.classList.remove("active");
    tip.hidden = true;
    try { scrub.releasePointerCapture(e.pointerId); } catch {}
    if (wasPlaying) video.play().catch(() => {});
    showControls();
  }
  function seekTo(pct) {
    const d = video.duration || 0;
    if (d) video.currentTime = pct * d;
    played.style.width = pct * 100 + "%";
    knob.style.left = pct * 100 + "%";
    curEl.textContent = fmtTime(pct * d);
  }

  // ---- keyboard ----
  function onKey(e) {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    let handled = true;
    switch (e.key) {
      case " ": case "k": case "K": togglePlay(); break;
      case "ArrowRight": video.currentTime = Math.min((video.duration || 0), video.currentTime + 5); break;
      case "ArrowLeft": video.currentTime = Math.max(0, video.currentTime - 5); break;
      case "ArrowUp": setVolume((video.muted ? 0 : video.volume) + 0.1); break;
      case "ArrowDown": setVolume((video.muted ? 0 : video.volume) - 0.1); break;
      case "f": case "F": toggleFs(); break;
      case "t": case "T": toggleTheater(); break;
      case "m": case "M": toggleMute(); break;
      case "[": nudgeRate(-RATE_STEP); break;
      case "]": nudgeRate(RATE_STEP); break;
      case "{": nudgeRate(-0.25); break;
      case "}": nudgeRate(0.25); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); showControls(); }
  }
  const hovered = () => root.matches(":hover") || isFs();

  // ---- toast ----
  let toastTimer = null;
  function flashToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => { if (!destroyed) toast.hidden = true; }, 300);
    }, 1600);
  }

  // ---- event wiring ----
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  };
  const listeners = [];

  on(video, "play", () => { claimPlayback(video); syncPlayIcon(); showControls(); });
  on(video, "pause", () => { syncPlayIcon(); keepControls(); });
  on(video, "timeupdate", () => {
    if (video.currentTime > 0.05) notePlayback();
    else hideSpinner();
    if (!scrubbing) { paintProgress(); curEl.textContent = fmtTime(video.currentTime); }
  });
  on(video, "progress", paintBuffered);
  on(video, "loadedmetadata", () => { durEl.textContent = fmtTime(video.duration); paintProgress(); });
  on(video, "durationchange", () => { durEl.textContent = fmtTime(video.duration); });
  // Stall spinner: only after real wait, never permanently
  on(video, "waiting", () => {
    if (!errorEl.hidden) return;
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (destroyed || !errorEl.hidden) return;
      // still not advancing?
      if (video.readyState < 3 && video.paused === false) showSpinner();
    }, 450);
  });
  on(video, "playing", () => {
    notePlayback();
    if (Math.abs((video.playbackRate || 1) - desiredRate) > 0.01) {
      try { video.playbackRate = desiredRate; } catch {}
    }
  });
  on(video, "canplay", () => { hideSpinner(); if (hasPlayback) clearError(); });
  on(video, "canplaythrough", hideSpinner);
  on(video, "loadeddata", hideSpinner);
  on(video, "seeked", hideSpinner);
  on(video, "volumechange", syncMuteIcon);
  on(video, "error", () => {
    // Native error often fires during HLS teardown/reload — ignore if playing or reloading
    if (hasPlayback) return;
    if (video.error && video.networkState === video.NETWORK_NO_SOURCE && !video.src && !hls) return;
    // Debounce: only show if still failed shortly after
    const token = loadToken;
    setTimeout(() => {
      if (destroyed || token !== loadToken || hasPlayback) return;
      if (video.error) showError(true);
    }, 400);
  });
  on(video, "ended", () => {
    syncPlayIcon();
    keepControls();
    if (index < sources.length - 1) {
      flashToast("下一段");
      setTimeout(() => { if (!destroyed) switchPart(index + 1, true); }, 700);
    }
  });

  on(bigPlay, "click", (e) => { e.stopPropagation(); togglePlay(); });
  on(playBtn, "click", (e) => { e.stopPropagation(); togglePlay(); });
  on(muteBtn, "click", (e) => { e.stopPropagation(); toggleMute(); });
  on(rateBtn, "click", (e) => {
    e.stopPropagation();
    toggleRateMenu(e);
  });
  on(rateMenu, "click", (e) => e.stopPropagation());
  on(rateMenu, "pointerdown", (e) => e.stopPropagation());
  on(rateSlider, "input", () => {
    applyRate(rateSlider.value, { close: false });
    keepControls();
  });
  on(rateSlider, "change", () => {
    applyRate(rateSlider.value, { close: false, toast: true });
  });
  on(rateInput, "input", () => {
    // live preview while typing number
    const v = Number(rateInput.value);
    if (Number.isFinite(v)) applyRate(v, { close: false });
  });
  on(rateInput, "change", () => {
    applyRate(rateInput.value, { close: false, toast: true });
  });
  on(rateInput, "keydown", (e) => {
    if (e.key === "Enter") {
      applyRate(rateInput.value, { close: true, toast: true });
      e.preventDefault();
    }
    if (e.key === "Escape") {
      closeRateMenu();
      e.preventDefault();
    }
    e.stopPropagation();
  });
  on(rateMinus, "click", (e) => {
    e.stopPropagation();
    nudgeRate(-RATE_STEP);
  });
  on(ratePlus, "click", (e) => {
    e.stopPropagation();
    nudgeRate(RATE_STEP);
  });
  on(ratePresets, "click", (e) => {
    e.stopPropagation();
    const opt = e.target.closest(".pl-rate-opt");
    if (!opt) return;
    applyRate(opt.dataset.rate, { close: false, toast: true });
  });
  on(volRail, "pointerdown", onVolDown);
  on(volRail, "pointermove", onVolMove);
  on(volRail, "pointerup", onVolUp);
  on(volRail, "pointercancel", onVolUp);
  on(volRail, "click", (e) => e.stopPropagation());
  on(volRail, "keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      setVolume((video.muted ? 0 : video.volume) - 0.05); e.preventDefault();
    }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      setVolume((video.muted ? 0 : video.volume) + 0.05); e.preventDefault();
    }
  });
  on(document, "pointerdown", (e) => {
    if (!rateMenu.hidden && !rateWrap.contains(e.target)) closeRateMenu();
  });
  on(fsBtn, "click", (e) => { e.stopPropagation(); toggleFs(); });
  on(theaterBtn, "click", (e) => { e.stopPropagation(); toggleTheater(); });
  on(resizeHandle, "pointerdown", onResizeDown);
  on(resizeHandle, "click", (e) => e.stopPropagation());
  on(resizeHandle, "dblclick", (e) => {
    e.stopPropagation();
    // double-click handle resets to auto height
    applyPlayerHeight(null);
    flashToast("恢复默认高度");
  });
  on(resizeHandle, "keydown", onResizeKey);
  on(window, "resize", () => {
    if (!root.classList.contains("sized")) return;
    const cur = parseFloat(getComputedStyle(root).getPropertyValue("--pl-h")) || root.getBoundingClientRect().height;
    applyPlayerHeight(cur, { persist: true });
  });
  on(retryBtn, "click", () => {
    clearError();
    showSpinner();
    loadSource(index);
    video.play().catch(() => {});
  });
  on(errorEl, "click", (e) => {
    if (e.target === retryBtn || retryBtn.contains(e.target)) return;
    // Tap empty error area: dismiss if already playing
    if (hasPlayback || !video.paused) clearError();
  });


  on(tapLayer, "click", togglePlay);
  on(root, "pointermove", showControls);
  on(root, "pointerleave", () => { if (!video.paused && !scrubbing) root.classList.remove("show-controls"); });

  on(scrub, "pointerdown", onScrubDown);
  on(scrub, "pointermove", onScrubMove);
  on(scrub, "pointerup", onScrubUp);
  on(scrub, "pointercancel", onScrubUp);
  on(scrub, "keydown", (e) => {
    if (e.key === "ArrowLeft") { video.currentTime = Math.max(0, video.currentTime - 5); e.preventDefault(); }
    if (e.key === "ArrowRight") { video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); e.preventDefault(); }
  });

  const keyHandler = (e) => { if (hovered()) onKey(e); };
  on(document, "keydown", keyHandler);
  const fsHandler = () => { syncFsIcon(); showControls(); };
  on(document, "fullscreenchange", fsHandler);
  on(document, "webkitfullscreenchange", fsHandler);

  // ---- init ----
  lastVolume = video.volume || 1;
  desiredRate = 1;
  syncPlayIcon();
  syncMuteIcon();
  paintVolume();
  applyRate(1, { close: true });
  syncFsIcon();
  {
    const savedH = readStoredHeight();
    if (savedH) applyPlayerHeight(savedH, { persist: false });
    if (readTheaterPref()) setTheater(true, { persist: false });
    else setTheater(false, { persist: false });
  }
  loadSource(index);
  keepControls();

  return {
    video,
    hls: () => hls,
    destroy() {
      destroyed = true;
      clearTimeout(hideTimer);
      clearTimeout(toastTimer);
      clearTimeout(stallTimer);
      for (const [t, ty, fn, o] of listeners) {
        try { t.removeEventListener(ty, fn, o); } catch {}
      }
      try { if (hls) hls.destroy(); } catch {}
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {}
      if (playingVideo === video) playingVideo = null;
      // leave page chrome clean when leaving post
      document.documentElement.classList.remove("theater-mode");
      document.body.classList.remove("theater-mode");
    },
  };
}

async function renderPost(id) {
  setState(loadingHtml());
  renderCats("");
  try {
    const data = await api(`/api/post/${encodeURIComponent(id)}`);
    const chips = (data.categories || [])
      .map(
        (c) =>
          `<span class="chip"><a href="#/c/${c.slug}">${escapeHtml(c.name)}</a></span>`
      )
      .join("");
    const videos = data.videos || [];
    const partsStrip =
      videos.length > 1
        ? `<div class="player-parts">${videos
            .map(
              (v, i) =>
                `<button class="pl-part${i === 0 ? " active" : ""}" data-i="${i}" title="${escapeHtml(v.title || `第 ${i + 1} 段`)}">${i + 1}</button>`
            )
            .join("")}</div>`
        : "";
    const playersBlock = videos.length
      ? `
      <div class="player-card">
        <div class="ptitle">${escapeHtml(videos[0].title || "视频")}</div>
        <div class="player-shell">
          <video playsinline preload="metadata" webkit-playsinline></video>
        </div>
        ${partsStrip}
      </div>`
      : "";

    const tags = (data.tags || [])
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    setState(`
      <article class="detail enter">
        <a class="back" href="javascript:history.back()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          返回
        </a>
        <div class="detail-head">
          <h1>${escapeHtml(data.title)}</h1>
          <div class="meta-row">
            ${data.date ? `<span class="date">${escapeHtml(formatDate(data.date))}</span>` : ""}
            ${chips}
          </div>
        </div>
        ${playersBlock ? `<div class="players">${playersBlock}</div>` : ""}
        <div class="content">${data.html || "<p>无正文</p>"}</div>
        ${tags ? `<div class="tags">${tags}</div>` : ""}
      </article>
    `);

    const card = main.querySelector(".player-card");
    if (card && videos.length) {
      activePlayers.push(createPlayer(card, videos, 0));
    }

    // rewrite leftover remote images if any
    main.querySelectorAll(".content img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (src.startsWith("http")) img.src = imgUrl(src);
    });

    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  } catch (e) {
    setState(messageHtml("加载失败", e.message, true));
  }
}

async function route() {
  const r = parseHash();
  // force media-only entry
  if (!location.hash || location.hash === "#" || location.hash === "#/") {
    history.replaceState(null, "", mediaHash(r.type || "images", r.page || 1, r.q || "", r.pageSize || 48));
  }
  document.title =
    r.type === "videos"
      ? "视频表 · 媒体库"
      : r.type === "media_videos"
        ? "帖子视频 · 媒体库"
        : "图片 · 媒体库";
  if (searchInput) {
    searchInput.value = r.q || "";
    toggleSearchClear();
  }
  return renderMedia(r);
}

/* =========================================================
   Media library (exported DB images / videos)
   ========================================================= */

function mediaHash(type, page, q, pageSize) {
  const ps = new URLSearchParams();
  if (page > 1) ps.set("p", String(page));
  if (q) ps.set("q", q);
  if (pageSize && pageSize !== 48) ps.set("ps", String(pageSize));
  const qs = ps.toString();
  return `#/media/${type || "images"}${qs ? `?${qs}` : ""}`;
}

function fmtDur(sec) {
  sec = Number(sec) || 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function mediaThumbCandidates(it) {
  const out = [];
  const push = (u) => {
    if (!u) return;
    const v = u.startsWith("/api/") ? u : imgUrl(u);
    if (v && !out.includes(v)) out.push(v);
  };
  if (it.kind === "video") {
    push(it.cover_proxy);
    push(it.cover);
    push(it.thumb);
    (it.cdn_urls || []).forEach(push);
  } else {
    push(it.proxy);
    push(it.url);
    push(it.thumb);
    push(it.cover);
    (it.cdn_urls || []).forEach(push);
  }
  return out;
}

function mediaCardHtml(it) {
  const isVideo = it.kind === "video";
  const cands = mediaThumbCandidates(it);
  const title = it.name || it.title || it.path || `#${it.id}`;
  const badge = isVideo
    ? `视频 ${fmtDur(it.duration)}`
    : `图片 ${it.w || "?"}×${it.h || "?"}`;
  const payload = encodeURIComponent(
    JSON.stringify({
      kind: it.kind,
      id: it.id,
      name: title,
      path: it.path,
      play_url: it.play_url || "",
      cover: it.cover || "",
      url: it.url || "",
      proxy: it.proxy || "",
      cover_proxy: it.cover_proxy || "",
      cdn_urls: it.cdn_urls || [],
    })
  );
  const first = cands[0] || "";
  return `
    <button type="button" class="card media-card" data-media="${payload}">
      <div class="card-cover${isVideo ? " is-video" : ""}">
        ${
          first
            ? `<img class="media-thumb" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${escapeHtml(first)}" data-cands="${escapeHtml(cands.join("|"))}" />`
            : `<div class="media-ph">无图</div>`
        }
        <span class="media-badge">${escapeHtml(badge)}</span>
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-meta path-meta">${escapeHtml(it.path || "")}</div>
      </div>
    </button>`;
}

async function renderMedia(route) {
  setState(loadingHtml());
  const type = route.type || "images";
  const page = route.page || 1;
  const q = route.q || "";
  const pageSize = route.pageSize || 48;
  renderCats(type);
  try {
    const [meta, data] = await Promise.all([
      api("/api/media/meta"),
      api(
        `/api/media/list?type=${encodeURIComponent(type)}&page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}`
      ),
    ]);

    // refresh top chips with counts
    const countMap = {
      images: meta.counts?.post_media_images,
      videos: meta.counts?.videos_table,
      media_videos: meta.counts?.post_media_videos,
    };
    catsEl.innerHTML = MEDIA_TABS.map((t) => {
      const n = countMap[t.type];
      const active = type === t.type ? "active" : "";
      const label = n != null ? `${t.name} · ${n}` : t.name;
      return `<a class="cat ${active}" href="${mediaHash(t.type, 1, q, pageSize)}">${label}</a>`;
    }).join("");

    const grid = (data.items || []).map(mediaCardHtml).join("");
    const pages = data.pages || 1;
    const prevHref = page > 1 ? mediaHash(type, page - 1, q, pageSize) : "";
    const nextHref = page < pages ? mediaHash(type, page + 1, q, pageSize) : "";
    const typeLabel =
      type === "videos" ? "视频表" : type === "media_videos" ? "帖子视频" : "图片";

    setState(`
      <section class="media-page enter">
        <div class="media-toolbar">
          <span class="media-count">${escapeHtml(typeLabel)} · 共 ${data.total || 0} 条 · 第 ${page}/${pages} 页</span>
        </div>
        ${
          grid
            ? `<div class="grid media-grid">${grid}</div>`
            : messageHtml("没有内容", "换个关键词或类型试试", false)
        }
        <div class="pager">
          <button class="pager-nav" ${page <= 1 ? "disabled" : ""} data-href="${prevHref}">上一页</button>
          <button class="pager-page" disabled>第 ${page} 页</button>
          <button class="pager-nav" ${page >= pages ? "disabled" : ""} data-href="${nextHref}">下一页</button>
        </div>
      </section>
      <div class="media-modal" id="mediaModal" hidden>
        <div class="media-modal-box">
          <div class="media-modal-head">
            <strong id="mediaModalTitle">预览</strong>
            <button type="button" class="media-modal-close" id="mediaModalClose">关闭</button>
          </div>
          <div class="media-modal-body" id="mediaModalBody"></div>
          <div class="media-modal-links" id="mediaModalLinks"></div>
          <div class="media-modal-err" id="mediaModalErr"></div>
        </div>
      </div>
    `);

    bindPager();
    bindMediaPage(route);
  } catch (e) {
    setState(messageHtml("媒体库加载失败", e.message, true));
  }
}

function bindMediaPage(route) {
  const form = document.getElementById("mediaSearchForm");
  const input = document.getElementById("mediaSearchInput");
  if (form && input) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      location.hash = mediaHash(route.type || "images", 1, input.value.trim(), route.pageSize || 48);
    });
  }

  main.querySelectorAll(".media-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      try {
        const raw = btn.getAttribute("data-media") || "%7B%7D";
        openMediaItem(JSON.parse(decodeURIComponent(raw)));
      } catch (e) {
        console.error(e);
      }
    });
    const img = btn.querySelector("img.media-thumb");
    if (img) {
      const list = (img.dataset.cands || "").split("|").filter(Boolean);
      let i = 0;
      img.onerror = () => {
        i += 1;
        if (i < list.length) img.src = list[i];
        else {
          img.style.display = "none";
          const ph = document.createElement("div");
          ph.className = "media-ph";
          ph.textContent = "无图";
          img.parentElement?.insertBefore(ph, img);
        }
      };
    }
  });

  const modal = document.getElementById("mediaModal");
  const closeBtn = document.getElementById("mediaModalClose");
  if (closeBtn) closeBtn.addEventListener("click", closeMediaModal);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeMediaModal();
    });
  }
}

let mediaHls = null;
function closeMediaModal() {
  const modal = document.getElementById("mediaModal");
  if (modal) modal.hidden = true;
  if (mediaHls) {
    try {
      mediaHls.destroy();
    } catch {}
    mediaHls = null;
  }
  const body = document.getElementById("mediaModalBody");
  if (body) body.innerHTML = "";
  destroyPlayers();
}

function openMediaItem(it) {
  const modal = document.getElementById("mediaModal");
  const title = document.getElementById("mediaModalTitle");
  const body = document.getElementById("mediaModalBody");
  const links = document.getElementById("mediaModalLinks");
  const err = document.getElementById("mediaModalErr");
  if (!modal || !body) return;
  if (mediaHls) {
    try {
      mediaHls.destroy();
    } catch {}
    mediaHls = null;
  }
  if (title) title.textContent = it.name || it.path || `#${it.id}`;
  if (err) err.textContent = "";
  body.innerHTML = "";
  links.innerHTML = "";

  if (it.kind === "video") {
    const play = it.play_url || "";
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.className = "media-preview-video";
    body.appendChild(video);
    if (play.includes(".m3u8") && window.Hls && Hls.isSupported()) {
      mediaHls = new Hls({ enableWorker: true });
      mediaHls.loadSource(play);
      mediaHls.attachMedia(video);
      mediaHls.on(Hls.Events.ERROR, (_, data) => {
        if (err) {
          err.textContent =
            "播放失败（可能 CDN 校验 IP/UA 或签名过期）：" +
            (data?.details || data?.type || "");
        }
      });
    } else if (play) {
      video.src = play;
    }
    links.innerHTML = `
      <div>path: <code>${escapeHtml(it.path || "")}</code></div>
      ${play ? `<div>play: <a href="${escapeHtml(play)}" target="_blank" rel="noreferrer">打开直链</a></div>` : ""}
      ${it.cover ? `<div>cover: <a href="${escapeHtml(it.cover_proxy || imgUrl(it.cover))}" target="_blank" rel="noreferrer">封面</a></div>` : ""}
    `;
  } else {
    const src = it.proxy || (it.url ? imgUrl(it.url) : "");
    body.innerHTML = `<img class="media-preview-img" alt="" src="${escapeHtml(src)}" referrerpolicy="no-referrer" />`;
    const img = body.querySelector("img");
    if (img && Array.isArray(it.cdn_urls) && it.cdn_urls.length) {
      let i = 0;
      const list = it.cdn_urls.map((u) => imgUrl(u));
      img.onerror = () => {
        i += 1;
        if (i < list.length) img.src = list[i];
        else if (err) err.textContent = "图片加载失败";
      };
    }
    links.innerHTML = `
      <div>path: <code>${escapeHtml(it.path || "")}</code></div>
      ${src ? `<div>url: <a href="${escapeHtml(src)}" target="_blank" rel="noreferrer">打开图片</a></div>` : ""}
    `;
  }
  modal.hidden = false;
}

/* ---------------- Search field affordances ---------------- */

function toggleSearchClear() {
  if (!searchClear) return;
  searchClear.hidden = !searchInput.value;
}

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  const r = parseHash();
  searchInput.blur();
  location.hash = mediaHash(r.type || "images", 1, q, r.pageSize || 48);
});

searchInput.addEventListener("input", toggleSearchClear);

if (searchClear) {
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    toggleSearchClear();
    searchInput.focus();
  });
}

/* ---------------- Chrome behaviour: scroll edge + headroom ---------------- */

let lastScrollY = 0;
let ticking = false;

function onScroll() {
  const y = window.scrollY || window.pageYOffset || 0;

  // Scroll-edge shadow appears once content slips under the chrome.
  if (y > 4) topbar.classList.add("scrolled");
  else topbar.classList.remove("scrolled");

  // Headroom: hide on decisive scroll down, reveal on scroll up.
  const delta = y - lastScrollY;
  if (y < 80) {
    topbar.classList.remove("hidden");
  } else if (delta > 6) {
    topbar.classList.add("hidden");
  } else if (delta < -6) {
    topbar.classList.remove("hidden");
  }

  lastScrollY = y;
  ticking = false;
}

window.addEventListener(
  "scroll",
  () => {
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  },
  { passive: true }
);

window.addEventListener("hashchange", route);
route();
