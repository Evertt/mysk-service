/**
 * Fills the database with fake, internally consistent data: orders only reference equipment
 * owned by the same customer, get an engineer whose specialty fits the equipment, and have a
 * status that matches their dates. Equipment status reflects the open repair orders on it.
 *
 * Also (re)creates the demo users you can sign in with, see "Demo login" in README.md.
 *
 * Run with `pnpm db:seed` (after `pnpm db:push`). Replaces all existing business data.
 */
import { faker } from "@faker-js/faker";
import { createClient } from "@libsql/client";
import { hashPassword } from "better-auth/crypto";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import {
	customerSegments,
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

import * as schema from "./schema.ts";

const { account, customer, engineer, equipment, material, order, orderLine, session, user } =
	schema;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const db = drizzle(createClient({ url: DATABASE_URL }), { schema });

faker.seed(20261005);
const now = new Date();
const DAY = 24 * 60 * 60 * 1000;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

/** Inserts in chunks to stay below SQLite's bound-parameter limit. */
async function insertAll<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
	for (let i = 0; i < rows.length; i += 100) await insert(rows.slice(i, i + 100));
}

// --- Customers -------------------------------------------------------------------------------

const customers = Array.from({ length: 60 }, (_, i) => {
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
const engineers = Array.from({ length: 18 }, (_, i) => {
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
		active: i < 16,
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
	stock: faker.number.int({ min: 0, max: unit === "pcs" ? 250 : 900 }),
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
	if (faker.datatype.boolean(0.05)) return { status: "cancelled", scheduledFor, completedAt: null };
	if (scheduledFor > now) {
		return faker.datatype.boolean(0.35)
			? { status: "quote", scheduledFor: null, completedAt: null }
			: { status: "scheduled", scheduledFor, completedAt: null };
	}
	if (now.getTime() - scheduledFor.getTime() < 3 * DAY) {
		return { status: "in_progress", scheduledFor, completedAt: null };
	}
	const completedAt = addDays(scheduledFor, faker.number.float({ min: 0.1, max: 3 }));
	const invoiced = now.getTime() - completedAt.getTime() > 14 * DAY && faker.datatype.boolean(0.85);
	return { status: invoiced ? "invoiced" : "completed", scheduledFor, completedAt };
}

const orders = Array.from({ length: 750 }, () => {
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
		quantity: faker.number.int({ min: 1, max: m.unit === "pcs" ? 6 : 25 }),
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
	if (item.status === "operational" && faker.datatype.boolean(0.04)) item.status = "decommissioned";
}

// --- Demo users ------------------------------------------------------------------------------

/** The password of every demo user. Local demo data only, documented in README.md. */
const DEMO_PASSWORD = "fieldworks-demo";

const demoUsers = [
	{ name: "Avery Admin", email: "admin@fieldworks.example" },
	{ name: "Pat Planner", email: "planner@fieldworks.example" },
];

// --- Write -----------------------------------------------------------------------------------

await db.transaction(async (tx) => {
	for (const table of [orderLine, order, equipment, material, engineer, customer]) {
		await tx.delete(table);
	}
	await insertAll(customers, (rows) => tx.insert(customer).values(rows));
	await insertAll(engineers, (rows) => tx.insert(engineer).values(rows));
	await insertAll(equipments, (rows) => tx.insert(equipment).values(rows));
	await insertAll(materials, (rows) => tx.insert(material).values(rows));
	await insertAll(orders, (rows) => tx.insert(order).values(rows));
	await insertAll(orderLines, (rows) => tx.insert(orderLine).values(rows));
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

	for (const demo of demoUsers) {
		const id = crypto.randomUUID();
		await tx.insert(user).values({ id, ...demo, emailVerified: true });
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
	`Seeded ${customers.length} customers, ${engineers.length} engineers, ${equipments.length} equipment, ` +
		`${materials.length} materials, ${orders.length} orders, ${orderLines.length} order lines and ${demoUsers.length} demo users.`,
);
