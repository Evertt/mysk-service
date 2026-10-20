/**
 * The demo tenants' checklists on their orders, as the engineers would have left them: each unit
 * of a done inspection or maintenance order completed with the order (most points OK, now and then
 * one rejected with what's wrong, as SHLTR's engineers write it), and for SHLTR, each unit of one
 * still to be done with a draft. North has a few completed ones and no drafts, so the core's tests
 * that complete its orders find none in the way. Each completed one is logged as its completion
 * would be (in Dutch, the demo's language), for the condition module's service history. Like the
 * rest of the seed, in plain Node, and the same every time for a tenant (a faker of its own, seeded
 * per tenant).
 */
import { en, Faker, nl } from "@faker-js/faker";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";

import { isDoneOrder } from "#lib/models.ts";
import { insertBatches, insertRows } from "#lib/server/db/parameters.ts";
import { engineer, equipment, order, orderUnit } from "#lib/server/db/schema.ts";
import { now } from "#lib/server/db/seed/clock.ts";
import type {
	SeedContext,
	SeedLogEntry,
	SeedTenant,
	SeedTransaction,
} from "#lib/server/db/seed/module-seed.ts";
import { toDay } from "#lib/server/db/seed/temporal.ts";

import {
	checklistKind,
	EXPIRING_DAYS,
	getsChecklists,
	orderPoints,
	type PointResult,
	validUntil,
} from "../model.ts";
import {
	checklist,
	checklistResult,
	checklistTemplate,
	checklistTemplateCategory,
	checklistTemplateItem,
} from "./schema.ts";

/** What's wrong, by a point's group: the remarks a rejection gets. */
const defects: Record<string, string[]> = {
	Mechanisch: [
		"Draadbreuk zichtbaar bij trommel — kabelset meenemen.",
		"Torsieveer links gebroken; veerset vervangen.",
		"Twee looprollen versleten, deur loopt stroef — rollen vervangen bij volgend bezoek.",
	],
	Elektrisch: [
		"Eindschakelaar boven reageert niet altijd; schakelaar vervangen.",
		"Noodstop knop gescheurd, nieuwe knop bestellen.",
	],
	Veiligheid: [
		"Fotocel scheef gemonteerd en kabel beschadigd — fotocelset vervangen.",
		"Sluitkantbeveiliging reageert te laat; contactlijst vervangen.",
		"Waarschuwingsstrepen grotendeels weggesleten; opnieuw aanbrengen.",
	],
	Afdichting: ["Bodemrubber over 1 m gescheurd — afdichtingsrubber meenemen."],
	Hydrauliek: [
		"Lichte olielekkage bij hoofdcilinder; afdichtset bestellen.",
		"Hydraulische slang poreus bij koppeling — slang vervangen.",
	],
	Constructie: [
		"Haarscheur in de lip bij het scharnier; lip vervangen.",
		"Twee ankerbouten los in de vloer; opnieuw verankeren.",
	],
	Salvo: ["Beacon knippert niet meer; lamp defect, vervangen."],
	Binnenunit: ["Condenspomp maakt geluid en lekt — pomp vervangen."],
	Buitenunit: ["Ventilatorlager slaat aan; motor buitenunit vervangen."],
	Koudemiddel: [
		"Lekkage bij flare-verbinding buitenunit; opnieuw afgedicht, hercontrole over 4 weken.",
	],
	Afwerking: ["Corrosie aan onderzijde bordes; behandelen en opnieuw coaten."],
	Algemeen: ["Deurdranger lekt olie; dranger vervangen."],
};
const anyDefect = "Afwijking geconstateerd; onderdeel bestellen en bij volgend bezoek herstellen.";

/** The general remark for the customer, when points were rejected. */
const advice = [
	"Afkeurpunten graag op korte termijn laten herstellen; offerte volgt.",
	"Onderdelen besteld, herstel ingepland bij het volgende bezoek.",
	"Deur blijft in gebruik; gebrek binnen vier weken laten verhelpen.",
];

/** How many of North's done orders get completed checklists. */
const NORTH_DONE = 8;

/** A point's result, as an engineer finds it: mostly OK. Never a rejection of the wrap-up. */
function findResult(random: Faker, group: string): { result: PointResult; remark: string | null } {
	const roll = random.number.float({ min: 0, max: 1 });
	if (group !== "Afronding" && roll < 0.06) {
		return { result: "nok", remark: random.helpers.arrayElement(defects[group] ?? [anyDefect]) };
	}
	if (roll > 0.95) return { result: "na", remark: null };
	return { result: "ok", remark: null };
}

/** Whether an inspection valid until `ends` is expiring `today`: ends within `EXPIRING_DAYS`. */
const expiresSoon = (ends: Temporal.PlainDate, today: Temporal.PlainDate) =>
	Temporal.PlainDate.compare(ends, today) >= 0 &&
	Temporal.PlainDate.compare(ends, today.add({ days: EXPIRING_DAYS })) <= 0;

/** How a completion's entry notes its rejected points, as `rejectionsNote()` does in Dutch. */
const rejectionsNote = (count: number) =>
	count ? `${count} ${count === 1 ? "afkeurpunt" : "afkeurpunten"}` : "Goedgekeurd";

/** The tenant's checklists on its orders (see above), in `tx`; counted for the summary, and logged. */
export async function seedChecklists(
	tx: SeedTransaction,
	tenant: SeedTenant<unknown>,
	shltr: boolean,
	{ count, log }: Pick<SeedContext, "count" | "log">,
) {
	const organizationId = tenant.id;
	const random = new Faker({ locale: [nl, en] });
	random.seed(tenant.seed + 11);

	// The tenant's templates by category, with their points in order.
	const offered = await tx
		.select({
			categoryId: checklistTemplateCategory.categoryId,
			id: checklistTemplate.id,
			name: checklistTemplate.name,
			norm: checklistTemplate.norm,
			validityMonths: checklistTemplate.validityMonths,
		})
		.from(checklistTemplateCategory)
		.innerJoin(checklistTemplate, eq(checklistTemplate.id, checklistTemplateCategory.templateId))
		.where(eq(checklistTemplateCategory.organizationId, organizationId));
	const templateOf = new Map(offered.map((template) => [template.categoryId, template]));
	const items = await tx
		.select({
			id: checklistTemplateItem.id,
			templateId: checklistTemplateItem.templateId,
			group: checklistTemplateItem.group,
			text: checklistTemplateItem.text,
			position: checklistTemplateItem.position,
		})
		.from(checklistTemplateItem)
		.where(eq(checklistTemplateItem.organizationId, organizationId));
	const pointsOf = new Map(
		[...Map.groupBy(items, (item) => item.templateId)].map(([id, points]) => [
			id,
			orderPoints(points),
		]),
	);

	const orders = await tx
		.select({
			id: order.id,
			number: order.number,
			type: order.type,
			status: order.status,
			engineerId: order.engineerId,
			engineer: engineer.name,
			completedAt: order.completedAt,
		})
		.from(order)
		.leftJoin(engineer, eq(engineer.id, order.engineerId))
		.where(
			and(
				eq(order.organizationId, organizationId),
				or(eq(order.type, "inspection"), eq(order.type, "maintenance")),
			),
		)
		.orderBy(desc(order.completedAt), asc(order.id));
	const done = orders.filter((row) => isDoneOrder(row.status) && row.completedAt);
	const open = orders.filter((row) => getsChecklists(row.status));
	const picked = shltr ? [...done, ...open] : done.slice(0, NORTH_DONE);
	if (!picked.length) return;

	const units = await tx
		.select({
			orderId: orderUnit.orderId,
			equipmentId: orderUnit.equipmentId,
			categoryId: equipment.categoryId,
			title: sql<string>`coalesce(${equipment.name}, trim(${equipment.manufacturer} || ' ' || ${equipment.model}))`,
		})
		.from(orderUnit)
		.innerJoin(equipment, eq(equipment.id, orderUnit.equipmentId))
		.where(eq(orderUnit.organizationId, organizationId))
		.orderBy(asc(orderUnit.orderId), asc(orderUnit.position));
	const unitsOf = Map.groupBy(units, (unit) => unit.orderId);

	const checklists: (typeof checklist.$inferInsert)[] = [];
	/** Each completed checklist's entry, but its id (`checklists`' index, until they're in). */
	const completions = new Map<number, Omit<SeedLogEntry, "subjectId">>();
	const answers: {
		templateItemId: number;
		group: string;
		text: string;
		result: PointResult | null;
		remark: string | null;
	}[][] = [];
	const today = toDay(now);
	for (const row of picked) {
		const kind = checklistKind(row.type)!;
		const completed = !getsChecklists(row.status);
		// Its day in the seed's time zone (`#lib/server/db/seed/time-zone.ts`), as `today`'s.
		const completedOn = row.completedAt
			?.toZonedDateTimeISO(Temporal.Now.timeZoneId())
			.toPlainDate();
		for (const unit of unitsOf.get(row.id) ?? []) {
			const template = templateOf.get(unit.categoryId);
			if (!template) continue;
			const ends =
				completed && kind === "inspection" && completedOn
					? validUntil(completedOn, template.validityMonths)
					: null;
			// An inspection that runs out within the month passed, so the demo has units "expiring"
			// (a rejected one would be "rejected" until then).
			const approved = !!ends && expiresSoon(ends, today);
			const points = (pointsOf.get(template.id) ?? []).map(({ id, group, text }) => ({
				templateItemId: id,
				group,
				text,
				...(approved
					? { result: "ok" as const, remark: null }
					: completed
						? findResult(random, group)
						: { result: null, remark: null }),
			}));
			const rejections = points.filter((point) => point.result === "nok").length;
			const rejected = rejections > 0;
			const remarks = completed && rejected ? random.helpers.arrayElement(advice) : null;
			if (completed && row.completedAt) {
				completions.set(checklists.length, {
					organizationId,
					userName: row.engineer ?? "",
					action: "completed",
					subjectType: "checklist",
					subjectLabel: `${template.name} · ${unit.title}`,
					parentType: "order",
					parentId: String(row.id),
					parentLabel: row.number,
					changes: { status: ["draft", "completed"], ...(remarks && { remarks: [null, remarks] }) },
					note: rejectionsNote(rejections),
					createdAt: row.completedAt,
				});
			}
			checklists.push({
				organizationId,
				orderId: row.id,
				equipmentId: unit.equipmentId,
				templateId: template.id,
				name: template.name,
				norm: template.norm,
				validityMonths: template.validityMonths,
				kind,
				status: completed ? "completed" : "draft",
				remarks,
				completedAt: completed ? row.completedAt : null,
				completedBy: completed ? row.engineerId : null,
				validUntil: ends,
			});
			answers.push(points);
		}
	}
	const ids: number[] = [];
	for (const batch of insertBatches(checklist, checklists)) {
		const inserted = await tx.insert(checklist).values(batch).returning({ id: checklist.id });
		ids.push(...inserted.map((made) => made.id));
	}
	const results = answers.flatMap((points, i) =>
		points.map((point, position) => ({ organizationId, checklistId: ids[i], position, ...point })),
	);
	await insertRows(tx, checklistResult, results);
	log([...completions].map(([index, entry]) => ({ ...entry, subjectId: String(ids[index]) })));
	count("checklists", checklists);
	count("checklistResults", results);
}
