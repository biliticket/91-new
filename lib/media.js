import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function resolveDataDir() {
  const candidates = [
    path.join(ROOT, "media_gallery", "data"),
    path.join(process.cwd(), "media_gallery", "data"),
    path.join(process.cwd(), "public", "media-data"),
    // Netlify function bundle layouts
    path.join(__dirname, "media_gallery", "data"),
    path.join(__dirname, "..", "media_gallery", "data"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "meta.json"))) return dir;
    } catch {
      /* ignore */
    }
  }
  return candidates[0];
}

const DATA_DIR = resolveDataDir();

const HLS_KEY = "RnOxyCIc5eDPFpJY";
const VID_CDN = "https://hls.ffxddn.cn";
const IMG_CDNS = [
  "https://imgpublic.ycomesc.live",
  "https://pic.jjlxoi.cn",
  "https://pic.uforxk.cn",
  "https://image.qzycbu.cn",
  "https://new.qzycbu.cn",
  "https://pwa.eisees.com",
];

const CHUNK = 5000;
let metaCache = null;
let videosCache = null;
let mediaVideosCache = null;
const imageChunkCache = new Map();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function getMeta() {
  if (!metaCache) {
    metaCache = readJson(path.join(DATA_DIR, "meta.json"));
    metaCache.img_cdns = IMG_CDNS;
    metaCache.img_cdn = IMG_CDNS[0];
    metaCache.vid_cdn = VID_CDN;
  }
  return metaCache;
}

function getVideos() {
  if (!videosCache) videosCache = readJson(path.join(DATA_DIR, "videos.json"));
  return videosCache;
}

function getMediaVideos() {
  if (!mediaVideosCache) {
    mediaVideosCache = readJson(path.join(DATA_DIR, "media_videos.json"));
  }
  return mediaVideosCache;
}

function getImageChunk(idx) {
  if (imageChunkCache.has(idx)) return imageChunkCache.get(idx);
  const file = path.join(DATA_DIR, `images_${String(idx).padStart(3, "0")}.json`);
  if (!fs.existsSync(file)) return [];
  const arr = readJson(file);
  imageChunkCache.set(idx, arr);
  return arr;
}

function fileName(p) {
  if (!p) return "";
  const s = String(p).split("?")[0];
  const parts = s.split("/").filter(Boolean);
  try {
    return decodeURIComponent(parts[parts.length - 1] || s);
  } catch {
    return parts[parts.length - 1] || s;
  }
}

function pathOnly(u) {
  if (!u) return "";
  let s = String(u);
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      s = new URL(s).pathname;
    } catch {
      /* keep */
    }
  }
  if (s && !s.startsWith("/")) s = `/${s}`;
  return s;
}

export function signVideo(rawPath, v = "3", t1 = "0") {
  let p = pathOnly(rawPath);
  if (!p) return "";
  const timeNow = Math.floor(Date.now() / 1000);
  const rand = crypto.createHash("md5").update(`${p}${timeNow}`).digest("hex").slice(0, 13);
  const uid = v === "3" ? t1 : "0";
  const data = `${p}-${timeNow}-${rand}-${uid}-${HLS_KEY}`;
  const sign = crypto.createHash("md5").update(data).digest("hex");
  return `${VID_CDN}${p}?auth_key=${timeNow}-${rand}-${uid}-${sign}&v=${v}&time=${t1}`;
}

function enrichImage(it) {
  const p = pathOnly(it.path || it.cover_path || "");
  const name = it.name || it.title || fileName(p) || `#${it.id}`;
  const cdn_urls = p ? IMG_CDNS.map((b) => b + p) : it.cdn_urls || [];
  const direct = cdn_urls[0] || it.url || it.thumb || it.cover || "";
  return {
    id: it.id,
    kind: "image",
    name,
    title: name,
    path: p,
    w: it.w || 0,
    h: it.h || 0,
    pid: it.pid,
    created: it.created || "",
    url: direct,
    thumb: direct,
    cover: direct,
    cdn_urls,
    // Clean app image proxy (handles hotlink / decrypt when needed)
    proxy: direct ? `/api/img?url=${encodeURIComponent(direct)}` : "",
  };
}

function enrichVideo(it) {
  const p = pathOnly(it.path || "");
  const name =
    it.name ||
    it.title ||
    fileName(p) ||
    fileName(it.cover_path) ||
    `#${it.id}`;
  // strip hacked titles
  const cleanName = /hacked by dimples|dimples#1337/i.test(name)
    ? fileName(p) || fileName(it.cover_path) || `#${it.id}`
    : name;
  const coverPath = pathOnly(it.cover_path || it.cover || "");
  const coverUrls = coverPath ? IMG_CDNS.map((b) => b + coverPath) : it.cdn_urls || [];
  const cover = coverUrls[0] || it.cover || "";
  const play = signVideo(p);
  return {
    id: it.id,
    kind: "video",
    name: cleanName,
    title: cleanName,
    path: p,
    duration: it.duration || 0,
    play_count: it.play_count || 0,
    pid: it.pid,
    sources: it.sources || {},
    cover_path: coverPath,
    cover,
    thumb: cover,
    cdn_urls: coverUrls,
    cover_proxy: cover ? `/api/img?url=${encodeURIComponent(cover)}` : "",
    play_url: play,
    play_proxy: play ? `/api/proxy?url=${encodeURIComponent(play)}` : "",
  };
}

function matchQ(it, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    String(it.id).includes(s) ||
    String(it.pid || "").includes(s) ||
    String(it.name || "").toLowerCase().includes(s) ||
    String(it.title || "").toLowerCase().includes(s) ||
    String(it.path || "").toLowerCase().includes(s)
  );
}

export function mediaMeta() {
  const m = getMeta();
  return {
    ok: true,
    exported_at: m.exported_at,
    img_cdn: IMG_CDNS[0],
    img_cdns: IMG_CDNS,
    vid_cdn: VID_CDN,
    counts: m.counts,
  };
}

export function listMedia({ type = "images", page = 1, pageSize = 48, q = "" } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(200, Math.max(12, Number(pageSize) || 48));
  const query = String(q || "").trim();

  if (type === "videos") {
    let arr = getVideos().map(enrichVideo);
    if (query) arr = arr.filter((it) => matchQ(it, query));
    const total = arr.length;
    const start = (p - 1) * ps;
    return {
      type,
      page: p,
      pageSize: ps,
      total,
      pages: Math.max(1, Math.ceil(total / ps)),
      items: arr.slice(start, start + ps),
    };
  }

  if (type === "media_videos") {
    let arr = getMediaVideos().map(enrichVideo);
    if (query) arr = arr.filter((it) => matchQ(it, query));
    const total = arr.length;
    const start = (p - 1) * ps;
    return {
      type,
      page: p,
      pageSize: ps,
      total,
      pages: Math.max(1, Math.ceil(total / ps)),
      items: arr.slice(start, start + ps),
    };
  }

  // images
  const meta = getMeta();
  const totalAll = meta.counts?.post_media_images || 0;
  if (!query) {
    const start = (p - 1) * ps;
    const items = [];
    for (let i = start; i < start + ps && i < totalAll; i++) {
      const cidx = Math.floor(i / CHUNK);
      const local = i % CHUNK;
      const chunk = getImageChunk(cidx);
      if (chunk[local]) items.push(enrichImage(chunk[local]));
    }
    return {
      type: "images",
      page: p,
      pageSize: ps,
      total: totalAll,
      pages: Math.max(1, Math.ceil(totalAll / ps)),
      items,
    };
  }

  // search images: scan chunks (cached in memory after first pass)
  const nChunks = meta.image_chunks?.length || Math.ceil(totalAll / CHUNK);
  let filtered = [];
  for (let c = 0; c < nChunks; c++) {
    const chunk = getImageChunk(c);
    for (const it of chunk) {
      const en = enrichImage(it);
      if (matchQ(en, query)) filtered.push(en);
    }
  }
  const total = filtered.length;
  const start = (p - 1) * ps;
  return {
    type: "images",
    page: p,
    pageSize: ps,
    total,
    pages: Math.max(1, Math.ceil(total / ps)),
    items: filtered.slice(start, start + ps),
  };
}

export function resignVideo(rawPath) {
  return { play_url: signVideo(rawPath), play_proxy: `/api/proxy?url=${encodeURIComponent(signVideo(rawPath))}` };
}
