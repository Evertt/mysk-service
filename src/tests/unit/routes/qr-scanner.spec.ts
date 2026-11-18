/**
 * What the portals' QR scanner does with what it reads: only this app's own codes (`/q/<token>`)
 * lead anywhere; another site's URL, another path, a malformed token or no URL at all never do.
 */
import { describe, expect, test } from "vite-plus/test";

import { qrUrl } from "#lib/equipment/qr.ts";
import { scannedPath, typedPath } from "#routes/qr-scanner.ts";

const origin = "https://app.example";
const token = "0123456789abcdef01234567";
const unitPath = (serial: string) => `/portal/equipment/${encodeURIComponent(serial)}`;

describe("scannedPath", () => {
	test("leads one of our codes to its redirect", () => {
		expect(scannedPath(qrUrl(origin, token), origin)).toBe(`/q/${token}`);
		expect(scannedPath(`  ${origin}/q/${token}/  `, origin)).toBe(`/q/${token}`);
		// Its query or fragment don't change where it leads.
		expect(scannedPath(`${origin}/q/${token}?utm=label#x`, origin)).toBe(`/q/${token}`);
	});

	test("refuses another site's code, also one shaped like ours", () => {
		expect(scannedPath(qrUrl("https://evil.example", token), origin)).toBeNull();
		expect(scannedPath(`https://app.example.evil.example/q/${token}`, origin)).toBeNull();
		expect(scannedPath(`http://app.example/q/${token}`, origin)).toBeNull();
		expect(scannedPath(`https://app.example:8443/q/${token}`, origin)).toBeNull();
		expect(scannedPath("https://example.com/", origin)).toBeNull();
	});

	test("refuses our site's other paths and malformed tokens", () => {
		for (const path of [
			"/",
			"/portal",
			`/q/${token}/more`,
			`/x/q/${token}`,
			"/q/",
			"/q/0123456789ABCDEF01234567",
			"/q/0123456789abcdef0123456",
			"/q/0123456789abcdef012345678",
			"/q/..%2Fportal",
		]) {
			expect(scannedPath(`${origin}${path}`, origin), path).toBeNull();
		}
	});

	test("refuses what isn't a URL", () => {
		for (const text of [
			"",
			"   ",
			token,
			`/q/${token}`,
			"WIFI:S:office;T:WPA;P:secret;;",
			"javascript:alert(1)",
		]) {
			expect(scannedPath(text, origin), text).toBeNull();
		}
	});
});

describe("typedPath", () => {
	test("opens one of our codes typed or pasted as its link", () => {
		expect(typedPath(qrUrl(origin, token), origin, unitPath)).toBe(`/q/${token}`);
	});

	test("opens the unit of a serial number", () => {
		expect(typedPath(" DTC3Q2VDQJ ", origin, unitPath)).toBe("/portal/equipment/DTC3Q2VDQJ");
	});

	test("refuses another site's link, and nothing", () => {
		expect(typedPath(qrUrl("https://evil.example", token), origin, unitPath)).toBeNull();
		expect(typedPath("javascript:alert(1)", origin, unitPath)).toBeNull();
		expect(typedPath("   ", origin, unitPath)).toBeNull();
	});
});
