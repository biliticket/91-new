import fetch from "node-fetch";
import { parseListPage, parseDetailPage } from "./parse.js";
import {
  decryptImageBuffer,
  isEncryptedImageUrl,
  sniffMime,
} from "./decrypt.js";

export const UPSTREAM = (process.env.UPSTREAM || "https://www.91cg1.com").replace(
  /\/$/,
  ""
);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Upstream returns 410 when /search/<query>/ path is too long (~31 CJK chars).
const MAX_SEARCH_CHARS = 30;

const cache = new Map();
const CACHE_TTL = 60_000;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    cache.delete(key);
    return null;
  }
  return hit.val;
}

function cacheSet(key, val, ttl = CACHE_TTL) {
  cache.set(key, { val, exp: Date.now() + ttl });
}

export function normalizeSearchQuery(q) {
  let s = String(q || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return "";
  if ([...s].length > MAX_SEARCH_CHARS) {
    s = [...s].slice(0, MAX_SEARCH_CHARS).join("").trim();
  }
  return s;
}

export async function fetchText(url) {
  const cached = cacheGet(`t:${url}`);
  if (cached) return cached;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Referer: `${UPSTREAM}/`,
    },
    redirect: "follow",
    timeout: 25000,
  });
  if (!res.ok) {
    const err = new Error(`Upstream ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  cacheSet(`t:${url}`, text);
  return text;
}

export async function fetchBinary(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: `${UPSTREAM}/`,
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    },
    redirect: "follow",
    timeout: 30000,
  });
  if (!res.ok) {
    const err = new Error(`Image ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export async function getHome(page = 1) {
  page = Math.max(1, parseInt(page, 10) || 1);
  const url = page <= 1 ? `${UPSTREAM}/` : `${UPSTREAM}/page/${page}/`;
  const html = await fetchText(url);
  return { ...parseListPage(html, url), source: url };
}

export async function getCategory(slug, page = 1) {
  page = Math.max(1, parseInt(page, 10) || 1);
  slug = String(slug || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!slug) {
    const err = new Error("bad slug");
    err.status = 400;
    throw err;
  }
  const url =
    page <= 1
      ? `${UPSTREAM}/category/${slug}/`
      : `${UPSTREAM}/category/${slug}/page/${page}/`;
  const html = await fetchText(url);
  return { ...parseListPage(html, url), slug, source: url };
}

export async function getSearch(q, page = 1) {
  const original = String(q || "").trim();
  const query = normalizeSearchQuery(original);
  if (!query) {
    const err = new Error("missing q");
    err.status = 400;
    throw err;
  }
  page = Math.max(1, parseInt(page, 10) || 1);
  const enc = encodeURIComponent(query);
  let url =
    page <= 1
      ? `${UPSTREAM}/search/${enc}/`
      : `${UPSTREAM}/search/${enc}/${page}/`;

  let html;
  try {
    html = await fetchText(url);
  } catch (e) {
    // Fallback: progressively shorten on 410
    if (e.status === 410 || /Upstream 410/.test(e.message)) {
      let chars = [...query];
      let ok = false;
      while (chars.length > 4) {
        chars = chars.slice(0, Math.max(4, chars.length - 4));
        const q2 = chars.join("").trim();
        const enc2 = encodeURIComponent(q2);
        url =
          page <= 1
            ? `${UPSTREAM}/search/${enc2}/`
            : `${UPSTREAM}/search/${enc2}/${page}/`;
        try {
          html = await fetchText(url);
          ok = true;
          break;
        } catch (e2) {
          if (!(e2.status === 410 || /Upstream 410/.test(e2.message))) throw e2;
        }
      }
      if (!ok) throw e;
    } else {
      throw e;
    }
  }

  return {
    ...parseListPage(html, url),
    q: original,
    qUsed: query,
    source: url,
  };
}

export async function getPost(id) {
  id = String(id || "").replace(/\D/g, "");
  if (!id) {
    const err = new Error("bad id");
    err.status = 400;
    throw err;
  }
  const url = `${UPSTREAM}/archives/${id}/`;
  const html = await fetchText(url);
  return { ...parseDetailPage(html, id), source: url };
}

export async function getImage(rawUrl) {
  let url = String(rawUrl || "");
  if (!url) {
    const err = new Error("missing url");
    err.status = 400;
    throw err;
  }
  if (url.startsWith("//")) url = "https:" + url;
  if (url.startsWith("/")) url = UPSTREAM + url;
  if (!/^https?:\/\//i.test(url)) {
    const err = new Error("bad url");
    err.status = 400;
    throw err;
  }

  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const allowed =
    host.endsWith("uforxk.cn") ||
    host.endsWith("91cg1.com") ||
    host.endsWith("jjlxoi.cn") ||
    host.endsWith("qzycbu.cn") ||
    host.endsWith("ycomesc.live") ||
    host.endsWith("eisees.com") ||
    host.endsWith("ffxddn.cn") ||
    host.endsWith("syjiaotong.mobi") ||
    host.includes("pic.") ||
    host.includes("cdn") ||
    host.includes("image.") ||
    host.includes("img.") ||
    host.endsWith("vkjyoi.cn");
  if (!allowed) {
    const err = new Error("host not allowed");
    err.status = 403;
    throw err;
  }

  const cacheKey = `i:${url}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let buf = await fetchBinary(url);
  // Some CDNs return plaintext images; others return AES-encrypted bytes.
  // Only decrypt when the payload is not already a recognizable image.
  let mime0 = sniffMime(buf);
  if (mime0 === "application/octet-stream") {
    const dec = decryptImageBuffer(buf);
    if (dec && sniffMime(dec) !== "application/octet-stream") {
      buf = dec;
      mime0 = sniffMime(buf);
    } else if (isEncryptedImageUrl(url)) {
      // path looks encrypted but decrypt failed — keep original
    }
  }

  const mime = mime0 === "application/octet-stream" ? sniffMime(buf) : mime0;
  const out = { buf, mime };
  cacheSet(cacheKey, out, 10 * 60_000);
  return out;
}

function isMediaHostAllowed(hostname, pathname = "") {
  const h = String(hostname || "").toLowerCase();
  const p = String(pathname || "").toLowerCase();
  if (
    h.endsWith("vkjyoi.cn") ||
    h.endsWith("bgqpnx.cn") ||
    h.endsWith("uforxk.cn") ||
    h.endsWith("91cg1.com") ||
    h.endsWith("jjlxoi.cn") ||
    h.endsWith("qzycbu.cn") ||
    h.endsWith("ycomesc.live") ||
    h.endsWith("eisees.com") ||
    h.endsWith("ffxddn.cn") ||
    h.endsWith("syjiaotong.mobi") ||
    h.includes("pic.") ||
    h.includes("image.") ||
    h.includes("img.") ||
    h.includes("hls.")
  ) {
    return true;
  }
  // CDN hosts vary; allow known media extensions
  if (
    p.includes(".m3u8") ||
    p.includes(".ts") ||
    p.endsWith(".key") ||
    p.includes("crypt.key")
  ) {
    return true;
  }
  return false;
}

function absMediaUrl(ref, baseUrl, pageUrl) {
  const t = String(ref || "").trim();
  if (!t) return "";
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("//")) return "https:" + t;
  try {
    return new URL(t, baseUrl || pageUrl).href;
  } catch {
    return t;
  }
}

function proxyPath(abs) {
  return `/api/proxy?url=${encodeURIComponent(abs)}`;
}

export async function proxyMedia(rawUrl) {
  const url = String(rawUrl || "");
  if (!url || !/^https?:\/\//i.test(url)) {
    const err = new Error("bad url");
    err.status = 400;
    throw err;
  }
  const u = new URL(url);
  if (!isMediaHostAllowed(u.hostname, u.pathname)) {
    const err = new Error("host not allowed");
    err.status = 403;
    throw err;
  }

  const upstream = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: `${UPSTREAM}/`,
      Accept: "*/*",
      Origin: UPSTREAM,
    },
    redirect: "follow",
  });
  if (!upstream.ok) {
    const err = new Error("upstream error");
    err.status = upstream.status;
    throw err;
  }
  const ct = upstream.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await upstream.arrayBuffer());

  if (url.includes(".m3u8") || ct.includes("mpegurl") || ct.includes("text")) {
    const text = buf.toString("utf8");
    if (text.includes("#EXTM3U")) {
      // Directory base for relative segment paths (strip query + filename)
      const base = url.replace(/[?#].*$/, "").replace(/[^/]+$/, "");
      const rewritten = text
        .split("\n")
        .map((line) => {
          const raw = line;
          const t = line.trim();
          if (!t) return raw;

          // Rewrite AES key URI inside tag lines
          if (t.startsWith("#EXT-X-KEY:") || t.startsWith("#EXT-X-MAP:") || t.startsWith("#EXT-X-MEDIA:")) {
            return raw.replace(/URI="([^"]+)"/gi, (_m, uri) => {
              const abs = absMediaUrl(uri, base, url);
              return `URI="${proxyPath(abs)}"`;
            });
          }

          if (t.startsWith("#")) return raw;

          const abs = absMediaUrl(t, base, url);
          return proxyPath(abs);
        })
        .join("\n");
      return {
        body: rewritten,
        contentType: "application/vnd.apple.mpegurl",
      };
    }
  }

  // crypt key is 16 bytes — force binary content-type
  if (u.pathname.endsWith(".key") || u.pathname.includes("crypt.key")) {
    return { body: buf, contentType: "application/octet-stream" };
  }
  return { body: buf, contentType: ct };
}
