import type { ClientInit } from "@sveltejs/kit/hooks";

import { stylesheetsLoaded } from "./routes/splash.ts";

/**
 * Before the app hydrates: its stylesheets, which no longer block the first paint so the splash
 * shows at once (`deferStylesheets()`, `src/routes/splash.ts`), must be in, so that it never runs
 * or is seen without them.
 */
export const init: ClientInit = () => stylesheetsLoaded();
