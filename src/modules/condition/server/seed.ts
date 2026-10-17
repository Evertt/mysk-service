/**
 * The demo tenants' unit conditions. SHLTR's are the Connect page's (`docs/plans/shltr-domain.md`
 * §2.3): Riedel's dock 07 door with its torsion springs worn to 22%, D-11's cable set at 41%, L-03's
 * hydraulics at 55%, Pakhuis 7's AC-02 with its filters at 28%, and a few more that need attention,
 * each with a history that got worse; most others healthy, recorded on their last visit. North gets
 * a few, so its pages show every status too; South doesn't have the module. A faker of its own,
 * seeded per tenant, so the rest of the demo data is the same with or without the module.
 */
import { en, Faker, nl } from "@faker-js/faker";
import { and, desc, eq, ne } from "drizzle-orm";

import { inList } from "#lib/server/db/parameters.ts";
import { customer, equipment, order, orderUnit } from "#lib/server/db/schema.ts";
import { addDays, now } from "#lib/server/db/seed/clock.ts";
import { defineSeed, type ModuleSeed, type TenantDraft } from "#lib/server/db/seed/module-seed.ts";
import { toMoment } from "#lib/server/db/seed/temporal.ts";

import { conditionSettings, unitCondition } from "./schema.ts";

/** A unit the mockup names, with how its condition went: oldest first, the last one now. */
interface FixedCondition {
	customer: string;
	unit: string;
	/** Scores, oldest first, with how many days ago each was recorded. */
	history: [score: number, daysAgo: number][];
	advice: string;
}

const shltrConditions: FixedCondition[] = [
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur laaddok 07",
		history: [
			[71, 330],
			[48, 150],
			[22, 2],
		],
		advice: "Veerpakket vervangen (SD-001) — cyclusteller boven 90%.",
	},
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur D-11",
		history: [
			[68, 200],
			[41, 25],
		],
		advice: "Kabelset vervangen (SD-002) — draadbreuk zichtbaar bij de trommel.",
	},
	{
		customer: "Riedel B.V.",
		unit: "Leveller L-03",
		history: [
			[74, 240],
			[55, 30],
		],
		advice: "Lichte olielekkage bij de hoofdcilinder — afdichtset bestellen.",
	},
	{
		customer: "Pakhuis 7",
		unit: "Airco AC-02",
		history: [
			[62, 180],
			[28, 4],
		],
		advice:
			"Filters sterk vervuild en condensafvoer verstopt — filters vervangen, afvoer reinigen.",
	},
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur laaddok 08",
		history: [
			[80, 210],
			[52, 40],
		],
		advice: "Twee looprollen versleten, deur loopt stroef — rollen vervangen bij volgend bezoek.",
	},
	{
		customer: "Weggemans Logistiek",
		unit: "Sectionaaldeur D-21",
		history: [
			[85, 190],
			[66, 20],
		],
		advice: "Bodemrubber over 1 m gescheurd — afdichtingsrubber meenemen.",
	},
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur D-09",
		history: [
			[88, 260],
			[76, 35],
		],
		advice: "",
	},
	{
		customer: "Weggemans Logistiek",
		unit: "Sectionaaldeur D-24",
		history: [
			[90, 300],
			[94, 18],
		],
		advice: "",
	},
];

/** Advice that comes with a fair score, for the made-up ones that need attention. */
const wear = [
	"Lichte slijtage aan de geleiders; meenemen bij de eerstvolgende beurt.",
	"Aandrijving maakt geluid — lagers controleren bij het volgende onderhoud.",
	"Afdichting begint te verweren; vervangen binnen een half jaar.",
];

/** How many of North's units get conditions: the first critical, the next needing attention. */
const NORTH = { critical: 2, attention: 3, healthy: 10 };

type Transaction = Parameters<ModuleSeed["run"]>[0]["tx"];

/** The tenant's units in use with their customer, and the last done order on each. */
async function unitsOf(tx: Transaction, organizationId: string) {
	const units = await tx
		.select({ id: equipment.id, name: equipment.name, customer: customer.name })
		.from(equipment)
		.innerJoin(customer, eq(customer.id, equipment.customerId))
		.where(
			and(eq(equipment.organizationId, organizationId), ne(equipment.status, "decommissioned")),
		)
		.orderBy(equipment.id);
	const done = await tx
		.select({
			equipmentId: orderUnit.equipmentId,
			orderId: order.id,
			engineerId: order.engineerId,
			completedAt: order.completedAt,
		})
		.from(orderUnit)
		.innerJoin(order, eq(order.id, orderUnit.orderId))
		.where(
			and(
				eq(orderUnit.organizationId, organizationId),
				inList(order.status, ["completed", "invoiced"]),
			),
		)
		.orderBy(desc(order.completedAt));
	const lastDone = new Map<number, (typeof done)[number]>();
	for (const row of done) if (!lastDone.has(row.equipmentId)) lastDone.set(row.equipmentId, row);
	return { units, lastDone };
}

export default defineSeed<TenantDraft["profile"]>({
	clear: async (tx) => {
		await tx.delete(unitCondition);
		await tx.delete(conditionSettings);
	},

	// Whose business the tenant is, which says which conditions it gets.
	generate: ({ profile }) => profile,

	async run({ tx, tenants, insertAll, count }) {
		const rows: (typeof unitCondition.$inferInsert)[] = [];
		for (const tenant of tenants) {
			const organizationId = tenant.id;
			const random = new Faker({ locale: [nl, en] });
			random.seed(tenant.seed + 21);
			const { units, lastDone } = await unitsOf(tx, organizationId);
			/** A condition of `unit`, recorded `daysAgo`: on its last done order then, if it had one. */
			const add = (unitId: number, score: number, daysAgo: number, advice: string) => {
				const visit = lastDone.get(unitId);
				const onVisit = visit?.completedAt && daysAgo === 0 ? visit : null;
				rows.push({
					organizationId,
					equipmentId: unitId,
					score,
					advice: advice || null,
					source: onVisit ? "checklist" : "office",
					orderId: onVisit?.orderId ?? null,
					orderOrganizationId: onVisit ? organizationId : null,
					engineerId: onVisit?.engineerId ?? null,
					recordedAt: onVisit?.completedAt ?? toMoment(addDays(now, -daysAgo)),
				});
			};

			if (tenant.data === "shltr") {
				const fixed = new Set<number>();
				for (const named of shltrConditions) {
					const unit = units.find(
						(found) => found.name === named.unit && found.customer === named.customer,
					);
					if (!unit) continue;
					fixed.add(unit.id);
					named.history.forEach(([score, daysAgo], i) =>
						add(unit.id, score, daysAgo, i === named.history.length - 1 ? named.advice : ""),
					);
				}
				// Most of the others are healthy, recorded on their last visit; a few show some wear.
				for (const unit of units) {
					if (fixed.has(unit.id) || !random.datatype.boolean(0.7)) continue;
					if (random.datatype.boolean(0.4)) {
						add(
							unit.id,
							random.number.int({ min: 80, max: 98 }),
							random.number.int({ min: 200, max: 400 }),
							"",
						);
					}
					const worn = random.datatype.boolean(0.06);
					add(
						unit.id,
						worn
							? random.number.int({ min: 58, max: 69 })
							: random.number.int({ min: 72, max: 99 }),
						0,
						worn ? random.helpers.arrayElement(wear) : "",
					);
				}
			} else {
				const picked = units.slice(0, NORTH.critical + NORTH.attention + NORTH.healthy);
				picked.forEach((unit, i) => {
					const score =
						i < NORTH.critical
							? random.number.int({ min: 15, max: 35 })
							: i < NORTH.critical + NORTH.attention
								? random.number.int({ min: 45, max: 65 })
								: random.number.int({ min: 75, max: 98 });
					add(unit.id, Math.min(100, score + random.number.int({ min: 10, max: 25 })), 180, "");
					add(unit.id, score, 0, i < NORTH.critical ? random.helpers.arrayElement(wear) : "");
				});
			}
		}
		await insertAll(rows, (chunk) => tx.insert(unitCondition).values(chunk));
		count("unitConditions", rows);
	},
});
