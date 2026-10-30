import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import LiveFlow from "#wiki/widgets/live-flow/live-flow.svelte";

const current = () => document.querySelector("[data-current]")?.getAttribute("data-step");

test("Next and Back step through the flow, and stop at its ends", async () => {
	await render(LiveFlow);
	const [back, next] = [
		page.getByRole("button", { name: "Back" }),
		page.getByRole("button", { name: "Next" }),
	];
	expect(current()).toBe("change");
	await expect.element(back).toBeDisabled();

	await next.click();
	await expect.poll(current).toBe("log");
	await expect.element(page.getByText("recordActivity() logs it")).toBeVisible();
	await expect
		.element(page.getByRole("link", { name: "src/lib/server/activity/log.ts" }))
		.toHaveAttribute("rel", "noopener noreferrer");

	await next.click();
	await next.click();
	await expect.poll(current).toBe("refresh");
	await expect.element(next).toBeDisabled();

	await back.click();
	await expect.poll(current).toBe("feed");
});

test("Play walks to the last step and stops there", async () => {
	await render(LiveFlow, { pace: 20 });
	await page.getByRole("button", { name: "Play" }).click();

	await expect.poll(current).toBe("refresh");
	await expect.element(page.getByRole("button", { name: "Play again" })).toBeVisible();
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(current()).toBe("refresh");
});
