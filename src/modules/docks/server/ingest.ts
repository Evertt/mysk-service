/**
 * Applying a batch of Salvo events (`/docks/ingest`, see `docs/salvo-events.md`), in the current
 * tenant (the token's, see `guardedIntegration()`): in one transaction, in time order, each event
 * once by its id. A batch naming a dock the tenant doesn't have is refused as a whole. Telemetry
 * isn't logged in the activity log (there's a lot of it): the board hears of it through
 * `announceChange()`, and the rules (`checkDoors()`) log what they do.
 */
import { and, eq, isNull } from "drizzle-orm";

import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { announceChange } from "#lib/server/changes.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList, insertRows } from "#lib/server/db/parameters.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";

import {
	applyEvent,
	type DockFacts,
	type EventOutcome,
	initialFacts,
	type SessionFacts,
} from "../model.ts";
import type { IncomingEvent } from "./events.ts";
import { dockEvent, dockPosition, dockSession, dockState } from "./schema.ts";

/** What came of a batch: per event in the order sent, and the counts. */
interface BatchResult {
	results: { id: string; outcome: EventOutcome }[];
	applied: number;
	duplicates: number;
	stale: number;
}

/** A batch refused because it names docks the tenant doesn't have (another tenant's included). */
export class UnknownDocks extends Error {
	constructor(readonly codes: string[]) {
		super(`Unknown docks: ${codes.join(", ")}`);
	}
}

/** The live state of a dock as stored, or a new dock's. */
type StoredState = typeof dockState.$inferSelect;

const factsOf = (row: StoredState | undefined): DockFacts =>
	row
		? {
				locked: row.locked,
				doorOpenSince: row.doorOpenSince,
				scpOnline: row.scpOnline,
				faultReason: row.faultReason,
				keyLocation: row.keyLocation,
				doorAlert: row.doorAlert,
				lastEventAt: row.lastEventAt,
			}
		: initialFacts();

/** A dock as the batch goes: its facts, and the sessions it touched (the open one at `open`). */
interface DockRun {
	id: number;
	facts: DockFacts;
	sessions: SessionFacts[];
	/** The open session's index in `sessions`, or -1. */
	open: number;
	changed: boolean;
}

/** A stored session as the rules take it. */
const sessionOf = ({
	organizationId: _,
	dockId: __,
	...session
}: typeof dockSession.$inferSelect): SessionFacts => session;

/** Stores a session: updates the stored one, or inserts a new one. */
async function saveSession(tx: Transaction, dockId: number, session: SessionFacts) {
	const { organizationId } = currentTenant();
	const { id, ...values } = session;
	if (id) {
		await tx
			.update(dockSession)
			.set(values)
			.where(and(inTenant(dockSession), eq(dockSession.id, id)));
	} else {
		await tx.insert(dockSession).values({ ...values, organizationId, dockId });
	}
}

/**
 * Applies `events` (validated and in time order, see `parseBatch()`) to the tenant's docks, at
 * `received`. Throws `UnknownDocks` (storing nothing) if any names a dock the tenant lacks.
 */
export async function applyBatch(
	events: IncomingEvent[],
	received = Temporal.Now.instant(),
): Promise<BatchResult> {
	const { organizationId } = currentTenant();
	const result = await db.transaction(async (tx) => {
		const codes = [...new Set(events.map((event) => event.dock))];
		const docks = codes.length
			? await tx
					.select({ id: dockPosition.id, code: dockPosition.code })
					.from(dockPosition)
					.where(and(inTenant(dockPosition), inList(dockPosition.code, codes)))
			: [];
		const idOf = new Map(docks.map((dock) => [dock.code, dock.id]));
		const unknown = codes.filter((code) => !idOf.has(code));
		if (unknown.length) throw new UnknownDocks(unknown);

		const ids = [...new Set(events.map((event) => event.id))];
		const seen = new Set(
			ids.length
				? (
						await tx
							.select({ id: dockEvent.eventId })
							.from(dockEvent)
							.where(and(inTenant(dockEvent), inList(dockEvent.eventId, ids)))
					).map((row) => row.id)
				: [],
		);
		const dockIds = docks.map((dock) => dock.id);
		const [states, sessions] = dockIds.length
			? await Promise.all([
					tx
						.select()
						.from(dockState)
						.where(and(inTenant(dockState), inList(dockState.dockId, dockIds))),
					tx
						.select()
						.from(dockSession)
						.where(
							and(
								inTenant(dockSession),
								inList(dockSession.dockId, dockIds),
								isNull(dockSession.checkedOutAt),
							),
						),
				])
			: [[], []];

		const runs = new Map<number, DockRun>(
			dockIds.map((id) => {
				const open = sessions.find((session) => session.dockId === id);
				const facts = factsOf(states.find((state) => state.dockId === id));
				const run = { id, facts, sessions: open ? [sessionOf(open)] : [], open: open ? 0 : -1 };
				return [id, { ...run, changed: false }];
			}),
		);

		const outcomes = new Map<string, EventOutcome>();
		const stored: (typeof dockEvent.$inferInsert)[] = [];
		for (const event of events) {
			if (seen.has(event.id)) {
				if (!outcomes.has(event.id)) outcomes.set(event.id, "duplicate");
				continue;
			}
			seen.add(event.id);
			const run = runs.get(idOf.get(event.dock)!)!;
			const last = run.facts.lastEventAt;
			const outcome: EventOutcome =
				last && Temporal.Instant.compare(event.at, last) < 0 ? "stale" : "applied";
			outcomes.set(event.id, outcome);
			stored.push({
				organizationId,
				eventId: event.id,
				dockId: run.id,
				type: event.type,
				at: event.at,
				payload: (event.payload ?? null) as Record<string, unknown> | null,
				outcome,
				receivedAt: received,
			});
			if (outcome === "stale") continue;

			const after = applyEvent(run.facts, run.sessions[run.open] ?? null, event);
			// An ended session was the open one; a check-in opens a new one.
			if (after.ended) run.sessions[run.open] = after.ended;
			if (after.session && event.type === "check_in") {
				run.open = run.sessions.push(after.session) - 1;
			} else if (after.session) {
				run.sessions[run.open] = after.session;
			} else {
				run.open = -1;
			}
			run.facts = after.facts;
			run.changed = true;
		}

		await insertRows(tx, dockEvent, stored);
		for (const run of runs.values()) {
			if (!run.changed) continue;
			const values = { ...run.facts, updatedAt: received };
			await tx
				.insert(dockState)
				.values({ organizationId, dockId: run.id, ...values })
				.onConflictDoUpdate({ target: [dockState.organizationId, dockState.dockId], set: values });
			// The ones that ended first: a dock has one open session at most.
			const ordered = run.sessions.toSorted(
				(a, b) => Number(!a.checkedOutAt) - Number(!b.checkedOutAt),
			);
			for (const session of ordered) await saveSession(tx, run.id, session);
		}

		const results = events
			.toSorted((a, b) => a.index - b.index)
			.map((event) => ({ id: event.id, outcome: outcomes.get(event.id) ?? "duplicate" }));
		// One event id sent twice in the batch: the first one counts, the second is a duplicate.
		const counted = new Set<string>();
		for (const each of results) {
			if (counted.has(each.id)) each.outcome = "duplicate";
			counted.add(each.id);
		}
		if (stored.some((event) => event.outcome === "applied")) {
			afterCommit(() => announceChange(organizationId, "dock"));
		}
		return results;
	});
	return {
		results: result,
		applied: result.filter((each) => each.outcome === "applied").length,
		duplicates: result.filter((each) => each.outcome === "duplicate").length,
		stale: result.filter((each) => each.outcome === "stale").length,
	};
}
