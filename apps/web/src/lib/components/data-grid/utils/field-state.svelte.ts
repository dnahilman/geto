export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error

  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message
    if (typeof message === 'string') return message
  }

  return String(error)
}

export type FieldWithMeta = {
  state: {
    meta: {
      isTouched: boolean
      isBlurred: boolean
      isDirty: boolean
      isPristine?: boolean
      isDefaultValue?: boolean
      errors: Array<unknown>
    }
  }
}

export function useFieldMeta(fieldOrGetter: FieldWithMeta | (() => FieldWithMeta)) {
  const getField = typeof fieldOrGetter === 'function' ? fieldOrGetter : () => fieldOrGetter
  const meta = $derived(getField().state.meta)

  const hasError = $derived(Boolean((meta.isTouched || meta.isBlurred) && meta.errors.length > 0))

  // Official TanStack Form non-persistent dirty state (RHF / Formik behavior)
  const isDirty = $derived(
    meta.isDefaultValue !== undefined ? !meta.isDefaultValue : Boolean(meta.isDirty),
  )

  const errorMessage = $derived(hasError ? meta.errors.map(getErrorMessage).join(', ') : '')

  const statusClass = $derived(hasError ? 'cell-error' : isDirty ? 'cell-dirty' : 'cell-pristine')

  return {
    get hasError() {
      return hasError
    },
    get isDirty() {
      return isDirty
    },
    get errorMessage() {
      return errorMessage
    },
    get statusClass() {
      return statusClass
    },
  }
}
