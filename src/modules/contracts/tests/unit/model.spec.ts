import { describe, expect, test } from "vite-plus/test";

import { formatCode, sequenceStart } from "#lib/numbering.ts";
import { contractNumberFormat, contractStatus } from "#modules/contracts/model.ts";
import { at, day } from "#unit/temporal-support.ts";

describe("contractStatus", () => {
	const contract = { startsOn: day("2026-01-01"), endsOn: day("2026-12-31") };

	test("is upcoming before the first day", () => {
		expect(contractStatus(contract, at("2025-12-31 23:59"))).toBe("upcoming");
	});

	test("is active from the first through the last day", () => {
		expect(contractStatus(contract, day("2026-01-01"))).toBe("active");
		expect(contractStatus(contract, at("2026-12-31 23:59"))).toBe("active");
	});

	test("has expired after the last day", () => {
		expect(contractStatus(contract, day("2027-01-01"))).toBe("expired");
	});
});

describe("contractNumberFormat", () => {
	test("numbers contracts per year, like CTR-2027-0007", () => {
		expect(formatCode(contractNumberFormat, 7, 2027)).toBe("CTR-2027-0007");
		expect(sequenceStart(contractNumberFormat)).toBe(10);
	});
});
