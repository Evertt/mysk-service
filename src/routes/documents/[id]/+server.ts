import type { RequestHandler } from "@sveltejs/kit";

import { serveUnitDocument } from "#lib/equipment/server/index.ts";

/**
 * A unit's document (`<a href="/documents/<id>">`), for whoever may read the unit, in every shell:
 * `serveUnitDocument()` checks it with the access registry, a 404 for anyone else (the guard in
 * `hooks.server.ts` leaves it to it). A PDF or an image opens in the browser, another file is saved.
 */
export const GET: RequestHandler = ({ params }) => serveUnitDocument(params.id!);
