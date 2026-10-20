/**
 * The docks module's demo data: SHLTR's eight docks at Weggemans Logistiek in Barneveld
 * (`docs/plans/shltr-domain.md`, §2.4), linked to the doors, levellers and locations the SHLTR seed
 * made for them ("Sectionaaldeur D-17"…"D-24", "Dockleveller L-01"…, "Dock 01"…); docks 05–08 have
 * Salvo, in the states of the mockup's sample (`mockupDocks()`: DOCK 05 Laden, DOCK 06 Bezet with
 * its door open 44 minutes, DOCK 07 Vrij, DOCK 08 Storing with its door open over an hour), with a
 * week of sessions behind them, which the app's simulation moves on from. And an integration token
 * for the script `scripts/docks-simulator.ts`, printed at the end: demo data only. North and South
 * don't have the module. With a faker of its own, so the rest of the demo data stays the same.
 */
import { en, Faker, nl } from "@faker-js/faker";
import { and, eq } from "drizzle-orm";

import { withTenantRefs } from "#lib/server/db/columns.ts";
import { customer, customerSite, equipment, equipmentLocation } from "#lib/server/db/schema.ts";
import { DAY, now } from "#lib/server/db/seed/clock.ts";
import { seedIntegrationToken } from "#lib/server/db/seed/integrations.ts";
import { defineSeed } from "#lib/server/db/seed/module-seed.ts";
import { toMoment } from "#lib/server/db/seed/temporal.ts";

import { type DemoDock, demoDockToken, demoSalvoDocks, mockupDocks } from "./demo.ts";
import { dockEvent, dockEscalation, dockPosition, dockSession, dockState } from "./schema.ts";

const minutes = 60 * 1000;

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
				// As the mockup has them: 05 and 06 at Expeditie noord, 07 and 08 at Dockstraat zuid.
				const south = i >= 6;
				const doorId = unit(`Sectionaaldeur D-${17 + i}`);
				const levellerId = unit(`Dockleveller L-${n}`);
				const locationId = locations.find((each) => each.name === `Dock ${n}`)?.id ?? null;
				return {
					organizationId,
					siteId: site.id,
					code: `DOCK ${n}`,
					position: `P-${n} · ${!salvo ? "Expeditie zuid" : south ? "Dockstraat zuid" : "Expeditie noord"}`,
					...withTenantRefs(organizationId, { locationId, doorId, levellerId }),
					scpCode: salvo ? `SCP-${n}` : null,
					keyId: salvo ? `SLV-K${n}` : null,
					keyStorageUnit: salvo ? (south ? "KS-ZUID-2" : "KS-NOORD-1") : null,
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
			const current = mockupDocks(toMoment(now));
			const salvoDocks = docks.filter((each) =>
				(demoSalvoDocks as readonly string[]).includes(each.code),
			);
			for (const dock of salvoDocks) {
				const { facts, session } = current[dock.code as DemoDock];
				// The history ends a while before the truck at it now arrived (or before now).
				const firstOpen =
					(now.getTime() - (session?.checkedInAt.epochMilliseconds ?? now.getTime())) / minutes +
					10;
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
				if (session) sessions.push({ ...session, organizationId, dockId: dock.id });
				states.push({ ...facts, organizationId, dockId: dock.id, updatedAt: toMoment(now) });
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
