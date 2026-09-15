// Frontend asset worker: serves the Vite build via Workers static assets.
// The asset binding handles all requests; this entrypoint exists so wrangler
// can deploy the SPA alongside the other Workers with one mechanism.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};

