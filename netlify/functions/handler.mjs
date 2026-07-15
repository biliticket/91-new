import serverless from "serverless-http";
import express from "express";
import {
  getImage,
  proxyMedia,
  UPSTREAM,
} from "../../lib/upstream.js";
import { mediaMeta, listMedia, resignVideo } from "../../lib/media.js";

// Lightweight Express app for Netlify only (no static, no listen).
const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

function sendError(res, e) {
  const status = e?.status || 500;
  const p = res.req?.path || "";
  if (p.startsWith("/api/img") || p.startsWith("/api/proxy")) {
    return res.status(status).end(e?.message || "error");
  }
  return res.status(status).json({ error: e?.message || "error" });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, upstream: UPSTREAM, runtime: "netlify" });
});

app.get("/api/img", async (req, res) => {
  try {
    const { buf, mime } = await getImage(req.query.url);
    res.setHeader("Content-Type", mime || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buf);
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/api/proxy", async (req, res) => {
  try {
    const { body, contentType } = await proxyMedia(req.query.url);
    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.send(body);
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/api/media/meta", (_req, res) => {
  try {
    res.json(mediaMeta());
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/api/media/list", (req, res) => {
  try {
    res.json(
      listMedia({
        type: req.query.type || "images",
        page: req.query.page,
        pageSize: req.query.pageSize,
        q: req.query.q,
      })
    );
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/api/media/sign", (req, res) => {
  try {
    res.json(resignVideo(req.query.path || ""));
  } catch (e) {
    sendError(res, e);
  }
});

app.all("*", (req, res) => {
  res.status(404).json({ error: "not found", path: req.path });
});

const baseHandler = serverless(app, {
  binary: ["image/*", "application/octet-stream"],
});

function normalizePath(event) {
  const headers = event.headers || {};
  const candidates = [
    headers["x-forwarded-uri"],
    headers["X-Forwarded-Uri"],
    headers["x-original-uri"],
    headers["X-Original-Uri"],
    event.rawPath,
    event.path,
    event.requestContext?.http?.path,
    event.requestContext?.path,
  ].filter(Boolean);

  let path = String(candidates[0] || "/");
  path = path.split("?")[0] || "/";

  if (path.startsWith("/.netlify/functions/api/")) {
    path = "/api/" + path.slice("/.netlify/functions/api/".length);
  } else if (path === "/.netlify/functions/api") {
    path = "/api/health";
  } else if (path.startsWith("/.netlify/functions/api")) {
    path = "/api" + path.slice("/.netlify/functions/api".length);
  }

  if (path && !path.startsWith("/")) path = "/" + path;

  // splat without /api prefix
  if (
    path &&
    !path.startsWith("/api/") &&
    path !== "/api" &&
    (path.startsWith("/media/") ||
      path.startsWith("/img") ||
      path.startsWith("/proxy") ||
      path.startsWith("/health"))
  ) {
    path = "/api" + path;
  }

  return path || "/api/health";
}

export async function handler(event, context) {
  try {
    const path = normalizePath(event);
    const e = { ...event, path, rawPath: path };
    if (e.requestContext?.http) {
      e.requestContext = {
        ...e.requestContext,
        http: { ...e.requestContext.http, path },
      };
    } else if (e.requestContext) {
      e.requestContext = { ...e.requestContext, path };
    }
    return await baseHandler(e, context);
  } catch (err) {
    console.error("netlify handler failed", err);
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({ error: err?.message || "function error" }),
    };
  }
}
