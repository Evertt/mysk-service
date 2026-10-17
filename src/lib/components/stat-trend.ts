/**
 * A figure against the same figure of the period before, for a `StatTile`'s trend line: which way
 * it went, by how much, and whether that's good news. The tile's caller words it (a message with
 * the change, e.g. "+18% vs the 30 days before").
 */
import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import { numberFormatter } from "#lib/i18n/format.ts";
import type { Locale } from "#lib/paraglide/runtime.js";

export type TrendDirection = "up" | "down" | "flat";

/** A tile's trend line: its text, its arrow and its colour. */
export interface StatTrend {
	text: string;
	direction: TrendDirection;
	tone: BadgeTone;
}

/** Which way is good news for a figure: up (revenue), down (faults), or neither (new orders). */
export type Better = "up" | "down" | "none";

export interface Comparison {
	direction: TrendDirection;
	tone: BadgeTone;
	/** `current - previous`. */
	change: number;
	/** The change as a share of `previous` (0.18 for 18% more), or null when there was none before. */
	share: number | null;
}

/** `current` against `previous` (the same figure over the period before). */
export function compare(current: number, previous: number, better: Better = "up"): Comparison {
	const change = current - previous;
	const direction: TrendDirection = change > 0 ? "up" : change < 0 ? "down" : "flat";
	const tone: BadgeTone =
		direction === "flat" || better === "none"
			? "neutral"
			: direction === better
				? "success"
				: "danger";
	return { direction, tone, change, share: previous === 0 ? null : change / previous };
}

const signedNumber = numberFormatter({ signDisplay: "exceptZero", maximumFractionDigits: 0 });
const signedPercent = numberFormatter({
	style: "percent",
	signDisplay: "exceptZero",
	maximumFractionDigits: 0,
});

/** A change with its sign, e.g. "+3", "−2" or "0", in the request's language. */
export const formatChange = (change: number, locale?: Locale) => signedNumber(change, locale);

/** A share with its sign, e.g. "+18%", "−5%" or "0%", in the request's language. */
export const formatShare = (share: number, locale?: Locale) => signedPercent(share, locale);
