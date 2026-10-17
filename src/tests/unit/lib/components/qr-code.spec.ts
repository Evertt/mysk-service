import { correction, generate } from "lean-qr";
import { expect, test } from "vite-plus/test";

import { qrPath } from "#lib/components/qr-code.ts";

/** The modules a path's rectangles cover, as `x,y`. */
function covered(d: string) {
	const modules = new Set<string>();
	for (const [, x, y, width] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
		for (let i = 0; i < Number(width); i++) modules.add(`${Number(x) + i},${y}`);
	}
	return modules;
}

test("a code's path covers exactly its dark modules", () => {
	const url = "https://fieldworks.example/q/0123456789abcdef01234567";
	const { size, d } = qrPath(url);
	const code = generate(url, { minCorrectionLevel: correction.M });
	expect(size).toBe(code.size);
	const dark = new Set<string>();
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) if (code.get(x, y)) dark.add(`${x},${y}`);
	}
	expect(covered(d)).toEqual(dark);
	// The finder patterns' corners are dark, the quiet zone isn't in it.
	expect(dark.has("0,0") && dark.has(`${size - 1},0`) && dark.has(`0,${size - 1}`)).toBe(true);
});

test("a URL of the app fits a small code, scannable from a label", () => {
	// Version 4 or below (33 modules) for a production-length URL, at medium error correction.
	expect(
		qrPath("https://app.fieldworks.example/q/0123456789abcdef01234567").size,
	).toBeLessThanOrEqual(33);
});
