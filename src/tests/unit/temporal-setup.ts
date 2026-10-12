/**
 * Loaded before every test (`setupFiles` in vite.config.ts): Temporal, where Node or the browser has
 * none yet, as the app's hooks install it; and `toEqual()` comparing days and moments by value. A
 * Temporal value has no properties of its own, so `toEqual()` would find any two the same.
 */
import "temporal-polyfill/global";
import { expect } from "vite-plus/test";

const types = [
	Temporal.PlainDate,
	Temporal.PlainTime,
	Temporal.PlainDateTime,
	Temporal.Instant,
	Temporal.ZonedDateTime,
];

expect.addEqualityTesters([
	(a: unknown, b: unknown) => {
		for (const type of types) {
			if (a instanceof type || b instanceof type) {
				return (
					a instanceof type &&
					b instanceof type &&
					(a as { equals(other: unknown): boolean }).equals(b)
				);
			}
		}
		return undefined;
	},
]);
