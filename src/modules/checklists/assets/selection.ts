/**
 * The work orders page's state in its URL: the list's (`?q=`, `?customer=`, `?year=`, see
 * `assetList`) and what's selected (`?unit=` a unit's serial number, `&component=` one of its
 * components' number, `&checklist=` one of its checklists, e.g. from its history), so a selection
 * can be shared and the back button goes back to the one before.
 */
import { resolve } from "$app/paths";

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
