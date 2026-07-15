import serverless from "serverless-http";
import app from "../../server/index.js";

export const handler = serverless(app, {
  // Netlify rewrite keeps request path as /api/...
  binary: ["image/*", "application/octet-stream"],
});
