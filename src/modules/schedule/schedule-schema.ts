import * as v from "valibot";

import { date, optionalId, time } from "#lib/schema.ts";

/** Who does an order and when: the fields of the schedule dialog and of a drag and drop move. */
export const scheduleFields = {
	engineerId: optionalId(),
	day: date(),
	time: time(),
};

/** A drag and drop move, sent as a command: ids are numbers, `null` for unassigned. */
export const moveFields = {
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	engineerId: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
	day: date(),
	time: time(),
};
