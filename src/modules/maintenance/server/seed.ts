import { en, Faker, nl } from "@faker-js/faker";

import type { SeedCategory } from "#lib/server/db/seed/categories.ts";
import { addDays, now } from "#lib/server/db/seed/clock.ts";
import { defineSeed, type TenantDraft } from "#lib/server/db/seed/module-seed.ts";
import { toDay, toMoment } from "#lib/server/db/seed/temporal.ts";

import { type PlanOrderType } from "../model.ts";
import { maintenancePlan } from "./schema.ts";

/**
 * What a plan looks like per demo category (by its key, see `seedCategories`, and SHLTR's in
 * `shltrCategories`: its doors, docks, stairs and airco are serviced and inspected by the norms its
 * checklists name), in Dutch like the rest of the demo data.
 */
const kinds: Partial<
	Record<SeedCategory, { description: string; type: PlanOrderType; interval: number }[]>
> = {
	boiler: [
		{ description: "Jaarlijks ketelonderhoud", type: "maintenance", interval: 12 },
		{ description: "Rookgasanalyse en veiligheidscontrole", type: "inspection", interval: 24 },
	],
	chiller: [
		{ description: "Filters vervangen", type: "maintenance", interval: 3 },
		{ description: "F-gassencontrole", type: "inspection", interval: 12 },
		{ description: "Halfjaarlijks onderhoud koelinstallatie", type: "maintenance", interval: 6 },
	],
	generator: [
		{ description: "Proefdraaien onder belasting", type: "inspection", interval: 6 },
		{ description: "Jaarlijks onderhoud aggregaat", type: "maintenance", interval: 12 },
	],
	sectional_door: [
		{ description: "Halfjaarlijks onderhoud sectionaaldeur", type: "maintenance", interval: 6 },
		{
			description: "Jaarlijkse keuring sectionaaldeur (NEN-EN 12604/12453)",
			type: "inspection",
			interval: 12,
		},
	],
	fire_door: [{ description: "Jaarlijkse inspectie branddeur", type: "inspection", interval: 12 }],
	automatic_door: [
		{
			description: "Onderhoud automatische deur volgens NEN-EN 16005",
			type: "maintenance",
			interval: 12,
		},
	],
	high_speed_door: [
		{ description: "Halfjaarlijks onderhoud snelroldeur", type: "maintenance", interval: 6 },
	],
	dock_leveller: [
		{ description: "Onderhoud dockleveller", type: "maintenance", interval: 6 },
		{ description: "Jaarlijkse keuring dockleveller", type: "inspection", interval: 12 },
	],
	salvo_dock: [{ description: "Onderhoud Salvo dock", type: "maintenance", interval: 12 }],
	stairs: [
		{
			description: "Keuring bordes / trap (NEN-EN ISO 14122)",
			type: "inspection",
			interval: 12,
		},
	],
	hvac: [
		{ description: "F-gassen lekdichtheidscontrole", type: "inspection", interval: 12 },
		{ description: "Onderhoud airco, filters reinigen", type: "maintenance", interval: 6 },
	],
	aerial_platform: [
		{ description: "Periodieke keuring hoogwerker", type: "inspection", interval: 12 },
	],
};

const isPlanned = (category: SeedCategory) => category in kinds;

/**
 * The plans of a tenant's units (ids from 1, like the draft's): about a third of the ones in use
 * whose category has `kinds` (boilers, chillers, generators; SHLTR's doors, docks and airco) have
 * one, some two; most are due within the
 * coming months, a few are overdue and a few paused. With a faker of its own, seeded per tenant,
 * so the rest of the demo data is the same with or without the module.
 */
function generatePlans(equipments: TenantDraft["equipments"], seed: number) {
	const random = new Faker({ locale: [nl, en] });
	random.seed(seed);
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	return equipments
		.filter((unit) => unit.status !== "decommissioned" && isPlanned(unit.category))
		.filter(() => random.datatype.boolean(0.35))
		.flatMap((unit) => {
			const options = kinds[unit.category]!;
			const chosen = random.helpers.arrayElements(options, random.datatype.boolean(0.25) ? 2 : 1);
			return chosen.map((kind) => {
				// Mostly ahead; one in six overdue, by up to two months.
				const overdue = random.datatype.boolean(1 / 6);
				const nextDueOn = addDays(
					today,
					overdue
						? -random.number.int({ min: 1, max: 60 })
						: random.number.int({ min: 0, max: kind.interval * 30 }),
				);
				return {
					equipmentId: unit.id,
					orderType: kind.type,
					description: kind.description,
					intervalMonths: kind.interval,
					nextDueOn,
					anchorDay: nextDueOn.getDate(),
					paused: random.datatype.boolean(0.06),
					createdAt: addDays(today, -random.number.int({ min: 30, max: 400 })),
				};
			});
		});
}

export default defineSeed<TenantDraft["equipments"]>({
	clear: async (tx) => {
		await tx.delete(maintenancePlan);
	},

	// The units the plans are for; the plans themselves come from a faker of their own, in `run()`.
	generate: ({ equipments }) => equipments,

	async run({ tx, tenants, insertAll, count }) {
		for (const tenant of tenants) {
			const plans = generatePlans(tenant.data, tenant.seed + 7).map((plan) => ({
				...plan,
				organizationId: tenant.id,
				equipmentId: tenant.equipmentIds[plan.equipmentId - 1],
				nextDueOn: toDay(plan.nextDueOn),
				createdAt: toMoment(plan.createdAt),
			}));
			await insertAll(plans, (chunk) => tx.insert(maintenancePlan).values(chunk));
			count("maintenancePlans", plans);
		}
	},
});
