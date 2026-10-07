import * as v from "valibot";

import { date, formatted, optionalId } from "#lib/schema.js";

/** A time of day from `<input type="time">`, `HH:MM`. */
export const time = (required = "Choose a time") =>
	formatted(required, /^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time");

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
