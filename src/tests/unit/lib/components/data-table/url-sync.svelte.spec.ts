import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { lastSearch, leaveFor, visit, visits } from "./fake-navigation.svelte.ts";
import Harness from "./table.test-harness.svelte";
import {
	addToSort,
	byName,
	columnHeader,
	facet,
	items,
	names,
	openStatusFilter,
	statusPill,
	textOf,
} from "./table.test-support.ts";

// The table keeps its state in the URL: a fake one, which `goto` changes.
vi.mock("$app/state", () => import("./fake-navigation.svelte.ts"));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
// The toolbar's saved views (see `saved-views.svelte.spec.ts`): none.
vi.mock("#lib/components/data-table/views.remote.ts", () => import("./fake-views.svelte.ts"));
vi.mock(
	"#lib/components/data-table/table-memory.remote.ts",
	() => import("./fake-table-memory.ts"),
);

beforeEach(() => visit("/items"));

describe("the URL", () => {
	test("an untouched table leaves the URL alone", async () => {
		render(Harness, { items });

		await expect.poll(names).toEqual(byName);
		expect(visits).toEqual([]);
	});

	// Filtering and sorting in a test each: together they came close to a test's time under the load
	// of a full run.
	test("filtering goes into the URL, each change as a history entry", async () => {
		render(Harness, { items });

		await openStatusFilter();
		await facet("Open").click();
		await facet("Draft").click();
		await expect.poll(lastSearch).toBe("?status=open,draft");
		await facet("Closed").click();
		await expect.poll(lastSearch).toBe("?status=open,draft,closed");
		await userEvent.keyboard("{Escape}");

		expect(visits.every((visit) => !visit.replace)).toBe(true);
	});

	const filtered = "?status=open,draft,closed";

	test("so does sorting", async () => {
		visit(`/items${filtered}`);
		render(Harness, { items });

		await columnHeader("Amount").click();
		await expect.poll(lastSearch).toBe(`${filtered}&sort=amount`);
		await columnHeader("Amount").click();
		await expect.poll(lastSearch).toBe(`${filtered}&sort=-amount`);
		await addToSort("Name");
		await expect.poll(lastSearch).toBe(`${filtered}&sort=-amount,name`);

		expect(visits.every((visit) => !visit.replace)).toBe(true);
	});

	test("searching replaces its history entry once typing pauses, and drops the position", async () => {
		visit("/items?row=3");
		render(Harness, { items });
		await expect.poll(names).toEqual(byName);

		const search = page.getByRole("textbox", { name: "Search items…" });
		await search.fill("p");
		await expect.poll(lastSearch).toBe("?q=p");
		await search.fill("pump");
		await expect.poll(lastSearch).toBe("?q=pump");
		await expect.poll(names).toEqual(["Pump replacement"]);
		expect(visits.map((visit) => visit.replace)).toEqual([false, true]);
	});

	test("a search typed just before leaving the page doesn't undo the navigation", async () => {
		render(Harness, { items });
		await expect.poll(names).toEqual(byName);

		await page.getByRole("textbox", { name: "Search items…" }).fill("pump");
		// A link clicked before typing paused, its page still loading.
		leaveFor("/customers");
		await expect.poll(names).toEqual(["Pump replacement"]);
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect(visits).toEqual([]);
	});

	test("a search typed while the page itself loads other rows still goes into the URL", async () => {
		render(Harness, { items });
		await expect.poll(names).toEqual(byName);

		// The table's own last change, on its way.
		leaveFor("/items?status=open");
		await page.getByRole("textbox", { name: "Search items…" }).fill("pump");
		await expect.poll(lastSearch).toBe("?q=pump");
	});

	test("the rows show sorted and filtered as the URL says", async () => {
		visit("/items?status=draft,open,closed&sort=-amount,name&row=2&tab=notes");
		render(Harness, { items });

		await expect
			.poll(names)
			.toEqual([
				"Boiler service",
				"Air handler check",
				"Compressor overhaul",
				"Elevator inspection",
				"Generator install",
				"Pump replacement",
				"Chiller repair",
			]);
		await expect.poll(textOf(statusPill())).toBe("Status 3 selected");
		await expect.element(columnHeader("Amount")).toHaveAccessibleName(/sorted descending/);
		expect(visits).toEqual([]);
	});

	test("invalid parameters are ignored", async () => {
		visit("/items?status=bogus&sort=nothing&row=-3&page=2&size=7");
		render(Harness, { items });

		await expect.poll(names).toEqual(byName);
		expect(visits).toEqual([]);
		expect(statusPill().elements()).toHaveLength(0);
	});

	test("going back to an earlier URL takes the table back", async () => {
		render(Harness, { items });

		await openStatusFilter();
		await facet("Closed").click();
		await expect.poll(lastSearch).toBe("?status=closed");
		await userEvent.keyboard("{Escape}");
		await expect.poll(names).toEqual(["Chiller repair", "Pump replacement"]);

		visit("/items", { clear: false });
		await expect.poll(names).toEqual(byName);
		await expect.element(statusPill()).not.toBeInTheDocument();

		visit("/items?status=closed&sort=-name", { clear: false });
		await expect.poll(names).toEqual(["Pump replacement", "Chiller repair"]);
		// Following the URL doesn't change it again.
		expect(visits).toHaveLength(1);
	});

	test("Reset goes back to an unfiltered URL", async () => {
		visit("/items?q=pump&status=closed");
		render(Harness, { items });
		await expect.poll(names).toEqual(["Pump replacement"]);

		await page.getByRole("button", { name: "Reset" }).click();
		await expect.poll(lastSearch).toBe("");
		await expect.poll(names).toEqual(byName);
	});
});
