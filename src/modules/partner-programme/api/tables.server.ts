/**
 * The wallet's ledger table, for the modules that require the partner programme: to refer to an
 * entry from their own tables (a composite key on `(organization_id, id)`, e.g. the shop order a
 * spend paid). They never write it: entries are made through `./wallet.server.ts`. Free of
 * SvelteKit, so the seed (plain Node) can load the schemas that import it.
 */
export { walletEntry } from "../server/schema.ts";
