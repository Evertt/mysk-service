/**
 * Contracts on the server, on the seeded demo database: the list, one contract (and the orders it
 * covers, not those on its units with others, nor work it doesn't cover), the form's
 * options, creating, editing and deleting one (the checks the schema can't make: the tenant's
 * customer, its own units, a period that runs forwards, no unit covered twice at once), the
 * numbers, what's logged, a covered unit staying with its customer, and that South (with the module
 * switched on) can't see or change North's (the server side of `../../e2e/contracts.test.ts` and
 * `contracts.tenancy.test.ts`, which keep the pages and one tampered form).
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { getEquipment, updateEquipment } from "#lib/equipment/equipment.remote.ts";
import { createOrder } from "#lib/orders/order.remote.ts";
import {
	bulkDeleteContracts,
	createContract,
	deleteContract,
	getContract,
	getContractFormOptions,
	getContracts,
	updateContract,
} from "#modules/contracts/contracts.remote.ts";
import {
	getContractsOverview,
	getOrderCoverage,
	getUnitCoverage,
} from "#modules/contracts/coverage.remote.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

import { contractForm, withModule } from "./support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const today = Temporal.Now.plainDateISO("Europe/Amsterdam");
const year = today.year;

const contractOf = (number: string, organization: string) =>
	rows<{
		id: number;
		customer_id: number;
		level: string;
		starts_on: string;
		ends_on: string;
		monthly_fee: number;
		response_hours: number;
		notes: string | null;
	}>(`select * from contract where number = ? and organization_id = ?`, [
		number,
		organization,
	]).then(([row]) => row);

const coverageOf = async (contractId: number) =>
	(
		await rows<{ equipment_id: number }>(
			`select equipment_id from contract_equipment where contract_id = ? order by 1`,
			[contractId],
		)
	).map((row) => row.equipment_id);

/** A contract and its coverage as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) =>
	rows(
		`select c.*, (select group_concat(equipment_id) from contract_equipment
		 where contract_id = c.id) as units from contract c where id = ?`,
		[id],
	);

/** The activity log's entries about a contract, oldest first. */
const logOf = (id: number, organization: string) =>
	rows<{ action: string; subject_label: string; changes: string | null }>(
		`select action, subject_label, changes from activity where organization_id = ?
		 and subject_type = 'contract' and subject_id = ? order by id`,
		[organization, String(id)],
	);

/** The contract number in a 303 to its page. */
const numberIn = (location: string | undefined) => location!.split("/").at(-1)!;

const lastSequence = async (organization: string) =>
	Number(
		(await value<number | null>(
			`select max(cast(substr(number, 10) as integer)) from contract where organization_id = ?`,
			[organization],
		)) ?? 0,
	);

/** A North customer without contracts that owns at least two units, and those units. */
let free: { id: number; units: number[] };
/** A North contract active today, one of its units, and its customer. */
let busy: { id: number; number: string; customer_id: number; equipment_id: number };

beforeAll(async () => {
	const id = await value<number>(
		`select c.id from customer c where c.organization_id = ?
		 and not exists (select 1 from contract k where k.customer_id = c.id)
		 and (select count(*) from equipment e where e.customer_id = c.id) >= 2 order by c.id limit 1`,
		[northId],
	);
	const units = await rows<{ id: number }>(
		`select id from equipment where customer_id = ? order by id limit 2`,
		[id],
	);
	free = { id, units: units.map((unit) => unit.id) };
	[busy] = await rows<typeof busy>(
		`select k.id, k.number, k.customer_id, ce.equipment_id from contract k
		 join contract_equipment ce on ce.contract_id = k.id where k.organization_id = ?
		 and k.starts_on <= ? and k.ends_on >= ? order by k.id limit 1`,
		[northId, today.toString(), today.toString()],
	);
});

describe("North's contracts", () => {
	test("are listed with their customer and how many units they cover, latest start first", async () => {
		const expected = await rows<{ id: number; units: number }>(
			`select k.id, (select count(*) from contract_equipment ce where ce.contract_id = k.id) as units
			 from contract k where k.organization_id = ? order by k.starts_on desc, k.id`,
			[northId],
		);
		const listed = await as(north.member, () => data(getContracts));
		expect(listed.map((row) => row.id).toSorted((a, b) => a - b)).toEqual(
			expected.map((row) => row.id).toSorted((a, b) => a - b),
		);
		const starts = listed.map((row) => row.startsOn.toString());
		expect(starts).toEqual(starts.toSorted().reverse());
		for (const row of listed) {
			expect(row.units, row.number).toBe(expected.find((each) => each.id === row.id)!.units);
		}
	});

	test("one shows its customer and covered equipment; an unknown one is a 404", async () => {
		const answer = await as(north.member, () => data(getContract, busy.number));
		expect(answer.contract.customer.id).toBe(busy.customer_id);
		expect(answer.contract.equipment.map((unit) => unit.id).toSorted((a, b) => a - b)).toEqual(
			await coverageOf(busy.id),
		);
		expect(await as(north.member, () => call(getContract, "CTR-0000-0000"))).toMatchObject({
			status: 404,
		});
	});

	test("the form offers the tenant's customers and units only", async () => {
		const { customers, equipments } = await as(north.member, () => data(getContractFormOptions));
		const ids = (list: { id: number }[]) => list.map((row) => row.id).toSorted((a, b) => a - b);
		const own = async (table: string) =>
			(
				await rows<{ id: number }>(
					`select id from ${table} where organization_id = ? order by id`,
					[northId],
				)
			).map((row) => row.id);
		expect(ids(customers)).toEqual(await own("customer"));
		expect(ids(equipments)).toEqual(await own("equipment"));
	});
});

describe("a contract's orders", () => {
	/** A North contract active today covering two or more units, and a unit of its customer's it doesn't cover. */
	let term: { number: string; customer: number; covered: number[]; other: number };
	/** The orders made for this test, by what they are: their numbers. */
	const made: Record<"covered" | "mixed" | "installation", string> = {
		covered: "",
		mixed: "",
		installation: "",
	};

	const newOrder = async (type: string, equipmentIds: number[], description: string) => {
		const created = await as(north.member, () =>
			submit(createOrder, {
				customerId: String(term.customer),
				equipmentIds: equipmentIds.map(String),
				engineerId: "",
				type,
				status: "quote",
				priority: "normal",
				description,
				scheduledFor: "",
				scheduledTime: "",
				laborHours: 2,
			}),
		);
		expect(created).toMatchObject({ status: 303 });
		return created.location!.split("/").pop()!;
	};

	beforeAll(async () => {
		const [found] = await rows<{ number: string; customer: number; id: number }>(
			`select k.number, k.customer_id as customer, k.id from contract k where k.organization_id = ?
			 and k.starts_on <= ? and k.ends_on >= ?
			 and (select count(*) from contract_equipment ce where ce.contract_id = k.id) >= 2
			 and exists (select 1 from equipment e where e.customer_id = k.customer_id
			   and e.id not in (select equipment_id from contract_equipment where contract_id = k.id))
			 order by k.id limit 1`,
			[northId, today.toString(), today.toString()],
		);
		const covered = (await coverageOf(found.id)).slice(0, 2);
		const other = await value<number>(
			`select id from equipment where customer_id = ? and id not in
			 (select equipment_id from contract_equipment where contract_id = ?) order by id limit 1`,
			[found.customer, found.id],
		);
		term = { number: found.number, customer: found.customer, covered, other };
		made.covered = await newOrder("inspection", covered, "Inspection of the covered doors (test)");
		made.mixed = await newOrder(
			"inspection",
			[...covered, other],
			"Inspection of covered and uncovered doors (test)",
		);
		made.installation = await newOrder("installation", [covered[0]], "New door (test)");
	});

	test("are the ones it covers, as their coverage says, with their first unit and how many", async () => {
		const { orders } = await as(north.member, () => data(getContract, term.number));
		const numbers = orders.map((order) => order.number);
		expect(numbers).toContain(made.covered);
		expect(orders.find((order) => order.number === made.covered)).toMatchObject({
			unit: { id: term.covered[0] },
			unitCount: 2,
		});
		for (const order of orders) {
			const coverage = (await as(north.member, () => data(getOrderCoverage, order.number))).covered;
			expect(coverage?.contract.number, order.number).toBe(term.number);
		}
	});

	test("leave out an order on uncovered units too, and work it doesn't cover", async () => {
		const { orders } = await as(north.member, () => data(getContract, term.number));
		const numbers = orders.map((order) => order.number);
		expect(numbers).not.toContain(made.mixed);
		expect(numbers).not.toContain(made.installation);
		expect((await as(north.member, () => data(getOrderCoverage, made.mixed))).covered).toBeNull();
	});
});

describe("a contract's form, in North", () => {
	let number: string;

	test("refuses a unit already covered in the same period, naming the contract", async () => {
		const before = await value(`select count(*) from contract`);
		const answer = await as(north.member, () =>
			submit(
				createContract,
				contractForm({
					customerId: busy.customer_id,
					equipmentIds: [busy.equipment_id],
					startsOn: today.toString(),
					endsOn: today.add({ years: 1 }).toString(),
				}),
			),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues).toEqual([
			{
				name: "equipmentIds",
				path: ["equipmentIds"],
				message: expect.stringContaining(`already covered by ${busy.number}`),
			},
		]);
		expect(await value(`select count(*) from contract`)).toBe(before);
	});

	test("refuses a period that doesn't run forwards, and units of another customer", async () => {
		await as(north.member, async () => {
			const backwards = await submit(
				createContract,
				contractForm({
					customerId: free.id,
					equipmentIds: free.units,
					startsOn: `${year + 1}-01-01`,
					endsOn: `${year}-12-01`,
				}),
			);
			expect(backwards.issues).toMatchObject([
				{ name: "endsOn", message: expect.stringMatching(/after the start/) },
			]);
			const others = await submit(
				createContract,
				contractForm({
					customerId: free.id,
					equipmentIds: [free.units[0], busy.equipment_id],
					startsOn: `${year + 1}-01-01`,
					endsOn: `${year + 1}-12-31`,
				}),
			);
			expect(others.issues).toMatchObject([
				{ name: "equipmentIds", message: expect.stringMatching(/own customer/) },
			]);
		});
	});

	test("a new contract gets the next number and covers the chosen units, logged", async () => {
		const last = await lastSequence(northId);
		const answer = await as(north.member, () =>
			submit(
				createContract,
				contractForm({
					customerId: free.id,
					equipmentIds: free.units,
					level: "premium",
					startsOn: `${year + 1}-01-01`,
					endsOn: `${year + 1}-12-31`,
					monthlyFee: 123.45,
					responseHours: 4,
					notes: " Test contract ",
				}),
			),
		);
		expect(answer).toMatchObject({ status: 303 });
		expect(answer.refreshed).toContain("getContracts");
		number = numberIn(answer.location);
		expect(number).toBe(`CTR-${year}-${String(last + 1).padStart(4, "0")}`);
		const stored = await contractOf(number, northId);
		expect(stored).toMatchObject({
			customer_id: free.id,
			level: "premium",
			starts_on: `${year + 1}-01-01`,
			ends_on: `${year + 1}-12-31`,
			monthly_fee: 12345,
			response_hours: 4,
			notes: "Test contract",
		});
		expect(await coverageOf(stored.id)).toEqual(free.units.toSorted((a, b) => a - b));
		const [entry] = await logOf(stored.id, northId);
		expect(entry).toMatchObject({ action: "created", subject_label: number });
		// Its units' page lists it.
		const serial = await value<string>(`select serial_number from equipment where id = ?`, [
			free.units[0],
		]);
		const covering = await as(north.member, () => data(getUnitCoverage, serial));
		expect(covering.map((row) => row.number)).toContain(number);
	});

	test("editing it saves the changes and its coverage, logged with what changed", async () => {
		const { id } = await contractOf(number, northId);
		const answer = await as(north.member, () =>
			submit(updateContract, {
				id: String(id),
				...contractForm({
					customerId: free.id,
					// Its own coverage isn't an overlap.
					equipmentIds: [free.units[1]],
					level: "basic",
					startsOn: `${year + 1}-01-01`,
					endsOn: `${year + 1}-12-31`,
					monthlyFee: 123.45,
					responseHours: 72,
					notes: "Test contract",
				}),
			}),
		);
		expect(answer).toMatchObject({ status: 303, location: `/contracts/${number}` });
		expect(answer.refreshed).toEqual(expect.arrayContaining(["getContracts", "getContract"]));
		expect(await contractOf(number, northId)).toMatchObject({ level: "basic", response_hours: 72 });
		expect(await coverageOf(id)).toEqual([free.units[1]]);
		const entry = (await logOf(id, northId)).at(-1)!;
		expect(entry.action).toBe("updated");
		expect(JSON.parse(entry.changes!)).toEqual({
			level: ["premium", "basic"],
			responseHours: [4, 72],
			equipmentIds: [free.units.toSorted((a, b) => a - b), [free.units[1]]],
		});
	});

	test("deleting it removes it and its coverage, logged; then it's a 404", async () => {
		const { id } = await contractOf(number, northId);
		expect(await as(north.member, () => submit(deleteContract, { id: String(id) }))).toMatchObject({
			status: 303,
			location: "/contracts",
		});
		expect(await contractOf(number, northId)).toBeUndefined();
		expect(await coverageOf(id)).toEqual([]);
		expect((await logOf(id, northId)).at(-1)).toMatchObject({ action: "deleted" });
		expect(await as(north.member, () => call(getContract, number))).toMatchObject({ status: 404 });
	});
});

describe("a covered unit", () => {
	test("can't move to another customer while a contract covers it", async () => {
		const [unit] = await rows<{ serial_number: string; customer_id: number }>(
			`select e.serial_number, e.customer_id from equipment e where e.organization_id = ?
			 and exists (select 1 from contract_equipment ce where ce.equipment_id = e.id)
			 and not exists (select 1 from order_unit ou where ou.equipment_id = e.id) order by e.id limit 1`,
			[northId],
		);
		const [other] = await rows<{ customer_id: number; id: number }>(
			`select customer_id, min(id) as id from customer_site where organization_id = ?
			 and customer_id != ? group by customer_id order by customer_id limit 1`,
			[northId, unit.customer_id],
		);
		const answer = await as(north.member, async () => {
			const { unit: found } = await data(getEquipment, unit.serial_number);
			return submit(updateEquipment, {
				id: String(found.id),
				serialNumber: found.serialNumber,
				manufacturer: found.manufacturer,
				model: found.model,
				categoryId: String(found.categoryId),
				status: found.status,
				name: found.name ?? "",
				customerId: String(other.customer_id),
				siteId: String(other.id),
				locationId: "",
				installedAt: found.installedAt.toString(),
				warrantyUntil: found.warrantyUntil.toString(),
			});
		});
		expect(answer.status).toBe(400);
		expect(answer.issues).toMatchObject([
			{ name: "customerId", message: expect.stringContaining("service contract") },
		]);
		expect(
			await value(
				`select customer_id from equipment where serial_number = ? and organization_id = ?`,
				[unit.serial_number, northId],
			),
		).toBe(unit.customer_id);
	});
});

describe("in South, with the module switched on", () => {
	/** A South customer with at least two units, and them. */
	let southCustomer: { id: number; units: number[] };

	beforeAll(async () => {
		const id = await value<number>(
			`select c.id from customer c where c.organization_id = ?
			 and (select count(*) from equipment e where e.customer_id = c.id) >= 2 order by c.id limit 1`,
			[southId],
		);
		const units = await rows<{ id: number }>(
			`select id from equipment where customer_id = ? order by id limit 2`,
			[id],
		);
		southCustomer = { id, units: units.map((unit) => unit.id) };
	});

	const southForm = (changes: Partial<Parameters<typeof contractForm>[0]> = {}) =>
		contractForm({
			customerId: southCustomer.id,
			equipmentIds: [southCustomer.units[0]],
			startsOn: `${year + 1}-01-01`,
			endsOn: `${year + 1}-12-31`,
			...changes,
		});

	test("the list is empty, and North's contracts, orders and units are 404s", async () => {
		const northOrder = await value<string>(
			`select o.number from "order" o where o.organization_id = ? and not exists
			 (select 1 from "order" s where s.organization_id = ? and s.number = o.number) limit 1`,
			[northId, southId],
		);
		const serial = await value<string>(`select serial_number from equipment where id = ?`, [
			busy.equipment_id,
		]);
		await withModule("south", "contracts", () =>
			as(south.owner, async () => {
				expect(await data(getContracts)).toEqual([]);
				expect(await call(getContract, busy.number)).toMatchObject({ status: 404 });
				expect(await call(getOrderCoverage, northOrder)).toMatchObject({ status: 404 });
				expect(await call(getUnitCoverage, serial)).toMatchObject({ status: 404 });
				const overview = await data(getContractsOverview);
				expect(overview).toMatchObject({ responses: [], expiring: [] });
			}),
		);
	});

	test("the form only offers South's customers and units", async () => {
		const { customers, equipments } = await withModule("south", "contracts", () =>
			as(south.owner, () => data(getContractFormOptions)),
		);
		for (const [table, offered] of [
			["customer", customers],
			["equipment", equipments],
		] as const) {
			const ids = offered.map((row) => row.id);
			expect(ids.length, table).toBeGreaterThan(0);
			expect(
				await value(
					`select count(*) from ${table} where organization_id != ?
					 and id in (${ids.map(() => "?").join(",")})`,
					[southId, ...ids],
				),
				table,
			).toBe(0);
		}
	});

	test("a North unit or customer is refused", async () => {
		await withModule("south", "contracts", () =>
			as(south.owner, async () => {
				const unit = await submit(
					createContract,
					southForm({ equipmentIds: [southCustomer.units[0], busy.equipment_id] }),
				);
				expect(unit.issues).toMatchObject([
					{ name: "equipmentIds", message: expect.stringMatching(/own customer/) },
				]);
				const northCustomer = await submit(
					createContract,
					southForm({ customerId: busy.customer_id, equipmentIds: [busy.equipment_id] }),
				);
				expect(northCustomer.issues).toContainEqual({
					name: "customerId",
					path: ["customerId"],
					message: "Unknown customer",
				});
			}),
		);
		expect(await value(`select count(*) from contract where organization_id = ?`, [southId])).toBe(
			0,
		);
	});

	test("a new contract gets South's first number, and North's ids are refused", async () => {
		await withModule("south", "contracts", async () => {
			const made = await as(south.owner, () => submit(createContract, southForm()));
			const number = numberIn(made.location);
			expect(number).toBe(`CTR-${year}-0001`);
			const own = await contractOf(number, southId);
			expect(
				await rows(
					`select distinct e.organization_id from contract_equipment ce
					 join equipment e on e.id = ce.equipment_id where ce.contract_id = ?`,
					[own.id],
				),
			).toEqual([{ organization_id: southId }]);

			const [victimBefore, ownBefore] = [await snapshot(busy.id), await snapshot(own.id)];
			await as(south.owner, async () => {
				// The edit form with North's id, covering another of South's units so the overlap
				// check (which skips the contract being saved) lets it through to the contract.
				const tampered = {
					id: String(busy.id),
					...southForm({ equipmentIds: [southCustomer.units[1]], monthlyFee: 1 }),
				};
				expect(await submit(updateContract, tampered)).toMatchObject({ status: 404 });
				expect(await submit(deleteContract, { id: String(busy.id) })).toMatchObject({
					status: 404,
				});
				expect(await call(bulkDeleteContracts, { ids: [busy.id] })).toMatchObject({
					status: 200,
					data: { done: 0, missing: 1 },
				});
			});
			expect(await snapshot(busy.id)).toEqual(victimBefore);
			expect(await snapshot(own.id)).toEqual(ownBefore);

			// South's own goes, through the list's bulk delete.
			expect(
				await as(south.owner, () => call(bulkDeleteContracts, { ids: [own.id] })),
			).toMatchObject({ status: 200, data: { done: 1 } });
		});
		expect(await value(`select count(*) from contract where organization_id = ?`, [southId])).toBe(
			0,
		);
	});
});
