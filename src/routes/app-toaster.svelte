<!--
	@component
	Where the app's notifications (`toast()`) show: once per page, in the root layout, except in the
	engineer portal, whose shell has its own inside the phone it's shown in on a desk's screen. Never
	on paper.
-->
<div class="contents print:hidden">
	<Toaster
		richColors
		closeButton
		containerAriaLabel={m.common_notifications()}
		closeButtonAriaLabel={m.common_close_notification()}
	/>
</div>
