import { error, invalid } from "@sveltejs/kit";

/**
 * Why a change can't be made: a message, about one of the form's fields (`path`, from the form's
 * root: `["name"]`, `["lines", 2, "quantity"]`, `["modules", "materials", "lines", 0, "quantity"]`)
 * or, without one, about the whole change. It's a validation issue as it is.
 */
export interface Problem {
	message: string;
	path?: readonly (string | number)[];
}

/**
 * The one way server code refuses a change: `throw new Refused(m.x())`, or with problems on the
 * form's fields, `throw new Refused({ path: ["name"], message: m.y() })`. Thrown, so the
 * transaction it's in stores none of the change. Services in `server/` throw it; the remote
 * function that called them needn't catch it: `gated()` (`remote-functions.ts`) turns it into the
 * form's issues, each on its field, or for a command or query into a 400 with the messages. A bulk
 * action skips the record with its messages (`bulkChange()`).
 *
 * A refusal that carries more for a caller that handles it (`StockShortage`'s material) extends it.
 */
export class Refused extends Error {
	readonly problems: Problem[];

	constructor(...problems: (Problem | string)[]) {
		const all = problems.map((problem) =>
			typeof problem === "string" ? { message: problem } : problem,
		);
		super(all.map((problem) => problem.message).join("; "));
		this.name = "Refused";
		this.problems = all;
	}

	/** Throws a `Refused` with `problems` if there are any, e.g. a form's checks' answers. */
	static check(problems: readonly (Problem | string)[]): void {
		if (problems.length) throw new Refused(...problems);
	}
}

/**
 * Turns a `Refused` into what the remote function answers with: a form's issues (`invalid()`), or
 * a 400 with its messages for a command or a query, which have no fields to show them on.
 * Rethrows anything else.
 */
export function answerRefusal(thrown: unknown, kind: "form" | "call"): never {
	if (thrown instanceof Refused) {
		if (kind === "form") invalid(...thrown.problems);
		error(400, thrown.message);
	}
	throw thrown;
}
