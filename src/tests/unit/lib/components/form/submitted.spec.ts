import { error } from "@sveltejs/kit";
import { toast } from "svelte-sonner";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { ran, submitted } from "#lib/components/form/submitted.ts";
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

describe("ran()", () => {
	test("is true for a command that went through, without a toast", async () => {
		expect(await ran(Promise.resolve("done"))).toBe(true);
		expect(await ran(async () => {})).toBe(true);
		expect(toast.error).not.toHaveBeenCalled();
	});

	test("is false for one that threw an error(…), and toasts its message", async () => {
		expect(await ran(async () => error(409, "This view is in use."), "Couldn't save")).toBe(false);
		expect(toast.error).toHaveBeenCalledExactlyOnceWith("This view is in use.");
	});

	test("is false for one that failed otherwise, and toasts the fallback or the generic error", async () => {
		expect(await ran(Promise.reject(new TypeError("Failed to fetch")), "Couldn't move")).toBe(
			false,
		);
		expect(toast.error).toHaveBeenLastCalledWith("Couldn't move");
		expect(
			await ran(() => {
				throw new Error("sync");
			}),
		).toBe(false);
		expect(toast.error).toHaveBeenLastCalledWith(m.common_error_generic());
	});
});
