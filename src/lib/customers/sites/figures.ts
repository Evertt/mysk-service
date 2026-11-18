/**
 * What a site's figures (`siteSummary`, `../extensions.ts`) say about it: the chips on its card,
 * whether it needs attention, how the sites overview orders the sites (worst first), how a value
 * reads, and the report's sections. Isomorphic: the server sorts the overview with it, its pages
 * show and filter it.
 */
import { formatNumber } from "#lib/i18n/format.ts";

import type { SiteFigure } from "../extensions.ts";

/** A figure's value as it reads: a count, kWh or hours. */
export function figureValue({ value, format = "count" }: Pick<SiteFigure, "value" | "format">) {
	const number = formatNumber(value);
	if (format === "kwh") return m.customers_report_kwh({ kwh: number });
	if (format === "hours") return m.customers_report_hours({ hours: number });
	return number;
}

/** The figures by their report's section, in their places' order. */
export const sectionsOf = (figures: readonly SiteFigure[]) => [
	...Map.groupBy(
		figures.toSorted((a, b) => a.place - b.place),
		(figure) => figure.section,
	),
];

/** A chip's tone, by how much it asks for: danger first, then warning, then the rest. */
const toneRank = { danger: 0, warning: 1, info: 2, neutral: 3, success: 4 } as const;

/** The chips a site's card shows: its figures with a chip that aren't zero, the worst first. */
export const chipsOf = (figures: readonly SiteFigure[]) =>
	figures
		.filter((figure) => figure.chip && figure.value > 0)
		.toSorted((a, b) => toneRank[a.chip!] - toneRank[b.chip!] || a.place - b.place);

/** How much of each tone a site's chips add up to: what `worstFirst()` orders by. */
function weightOf(figures: readonly SiteFigure[]) {
	let danger = 0;
	let warning = 0;
	for (const figure of chipsOf(figures)) {
		if (figure.chip === "danger") danger += figure.value;
		else if (figure.chip === "warning") warning += figure.value;
	}
	return { danger, warning };
}

/** Whether a site needs attention: a chip in `danger` or `warning` that isn't zero. */
export function needsAttention(figures: readonly SiteFigure[]) {
	const { danger, warning } = weightOf(figures);
	return danger > 0 || warning > 0;
}

/**
 * The sites, worst first: the most in danger chips, then in warning chips, then by name (those
 * needing nothing by name alone).
 */
export function worstFirst<T extends { name: string; figures: readonly SiteFigure[] }>(
	sites: readonly T[],
): T[] {
	const weights = new Map(sites.map((site) => [site, weightOf(site.figures)]));
	return sites.toSorted((a, b) => {
		const [one, other] = [weights.get(a)!, weights.get(b)!];
		return (
			other.danger - one.danger ||
			other.warning - one.warning ||
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
		);
	});
}
