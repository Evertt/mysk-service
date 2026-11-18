<!--
	@component
	The maintenance module's fact on a unit's page in the customer portal (`client.unit.facts`,
	`#lib/client/extensions.ts`): the day it was last maintained, linking to that order's page, or
	"not yet". Live by the orders: one completed on it moves it on.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatDate } from "#lib/i18n/index.ts";

	import { getClientLastMaintenance } from "../../client/client-maintenance.remote.ts";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getClientLastMaintenance(serialNumber));
	refreshOnActivity(() => getClientLastMaintenance(serialNumber).refresh(), { types: ["order"] });
</script>

<dl data-client-last-maintenance={data.last?.number ?? ""}>
	<DetailItem
		label={m.maintenance_client_last()}
		value={data.last?.completedAt
			? formatDate(data.last.completedAt)
			: m.maintenance_client_last_none()}
		href={data.last
			? resolve("/(customer)/portal/orders/[number]", { number: data.last.number })
			: undefined}
	/>
</dl>
