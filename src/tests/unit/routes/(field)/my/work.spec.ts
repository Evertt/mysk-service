import * as v from "valibot";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { orderStatuses } from "#lib/models.ts";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import {
	dayLabel,
	fieldActions,
	groupByDay,
	MAX_SIGNATURE_LENGTH,
	plannedTime,
	signature,
} from "./work.ts";

describe("fieldActions", () => {
	test("a scheduled job can be started and noted, not yet worked on", () => {
		expect(fieldActions("scheduled")).toEqual({ start: true, work: false, note: true });
	});

	test("a job in progress can be worked on and noted", () => {
		expect(fieldActions("in_progress")).toEqual({ start: false, work: true, note: true });
	});

	test("nothing can be done with quotes, finished or cancelled orders", () => {
		for (const status of orderStatuses.filter((s) => s !== "scheduled" && s !== "in_progress")) {
			expect(fieldActions(status), status).toEqual({ start: false, work: false, note: false });
		}
	});
});

describe("groupByDay", () => {
	const today = new Date(2026, 9, 7, 7, 30);
	const at = (day: number, hours: number) => ({
		id: `${day}-${hours}`,
		scheduledFor: new Date(2026, 9, day, hours),
	});

	test("groups by day, soonest first, each day by time", () => {
		const groups = groupByDay([at(9, 10), at(7, 14), at(8, 9), at(7, 8)], today);
		expect(groups.map((g) => [g.label, g.orders.map((o) => o.id)])).toEqual([
			["Today", ["7-8", "7-14"]],
			["Tomorrow", ["8-9"]],
			["Friday 9 October", ["9-10"]],
		]);
		expect(groups[0].day).toEqual(new Date(2026, 9, 7));
	});

	test("unfinished work from earlier days is today's, first", () => {
		const groups = groupByDay([at(7, 9), at(5, 13)], today);
		expect(groups.map((g) => [g.label, g.orders.map((o) => o.id)])).toEqual([
			["Today", ["5-13", "7-9"]],
		]);
	});

	test("orders without a date come last", () => {
		const groups = groupByDay([{ id: "none", scheduledFor: null }, at(8, 9)], today);
		expect(groups.map((g) => g.label)).toEqual(["Tomorrow", "Not planned yet"]);
		expect(groups[1].day).toBeNull();
	});

	test("nothing planned is no groups", () => {
		expect(groupByDay([], today)).toEqual([]);
	});
});

test("days are labelled relative to today, across midnight", () => {
	const today = new Date(2026, 9, 7, 23, 59);
	expect(dayLabel(new Date(2026, 9, 7, 0, 1), today)).toBe("Today");
	expect(dayLabel(new Date(2026, 9, 8, 0, 1), today)).toBe("Tomorrow");
	expect(dayLabel(new Date(2026, 9, 12), today)).toBe("Monday 12 October");
});

describe("in Dutch", () => {
	const englishByDefault = getLocale;
	afterEach(() => overwriteGetLocale(englishByDefault));

	test("days and groups are labelled in Dutch", () => {
		overwriteGetLocale(() => "nl");
		const today = new Date(2026, 9, 7, 7, 30);
		expect(dayLabel(new Date(2026, 9, 7, 13), today)).toBe("Vandaag");
		expect(dayLabel(new Date(2026, 9, 8, 9), today)).toBe("Morgen");
		expect(dayLabel(new Date(2026, 9, 12), today)).toBe("maandag 12 oktober");
		expect(plannedTime(new Date(2026, 9, 6, 2, 23), today)).toBe("6 okt, 02:23");
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
	const today = new Date(2026, 9, 7, 7, 30);
	expect(plannedTime(new Date(2026, 9, 7, 13, 30), today)).toBe("13:30");
	expect(plannedTime(new Date(2026, 9, 8, 9, 0), today)).toBe("09:00");
	expect(plannedTime(new Date(2026, 9, 6, 2, 23), today)).toBe("6 Oct, 02:23");
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
