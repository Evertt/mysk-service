/**
 * The file stores' settings, from the environment (`src/env.ts`): read here only, so a spec can
 * replace them with `vi.mock()` of this file (mocking `$app/env/private` would replace the test
 * database's URL too).
 */
import { PHOTOS_DIR } from "$app/env/private";

export const fileSettings = {
	/** The folder the orders' photos go to off Cloudflare. */
	photosFolder: PHOTOS_DIR,
};
