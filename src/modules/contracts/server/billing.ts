/**
 * What a service contract bills: its monthly fee, for each month of the contract. Months run from
 * the contract's first day, e.g. the 15th to the 14th of the next month (from the 31st, to the end
 * of shorter months); the last one ends with the contract. A month is billed in advance, from its
 * first day, and in full. The server offers them to invoicing (`invoicing.billableItems`
 * in `server/index.ts`). It imports only `#lib/dates.ts` (which imports nothing), so the seed
 * script can use it too. Its days are in the user's time zone (`getTimeZone()`).
 */
import { addDays, addMonths, toDateInput } from "#lib/dates.ts";

/** One month of a contract, as days at midnight (both inclusive). */
export interface ContractMonth {
	startsOn: Date;
	endsOn: Date;
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
		const endsOn = addDays(next, -1);
		months.push({ startsOn, endsOn: endsOn < contract.endsOn ? endsOn : contract.endsOn });
	}
	return months;
}

/** The billable item for a contract's month: `contracts:<contract id>:<first day>`. */
export const monthReference = (contractId: number, month: Pick<ContractMonth, "startsOn">) =>
	`contracts:${contractId}:${toDateInput(month.startsOn)}`;

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
