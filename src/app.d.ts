import type { Session, User } from "better-auth";

import type { TableMemory } from "#lib/components/data-table/table-memory.remote.ts";
import type { Tenant } from "#lib/server/auth/index.ts";

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session & { activeOrganizationId?: string | null };
			/** The organization the user works in; see `requireMember()`. */
			tenant?: Tenant;
		}

		// interface Error {}
		interface PageData {
			/** What's remembered of the page's data table, if it brings it back (`loadTableMemory`). */
			tableMemory?: Record<string, TableMemory | null>;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
