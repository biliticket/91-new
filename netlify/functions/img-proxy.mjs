// Minimal Netlify function — image proxy + decrypt only. No Express.
import CryptoJS from "crypto-js";
import { Blob } from "buffer";

const KEY = CryptoJS.enc.Utf8.parse("f5d965df75336270");
const IV = CryptoJS.enc.Utf8.parse("97b60394abc2fbe1");

function sniffMime(buf) {
  if (!buf || buf.length < 4) return "application/octet-stream";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46) return "image/webp";
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x00) return "video/mp4";
  return "application/octet-stream";
}

function decrypt(buf) {
  try {
    const b64 = Buffer.from(buf).toString("base64");
    const dec = CryptoJS.AES.decrypt(b64, KEY, { iv: IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
    const out = dec.toString(CryptoJS.enc.Base64);
    return out ? Buffer.from(out, "base64") : null;
  } catch {
    return null;
  }
}

function isEnc(path) {
  const p = String(path || "");
  return p.includes("/upload/") || p.includes("/upload_01/") || p.includes("/new/") || p.includes("/xiao/") || p.includes("/uploads/");
}

function allowHost(host) {
  const h = String(host || "").toLowerCase();
  return (
    h.endsWith("ycomesc.live") ||
    h.endsWith("uforxk.cn") ||
    h.endsWith("jjlxoi.cn") ||
    h.endsWith("qzycbu.cn") ||
    h.endsWith("eisees.com") ||
    h.endsWith("ffxddn.cn") ||
    h.endsWith("91cg1.com") ||
    h.includes("pic.") ||
    h.includes("img.") ||
    h.includes("image.") ||
    h.includes("cdn")
  );
}

async function fetchImage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://www.91cg1.com/",
      Accept: "image/*",
    },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function handler(event) {
  try {
    let rawUrl =
      (event.queryStringParameters && event.queryStringParameters.url) ||
      (event.multiValueQueryStringParameters && event.multiValueQueryStringParameters.url) ||
      "";
    if (Array.isArray(rawUrl)) rawUrl = rawUrl[0];
    if (!rawUrl) {
      return { statusCode: 400, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "missing url" }) };
    }

    let url = String(rawUrl);
    if (url.startsWith("//")) url = "https:" + url;
    if (!/^https?:\/\//i.test(url)) {
      return { statusCode: 400, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "bad url", url }) };
    }

    let host;
    try { host = new URL(url).hostname; } catch { return { statusCode: 400, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "invalid url" }) }; }

    if (!allowHost(host)) {
      return { statusCode: 403, headers: { "content-type": "text/plain", "access-control-allow-origin": "*" }, body: "host not allowed" };
    }

    let buf = await fetchImage(url);
    let mime = sniffMime(buf);

    // Only decrypt if the payload isn't already a valid image
    if (mime === "application/octet-stream" && isEnc(url)) {
      const dec = decrypt(buf);
      if (dec && sniffMime(dec) !== "application/octet-stream") {
        buf = dec;
        mime = sniffMime(buf);
      }
    }

    mime = mime === "application/octet-stream" ? "image/jpeg" : mime;
    return {
      statusCode: 200,
      headers: {
        "content-type": mime,
        "cache-control": "public, max-age=3600",
        "access-control-allow-origin": "*",
      },
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "content-type": "text/plain", "access-control-allow-origin": "*" },
      body: e?.message || "error",
    };
  }
}
