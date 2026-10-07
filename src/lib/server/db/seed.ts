/**
 * Fills the database with fake, internally consistent data: orders only reference equipment
 * owned by the same customer, get an engineer whose specialty fits the equipment, and have a
 * status that matches their dates. Equipment status reflects the open repair orders on it.
 *
 * Also (re)creates the demo users you can sign in with, see "Demo login" in README.md.
 *
 * Run with `pnpm db:seed` (after `pnpm db:push`). Replaces all existing business data.
 */
import { en, Faker, faker } from "@faker-js/faker";
import { createClient } from "@libsql/client";
import { hashPassword } from "better-auth/crypto";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import {
	type ContractLevel,
	customerSegments,
	defaultResponseHours,
	engineerSpecialties,
	equipmentCategories,
	type EquipmentCategory,
	type EquipmentStatus,
	type MaterialUnit,
	type OrderPriority,
	type OrderStatus,
	type OrderType,
	specialtyForCategory,
} from "#lib/models.ts";

import { DEMO_PASSWORD, demoUsers } from "./demo.ts";
import * as schema from "./schema.ts";

const { account, customer, engineer, equipment, material, order, orderLine, session, user } =
	schema;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const db = drizzle(createClient({ url: DATABASE_URL }), { schema });

const now = new Date();
const DAY = 24 * 60 * 60 * 1000;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

/** Inserts in chunks to stay below SQLite's bound-parameter limit. */
async function insertAll<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
	for (let i = 0; i < rows.length; i += 100) await insert(rows.slice(i, i + 100));
}

interface TenantSize {
	customers: number;
	engineers: number;
	orders: number;
	/** Whether the tenant has the service contracts module, and so contracts. */
	contracts: boolean;
}

/** Generates one tenant's data, with ids from 1 (they're shifted when inserted). */
function generateTenant(size: TenantSize) {
	// --- Customers -------------------------------------------------------------------------------

	const customers = Array.from({ length: size.customers }, (_, i) => {
		const name = faker.company.name();
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();
		const domain = `${faker.helpers.slugify(name.split(/[ ,]/)[0]).toLowerCase()}.example`;
		return {
			id: i + 1,
			code: `CUST-${String(i + 1).padStart(4, "0")}`,
			name,
			contactName: `${firstName} ${lastName}`,
			email: faker.internet.email({ firstName, lastName, provider: domain }).toLowerCase(),
			phone: faker.phone.number({ style: "international" }),
			city: faker.location.city(),
			country: faker.helpers.arrayElement(["Netherlands", "Belgium", "Germany", "Luxembourg"]),
			segment: faker.helpers.weightedArrayElement([
				{ value: customerSegments[0], weight: 2 },
				{ value: customerSegments[1], weight: 5 },
				{ value: customerSegments[2], weight: 8 },
			]),
			createdAt: faker.date.past({ years: 5, refDate: addDays(now, -400) }),
		};
	});

	// --- Engineers -------------------------------------------------------------------------------

	const regions = ["North", "East", "South", "West", "Central"];
	const engineers = Array.from({ length: size.engineers }, (_, i) => {
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();
		return {
			id: i + 1,
			name: `${firstName} ${lastName}`,
			email: faker.internet
				.email({ firstName, lastName, provider: "fieldservice.example" })
				.toLowerCase(),
			phone: faker.phone.number({ style: "international" }),
			// Every specialty is covered at least three times.
			specialty: engineerSpecialties[i % engineerSpecialties.length],
			region: faker.helpers.arrayElement(regions),
			hourlyRate: faker.number.int({ min: 55, max: 110 }) * 100,
			// The last two have left.
			active: i < size.engineers - 2,
			hiredAt: faker.date.past({ years: 12, refDate: addDays(now, -30) }),
		};
	});

	// --- Equipment -------------------------------------------------------------------------------

	const manufacturers: Record<EquipmentCategory, string[]> = {
		generator: ["Voltaris", "Genmark", "Powerline Industries"],
		chiller: ["Kryotec", "Arctica", "Coolflow"],
		boiler: ["Thermagen", "Heatwell", "Calora"],
		compressor: ["Pneumax", "Airvantage", "Kompressa"],
		pump: ["Hydrona", "Flowmaster", "Aquadyne"],
		elevator: ["Liftwerk", "Verticor", "Ascenda"],
		air_handler: ["Ventura", "Airmasters", "Climatech"],
	};

	const equipments = customers
		.flatMap((owner) =>
			Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => {
				const category = faker.helpers.arrayElement(equipmentCategories);
				const installedAt = faker.date.between({ from: owner.createdAt, to: addDays(now, -60) });
				return {
					serialNumber: faker.string.alphanumeric({ length: 10, casing: "upper" }),
					model: `${faker.string.alpha({ length: 2, casing: "upper" })}-${faker.number.int({ min: 100, max: 990 })}`,
					manufacturer: faker.helpers.arrayElement(manufacturers[category]),
					category,
					status: "operational" as EquipmentStatus,
					customerId: owner.id,
					installedAt,
					warrantyUntil: addDays(installedAt, faker.helpers.arrayElement([2, 3, 5]) * 365),
				};
			}),
		)
		.map((item, i) => ({ id: i + 1, ...item }));

	// --- Materials -------------------------------------------------------------------------------

	const catalog: [name: string, unit: MaterialUnit, minPrice: number, maxPrice: number][] = [
		["Copper pipe 15mm", "m", 6, 12],
		["Copper pipe 22mm", "m", 9, 18],
		["Pipe insulation 22mm", "m", 2, 5],
		["Ball valve DN25", "pcs", 18, 45],
		["Check valve DN40", "pcs", 40, 95],
		["Pressure gauge 0–10 bar", "pcs", 15, 35],
		["Expansion vessel 25 l", "pcs", 60, 140],
		["Circulation pump cartridge", "pcs", 180, 420],
		["Mechanical seal kit", "pcs", 70, 160],
		["Deep groove bearing 6204", "pcs", 8, 22],
		["Deep groove bearing 6308", "pcs", 25, 60],
		["V-belt SPZ 1250", "pcs", 12, 28],
		["Coupling insert", "pcs", 15, 40],
		["Hydraulic oil ISO 46", "l", 4, 9],
		["Compressor oil", "l", 9, 22],
		["Grease cartridge", "pcs", 6, 14],
		["Refrigerant R32", "kg", 25, 60],
		["Refrigerant R410A", "kg", 30, 75],
		["Filter drier", "pcs", 20, 55],
		["Panel filter G4 592×592", "pcs", 8, 18],
		["Bag filter F7 592×592", "pcs", 25, 55],
		["Contactor 3P 40A", "pcs", 35, 90],
		["Thermal overload relay", "pcs", 30, 70],
		["Circuit breaker C16", "pcs", 9, 25],
		["Power cable 5×2.5mm²", "m", 3, 7],
		["Control cable 12×0.75mm²", "m", 2, 6],
		["Temperature sensor PT1000", "pcs", 25, 65],
		["Pressure transmitter", "pcs", 120, 280],
		["PLC I/O module", "pcs", 220, 520],
		["Frequency drive 7.5 kW", "pcs", 650, 1400],
		["Door operator belt", "pcs", 45, 110],
		["Elevator guide shoe", "pcs", 30, 75],
		["Fuel filter", "pcs", 15, 40],
		["Starter battery 12V 100Ah", "pcs", 140, 260],
		["Coolant concentrate", "l", 5, 12],
		["Burner nozzle", "pcs", 12, 30],
		["Ignition electrode", "pcs", 18, 45],
		["Gasket set", "pcs", 20, 60],
		["Stainless fasteners kit", "pcs", 10, 25],
		["Cable ties (100)", "pcs", 3, 8],
	];

	const materials = catalog.map(([name, unit, min, max], i) => ({
		id: i + 1,
		sku: `MAT-${String(i + 1).padStart(4, "0")}`,
		name,
		unit,
		unitPrice: faker.number.int({ min: min * 100, max: max * 100, multipleOf: 5 }),
		stock:
			unit === "pcs"
				? faker.number.int({ min: 0, max: 250 })
				: faker.number.float({ min: 0, max: 900, fractionDigits: 1 }),
	}));

	// --- Orders ----------------------------------------------------------------------------------

	const describe: Record<OrderType, () => string> = {
		installation: () =>
			`Install and commission new unit${faker.helpers.maybe(() => " incl. control wiring") ?? ""}`,
		maintenance: () =>
			faker.helpers.arrayElement([
				"Scheduled preventive maintenance",
				"Annual service and safety check",
				"Replace filters and wear parts",
				"Lubrication and belt tensioning",
			]),
		repair: () =>
			faker.helpers.arrayElement([
				"Unit trips on high pressure",
				"Abnormal noise and vibration",
				"Leak detected at main seal",
				"Fails to start after power outage",
				"Error code on controller, unit offline",
				"Insufficient output under load",
			]),
		inspection: () =>
			faker.helpers.arrayElement([
				"Statutory periodic inspection",
				"Insurance inspection",
				"Pre-warranty-expiry inspection",
			]),
	};

	const laborRange: Record<OrderType, [number, number]> = {
		installation: [8, 40],
		maintenance: [2, 6],
		repair: [1, 12],
		inspection: [1, 3],
	};

	const linesRange: Record<OrderType, [number, number]> = {
		installation: [3, 8],
		maintenance: [1, 4],
		repair: [1, 4],
		inspection: [0, 1],
	};

	const engineersBySpecialty = Object.groupBy(engineers, (e) => e.specialty);

	function pickEngineer(category: EquipmentCategory | undefined, active: boolean) {
		const pool = (category && engineersBySpecialty[specialtyForCategory[category]]) || engineers;
		const candidates = active ? pool.filter((e) => e.active) : pool;
		return faker.helpers.arrayElement(candidates.length ? candidates : engineers);
	}

	/** Derives a status (and matching dates) from when the order was created. */
	function lifecycle(createdAt: Date): {
		status: OrderStatus;
		scheduledFor: Date | null;
		completedAt: Date | null;
	} {
		const scheduledFor = addDays(createdAt, faker.number.int({ min: 1, max: 30 }));
		if (faker.datatype.boolean(0.05))
			return { status: "cancelled", scheduledFor, completedAt: null };
		if (scheduledFor > now) {
			return faker.datatype.boolean(0.35)
				? { status: "quote", scheduledFor: null, completedAt: null }
				: { status: "scheduled", scheduledFor, completedAt: null };
		}
		if (now.getTime() - scheduledFor.getTime() < 3 * DAY) {
			return { status: "in_progress", scheduledFor, completedAt: null };
		}
		const completedAt = addDays(scheduledFor, faker.number.float({ min: 0.1, max: 3 }));
		const invoiced =
			now.getTime() - completedAt.getTime() > 14 * DAY && faker.datatype.boolean(0.85);
		return { status: invoiced ? "invoiced" : "completed", scheduledFor, completedAt };
	}

	const orders = Array.from({ length: size.orders }, () => {
		const owner = faker.helpers.arrayElement(customers);
		const owned = equipments.filter((e) => e.customerId === owner.id);
		const type = faker.helpers.weightedArrayElement<OrderType>([
			{ value: "maintenance", weight: 5 },
			{ value: "repair", weight: 4 },
			{ value: "inspection", weight: 2 },
			{ value: "installation", weight: 1 },
		]);
		const target =
			type === "installation" && faker.datatype.boolean(0.3)
				? undefined
				: faker.helpers.arrayElement(owned);
		// Weighted towards recent weeks so there's a healthy amount of open work.
		const createdAt = faker.date.between({
			from: addDays(now, faker.datatype.boolean(0.25) ? -40 : -540),
			to: now,
		});
		const { status, scheduledFor, completedAt } = lifecycle(createdAt);
		const priority: OrderPriority =
			type === "repair"
				? faker.helpers.arrayElement(["normal", "high", "high", "urgent"])
				: faker.helpers.arrayElement(["low", "normal", "normal", "normal", "high"]);
		const [minHours, maxHours] = laborRange[type];
		return {
			customerId: owner.id,
			equipmentId: target?.id ?? null,
			engineerId:
				status === "quote"
					? null
					: pickEngineer(target?.category, scheduledFor! > addDays(now, -90)).id,
			type,
			status,
			priority,
			description: describe[type](),
			scheduledFor,
			completedAt,
			laborHours: faker.number.float({ min: minHours, max: maxHours, multipleOf: 0.25 }),
			createdAt,
		};
	})
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
		.map((o, i) => ({
			id: i + 1,
			number: `ORD-${o.createdAt.getFullYear()}-${String(i + 1).padStart(5, "0")}`,
			...o,
		}));

	const orderLines = orders.flatMap((o) => {
		const [min, max] = linesRange[o.type];
		const picked = faker.helpers.arrayElements(materials, faker.number.int({ min, max }));
		// Older orders were priced a little lower than today's list price.
		const ageInYears = (now.getTime() - o.createdAt.getTime()) / (365 * DAY);
		return picked.map((m) => ({
			orderId: o.id,
			materialId: m.id,
			quantity:
				m.unit === "pcs"
					? faker.number.int({ min: 1, max: 6 })
					: faker.number.float({ min: 0.5, max: 25, fractionDigits: 2 }),
			unitPrice: Math.round(m.unitPrice * (1 - 0.04 * ageInYears)),
		}));
	});

	// Equipment with an open repair is out of service (urgent) or needs service.
	for (const o of orders) {
		if (o.type !== "repair" || !o.equipmentId) continue;
		if (!["quote", "scheduled", "in_progress"].includes(o.status)) continue;
		const item = equipments[o.equipmentId - 1];
		if (o.priority === "urgent") item.status = "out_of_service";
		else if (item.status === "operational") item.status = "needs_service";
	}
	for (const item of equipments) {
		if (item.status === "operational" && faker.datatype.boolean(0.04))
			item.status = "decommissioned";
	}

	// --- Service contracts (optional module) -----------------------------------------------------

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
		"Includes the annual statutory inspection.",
		"Parts included up to €2,000 per year.",
		"Out-of-hours call-outs are billed separately.",
		"Site access via the security desk; announce visits 24 hours ahead.",
		"Fee indexed yearly (CPI + 1%).",
		"Covers the main site only; satellite locations on request.",
	];

	const levelsBySegment: Record<(typeof customerSegments)[number], ContractLevel[]> = {
		enterprise: ["premium", "premium", "standard"],
		mid_market: ["standard", "standard", "basic", "premium"],
		small_business: ["basic", "basic", "standard"],
	};

	/** Moves a date by whole years, keeping the day of the month. */
	const addYears = (date: Date, years: number) =>
		new Date(date.getFullYear() + years, date.getMonth(), date.getDate());

	// Mostly larger customers have a contract. Each has a run of consecutive terms (renewals, often
	// upgraded over time): the latest is active or starts soon, unless the customer let it lapse.
	// Only for tenants with the contracts module.
	const contractTerms = (size.contracts ? customers : [])
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
			number: `CTR-${c.createdAt.getFullYear()}-${String(i + 1).padStart(4, "0")}`,
			...c,
		}));

	const contracts = contractTerms.map(({ equipmentIds: _equipmentIds, ...c }) => c);
	const contractCoverage = contractTerms.flatMap((c) =>
		c.equipmentIds.map((equipmentId) => ({
			customerId: c.customerId,
			contractId: c.id,
			equipmentId,
		})),
	);

	// --- Call-outs waiting for a response (service contracts) ----------------------------------

	// Repairs on covered units that aren't scheduled yet, so the module's response times (see
	// `#lib/components/contracts/coverage.ts`) have something to show: one overdue, one at risk
	// (on the slowest contract, so it stays at risk for a while), one on track. Fixed rather than
	// random, and made last, so the rest of the data stays the same.
	const running = contractTerms
		.filter((c) => c.startsOn <= now && now < addDays(c.endsOn, 1))
		.sort((a, b) => a.responseHours - b.responseHours || a.id - b.id);
	const waiting =
		running.length >= 3
			? [
					{
						term: running[0],
						hoursAgo: running[0].responseHours + 2,
						description: "Unit down after a power cut; customer called twice",
					},
					{
						term: running[running.length - 1],
						hoursAgo: running[running.length - 1].responseHours * 0.85,
						description: "Intermittent fault, alarm on the controller",
					},
					{
						term: running[Math.floor(running.length / 2)],
						hoursAgo: 0.5,
						description: "Abnormal noise since this morning",
					},
				]
			: [];
	const callOuts = waiting.map(({ term, hoursAgo, description }, i) => {
		const id = orders.length + i + 1;
		const createdAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
		const unit = equipments[term.equipmentIds[0] - 1];
		unit.status = "needs_service";
		return {
			id,
			number: `ORD-${createdAt.getFullYear()}-${String(id).padStart(5, "0")}`,
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
	const callOutLines = callOuts.map((o) => ({
		orderId: o.id,
		materialId: materials[3].id,
		quantity: 2,
		unitPrice: materials[3].unitPrice,
	}));

	return {
		customers,
		engineers,
		equipments,
		materials,
		orders: [...orders, ...callOuts],
		orderLines: [...orderLines, ...callOutLines],
		contracts,
		contractCoverage,
	};
}

// --- Stock movements -------------------------------------------------------------------------

/**
 * The stock ledger that adds up to each generated material's stock: an opening balance before
 * the first order, consumption by every order line, and a few recent deliveries (no larger than
 * the stock now, so the stock was never below zero). With a faker of its own, so the rest of the
 * data is the same with or without it.
 */
function generateStockMovements(data: ReturnType<typeof generateTenant>, seed: number) {
	const random = new Faker({ locale: [en] });
	random.seed(seed);
	const round = (quantity: number) => Math.round(quantity * 100) / 100;
	const orders = new Map(data.orders.map((o) => [o.id, o]));

	const consumption = data.orderLines.map((line) => {
		const o = orders.get(line.orderId)!;
		return {
			materialId: line.materialId,
			quantity: -line.quantity,
			kind: "consumption" as const,
			orderId: o.id,
			orderNumber: o.number,
			note: null as string | null,
			createdAt: o.createdAt,
		};
	});

	const receipts = random.helpers
		.arrayElements(data.materials, Math.ceil(data.materials.length / 3))
		.filter((m) => m.stock >= 1)
		.map((m) => ({
			materialId: m.id,
			quantity:
				m.unit === "pcs"
					? random.number.int({ min: 1, max: m.stock })
					: random.number.float({ min: 1, max: m.stock, fractionDigits: 1 }),
			kind: "receipt" as const,
			orderId: null,
			orderNumber: null,
			note: `Delivery note ${random.string.numeric(6)}`,
			createdAt: random.date.between({ from: addDays(now, -120), to: addDays(now, -1) }),
		}));

	const opening = data.materials
		.map((m) => {
			const change = [...consumption, ...receipts]
				.filter((movement) => movement.materialId === m.id)
				.reduce((sum, movement) => sum + movement.quantity, 0);
			return {
				materialId: m.id,
				quantity: round(m.stock - change),
				kind: "opening_balance" as const,
				orderId: null,
				orderNumber: null,
				note: null,
				createdAt: addDays(now, -560),
			};
		})
		.filter((movement) => movement.quantity !== 0);

	return [...opening, ...consumption, ...receipts].toSorted(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	);
}

// --- Tenants ---------------------------------------------------------------------------------

/** The demo organizations. North has the service contracts module; South doesn't. */
const tenants = [
	{
		id: "org-north",
		name: "Fieldworks North",
		slug: "north",
		modules: ["contracts"],
		seed: 20261005,
		size: { customers: 60, engineers: 18, orders: 750, contracts: true },
	},
	{
		id: "org-south",
		name: "Fieldworks South",
		slug: "south",
		modules: [],
		seed: 20261006,
		size: { customers: 30, engineers: 10, orders: 320, contracts: false },
	},
];

// --- Write -----------------------------------------------------------------------------------

/** Rows per table, for the summary. */
const totals: Record<string, number> = {};
const count = (table: string, rows: unknown[]) =>
	(totals[table] = (totals[table] ?? 0) + rows.length);

await db.transaction(async (tx) => {
	for (const table of [
		schema.contractEquipment,
		schema.contract,
		schema.stockMovement,
		orderLine,
		order,
		equipment,
		material,
		engineer,
		customer,
		schema.organizationModule,
		schema.invitation,
		schema.member,
		schema.organization,
	]) {
		await tx.delete(table);
	}

	// Ids are global, so each tenant's ids continue where the previous tenant's ended.
	const offset = { customer: 0, engineer: 0, equipment: 0, material: 0, order: 0, contract: 0 };
	for (const tenant of tenants) {
		await tx.insert(schema.organization).values({
			id: tenant.id,
			name: tenant.name,
			slug: tenant.slug,
			createdAt: addDays(now, -800),
		});
		if (tenant.modules.length) {
			await tx
				.insert(schema.organizationModule)
				.values(tenant.modules.map((moduleId) => ({ organizationId: tenant.id, moduleId })));
		}

		faker.seed(tenant.seed);
		const data = generateTenant(tenant.size);
		const organizationId = tenant.id;
		const o = { ...offset };
		const rows = {
			customers: data.customers.map((c) => ({ ...c, organizationId, id: c.id + o.customer })),
			engineers: data.engineers.map((e) => ({ ...e, organizationId, id: e.id + o.engineer })),
			equipments: data.equipments.map((e) => ({
				...e,
				organizationId,
				id: e.id + o.equipment,
				customerId: e.customerId + o.customer,
			})),
			materials: data.materials.map((m) => ({ ...m, organizationId, id: m.id + o.material })),
			orders: data.orders.map((r) => ({
				...r,
				organizationId,
				id: r.id + o.order,
				customerId: r.customerId + o.customer,
				equipmentId: r.equipmentId && r.equipmentId + o.equipment,
				engineerId: r.engineerId && r.engineerId + o.engineer,
			})),
			orderLines: data.orderLines.map((l) => ({
				...l,
				organizationId,
				orderId: l.orderId + o.order,
				materialId: l.materialId + o.material,
			})),
			contracts: data.contracts.map((c) => ({
				...c,
				organizationId,
				id: c.id + o.contract,
				customerId: c.customerId + o.customer,
			})),
			coverage: data.contractCoverage.map((c) => ({
				customerId: c.customerId + o.customer,
				contractId: c.contractId + o.contract,
				equipmentId: c.equipmentId + o.equipment,
			})),
			stockMovements: generateStockMovements(data, tenant.seed).map((m) => ({
				...m,
				organizationId,
				materialId: m.materialId + o.material,
				orderId: m.orderId && m.orderId + o.order,
			})),
		};

		await insertAll(rows.customers, (chunk) => tx.insert(customer).values(chunk));
		await insertAll(rows.engineers, (chunk) => tx.insert(engineer).values(chunk));
		await insertAll(rows.equipments, (chunk) => tx.insert(equipment).values(chunk));
		await insertAll(rows.materials, (chunk) => tx.insert(material).values(chunk));
		await insertAll(rows.orders, (chunk) => tx.insert(order).values(chunk));
		await insertAll(rows.orderLines, (chunk) => tx.insert(orderLine).values(chunk));
		await insertAll(rows.contracts, (chunk) => tx.insert(schema.contract).values(chunk));
		await insertAll(rows.coverage, (chunk) => tx.insert(schema.contractEquipment).values(chunk));
		await insertAll(rows.stockMovements, (chunk) => tx.insert(schema.stockMovement).values(chunk));

		offset.customer += rows.customers.length;
		offset.engineer += rows.engineers.length;
		offset.equipment += rows.equipments.length;
		offset.material += rows.materials.length;
		offset.order += rows.orders.length;
		offset.contract += rows.contracts.length;
		for (const [table, list] of Object.entries(rows)) count(table, list);
	}
});

// Demo users are recreated (with their password account, as better-auth's email sign-up would),
// so a changed name or password always takes effect. Their sessions go with them.
await db.transaction(async (tx) => {
	const existing = await tx
		.select({ id: user.id })
		.from(user)
		.where(
			inArray(
				user.email,
				demoUsers.map((u) => u.email),
			),
		);
	const ids = existing.map((u) => u.id);
	await tx.delete(session).where(inArray(session.userId, ids));
	await tx.delete(account).where(inArray(account.userId, ids));
	await tx.delete(user).where(inArray(user.id, ids));

	for (const { memberships, ...demo } of demoUsers) {
		const id = crypto.randomUUID();
		await tx.insert(user).values({ id, ...demo, emailVerified: true });
		await tx.insert(schema.member).values(
			// In order: the first is where they start when signing in.
			memberships.map((membership, i) => ({
				id: crypto.randomUUID(),
				userId: id,
				...membership,
				createdAt: new Date(now.getTime() - (memberships.length - i) * 1000),
			})),
		);
		await tx.insert(account).values({
			id: crypto.randomUUID(),
			accountId: id,
			providerId: "credential",
			userId: id,
			password: await hashPassword(DEMO_PASSWORD),
		});
	}
});

console.log(
	`Seeded ${tenants.length} organizations (${tenants.map((t) => t.name).join(", ")}) with ` +
		Object.entries(totals)
			.map(([table, n]) => `${n} ${table}`)
			.join(", ") +
		`, and ${demoUsers.length} demo users.`,
);
