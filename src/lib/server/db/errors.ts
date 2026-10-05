import { invalid } from "@sveltejs/kit";

/** Whether a database error (or its cause, when wrapped by drizzle) is a failed foreign key. */
export function isForeignKeyViolation(error: unknown): boolean {
	for (let cause = error; cause instanceof Error; cause = cause.cause) {
		const code = (cause as { code?: unknown }).code;
		if (
			code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
			/FOREIGN KEY constraint failed/.test(cause.message)
		) {
			return true;
		}
	}
	return false;
}

/**
 * Runs a write inside a remote form; if it breaks a reference (the database refuses it with a
 * foreign key error), refuses with `issues` instead of failing. E.g. deleting a record that other
 * rows still refer to. Sections check the references they know about first, with a specific
 * message; this catches the rest, e.g. rows of optional modules that the core sections don't know
 * about.
 */
export async function refuseIfReferenced(
	run: () => Promise<unknown>,
	...issues: Parameters<typeof invalid>
) {
	try {
		await run();
	} catch (error) {
		if (isForeignKeyViolation(error)) invalid(...issues);
		throw error;
	}
}
