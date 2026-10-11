import { en, Faker, nl } from "@faker-js/faker";

import { addDays, now } from "#lib/server/db/seed/clock.ts";
import { defineSeed, type TenantDraft } from "#lib/server/db/seed/module-seed.ts";

import { type PlanOrderType } from "../model.ts";
import { maintenancePlan } from "./schema.ts";

/** What a plan looks like per category, in Dutch like the rest of the demo data. */
const kinds: Record<
	"boiler" | "chiller" | "generator",
	{ description: string; type: PlanOrderType; interval: number }[]
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
};

const isPlanned = (category: string): category is keyof typeof kinds => category in kinds;

/**
 * The plans of a tenant's units (ids from 1, like the draft's): about a third of its boilers,
 * chillers and generators that are still in use have one, some two; most are due within the
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
			const options = kinds[unit.category as keyof typeof kinds];
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
			}));
			await insertAll(plans, (chunk) => tx.insert(maintenancePlan).values(chunk));
			count("maintenancePlans", plans);
		}
	},
});
