/**
 * The work orders page's state in its URL: the list's (`?q=`, `?customer=`, `?year=`, see
 * `assetList`) and what's selected (`?unit=` a unit's serial number, `&component=` one of its
 * components' number, `&checklist=` one of its checklists, e.g. from its history), so a selection
 * can be shared and the back button goes back to the one before.
 */
import { resolve } from "$app/paths";

import type { officeComplete } from "./assets.remote.ts";

/**
 * The page's queries a change asks to have refreshed with it (a command's `updates`): the ones it
 * shows, by their arguments, as the server refreshes only so many of each.
 */
export type PageUpdates = Parameters<ReturnType<typeof officeComplete>["updates"]>;

/** The page's link with `changes` to the parameters of `url` (`null` removes one). */
export function pageHref(url: URL, changes: Record<string, string | null>) {
	const params = new URLSearchParams(url.searchParams);
	for (const [name, value] of Object.entries(changes)) {
		if (value === null) params.delete(name);
		else params.set(name, value);
	}
	const search = params.toString();
	return `${resolve("/(app)/(modules)/checklists")}${search ? `?${search}` : ""}`;
}
