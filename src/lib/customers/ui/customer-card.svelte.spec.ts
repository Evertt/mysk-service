import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import CustomerCard from "./customer-card.svelte";

const customer = {
	code: "C-0012",
	name: "Acme B.V.",
	segment: "enterprise",
	contactName: "Jan de Vries",
	email: "jan@acme.test",
	phone: "+31 20 123 4567",
	city: "Utrecht",
	country: "Netherlands",
} as const;

test("shows the title, the customer's code and segment", async () => {
	render(CustomerCard, { customer, title: "Customer" });

	await expect.element(page.getByText("Customer", { exact: true })).toBeVisible();
	await expect.element(page.getByText("C-0012")).toBeVisible();
	await expect.element(page.getByText("Enterprise", { exact: true })).toBeVisible();
});

test("links the company to its page, and the email address and phone number to mail and tel", async () => {
	render(CustomerCard, { customer, title: "Owner" });

	await expect
		.element(page.getByRole("link", { name: "Acme B.V." }))
		.toHaveAttribute("href", "/customers/C-0012");
	await expect
		.element(page.getByRole("link", { name: "jan@acme.test" }))
		.toHaveAttribute("href", "mailto:jan@acme.test");
	await expect
		.element(page.getByRole("link", { name: "+31 20 123 4567" }))
		.toHaveAttribute("href", "tel:+31 20 123 4567");
});

test("shows the contact person and the place", async () => {
	render(CustomerCard, { customer, title: "Customer" });

	await expect.element(page.getByText("Jan de Vries")).toBeVisible();
	await expect.element(page.getByText("Utrecht, Netherlands")).toBeVisible();
});
