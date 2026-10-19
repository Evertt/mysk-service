import { error } from "@sveltejs/kit";
import { toast } from "svelte-sonner";
import { beforeEach, expect, test, vi } from "vite-plus/test";

import { submitted } from "#lib/components/form/submitted.ts";
import { m } from "#lib/paraglide/messages.js";

vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
	vi.mocked(toast.error).mockClear();
});

test("an accepted submission is true, without a toast", async () => {
	expect(await submitted(async () => true)).toBe(true);
	expect(toast.error).not.toHaveBeenCalled();
});

test("a submission the server refused (its issues show at the fields) is false, without a toast", async () => {
	expect(await submitted(async () => false)).toBe(false);
	expect(toast.error).not.toHaveBeenCalled();
});

test("a submission that threw an error(…) is false, and toasts its message", async () => {
	const failing = async (): Promise<boolean> => error(409, "This category is in use.");

	expect(await submitted(failing)).toBe(false);
	expect(toast.error).toHaveBeenCalledExactlyOnceWith("This category is in use.");
});

test("a submission that failed otherwise (a 500, the network) is false, and toasts the generic error", async () => {
	const failing = async (): Promise<boolean> => {
		throw new TypeError("Failed to fetch");
	};

	expect(await submitted(failing)).toBe(false);
	expect(toast.error).toHaveBeenCalledExactlyOnceWith(m.common_error_generic());
});

test("submits once", async () => {
	const submit = vi.fn(async () => true);
	await submitted(submit);
	expect(submit).toHaveBeenCalledOnce();
});
