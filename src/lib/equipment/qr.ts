/**
 * The QR codes on units and locations: each has a random token of its own (`qr_token`, made by
 * `newQrToken()` in `server/qr.ts`), and its code is the URL `/q/<token>`, which sends whoever
 * scans it to the unit or location (`src/routes/q/[token]/+server.ts`). The token isn't the
 * record's id, so a code can't be guessed from another one, and stays the same when the unit is
 * renamed or moved.
 */

/** A token as the app and the migrations make them: 24 hex digits (96 random bits). */
export const qrTokenPattern = /^[0-9a-f]{24}$/;

/** The URL a QR code holds, on the app at `origin` (e.g. `page.url.origin`). */
export const qrUrl = (origin: string, token: string) => `${origin}/q/${token}`;
