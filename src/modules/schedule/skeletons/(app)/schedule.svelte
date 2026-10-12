<!--
	@component
	What the schedule shows while it loads: its header with the week's
	buttons, the week's grid of engineers by day, and the backlog beside it; below `lg`, where the
	board is a list of days, a few days.
-->
<div class="flex flex-col gap-6 lg:desktop:h-full">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex flex-col gap-2">
			<Skeleton class="h-8 w-40" />
			<Skeleton class="h-5 w-72 max-w-full" />
		</div>
		<div class="flex items-center gap-2">
			<Skeleton class="size-9" />
			<Skeleton class="h-9 w-24" />
			<Skeleton class="size-9" />
		</div>
	</div>
	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
		<div class="hidden overflow-hidden rounded-lg border lg:block">
			<div class="grid grid-cols-[8rem_repeat(7,minmax(6rem,1fr))]">
				<div class="h-10 border-e border-b"></div>
				{#each { length: 7 }, day (day)}
					<div class={["border-b p-2", day > 0 && "border-s"]}>
						<Skeleton class="h-5 w-12" />
					</div>
				{/each}
				{#each { length: 6 }, row (row)}
					<div class={["flex flex-col gap-1.5 border-e p-2", row > 0 && "border-t"]}>
						<Skeleton class="h-4 w-20" />
						<Skeleton class="h-3 w-14" />
					</div>
					{#each { length: 7 }, day (day)}
						<div class={["h-20 p-1.5", row > 0 && "border-t", day > 0 && "border-s"]}>
							{#if (row + day) % 3 === 0}
								<Skeleton class="h-10" />
							{/if}
						</div>
					{/each}
				{/each}
			</div>
		</div>
		<div class="flex flex-col gap-4 lg:hidden">
			{#each { length: 3 }, day (day)}
				<Skeleton class="h-28" />
			{/each}
		</div>
		<div class="flex flex-col gap-3 rounded-xl border p-4">
			<Skeleton class="h-5 w-24" />
			<Skeleton class="h-4 w-40" />
			{#each { length: 5 }, card (card)}
				<Skeleton class="h-14" />
			{/each}
		</div>
	</div>
</div>
