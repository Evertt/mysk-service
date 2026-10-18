/** The origin local paths are resolved against: any will do, it's only compared. */
const base = "http://local.invalid";

/**
 * Where to go after signing in: `path` if it stays on this site, else the start page. Parsed as a
 * URL, as the browser will, so nothing it reads as another site gets through (`//evil.example`,
 * `/\evil.example`, or `/<tab>/evil.example`, whose tab the browser drops).
 */
export function safeRedirect(path: string | undefined) {
	if (!path?.startsWith("/")) return "/";
	const url = new URL(path, base);
	return url.origin === base ? url.pathname + url.search + url.hash : "/";
}
