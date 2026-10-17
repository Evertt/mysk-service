/**
 * The docks module's demo data: SHLTR's eight docks at Weggemans Logistiek in Barneveld
 * (`docs/plans/shltr-domain.md`, §2.4), linked to the doors, levellers and locations the SHLTR seed
 * made for them ("Sectionaaldeur D-17"…"D-24", "Dockleveller L-01"…, "Dock 01"…); docks 05–08 have
 * Salvo, in the states of the mockup's sample (DOCK 05 Laden, DOCK 06 Bezet and unlocked with the
 * key at the driver, DOCK 07 Vrij, DOCK 08 Storing), with a week of sessions behind them, so the
 * board is full without the simulator. And an integration token for the simulator
 * (`scripts/docks-simulator.ts`), printed at the end: demo data only. North and South don't have
 * the module. With a faker of its own, so the rest of the demo data stays the same.
 */
import { en, Faker, nl } from "@faker-js/faker";
import { and, eq } from "drizzle-orm";

import { customer, customerSite, equipment, equipmentLocation } from "#lib/server/db/schema.ts";
import { DAY, now } from "#lib/server/db/seed/clock.ts";
import { seedIntegrationToken } from "#lib/server/db/seed/integrations.ts";
import { defineSeed } from "#lib/server/db/seed/module-seed.ts";
import { toMoment } from "#lib/server/db/seed/temporal.ts";

import type { KeyLocation } from "../model.ts";
import { demoDockToken } from "./demo.ts";
import { dockEvent, dockEscalation, dockPosition, dockSession, dockState } from "./schema.ts";

const minutes = 60 * 1000;
const at = (ago: number) => toMoment(new Date(now.getTime() - ago * minutes));

const carriers = [
	"AMEX Transport",
	"Van der Wal Logistiek",
	"Bakker Transport",
	"De Rijke",
	"Mooy Logistics",
	"Wim Bosman",
	"Jan de Rijk Logistics",
];

/** A Dutch licence plate, e.g. `84-BNX-7`. */
const plate = (random: Faker) =>
	`${random.number.int({ min: 10, max: 99 })}-${random.string.alpha({ length: 3, casing: "upper" })}-${random.number.int({ min: 1, max: 9 })}`;

/** What the seed knows of a Salvo dock's current state. */
interface SampleState {
	locked: boolean;
	doorOpenFor?: number;
	scpOnline: boolean;
	faultReason?: string;
	keyLocation: KeyLocation;
	/** Without a truck: how many minutes ago it last reported. */
	quietFor?: number;
	/** The truck at it: checked in this many minutes ago. */
	session?: {
		carrier: string;
		plate: string;
		reference: string;
		checkedIn: number;
		locked?: number;
	};
}

const samples: Record<string, SampleState> = {
	"DOCK 05": {
		locked: true,
		doorOpenFor: 18,
		scpOnline: true,
		keyLocation: "scp",
		session: {
			carrier: "AMEX Transport",
			plate: "84-BNX-7",
			reference: "WB-20416",
			checkedIn: 27,
			locked: 23,
		},
	},
	"DOCK 06": {
		locked: false,
		scpOnline: true,
		keyLocation: "driver",
		session: {
			carrier: "Van der Wal Logistiek",
			plate: "VX-218-K",
			reference: "WB-20419",
			checkedIn: 6,
		},
	},
	// Quiet for two hours: the simulator's `--escalate` replays the last 75 minutes at it.
	"DOCK 07": { locked: false, scpOnline: true, keyLocation: "storage", quietFor: 120 },
	"DOCK 08": {
		locked: false,
		scpOnline: false,
		faultReason: "Sleutelfout",
		keyLocation: "scp",
		quietFor: 34,
	},
};

export default defineSeed({
	clear: async (tx) => {
		await tx.delete(dockEscalation);
		await tx.delete(dockEvent);
		await tx.delete(dockSession);
		await tx.delete(dockState);
		await tx.delete(dockPosition);
	},

	async run({ tx, tenants, count }) {
		for (const tenant of tenants) {
			const organizationId = tenant.id;
			const [site] = await tx
				.select({ id: customerSite.id })
				.from(customerSite)
				.innerJoin(customer, eq(customer.id, customerSite.customerId))
				.where(
					and(
						eq(customerSite.organizationId, organizationId),
						eq(customer.name, "Weggemans Logistiek"),
						eq(customerSite.name, "Barneveld"),
					),
				);
			// Only SHLTR has Weggemans' docks.
			if (!site) continue;
			const random = new Faker({ locale: [nl, en] });
			random.seed(tenant.seed + 5);

			const numbers = Array.from({ length: 8 }, (_, i) => String(i + 1).padStart(2, "0"));
			const units = await tx
				.select({ id: equipment.id, name: equipment.name })
				.from(equipment)
				.where(and(eq(equipment.organizationId, organizationId), eq(equipment.siteId, site.id)));
			const locations = await tx
				.select({ id: equipmentLocation.id, name: equipmentLocation.name })
				.from(equipmentLocation)
				.where(
					and(
						eq(equipmentLocation.organizationId, organizationId),
						eq(equipmentLocation.siteId, site.id),
					),
				);
			const unit = (name: string) => units.find((each) => each.name === name)?.id ?? null;

			const rows = numbers.map((n, i) => {
				const salvo = i >= 4;
				const doorId = unit(`Sectionaaldeur D-${17 + i}`);
				const levellerId = unit(`Dockleveller L-${n}`);
				const locationId = locations.find((each) => each.name === `Dock ${n}`)?.id ?? null;
				return {
					organizationId,
					siteId: site.id,
					code: `DOCK ${n}`,
					position: `P-${n} · ${salvo ? "Expeditie noord" : "Expeditie zuid"}`,
					locationId,
					locationOrganizationId: locationId ? organizationId : null,
					doorId,
					doorOrganizationId: doorId ? organizationId : null,
					levellerId,
					levellerOrganizationId: levellerId ? organizationId : null,
					scpCode: salvo ? `SCP-${n}` : null,
					keyId: salvo ? `SLV-K${n}` : null,
					keyStorageUnit: salvo ? "KS-NOORD-1" : null,
					createdAt: toMoment(new Date(now.getTime() - 90 * DAY)),
				};
			});
			const docks = await tx
				.insert(dockPosition)
				.values(rows)
				.returning({ id: dockPosition.id, code: dockPosition.code });
			count("dockPositions", docks);

			// A week of finished sessions at the Salvo docks: from 06:00 to 18:00, 20 to 75 minutes
			// each, the door open for most of it (now and then 40+ minutes).
			const sessions: (typeof dockSession.$inferInsert)[] = [];
			const states: (typeof dockState.$inferInsert)[] = [];
			for (const dock of docks.filter((each) => samples[each.code])) {
				const sample = samples[dock.code];
				const firstOpen = sample.session
					? sample.session.checkedIn + 5
					: (sample.quietFor ?? 10) + 5;
				for (let day = 7; day >= 0; day--) {
					const date = new Date(now.getTime() - day * DAY);
					let start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 6, 0).getTime();
					const end = new Date(
						date.getFullYear(),
						date.getMonth(),
						date.getDate(),
						18,
						0,
					).getTime();
					while (start < end) {
						start += random.number.int({ min: 10, max: 70 }) * minutes;
						const length = random.number.int({ min: 20, max: 75 });
						const checkedOut = start + length * minutes;
						// Stop before the current one (or a while before now).
						if (checkedOut > now.getTime() - firstOpen * minutes) break;
						const lockedAt = start + random.number.int({ min: 1, max: 4 }) * minutes;
						const doorOpen = lockedAt + random.number.int({ min: 1, max: 3 }) * minutes;
						const longOne = random.datatype.boolean(0.08);
						const openFor = Math.min(
							length - 3,
							longOne
								? random.number.int({ min: 40, max: 55 })
								: random.number.int({ min: 10, max: 35 }),
						);
						const doorClose = doorOpen + openFor * minutes;
						const slotStart = new Date(Math.floor(start / (15 * minutes)) * 15 * minutes);
						sessions.push({
							organizationId,
							dockId: dock.id,
							carrier: random.helpers.arrayElement(carriers),
							plate: plate(random),
							reference: `WB-${random.number.int({ min: 20_100, max: 20_415 })}`,
							slotStart: toMoment(slotStart),
							slotEnd: toMoment(new Date(slotStart.getTime() + 45 * minutes)),
							checkedInAt: toMoment(new Date(start)),
							lockedAt: toMoment(new Date(lockedAt)),
							doorOpenedAt: toMoment(new Date(doorOpen)),
							doorClosedAt: toMoment(new Date(doorClose)),
							unlockedAt: toMoment(new Date(doorClose + minutes)),
							checkedOutAt: toMoment(new Date(checkedOut)),
							doorOpenSeconds: openFor * 60,
						});
						start = checkedOut;
					}
				}
				const truck = sample.session;
				if (truck) {
					const slotStart = new Date(
						Math.floor((now.getTime() - truck.checkedIn * minutes) / (15 * minutes)) * 15 * minutes,
					);
					sessions.push({
						organizationId,
						dockId: dock.id,
						carrier: truck.carrier,
						plate: truck.plate,
						reference: truck.reference,
						slotStart: toMoment(slotStart),
						slotEnd: toMoment(new Date(slotStart.getTime() + 45 * minutes)),
						checkedInAt: at(truck.checkedIn),
						lockedAt: truck.locked ? at(truck.locked) : null,
						doorOpenedAt: sample.doorOpenFor ? at(sample.doorOpenFor) : null,
						doorOpenSeconds: 0,
					});
				}
				const lastEvent = Math.min(
					sample.doorOpenFor ?? Infinity,
					truck?.locked ?? Infinity,
					truck?.checkedIn ?? Infinity,
					sample.quietFor ?? Infinity,
				);
				states.push({
					organizationId,
					dockId: dock.id,
					locked: sample.locked,
					doorOpenSince: sample.doorOpenFor ? at(sample.doorOpenFor) : null,
					scpOnline: sample.scpOnline,
					faultReason: sample.faultReason ?? null,
					keyLocation: sample.keyLocation,
					lastEventAt: at(lastEvent),
					updatedAt: at(lastEvent),
				});
			}
			for (const session of sessions) await tx.insert(dockSession).values(session);
			count("dockSessions", sessions);
			await tx.insert(dockState).values(states);
			count("dockStates", states);

			// The organization's deletion takes it away again (the core's seed clears them).
			await seedIntegrationToken(tx, {
				organizationId,
				moduleId: "docks",
				name: "Salvo Barneveld (demo)",
				token: demoDockToken,
				createdAt: toMoment(new Date(now.getTime() - 30 * DAY)),
			});
			console.log(
				`Docks: the Salvo simulator's token for ${tenant.slug} (demo only): ${demoDockToken}`,
			);
		}
	},
});
