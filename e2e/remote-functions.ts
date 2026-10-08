/** Helpers for the app's remote functions: spotting their requests and tampering with them. */
import type { Page } from "playwright";

/** Whether a request (its URL) calls the remote function `name`, e.g. `getOrders`. */
export const isRemote = (url: string, name: string) =>
	url.includes("/_app/remote/") && new URL(url).pathname.endsWith(`/${name}`);

/** Rebuilds a value from devalue's flat JSON, as remote commands send it (plain data only). */
function unflatten(flat: unknown[]): unknown {
	const hydrate = (index: number): unknown => {
		if (index === -1) return undefined;
		const entry = flat[index];
		if (Array.isArray(entry)) return entry.map((i: number) => hydrate(i));
		if (entry && typeof entry === "object") {
			return Object.fromEntries(Object.entries(entry).map(([k, i]) => [k, hydrate(i as number)]));
		}
		return entry;
	};
	return hydrate(0);
}

/** Devalue's flat JSON of plain data, which a remote command reads. */
function flatten(value: unknown): string {
	const flat: unknown[] = [];
	const add = (item: unknown): number => {
		const index = flat.push(null) - 1;
		if (Array.isArray(item)) flat[index] = item.map(add);
		else if (item && typeof item === "object") {
			flat[index] = Object.fromEntries(Object.entries(item).map(([k, v]) => [k, add(v)]));
		} else flat[index] = item;
		return index;
	};
	add(value);
	return JSON.stringify(flat);
}

/**
 * Changes the argument of the next call of the remote command `name` from `page` on its way to the
 * server, like someone tampering with the request.
 */
export async function tamperWithCommand<T>(page: Page, name: string, change: (arg: T) => unknown) {
	await page.route(
		(url) => isRemote(url.href, name),
		async (route) => {
			const body = JSON.parse(route.request().postData()!) as { payload: string };
			const flat = JSON.parse(Buffer.from(body.payload, "base64url").toString()) as unknown[];
			const payload = flatten(change(unflatten(flat) as T));
			body.payload = Buffer.from(payload).toString("base64url");
			await route.continue({ postData: JSON.stringify(body) });
		},
		{ times: 1 },
	);
}
