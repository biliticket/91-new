// CommonJS entry so Netlify's loader can require() this file.
// Real implementation is ESM and loaded via dynamic import().
exports.handler = async (event, context) => {
  const { handler } = await import("./handler.mjs");
  return handler(event, context);
};
