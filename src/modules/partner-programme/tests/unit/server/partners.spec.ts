/**
 * The partner programme's remote functions on the seeded demo database, where `programme.spec.ts`
 * leaves off: a customer looked up in the tenant only (also an order's classification), accepting
 * a customer into the programme (by whom and when; logged; once), a year's rules saved from their
 * form (euros and percentages to cents and basis points; logged; the other years as they were),
 * the managers' forms refused a planner, and a contact whose customer isn't a partner. The server
 * side of `partners.test.ts`, `partners.tenancy.test.ts` and `partners.portal.test.ts`.
 */
import { describe, expect, test } from "vite-plus/test";

import { getOrderClassification } from "#modules/partner-programme/classification.remote.ts";
import { getClientPartner } from "#modules/partner-programme/client/client-partner.remote.ts";
import { closeProgrammeYear } from "#modules/partner-programme/close.remote.ts";
import {
	acceptPartner,
	choosePartnerBonus,
	getPartnerCard,
} from "#modules/partner-programme/partners.remote.ts";
import { getYearRules, saveYearRules } from "#modules/partner-programme/years.remote.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, shltrId] = [organizationId("north"), organizationId("shltr")];
const today = Temporal.Now.plainDateISO("Europe/Amsterdam");
const [thisYear, lastYear] = [today.year, today.year - 1];

/** A tenant's customer that isn't a partner (nor has portal contacts), the first by code. */
const nonPartnerOf = async (organization: string) =>
	(
		await rows<{ id: number; code: string; name: string }>(
			`select id, code, name from customer c where organization_id = ?
			 and not exists (select 1 from partner_account p where p.customer_id = c.id)
			 and not exists (select 1 from portal_contact k where k.customer_id = c.id)
			 order by code limit 1`,
			[organization],
		)
	)[0];

/** A year's rules as stored. */
const storedRules = async (year: number) =>
	(
		await rows<{ tiers: string; categories: string; credit_valid_years: number }>(
			`select tiers, categories, credit_valid_years from partner_programme_year
			 where organization_id = ? and year = ?`,
			[northId, year],
		)
	)[0];

/** How many entries North's log has of a subject type (and action). */
const logged = (subjectType: string, action: string) =>
	value<number>(
		`select count(*) from activity where organization_id = ? and subject_type = ? and action = ?`,
		[northId, subjectType, action],
	);

describe("a customer's card", () => {
	test("is looked up in the tenant: a code it doesn't have is a 404", async () => {
		const highest = await value<string>(
			`select max(code) from customer where organization_id = ?`,
			[northId],
		);
		const unknown = `${highest.replace(/\d+$/, "")}9999`;
		expect(
			await value(`select count(*) from customer where organization_id = ? and code = ?`, [
				northId,
				unknown,
			]),
		).toBe(0);
		expect(await as(north.member, () => call(getPartnerCard, unknown))).toMatchObject({
			status: 404,
		});
	});

	test("of a customer that isn't a partner says so", async () => {
		const customer = await nonPartnerOf(northId);
		const card = await as(north.member, () => data(getPartnerCard, customer.code));
		expect(card).toMatchObject({
			customer: { id: customer.id, code: customer.code },
			partner: null,
			canManage: false,
		});
	});
});

describe("an order's classification", () => {
	test("is its own tenant's: another's order is a 404", async () => {
		const [own] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and type = 'repair' order by id limit 1`,
			[northId],
		);
		const other = await value<number>(`select min(id) from "order" where organization_id = ?`, [
			shltrId,
		]);
		await as(north.member, async () => {
			expect(await data(getOrderClassification, own.id)).toMatchObject({
				defaultCategory: expect.any(String),
			});
			expect(await call(getOrderClassification, other)).toMatchObject({ status: 404 });
		});
	});
});

describe("the managers' forms", () => {
	test("are no planner's: accepting a partner, saving the rules, closing a year, a bonus choice", async () => {
		const customer = await nonPartnerOf(northId);
		const [partner] = await rows<{ code: string }>(
			`select c.code from partner_account p join customer c on c.id = p.customer_id
			 where p.organization_id = ? order by c.name limit 1`,
			[northId],
		);
		const before = [
			await storedRules(lastYear),
			await value(`select count(*) from partner_bonus_year where organization_id = ?`, [northId]),
		];
		const { rules } = await as(north.owner, () => data(getYearRules, lastYear));
		await as(north.member, async () => {
			expect(await submit(acceptPartner, { code: customer.code })).toMatchObject({
				status: 403,
			});
			expect(
				await submit(saveYearRules, { year: String(lastYear), ...formOf(rules) }),
			).toMatchObject({ status: 403 });
			expect(await submit(closeProgrammeYear, { year: String(lastYear) })).toMatchObject({
				status: 403,
			});
			expect(
				await submit(choosePartnerBonus, {
					code: partner.code,
					year: String(lastYear),
					choice: "credit",
				}),
			).toMatchObject({ status: 403 });
		});
		expect(await nonPartnerOf(northId)).toEqual(customer);
		expect([
			await storedRules(lastYear),
			await value(`select count(*) from partner_bonus_year where organization_id = ?`, [northId]),
		]).toEqual(before);
	});
});

describe("accepting a customer", () => {
	test("makes it a partner today, by the manager; logged; once", async () => {
		const customer = await nonPartnerOf(northId);
		const answer = await as(north.owner, () => submit(acceptPartner, { code: customer.code }));
		expect(answer).toMatchObject({ status: 200, refreshed: ["getPartnerCard"] });
		const owner = await value<string>(`select id from user where email = ?`, [north.owner.email]);
		expect(
			await rows(`select accepted_on, accepted_by from partner_account where customer_id = ?`, [
				customer.id,
			]),
		).toEqual([{ accepted_on: today.toString(), accepted_by: owner }]);
		expect(await logged("partner", "accepted")).toBe(1);
		const again = await as(north.owner, () => submit(acceptPartner, { code: customer.code }));
		expect(again.issues?.map((issue) => issue.message)).toEqual([
			"This customer is a partner already.",
		]);
	});
});

/** A year's rules as their form sends them: thresholds in euros, rates in percent. */
function formOf(rules: {
	tiers: { level: string; threshold: number; cashRate: number; creditRate: number }[];
	categories: { category: string; level: boolean; cash: string; credit: string }[];
	creditValidYears: number;
}) {
	return {
		tiers: rules.tiers.map((tier) => ({
			level: tier.level,
			threshold: tier.threshold / 100,
			cashRate: tier.cashRate / 100,
			creditRate: tier.creditRate / 100,
		})),
		categories: rules.categories.map((rule) => ({ ...rule })),
		creditValidYears: rules.creditValidYears,
	};
}

describe("a year's rules", () => {
	test("are saved from their form in cents and basis points; logged; the other years as they were", async () => {
		const thisYears = await storedRules(thisYear);
		const { rules } = await as(north.owner, () => data(getYearRules, lastYear));
		const form = formOf(rules);
		form.tiers[0] = { ...form.tiers[0], threshold: 100, cashRate: 2.75 };
		const tenders = form.categories.find((rule) => rule.category === "tenders")!;
		tenders.cash = "by_agreement";

		const answer = await as(north.owner, () =>
			submit(saveYearRules, { year: String(lastYear), ...form }),
		);
		expect(answer.status).toBe(200);
		expect(answer.refreshed).toEqual(expect.arrayContaining(["getYearRules", "getProgrammeYears"]));
		const stored = await storedRules(lastYear);
		expect(JSON.parse(stored.tiers)[0]).toMatchObject({ threshold: 10_000, cashRate: 275 });
		expect(
			(JSON.parse(stored.categories) as { category: string; cash: string }[]).find(
				(rule) => rule.category === "tenders",
			)?.cash,
		).toBe("by_agreement");
		expect(await logged("partner_programme_year", "updated")).toBe(1);
		expect(await storedRules(thisYear)).toEqual(thisYears);
	});

	test("refuse a percentage over 100 and a threshold in part euros", async () => {
		const { rules } = await as(north.owner, () => data(getYearRules, lastYear));
		const form = formOf(rules);
		form.tiers[0] = { ...form.tiers[0], threshold: 100.5, cashRate: 101 };
		const answer = await as(north.owner, () =>
			submit(saveYearRules, { year: String(lastYear), ...form }),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues?.map((issue) => issue.name).toSorted()).toEqual([
			"tiers[0].cashRate",
			"tiers[0].threshold",
		]);
	});
});

describe("the customer portal", () => {
	test("tells a contact whose customer isn't a partner so, and nothing more", async () => {
		const customerId = await value<number>(
			`select customer_id from portal_contact k join user u on u.id = k.user_id where u.email = ?`,
			[north.customer.email],
		);
		expect(
			await value(`select count(*) from partner_account where customer_id = ?`, [customerId]),
		).toBe(0);
		expect(await as(north.customer, () => data(getClientPartner))).toEqual({ partner: false });
	});
});
