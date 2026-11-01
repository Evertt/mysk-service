// Server-rendered on every request, not prerendered: a prerendered page can't show the visitor's
// theme (docs/plans/wiki.md, "Decisions after the spike").
export const prerender = false;
export const ssr = true;
export const csr = true;
