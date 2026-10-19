// Frontend asset worker: serves the Vite build via Workers static assets and
// forwards same-origin `/api/*` requests to the API worker through a service
// binding. Keeping the API on the browser's own origin is what makes the auth
// session survive a page refresh: session cookies (and the CSRF marker cookie
// the shared auth client reads via `document.cookie`) must be first-party.
// A cross-origin API (e.g. `classprints-api.<sub>.workers.dev`) issues cookies
// on the wrong origin, so after a refresh the browser sends nothing and the
// user is logged out.
export interface FrontendWorkerEnv {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  API: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: FrontendWorkerEnv) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return env.API.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
