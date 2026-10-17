/**
 * The partner programme's extension points, for the modules that require or enhance it (see
 * `#lib/extensions/define.ts`). A module may import this file, and gets what it needs from the
 * slot's props: never from the programme's tables.
 */
import { defineSlot } from "#lib/extensions/define.ts";

/**
 * Under the wallet in the customer portal (its page and the home page's card): what the partner can
 * do with its credit, e.g. the parts shop's way to spend it. They get what's available today (in
 * cents), and render nothing when they have nothing to offer.
 */
export const clientWallet = defineSlot<{ available: number }>("partner-programme.client.wallet");
