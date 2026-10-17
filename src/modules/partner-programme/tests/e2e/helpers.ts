/** What the partner programme's end-to-end tests share: its records as stored, and figures from them. */
import { rows, value } from "#e2e/app.ts";
import type { OrderType } from "#lib/models.ts";
import {
	type CategoryRule,
	type Eligibility,
	lineCategory,
	type RevenueCategory,
	type Tier,
	yearFigures,
} from "#modules/partner-programme/model.ts";

/** Today, the machine's (which is the test server's). */
export const today = Temporal.Now.plainDateISO();
export const thisYear = today.year;
export const lastYear = thisYear - 1;

/** A tenant's partners: their customers, by name. */
export const partnersOf = (organizationId: string) =>
	rows<{ id: number; code: string; name: string; accepted_on: string; accepted_by: string | null }>(
		`select c.id, c.code, c.name, p.accepted_on, p.accepted_by from partner_account p
		 join customer c on c.id = p.customer_id
		 where p.organization_id = ? order by c.name`,
		[organizationId],
	);

/** A tenant's customer that isn't a partner, the first by code. */
export const nonPartnerOf = async (organizationId: string) =>
	(
		await rows<{ id: number; code: string; name: string }>(
			`select id, code, name from customer c where organization_id = ?
			 and not exists (select 1 from partner_account p where p.customer_id = c.id)
			 order by code limit 1`,
			[organizationId],
		)
	)[0];

/** A year's rules as stored. */
export async function rulesOf(organizationId: string, year: number) {
	const [row] = await rows<{
		id: number;
		tiers: string;
		categories: string;
		credit_valid_years: number;
	}>(
		`select id, tiers, categories, credit_valid_years from partner_programme_year
		 where organization_id = ? and year = ?`,
		[organizationId, year],
	);
	return {
		id: row.id,
		year,
		tiers: JSON.parse(row.tiers) as Tier[],
		categories: JSON.parse(row.categories) as CategoryRule[],
		creditValidYears: row.credit_valid_years,
	};
}

/**
 * A partner's figures for a year, worked out from the database: the lines of its invoices paid in
 * the year less those of its credit notes settled in it (but the programme's own payouts), with
 * their orders' types and classifications, under the year's rules as stored.
 */
export async function figuresFromDatabase(
	organizationId: string,
	customerId: number,
	year: number,
) {
	const lines = await rows<{
		amount: number;
		source: string | null;
		type: OrderType | null;
		category: RevenueCategory | null;
		eligibility: Eligibility | null;
		share: number | null;
	}>(
		`select l.amount, l.source, o.type, c.category, c.eligibility, c.share
		 from (
			select l.amount, l.source, l.order_id from invoice_line l join invoice i on i.id = l.invoice_id
			where i.organization_id = ?1 and i.customer_id = ?2 and i.status = 'paid'
			and i.paid_on between ?3 and ?4
			union all
			select l.amount, l.source, l.order_id from credit_note_line l
			join credit_note n on n.id = l.credit_note_id
			where n.organization_id = ?1 and n.customer_id = ?2 and n.status = 'paid'
			and n.settled_on between ?3 and ?4
			and (l.source is null or l.source not like 'partner-programme:%')
		 ) l
		 left join "order" o on o.id = l.order_id
		 left join partner_order_classification c on c.order_id = l.order_id`,
		[organizationId, customerId, `${year}-01-01`, `${year}-12-31`],
	);
	const rules = await rulesOf(organizationId, year);
	return yearFigures(
		rules,
		lines.map((line) => ({
			amount: line.amount,
			category: lineCategory({
				source: line.source,
				order: line.type ? { type: line.type, category: line.category } : null,
			}),
			eligibility: line.eligibility,
			share: line.share,
		})),
	);
}

/** A tenant's closed years, by customer. */
export const closedYears = (organizationId: string, year: number) =>
	rows<{
		customer_id: number;
		level: string | null;
		partner_revenue: number;
		cash_amount: number;
		credit_amount: number;
		credit_valid_until: string;
		choice: string | null;
	}>(
		`select customer_id, level, partner_revenue, cash_amount, credit_amount, credit_valid_until,
		 choice from partner_bonus_year where organization_id = ? and year = ? order by customer_id`,
		[organizationId, year],
	);

/** A partner's wallet entries, in the order they were made. */
export const walletOf = (customerId: number) =>
	rows<{ kind: string; amount: number; valid_until: string | null; note: string | null }>(
		`select kind, amount, valid_until, note from partner_wallet_entry where customer_id = ? order by id`,
		[customerId],
	);

/** How many activity entries a subject type has in a tenant. */
export const logged = (organizationId: string, subjectType: string, action?: string) =>
	value<number>(
		`select count(*) from activity where organization_id = ? and subject_type = ?
		 and (? is null or action = ?)`,
		[organizationId, subjectType, action ?? null, action ?? null],
	);
