/**
 * What a service contract bills: its monthly fee, for each month of the contract. Months run from
 * the contract's first day, e.g. the 15th to the 14th of the next month (from the 31st, to the end
 * of shorter months); the last one ends with the contract. A month is billed in advance, from its
 * first day, and in full. The server offers them to invoicing (`invoices.billableItems`
 * in `server/index.ts`). Without imports at runtime, so the seed script can use it too.
 */

/** One month of a contract, as days (both included). */
export interface ContractMonth {
	startsOn: Temporal.PlainDate;
	endsOn: Temporal.PlainDate;
}

/** The months of a contract that start between `from` and `until` (both inclusive). */
export function contractMonths(
	contract: { startsOn: Temporal.PlainDate; endsOn: Temporal.PlainDate },
	from: Temporal.PlainDate,
	until: Temporal.PlainDate,
): ContractMonth[] {
	const months: ContractMonth[] = [];
	for (let i = 0; ; i++) {
		// On the contract's day of the month, or the month's last day if it's shorter.
		const startsOn = contract.startsOn.add({ months: i });
		if (
			Temporal.PlainDate.compare(startsOn, contract.endsOn) > 0 ||
			Temporal.PlainDate.compare(startsOn, until) > 0
		)
			break;
		if (Temporal.PlainDate.compare(startsOn, from) < 0) continue;
		const endsOn = contract.startsOn.add({ months: i + 1 }).subtract({ days: 1 });
		months.push({
			startsOn,
			endsOn: Temporal.PlainDate.compare(endsOn, contract.endsOn) < 0 ? endsOn : contract.endsOn,
		});
	}
	return months;
}

/** The billable item for a contract's month: `contracts:<contract id>:<first day>`. */
export const monthReference = (contractId: number, month: Pick<ContractMonth, "startsOn">) =>
	`contracts:${contractId}:${month.startsOn.toString()}`;

/**
 * How a month's fee reads on the invoice, e.g. "Service contract CTR-2026-0012 (Premium)" and
 * "Monthly fee, 1 Oct 2026 – 31 Oct 2026". Stored with the invoice line, so the caller words it
 * in the language of whoever bills it (the seed script, which can't import messages, in English).
 */
export interface MonthlyFeeText {
	description: string;
	detail: string;
}

/** What a month of a contract bills, as a billable item (see `#lib/billing.ts`). */
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
