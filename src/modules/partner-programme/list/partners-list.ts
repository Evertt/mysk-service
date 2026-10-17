import { code, defineList, orNone } from "#lib/components/data-table/list-definition.ts";

/**
 * The partners list: the tenant's partners with this year's Partner Omzet (and so their level and
 * progress) and what's in their wallets, searched, sorted, filtered by level and paged in the
 * database (`partnersSql` in `../server/list-sql.ts`). Its state is in the URL, e.g.
 * `?level=PLATINUM,none&sort=-revenue`. A level is the tenant's own name for it (`none` below the
 * first).
 */
export const partnersList = defineList({
	columns: {
		partner: { sort: true },
		level: { filter: orNone(code) },
		revenue: { sort: true },
		wallet: { sort: true },
		accepted: { sort: true },
	},
	defaults: { sort: [{ id: "revenue", desc: true }] },
});
