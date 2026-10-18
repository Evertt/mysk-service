/**
 * SHLTR's orders over the past year and the coming weeks, planned the way its office plans them:
 * on working days, one to three jobs per engineer a day (the schedule's capacity), at times that
 * suit the site's time slot, planned work on the site's preferred day where it has one, and
 * engineers whose specialty fits the unit. The mix of types is SHLTR's (`docs/plans/shltr-domain.md`,
 * §2.10): breakdowns half of it, one in thirteen of all orders an urgent one ("storing prio"),
 * repairs a quarter. Days ahead hold planned work (no breakdowns beyond tomorrow), fewer the further
 * ahead, as a planning fills up. Some orders are fixed: the mockup's planning (as this week's and
 * the next weeks'), the open orders its Apparatuur page counts on Riedel's units, an inspection
 * that runs out within the month, whatever the day, and Lev's inspection of Weggemans' docks.
 */
import type { Faker } from "@faker-js/faker";

import type { EngineerSpecialty, OrderPriority, OrderStatus, OrderType } from "#lib/models.ts";
import { formatCode } from "#lib/numbering.ts";

import { specialtyOf } from "../categories.ts";
import { DAY, now } from "../clock.ts";
import type { ShltrCustomer, ShltrSite } from "./customers.ts";
import { LEFT_DAYS_AGO } from "./engineers.ts";
import type { generateShltrEngineers } from "./engineers.ts";
import type { ShltrUnit } from "./equipment.ts";
import { describeOrder } from "./texts.ts";

type Engineer = ReturnType<typeof generateShltrEngineers>[number];

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** Today's midnight, and another day's. */
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dayAt = (offset: number) =>
	new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
const isWorkingDay = (offset: number) => ![0, 6].includes(dayAt(offset).getDay());
/** `HH:MM` as minutes, and back. */
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const atMinutes = (offset: number, minutes: number) =>
	new Date(dayAt(offset).getTime() + minutes * MINUTE);

/** The `n`th working day from today (today, or the last one before, for 0). */
function workingDay(n: number) {
	let offset = 0;
	if (n === 0) {
		while (!isWorkingDay(offset)) offset--;
		return offset;
	}
	for (let left = Math.abs(n); left > 0;) {
		offset += Math.sign(n);
		if (isWorkingDay(offset)) left--;
	}
	return offset;
}

/** The working day `offset` days from today, or the last one before it. */
function onWorkingDay(offset: number) {
	while (!isWorkingDay(offset)) offset--;
	return offset;
}

/** This week's Monday, as an offset from today, plus `weeks` and `weekday` (0 is Monday). */
const inWeek = (weeks: number, weekday: number) =>
	-((dayAt(0).getDay() + 6) % 7) + weeks * 7 + weekday;

/**
 * SHLTR's mix: the customer card's percentages (×100), with "storing prio" as an urgent breakdown.
 * `planned` are the ones the office plans ahead.
 */
const mix: { value: OrderType | "urgent"; weight: number }[] = [
	{ value: "breakdown", weight: 4938 },
	{ value: "urgent", weight: 750 },
	{ value: "repair", weight: 2500 },
	{ value: "installation", weight: 625 },
	{ value: "maintenance", weight: 500 },
	{ value: "project", weight: 312 },
	{ value: "survey", weight: 155 },
	{ value: "inspection", weight: 105 },
	{ value: "damage", weight: 85 },
	{ value: "other", weight: 30 },
];
const planned = mix.filter(({ value }) => !["breakdown", "urgent"].includes(value));
/** Planned on the site's preferred day, if it has one. */
const onPreferredDay: OrderType[] = [
	"maintenance",
	"inspection",
	"installation",
	"project",
	"survey",
	"other",
];

const laborRange: Record<OrderType, [number, number]> = {
	breakdown: [1, 4],
	repair: [1, 6],
	maintenance: [1, 4],
	inspection: [0.5, 2],
	installation: [6, 24],
	survey: [1, 2],
	damage: [2, 8],
	project: [16, 60],
	other: [1, 3],
};

/** How long before the visit an order comes in, in hours. */
const leadHours: Record<OrderType | "urgent", [number, number]> = {
	urgent: [1, 4],
	breakdown: [2, 48],
	repair: [2 * 24, 14 * 24],
	damage: [24, 5 * 24],
	survey: [3 * 24, 10 * 24],
	other: [2 * 24, 10 * 24],
	maintenance: [14 * 24, 45 * 24],
	inspection: [14 * 24, 45 * 24],
	installation: [21 * 24, 60 * 24],
	project: [30 * 24, 90 * 24],
};

/** Units that break down more often weigh more for a breakdown or repair: doors that run all day. */
const wear: Record<ShltrUnit["category"], number> = {
	sectional_door: 3,
	high_speed_door: 3,
	dock_leveller: 2.5,
	automatic_door: 2,
	salvo_dock: 1.5,
	fire_door: 1.2,
	hvac: 1.2,
	aerial_platform: 0.8,
	stairs: 0.4,
	other: 0.2,
};

/** An engineer's jobs on a day go in these windows, in order (minutes after midnight). */
const windows = [
	[7 * 60 + 30, 9 * 60],
	[10 * 60, 12 * 60],
	[12 * 60 + 30, 14 * 60 + 30],
	[14 * 60 + 30, 16 * 60],
	[16 * 60, 16 * 60 + 30],
];

/** Jobs per engineer per day before the schedule shows the day as full. */
const CAPACITY = 3;

/**
 * The days and times `linkDemoEngineer` (`../users.ts`) plans the demo engineer's own work at, by
 * calendar day from today: kept free for it.
 */
const demoEngineerTimes: Record<number, string[]> = {
	0: ["08:00", "13:30"],
	1: ["09:00"],
	3: ["10:30"],
};

/** An order the mockup names. */
interface FixedOrder {
	customer: string;
	/** The unit's name; else the customer's first unit of `category`, else none. */
	unit?: string;
	category?: ShltrUnit["category"];
	/**
	 * After the unit, the customer's other units of these categories at its site: the order is about
	 * them all (the yearly inspection of every door), in the customer's order of them.
	 */
	together?: ShltrUnit["category"][];
	type: OrderType;
	priority: OrderPriority;
	description: string;
	/** Days from today, and the time. */
	day: number;
	time: string;
	laborHours: number;
	/** Not planned yet ("Nieuw"): created `day` days from today, at `time`. */
	quote?: true;
	/** Under way, whatever the time. */
	started?: true;
	/** The unit's last inspection: the generated orders inspect it no more after it. */
	last?: true;
	/** The engineer's name, whoever else would be free. */
	engineer?: string;
}

const fixedOrders = (): FixedOrder[] => [
	// The mockup's planning, which has its "today" on a Thursday: this week's and the next.
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur D-09",
		type: "breakdown",
		priority: "high",
		description: "Sectionaaldeur opent niet, motor bromt",
		day: inWeek(0, 0),
		time: "08:30",
		laborHours: 1.5,
	},
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur D-11",
		type: "repair",
		priority: "normal",
		description: "Kabelset vervangen",
		day: inWeek(0, 1),
		time: "09:00",
		laborHours: 2.5,
	},
	{
		customer: "Riedel B.V.",
		unit: "Leveller L-03",
		type: "repair",
		priority: "normal",
		description: "Lipscharnier vervangen, lip klapt niet volledig uit",
		day: inWeek(0, 1),
		time: "13:30",
		laborHours: 3,
	},
	{
		customer: "Vermeer Logistiek",
		category: "sectional_door",
		type: "inspection",
		priority: "normal",
		description: "Jaarlijkse keuring sectionaaldeuren (NEN-EN 12604/12453)",
		day: inWeek(0, 3),
		time: "10:00",
		laborHours: 4,
	},
	{
		customer: "Riedel B.V.",
		unit: "Snelroldeur grondstoffen GS-02",
		type: "repair",
		priority: "normal",
		description: "Doek uit de geleiding, geleiders vervangen",
		day: inWeek(0, 4),
		time: "11:15",
		laborHours: 2,
	},
	{
		customer: "Van Dijk Koeltechniek",
		category: "hvac",
		type: "maintenance",
		priority: "normal",
		description: "Onderhoud koelinstallatie en airco, filters reinigen",
		day: inWeek(1, 2),
		time: "08:00",
		laborHours: 3,
	},
	{
		customer: "Riedel B.V.",
		unit: "SEC-Sectionaaldeur magazijn laaddok LD-04",
		// The expedition's other sectional doors, but those the Apparatuur page counts.
		together: ["sectional_door"],
		type: "maintenance",
		priority: "normal",
		description: "Halfjaarlijks onderhoud sectionaaldeuren expeditie",
		day: inWeek(2, 1),
		time: "14:00",
		laborHours: 3,
	},
	// Orders about many units: the yearly inspection of all of Riedel's doors (done), Weggemans'
	// docks (planned) and the half-yearly maintenance of its Salvo docks (done).
	{
		customer: "Riedel B.V.",
		unit: "Automatische deur kantine",
		together: ["automatic_door", "fire_door", "high_speed_door", "sectional_door"],
		type: "inspection",
		priority: "normal",
		description: "Jaarlijkse keuring alle deuren (NEN-EN 12604/12453, NEN-EN 16034)",
		day: workingDay(-60),
		time: "07:30",
		laborHours: 8,
	},
	{
		customer: "Weggemans Logistiek",
		unit: "Sectionaaldeur D-17",
		together: ["sectional_door", "dock_leveller"],
		type: "inspection",
		priority: "normal",
		description: "Jaarlijkse keuring docks: sectionaaldeuren en levellers",
		day: inWeek(1, 3),
		time: "07:30",
		laborHours: 6,
		// Whatever the day, Lev (the demo engineer) has a planned inspection of several units, each
		// with its checklist, to fill in on the portal.
		engineer: "Lev Hoekstra",
	},
	{
		customer: "Weggemans Logistiek",
		unit: "Salvo dock 05",
		together: ["salvo_dock"],
		type: "maintenance",
		priority: "normal",
		description: "Halfjaarlijks onderhoud Salvo docks",
		day: workingDay(-30),
		time: "08:00",
		laborHours: 3,
	},
	// A yearly inspection of eleven and a half months ago, the unit's last: whatever the day, the
	// demo has an inspection that runs out within the month ("expiring").
	{
		customer: "Vermeer Logistiek",
		category: "dock_leveller",
		type: "inspection",
		priority: "normal",
		description: "Jaarlijkse keuring dockleveller",
		day: onWorkingDay(-350),
		time: "09:00",
		laborHours: 1,
		last: true,
	},
	{
		customer: "Vermeer Logistiek",
		category: "sectional_door",
		type: "breakdown",
		priority: "high",
		description: "Storing komt terug bij koude start; bezoek afgesproken met de leverancier",
		day: inWeek(3, 1),
		time: "07:45",
		laborHours: 2,
	},
	// The open orders the Apparatuur page counts on Riedel's units.
	{
		customer: "Riedel B.V.",
		unit: "algeheel onderhoud",
		type: "maintenance",
		priority: "normal",
		description: "Algeheel onderhoud deuren, trappen en hoogwerkers",
		day: workingDay(6),
		time: "08:00",
		laborHours: 6,
	},
	{
		customer: "Riedel B.V.",
		unit: "BRD Branddeur 1e verd. TD tbv wasgoed TDTE-13",
		type: "repair",
		priority: "normal",
		description: "Deurdranger lekt olie, vervangen",
		day: workingDay(2),
		time: "10:00",
		laborHours: 1.5,
	},
	{
		customer: "Riedel B.V.",
		unit: "BRD-Branddeur Aromakluis achterzijde ING-19",
		type: "repair",
		priority: "normal",
		description: "Vrijloopdranger afstellen; deur valt niet in het slot",
		day: workingDay(2),
		time: "11:30",
		laborHours: 1,
	},
	{
		customer: "Riedel B.V.",
		unit: "BRD-Branddeur Aromakluis voorzijde ING-16",
		type: "repair",
		priority: "normal",
		description: "Kleefmagneet vervangen; laat los bij de brandmeldertest",
		day: workingDay(4),
		time: "09:00",
		laborHours: 1.5,
	},
	...[
		"BRD Branddeur 1e verd. TD tbv wasgoed TDTE-13",
		"BRD-Branddeur Aromakluis achterzijde ING-19",
		"BRD-Branddeur Aromakluis voorzijde ING-16",
	].map((unit, i): FixedOrder => ({
		customer: "Riedel B.V.",
		unit,
		type: "inspection",
		priority: "normal",
		description: "Jaarlijkse inspectie branddeur",
		day: workingDay(7),
		time: ["13:00", "13:45", "14:30"][i],
		laborHours: 0.75,
	})),
	{
		customer: "Riedel B.V.",
		unit: "BRD-Brandwerend deur Amoniak ruimte TDTE-01",
		type: "breakdown",
		priority: "urgent",
		description: "Brandwerende deur sluit niet zelfstandig, deurdranger gebroken",
		// Under way since this morning, or the last working day's if the day hasn't started.
		day: workingDay(isWorkingDay(0) && now.getHours() >= 8 ? 0 : -1),
		time: "07:30",
		laborHours: 3,
		started: true,
	},
	{
		customer: "Riedel B.V.",
		unit: "BRD-Brandwerend deur Amoniak ruimte TDTE-01",
		type: "repair",
		priority: "high",
		description: "Deurblad en scharnieren herstellen, sluitnaad afstellen",
		day: -1,
		time: "16:10",
		laborHours: 4,
		quote: true,
	},
	{
		customer: "Riedel B.V.",
		unit: "BRD-Brandwerend deur Amoniak ruimte TDTE-01",
		type: "survey",
		priority: "normal",
		description: "Opname vervanging brandwerende deur TDTE-01",
		day: workingDay(3),
		time: "14:00",
		laborHours: 1,
	},
	{
		customer: "Riedel B.V.",
		unit: "Sectionaaldeur laaddok 08",
		type: "breakdown",
		priority: "high",
		description: "Deur blijft halverwege hangen, veerbreuk vastgesteld",
		day: workingDay(1),
		time: "07:30",
		laborHours: 2,
	},
];

/** An order before it has its engineer, time and status. */
interface Draft {
	customer: ShltrCustomer;
	/** The units it's about, in their order: none, mostly one. */
	units: ShltrUnit[];
	site: ShltrSite;
	type: OrderType;
	urgent: boolean;
	priority: OrderPriority;
	description: string;
	day: number;
	/** Fixed by the mockup. */
	time?: string;
	laborHours: number;
	quote: boolean;
	started: boolean;
	fixed: boolean;
	/** The engineer's name, if fixed. */
	engineer?: string;
}

/** One of SHLTR's orders, like `generateOrders`' (oldest first, ids from 1). */
export function generateShltrOrders(
	faker: Faker,
	{
		customers,
		sites,
		units,
		engineers,
	}: {
		customers: ShltrCustomer[];
		sites: ShltrSite[];
		units: ShltrUnit[];
		engineers: Engineer[];
	},
) {
	const unitsOf = Map.groupBy(units, (unit) => unit.customerId);
	const siteById = new Map(sites.map((site) => [site.id, site]));
	const firstSite = new Map(sites.toReversed().map((site) => [site.customerId, site]));
	const shares = customers.map((customer) => ({
		value: customer,
		weight: customer.share ?? 1 + Math.min(30, unitsOf.get(customer.id)?.length ?? 0) / 10,
	}));
	const labor = (type: OrderType) => {
		const [min, max] = laborRange[type];
		return faker.number.float({ min, max, multipleOf: 0.25 });
	};

	/** The units with open work, which get no more: open orders are a unit's next visit. */
	const busy = new Set<number>();
	/** Recent enough to be open still. */
	const recent = (day: number) => day > -10;
	/** The day of a unit's last inspection (`FixedOrder.last`), after which it gets none. */
	const lastInspected = new Map<number, number>();
	/** Whether an order of `type` on `day` may be about `unit`, as far as its inspections go. */
	const inspectable = (unit: ShltrUnit, type: OrderType, day: number) =>
		type !== "inspection" || !((lastInspected.get(unit.id) ?? day) < day);

	/**
	 * A unit of the customer the order is about, `null` for work on none (a new installation, a
	 * survey of the site), `undefined` if the customer has no unit for it (all have work already).
	 */
	function pickUnit(customer: ShltrCustomer, type: OrderType, day: number) {
		const date = dayAt(day);
		const owned = (unitsOf.get(customer.id) ?? []).filter(
			// The units the Apparatuur page counts the open orders of get none but theirs.
			(unit) =>
				!(recent(day) && (unit.counted || busy.has(unit.id))) &&
				unit.category !== "other" &&
				inspectable(unit, type, day),
		);
		if (type === "installation") {
			const fresh = owned.filter(
				(unit) => Math.abs(unit.installedAt.getTime() - date.getTime()) < 15 * DAY,
			);
			return fresh.length && faker.datatype.boolean(0.7) ? faker.helpers.arrayElement(fresh) : null;
		}
		if (["project", "survey", "other"].includes(type) && faker.datatype.boolean(0.5)) return null;
		const installed = owned.filter(
			(unit) => unit.installedAt.getTime() < date.getTime() - 95 * DAY,
		);
		if (!installed.length) return undefined;
		const corrective = ["breakdown", "repair", "damage"].includes(type);
		return faker.helpers.weightedArrayElement(
			installed.map((unit) => ({ value: unit, weight: corrective ? wear[unit.category] : 1 })),
		);
	}

	/** The site an order is at: its unit's, else the customer's first. */
	const siteOf = (customer: ShltrCustomer, unit: ShltrUnit | null) =>
		unit ? siteById.get(unit.siteId)! : firstSite.get(customer.id)!;

	/**
	 * `unit` and, after it, the customer's other units of `categories` at its site that are installed
	 * by `day` and free for it (as `pickUnit` has them), for an order of `type` about them all;
	 * marks them busy if it's recent.
	 */
	function together(
		unit: ShltrUnit,
		categories: readonly ShltrUnit["category"][],
		type: OrderType,
		day: number,
	) {
		const date = dayAt(day);
		const units = [
			unit,
			...(unitsOf.get(unit.customerId) ?? []).filter(
				(other) =>
					other.id !== unit.id &&
					other.siteId === unit.siteId &&
					categories.includes(other.category) &&
					other.installedAt.getTime() < date.getTime() &&
					!(recent(day) && (other.counted || busy.has(other.id))) &&
					inspectable(other, type, day),
			),
		];
		if (recent(day)) for (const other of units) busy.add(other.id);
		return units;
	}

	/** Customers whose planned inspections and maintenance take all the units of a kind at once. */
	const byTheSite = new Set(["Riedel B.V.", "Weggemans Logistiek"]);
	const plannedTogether: OrderType[] = ["inspection", "maintenance"];

	// --- Drafts: the fixed ones, and per working day as many as the engineers take ---------
	const drafts: Draft[] = fixedOrders().map((fixed) => {
		const customer = customers.find((c) => c.name === fixed.customer)!;
		const own = unitsOf.get(customer.id) ?? [];
		const unit =
			own.find((u) => (fixed.unit ? u.name === fixed.unit : u.category === fixed.category)) ?? null;
		if (unit && recent(fixed.day)) busy.add(unit.id);
		if (unit && fixed.last) lastInspected.set(unit.id, fixed.day);
		return {
			customer,
			units: unit ? together(unit, fixed.together ?? [], fixed.type, fixed.day) : [],
			site: siteOf(customer, unit),
			type: fixed.type,
			urgent: fixed.priority === "urgent",
			priority: fixed.priority,
			description: fixed.description,
			day: fixed.day,
			time: fixed.time,
			laborHours: fixed.laborHours,
			quote: fixed.quote ?? false,
			started: fixed.started ?? false,
			fixed: true,
			engineer: fixed.engineer,
		};
	});

	const activeOn = (engineer: Engineer, day: number) =>
		engineer.active ? true : day < -LEFT_DAYS_AGO;
	let ahead = 0;
	for (let day = -365; day <= 35; day++) {
		if (!isWorkingDay(day)) continue;
		if (day > 0) ahead++;
		const crew = engineers.filter((engineer) => activeOn(engineer, day)).length;
		const rate = day <= 0 ? 1.05 : ahead <= 10 ? 1.6 : ahead <= 20 ? 0.9 : 0.4;
		const count = Math.round(crew * rate * faker.number.float({ min: 0.75, max: 1.25 }));
		for (let i = 0; i < count; i++) {
			// Ahead, only what's been called in already: tomorrow's few breakdowns, then planned work.
			const options =
				day <= 0
					? mix
					: ahead <= 1
						? [...planned, { value: "breakdown" as const, weight: 1200 }]
						: planned;
			const drawn = faker.helpers.weightedArrayElement(options);
			const type = drawn === "urgent" ? "breakdown" : drawn;
			// A customer with a unit for it, else another customer.
			let customer = faker.helpers.weightedArrayElement(shares);
			let picked = pickUnit(customer, type, day);
			for (let tries = 0; picked === undefined && tries < 5; tries++) {
				customer = faker.helpers.weightedArrayElement(shares);
				picked = pickUnit(customer, type, day);
			}
			const unit = picked ?? null;
			if (unit && recent(day)) busy.add(unit.id);
			// Riedel's and Weggemans' planned work takes the site's units of the kind together.
			const units = !unit
				? []
				: byTheSite.has(customer.name) && plannedTogether.includes(type)
					? together(unit, [unit.category], type, day)
					: [unit];
			const site = siteOf(customer, unit);
			let planOn = day;
			// Planned work goes on the site's preferred day, mostly: that day of the same week.
			if (site.preferredDay && onPreferredDay.includes(type) && faker.datatype.boolean(0.75)) {
				const preferred =
					["monday", "tuesday", "wednesday", "thursday", "friday"].indexOf(site.preferredDay) + 1;
				const moved = day + preferred - dayAt(day).getDay();
				if (moved > -365 && moved <= 35 && moved > 0 === day > 0) planOn = moved;
			}
			drafts.push({
				customer,
				units,
				site,
				type,
				urgent: drawn === "urgent",
				priority:
					drawn === "urgent"
						? "urgent"
						: type === "breakdown"
							? faker.helpers.weightedArrayElement<OrderPriority>([
									{ value: "normal", weight: 45 },
									{ value: "high", weight: 55 },
								])
							: type === "repair" || type === "damage"
								? faker.helpers.arrayElement<OrderPriority>(["normal", "normal", "high"])
								: faker.helpers.arrayElement<OrderPriority>(["low", "normal", "normal", "normal"]),
				description: describeOrder(faker, type, unit?.category),
				day: planOn,
				laborHours: labor(type),
				// Some planned work further ahead isn't planned yet: waiting for the customer's go.
				quote: ahead >= 5 && faker.datatype.boolean(0.22),
				started: false,
				fixed: false,
			});
		}
	}

	// --- Engineers and times, day by day -----------------------------------------------------
	/** What each engineer has on a day: the minutes their jobs start at. */
	const taken = new Map<string, number[]>();
	const takenOn = (engineer: Engineer, day: number) => {
		const key = `${engineer.id}/${day}`;
		if (!taken.has(key)) {
			const reserved = engineer.id === engineers[0].id ? (demoEngineerTimes[day] ?? []) : [];
			taken.set(key, reserved.map(minutesOf));
		}
		return taken.get(key)!;
	};
	const bySpecialty = Map.groupBy(engineers, (engineer) => engineer.specialty);

	function pickEngineer(specialty: EngineerSpecialty, day: number) {
		const crew = engineers.filter((engineer) => activeOn(engineer, day));
		const own = (bySpecialty.get(specialty) ?? []).filter((engineer) => activeOn(engineer, day));
		const load = (engineer: Engineer) => takenOn(engineer, day).length;
		const leastBusy = (pool: Engineer[]) => {
			const fewest = Math.min(...pool.map(load));
			return faker.helpers.arrayElement(pool.filter((engineer) => load(engineer) === fewest));
		};
		for (const pool of [
			own.filter((engineer) => load(engineer) < CAPACITY),
			own.filter((engineer) => load(engineer) <= CAPACITY),
			crew.filter((engineer) => load(engineer) < CAPACITY),
		]) {
			if (pool.length) return leastBusy(pool);
		}
		return leastBusy(own.length ? own : crew);
	}

	/** A start time in a window of the engineer's day that's free and suits the site. */
	function pickTime(jobs: number[], site: ShltrSite, urgent: boolean) {
		const [open, close] =
			site.slotStart && site.slotEnd
				? [minutesOf(site.slotStart), minutesOf(site.slotEnd) - 60]
				: [7 * 60, 16 * 60 + 30];
		const quarter = (from: number, to: number) =>
			faker.number.int({
				min: Math.ceil(from / 15),
				max: Math.max(Math.ceil(from / 15), Math.floor(to / 15)),
			}) * 15;
		if (urgent) return quarter(Math.max(open, 8 * 60), Math.min(close, 15 * 60));
		const free = (time: number) => jobs.every((other) => Math.abs(other - time) >= 90);
		// The day's first job mostly first thing, now and then later in the morning.
		const start = jobs.length + (faker.datatype.boolean(0.3) ? 1 : 0);
		for (const [from, to] of windows.slice(Math.min(start, windows.length - 1))) {
			const lo = Math.max(from, open);
			const hi = Math.min(to, close);
			if (lo > hi) continue;
			const time = quarter(lo, hi);
			if (free(time)) return time;
		}
		for (let time = Math.ceil(open / 15) * 15; time <= close; time += 15) {
			if (free(time)) return time;
		}
		return quarter(open, close);
	}

	const placed = drafts
		.toSorted((a, b) => a.day - b.day || Number(b.fixed) - Number(a.fixed))
		.map((draft) => {
			if (draft.quote) {
				// Came in over the last ten days.
				const createdAt = draft.time
					? atMinutes(draft.day, minutesOf(draft.time))
					: new Date(now.getTime() - faker.number.int({ min: 1, max: 240 }) * HOUR);
				return { draft, engineer: null, scheduledFor: null, createdAt };
			}
			const [first] = draft.units;
			const specialty = first ? specialtyOf(first.category) : "mechanical";
			// Picked also for a fixed engineer, so the rest of the demo draws as it did without one.
			const picked = pickEngineer(specialty, draft.day);
			const engineer = engineers.find((e) => e.name === draft.engineer) ?? picked;
			const jobs = takenOn(engineer, draft.day);
			const minutes = draft.time ? minutesOf(draft.time) : pickTime(jobs, draft.site, draft.urgent);
			jobs.push(minutes);
			const scheduledFor = atMinutes(draft.day, minutes);
			const [min, max] = leadHours[draft.urgent ? "urgent" : draft.type];
			const lead = faker.number.float({ min, max }) * HOUR;
			// Not after now, and not before the customer joined.
			const createdAt = new Date(
				Math.max(
					Math.min(
						scheduledFor.getTime() - lead,
						now.getTime() - faker.number.int({ min: 5, max: 120 }) * MINUTE,
					),
					draft.customer.createdAt.getTime() + DAY,
				),
			);
			return { draft, engineer, scheduledFor, createdAt };
		});

	// --- Status, from the dates ----------------------------------------------------------------
	const orders = placed.map(({ draft, engineer, scheduledFor, createdAt }) => {
		let status: OrderStatus = "quote";
		let completedAt: Date | null = null;
		if (scheduledFor) {
			const hours = draft.laborHours;
			const end = new Date(
				scheduledFor.getTime() +
					(hours <= 8 ? hours * HOUR : (Math.ceil(hours / 8) * 24 - 16) * HOUR),
			);
			if (draft.started) status = "in_progress";
			else if (scheduledFor > now) status = "scheduled";
			else if (!draft.fixed && faker.datatype.boolean(0.035)) status = "cancelled";
			else if (end > now) status = "in_progress";
			else {
				completedAt = new Date(end.getTime() + faker.number.int({ min: 0, max: 45 }) * MINUTE);
				const invoiced =
					now.getTime() - completedAt.getTime() > 14 * DAY && faker.datatype.boolean(0.85);
				status = invoiced ? "invoiced" : "completed";
			}
		}
		return {
			customerId: draft.customer.id,
			equipmentIds: draft.units.map((unit) => unit.id),
			engineerId: engineer?.id ?? null,
			type: draft.type,
			status,
			priority: draft.priority,
			description: draft.description,
			scheduledFor,
			completedAt,
			laborHours: draft.laborHours,
			createdAt,
		};
	});

	return orders
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
		.map((o, i) => ({
			id: i + 1,
			number: formatCode("order", i + 1, o.createdAt.getFullYear()),
			...o,
		}));
}

/**
 * Sets the units' status from the orders, in place (like `updateEquipmentStatus`): an open
 * breakdown or repair puts a unit out of service (urgent) or makes it need service. The units the
 * Apparatuur page shows keep its status; a few others without open work are decommissioned.
 */
export function updateShltrEquipmentStatus(
	faker: Faker,
	units: { id: number; status: ShltrUnit["status"] }[],
	fixedStatus: Map<number, ShltrUnit["status"]>,
	orders: ReturnType<typeof generateShltrOrders>,
) {
	const open = new Set<number>();
	for (const o of orders) {
		if (!["quote", "scheduled", "in_progress"].includes(o.status)) continue;
		for (const id of o.equipmentIds) {
			open.add(id);
			if (!["breakdown", "repair"].includes(o.type)) continue;
			const unit = units[id - 1];
			if (o.priority === "urgent") unit.status = "out_of_service";
			else if (unit.status === "operational") unit.status = "needs_service";
		}
	}
	for (const unit of units) {
		const fixed = fixedStatus.get(unit.id);
		if (fixed) unit.status = fixed;
		else if (unit.status === "operational" && !open.has(unit.id) && faker.datatype.boolean(0.02))
			unit.status = "decommissioned";
	}
}
