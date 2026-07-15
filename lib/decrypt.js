import CryptoJS from "crypto-js";

// From site zzz.js decryptImage (after string-array rotation)
const KEY = CryptoJS.enc.Utf8.parse("f5d965df75336270");
const IV = CryptoJS.enc.Utf8.parse("97b60394abc2fbe1");

export function isEncryptedImageUrl(url = "") {
  return (
    url.includes("/new/") ||
    url.includes("/xiao/") ||
    url.includes("/upload/upload/") ||
    url.includes("/upload_01/") ||
    url.includes("/uploads/")
  );
}

/** Decrypt raw image bytes (AES-128-CBC). Returns Buffer or null. */
export function decryptImageBuffer(buf) {
  try {
    const b64 = Buffer.from(buf).toString("base64");
    const decrypted = CryptoJS.AES.decrypt(b64, KEY, {
      iv: IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const outB64 = decrypted.toString(CryptoJS.enc.Base64);
    if (!outB64) return null;
    return Buffer.from(outB64, "base64");
  } catch {
    return null;
  }
}

export function sniffMime(buf) {
  if (!buf || buf.length < 4) return "application/octet-stream";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46) return "image/webp";
  return "application/octet-stream";
}
