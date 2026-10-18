/**
 * What the contracts module's server specs share: switching the module on for a tenant of the
 * seed that hasn't it (South), as its owner does on the settings page, for as long as a spec needs
 * it (the harness's `withoutModule()` does the opposite), and the contract form's fields.
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

/** A contract's form as the page sends it: ids as strings, days as `yyyy-mm-dd`, fee in euros. */
export function contractForm(fields: {
	customerId: number;
	equipmentIds: number[];
	level?: string;
	startsOn: string;
	endsOn: string;
	monthlyFee?: number;
	responseHours?: number;
	notes?: string;
}) {
	return {
		customerId: String(fields.customerId),
		level: fields.level ?? "standard",
		startsOn: fields.startsOn,
		endsOn: fields.endsOn,
		monthlyFee: fields.monthlyFee ?? 50,
		responseHours: fields.responseHours ?? 24,
		notes: fields.notes ?? "",
		equipmentIds: fields.equipmentIds.map(String),
	};
}
