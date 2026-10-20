/**
 * The demo tenants' unit conditions. SHLTR's are the Connect page's (`docs/plans/shltr-domain.md`
 * §2.3): Riedel's dock 07 door with its torsion springs worn to 22%, D-11's cable set at 41%, L-03's
 * hydraulics at 55%, Pakhuis 7's AC-02 with its filters at 28%, and a few more that need attention,
 * each with a history that got worse; most others healthy, recorded on their last visit. North gets
 * a few, so its pages show every status too; South doesn't have the module. A faker of its own,
 * seeded per tenant, so the rest of the demo data is the same with or without the module.
 *
 * SHLTR's units also get the mockup's 14 components (`shltrComponents`, the `onderdelen` of its
 * database), each with its article where the shop sells one like it, the points of the unit's
 * template that check it, and the mockup's condition and advice from the office.
 *
 * With checklists on, each completed checklist gives its unit the condition its points work out to
 * (`checklistScore()`), and each of the unit's components the same over its own points, on its
 * order, when it was completed, as completing it does at runtime (`checklists.completed`). The
 * conditions above stay the latest, as corrections from the office, where the unit has a newer
 * checklist than they'd be: so the demo keeps its 22%.
 */
import { en, Faker, nl } from "@faker-js/faker";
import { and, desc, eq, ne } from "drizzle-orm";

import { doneOrderStatuses } from "#lib/models.ts";
import { withTenantRefs } from "#lib/server/db/columns.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, equipment, equipmentLocation, order, orderUnit } from "#lib/server/db/schema.ts";
import { addDays, DAY, now } from "#lib/server/db/seed/clock.ts";
import { defineSeed, type ModuleSeed, type TenantDraft } from "#lib/server/db/seed/module-seed.ts";
import { toMoment } from "#lib/server/db/seed/temporal.ts";
import { checklistScore } from "#modules/checklists/api/extensions.ts";

import { component, componentCheckpoint, unitCondition } from "./schema.ts";

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

/**
 * A component of the mockup's (`onderdelen`), on the seeded unit that's it, or the closest: the
 * mockup's "Sectionaaldeur D-07" at "Expeditie noord" is Riedel's "Sectionaaldeur laaddok 07" (where
 * the 22% is), its "Dock 06" Weggemans' "Salvo dock 06", and Pakhuis 7's "Airco AC-02" at "Kantoor
 * 1e" is the one at the reception while that one's decommissioned (as seeded). Its article is the
 * shop's like it: the mockup's SKUs (SD-014, LV-008, …) aren't the seeded shop's, which only has
 * SD-001 the same; the stairs', the airco's and the chock's have none in the shop. Its points are
 * texts of the unit's template.
 */
interface SeedComponent {
	number: string;
	customer: string;
	unit: string;
	/** The unit's location, where the customer has two units of the name. */
	location?: string;
	name: string;
	sku: string | null;
	points: string[];
	score: number;
	advice: string;
}

const shltrComponents: SeedComponent[] = [
	{
		number: "OC-1041",
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur laaddok 07",
		name: "Torsieveerpakket",
		sku: "SD-001",
		points: [
			"Torsieveren op spanning en breuk gecontroleerd",
			"Veerbreukbeveiliging en kabelbreukbeveiliging getest",
		],
		score: 22,
		advice: "Veerpakket vervangen (SD-001) — cyclusteller boven 90%.",
	},
	{
		number: "OC-1042",
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur laaddok 07",
		name: "Staaldraadkabels",
		sku: "SD-002",
		points: ["Staaldraadkabels vrij van rafels en corrosie"],
		score: 41,
		advice: "Draadbreuk zichtbaar bij trommel — kabelset meenemen.",
	},
	{
		number: "OC-1043",
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur D-09",
		name: "Fotocel-beveiliging",
		sku: "SD-005",
		points: [
			"Fotocel / lichtscherm stopt en keert deur",
			"Onderloopbeveiliging (sluitkantbeveiliging) getest",
		],
		score: 68,
		advice: "Uitlijning controleren tijdens periodiek onderhoud.",
	},
	{
		number: "OC-1044",
		customer: "Riedel B.V.",
		unit: "Leveller L-03",
		name: "Dockleveller hydrauliek",
		sku: "LV-001",
		points: ["Oliepeil en slangen zonder lekkage", "Cilinders en veiligheidsventiel getest"],
		score: 55,
		advice: "Lekkage bij cilinder — afdichtset plannen.",
	},
	{
		number: "OC-1045",
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur D-11",
		name: "Bodemafdichting",
		sku: "SD-004",
		points: ["Bodem-, zij- en bovenafdichting intact"],
		score: 84,
		advice: "",
	},
	{
		number: "OC-2011",
		customer: "Bouwgroep De Vries",
		unit: "Bordestrap T-A3",
		name: "Antislip treden",
		sku: null,
		points: ["Antislip treden in goede staat"],
		score: 34,
		advice: "3 treden vervangen (TR-001) + keuring opnieuw uitvoeren.",
	},
	{
		number: "OC-2012",
		customer: "Bouwgroep De Vries",
		unit: "Bordestrap T-A3",
		name: "Leuningbevestiging",
		sku: null,
		points: ["Leuningen en kniesloten stevig", "Boutverbindingen en verankering vast"],
		score: 62,
		advice: "Muurbeugels natrekken, 2 stuks los.",
	},
	{
		number: "OC-2013",
		customer: "Bouwgroep De Vries",
		unit: "Bordes B-12",
		name: "Kickplate bordes",
		sku: null,
		points: ["Kickplates aanwezig en onbeschadigd"],
		score: 91,
		advice: "",
	},
	{
		number: "OC-3007",
		customer: "Pakhuis 7",
		unit: "Airco AC-02",
		location: "Kantoor 1e",
		name: "HEPA-filterset",
		sku: null,
		points: ["Filters gereinigd of vervangen"],
		score: 28,
		advice: "Filters dicht — drukval boven norm, direct vervangen (AC-001).",
	},
	{
		number: "OC-3008",
		customer: "Pakhuis 7",
		unit: "Airco AC-02",
		location: "Kantoor 1e",
		name: "Condensaatpomp",
		sku: null,
		points: ["Verdamper en condensafvoer schoon, pomp werkt"],
		score: 59,
		advice: "Meenemen bij filterbeurt, pomp maakt geluid.",
	},
	{
		number: "OC-3009",
		customer: "Pakhuis 7",
		unit: "Airco AC-05",
		name: "Koudemiddelcircuit R32",
		sku: null,
		points: ["Lekdichtheidscontrole uitgevoerd (F-gassen)", "Drukken en oververhitting gemeten"],
		score: 47,
		advice: "Lekdichtheidscontrole verplicht — F-gassen registratie bijwerken.",
	},
	{
		number: "OC-4002",
		customer: "Weggemans Logistiek",
		unit: "Sectionaaldeur D-21",
		name: "Aandrijving 24V",
		sku: "SD-008",
		points: ["Aandrijving, eindschakelaars en noodstop werkend"],
		score: 73,
		advice: "Noodontgrendeling testen bij volgende beurt.",
	},
	{
		number: "OC-4003",
		customer: "Weggemans Logistiek",
		unit: "Salvo dock 06",
		name: "Wielblokkering (chock)",
		sku: null,
		points: ["Wheel-Lok / chock vergrendeling getest"],
		score: 38,
		advice: "Vergrendelsensor geeft intermitterend signaal — sensor vervangen.",
	},
	{
		number: "OC-4004",
		customer: "Weggemans Logistiek",
		unit: "Sectionaaldeur D-24",
		name: "Rolscharnieren set",
		sku: "SD-003",
		points: ["Rollen, scharnieren en geleiderails gesmeerd"],
		score: 88,
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
		.select({
			id: equipment.id,
			name: equipment.name,
			customer: customer.name,
			location: equipmentLocation.name,
		})
		.from(equipment)
		.innerJoin(customer, eq(customer.id, equipment.customerId))
		.leftJoin(equipmentLocation, eq(equipmentLocation.id, equipment.locationId))
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
			and(eq(orderUnit.organizationId, organizationId), inList(order.status, doneOrderStatuses)),
		)
		.orderBy(desc(order.completedAt));
	const lastDone = new Map<number, (typeof done)[number]>();
	for (const row of done) if (!lastDone.has(row.equipmentId)) lastDone.set(row.equipmentId, row);
	return { units, lastDone };
}

/**
 * The tenant's completed checklists, oldest first, with their points: read through the seed's
 * transaction, whose schema has every module's tables, as the module only enhances checklists
 * (its tables aren't the module's to import). None while the tenant hasn't checklists.
 */
async function completedChecklists(tx: Transaction, tenant: { id: string; modules: string[] }) {
	if (!tenant.modules.includes("checklists")) return [];
	const found = await tx.query.checklist.findMany({
		columns: { id: true, orderId: true, equipmentId: true, completedBy: true, completedAt: true },
		where: (checklist, { and, eq, isNotNull }) =>
			and(
				eq(checklist.organizationId, tenant.id),
				eq(checklist.status, "completed"),
				isNotNull(checklist.completedAt),
			),
		with: { results: { columns: { templateItemId: true, result: true } } },
	});
	return found.toSorted(
		(a, b) => Temporal.Instant.compare(a.completedAt!, b.completedAt!) || a.id - b.id,
	);
}

/** An hour, in milliseconds: how long after a unit's last checklist the office corrects it. */
const HOUR = 60 * 60 * 1000;

/**
 * Inserts SHLTR's components on its units (see `shltrComponents`), with their articles (the
 * tenant's materials by SKU, read like the checklists, as the module only enhances materials) and
 * points (its templates' by text); answers them with the points that check each.
 */
async function seedComponents(
	tx: Transaction,
	tenant: { id: string; modules: string[] },
	units: { id: number; name: string | null; customer: string; location: string | null }[],
	count: (table: string, rows: unknown[]) => void,
) {
	const materials = tenant.modules.includes("materials")
		? await tx.query.material.findMany({
				columns: { id: true, sku: true },
				where: (material, { eq }) => eq(material.organizationId, tenant.id),
			})
		: [];
	const items = tenant.modules.includes("checklists")
		? await tx.query.checklistTemplateItem.findMany({
				columns: { id: true, text: true },
				where: (item, { eq }) => eq(item.organizationId, tenant.id),
			})
		: [];
	const made: { id: number; equipmentId: number; items: Set<number>; seed: SeedComponent }[] = [];
	const positions = new Map<number, number>();
	for (const seed of shltrComponents) {
		// The unit in care of the name, at its location if that one is (the other of the name if not).
		const named = units.filter(
			(found) => found.name === seed.unit && found.customer === seed.customer,
		);
		const unit = named.find((found) => found.location === seed.location) ?? named[0];
		if (!unit) continue;
		const position = positions.get(unit.id) ?? 0;
		positions.set(unit.id, position + 1);
		const [row] = await tx
			.insert(component)
			.values({
				organizationId: tenant.id,
				equipmentId: unit.id,
				number: seed.number,
				name: seed.name,
				materialId: materials.find((material) => material.sku === seed.sku)?.id ?? null,
				position,
			})
			.returning({ id: component.id });
		const points = seed.points.flatMap(
			(text) => items.find((item) => item.text === text)?.id ?? [],
		);
		if (points.length) {
			await tx.insert(componentCheckpoint).values(
				points.map((templateItemId) => ({
					organizationId: tenant.id,
					componentId: row.id,
					templateItemId,
				})),
			);
		}
		made.push({ id: row.id, equipmentId: unit.id, items: new Set(points), seed });
	}
	count("components", made);
	count(
		"componentCheckpoints",
		made.flatMap((each) => [...each.items]),
	);
	return made;
}

export default defineSeed<TenantDraft["profile"]>({
	// The components' articles are the materials', which have to be in.
	after: ["materials"],

	// Whose business the tenant is, which says which conditions it gets.
	generate: ({ profile }) => profile,

	async run({ tx, tenants, insertAll, count }) {
		const rows: (typeof unitCondition.$inferInsert)[] = [];
		for (const tenant of tenants) {
			const organizationId = tenant.id;
			const random = new Faker({ locale: [nl, en] });
			random.seed(tenant.seed + 21);
			const { units, lastDone } = await unitsOf(tx, organizationId);
			const parts = tenant.data === "shltr" ? await seedComponents(tx, tenant, units, count) : [];

			// What the completed checklists found, of the units and their components, and when each
			// unit's last one was.
			const lastChecklist = new Map<number, Temporal.Instant>();
			for (const found of await completedChecklists(tx, tenant)) {
				lastChecklist.set(found.equipmentId, found.completedAt!);
				const recorded = {
					organizationId,
					equipmentId: found.equipmentId,
					advice: null,
					source: "checklist" as const,
					...withTenantRefs(organizationId, { orderId: found.orderId }),
					engineerId: found.completedBy,
					recordedAt: found.completedAt!,
				};
				const score = checklistScore(found.results);
				if (score !== null) rows.push({ ...recorded, score });
				for (const part of parts.filter((each) => each.equipmentId === found.equipmentId)) {
					const own = checklistScore(
						found.results.filter(
							(result) => result.templateItemId !== null && part.items.has(result.templateItemId),
						),
					);
					if (own !== null) rows.push({ ...recorded, componentId: part.id, score: own });
				}
			}

			/**
			 * A condition of `unit`, recorded `daysAgo`: on its last done order then, if it had one and
			 * no checklist on it; the latest (`last`) after the unit's last checklist, from the office.
			 */
			const add = (
				unitId: number,
				score: number,
				daysAgo: number,
				advice: string,
				last = daysAgo === 0,
				componentId: number | null = null,
			) => {
				const visit = lastDone.get(unitId);
				const checked = lastChecklist.get(unitId);
				const onVisit = visit?.completedAt && daysAgo === 0 && !checked ? visit : null;
				let recordedAt = onVisit?.completedAt ?? toMoment(addDays(now, -daysAgo));
				if (last && checked && Temporal.Instant.compare(checked, recordedAt) >= 0) {
					recordedAt = toMoment(
						new Date(Math.min(checked.epochMilliseconds + HOUR, now.getTime())),
					);
				}
				rows.push({
					organizationId,
					equipmentId: unitId,
					componentId,
					score,
					advice: advice || null,
					source: onVisit ? "checklist" : "office",
					...withTenantRefs(organizationId, { orderId: onVisit?.orderId ?? null }),
					engineerId: onVisit?.engineerId ?? null,
					recordedAt,
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
					named.history.forEach(([score, daysAgo], i) => {
						const last = i === named.history.length - 1;
						add(unit.id, score, daysAgo, last ? named.advice : "", last);
					});
				}
				// The components' conditions as the mockup has them, from the office a day ago (or
				// after their unit's last checklist).
				for (const part of parts) {
					add(part.equipmentId, part.seed.score, 1, part.seed.advice, true, part.id);
				}
				// Most of the others are healthy, recorded on their last visit; a few show some wear.
				// One with a completed checklist has what its checklists found.
				for (const unit of units) {
					if (fixed.has(unit.id) || !random.datatype.boolean(0.7) || lastChecklist.has(unit.id)) {
						continue;
					}
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
					// The one before, half a year before the latest: on the unit's last visit, which may
					// be longer ago than that.
					const visit = lastDone.get(unit.id)?.completedAt;
					const since = visit ? Math.floor((now.getTime() - visit.epochMilliseconds) / DAY) : 0;
					add(
						unit.id,
						Math.min(100, score + random.number.int({ min: 10, max: 25 })),
						since + 180,
						"",
					);
					add(unit.id, score, 0, i < NORTH.critical ? random.helpers.arrayElement(wear) : "");
				});
			}
		}
		await insertAll(rows, (chunk) => tx.insert(unitCondition).values(chunk));
		count("unitConditions", rows);
	},
});
