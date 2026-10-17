/** What the docks module's end-to-end tests share: the Salvo feed, and the docks as stored. */
import { baseURL, rows } from "#e2e/app.ts";
import { demoDockToken } from "#modules/docks/server/demo.ts";

/** SHLTR's owner, a manager, and its planner, a member. */
export const shltrOwner = "owner@shltr.example";
export const shltrPlanner = "jan@shltr.example";

let counter = 0;

/** A Salvo event at `dock`, `minutesAgo` before now. */
export const salvoEvent = (type: string, dock: string, minutesAgo = 0, payload?: object) => ({
	id: `e2e-${Date.now().toString(36)}-${++counter}`,
	type,
	dock,
	at: Temporal.Now.instant().subtract({ minutes: minutesAgo }).toString(),
	...(payload ? { payload } : {}),
});

/** Posts a batch to the feed, with `token` (SHLTR's demo token by default; `null` for none). */
export async function postEvents(events: object[], token: string | null = demoDockToken) {
	const response = await fetch(new URL("/docks/ingest", baseURL), {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ events }),
		redirect: "manual",
	});
	const text = await response.text();
	let body: Record<string, unknown> = {};
	try {
		body = JSON.parse(text) as Record<string, unknown>;
	} catch {
		// A redirect or an HTML error page: the status says enough.
	}
	return { status: response.status, body };
}

/** A tenant's dock by its code, with its live state. */
export async function dockOf(organizationId: string, code: string) {
	const [found] = await rows<{
		id: number;
		door_id: number | null;
		locked: number | null;
		door_open_since: number | null;
		last_event_at: number | null;
	}>(
		`select d.id, d.door_id, s.locked, s.door_open_since, s.last_event_at from dock_position d
		 left join dock_state s on s.dock_id = d.id where d.organization_id = ? and d.code = ?`,
		[organizationId, code],
	);
	return found;
}

/** The breakdown orders the door rules made on a door. */
export const escalatedOrders = (doorId: number) =>
	rows<{ number: string; description: string; status: string }>(
		`select o.number, o.description, o.status from dock_escalation e
		 join "order" o on o.id = e.order_id where e.equipment_id = ? order by o.id`,
		[doorId],
	);
