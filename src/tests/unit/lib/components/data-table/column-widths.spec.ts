import { describe, expect, test } from "vite-plus/test";

import {
	hiddenRows,
	learn,
	type Measured,
	widthContext,
	type WidthMemory,
} from "#lib/components/data-table/column-widths.ts";

type Row = { name: string };

const sample = (name: string) => ({ original: { name }, value: name });
const cell = (column: string, name: string, max: number, min = max): Measured<Row> => ({
	column,
	sample: sample(name),
	max,
	min,
});

describe("learn", () => {
	test("keeps the first cells of a column", () => {
		const memory = learn<Row>({}, [cell("name", "Ada", 40)]);
		expect(memory.name.max).toEqual({ width: 40, sample: sample("Ada") });
		expect(memory.name.min).toEqual({ width: 40, sample: sample("Ada") });
	});

	test("keeps the widest on one line and the widest wrapped, which may be other cells", () => {
		const memory = learn<Row>({}, [
			cell("name", "Ada Lovelace", 90, 50),
			cell("name", "Grace", 60, 60),
			cell("name", "Al", 20),
		]);
		expect(memory.name.max.sample.value).toBe("Ada Lovelace");
		expect(memory.name.min.sample.value).toBe("Grace");
	});

	test("keeps each column's own", () => {
		const memory = learn<Row>({}, [cell("name", "Ada", 40), cell("city", "Utrecht", 70)]);
		expect(Object.keys(memory)).toEqual(["name", "city"]);
	});

	test("answers the same memory when nothing is wider (within half a pixel)", () => {
		const memory = learn<Row>({}, [cell("name", "Ada", 40)]);
		expect(learn(memory, [cell("name", "Bob", 40.4), cell("name", "Al", 20)])).toBe(memory);
	});

	test("answers a new memory when a cell is wider, leaving the old one as it was", () => {
		const memory = learn<Row>({}, [cell("name", "Ada", 40)]);
		const next = learn(memory, [cell("name", "Bartholomew", 100)]);
		expect(next).not.toBe(memory);
		expect(memory.name.max.width).toBe(40);
		expect(next.name.max.width).toBe(100);
	});
});

describe("hiddenRows", () => {
	test("puts each column's widest cell in a first row, and its widest wrapped in a second", () => {
		const both = sample("Grace");
		const memory: WidthMemory<Row> = {
			name: {
				max: { width: 90, sample: sample("Ada Lovelace") },
				min: { width: 60, sample: both },
			},
			city: { max: { width: 70, sample: both }, min: { width: 70, sample: both } },
		};
		const rows = hiddenRows(memory, ["name", "city"]);
		expect(rows.map((row) => Object.fromEntries([...row].map(([id, s]) => [id, s.value])))).toEqual(
			[{ name: "Ada Lovelace", city: "Grace" }, { name: "Grace" }],
		);
	});

	test("leaves out columns without memory, and hidden columns", () => {
		const [a, b] = [sample("A"), sample("B")];
		const memory: WidthMemory<Row> = {
			name: { max: { width: 9, sample: a }, min: { width: 9, sample: a } },
			city: { max: { width: 9, sample: b }, min: { width: 9, sample: b } },
		};
		expect(hiddenRows(memory, ["name", "total"]).map((row) => [...row.keys()])).toEqual([["name"]]);
		expect(hiddenRows({}, ["name"])).toEqual([]);
	});
});

test("widthContext changes with the columns, the density and the language", () => {
	const context = { columns: ["name", "city"], density: "comfortable", locale: "en" };
	const base = widthContext(context);
	expect(widthContext({ ...context })).toBe(base);
	expect(widthContext({ ...context, columns: ["name"] })).not.toBe(base);
	expect(widthContext({ ...context, density: "compact" })).not.toBe(base);
	expect(widthContext({ ...context, locale: "nl" })).not.toBe(base);
});
