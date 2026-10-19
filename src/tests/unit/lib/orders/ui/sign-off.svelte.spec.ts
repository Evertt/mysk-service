import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import SignOff from "#lib/orders/ui/sign-off.svelte";
import { drawn } from "#unit/signature.test-support.ts";

const signoff = {
	signerName: "Bram de Vries",
	signature: drawn,
	engineerName: "Erik Jansen",
	engineerSignature: drawn,
	signedAt: Temporal.Instant.from("2026-10-14T13:30:00Z"),
};

test("says who signed off and when, then both signatures, each labelled with its signer", async () => {
	render(SignOff, { signoff });

	await expect.element(page.getByText(/^Signed off by Bram de Vries on .*2026/)).toBeVisible();
	await expect.element(page.getByRole("img", { name: "Signature of Bram de Vries" })).toBeVisible();
	await expect.element(page.getByRole("img", { name: "Signature of Erik Jansen" })).toBeVisible();
	await expect.element(page.getByText("Customer: Bram de Vries")).toBeVisible();
	await expect.element(page.getByText("Engineer: Erik Jansen")).toBeVisible();
	expect(page.getByText(/Collected by/).elements()).toHaveLength(0);
});

test("of a sign-off without the engineer's signature, shows only the customer's", async () => {
	render(SignOff, { signoff: { ...signoff, engineerName: null, engineerSignature: null } });

	await expect.element(page.getByRole("img", { name: "Signature of Bram de Vries" })).toBeVisible();
	expect(page.getByRole("img").elements()).toHaveLength(1);
	expect(page.getByText(/^Engineer:/).elements()).toHaveLength(0);
});

test("says who in the office collected it, when the sign-off has it", async () => {
	render(SignOff, { signoff: { ...signoff, collectedBy: "Pieter Bakker" } });

	await expect.element(page.getByText("Collected by Pieter Bakker")).toBeVisible();
});
