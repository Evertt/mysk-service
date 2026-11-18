/**
 * What the portals' QR scanner (`qr-scanner.svelte`) does with what it reads: a code of this app's
 * units and locations is the URL `<origin>/q/<token>` (`qrUrl()`), whose redirect leads each portal
 * to the unit or location (`src/routes/q/[token]/+server.ts`). Anything else, another site's URL
 * included, is not ours, and the scanner never goes there.
 */
import { qrTokenPattern } from "#lib/equipment/index.ts";

/**
 * The path a scanned code leads to in the app (`/q/<token>`), or null when it isn't one of ours: a
 * URL of another origin, another path, a token of another shape, or no URL at all.
 */
export function scannedPath(text: string, origin: string): string | null {
	let url: URL;
	try {
		url = new URL(text.trim());
	} catch {
		return null;
	}
	if (url.origin !== origin) return null;
	const token = /^\/q\/([^/]+)\/?$/.exec(url.pathname)?.[1];
	return token && qrTokenPattern.test(token) ? `/q/${token}` : null;
}

/**
 * Where a code typed in place of a scan leads: a code's URL as `scannedPath()` reads it, else the
 * unit of that serial number (printed under each unit's QR code) at `unitPath`. Another site's URL
 * leads nowhere (null), nor does nothing.
 */
export function typedPath(
	text: string,
	origin: string,
	unitPath: (serialNumber: string) => string,
): string | null {
	const typed = text.trim();
	if (!typed) return null;
	if (/^[a-z][a-z0-9+.-]*:/i.test(typed)) return scannedPath(typed, origin);
	return unitPath(typed);
}
