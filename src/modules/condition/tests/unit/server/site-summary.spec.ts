/**
 * The condition module's figures about sites (`server/site-summary.ts`), on SHLTR's seeded sites:
 * each unit once by status and once by score, the critical and needing attention as chips, each
 * scored unit's cell in the report, and the same for the office as for the site's contact.
 */
import { expect, test } from "vite-plus/test";

import { currentDay } from "#lib/dates.ts";
import { conditionSiteSummary } from "#modules/condition/server/site-summary.ts";
import {
	as,
	demoAccount,
	organizationId,
	shltr,
	south,
	value,
} from "#unit/lib/server/harness/index.ts";

const riedelSite = () =>
	value<number>(
		`select s.id from customer_site s join customer c on c.id = s.customer_id
		 where c.organization_id = ? and c.name = 'Riedel B.V.'`,
		[organizationId("shltr")],
	);

const ask = (siteId: number) => {
	const today = currentDay();
	return conditionSiteSummary({
		siteIds: [siteId],
		period: { from: today.with({ day: 1 }), to: today },
		today,
		units: true,
	});
};

test("counts each unit at the site once by status and once by score", async () => {
	const siteId = await riedelSite();
	const units = await value<number>("select count(*) from equipment where site_id = ?", [siteId]);
	const { figures, columns } = await as(shltr.member, () => ask(siteId));
	const own = figures.get(siteId)!;
	const sum = (prefix: RegExp) =>
		own.filter((figure) => prefix.test(figure.id)).reduce((total, f) => total + f.value, 0);
	expect(sum(/^condition\.(critical|attention|planned|ok)$/)).toBe(units);
	expect(sum(/^condition\.(score\d|noScore)$/)).toBe(units);
	expect(own.filter((figure) => figure.chip).map((figure) => [figure.id, figure.chip])).toEqual([
		["condition.critical", "danger"],
		["condition.attention", "warning"],
	]);
	const scored = units - own.find((figure) => figure.id === "condition.noScore")!.value;
	expect(columns[0].cells.size).toBe(scored);
});

test("answers the site's contact as it answers the office", async () => {
	const siteId = await riedelSite();
	const office = await as(shltr.member, () => ask(siteId));
	const contact = await as(shltr.customer, () => ask(siteId));
	expect(contact.figures).toEqual(office.figures);
	// Another customer's contact reads none of its units, and South none of SHLTR's.
	const other = await as(demoAccount("rob@weggemans.example"), () => ask(siteId));
	expect(other.figures.size).toBe(0);
	expect((await as(south.owner, () => ask(siteId))).figures.size).toBe(0);
});
