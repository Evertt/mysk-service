/**
 * A draft checklist's autosave (`checklistDraft()`), with saves that answer when the test says: an
 * answer that fails to save goes back to the server's, but not over a newer answer given since; and
 * completing waits for what's still to save, and doesn't go ahead once some of it failed.
 */
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { checklistDraft } from "#modules/checklists/detail/checklist-draft.svelte.ts";
import type { PointResult } from "#modules/checklists/model.ts";

vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));

/** A save that answers when the test resolves or rejects it. */
function pending() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = () => yes();
		reject = no;
	});
	return { promise, resolve, reject };
}

const saves = {
	answer: vi.fn<(input: { id: number; result: PointResult | null }) => Promise<unknown>>(),
	remarkOn: vi.fn<(input: { id: number; remark: string }) => Promise<unknown>>(),
	remarkForCustomer: vi.fn<(input: { id: number; remarks: string }) => Promise<unknown>>(),
	complete: vi.fn<(input: { id: number }) => Promise<unknown>>(),
};

beforeEach(() => {
	for (const save of Object.values(saves)) save.mockReset().mockResolvedValue(undefined);
});

/** A draft of two points as the server has them: the first answered, the second not yet. */
function draftOf(second: PointResult | null = null) {
	const checklist = {
		id: 7,
		remarks: null,
		results: [
			{ id: 1, group: "Deur", text: "Panelen", result: "ok" as PointResult | null, remark: null },
			{ id: 2, group: "Deur", text: "Veren", result: second, remark: null },
		],
	};
	return checklistDraft(() => checklist, saves);
}

describe("an answer that fails to save", () => {
	test("leaves a newer answer given since", async () => {
		const draft = checklistDraft(
			() => ({
				id: 7,
				remarks: null,
				results: [{ id: 2, group: "Deur", text: "Veren", result: null, remark: "Gebroken" }],
			}),
			saves,
		);
		const [point] = draft.points;
		const [goed, afkeur] = [pending(), pending()];
		saves.answer.mockReturnValueOnce(goed.promise).mockReturnValueOnce(afkeur.promise);
		draft.setResult(point, "ok");
		draft.setResult(point, "nok");
		goed.reject(new Error("Offline"));
		afkeur.resolve();
		await expect.poll(() => draft.saving).toBe(0);
		// The server has Afkeur, and so does the draft.
		expect(saves.answer.mock.calls.map(([input]) => input.result)).toEqual(["ok", "nok"]);
		expect(point.result).toBe("nok");
	});

	test("goes back to the server's answer, once no newer one is on its way", async () => {
		const draft = draftOf("na");
		const point = draft.points[1];
		saves.answer.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Offline"));
		draft.setResult(point, "ok");
		draft.setResult(point, "nok");
		await expect.poll(() => draft.saving).toBe(0);
		// Goed was saved, Afkeur wasn't: the server has Goed.
		expect(point.result).toBe("ok");

		saves.answer.mockRejectedValue(new Error("Offline"));
		draft.setResult(point, "na");
		draft.setResult(point, "nok");
		await expect.poll(() => draft.saving).toBe(0);
		expect(point.result).toBe("ok");
	});
});

describe("completing", () => {
	test("waits for the answers still to save", async () => {
		const draft = draftOf();
		const answer = pending();
		saves.answer.mockReturnValueOnce(answer.promise);
		draft.setResult(draft.points[1], "ok");
		const completed = draft.complete();
		await Promise.resolve();
		expect(saves.complete).not.toHaveBeenCalled();
		answer.resolve();
		expect(await completed).toBe(true);
		expect(saves.complete).toHaveBeenCalledExactlyOnceWith({ id: 7 });
	});

	test("doesn't go ahead when an answer fails to save meanwhile", async () => {
		const draft = draftOf();
		const answer = pending();
		saves.answer.mockReturnValueOnce(answer.promise);
		draft.setResult(draft.points[1], "ok");
		const completed = draft.complete();
		answer.reject(new Error("Offline"));
		expect(await completed).toBe(false);
		expect(saves.complete).not.toHaveBeenCalled();
		expect(draft.points[1].result).toBeNull();
	});

	test("saves again a remark whose save failed, and doesn't go ahead if it fails again", async () => {
		const draft = draftOf("ok");
		saves.remarkOn.mockRejectedValue(new Error("Offline"));
		draft.setRemark(draft.points[1], "Licht roestig");
		// Its field is left: saved at once.
		draft.flushRemark(draft.points[1]);
		await expect.poll(() => draft.saving).toBe(0);
		expect(await draft.complete()).toBe(false);
		expect(saves.remarkOn).toHaveBeenCalledTimes(2);
		expect(saves.complete).not.toHaveBeenCalled();

		saves.remarkOn.mockResolvedValue(undefined);
		expect(await draft.complete()).toBe(true);
		expect(saves.remarkOn).toHaveBeenCalledTimes(3);
		expect(saves.remarkOn).toHaveBeenLastCalledWith({ id: 2, remark: "Licht roestig" });
	});
});
