/**
 * The customers' extension points: where modules take part in their pages, in removing a site and
 * in the sites' figures (see `#lib/extensions/define.ts` and `#lib/server/extensions.ts`). The vote
 * has one caller, `removeSite()` (`server/sites.ts`), and the collector one, `summarizeSites()`
 * (`server/site-summary.ts`). Isomorphic, so the slots' types are there for the pages.
 */
import type { ChangeType } from "#lib/activity/index.ts";
import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import {
	defineCollector,
	defineRecordPoints,
	defineVote,
	slotProps,
} from "#lib/extensions/define.ts";
// Only the type: this file is isomorphic.
import type { Transaction } from "#lib/server/db/index.ts";

/**
 * A customer's points: cards in the columns of its page, e.g. the partner programme's level and
 * wallet at the side, the service history of its units in the main column. The components load
 * their own data through their module's remote functions (by the customer's code, checked in the
 * tenant there), and render nothing when they have nothing to say.
 */
export const points = defineRecordPoints("customers", { detail: slotProps<{ code: string }>() });

/**
 * Core is about to delete one of the tenant's customer sites, in `tx`; its equipment is gone and
 * the customer keeps another. Anything of a module's that refers to the site would go with it (the
 * keys cascade), unlogged.
 */
export interface SiteRemoval {
	/** The transaction core deletes the site in: a module reads what it has of the site in it. */
	tx: Transaction;
	site: { id: number; customerId: number };
}

/**
 * Whether a customer's site may go (`SiteRemoval`): a module that has records at the site (the
 * docks' dock positions, an energy site) refuses, saying what's there and what to remove first,
 * and the site stays. The sites card shows the refusal. The modules the tenant has switched off are
 * asked too, since their records would go just the same: one that's off says to switch it on first.
 */
export const removingSite = defineVote<SiteRemoval>("customers.removingSite", { alsoOff: true });

/** Days `from` to `to`, both included: a report's period. */
export interface SitePeriod {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
}

/** What the sites' figures are asked about (`siteSummary`). */
export interface SiteSummaryQuery {
	/** The sites, each one the viewer may read (`visible("site")`, which core asked). */
	siteIds: readonly number[];
	period: SitePeriod;
	/** The viewer's today (`currentDay()`): what's due, scheduled or lost today. */
	today: Temporal.PlainDate;
	/** Whether to answer each unit's facts too (`columns`, the report's table), not only the sites'. */
	units: boolean;
}

/** How a figure's value reads: a count (the default), energy, or hours. */
type SiteFigureFormat = "count" | "kwh" | "hours";

/** A number about a site, e.g. its units that are critical, or its faults in the period. */
export interface SiteFigure {
	/** Unique among the modules' and core's, e.g. `condition.critical`. */
	id: string;
	/** The report's section it's in, e.g. "Condition (NEN 2767)", a translated text. */
	section: string;
	label: string;
	value: number;
	format?: SiteFigureFormat;
	/**
	 * Shown on the site's card as a chip in this tone while it isn't zero; one in `danger` or
	 * `warning` makes the site one needing attention (`needsAttention()`).
	 */
	chip?: BadgeTone;
	/** Where its section comes in the report, lowest first (core's faults and work: 90). */
	place: number;
}

/** What a unit's cell in a column of the report says, formatted, and its tone. */
export interface UnitFact {
	text: string;
	tone?: BadgeTone;
}

/** A column of the report's table of units, e.g. the next inspection: its cells by unit id. */
export interface UnitColumn {
	id: string;
	label: string;
	cells: Map<number, UnitFact>;
	/** Where it comes among the columns, lowest first. */
	place: number;
}

/**
 * A module's (or core's) answer about the sites: its figures by site id (a site it has nothing to
 * say about may be missing), its columns of the units' table when asked for `units`, and the record
 * types its figures are read from, so a page that shows them refreshes when one of those changes.
 */
export interface SiteSummary {
	figures: Map<number, SiteFigure[]>;
	columns: UnitColumn[];
	watches: ChangeType[];
}

/**
 * The sites' figures: given sites the viewer may read and a period, each module answers what it
 * knows of each site (condition: units by score and status; checklists: inspections; maintenance:
 * visits done and due; energy: energy lost), scoping its own reads to what the viewer may read (the
 * access registry, `#lib/server/access`). Core adds its own (faults, work), and shows them on the
 * sites overview and the site report (`summarizeSites()`, `server/site-summary.ts`). A module that
 * fails is left out: the sites still show, without its figures.
 */
export const siteSummary = defineCollector<SiteSummaryQuery, SiteSummary>("customers.siteSummary", {
	onError: "skip",
});
