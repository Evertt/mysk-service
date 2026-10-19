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
	import LogOutIcon from "@lucide/svelte/icons/log-out";

	import BugReportMenuItem from "#lib/bug-reports/bug-report-menu-item.svelte";
	import LanguageSwitcher from "#lib/i18n/language-switcher.svelte";
	import ModeSwitcher from "#lib/themes/mode-switcher.svelte";
	import ThemeSwitcher from "#lib/themes/theme-switcher.svelte";

	import type { DemoRole } from "../demo-roles.ts";
	import ViewAs from "../view-as.svelte";
	import { signOut } from "./my/portal.remote.ts";

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
			<LanguageSwitcher submenu="below" />
			<ThemeSwitcher submenu="below" />
			<ModeSwitcher submenu="below" />
		</DropdownMenu.Group>
		{#if viewAs}
			<!-- The SHLTR demo's switch between its roles (with `DEMO_SIGN_IN` only). -->
			<DropdownMenu.Separator />
			<ViewAs current={viewAs.current} inMenu />
		{/if}
		<DropdownMenu.Separator />
		<!-- A plain form submission, not enhanced: the page's queries and live queries belong to the
			session that ends, so the login page loads afresh rather than this page refreshing them
			signed out (which logged errors). -->
		<form method={signOut.method} action={signOut.action}>
			<DropdownMenu.Group>
				<!-- Keep the menu open while signing out, so the form stays mounted until the browser leaves. -->
				<DropdownMenu.Item onSelect={(event) => event.preventDefault()}>
					{#snippet child({ props })}
						<button {...props} type="submit" class={[props.class, "w-full"]}>
							<LogOutIcon />
							{m.common_sign_out()}
						</button>
					{/snippet}
				</DropdownMenu.Item>
			</DropdownMenu.Group>
		</form>
	</DropdownMenu.Content>
</DropdownMenu.Root>
