import type { Session, User } from "better-auth";

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
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
