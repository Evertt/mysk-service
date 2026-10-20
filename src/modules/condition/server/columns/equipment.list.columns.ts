/**
 * The SQL of the condition module's columns in the equipment list (see
 * `../../columns/equipment.list.columns.ts`): each unit's latest condition and its status, as
 * `../status-sql.ts` works them out.
 */
import { sql } from "drizzle-orm";

import { inList } from "#lib/server/db/parameters.ts";
import { columnSql } from "#lib/server/lists/index.ts";

import {
	type ScoreValue,
	type StatusValue,
	score,
	status,
} from "../../columns/equipment.list.columns.ts";
import { conditionSql } from "../status-sql.ts";

export default [
	columnSql(score, () => {
		const unit = conditionSql();
		return {
			value:
				sql`(case when ${unit.score} is null then null else json_object('score', ${unit.score}, 'band', ${unit.band}) end)`.mapWith(
					(text: string | null): ScoreValue => (text ? JSON.parse(text) : null),
				),
			sort: unit.score,
			nullsLast: true,
			filter: (bands) => inList(unit.band, bands),
			// Counted under `none` (`noneToken`) without one.
			facet: sql`nullif(${unit.band}, 'none')`,
		};
	}),
	columnSql(status, () => {
		const unit = conditionSql();
		return {
			value: sql`json_object('status', ${unit.status}, 'concern', ${unit.concern})`.mapWith(
				(text: string): StatusValue => JSON.parse(text),
			),
			// Worst first.
			sort: unit.sort,
			filter: (statuses) => inList(unit.status, statuses),
			facet: unit.status,
		};
	}),
];
