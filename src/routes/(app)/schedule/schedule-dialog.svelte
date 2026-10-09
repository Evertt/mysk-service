<!--
	@component
	Plans an order without dragging: a dialog with its engineer, date and time. Calls `onscheduled`
	with the chosen day once the server has saved it.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { timeOfDay } from "#lib/dates.ts";
	import { specialties } from "#lib/engineers/display.ts";
	import { formatDate } from "#lib/i18n";

	import { DEFAULT_TIME, dayKey, parseDay } from "./board.ts";
	import { getSchedule, scheduleOrder } from "./schedule.remote.ts";

	type Schedule = Awaited<ReturnType<typeof getSchedule>>;

	let {
		order,
		engineers,
		week,
		defaultDay,
		open = $bindable(false),
		onscheduled,
	}: {
		order: Schedule["orders"][number];
		engineers: Schedule["engineers"];
		/** The board's week (`yyyy-mm-dd`), to refresh along with saving. */
		week: string;
		/** The day to suggest for an order without a date. */
		defaultDay: Date;
		open?: boolean;
		onscheduled?: (day: Date) => void;
	} = $props();

	const form = $derived(scheduleOrder.for(String(order.id)));

	const engineerOptions = $derived(
		engineers
			.filter((engineer) => engineer.active)
			.map((engineer) => ({
				value: String(engineer.id),
				label: engineer.name,
				group: specialties[engineer.specialty].label,
			})),
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.schedule_order({ number: order.number })}</Dialog.Title>
			<Dialog.Description>{order.customer.name}: {order.description}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (!(await submit().updates(getSchedule(week)))) return;
				const day = parseDay(form.fields.day.value());
				open = false;
				toast.success(
					day
						? m.schedule_scheduled_for({ number: order.number, date: formatDate(day) })
						: m.schedule_scheduled({ number: order.number }),
				);
				if (day) onscheduled?.(day);
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.id.as("hidden", String(order.id))} />
			<Field.FieldGroup>
				<SelectField
					field={form.fields.engineerId}
					label={m.schedule_field_engineer()}
					placeholder={m.common_unassigned()}
					value={order.engineerId ? String(order.engineerId) : ""}
					options={engineerOptions}
				/>
				<div class="grid grid-cols-2 gap-4">
					<TextField
						field={form.fields.day}
						label={m.schedule_field_date()}
						type="date"
						value={dayKey(order.scheduledFor ?? defaultDay)}
					/>
					<TextField
						field={form.fields.time}
						label={m.schedule_field_time()}
						type="time"
						value={order.scheduledFor ? timeOfDay(order.scheduledFor) : DEFAULT_TIME}
					/>
				</div>
			</Field.FieldGroup>
			<!-- E.g. when the order was completed in the meantime. -->
			<Field.FieldError errors={form.fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.schedule_submit()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
