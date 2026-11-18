/**
 * The energy module's figures about customers' sites (`customers.siteSummary`): at each monitored
 * site, the energy lost through its doors today (a chip on its card) and in the period, by the
 * building's own days (`reportRanges()`), and its open alerts for those who read them (the office:
 * a contact reads no alerts, `access.ts`). Of the energy sites the viewer may read
 * (`visible("energy_site")`).
 */
import { and, type SQL } from "drizzle-orm";

import type { SiteFigure, SiteSummary, SiteSummaryQuery } from "#lib/customers/extensions.ts";
import { visible, visibleOrNone } from "#lib/server/access/index.ts";
import { inList } from "#lib/server/db/parameters.ts";

import { doorFigures, loadSites, openAlertCounts, reportRanges } from "./figures.ts";
import { energySite } from "./schema.ts";

/** Where its section comes in the report: after maintenance. */
const PLACE = 40;

/** kWh to one decimal, as the chips and the report show it. */
const rounded = (kwh: number) => Math.round(kwh * 10) / 10;

export async function energySiteSummary({
	siteIds,
	period,
}: SiteSummaryQuery): Promise<SiteSummary> {
	const where: SQL = and(await visibleOrNone("energy_site"), inList(energySite.siteId, siteIds))!;
	const sites = await loadSites(where);
	const watches: SiteSummary["watches"] = ["energy_site"];
	if (!sites.length) return { figures: new Map(), columns: [], watches };
	const now = Temporal.Now.instant();
	const ranges = sites.map((site) => ({
		site,
		ranges: reportRanges(period.from, period.to, site.timeZone, now),
	}));
	const readsAlerts = (await visible("energy_alert")) !== undefined;
	const [doors, alerts] = await Promise.all([
		doorFigures(ranges, now),
		readsAlerts ? openAlertCounts(sites.map((site) => site.id)) : null,
	]);

	const section = m.energy_site_section();
	const figures = new Map<number, SiteFigure[]>();
	sites.forEach((site, index) => {
		const own = doors[index];
		const figure = (id: string, label: string, value: number, more: Partial<SiteFigure> = {}) =>
			({ id: `energy.${id}`, section, label, value, place: PLACE, ...more }) satisfies SiteFigure;
		const today = rounded(own.reduce((sum, door) => sum + door.lossKwhToday, 0));
		const inPeriod = rounded(own.reduce((sum, door) => sum + door.lossKwh, 0));
		figures.set(site.siteId, [
			figure("lostToday", m.energy_site_lost_today(), today, { format: "kwh", chip: "warning" }),
			figure("lostPeriod", m.energy_site_lost_period(), inPeriod, { format: "kwh" }),
			...(alerts
				? [figure("alerts", m.energy_site_alerts(), alerts.get(site.id) ?? 0, { chip: "danger" })]
				: []),
		]);
	});
	// An alert is logged with its energy site as the parent.
	return { figures, columns: [], watches: readsAlerts ? [...watches, "energy_alert"] : watches };
}
