import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  UPSTREAM,
  getHome,
  getCategory,
  getSearch,
  getPost,
  getImage,
  proxyMedia,
} from "../lib/upstream.js";
import { mediaMeta, listMedia, resignVideo } from "../lib/media.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);

const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

function sendError(res, e) {
  const status = e.status || 502;
  if (res.headersSent) return;
  const wantsJson = (res.req?.path || "").startsWith("/api/") &&
    !["/api/img", "/api/proxy"].includes(
      (res.req?.path || "").split("?")[0]
    );
  // img/proxy return plain text; others json
  const p = res.req?.path || "";
  if (p.startsWith("/api/img") || p.startsWith("/api/proxy")) {
    return res.status(status).end(e.message || "error");
  }
  return res.status(status).json({ error: e.message || "error" });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, upstream: UPSTREAM });
});

app.get("/api/home", async (req, res) => {
  try {
    res.json(await getHome(req.query.page));
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/api/category/:slug", async (req, res) => {
  try {
    res.json(await getCategory(req.params.slug, req.query.page));
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/api/search", async (req, res) => {
  try {
    res.json(await getSearch(req.query.q, req.query.page));
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/api/post/:id", async (req, res) => {
  try {
    res.json(await getPost(req.params.id));
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/api/img", async (req, res) => {
  try {
    const { buf, mime } = await getImage(req.query.url);
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buf);
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/api/proxy", async (req, res) => {
  try {
    const { body, contentType } = await proxyMedia(req.query.url);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
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

app.use(express.static(path.join(ROOT, "public")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

// Local / traditional Node host
if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`91bypass clean reader on http://0.0.0.0:${PORT}`);
    console.log(`upstream: ${UPSTREAM}`);
  });
}

export default app;
