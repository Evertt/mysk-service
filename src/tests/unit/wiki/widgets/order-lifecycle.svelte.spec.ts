import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import OrderLifecycle from "#wiki/widgets/order-lifecycle/order-lifecycle.svelte";

const edge = (verb: string, to: string) =>
	document.querySelector(`[data-verb="${verb}"][data-to="${to}"]`);

test("choosing quote marks its plan edge to scheduled, made by a planner", async () => {
	await render(OrderLifecycle);
	expect(edge("plan", "scheduled")?.hasAttribute("data-active")).toBe(false);
	// The office's moves by hand are drawn only around a chosen status.
	expect(edge("set", "cancelled")).toBeNull();
	expect(edge("accept", "quote")?.hasAttribute("data-active")).toBe(false);

	await page.getByRole("button", { name: "Quote", exact: true }).click();

	await expect.poll(() => edge("plan", "scheduled")?.hasAttribute("data-active")).toBe(true);
	const move = page.getByTestId("leaves-plan-scheduled");
	await expect.element(move).toHaveTextContent("plan to Scheduled, by a planner");
	// What arrives at quote is shown, but isn't what leaves it.
	expect(edge("accept", "quote")?.hasAttribute("data-active")).toBe(false);
	expect(edge("accept", "quote")?.hasAttribute("data-incoming")).toBe(true);
});

test("the chosen status says so, and the office's own moves from it are drawn too", async () => {
	await render(OrderLifecycle);
	const quote = page.getByRole("button", { name: "Quote", exact: true });
	await quote.click();

	await expect.element(quote).toHaveAttribute("aria-current", "true");
	expect(edge("set", "cancelled")?.hasAttribute("data-active")).toBe(true);
	await expect
		.element(page.getByTestId("leaves-set-cancelled"))
		.toHaveTextContent("set to Cancelled, by the office");
});

test("an invoiced order only leaves by voiding its invoice", async () => {
	await render(OrderLifecycle);
	await page.getByRole("button", { name: "Invoiced", exact: true }).click();

	const moves = page.getByRole("list", { name: "Leaves by" }).getByRole("listitem");
	await expect.element(moves).toHaveTextContent("uninvoice to Completed, by invoicing");
	expect(moves.all()).toHaveLength(1);
});
