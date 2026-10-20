/**
 * One way to build a dialog: `FormDialog` for a form with fields, `ConfirmDialog` to ask before
 * doing something (`#lib/components/form/`). They own what every copy repeated and the copies let
 * drift: `submitted()`, the toast, closing, the server's refusal, the buttons, and a history entry
 * of the dialog's own, so the back button closes it. So the dialog parts of the kit
 * (`Dialog.Root`, `AlertDialog.Root`) are only used by the shared components in
 * `src/lib/components/`, and by the few dialogs below that are no form.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** Dialogs that are no form (or question), with why. */
const allowed: Record<string, string> = {
	"src/modules/checklists/slots/equipment.detail.side/inspections.svelte":
		"shows a completed checklist, read-only: no form to submit",
};

/** The lines of `source` that open a kit dialog. */
function dialogRoots(source: string) {
	return source
		.split("\n")
		.flatMap((line, index) => (/<(?:Alert)?Dialog\.Root\b/.test(line) ? [index + 1] : []));
}

test("dialogs are built with FormDialog or ConfirmDialog", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter(
			(file) =>
				file.endsWith(".svelte") &&
				!file.startsWith("src/lib/components/") &&
				// Component tests render the kit's parts themselves.
				!file.startsWith("src/tests/") &&
				!(file in allowed),
		)
		.flatMap((file) =>
			dialogRoots(readFileSync(join(root, file), "utf8")).map((line) => `${file}:${line}`),
		);
	expect(found).toEqual([]);
});

test("the allowed dialogs still are dialogs", () => {
	for (const file of Object.keys(allowed)) {
		expect(dialogRoots(readFileSync(join(root, file), "utf8")), file).not.toEqual([]);
	}
});

test("finds a dialog's root, and an alert dialog's", () => {
	expect(dialogRoots("<div>\n\t<Dialog.Root bind:open>\n")).toEqual([2]);
	expect(dialogRoots("<AlertDialog.Root>")).toEqual([1]);
	expect(dialogRoots("<Dialog.Content>\n<FormDialog {form}>")).toEqual([]);
});
