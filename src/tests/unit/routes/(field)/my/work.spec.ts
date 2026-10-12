import * as v from "valibot";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import {
	dayLabel,
	groupByDay,
	MAX_SIGNATURE_LENGTH,
	plannedTime,
	signature,
} from "#routes/(field)/my/work.ts";
import { at, day } from "#unit/temporal-support.ts";

describe("groupByDay", () => {
	const today = day("2026-10-07");
	/** An order planned on a day of October 2026, at an hour. */
	const planned = (date: number, hours: number) => ({
		id: `${date}-${hours}`,
		scheduledFor: at(
			`2026-10-${String(date).padStart(2, "0")} ${String(hours).padStart(2, "0")}:00`,
		),
	});

	test("groups by day, soonest first, each day by time", () => {
		const groups = groupByDay(
			[planned(9, 10), planned(7, 14), planned(8, 9), planned(7, 8)],
			today,
		);
		expect(groups.map((g) => [g.label, g.orders.map((o) => o.id)])).toEqual([
			["Today", ["7-8", "7-14"]],
			["Tomorrow", ["8-9"]],
			["Friday 9 October", ["9-10"]],
		]);
		expect(groups[0].day).toEqual(day("2026-10-07"));
	});

	test("unfinished work from earlier days is today's, first", () => {
		const groups = groupByDay([planned(7, 9), planned(5, 13)], today);
		expect(groups.map((g) => [g.label, g.orders.map((o) => o.id)])).toEqual([
			["Today", ["5-13", "7-9"]],
		]);
	});

	test("orders without a date come last", () => {
		const groups = groupByDay([{ id: "none", scheduledFor: null }, planned(8, 9)], today);
		expect(groups.map((g) => g.label)).toEqual(["Tomorrow", "Not planned yet"]);
		expect(groups[1].day).toBeNull();
	});

	test("nothing planned is no groups", () => {
		expect(groupByDay([], today)).toEqual([]);
	});
});

test("days are labelled relative to today", () => {
	const today = day("2026-10-07");
	expect(dayLabel(day("2026-10-07"), today)).toBe("Today");
	expect(dayLabel(day("2026-10-08"), today)).toBe("Tomorrow");
	expect(dayLabel(day("2026-10-12"), today)).toBe("Monday 12 October");
});

describe("in Dutch", () => {
	const englishByDefault = getLocale;
	afterEach(() => overwriteGetLocale(englishByDefault));

	test("days and groups are labelled in Dutch", () => {
		overwriteGetLocale(() => "nl");
		const today = day("2026-10-07");
		expect(dayLabel(day("2026-10-07"), today)).toBe("Vandaag");
		expect(dayLabel(day("2026-10-08"), today)).toBe("Morgen");
		expect(dayLabel(day("2026-10-12"), today)).toBe("maandag 12 oktober");
		expect(plannedTime(at("2026-10-06 02:23"), today)).toBe("6 okt, 02:23");
		const groups = groupByDay([{ id: "none", scheduledFor: null }], today);
		expect(groups.map((g) => g.label)).toEqual(["Nog niet ingepland"]);
	});

	test("the signature's messages are in Dutch", () => {
		overwriteGetLocale(() => "nl");
		const result = v.safeParse(signature(), "");
		expect(result.issues?.[0].message).toBe("Vraag de klant te tekenen");
	});
});

test("a card shows the time, and the day too for work left over from an earlier day", () => {
	const today = day("2026-10-07");
	expect(plannedTime(at("2026-10-07 13:30"), today)).toBe("13:30");
	expect(plannedTime(at("2026-10-08 09:00"), today)).toBe("09:00");
	expect(plannedTime(at("2026-10-06 02:23"), today)).toBe("6 Oct, 02:23");
});

describe("signature", () => {
	const parse = (input: unknown) => {
		const result = v.safeParse(signature(), input);
		return result.success ? { value: result.output } : { issue: result.issues[0].message };
	};
	const png =
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

	test("is a PNG data URL", () => {
		expect(parse(png)).toEqual({ value: png });
	});

	test("is required", () => {
		expect(parse("")).toEqual({ issue: "Ask the customer to sign" });
	});

	test("isn't anything else", () => {
		expect(parse("data:image/svg+xml;base64,PHN2Zz4=")).toEqual({
			issue: "The signature isn't an image",
		});
		expect(parse("javascript:alert(1)")).toEqual({ issue: "The signature isn't an image" });
	});

	test("isn't too large", () => {
		const large = `data:image/png;base64,${"A".repeat(MAX_SIGNATURE_LENGTH)}`;
		expect(parse(large)).toEqual({
			issue: "The signature is too large; clear it and sign again",
		});
	});
});
