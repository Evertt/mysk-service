<!--
	@component
	Plans an order without dragging: a dialog with its engineer, date and time. Calls `onscheduled`
	with the chosen day once the server has saved it. Open while the board's `history` entry is.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import type { HistoryDialog } from "#lib/components/history-dialog.svelte.ts";
	import { getTimeZone } from "#lib/dates.ts";
	import { fittingFirst, specialties } from "#lib/engineers/index.ts";
	import { formatDate } from "#lib/i18n/index.ts";

	import { DEFAULT_TIME, parseDay } from "../board/board.ts";
	import { getSchedule, scheduleOrder } from "../schedule.remote.ts";

	type Schedule = Awaited<ReturnType<typeof getSchedule>>;

	let {
		order,
		engineers,
		week,
		defaultDay,
		history,
		onscheduled,
	}: {
		order: Schedule["orders"][number];
		engineers: Schedule["engineers"];
		/** The board's week (`yyyy-mm-dd`), to refresh along with saving. */
		week: string;
		/** The day to suggest for an order without a date. */
		defaultDay: Temporal.PlainDate;
		/** The dialog's history entry, which the board keeps (it's open while that's there). */
		history: HistoryDialog;
		onscheduled?: (day: Temporal.PlainDate) => void;
	} = $props();

	const form = $derived(scheduleOrder.for(String(order.id)));
	// When the order is planned now, on the user's clock.
	const scheduled = $derived(order.scheduledFor?.toZonedDateTimeISO(getTimeZone()));

	// Those who service the order's units' categories first, first unit first.
	const engineerOptions = $derived(
		fittingFirst(
			engineers.filter((engineer) => engineer.active),
			order.specialties,
		).map((engineer) => ({
			value: String(engineer.id),
			label: engineer.name,
			group: specialties[engineer.specialty].label,
		})),
	);

	function saved() {
		const day = parseDay(form.fields.day.value());
		toast.success(
			day
				? m.schedule_scheduled_for({ number: order.number, date: formatDate(day) })
				: m.schedule_scheduled({ number: order.number }),
		);
		// Before it closes, so it can leave the page from the dialog (see `historyDialog()`).
		if (day) onscheduled?.(day);
	}
</script>

<FormDialog
	{form}
	title={m.schedule_order({ number: order.number })}
	description="{order.customer.name}: {order.description}"
	submitLabel={m.schedule_submit()}
	hidden={{ id: String(order.id) }}
	updates={() => [getSchedule(week)]}
	ondone={saved}
	{history}
	class="sm:max-w-md"
>
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
				value={(scheduled?.toPlainDate() ?? defaultDay).toString()}
			/>
			<TextField
				field={form.fields.time}
				label={m.schedule_field_time()}
				type="time"
				value={scheduled?.toPlainTime().toString({ smallestUnit: "minute" }) ?? DEFAULT_TIME}
			/>
		</div>
	</Field.FieldGroup>
</FormDialog>
