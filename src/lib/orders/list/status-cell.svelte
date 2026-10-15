<!--
	@component
	An order's status in the orders table, with the badges the tenant's modules put on it. The
	status is a select that looks like its badge (see `BadgeSelect`), offering the statuses the
	order can be given by hand (`orderStatusChoices()`; none for an invoiced order, which shows the
	plain badge). A change shows at once, and goes through the same path as the order form's
	(`setOrderStatus`), so the modules may refuse it (e.g. for a shortage of stock): then a toast
	says why, and the badge goes back. The table's rows and its filters' counts refresh with it.

	It needs the query of the page of rows its order was loaded with, which the table gives it with
	`setStatusCellQuery()`.
-->
<script lang="ts" module>
	import { createContext } from "svelte";

	import type { getOrders as GetOrders } from "./order-list.remote.ts";

	const [getQuery, setQuery] = createContext<(id: number) => Parameters<typeof GetOrders>[0]>();

	/**
	 * Gives the status cells the query of the page of rows an order was loaded with (as the table
	 * called `getOrders()` with it), as a function read when a status changes.
	 */
	export const setStatusCellQuery = setQuery;
</script>

<script lang="ts">
	import { toast } from "svelte-sonner";

	import BadgeSelect, { type BadgeOption } from "#lib/components/badge-select.svelte";
	import { orderStatusChoices, type OrderStatus } from "#lib/models.ts";
	import { errorMessage } from "#lib/utils.ts";

	import { statuses } from "../display.ts";
	import type { OrderTag } from "../extensions.ts";
	import OrderTags from "../ui/order-tags.svelte";
	import { getOrderFacets, getOrders } from "./order-list.remote.ts";
	import { setOrderStatus } from "./order-status.remote.ts";

	let {
		id,
		number,
		status,
		tags,
		fixed = false,
	}: {
		id: number;
		number: string;
		status: OrderStatus;
		tags: OrderTag[];
		/** Shows the status as a plain badge. */
		fixed?: boolean;
	} = $props();

	const query = getQuery();

	const option = (value: OrderStatus): BadgeOption<OrderStatus> => ({
		value,
		label: statuses[value].label,
		icon: statuses[value].icon,
		variant: statuses[value].variant,
	});

	async function change(to: OrderStatus) {
		// `orderStatusChoices()` offers only these; the server checks again.
		if (to === "invoiced") return;
		try {
			await setOrderStatus({ id, status: to }).updates(
				getOrders(query(id)).withOverride((current) => ({
					...current,
					rows: current.rows.map((row) => (row.id === id ? { ...row, status: to } : row)),
				})),
				getOrderFacets,
			);
		} catch (error) {
			toast.error(errorMessage(error, m.orders_status_change_failed({ number })));
		}
	}
</script>

<div class="flex flex-wrap items-center gap-1">
	<BadgeSelect
		current={option(status)}
		options={fixed ? [] : orderStatusChoices(status).map(option)}
		label={m.orders_status_of({ number })}
		onchange={change}
	/>
	<OrderTags {tags} />
</div>
