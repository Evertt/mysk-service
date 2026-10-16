/**
 * The colour of each order type on the schedule's calendar, as the client's planning colours its
 * kinds of appointments (a breakdown rose, a repair sky, maintenance emerald, an inspection violet;
 * the types it doesn't have get their own hue): a tint for an order's entry, a solid swatch for
 * the legend and the icon's colour, in light and dark like the Lagoon theme's badges. A new order
 * type needs its colour here (the `Record` says so). Classes written out whole, so Tailwind finds
 * them.
 */
import type { OrderType } from "#lib/models.ts";

interface TypeColor {
	/** An order's entry: tinted background, border and text, and its hover. */
	entry: string;
	/** The legend's swatch and the entry's icon. */
	swatch: string;
	icon: string;
}

export const typeColors: Record<OrderType, TypeColor> = {
	breakdown: {
		entry:
			"border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100 dark:hover:bg-rose-400/20",
		swatch: "bg-rose-500 dark:bg-rose-400",
		icon: "text-rose-600 dark:text-rose-300",
	},
	survey: {
		entry:
			"border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:bg-cyan-400/20",
		swatch: "bg-cyan-500 dark:bg-cyan-400",
		icon: "text-cyan-600 dark:text-cyan-300",
	},
	damage: {
		entry:
			"border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100 dark:border-orange-400/30 dark:bg-orange-400/10 dark:text-orange-100 dark:hover:bg-orange-400/20",
		swatch: "bg-orange-500 dark:bg-orange-400",
		icon: "text-orange-600 dark:text-orange-300",
	},
	project: {
		entry:
			"border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-100 dark:hover:bg-indigo-400/20",
		swatch: "bg-indigo-500 dark:bg-indigo-400",
		icon: "text-indigo-600 dark:text-indigo-300",
	},
	other: {
		entry:
			"border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-400/30 dark:bg-slate-400/10 dark:text-slate-100 dark:hover:bg-slate-400/20",
		swatch: "bg-slate-400 dark:bg-slate-500",
		icon: "text-slate-500 dark:text-slate-300",
	},
	installation: {
		entry:
			"border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100 dark:hover:bg-amber-400/20",
		swatch: "bg-amber-500 dark:bg-amber-400",
		icon: "text-amber-600 dark:text-amber-300",
	},
	maintenance: {
		entry:
			"border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/20",
		swatch: "bg-emerald-500 dark:bg-emerald-400",
		icon: "text-emerald-600 dark:text-emerald-300",
	},
	repair: {
		entry:
			"border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100 dark:hover:bg-sky-400/20",
		swatch: "bg-sky-500 dark:bg-sky-400",
		icon: "text-sky-600 dark:text-sky-300",
	},
	inspection: {
		entry:
			"border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-100 dark:hover:bg-violet-400/20",
		swatch: "bg-violet-500 dark:bg-violet-400",
		icon: "text-violet-600 dark:text-violet-300",
	},
};
