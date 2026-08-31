import { createFormCreator } from '@tanstack/svelte-form'
import TextGridField from '../cells/text-grid-field.svelte'
import NumberGridField from '../cells/number-grid-field.svelte'
import SelectGridField from '../cells/select-grid-field.svelte'
import DateTimeGridField from '../cells/date-time-grid-field.svelte'
import BooleanGridField from '../cells/boolean-grid-field.svelte'
import DateGridField from '../cells/date-grid-field.svelte'
import JsonGridField from '../cells/json-grid-field.svelte'
import SubmitButton from '../toolbar/submit-button.svelte'
import DiscardButton from '../toolbar/discard-button.svelte'

export const { createAppForm: createGridForm, getFormType: getGridFormType } = createFormCreator({
  fieldComponents: {
    TextGridField,
    NumberGridField,
    SelectGridField,
    DateTimeGridField,
    BooleanGridField,
    DateGridField,
    JsonGridField,
  },
  formComponents: {
    SubmitButton,
    DiscardButton,
  },
})
