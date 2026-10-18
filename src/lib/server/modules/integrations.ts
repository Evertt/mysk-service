/**
 * What the modules' integration endpoints (the `+server.ts` files in a module's `(api)` routes,
 * guarded by `guardedIntegration()` in `./hooks.ts`) share in reading what a system outside the
 * app posts them.
 */

/**
 * The request's body as text, or `null` once it's more than `max` bytes: a body whose length says
 * so isn't read, and one without a length (sent in chunks) is read no further than that. Read a
 * feed's body with this rather than `request.json()`, which reads all there is before the feed
 * can check the batch's size; the endpoint answers `null` with a 413.
 */
export async function textUpTo(request: Request, max: number) {
	if (Number(request.headers.get("content-length") ?? 0) > max) return null;
	if (!request.body) return "";
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let size = 0;
	let text = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return text + decoder.decode();
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			return null;
		}
		text += decoder.decode(value, { stream: true });
	}
}
