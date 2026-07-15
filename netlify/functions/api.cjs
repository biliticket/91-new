// CommonJS wrapper for Netlify
exports.handler = async (event, context) => {
  const { handler } = await import("./img-proxy.mjs");
  return handler(event, context);
};
