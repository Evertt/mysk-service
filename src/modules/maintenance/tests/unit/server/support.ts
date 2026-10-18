/**
 * What the maintenance module's server specs share: switching the module on for a tenant of the
 * seed that hasn't it (South), as its owner does on the settings page, for as long as a spec needs
 * it. The harness's `withoutModule()` does the opposite; this one is the module's own (as the
 * contracts module's is), since a module's tests import no other's.
 */
import type { ModuleId } from "#lib/modules/ids.ts";
import { setModules } from "#routes/(app)/settings/settings.remote.ts";
import { as, north, shltr, south, submit } from "#unit/lib/server/harness/index.ts";

/**
 * Switches `moduleId` on for `organization` until `work` is done, then off again, through the
 * settings page's form (`setModules`, which logs both). For a module the tenant hasn't.
 */
export async function withModule<T>(
	organization: "north" | "south" | "shltr",
	moduleId: ModuleId,
	work: () => Promise<T>,
): Promise<T> {
	const { owner } = { north, south, shltr }[organization];
	const change = async (to: "enable" | "disable") => {
		const answer = await as(owner, () => submit(setModules, { [to]: [moduleId] }));
		if (answer.status !== 200) throw new Error(`${to} ${moduleId}: ${JSON.stringify(answer)}`);
	};
	await change("enable");
	try {
		return await work();
	} finally {
		await change("disable");
	}
}
