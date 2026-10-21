/**
 * Who may read and change the contracts module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). A service contract is the office's: neither portal reads one today (an
 * order's coverage reaches them only as a price adjustment on the order), so no other audience
 * has an entry.
 */
import { type AccessRule, rows } from "#lib/server/access/rules.ts";

import type { contractSubjects } from "../activity.ts";
import { contract } from "./schema.ts";

export const contractAccess = {
	contract: rows(contract, contract.id, { office: true }),
} satisfies Record<keyof typeof contractSubjects, AccessRule>;
