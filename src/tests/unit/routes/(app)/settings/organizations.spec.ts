/**
 * What switching organizations and switching modules refuse, on the seeded demo database: an
 * organization the user isn't a member of (before better-auth is asked), a module form that
 * switches nothing, and a planner switching modules. The server side of
 * `src/tests/e2e/tenancy.test.ts`, which keeps the switch, the modules switched on and off and the
 * sidebar following them (and `i18n.test.ts` the refused switch, translated).
 */
import { describe, expect, test } from "vite-plus/test";

import { switchOrganization } from "#lib/auth/session.remote.ts";
import { setModules } from "#routes/(app)/settings/settings.remote.ts";
import { as, north, organizationId, rows, south, submit } from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

const modulesOf = (organization: string) =>
	rows<{ module_id: string }>(
		`select module_id from organization_module where organization_id = ? order by module_id`,
		[organization],
	);
const switches = (organization: string) =>
	rows(
		`select subject_id, action from activity where organization_id = ? and subject_type = 'module'`,
		[organization],
	);

describe("switching organization", () => {
	test("to one the user isn't a member of is refused", async () => {
		expect(
			await as(south.owner, () => submit(switchOrganization, { organizationId: "org-elsewhere" })),
		).toMatchObject({ status: 403, message: "You're not a member of that organization" });
		// North's planner isn't South's.
		expect(
			await as(north.member, () => submit(switchOrganization, { organizationId: southId })),
		).toMatchObject({ status: 403 });
	});
});

describe("switching modules", () => {
	test("a submission that switches nothing is refused, saying so", async () => {
		const [before, logged] = [await modulesOf(southId), await switches(southId)];
		const answer = await as(south.owner, () => submit(setModules, { enable: [], disable: [] }));
		expect(answer.status).toBe(400);
		expect(answer.issues?.map((issue) => issue.message)).toEqual([
			"Choose a module to switch on or off.",
		]);
		expect(await modulesOf(southId)).toEqual(before);
		expect(await switches(southId)).toEqual(logged);
	});

	test("isn't a planner's", async () => {
		const [before, logged] = [await modulesOf(northId), await switches(northId)];
		expect(
			await as(north.member, () => submit(setModules, { enable: [], disable: ["contracts"] })),
		).toMatchObject({ status: 403 });
		expect(await modulesOf(northId)).toEqual(before);
		expect(await switches(northId)).toEqual(logged);
	});
});
