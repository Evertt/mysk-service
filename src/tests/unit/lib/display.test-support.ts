import { describe, expect, test } from "vite-plus/test";

interface Option {
	value: string;
	label: string;
	icon?: unknown;
}

/**
 * Checks a domain's options for filters and selects against the values they must offer. Each
 * domain's `display.spec.ts` calls it, so the specs import their own `display.ts` relatively and
 * never load another domain.
 */
export function describeOptions(
	name: string,
	options: readonly Option[],
	values: readonly string[],
	{ icons = true }: { icons?: boolean } = {},
) {
	describe(name, () => {
		test("offer every value once, in the order of the enum", () => {
			expect(options.map((option) => option.value)).toEqual(values);
		});

		test("have a distinct label for each value", () => {
			const labels = options.map((option) => option.label);
			expect(labels.every((label) => label.trim() !== "")).toBe(true);
			expect(new Set(labels).size).toBe(labels.length);
		});

		if (icons) {
			test("have an icon for each value", () => {
				expect(options.every((option) => typeof option.icon === "function")).toBe(true);
			});
		}
	});
}

/**
 * Checks a kind's display map (what `EnumBadge` shows) against each value's `[value, label,
 * tone]`, and that every value has an icon (or, with `icons: false`, none).
 */
export function describeBadges<V extends string>(
	name: string,
	display: Readonly<Record<V, { readonly label: string; tone: string; icon?: unknown }>>,
	rows: [V, string, string][],
	{ icons = true }: { icons?: boolean } = {},
) {
	describe(name, () => {
		test("cover every value", () => {
			expect(Object.keys(display).toSorted()).toEqual(rows.map(([value]) => value).toSorted());
		});

		test.each(rows)("%s shows as %s, in the %s tone", (value, label, tone) => {
			expect(display[value].label).toBe(label);
			expect(display[value].tone).toBe(tone);
			expect(Boolean(display[value].icon)).toBe(icons);
		});
	});
}
