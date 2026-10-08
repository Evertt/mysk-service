import type { Faker } from "@faker-js/faker";

import { type ContractLevel, defaultResponseHours } from "#lib/components/contracts/model.ts";
import type { customerSegments } from "#lib/models.ts";
import { formatCode } from "#lib/numbering.ts";

import { addDays, now } from "./clock.ts";
import type { generateCustomers } from "./customers.ts";
import type { generateEquipment } from "./equipment.ts";
import type { generateMaterials } from "./materials.ts";

/** Monthly fee per covered unit in euros, by level. */
const feePerUnit: Record<ContractLevel, [number, number]> = {
	basic: [35, 55],
	standard: [70, 110],
	premium: [140, 220],
};

/** Shorter or longer response times than the level's default, agreed now and then. */
const customResponseHours: Record<ContractLevel, number[]> = {
	basic: [48, 96],
	standard: [12, 48],
	premium: [2, 8],
};

const contractNotes = [
	"Inclusief de jaarlijkse wettelijke keuring.",
	"Onderdelen inbegrepen tot € 2.000 per jaar.",
	"Storingen buiten kantooruren worden apart gefactureerd.",
	"Toegang via de receptie; bezoek 24 uur van tevoren aanmelden.",
	"Tarief wordt jaarlijks geïndexeerd (CBS-index + 1%).",
	"Alleen de hoofdlocatie; nevenlocaties op aanvraag.",
];

const levelsBySegment: Record<(typeof customerSegments)[number], ContractLevel[]> = {
	enterprise: ["premium", "premium", "standard"],
	mid_market: ["standard", "standard", "basic", "premium"],
	small_business: ["basic", "basic", "standard"],
};

/** Moves a date by whole years, keeping the day of the month. */
const addYears = (date: Date, years: number) =>
	new Date(date.getFullYear() + years, date.getMonth(), date.getDate());

/** A contract term with the ids of the units it covers. */
export type ContractTerm = ReturnType<typeof generateContractTerms>[number];

/**
 * The service contracts (ids from 1), one row per term, with the ids of the units each covers.
 * Mostly larger customers have one. Each has a run of consecutive terms (renewals, often upgraded
 * over time): the latest is active or starts soon, unless the customer let it lapse.
 */
export function generateContractTerms(
	faker: Faker,
	customers: ReturnType<typeof generateCustomers>,
	equipments: ReturnType<typeof generateEquipment>,
) {
	const contractTerms = customers
		.filter((owner) =>
			faker.datatype.boolean(
				{ enterprise: 1, mid_market: 0.85, small_business: 0.1 }[owner.segment],
			),
		)
		.flatMap((owner) => {
			const owned = equipments.filter((e) => e.customerId === owner.id);
			const lapsed = faker.datatype.boolean(0.15);
			let level = faker.helpers.arrayElement(levelsBySegment[owner.segment]);
			let years = faker.helpers.arrayElement([1, 1, 2, 3]);
			const latestStart = lapsed
				? faker.date.between({
						from: addDays(now, -years * 365 - 500),
						to: addDays(now, -years * 365 - 30),
					})
				: faker.date.between({ from: addDays(now, -years * 365 + 30), to: addDays(now, 60) });
			// Contracts start on the first of a month.
			let startsOn = new Date(latestStart.getFullYear(), latestStart.getMonth(), 1);

			const terms = [];
			const termCount = faker.helpers.arrayElement([1, 2, 2, 3]);
			// Newest first, back to when the customer joined.
			for (let i = 0; i < termCount && startsOn > owner.createdAt; i++) {
				const endsOn = addDays(addYears(startsOn, years), -1);
				const eligible = owned.filter(
					(e) => e.installedAt < endsOn && (endsOn < now || e.status !== "decommissioned"),
				);
				if (eligible.length) {
					const covered = faker.helpers.arrayElements(
						eligible,
						faker.number.int({ min: 1, max: eligible.length }),
					);
					const [min, max] = feePerUnit[level];
					// A volume discount from four units.
					const fee =
						covered.length * faker.number.int({ min, max }) * (covered.length >= 4 ? 0.9 : 1);
					terms.push({
						customerId: owner.id,
						level,
						startsOn,
						endsOn,
						monthlyFee: Math.round(fee / 5) * 500,
						responseHours: faker.datatype.boolean(0.15)
							? faker.helpers.arrayElement(customResponseHours[level])
							: defaultResponseHours[level],
						notes: faker.helpers.maybe(() => faker.helpers.arrayElement(contractNotes), {
							probability: 0.3,
						}),
						createdAt: new Date(
							Math.min(
								addDays(startsOn, -faker.number.int({ min: 7, max: 45 })).getTime(),
								addDays(now, -1).getTime(),
							),
						),
						equipmentIds: covered.map((e) => e.id),
					});
				}
				// The term before this one; customers tend to upgrade, so it may be a level lower.
				years = faker.helpers.arrayElement([1, 1, 2]);
				startsOn = addYears(startsOn, -years);
				if (level !== "basic" && faker.datatype.boolean(0.3)) {
					level = level === "premium" ? "standard" : "basic";
				}
			}
			return terms;
		})
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
		.map((c, i) => ({
			id: i + 1,
			number: formatCode("contract", i + 1, c.createdAt.getFullYear()),
			...c,
		}));

	// A running contract that ends soon and isn't renewed, for the module's "Contracts ending soon"
	// on the dashboard: if no customer's latest term ends in the next 60 days, the one that ends
	// first after that ends in 30 days instead. Fixed rather than random, like the call-outs below.
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const latestTerms = [...Map.groupBy(contractTerms, (c) => c.customerId).values()]
		.map((terms) => terms.reduce((a, b) => (b.startsOn > a.startsOn ? b : a)))
		.filter((c) => c.startsOn <= now && c.endsOn >= today)
		.sort((a, b) => a.endsOn.getTime() - b.endsOn.getTime() || a.id - b.id);
	if (latestTerms.length && latestTerms[0].endsOn >= addDays(today, 60)) {
		latestTerms[0].endsOn = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
	}

	return contractTerms;
}

/** The contract rows and the rows that say which units each covers. */
export function splitContractTerms(contractTerms: ContractTerm[]) {
	const contracts = contractTerms.map(({ equipmentIds: _equipmentIds, ...c }) => c);
	const contractCoverage = contractTerms.flatMap((c) =>
		c.equipmentIds.map((equipmentId) => ({
			customerId: c.customerId,
			contractId: c.id,
			equipmentId,
		})),
	);
	return { contracts, contractCoverage };
}

/**
 * Repairs on covered units that aren't scheduled yet, with their lines, so the module's response
 * times (see `#lib/components/contracts/coverage.ts`) have something to show: one overdue, one at
 * risk (on the slowest contract, so it stays at risk for a while), one on track. Fixed rather than
 * random, and made last, so the rest of the data stays the same. The orders get ids after the
 * `orderCount` generated ones, and their units are set to need service (in place).
 */
export function generateCallOuts(
	contractTerms: ContractTerm[],
	orderCount: number,
	equipments: ReturnType<typeof generateEquipment>,
	materials: ReturnType<typeof generateMaterials>,
) {
	const running = contractTerms
		.filter((c) => c.startsOn <= now && now < addDays(c.endsOn, 1))
		.sort((a, b) => a.responseHours - b.responseHours || a.id - b.id);
	const waiting =
		running.length >= 3
			? [
					{
						term: running[0],
						hoursAgo: running[0].responseHours + 2,
						description: "Installatie uitgevallen na stroomstoring; klant heeft twee keer gebeld",
					},
					{
						term: running[running.length - 1],
						hoursAgo: running[running.length - 1].responseHours * 0.85,
						description: "Storing komt en gaat, alarm op de regeling",
					},
					{
						term: running[Math.floor(running.length / 2)],
						hoursAgo: 0.5,
						description: "Sinds vanochtend afwijkend geluid",
					},
				]
			: [];
	const orders = waiting.map(({ term, hoursAgo, description }, i) => {
		const id = orderCount + i + 1;
		const createdAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
		const unit = equipments[term.equipmentIds[0] - 1];
		unit.status = "needs_service";
		return {
			id,
			number: formatCode("order", id, createdAt.getFullYear()),
			customerId: term.customerId,
			equipmentId: unit.id,
			engineerId: null,
			type: "repair" as const,
			status: "quote" as const,
			priority: "high" as const,
			description,
			scheduledFor: null,
			completedAt: null,
			laborHours: 2,
			createdAt,
		};
	});
	const orderLines = orders.map((o) => ({
		orderId: o.id,
		materialId: materials[3].id,
		quantity: 2,
		unitPrice: materials[3].unitPrice,
	}));
	return { orders, orderLines };
}
