import type { RequestHandler } from "@sveltejs/kit";

import { serveConditionPhoto } from "#modules/condition/server/photos.ts";

/**
 * A photo of a defect (`<img src="/condition/photos/<id>">`), for whoever may read its unit's
 * conditions: `serveConditionPhoto()` checks it with the access registry, a 404 for anyone else. In
 * the engineer portal's group, which the office's shell owns too, so both reach it. An endpoint, as
 * a query would pass the image through devalue.
 */
export const GET: RequestHandler = ({ params }) => serveConditionPhoto(params.id!);
