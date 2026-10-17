/**
 * The server spec harness: runs the app's server code as a tenant on a seeded copy of the demo
 * database, and calls its remote functions without HTTP, gate and schema included. How to write a
 * spec with it: "Server specs" in docs/agents/tests.md. A spec that imports it runs in the
 * `server-harness` project (vite.config.ts), which gives each file its own copy of the database.
 */
export {
	demoAccount,
	north,
	shltr,
	south,
	type Actor,
	type Organization,
	type Role,
} from "./actors.ts";
export { organizationId, rows, value, withoutModule } from "./database.ts";
export { call, data, submit, type Answer, type Issue } from "./calls.ts";
export { as, asSystem, signedOut, type VisitOptions } from "./request.ts";
