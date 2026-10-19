<!--
	@component
	A site's alerts (`energie_meldingen`): what each is about and measured, its recommendation, when
	it happened and where it stands; "Maak opdracht" makes an order of an open one (on the door's
	unit, or a survey), "Afhandelen" resolves it. The site's page shows the open ones, the alerts
	page all of them.
-->
<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { toast } from "svelte-sonner";

	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";
	import { formatDateTime } from "#lib/i18n/index.ts";

	import { getEnergyAlerts, makeAlertOrder, resolveEnergyAlert } from "../alerts.remote.ts";
	import { alertDetail, recommendation } from "../display.ts";
	import { watchEnergy } from "../energy.remote.ts";
	import { energyLabels } from "../labels.ts";
	import type { AlertStatus } from "../model.ts";

	let {
		site,
		status,
	}: {
		site: number;
		/** Which alerts: those of a status, or all of them. */
		status: AlertStatus | null;
	} = $props();

	const alerts = $derived(await getEnergyAlerts({ site, status }));
	let busy = $state<number>();

	// Live: an alert the feed raises, or one dealt with here or elsewhere, shows at once. Also
	// after this list's own commands: their log entries announce them, and a refresh of its own as
	// well, while the live one runs, froze the page (Svelte 5.57).
	refreshOnChange(watchEnergy, () => getEnergyAlerts({ site, status }).refresh());

	async function act(id: number, action: "order" | "resolve") {
		busy = id;
		try {
			if (action === "order") {
				const { number } = await makeAlertOrder(id);
				toast.success(m.energy_alert_ordered({ number }), {
					action: {
						label: m.energy_alert_view_order(),
						onClick: () => goto(resolve("/(app)/orders/[number]", { number })),
					},
				});
			} else {
				await resolveEnergyAlert(id);
				toast.success(m.energy_alert_resolved());
			}
		} finally {
			busy = undefined;
		}
	}
</script>

{#if alerts.length}
	<ul class="flex flex-col divide-y" data-alerts>
		{#each alerts as alert (alert.id)}
			<li
				class="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
				data-alert={alert.id}
				data-alert-status={alert.status}
			>
				<div class="flex min-w-0 flex-col gap-1">
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant={alert.severity === "active" ? "danger" : "warning"}>
							{energyLabels.label("alertSeverity", alert.severity)}
						</Badge>
						<span class="font-mono text-xs text-muted-foreground"
							>{alert.door?.code ?? alert.zoneCode}</span
						>
						<span class="text-xs text-muted-foreground">{formatDateTime(alert.at)}</span>
					</div>
					<p class="font-medium" data-recommendation>{recommendation(alert)}</p>
					<p class="text-sm text-muted-foreground">{alertDetail(alert)}</p>
				</div>
				<div class="flex shrink-0 flex-wrap items-center gap-2">
					{#if alert.status === "order" && alert.orderNumber}
						<Button
							variant="link"
							size="sm"
							href={resolve("/(app)/orders/[number]", { number: alert.orderNumber })}
							>{alert.orderNumber}</Button
						>
					{:else if alert.status === "done"}
						<Badge variant="neutral">{energyLabels.label("alertStatus", "done")}</Badge>
					{/if}
					{#if alert.status === "open"}
						<Button
							size="sm"
							variant="outline"
							disabled={busy === alert.id}
							onclick={() => act(alert.id, "order")}>{m.energy_alert_make_order()}</Button
						>
					{/if}
					{#if alert.status !== "done"}
						<Button
							size="sm"
							variant="ghost"
							disabled={busy === alert.id}
							onclick={() => act(alert.id, "resolve")}>{m.energy_alert_resolve()}</Button
						>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{:else}
	<p class="py-3 text-sm text-muted-foreground" data-alerts-empty>
		{status === "open" ? m.energy_alerts_none_open() : m.energy_alerts_none()}
	</p>
{/if}
