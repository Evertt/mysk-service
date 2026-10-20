<!--
	@component
	The engineer portal's header menu, behind a "more" button at the header's end: who's signed in,
	"Report a problem" (while nothing is recorded), the language, theme and mode, "View as" in the
	SHLTR demo, and signing out. The header keeps beside it only what has a state to see at a glance:
	the bell's dot and, while one is recorded, the recording's.

	Why a "more" button rather than the name or an avatar: the name, with its hard hat, is the link
	to My work, as an app's logo is, and a tap meant to go home shouldn't open a menu; an avatar would
	repeat the name beside it. The same at every width, the desk's phone frame included: the portal
	is one phone-sized column on any screen, and the buttons are where the engineer found them.
-->
<script lang="ts">
	import EllipsisVerticalIcon from "@lucide/svelte/icons/ellipsis-vertical";

	import BugReportMenuItem from "#lib/bug-reports/bug-report-menu-item.svelte";

	import AppearanceSwitchers from "../appearance-switchers.svelte";
	import type { DemoRole } from "../demo-roles.ts";
	import SignOutButton from "../sign-out-button.svelte";
	import ViewAs from "../view-as.svelte";

	let {
		name,
		organization,
		viewAs,
	}: {
		name: string;
		organization: string;
		/** The SHLTR demo's switch (`getViewAs()`), if it's there. */
		viewAs: { current: DemoRole | null } | null;
	} = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" aria-label={m.portal_header_menu()}>
				<EllipsisVerticalIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-60">
		<DropdownMenu.Label class="flex flex-col font-normal">
			<span class="truncate font-medium text-popover-foreground">{name}</span>
			<span class="truncate text-xs text-muted-foreground">{organization}</span>
		</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<BugReportMenuItem />
			<!-- Their choices open under them, over this menu: there's no room beside it on a phone. -->
			<AppearanceSwitchers submenu="below" />
		</DropdownMenu.Group>
		{#if viewAs}
			<!-- The SHLTR demo's switch between its roles (with `DEMO_SIGN_IN` only). -->
			<DropdownMenu.Separator />
			<ViewAs current={viewAs.current} inMenu />
		{/if}
		<DropdownMenu.Separator />
		<SignOutButton menuItem />
	</DropdownMenu.Content>
</DropdownMenu.Root>
