// Split into db/shared/marshal.ts (pure types/marshalling) and
// db/drivers/postgres/exec.ts (executeSql). Transitional re-export until callers migrate.
export * from '../db/shared/marshal'
export { executeSql } from '../db/drivers/postgres/exec'
