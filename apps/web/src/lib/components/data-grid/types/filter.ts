export type SqlFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'is_null'
  | 'is_not_null'
  | 'is_empty'
  | 'is_not_empty'

export interface TableFilterRule {
  id: string
  column: string
  operator: SqlFilterOperator
  value: string
}

export interface TableFilterGroup {
  conjunction: 'AND' | 'OR'
  rules: TableFilterRule[]
}

export interface FilterOperatorMeta {
  value: SqlFilterOperator
  label: string
  sql: string
  requiresValue: boolean
}

export const SQL_FILTER_OPERATORS: FilterOperatorMeta[] = [
  { value: 'equals', label: 'equals', sql: '=', requiresValue: true },
  { value: 'not_equals', label: 'not equals', sql: '!=', requiresValue: true },
  { value: 'contains', label: 'contains', sql: 'LIKE %...%', requiresValue: true },
  { value: 'not_contains', label: 'does not contain', sql: 'NOT LIKE', requiresValue: true },
  { value: 'starts_with', label: 'starts with', sql: 'LIKE ...%', requiresValue: true },
  { value: 'ends_with', label: 'ends with', sql: 'LIKE %...', requiresValue: true },
  { value: 'greater_than', label: 'greater than', sql: '>', requiresValue: true },
  {
    value: 'greater_than_or_equal',
    label: 'greater than or equal',
    sql: '>=',
    requiresValue: true,
  },
  { value: 'less_than', label: 'less than', sql: '<', requiresValue: true },
  { value: 'less_than_or_equal', label: 'less than or equal', sql: '<=', requiresValue: true },
  { value: 'is_null', label: 'is null', sql: 'IS NULL', requiresValue: false },
  { value: 'is_not_null', label: 'is not null', sql: 'IS NOT NULL', requiresValue: false },
  { value: 'is_empty', label: 'is empty', sql: "= ''", requiresValue: false },
  { value: 'is_not_empty', label: 'is not empty', sql: "!= ''", requiresValue: false },
]

export function operatorRequiresValue(op: SqlFilterOperator): boolean {
  const meta = SQL_FILTER_OPERATORS.find((m) => m.value === op)
  return meta ? meta.requiresValue : true
}

/** Check if a rule is completely configured and ready to be sent to the backend. */
export function isRuleActive(rule: TableFilterRule): boolean {
  if (!rule.column || !rule.column.trim()) return false
  if (!operatorRequiresValue(rule.operator)) return true
  return rule.value.trim() !== ''
}

/** Get only the active rules from a filter group. */
export function getActiveFilterGroup(group?: TableFilterGroup | null): TableFilterGroup | null {
  if (!group || !group.rules) return null
  const activeRules = group.rules.filter(isRuleActive)
  if (activeRules.length === 0) return null
  return {
    conjunction: group.conjunction || 'AND',
    rules: activeRules,
  }
}
