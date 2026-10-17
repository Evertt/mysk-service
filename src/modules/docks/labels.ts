/** The translated names of the docks module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type { Beacon, DockEventType, DockState, KeyLocation } from "./model.ts";

export const dockLabels = defineLabels({
	dockState: {
		free: m.docks_state_free,
		occupied: m.docks_state_occupied,
		loading: m.docks_state_loading,
		fault: m.docks_state_fault,
	} satisfies Labels<DockState>,
	keyLocation: {
		scp: m.docks_key_scp,
		driver: m.docks_key_driver,
		storage: m.docks_key_storage,
	} satisfies Labels<KeyLocation>,
	beacon: {
		green: m.docks_beacon_green,
		orange: m.docks_beacon_orange,
		red: m.docks_beacon_red,
		off: m.docks_beacon_off,
	} satisfies Labels<Beacon>,
	dockEvent: {
		check_in: m.docks_event_check_in,
		lock: m.docks_event_lock,
		unlock: m.docks_event_unlock,
		door_open: m.docks_event_door_open,
		door_close: m.docks_event_door_close,
		key_moved: m.docks_event_key_moved,
		scp_fault: m.docks_event_scp_fault,
		scp_ok: m.docks_event_scp_ok,
		check_out: m.docks_event_check_out,
	} satisfies Labels<DockEventType>,
});
