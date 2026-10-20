/**
 * The module's settings page (`/docks/settings`): the tenant's docks, which are kept on their
 * customers' pages. The Salvo feed's integration tokens are the core's (`<IntegrationTokensCard>`).
 * Every member may read them.
 */
import { query } from "../remote-functions.ts";
import { allDocks } from "../server/docks.ts";

/** The tenant's docks. */
export const getDockSettings = query(async () => ({ docks: await allDocks() }));
