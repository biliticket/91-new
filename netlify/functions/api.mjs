import serverless from "serverless-http";
import app from "../../server/index.js";

const baseHandler = serverless(app, {
  binary: ["image/*", "application/octet-stream"],
});

function normalizePath(event) {
  // Prefer original client path when Netlify provides it
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

  // Strip query if present
  path = path.split("?")[0] || "/";

  // Function direct invoke forms
  if (path.startsWith("/.netlify/functions/api/")) {
    // /.netlify/functions/api/media/meta -> /api/media/meta
    path = "/api/" + path.slice("/.netlify/functions/api/".length);
  } else if (path === "/.netlify/functions/api") {
    path = "/api/health";
  } else if (path.startsWith("/.netlify/functions/api")) {
    path = "/api" + path.slice("/.netlify/functions/api".length);
  }

  // If we only got "media/meta" (splat without /api), prefix it
  if (path && !path.startsWith("/")) path = "/" + path;
  if (
    path &&
    !path.startsWith("/api/") &&
    !path.startsWith("/.netlify/") &&
    path !== "/api" &&
    path !== "/"
  ) {
    // e.g. /media/meta from bad rewrite
    if (
      path.startsWith("/media/") ||
      path.startsWith("/img") ||
      path.startsWith("/proxy") ||
      path.startsWith("/health")
    ) {
      path = "/api" + path;
    }
  }

  return path || "/api/health";
}

export async function handler(event, context) {
  try {
    const path = normalizePath(event);
    const e = {
      ...event,
      path,
      rawPath: path,
    };
    if (e.requestContext?.http) {
      e.requestContext = {
        ...e.requestContext,
        http: { ...e.requestContext.http, path },
      };
    } else if (e.requestContext) {
      e.requestContext = { ...e.requestContext, path };
    }

    const result = await baseHandler(e, context);
    return result;
  } catch (err) {
    console.error("netlify function failed", err);
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({
        error: err?.message || "function error",
        stack: process.env.NETLIFY_DEV ? err?.stack : undefined,
      }),
    };
  }
}
