/** The translated names of the contracts module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type { SlaState } from "./coverage.ts";
import type { ContractLevel, ContractStatus } from "./model.ts";

export const contractLabels = defineLabels({
	contractLevel: {
		basic: m.contracts_level_basic,
		standard: m.contracts_level_standard,
		premium: m.contracts_level_premium,
	} satisfies Labels<ContractLevel>,
	contractStatus: {
		upcoming: m.contracts_status_upcoming,
		active: m.contracts_status_active,
		expired: m.contracts_status_expired,
	} satisfies Labels<ContractStatus>,
	slaState: {
		on_track: m.contracts_sla_state_on_track,
		at_risk: m.contracts_sla_state_at_risk,
		overdue: m.contracts_sla_state_overdue,
		responded: m.contracts_sla_state_responded,
	} satisfies Labels<SlaState>,
});
