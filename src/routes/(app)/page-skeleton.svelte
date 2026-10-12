<!--
	@component
	What an office page shows while its data loads: the shape of a `PageHeader` and two cards.
-->
<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-4">
		<Skeleton class="h-4 w-40" />
		<div class="flex flex-col gap-2">
			<Skeleton class="h-8 w-56" />
			<Skeleton class="h-5 w-80 max-w-full" />
		</div>
	</div>
	<div class="grid gap-6 lg:grid-cols-3">
		<Skeleton class="h-64 lg:col-span-2" />
		<Skeleton class="h-64" />
	</div>
</div>
