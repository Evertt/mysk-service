import type { Faker } from "@faker-js/faker";

import type { customerSegments } from "#lib/models.ts";
import { formatCode } from "#lib/numbering.ts";
import { insertRows } from "#lib/server/db/parameters.ts";
import { addDays, HOUR, now, today } from "#lib/server/db/seed/clock.ts";
import {
	defineSeed,
	type SeedBillableItem,
	type SeedOrder,
	type TenantDraft,
} from "#lib/server/db/seed/module-seed.ts";
import { toDay, toMoment } from "#lib/server/db/seed/temporal.ts";
import type { MaterialsDraft } from "#modules/materials/api/seed.ts";

import {
	type ContractLevel,
	contractNumberFormat,
	coveredOrderTypes,
	defaultResponseHours,
} from "../model.ts";
import { type ContractMonth, contractMonths, monthlyFee } from "./billing.ts";
import { contract, contractEquipment } from "./schema.ts";

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

type Owner = TenantDraft["customers"][number];

/** Who has a contract, at which level, and what it says: a demo tenant's own way of contracting. */
interface ContractPolicy {
	/** How likely a customer is to have one. */
	chance(owner: Owner): number;
	/** The level of the customer's latest term, which `drawn` the seed drew for it. */
	level?(owner: Owner, drawn: ContractLevel): ContractLevel;
	/** Whether the customer's contract runs now, whatever the seed drew. */
	running?(owner: Owner): boolean;
	/** The response time of a term, which `drawn` the seed drew for it. */
	responseHours?(owner: Owner, level: ContractLevel, drawn: number, latest: boolean): number;
	/** A term's notes. */
	notes(faker: Faker, level: ContractLevel, responseHours: number): string | undefined;
}

/** The Fieldworks tenants': mostly larger customers, now and then a note. */
const fieldworksPolicy: ContractPolicy = {
	chance: (owner) => ({ enterprise: 1, mid_market: 0.85, small_business: 0.1 })[owner.segment],
	notes: (faker) =>
		faker.helpers.maybe(() => faker.helpers.arrayElement(contractNotes), { probability: 0.3 }),
};

/**
 * SHLTR's contracts, by the names its Connect page gives them (`docs/plans/shltr-domain.md`, §3.1),
 * on the module's levels: "Full service" is premium (labour and parts included), around the clock
 * with a 4-hour response, else 8; "Onderhoud + keuring" standard; "Basis onderhoud" basic. The
 * name opens the contract's notes. The mockup's customers have theirs.
 */
const shltrContractNames = {
	"Full service 24/7": { level: "premium", responseHours: 4 },
	"Full service": { level: "premium", responseHours: 8 },
	"Onderhoud + keuring": { level: "standard", responseHours: 24 },
	"Basis onderhoud": { level: "basic", responseHours: 72 },
} as const satisfies Record<string, { level: ContractLevel; responseHours: number }>;
type ShltrContractName = keyof typeof shltrContractNames;

const shltrCustomerContracts: Record<string, ShltrContractName> = {
	"Riedel B.V.": "Full service 24/7",
	"Weggemans Logistiek": "Full service",
	"Bouwgroep De Vries": "Onderhoud + keuring",
	"Vermeer Logistiek": "Onderhoud + keuring",
	"Pakhuis 7": "Basis onderhoud",
	"Van Dijk Koeltechniek": "Full service",
};

const shltrNotes = [
	"Inclusief de jaarlijkse keuring volgens NEN-EN 12604/12453.",
	"Onderdelen uit de onderdelenshop inbegrepen tot € 1.500 per jaar.",
	"Keuringsrapporten digitaal aanleveren.",
	"Storingen buiten kantooruren via de storingsdienst.",
];

/** The SHLTR name of a contract's level and response time. */
const shltrName = (level: ContractLevel, responseHours: number): ShltrContractName =>
	level === "premium"
		? responseHours <= 4
			? "Full service 24/7"
			: "Full service"
		: level === "standard"
			? "Onderhoud + keuring"
			: "Basis onderhoud";

const shltrPolicy: ContractPolicy = {
	chance: (owner) =>
		owner.name in shltrCustomerContracts
			? 1
			: { enterprise: 1, mid_market: 0.7, small_business: 0.15 }[owner.segment],
	level: (owner, drawn) => {
		const name = shltrCustomerContracts[owner.name];
		return name ? shltrContractNames[name].level : drawn;
	},
	running: (owner) => owner.name in shltrCustomerContracts,
	responseHours: (owner, level, drawn, latest) => {
		const name = shltrCustomerContracts[owner.name];
		if (latest && name) return shltrContractNames[name].responseHours;
		return level === "premium" ? drawn : defaultResponseHours[level];
	},
	notes: (faker, level, responseHours) => {
		const extra = faker.helpers.maybe(() => faker.helpers.arrayElement(shltrNotes), {
			probability: 0.4,
		});
		return [`${shltrName(level, responseHours)}.`, extra].filter(Boolean).join(" ");
	},
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
	customers: TenantDraft["customers"],
	equipments: TenantDraft["equipments"],
	policy: ContractPolicy = fieldworksPolicy,
) {
	const contractTerms = customers
		.filter((owner) => faker.datatype.boolean(policy.chance(owner)))
		.flatMap((owner) => {
			const owned = equipments.filter((e) => e.customerId === owner.id);
			const lapsed = faker.datatype.boolean(0.15) && !policy.running?.(owner);
			const drawn = faker.helpers.arrayElement(levelsBySegment[owner.segment]);
			let level = policy.level?.(owner, drawn) ?? drawn;
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
					const drawnHours = faker.datatype.boolean(0.15)
						? faker.helpers.arrayElement(customResponseHours[level])
						: defaultResponseHours[level];
					const responseHours =
						policy.responseHours?.(owner, level, drawnHours, i === 0) ?? drawnHours;
					terms.push({
						customerId: owner.id,
						level,
						startsOn,
						endsOn,
						monthlyFee: Math.round(fee / 5) * 500,
						responseHours,
						notes: policy.notes(faker, level, responseHours),
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
			number: formatCode(contractNumberFormat, i + 1, c.createdAt.getFullYear()),
			...c,
		}));

	// A running contract that ends soon and isn't renewed, for the module's "Contracts ending soon"
	// on the dashboard: if no customer's latest term ends in the next 60 days, the one that ends
	// first after that ends in 30 days instead. Fixed rather than random, like the call-outs below.
	const latestTerms = [...Map.groupBy(contractTerms, (c) => c.customerId).values()]
		.map((terms) => terms.reduce((a, b) => (b.startsOn > a.startsOn ? b : a)))
		.filter((c) => c.startsOn <= now && c.endsOn >= today)
		.sort((a, b) => a.endsOn.getTime() - b.endsOn.getTime() || a.id - b.id);
	// In calendar days: over the clocks' change in spring, 60 days of 24 hours end an hour into the
	// 60th day, so a term ending that day (not in the next 60) passed for one that ends in them.
	const in60Days = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);
	if (latestTerms.length && latestTerms[0].endsOn >= in60Days) {
		latestTerms[0].endsOn = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
	}

	return contractTerms;
}

/**
 * Repairs on covered units that aren't scheduled yet, so the module's response
 * times (see `../coverage.ts`) have something to show: one overdue, one at
 * risk (on the slowest contract, so it stays at risk for a while), one on track. Fixed rather than
 * random, and made last, so the rest of the data stays the same. The orders get ids after the
 * `orderCount` generated ones, and their units are set to need service (in place).
 */
export function generateCallOuts(
	contractTerms: ContractTerm[],
	orderCount: number,
	equipments: TenantDraft["equipments"],
) {
	// Running since before its call-out came in (at most its response time and two hours ago), so
	// the call-out is its, not the term's before it (which may respond faster or slower): just after
	// a new year, when many terms start, too.
	const running = contractTerms
		.filter(
			(c) =>
				c.startsOn.getTime() <= now.getTime() - (c.responseHours + 2) * HOUR &&
				now < addDays(c.endsOn, 1),
		)
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
		const createdAt = new Date(now.getTime() - hoursAgo * HOUR);
		const unit = equipments[term.equipmentIds[0] - 1];
		unit.status = "needs_service";
		return {
			id,
			number: formatCode("order", id, createdAt.getFullYear()),
			customerId: term.customerId,
			equipmentIds: [unit.id],
			engineerId: null,
			type: "breakdown" as const,
			status: "quote" as const,
			priority: "high" as const,
			description,
			scheduledFor: null,
			completedAt: null,
			laborHours: 2,
			createdAt,
		};
	});
	return orders;
}

/**
 * The call-outs' material lines, for a tenant that has materials (contracts enhance them): two of
 * the catalog's fourth material each, at its list price.
 */
function callOutLines(orders: { id: number }[], materials: MaterialsDraft) {
	const part = materials.materials[3];
	materials.orderLines.push(
		...orders.map((o) => ({
			orderId: o.id,
			materialId: part.id,
			quantity: 2,
			unitPrice: part.unitPrice,
		})),
	);
}

// --- What invoices need to know (collectors, see `ModuleSeed`) ----------------------------------

/** A contract level's name in Dutch, as `contractLabels.label("contractLevel", level)` shows it. */
const levelLabel = (level: ContractLevel) =>
	({ basic: "Basis", standard: "Standaard", premium: "Premium" })[level];

// Like `formatDate` in `#lib/i18n/format.ts` in Dutch, which the seed script can't import.
const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });

/** A contract's month on an invoice, worded like the app does in Dutch (the demo's language). */
const monthlyFeeText = (term: { number: string; level: ContractLevel }, month: ContractMonth) => ({
	description: `Servicecontract ${term.number} (${levelLabel(term.level)})`,
	detail: `Maandbedrag, ${day.format(month.startsOn)} – ${day.format(month.endsOn)}`,
});

/**
 * The contract that covered an order, as `coverageOf()` in `./contracts.ts` has it: of the
 * contracts covering all of its units, the ones running when the order was made, the fastest first.
 */
function coveringTerm(coverage: Map<number, ContractTerm[]>, order: SeedOrder) {
	const [first, ...others] = order.equipmentIds;
	if (!(coveredOrderTypes as readonly string[]).includes(order.type) || first === undefined) {
		return undefined;
	}
	return (
		(coverage.get(first) ?? [])
			// Only one that covers all of the order's units.
			.filter((term) => others.every((unit) => term.equipmentIds.includes(unit)))
			.filter((term) => {
				const end = new Date(
					term.endsOn.getFullYear(),
					term.endsOn.getMonth(),
					term.endsOn.getDate() + 1,
				);
				return term.startsOn <= order.createdAt && order.createdAt < end;
			})
			.sort((a, b) => a.responseHours - b.responseHours)[0]
	);
}

/** What `generate()` makes for a tenant. */
interface ContractsSeed {
	terms: ContractTerm[];
	/** The terms by the units they cover, in the order of the terms. */
	coverage: Map<number, ContractTerm[]>;
	/** A term's contract's id, after the tenants' before (claimed here: the collectors bill them). */
	contractId: (termId: number) => number;
}

export default defineSeed<ContractsSeed>({
	// Right after the core's data, with its faker: the terms and the call-outs follow from it.
	generate(draft) {
		const terms = generateContractTerms(
			draft.faker,
			draft.customers,
			draft.equipments,
			draft.profile === "shltr" ? shltrPolicy : fieldworksPolicy,
		);
		const callOuts = generateCallOuts(terms, draft.orders.length, draft.equipments);
		draft.orders.push(...callOuts);
		const materials = draft.modules.materials as MaterialsDraft | undefined;
		if (materials) callOutLines(callOuts, materials);
		const coverage = new Map<number, ContractTerm[]>();
		for (const term of terms) {
			for (const id of term.equipmentIds) coverage.set(id, [...(coverage.get(id) ?? []), term]);
		}
		return { terms, coverage, contractId: draft.ids.claim(contract, terms.length) };
	},

	// The work a contract includes is free, like `orders.adjustPrices` in `server/index.ts`.
	adjustPrices({ coverage }, order, { costs, labor }) {
		const term = coveringTerm(coverage, order);
		const included =
			term?.level === "premium" ? labor + costs : term?.level === "standard" ? labor : 0;
		if (!term || !included) return [];
		return [
			{
				label: `Gedekt door ${term.number} (${levelLabel(term.level)})`,
				detail: `${term.level === "premium" ? "Arbeid en materialen" : "Arbeid"} inbegrepen`,
				amount: -included,
			},
		];
	},

	// A month's fee for each month of the customers' contracts, like `invoices.billableItems`.
	billableItems({ terms, contractId }, { from, until }): SeedBillableItem[] {
		return terms.flatMap((term) =>
			contractMonths(
				{ startsOn: toDay(term.startsOn), endsOn: toDay(term.endsOn) },
				from,
				until,
			).map((month) => ({
				customerId: term.customerId,
				...monthlyFee({ ...term, id: contractId(term.id) }, month, monthlyFeeText(term, month)),
			})),
		);
	},

	async run({ tx, tenants, count }) {
		for (const tenant of tenants) {
			const { terms, contractId } = tenant.data;
			const customerId = (term: { customerId: number }) => tenant.customerId(term.customerId);
			const contracts = terms.map(({ equipmentIds: _equipmentIds, ...term }) => ({
				...term,
				organizationId: tenant.id,
				id: contractId(term.id),
				customerId: customerId(term),
				startsOn: toDay(term.startsOn),
				endsOn: toDay(term.endsOn),
				createdAt: toMoment(term.createdAt),
			}));
			const coverage = terms.flatMap((term) =>
				term.equipmentIds.map((equipmentId) => ({
					customerId: customerId(term),
					contractId: contractId(term.id),
					equipmentId: tenant.equipmentId(equipmentId),
				})),
			);
			await insertRows(tx, contract, contracts);
			await insertRows(tx, contractEquipment, coverage);
			count("contracts", contracts);
			count("coverage", coverage);
		}
	},
});
