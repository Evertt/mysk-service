/**
 * The demo tenants' unit conditions, on NEN 2767's scale from their defects (NEN 2767-1's method). SHLTR's
 * are the Connect page's (`docs/plans/shltr-domain.md` §2.3): Riedel's dock 07 door with a broken
 * torsion spring at 5 (Slecht), D-11's cable set and L-03's hydraulics at 4 (Matig), Pakhuis 7's
 * AC-02 with its filters at 5, D-09 at 3 (Redelijk) like the mockup's slide 6, and a few more that
 * need attention, each with a history that got worse; most others healthy, recorded on their last
 * visit. North gets a few, so its pages show every status too; South doesn't have the module. A
 * faker of its own, seeded per tenant, so the rest of the demo data is the same with or without the
 * module.
 *
 * SHLTR's units also get the mockup's 14 components (`shltrComponents`, the `onderdelen` of its
 * database), each with its article where the shop sells one like it, the points of the unit's
 * template that check it, and the mockup's condition (as its defects) and advice from the office.
 *
 * With checklists on, each completed checklist gives its unit a condition whose defects are its
 * rejected points (each with a grade the engineer could have given it), and each of the unit's
 * components the same over its own points, on its order, when it was completed, as completing it
 * does at runtime (`checklists.completed`). The conditions above stay the latest, as corrections
 * from the office, where the unit has a newer checklist than they'd be: so the demo keeps its 5.
 * Each is logged as recording it is (against its unit, with its advice), by its engineer or an
 * office member: the service history reads them.
 */
import { en, Faker, nl } from "@faker-js/faker";
import { and, asc, desc, eq, ne } from "drizzle-orm";

import { doneOrderStatuses } from "#lib/models.ts";
import { withTenantRefs } from "#lib/server/db/columns.ts";
import { demoUsers } from "#lib/server/db/demo.ts";
import { inList, insertRows } from "#lib/server/db/parameters.ts";
import {
	customer,
	engineer,
	equipment,
	equipmentLocation,
	order,
	orderUnit,
} from "#lib/server/db/schema.ts";
import { addDays, DAY, HOUR, now } from "#lib/server/db/seed/clock.ts";
import {
	defineSeed,
	type SeedTransaction,
	type TenantDraft,
} from "#lib/server/db/seed/module-seed.ts";
import { toMoment } from "#lib/server/db/seed/temporal.ts";

import { recordScore } from "../model.ts";
import { type DefectGrade, defectScore } from "../nen2767.ts";
import { component, componentCheckpoint, conditionDefect, unitCondition } from "./schema.ts";

/** A defect a seeded condition found: what, its grade, and the component it's on (by number). */
interface SeedDefect extends DefectGrade {
	text: string;
	/** The component's number (`OC-1041`); none for the unit itself. */
	on?: string;
}

/**
 * Shorthands for the grades the demo's defects have, with the score NEN 2767 gives each alone (one
 * defect per element at 3 or worse: a second one in the element would add its points).
 */
const grade = {
	/** 1: slight, initial, 20% (category 1, 0.6 points). */
	trace: { severity: "slight", intensity: "initial", extent: 20 },
	/** 2: slight, advanced, 50% (category 2, 2 points). */
	slight: { severity: "slight", intensity: "advanced", extent: 50 },
	/** 2: serious, initial, 50% (category 2, 2 points). */
	starting: { severity: "serious", intensity: "initial", extent: 50 },
	/** 2: serious, advanced, 20% (category 3, 2 points). */
	local: { severity: "serious", intensity: "advanced", extent: 20 },
	/** 3: serious, advanced, 50% (category 3, 10 points). */
	fair: { severity: "serious", intensity: "advanced", extent: 50 },
	/** 4: serious, advanced, 85% (category 3, 30 points). */
	moderate: { severity: "serious", intensity: "advanced", extent: 85 },
	/** 4: serious, final, 50% (category 4, 30 points). */
	moderateFinal: { severity: "serious", intensity: "final", extent: 50 },
	/** 5: severe, advanced, 85% (category 4, 70 points). */
	poor: { severity: "severe", intensity: "advanced", extent: 85 },
	/** 5: severe, final, 50% (category 5, 70 points). */
	poorFinal: { severity: "severe", intensity: "final", extent: 50 },
} satisfies Record<string, DefectGrade>;

/** A unit the mockup names, with how its condition went: oldest first, the last one now. */
interface FixedCondition {
	customer: string;
	unit: string;
	/** Its conditions, oldest first: how many days ago each was recorded, and its defects. */
	history: { daysAgo: number; defects: SeedDefect[] }[];
	advice: string;
}

const shltrConditions: FixedCondition[] = [
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur laaddok 07",
		history: [
			{ daysAgo: 330, defects: [{ text: "Spanning torsieveren loopt terug", ...grade.fair }] },
			{
				daysAgo: 150,
				defects: [
					{ text: "Torsieveren vermoeid, deur zakt bij openen", on: "OC-1041", ...grade.moderate },
				],
			},
			{
				daysAgo: 2,
				defects: [
					{ text: "Onderste torsieveer gebroken", on: "OC-1041", ...grade.poor },
					{ text: "Kabels beginnen te rafelen bij de trommel", on: "OC-1042", ...grade.starting },
				],
			},
		],
		advice: "Veerpakket vervangen (SD-001) — cyclusteller boven 90%.",
	},
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur D-11",
		history: [
			{ daysAgo: 200, defects: [{ text: "Kabelset licht gerafeld", ...grade.fair }] },
			{
				daysAgo: 25,
				defects: [{ text: "Draadbreuk zichtbaar bij de trommel", ...grade.moderate }],
			},
		],
		advice: "Kabelset vervangen (SD-002) — draadbreuk zichtbaar bij de trommel.",
	},
	{
		customer: "Riedel B.V.",
		unit: "Leveller L-03",
		history: [
			{ daysAgo: 240, defects: [{ text: "Olienevel bij de hoofdcilinder", ...grade.fair }] },
			{ daysAgo: 30, defects: [{ text: "Olielekkage bij de hoofdcilinder", ...grade.moderate }] },
		],
		advice: "Lichte olielekkage bij de hoofdcilinder — afdichtset bestellen.",
	},
	{
		customer: "Pakhuis 7",
		unit: "Airco AC-02",
		history: [
			{ daysAgo: 180, defects: [{ text: "Filters vervuild", ...grade.fair }] },
			{
				daysAgo: 4,
				defects: [{ text: "Filters sterk vervuild, condensafvoer verstopt", ...grade.poor }],
			},
		],
		advice:
			"Filters sterk vervuild en condensafvoer verstopt — filters vervangen, afvoer reinigen.",
	},
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur laaddok 08",
		history: [
			{ daysAgo: 210, defects: [{ text: "Looprollen licht droog", ...grade.slight }] },
			{
				daysAgo: 40,
				defects: [{ text: "Twee looprollen versleten, deur loopt stroef", ...grade.moderate }],
			},
		],
		advice: "Twee looprollen versleten, deur loopt stroef — rollen vervangen bij volgend bezoek.",
	},
	{
		customer: "Weggemans Logistiek",
		unit: "Sectionaaldeur D-21",
		history: [
			{ daysAgo: 190, defects: [{ text: "Bodemrubber verweerd", ...grade.slight }] },
			{
				daysAgo: 20,
				defects: [{ text: "Bodemrubber over 1 m gescheurd", ...grade.moderateFinal }],
			},
		],
		advice: "Bodemrubber over 1 m gescheurd — afdichtingsrubber meenemen.",
	},
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur D-09",
		history: [
			{ daysAgo: 260, defects: [{ text: "Panelen licht bekrast", ...grade.trace }] },
			{
				daysAgo: 35,
				defects: [
					// Category 3 at 20% (2 points) and category 1 at 20% (0.6): 2.6, so 3.
					{ text: "Fotocel wijkt af, deur keert soms onnodig", ...grade.local },
					{ text: "Lichte roestvorming onderste paneel", ...grade.trace },
				],
			},
		],
		advice: "",
	},
	{
		customer: "Weggemans Logistiek",
		unit: "Sectionaaldeur D-24",
		history: [
			{ daysAgo: 300, defects: [{ text: "Rubber afdichting licht verweerd", ...grade.slight }] },
			{ daysAgo: 18, defects: [] },
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
	/** Its defects, on itself, as the office last found them (none: 1). */
	defects: SeedDefect[];
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
		defects: [{ text: "Onderste torsieveer gebroken", ...grade.poor }],
		advice: "Veerpakket vervangen (SD-001) — cyclusteller boven 90%.",
	},
	{
		number: "OC-1042",
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur laaddok 07",
		name: "Staaldraadkabels",
		sku: "SD-002",
		points: ["Staaldraadkabels vrij van rafels en corrosie"],
		defects: [{ text: "Draadbreuk zichtbaar bij de trommel", ...grade.moderate }],
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
		defects: [{ text: "Fotocel niet goed uitgelijnd", ...grade.fair }],
		advice: "Uitlijning controleren tijdens periodiek onderhoud.",
	},
	{
		number: "OC-1044",
		customer: "Riedel B.V.",
		unit: "Leveller L-03",
		name: "Dockleveller hydrauliek",
		sku: "LV-001",
		points: ["Oliepeil en slangen zonder lekkage", "Cilinders en veiligheidsventiel getest"],
		defects: [{ text: "Lekkage bij de cilinder", ...grade.moderate }],
		advice: "Lekkage bij cilinder — afdichtset plannen.",
	},
	{
		number: "OC-1045",
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur D-11",
		name: "Bodemafdichting",
		sku: "SD-004",
		points: ["Bodem-, zij- en bovenafdichting intact"],
		defects: [{ text: "Bodemrubber licht verweerd", ...grade.slight }],
		advice: "",
	},
	{
		number: "OC-2011",
		customer: "Bouwgroep De Vries",
		unit: "Bordestrap T-A3",
		name: "Antislip treden",
		sku: null,
		points: ["Antislip treden in goede staat"],
		defects: [{ text: "Antislip op 3 treden versleten", ...grade.poor }],
		advice: "3 treden vervangen (TR-001) + keuring opnieuw uitvoeren.",
	},
	{
		number: "OC-2012",
		customer: "Bouwgroep De Vries",
		unit: "Bordestrap T-A3",
		name: "Leuningbevestiging",
		sku: null,
		points: ["Leuningen en kniesloten stevig", "Boutverbindingen en verankering vast"],
		defects: [{ text: "2 muurbeugels los", ...grade.moderate }],
		advice: "Muurbeugels natrekken, 2 stuks los.",
	},
	{
		number: "OC-2013",
		customer: "Bouwgroep De Vries",
		unit: "Bordes B-12",
		name: "Kickplate bordes",
		sku: null,
		points: ["Kickplates aanwezig en onbeschadigd"],
		defects: [],
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
		defects: [{ text: "Filters dicht, drukval boven norm", ...grade.poorFinal }],
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
		defects: [{ text: "Pomp maakt geluid", ...grade.moderate }],
		advice: "Meenemen bij filterbeurt, pomp maakt geluid.",
	},
	{
		number: "OC-3009",
		customer: "Pakhuis 7",
		unit: "Airco AC-05",
		name: "Koudemiddelcircuit R32",
		sku: null,
		points: ["Lekdichtheidscontrole uitgevoerd (F-gassen)", "Drukken en oververhitting gemeten"],
		defects: [{ text: "Lekdichtheidscontrole verlopen", ...grade.moderateFinal }],
		advice: "Lekdichtheidscontrole verplicht — F-gassen registratie bijwerken.",
	},
	{
		number: "OC-4002",
		customer: "Weggemans Logistiek",
		unit: "Sectionaaldeur D-21",
		name: "Aandrijving 24V",
		sku: "SD-008",
		points: ["Aandrijving, eindschakelaars en noodstop werkend"],
		defects: [{ text: "Noodontgrendeling gaat stroef", ...grade.fair }],
		advice: "Noodontgrendeling testen bij volgende beurt.",
	},
	{
		number: "OC-4003",
		customer: "Weggemans Logistiek",
		unit: "Salvo dock 06",
		name: "Wielblokkering (chock)",
		sku: null,
		points: ["Wheel-Lok / chock vergrendeling getest"],
		defects: [{ text: "Vergrendelsensor geeft intermitterend signaal", ...grade.poor }],
		advice: "Vergrendelsensor geeft intermitterend signaal — sensor vervangen.",
	},
	{
		number: "OC-4004",
		customer: "Weggemans Logistiek",
		unit: "Sectionaaldeur D-24",
		name: "Rolscharnieren set",
		sku: "SD-003",
		points: ["Rollen, scharnieren en geleiderails gesmeerd"],
		defects: [{ text: "Rollen licht droog", ...grade.slight }],
		advice: "",
	},
];

/** Advice that comes with a moderate score, for the made-up ones that need attention. */
const wear = [
	"Lichte slijtage aan de geleiders; meenemen bij de eerstvolgende beurt.",
	"Aandrijving maakt geluid — lagers controleren bij het volgende onderhoud.",
	"Afdichting begint te verweren; vervangen binnen een half jaar.",
];

/** Defects a healthy unit may have, for the made-up conditions: graded 1 to 3. */
const healthyDefects = [
	{ text: "Lichte gebruikssporen", ...grade.trace },
	{ text: "Afdichting begint te verweren", ...grade.slight },
	{ text: "Geleiders licht droog", ...grade.starting },
	{ text: "Lichte slijtage aan de aandrijving", ...grade.fair },
];

/** The defects of a made-up condition: worn (4), critical (5), or healthy (none, or one up to 3). */
function madeUpDefects(random: Faker, state: "critical" | "worn" | "healthy"): SeedDefect[] {
	if (state === "critical") {
		return [{ text: "Ernstige slijtage, onderdeel aan vervanging toe", ...grade.poor }];
	}
	if (state === "worn") return [{ text: "Slijtage over het geheel zichtbaar", ...grade.moderate }];
	return random.datatype.boolean(0.5) ? [] : [random.helpers.arrayElement(healthyDefects)];
}

/**
 * The grade of a rejected point of a seeded checklist, as an engineer could have given it: mostly
 * serious and advanced over 5 or 20% of the element (1 or 2 alone), now and then severe (3 alone);
 * an element's rejected points add up by the norm's method.
 */
function rejectedGrade(random: Faker): DefectGrade {
	const roll = random.number.float({ min: 0, max: 1 });
	if (roll < 0.6) return { severity: "serious", intensity: "advanced", extent: 5 };
	if (roll < 0.9) return grade.local;
	return { severity: "severe", intensity: "advanced", extent: 20 };
}

/** How many of North's units get conditions: the first critical, the next needing attention. */
const NORTH = { critical: 2, attention: 3, healthy: 10 };

/** The tenant's units in use with their customer, and the last done order on each. */
async function unitsOf(tx: SeedTransaction, organizationId: string) {
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
async function completedChecklists(tx: SeedTransaction, tenant: { id: string; modules: string[] }) {
	if (!tenant.modules.includes("checklists")) return [];
	const found = await tx.query.checklist.findMany({
		columns: { id: true, orderId: true, equipmentId: true, completedBy: true, completedAt: true },
		where: (checklist, { and, eq, isNotNull }) =>
			and(
				eq(checklist.organizationId, tenant.id),
				eq(checklist.status, "completed"),
				isNotNull(checklist.completedAt),
			),
		with: {
			results: {
				columns: { id: true, templateItemId: true, text: true, result: true, remark: true },
			},
		},
	});
	return found.toSorted(
		(a, b) => Temporal.Instant.compare(a.completedAt!, b.completedAt!) || a.id - b.id,
	);
}

/**
 * Inserts SHLTR's components on its units (see `shltrComponents`), with their articles (the
 * tenant's materials by SKU, read like the checklists, as the module only enhances materials) and
 * points (its templates' by text); answers them with the points that check each.
 */
async function seedComponents(
	tx: SeedTransaction,
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

/**
 * The log's entries of the tenants' conditions, as `insertCondition()` makes them: against the
 * unit, labelled like `conditionLabel()` (its serial number, its component's number, the score),
 * with the advice as the note, by the engineer, or the office's first member.
 */
async function recordedEntries(tx: SeedTransaction, organizationIds: string[]) {
	const found = await tx
		.select({
			id: unitCondition.id,
			organizationId: unitCondition.organizationId,
			score: unitCondition.score,
			advice: unitCondition.advice,
			recordedAt: unitCondition.recordedAt,
			unitId: equipment.id,
			serialNumber: equipment.serialNumber,
			component: component.number,
			engineer: engineer.name,
		})
		.from(unitCondition)
		.innerJoin(equipment, eq(equipment.id, unitCondition.equipmentId))
		.leftJoin(component, eq(component.id, unitCondition.componentId))
		.leftJoin(engineer, eq(engineer.id, unitCondition.engineerId))
		.where(inList(unitCondition.organizationId, organizationIds))
		.orderBy(asc(unitCondition.id));
	const office = (organizationId: string) =>
		demoUsers.find((user) =>
			user.memberships.some(
				(member) =>
					member.organizationId === organizationId &&
					member.role !== "engineer" &&
					member.role !== "customer",
			),
		)?.name ?? "";
	return found.map((row) => ({
		organizationId: row.organizationId,
		userName: row.engineer ?? office(row.organizationId),
		action: "recorded" as const,
		subjectType: "unitCondition",
		subjectId: String(row.id),
		subjectLabel: [row.serialNumber, row.component, `${row.score}/6`].filter(Boolean).join(" · "),
		parentType: "equipment",
		parentId: String(row.unitId),
		parentLabel: row.serialNumber,
		note: row.advice,
		createdAt: row.recordedAt,
	}));
}

export default defineSeed<TenantDraft["profile"]>({
	// The components' articles are the materials', which have to be in.
	after: ["materials"],

	// Whose business the tenant is, which says which conditions it gets.
	generate: ({ profile }) => profile,

	async run({ tx, tenants, count, log }) {
		/** A condition to insert, with its defects (by component id). */
		const rows: {
			values: Omit<typeof unitCondition.$inferInsert, "score">;
			defects: (DefectGrade & {
				description: string;
				componentId: number | null;
				checklistPointId?: number;
			})[];
		}[] = [];
		for (const tenant of tenants) {
			const organizationId = tenant.id;
			const random = new Faker({ locale: [nl, en] });
			random.seed(tenant.seed + 21);
			const { units, lastDone } = await unitsOf(tx, organizationId);
			const parts = tenant.data === "shltr" ? await seedComponents(tx, tenant, units, count) : [];
			const partByNumber = new Map(parts.map((part) => [part.seed.number, part.id]));
			/** A seeded defect as it's inserted, on its component (if it's on one the unit has). */
			const asDefect = (defect: SeedDefect, componentId: number | null = null) => ({
				description: defect.text,
				severity: defect.severity,
				extent: defect.extent,
				intensity: defect.intensity,
				componentId: componentId ?? (defect.on ? (partByNumber.get(defect.on) ?? null) : null),
			});

			// What the completed checklists found, of the units and their components (their rejected
			// points, each with a grade), and when each unit's last one was.
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
				const own = parts.filter((each) => each.equipmentId === found.equipmentId);
				const isPart = (part: (typeof own)[number], point: (typeof found.results)[number]) =>
					point.templateItemId !== null && part.items.has(point.templateItemId);
				const counts = (point: (typeof found.results)[number]) =>
					point.result === "ok" || point.result === "nok";
				const grades = new Map(
					found.results.flatMap((point) =>
						point.result === "nok" ? [[point.id, rejectedGrade(random)] as const] : [],
					),
				);
				const defectOf = (point: (typeof found.results)[number], componentId: number | null) => ({
					...grades.get(point.id)!,
					description: point.remark ? `${point.text}: ${point.remark}` : point.text,
					componentId,
					checklistPointId: point.id,
				});
				const rejected = found.results.filter((point) => point.result === "nok");
				if (found.results.some(counts)) {
					rows.push({
						values: recorded,
						defects: rejected.map((point) =>
							defectOf(point, own.find((part) => isPart(part, point))?.id ?? null),
						),
					});
				}
				for (const part of own) {
					const points = found.results.filter((point) => isPart(part, point));
					if (!points.some(counts)) continue;
					rows.push({
						values: { ...recorded, componentId: part.id },
						defects: points
							.filter((point) => point.result === "nok")
							.map((point) => defectOf(point, part.id)),
					});
				}
			}

			/**
			 * A condition of `unit` with `defects`, recorded `daysAgo`: on its last done order then, if it
			 * had one and no checklist on it; the latest (`last`) after the unit's last checklist, from the
			 * office.
			 */
			const add = (
				unitId: number,
				defects: ReturnType<typeof asDefect>[],
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
					values: {
						organizationId,
						equipmentId: unitId,
						componentId,
						advice: advice || null,
						source: onVisit ? "checklist" : "office",
						...withTenantRefs(organizationId, { orderId: onVisit?.orderId ?? null }),
						engineerId: onVisit?.engineerId ?? null,
						recordedAt,
					},
					defects,
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
					named.history.forEach(({ daysAgo, defects }, i) => {
						const last = i === named.history.length - 1;
						add(
							unit.id,
							defects.map((defect) => asDefect(defect)),
							daysAgo,
							last ? named.advice : "",
							last,
						);
					});
				}
				// The components' conditions as the mockup has them, from the office a day ago (or
				// after their unit's last checklist).
				for (const part of parts) {
					add(
						part.equipmentId,
						part.seed.defects.map((defect) => asDefect(defect, part.id)),
						1,
						part.seed.advice,
						true,
						part.id,
					);
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
							madeUpDefects(random, "healthy").map((defect) => asDefect(defect)),
							random.number.int({ min: 200, max: 400 }),
							"",
						);
					}
					const worn = random.datatype.boolean(0.06);
					add(
						unit.id,
						madeUpDefects(random, worn ? "worn" : "healthy").map((defect) => asDefect(defect)),
						0,
						worn ? random.helpers.arrayElement(wear) : "",
					);
				}
			} else {
				const picked = units.slice(0, NORTH.critical + NORTH.attention + NORTH.healthy);
				picked.forEach((unit, i) => {
					const state =
						i < NORTH.critical
							? "critical"
							: i < NORTH.critical + NORTH.attention
								? "worn"
								: "healthy";
					// The one before, half a year before the latest: on the unit's last visit, which may
					// be longer ago than that. Better than now, but for a healthy one.
					const visit = lastDone.get(unit.id)?.completedAt;
					const since = visit ? Math.floor((now.getTime() - visit.epochMilliseconds) / DAY) : 0;
					add(
						unit.id,
						madeUpDefects(random, state === "critical" ? "worn" : "healthy").map((defect) =>
							asDefect(defect),
						),
						since + 180,
						"",
					);
					add(
						unit.id,
						madeUpDefects(random, state).map((defect) => asDefect(defect)),
						0,
						i < NORTH.critical ? random.helpers.arrayElement(wear) : "",
					);
				});
			}
		}
		// One at a time, for its id, which its defects refer to; in the order made, which the log keeps.
		const defects: (typeof conditionDefect.$inferInsert)[] = [];
		for (const { values, defects: found } of rows) {
			const [made] = await tx
				.insert(unitCondition)
				.values({ ...values, score: recordScore(found) })
				.returning({ id: unitCondition.id });
			defects.push(
				...found.map((defect, position) => ({
					...defect,
					organizationId: values.organizationId,
					conditionId: made.id,
					score: defectScore(defect),
					position,
				})),
			);
		}
		await insertRows(tx, conditionDefect, defects);
		count("unitConditions", rows);
		count("conditionDefects", defects);
		log(
			await recordedEntries(
				tx,
				tenants.map((tenant) => tenant.id),
			),
		);
	},
});
