import type { RequestHandler } from "@sveltejs/kit";

import { servePhoto } from "#lib/orders/server/index.ts";

/**
 * A photo of an order (`<img src="/photos/<id>">`), for whoever may read the order, in every shell:
 * `servePhoto()` checks it with the access registry, a 404 for anyone else (the guard in
 * `hooks.server.ts` leaves it to it). An endpoint, as a query would pass the image through devalue.
 */
export const GET: RequestHandler = ({ params }) => servePhoto(params.id!);
