import WalletCardsIcon from "@lucide/svelte/icons/wallet-cards";
import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import DarkPanel from "#lib/components/dark-panel.svelte";

test("shows its title and lines, the strong one between rules, attributes on the values", async () => {
	const { container } = await render(DarkPanel, {
		title: "SHLTR Wallet",
		eyebrow: "Bonus year 2026",
		icon: WalletCardsIcon,
		lines: [
			{ label: "Awarded", value: "€3,750.00" },
			{ label: "Spent", value: "– €1,475.00" },
			{ label: "Available now", value: "€2,275.00", strong: true, attributes: { "data-left": "" } },
			{ label: "Valid until", value: "31 Dec 2027" },
		],
		children: createRawSnippet(() => ({ render: () => '<a href="/shop">Spend</a>' })),
		"data-wallet": "",
	});

	const panel = page.getByRole("region", { name: "SHLTR Wallet" });
	await expect.element(panel).toBeVisible();
	await expect.element(panel.getByRole("heading", { name: "SHLTR Wallet" })).toBeVisible();
	await expect.element(page.getByText("Bonus year 2026")).toBeVisible();
	expect(container.querySelector("[data-wallet]")).not.toBeNull();
	expect(
		[...container.querySelectorAll("dt")].map((dt) => [
			dt.textContent?.trim(),
			dt.nextElementSibling?.textContent?.trim(),
		]),
	).toEqual([
		["Awarded", "€3,750.00"],
		["Spent", "– €1,475.00"],
		["Available now", "€2,275.00"],
		["Valid until", "31 Dec 2027"],
	]);
	const strong = container.querySelector("[data-left]")!;
	expect(strong.textContent?.trim()).toBe("€2,275.00");
	expect(strong.parentElement?.getAttribute("class")).toContain("border-y");
	await expect.element(page.getByRole("link", { name: "Spend" })).toBeVisible();
});
