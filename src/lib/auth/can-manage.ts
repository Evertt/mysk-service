import { isManager } from "./roles.ts";
import { getCurrentTenant } from "./session.remote.ts";

/**
 * Whether the user manages the current organization (an owner or an admin): what an office page
 * reads to hide the controls only managers may use, as `{#if await canManage()}`. The roles come
 * from `getCurrentTenant()`, which the app shell has loaded already; a query never sends this along
 * (`can-manage.spec.ts` refuses it). It only hides: the server refuses everyone else
 * (`forManagers`, `moduleRemote(id, "manager")`).
 */
export const canManage = async () => isManager((await getCurrentTenant()).roles);
