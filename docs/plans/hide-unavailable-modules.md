# To do: hide which modules exist from tenants that don't have them

Not started (October 2026); to reconsider later. Every tenant's browser can learn which optional
modules the app has, also those the tenant hasn't switched on. Nothing of their data leaks (the
modules' remote functions and server files refuse tenants without them, on the server), only that
they exist: names, labels, descriptions and routes. Not a secret that matters, but a principle.

## Where they show

- **SvelteKit's route manifest**: by default SvelteKit sends the browser the list of all routes
  (in `_app/immutable/entry/app.*.js`), for client-side routing, so `/(app)/(modules)/maintenance`
  and the others are in every tenant's bundle.
- **The modules' manifests**: every module's `module.ts` (label, description, icon, nav) is in every
  tenant's bundle by design (`src/lib/modules/manifests.gen.ts`, read by the sidebar and the
  settings page, which lists all modules to switch on).
- **The build's files**: the modules' JavaScript is public static files, with hashed names; the
  service worker's precache list (`src/service-worker/index.ts`, `files`) names them all.

## What hiding them would take, all three

1. **Server route resolution**: `router: { resolution: "server" }` in the SvelteKit options
   (`vite.config.ts`). SvelteKit then sends no route manifest, and asks the server which route a
   path is the first time a tab goes there. Kit answers those requests before the `handle` hook
   (no session or database lookups, so they're cheap), a preload on hover hides the wait, and the
   service worker could keep the answers (they're the same for every tenant). Someone who guesses a
   module's path still learns that the route exists.
2. **Per-tenant module manifests**: load the manifests of the tenant's own modules from the server
   instead of bundling them all; the settings page's list of modules to switch on (for managers)
   becomes a query of its own.
3. **A per-tenant precache**: the service worker precaches only the shared files and those of the
   tenant's modules, which it would need to learn from the page (like the scope it's told now).

Server route resolution alone is one line and cheap to try, but hides only the first of the three.
