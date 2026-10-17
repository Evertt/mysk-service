/**
 * The docks' simulation for the demo (`simulation.run`, see `#lib/simulation/extensions.ts`): over
 * each tick's interval the demo's Salvo docks (`demoSalvoDocks`) report what the scenario makes
 * happen (`scenario.ts`), through the feed's own path (`receiveBatch()`), so the board, the door
 * rules, the breakdown orders and the sessions work as they do with a real feed. A reset puts the
 * four docks back in the mockup's states (`mockupDocks()`). Both run as the system in the tenant.
 */
import { and, eq, gte, isNotNull, isNull, or } from "drizzle-orm";

import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { announceChange } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";
import type { Simulation } from "#lib/simulation/extensions.ts";

import { demoSalvoDocks, type DemoDock, mockupDocks } from "./demo.ts";
import { maxBatch } from "./events.ts";
import { receiveBatch } from "./feed.ts";
import { factsOf, sessionOf } from "./ingest.ts";
import type { ScenarioDock } from "./scenario.ts";
import { simulateDocks } from "./scenario.ts";
import { dockPosition, dockSession, dockState } from "./schema.ts";

/** The tenant's demo docks with Salvo, with their facts and open session. */
async function demoDocks(): Promise<(ScenarioDock & { id: number })[]> {
	const docks = await db
		.select({ id: dockPosition.id, code: dockPosition.code, state: dockState })
		.from(dockPosition)
		.leftJoin(
			dockState,
			and(
				eq(dockState.organizationId, dockPosition.organizationId),
				eq(dockState.dockId, dockPosition.id),
			),
		)
		.where(
			and(
				inTenant(dockPosition),
				inList(dockPosition.code, [...demoSalvoDocks]),
				isNotNull(dockPosition.scpCode),
			),
		)
		.orderBy(dockPosition.code);
	if (!docks.length) return [];
	const open = await db
		.select()
		.from(dockSession)
		.where(
			and(
				inTenant(dockSession),
				inList(
					dockSession.dockId,
					docks.map((dock) => dock.id),
				),
				isNull(dockSession.checkedOutAt),
			),
		);
	return docks.map(({ id, code, state }) => {
		const session = open.find((each) => each.dockId === id);
		return { id, code, facts: factsOf(state), session: session ? sessionOf(session) : null };
	});
}

/** The batches the feed takes, oldest first; a heartbeat (an empty batch) if there's nothing. */
function batches<T>(events: T[]) {
	if (!events.length) return [[]];
	return Array.from({ length: Math.ceil(events.length / maxBatch) }, (_, i) =>
		events.slice(i * maxBatch, (i + 1) * maxBatch),
	);
}

export const docksSimulation: Simulation = {
	async tick({ from, to, speed }) {
		const docks = await demoDocks();
		if (!docks.length) return;
		const events = simulateDocks(docks, { from, to, speed });
		for (const batch of batches(events)) {
			const received = await receiveBatch({ events: batch }, to);
			if ("issues" in received) {
				throw new Error(`The simulation's batch was refused: ${JSON.stringify(received.issues)}`);
			}
		}
	},

	/**
	 * The four docks as the mockup has them, from now: their state, the truck at each (a new
	 * session), and the sessions that would overlap those (the open ones, and those that ended
	 * after the new truck arrived) gone. Makes no notice or order (see `mockupDocks()`).
	 */
	async reset() {
		const { organizationId } = currentTenant();
		const now = Temporal.Now.instant();
		const states = mockupDocks(now);
		const docks = await demoDocks();
		if (!docks.length) return;
		await db.transaction(async (tx) => {
			for (const dock of docks) {
				const { facts, session } = states[dock.code as DemoDock];
				const since = session?.checkedInAt ?? now;
				await tx
					.delete(dockSession)
					.where(
						and(
							inTenant(dockSession),
							eq(dockSession.dockId, dock.id),
							or(isNull(dockSession.checkedOutAt), gte(dockSession.checkedOutAt, since)),
						),
					);
				const values = { ...facts, updatedAt: now };
				await tx
					.insert(dockState)
					.values({ organizationId, dockId: dock.id, ...values })
					.onConflictDoUpdate({
						target: [dockState.organizationId, dockState.dockId],
						set: values,
					});
				if (session) {
					await tx.insert(dockSession).values({ ...session, organizationId, dockId: dock.id });
				}
			}
			afterCommit(() => announceChange(organizationId, "dock"));
		});
	},
};
