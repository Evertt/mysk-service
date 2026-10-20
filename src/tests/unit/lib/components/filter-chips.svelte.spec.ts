import { expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import FilterChips from "#lib/components/filter-chips.svelte";

const options = [
	{ value: "3", label: "Fire doors", count: 5 },
	{ value: "4", label: "Sectional doors", count: 1200 },
];

test("shows the label, the chips with their counts, and the chosen one pressed", async () => {
	render(FilterChips, {
		label: "Category",
		showLabel: true,
		options,
		value: "3",
		all: { label: "All", count: 1205 },
		onchange: () => {},
	});

	await expect.element(page.getByRole("group", { name: "Category" })).toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "Fire doors 5" }))
		.toHaveAttribute("aria-pressed", "true");
	await expect
		.element(page.getByRole("button", { name: "All 1,205" }))
		.toHaveAttribute("aria-pressed", "false");
	await expect.element(page.getByRole("button", { name: "Sectional doors 1,200" })).toBeVisible();
});

test("chooses one chip at a time, none for 'all' or the chosen one again", async () => {
	const onchange = vi.fn();
	const { rerender } = await render(FilterChips, {
		label: "Category",
		options,
		value: null,
		all: { label: "All" },
		onchange,
	});

	await expect
		.element(page.getByRole("button", { name: "All" }))
		.toHaveAttribute("aria-pressed", "true");
	await page.getByRole("button", { name: /Sectional doors/ }).click();
	expect(onchange).toHaveBeenLastCalledWith("4");

	await rerender({ value: "4" });
	await page.getByRole("button", { name: /Sectional doors/ }).click();
	expect(onchange).toHaveBeenLastCalledWith(null);
	await page.getByRole("button", { name: /Fire doors/ }).click();
	expect(onchange).toHaveBeenLastCalledWith("3");
	await page.getByRole("button", { name: "All" }).click();
	expect(onchange).toHaveBeenLastCalledWith(null);
});

test("with an href, each chip links to its page, the current one marked", async () => {
	render(FilterChips, {
		label: "Category",
		options: options.map((option) => ({ ...option, href: `?category=${option.value}` })),
		value: "4",
		all: { label: "All", href: "?" },
		"data-sveltekit-replacestate": "",
	});

	const group = page.getByRole("group", { name: "Category" });
	await expect.element(group).toHaveAttribute("data-sveltekit-replacestate", "");
	await expect
		.element(group.getByRole("link", { name: /Sectional doors/ }))
		.toHaveAttribute("aria-current", "page");
	await expect
		.element(group.getByRole("link", { name: /Fire doors/ }))
		.toHaveAttribute("href", "?category=3");
	const all = group.getByRole("link", { name: "All" });
	await expect.element(all).not.toHaveAttribute("aria-current");
	await expect.element(all).toHaveAttribute("data-chip", "all");
	expect(group.getByRole("button").elements()).toHaveLength(0);
});
