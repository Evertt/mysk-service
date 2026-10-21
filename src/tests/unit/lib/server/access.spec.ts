/**
 * Guards for the access rules (`#lib/server/access/`), whose behaviour is in
 * `access/matrix.spec.ts` and each module's `tests/unit/server/access.spec.ts`:
 *
 * 1. every logged type has a rule: the core's entries are the core's subject types, and each
 *    module's are its own `subjects`, no more, no fewer (a new type nobody wrote a rule for fails
 *    here, and the types check too), so together they are `everyLoggedType()`.
 *
 * Runs in the server harness only because the modules' server halves import the remote functions.
 */
import { describe, expect, test } from "vite-plus/test";

import { coreSubjectTypes, everyLoggedType } from "#lib/activity/subjects.ts";
import { modules } from "#lib/modules/manifests.ts";
import { coreRules } from "#lib/server/access/core.ts";
import { generatedServerModules } from "#lib/server/modules/hooks.gen.ts";
import { as, north } from "#unit/lib/server/harness/index.ts";

/** The rules a module contributes to `access.rules`, by type (none when it contributes none). */
const rulesOf = (id: string) =>
	generatedServerModules()
		.filter((module) => module.id === id)
		.flatMap(({ contributions }) => contributions)
		.filter(({ point }) => point.id === "access.rules")
		.flatMap(({ answer }) => Object.keys((answer as () => object)()));

const subjectsOf = (module: (typeof modules)[number]) =>
	"subjects" in module ? Object.keys(module.subjects) : [];

describe("every logged type has a rule", () => {
	test("the core's subject types are the core's rules", () => {
		expect(Object.keys(coreRules).toSorted()).toEqual(Object.keys(coreSubjectTypes).toSorted());
	});

	for (const module of modules.filter((each) => subjectsOf(each).length)) {
		test(`the ${module.id} module's subject types are its rules`, async () => {
			const rules = await as(north.owner, () => rulesOf(module.id));
			expect(rules.toSorted()).toEqual(subjectsOf(module).toSorted());
		});
	}

	test("together they cover every type the log names", async () => {
		const covered = await as(north.owner, () => [
			...Object.keys(coreRules),
			...modules.flatMap((module) => rulesOf(module.id)),
		]);
		expect(covered.toSorted()).toEqual(everyLoggedType().toSorted());
	});
});
