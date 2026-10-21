/**
 * Guards for the access rules (`#lib/server/access/`), which the behaviour is in
 * `access/matrix.spec.ts`:
 *
 * 1. every logged type has a rule: the core's entries are the core's subject types, no more, no
 *    fewer (a new type that nobody wrote a rule for fails here, and the types check too).
 */
import { describe, expect, test, vi } from "vite-plus/test";

import { coreSubjectTypes } from "#lib/activity/subjects.ts";
import { coreRules } from "#lib/server/access/core.ts";

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));

describe("every logged type has a rule", () => {
	test("the core's subject types are the core's rules", () => {
		expect(Object.keys(coreRules).toSorted()).toEqual(Object.keys(coreSubjectTypes).toSorted());
	});
});
