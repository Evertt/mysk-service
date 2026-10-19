import * as v from "valibot";

import { date, optionalId, recordId, time } from "#lib/schema.ts";

/** Who does an order and when: the fields of the schedule dialog and of a drag and drop move. */
export const scheduleFields = {
	engineerId: optionalId(),
	day: date(),
	time: time(),
};

/** A drag and drop move, sent as a command: ids are numbers, `null` for unassigned. */
export const moveFields = {
	id: recordId(),
	engineerId: v.nullable(recordId()),
	day: date(),
	time: time(),
};
