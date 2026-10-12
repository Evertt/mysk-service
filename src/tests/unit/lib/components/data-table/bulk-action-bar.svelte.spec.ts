import { error } from "@sveltejs/kit";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import type { BulkAction, BulkResult } from "#lib/components/data-table/bulk-actions.ts";

import Harness, { type Job } from "./bulk-action-bar.test-harness.svelte";
import { visits } from "./fake-navigation.svelte.ts";

// Opening a page goes to a fake URL.
vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
// The table's toolbar (unused here) brings in the saved views: none.
vi.mock("#lib/components/data-table/views.remote.ts", () => import("./fake-views.svelte.ts"));
vi.mock(
	"#lib/components/data-table/table-memory.remote.ts",
	() => import("./fake-table-memory.ts"),
);

const jobs: Job[] = [
	{ id: 1, name: "Boiler service", status: "open" },
	{ id: 2, name: "Chiller repair", status: "done" },
	{ id: 3, name: "Pump check", status: "open" },
];

const done = (result: Partial<BulkResult> = {}): BulkResult => ({
	done: 1,
	skipped: [],
	missing: 0,
	...result,
});

/** An action that runs at once, for the open jobs. */
const close = (run = vi.fn(async () => done())): BulkAction<Job, any> => ({
	id: "close",
	label: () => "Close",
	skip: (job) => (job.status === "done" ? `${job.name} is done` : undefined),
	run,
});

const select = (name: string) =>
	page.getByRole("row").filter({ hasText: name }).getByRole("checkbox").click();

const bar = () => page.getByRole("region", { name: "Actions on the selected rows" });

describe("the action bar", () => {
	test("appears while rows are selected, saying how many", async () => {
		render(Harness, { jobs, actions: [close()] });
		await expect.element(bar()).not.toBeInTheDocument();

		await select("Boiler service");
		await expect.element(bar()).toBeVisible();
		await expect.element(bar().getByText("1 selected")).toBeVisible();

		await select("Pump check");
		await expect.element(bar().getByText("2 selected")).toBeVisible();
	});

	test("announces the count to screen readers", async () => {
		const { container } = render(Harness, { jobs, actions: [close()] });
		const live = container.querySelector('[data-slot="bulk-action-count"]')!;
		expect(live.textContent?.trim()).toBe("");

		await select("Boiler service");
		await expect.poll(() => live.textContent?.trim()).toBe("1 selected");
	});

	test("clears the selection with its button, or Escape", async () => {
		render(Harness, { jobs, actions: [close()] });
		await select("Boiler service");
		await bar().getByRole("button", { name: "Clear selection" }).click();
		await expect.element(bar()).not.toBeInTheDocument();
		await expect.element(page.getByRole("checkbox", { checked: true })).not.toBeInTheDocument();

		await select("Boiler service");
		(bar().getByRole("button", { name: "Close" }).element() as HTMLElement).focus();
		await userEvent.keyboard("{Escape}");
		await expect.element(bar()).not.toBeInTheDocument();
	});

	test("runs an action on the selected rows' ids and reports the result", async () => {
		const run = vi.fn(async () => done({ done: 2 }));
		render(Harness, { jobs, actions: [close(run)] });
		await select("Boiler service");
		await select("Pump check");

		await bar().getByRole("button", { name: "Close" }).click();

		expect(run).toHaveBeenCalledWith({ ids: [1, 3] }, undefined);
		await expect.element(page.getByText("2 updated")).toBeVisible();
		// The selection is cleared.
		await expect.element(bar()).not.toBeInTheDocument();
	});

	test("reports what it skipped, and why", async () => {
		const run = vi.fn(async () =>
			done({ skipped: [{ label: "Chiller repair", reason: "Chiller repair is done" }] }),
		);
		render(Harness, { jobs, actions: [close(run)] });
		await select("Boiler service");
		await select("Chiller repair");

		await bar().getByRole("button", { name: "Close" }).click();

		await expect.element(page.getByText("1 updated, 1 skipped")).toBeVisible();
		await expect.element(page.getByText("Chiller repair is done")).toBeVisible();
	});

	test("disables an action that applies to none of the selected rows, saying why", async () => {
		const run = vi.fn(async () => done());
		render(Harness, { jobs, actions: [close(run)] });
		await select("Chiller repair");

		const button = bar().getByRole("button", { name: "Close" });
		await expect.element(button).toHaveAttribute("aria-disabled", "true");
		await expect.element(button).toHaveAccessibleDescription("Chiller repair is done");
		await button.click({ force: true });
		expect(run).not.toHaveBeenCalled();

		// With a row it applies to, it's enabled again.
		await select("Pump check");
		await expect.element(button).not.toHaveAttribute("aria-disabled");
	});

	test("asks first when the action wants confirming, then runs it", async () => {
		const run = vi.fn(async () => done({ done: 2 }));
		const remove: BulkAction<Job, any> = {
			id: "delete",
			label: () => "Delete",
			destructive: true,
			skip: (job) => (job.status === "done" ? `${job.name} is done` : undefined),
			confirm: { title: (count) => `Delete ${count} jobs?`, description: () => "For good." },
			run,
			done: ({ count }) => `${count} deleted`,
		};
		render(Harness, { jobs, actions: [remove] });
		await select("Boiler service");
		await select("Chiller repair");

		await bar().getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await expect.element(dialog.getByText("Delete 2 jobs?")).toBeVisible();
		await expect
			.element(dialog.getByText("Applies to 1 of the 2 selected; the others are skipped."))
			.toBeVisible();
		expect(run).not.toHaveBeenCalled();

		await dialog.getByRole("button", { name: "Delete" }).click();
		expect(run).toHaveBeenCalledWith({ ids: [1, 2] }, undefined);
		await expect.element(page.getByText("2 deleted")).toBeVisible();
		await expect.element(dialog).not.toBeInTheDocument();
	});

	test("asks for an action's parameter, from options it loads", async () => {
		const run = vi.fn(async () => done());
		const assign: BulkAction<Job, any> = {
			id: "assign",
			label: () => "Assign",
			parameter: {
				label: () => "Engineer",
				title: (count) => `Assign ${count} jobs`,
				options: async () => [
					{ value: "7", label: "Anna" },
					{ value: "8", label: "Bram" },
				],
			},
			run,
		};
		render(Harness, { jobs, actions: [assign] });
		await select("Boiler service");

		await bar().getByRole("button", { name: "Assign" }).click();
		const dialog = page.getByRole("alertdialog");
		const apply = dialog.getByRole("button", { name: "Apply" });
		await expect.element(apply).toBeDisabled();
		await dialog.getByLabelText("Engineer").selectOptions("Bram");
		await apply.click();

		expect(run).toHaveBeenCalledWith({ ids: [1] }, "8");
	});

	test("puts actions beyond the first few in a menu", async () => {
		const actions = ["One", "Two", "Three", "Four"].map((name): BulkAction<Job, any> => ({
			id: name,
			label: () => name,
			run: async () => done(),
		}));
		render(Harness, { jobs, actions });
		await select("Boiler service");

		await expect.element(bar().getByRole("button", { name: "One" })).toBeVisible();
		await expect.element(bar().getByRole("button", { name: "Two" })).toBeVisible();
		await expect.element(bar().getByRole("button", { name: "Three" })).not.toBeInTheDocument();
		await bar().getByRole("button", { name: "More actions" }).click();
		await expect.element(page.getByRole("menuitem", { name: "Three" })).toBeVisible();
		await expect.element(page.getByRole("menuitem", { name: "Four" })).toBeVisible();
	});

	test("opens the page a result points to", async () => {
		render(Harness, { jobs, actions: [close(vi.fn(async () => done({ href: "/invoices/1" })))] });
		await select("Boiler service");
		await bar().getByRole("button", { name: "Close" }).click();
		await expect.poll(() => visits.at(-1)?.url).toBe("/invoices/1");
	});

	test("shows a refusal of the whole action", async () => {
		const run = vi.fn(async () => error(400, "Select orders of one customer"));
		render(Harness, { jobs, actions: [close(run)] });
		await select("Boiler service");
		await bar().getByRole("button", { name: "Close" }).click();
		await expect.element(page.getByText("Select orders of one customer")).toBeVisible();
	});
});

test("the table shows the new values of rows that come back changed, e.g. after an action", async () => {
	const { rerender } = render(Harness, { jobs, actions: [close()] });
	await expect.element(page.getByRole("row", { name: /Boiler service open/ })).toBeVisible();
	await rerender({ jobs: jobs.map((job) => ({ ...job, status: "done" as const })) });
	await expect.element(page.getByRole("row", { name: /Boiler service done/ })).toBeVisible();
});

describe("in a server-side table", () => {
	const where = { q: "pump", filters: { status: ["open"] } };
	const matching = { where, key: "status=open", count: 40 };

	test("with the whole page selected, offers to select all matching rows, and acts on them", async () => {
		const run = vi.fn(async () => done({ done: 40 }));
		render(Harness, { jobs, actions: [close(run)], matching });

		await select("Boiler service");
		const selectAll = bar().getByRole("button", { name: "Select all 40 matching" });
		await expect.element(selectAll).not.toBeInTheDocument();

		await page.getByRole("checkbox", { name: "Select all rows on this page" }).click();
		await selectAll.click();
		await expect.element(bar().getByText("All 40 matching selected")).toBeVisible();
		// The shown rows don't decide what it applies to then.
		await expect
			.element(bar().getByRole("button", { name: "Close" }))
			.not.toHaveAttribute("aria-disabled");

		await bar().getByRole("button", { name: "Close" }).click();
		expect(run).toHaveBeenCalledWith({ matching: where }, undefined);
	});

	test("unselecting a row goes back to the selected ones", async () => {
		render(Harness, { jobs, actions: [close()], matching });
		await page.getByRole("checkbox", { name: "Select all rows on this page" }).click();
		await bar().getByRole("button", { name: "Select all 40 matching" }).click();
		await select("Pump check");
		await expect.element(bar().getByText("2 selected")).toBeVisible();
	});

	test("an action that can't act on all matching rows is disabled for them", async () => {
		const once: BulkAction<Job, any> = { ...close(), matching: false };
		render(Harness, { jobs, actions: [once], matching });
		await page.getByRole("checkbox", { name: "Select all rows on this page" }).click();
		await expect
			.element(bar().getByRole("button", { name: "Close" }))
			.not.toHaveAttribute("aria-disabled");
		await bar().getByRole("button", { name: "Select all 40 matching" }).click();
		await expect
			.element(bar().getByRole("button", { name: "Close" }))
			.toHaveAttribute("aria-disabled", "true");
	});
});
