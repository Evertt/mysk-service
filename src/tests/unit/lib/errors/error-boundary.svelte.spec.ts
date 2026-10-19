import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { AUTO_RESET_WINDOW_MS } from "#lib/errors/auto-reset.ts";

import Harness, { control } from "./error-boundary.test-harness.svelte";

// The page the part is on, and no new version; navigating isn't part of these tests.
vi.mock("$app/state", () => ({
	page: { url: new URL("http://localhost/orders/ORD-1") },
	updated: { current: false },
}));
vi.mock("$app/navigation", () => ({ afterNavigate: () => {} }));
// Nothing is sent to a server.
vi.mock("#lib/errors/report.ts", () => ({ report: vi.fn() }));
const toast = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast }));

const logged = vi.spyOn(console, "error");

beforeEach(() => {
	logged.mockImplementation(() => {});
	control.error = () => new Error("The part failed");
});

afterEach(() => {
	logged.mockReset();
	toast.info.mockReset();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const works = () => page.getByText("The part works");
const tryAgain = () => page.getByRole("button", { name: "Try again" });

test("an unknown error resets the part once by itself, with a toast", async () => {
	control.failures = 1;
	render(Harness);

	await expect.element(works()).toBeVisible();
	expect(toast.info).toHaveBeenCalledExactlyOnceWith(
		"Something went wrong, so it was loaded again.",
	);
	expect(logged).toHaveBeenCalledWith(
		"test failed",
		expect.objectContaining({ message: "The part failed" }),
	);
});

test("failing again within 30 s, it shows its card, and Try again renders it anew", async () => {
	control.failures = 2;
	render(Harness);

	await expect.element(page.getByText("This part couldn't be shown.")).toBeVisible();
	expect(toast.info).toHaveBeenCalledOnce();

	await tryAgain().click();
	await expect.element(works()).toBeVisible();
});

test("30 s after it reset by itself, it does so again", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	control.failures = 2;
	render(Harness);
	await expect.element(page.getByText("This part couldn't be shown.")).toBeVisible();

	vi.advanceTimersByTime(AUTO_RESET_WINDOW_MS);
	control.failures = 1;
	await tryAgain().click();

	await expect.element(works()).toBeVisible();
	expect(toast.info).toHaveBeenCalledTimes(2);
});

test("a refusal never resets by itself, and says what was refused", async () => {
	control.error = () => ({ status: 404, message: "Order ORD-1 not found", errorId: "e1" });
	control.failures = 1;
	render(Harness);

	await expect.element(page.getByText("Order ORD-1 not found")).toBeVisible();
	expect(toast.info).not.toHaveBeenCalled();
	await expect.element(page.getByText("The part works")).not.toBeInTheDocument();
});

test("offline, it tries again once the browser is back online", async () => {
	const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	control.error = () => new TypeError("Failed to fetch");
	control.failures = 1;
	render(Harness);

	await expect
		.element(page.getByText("This tries again by itself once you're back online."))
		.toBeVisible();
	expect(toast.info).not.toHaveBeenCalled();

	online.mockReturnValue(true);
	window.dispatchEvent(new Event("online"));
	await expect.element(works()).toBeVisible();
});
