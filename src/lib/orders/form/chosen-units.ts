/**
 * The units chosen in the order form, in their order: the form's `equipmentIds` (`value`), or the
 * order's own units (`initial`) until the field has a value. With all of them taken off, none:
 * not the order's again.
 */
export const chosenUnitIds = (
	value: readonly string[] | undefined,
	initial: readonly number[],
): number[] => (value ? value.map(Number) : [...initial]);
