/**
 * What a service contract bills: its monthly fee, for each month of the contract. Months run from
 * the contract's first day, e.g. the 15th to the 14th of the next month (from the 31st, to the end
 * of shorter months); the last one ends with the contract. A month is billed in advance, from its
 * first day, and in full. The server offers them to invoicing (`billing.billableItems` in
 * `server/index.ts`). Without imports at runtime, so the seed script can use it too.
 */

/** One month of a contract, as days at midnight (both inclusive). */
export interface ContractMonth {
	startsOn: Date;
	endsOn: Date;
}

/** `months` after `start`, on the same day of the month, or the month's last day if it's shorter. */
function addMonths(start: Date, months: number) {
	const first = new Date(start.getFullYear(), start.getMonth() + months, 1);
	const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
	return new Date(first.getFullYear(), first.getMonth(), Math.min(start.getDate(), length));
}

/** The months of a contract that start between `from` and `until` (both inclusive). */
export function contractMonths(
	contract: { startsOn: Date; endsOn: Date },
	from: Date,
	until: Date,
): ContractMonth[] {
	const months: ContractMonth[] = [];
	for (let i = 0; ; i++) {
		const startsOn = addMonths(contract.startsOn, i);
		if (startsOn > contract.endsOn || startsOn > until) break;
		if (startsOn < from) continue;
		const next = addMonths(contract.startsOn, i + 1);
		const endsOn = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
		months.push({ startsOn, endsOn: endsOn < contract.endsOn ? endsOn : contract.endsOn });
	}
	return months;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The billable item for a contract's month: `contracts:<contract id>:<first day>`. */
export const monthReference = (contractId: number, month: Pick<ContractMonth, "startsOn">) =>
	`contracts:${contractId}:${month.startsOn.getFullYear()}-${pad(month.startsOn.getMonth() + 1)}-${pad(month.startsOn.getDate())}`;

/**
 * How a month's fee reads on the invoice, e.g. "Service contract CTR-2026-0012 (Premium)" and
 * "Monthly fee, 1 Oct 2026 – 31 Oct 2026". Stored with the invoice line, so the caller words it
 * in the language of whoever bills it (the seed script, which can't import messages, in English).
 */
export interface MonthlyFeeText {
	description: string;
	detail: string;
}

/** What a month of a contract bills, as a billable item (see `#lib/server/modules.ts`). */
export const monthlyFee = (
	contract: { id: number; monthlyFee: number },
	month: ContractMonth,
	{ description, detail }: MonthlyFeeText,
) => ({
	reference: monthReference(contract.id, month),
	description,
	detail,
	quantity: 1,
	unitPrice: contract.monthlyFee,
	date: month.startsOn,
});
