/** The translated names of the contracts module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/labels.js";
import { m } from "#lib/paraglide/messages.js";

import type { SlaState } from "./coverage.js";
import type { ContractLevel, ContractStatus } from "./model.js";

export const contractLabels = defineLabels({
	contractLevel: {
		basic: m.enum_contract_level_basic,
		standard: m.enum_contract_level_standard,
		premium: m.enum_contract_level_premium,
	} satisfies Labels<ContractLevel>,
	contractStatus: {
		upcoming: m.enum_contract_status_upcoming,
		active: m.enum_contract_status_active,
		expired: m.enum_contract_status_expired,
	} satisfies Labels<ContractStatus>,
	slaState: {
		on_track: m.enum_sla_state_on_track,
		at_risk: m.enum_sla_state_at_risk,
		overdue: m.enum_sla_state_overdue,
		responded: m.enum_sla_state_responded,
	} satisfies Labels<SlaState>,
});
