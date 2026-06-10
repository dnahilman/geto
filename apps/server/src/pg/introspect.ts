// Moved to db/drivers/postgres/introspect.ts; quoteIdent extracted to
// db/shared/ident.ts. Transitional re-export until callers migrate.
export * from '../db/drivers/postgres/introspect'
export { quoteIdent } from '../db/shared/ident'
