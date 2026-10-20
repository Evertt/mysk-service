import { type Problem, Refused } from "../refused.ts";

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
 * Runs a write; if it breaks a reference (the database refuses it with a foreign key error),
 * refuses (`Refused`) with `problems` instead of failing. E.g. deleting a record that other rows
 * still refer to. Sections check the references they know about first, with a specific message;
 * this catches the rest, e.g. rows of optional modules that the core sections don't know about.
 */
export async function refuseIfReferenced<T>(
	run: () => Promise<T>,
	...problems: (Problem | string)[]
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (isForeignKeyViolation(error)) throw new Refused(...problems);
		throw error;
	}
}
