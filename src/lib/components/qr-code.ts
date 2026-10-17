/**
 * A QR code as an SVG path, encoded by `lean-qr` (MIT, no dependencies, a few kB): the dark
 * modules of `text`'s code as one path of unit squares, row by row, joined where they're side by
 * side. Medium error correction (~15%), so a scratched label still reads.
 */
import { correction, generate } from "lean-qr";

/** The quiet zone around a code that scanners need, in modules (the standard's four). */
export const QR_MARGIN = 4;

export interface QrPath {
	/** The code's width and height in modules, without the margin. */
	size: number;
	/** The dark modules, in modules from the code's top left corner (the margin not counted). */
	d: string;
}

export function qrPath(text: string): QrPath {
	const code = generate(text, { minCorrectionLevel: correction.M });
	const parts: string[] = [];
	for (let y = 0; y < code.size; y++) {
		for (let x = 0; x < code.size; x++) {
			if (!code.get(x, y)) continue;
			// A run of dark modules on the row, as one rectangle.
			let end = x + 1;
			while (end < code.size && code.get(end, y)) end++;
			parts.push(`M${x} ${y}h${end - x}v1h${x - end}z`);
			x = end;
		}
	}
	return { size: code.size, d: parts.join("") };
}
