import { invalid } from "@sveltejs/kit";

/** Whether a database error (or its cause, when wrapped by drizzle) is a failed foreign key. */
export function isForeignKeyViolation(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const code = (error as { code?: unknown }).code;
	if (
		code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
		/FOREIGN KEY constraint failed/.test(error.message)
	) {
		return true;
	}
	return isForeignKeyViolation(error.cause);
}

/**
 * Runs a delete inside a remote form; if other rows still refer to the record, refuses with
 * `message` (shown by `DeleteDialog`) instead of failing. Sections check the references they know
 * about first, with a specific message; this catches the rest, e.g. rows of optional modules that
 * the core sections don't know about.
 */
export async function deleteOrRefuse(run: () => Promise<unknown>, message: string) {
	try {
		await run();
	} catch (error) {
		if (isForeignKeyViolation(error)) invalid(message);
		throw error;
	}
}
