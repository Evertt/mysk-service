/**
 * The codes and numbers of the records the app numbers itself: `CUST-0001`, `ORD-2026-00001`, …
 * The one place that says what they look like; the server picks the next one (`nextNumber()` in
 * `#lib/server/numbering.ts`) and the seed script makes them too. Without imports at runtime, so
 * the seed script can use it. These are the core's; a module numbers its own records the same way
 * with a `NumberFormat` of its own (e.g. `contractNumber` in `src/modules/contracts/model.ts`),
 * which `formatCode()`, `sequenceStart()` and `nextNumber()` take in place of a kind.
 *
 * They are sequential per organization. A yearly one has the year in it, but the sequence runs on
 * across years: `ORD-2026-00041` is followed by `ORD-2027-00042`.
 */

export interface NumberFormat {
	prefix: string;
	/** The sequence is padded to this many digits; a longer one keeps counting. */
	digits: number;
	/** The year follows the prefix. */
	yearly?: boolean;
}

export const numberFormats = {
	customer: { prefix: "CUST-", digits: 4 },
	order: { prefix: "ORD-", digits: 5, yearly: true },
} as const satisfies Record<string, NumberFormat>;

export type NumberKind = keyof typeof numberFormats;

const formatOf = (kind: NumberKind | NumberFormat): NumberFormat =>
	typeof kind === "string" ? numberFormats[kind] : kind;

/** A code or number of `kind`, e.g. `formatCode("order", 42, 2026)` is `ORD-2026-00042`. */
export function formatCode(
	kind: NumberKind | NumberFormat,
	sequence: number,
	year = new Date().getFullYear(),
) {
	const { prefix, digits, yearly } = formatOf(kind);
	return `${prefix}${yearly ? `${year}-` : ""}${String(sequence).padStart(digits, "0")}`;
}

/**
 * Where the sequence starts in a code or number of `kind`, counting from 1 as SQL's `substr` does:
 * `ORD-2026-` is 9 characters, so it starts at 10.
 */
export function sequenceStart(kind: NumberKind | NumberFormat) {
	const { prefix, yearly } = formatOf(kind);
	return prefix.length + (yearly ? "YYYY-".length : 0) + 1;
}
