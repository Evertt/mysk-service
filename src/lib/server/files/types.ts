/**
 * What a stored file is, by its bytes: each kind of file the app keeps (the orders' photos, the
 * units' documents) has a signature, its first bytes, so a file is what its bytes say, whatever type
 * the browser gave it or its name has. Plain functions of the bytes; nothing is decoded.
 */

/** Whether `bytes` start with `prefix` (at `at`). */
const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
	prefix.every((byte, i) => bytes[at + i] === byte);

/** `text`'s bytes, for the signatures written as text (`%PDF-`, `RIFF`). */
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** Whether `needle` occurs in `bytes`. */
function contains(bytes: Uint8Array, needle: readonly number[]) {
	outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
		return true;
	}
	return false;
}

/** How far from its end an Office file's entry names are looked for: its central directory. */
const DIRECTORY_TAIL = 1024 * 1024;

/**
 * An Office Open XML file (a ZIP whose entries include `[Content_Types].xml`) with an entry in
 * `folder` (`word/`, `xl/`): the names are in the ZIP's central directory, at its end, uncompressed.
 */
const officeFile = (folder: string) => (bytes: Uint8Array) => {
	if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
	const tail = bytes.subarray(Math.max(0, bytes.length - DIRECTORY_TAIL));
	return contains(tail, ascii("[Content_Types].xml")) && contains(tail, ascii(folder));
};

/** Each kind of file's signature, by its content type. */
export const fileSignatures = {
	"image/jpeg": (bytes: Uint8Array) => startsWith(bytes, [0xff, 0xd8, 0xff]),
	"image/png": (bytes: Uint8Array) =>
		startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	"image/webp": (bytes: Uint8Array) =>
		startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8),
	"application/pdf": (bytes: Uint8Array) => startsWith(bytes, ascii("%PDF-")),
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": officeFile("word/"),
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": officeFile("xl/"),
} satisfies Record<string, (bytes: Uint8Array) => boolean>;

type SignedType = keyof typeof fileSignatures;

/** The first of `types` whose signature `bytes` have, or none: what the file is. */
export const sniffType = <T extends SignedType>(bytes: Uint8Array, types: readonly T[]) =>
	types.find((type) => fileSignatures[type](bytes));
