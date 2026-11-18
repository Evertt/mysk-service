<!--
	The customer portal's More tab, as a phone app's: who's signed in, for which customer and at whose
	portal; the pages of the tenant's modules (e.g. energy, the parts shop, the partner bonus); the
	language, theme and mode; "View as" in the SHLTR demo; and signing out.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	import { getCurrentUser, getTenantModules } from "#lib/auth/session.remote.ts";
	import AppBar from "#lib/client/app-bar.svelte";

	import AppearanceSwitchers from "../../../appearance-switchers.svelte";
	import { getViewAs } from "../../../demo.remote.ts";
	import SignOutButton from "../../../sign-out-button.svelte";
	import ViewAs from "../../../view-as.svelte";
	import { portalModulePages } from "../../module-pages.ts";

	const [me, tenantModules, viewAs] = $derived(
		await Promise.all([getCurrentUser(), getTenantModules(), getViewAs()]),
	);
	const pages = $derived(portalModulePages(tenantModules));
	const initials = $derived(
		me.name
			.split(/\s+/)
			.filter(Boolean)
			.map((word) => word[0])
			.slice(0, 2)
			.join("")
			.toUpperCase(),
	);
</script>

<AppBar title={m.client_tab_more()} />

<section
	class="flex items-center gap-4 rounded-xl border bg-card p-4"
	aria-label={m.client_more_account()}
	data-more-account
>
	<span
		class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/12 text-base font-semibold text-primary"
		aria-hidden="true"
	>
		{initials}
	</span>
	<span class="flex min-w-0 flex-col gap-0.5">
		<span class="truncate text-[1.0625rem] font-semibold">{me.name}</span>
		{#if me.customer}
			<span class="truncate text-[0.9375rem]">{me.customer}</span>
		{/if}
		<span class="truncate text-sm text-muted-foreground">
			{m.client_more_portal_of({ organization: me.organization })}
		</span>
	</span>
</section>

{#if pages.length}
	<nav class="flex flex-col gap-2" aria-label={m.client_more_services()}>
		<h2 class="section-label px-1">{m.client_more_services()}</h2>
		<ul class="divide-y overflow-hidden rounded-xl border bg-card">
			{#each pages as entry (entry.id)}
				<li>
					<a
						href={resolve(entry.route)}
						class="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted"
						data-more-page={entry.id}
					>
						<span
							class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
						>
							<entry.icon class="size-5" aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{entry.label()}</span
						>
						<ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}

<section class="flex flex-col gap-2" aria-label={m.client_more_settings()}>
	<h2 class="section-label px-1">{m.client_more_settings()}</h2>
	<ul class="divide-y overflow-hidden rounded-xl border bg-card">
		<li class="flex min-h-14 items-center justify-between gap-3 py-1.5 pr-2 pl-4">
			<span class="text-[0.9375rem] font-medium">{m.client_more_appearance()}</span>
			<span class="flex items-center" data-more-appearance>
				<AppearanceSwitchers />
			</span>
		</li>
		{#if viewAs}
			<li class="flex min-h-14 items-center justify-between gap-3 py-1.5 pr-2 pl-4">
				<span class="text-[0.9375rem] font-medium">{m.auth_view_as()}</span>
				<ViewAs current={viewAs.current} />
			</li>
		{/if}
		<li><SignOutButton /></li>
	</ul>
</section>
