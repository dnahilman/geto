/** Quote a SQL identifier safely (defends dynamic schema/table/column names).
 *  Double-quote style is shared by PostgreSQL and SQLite; MySQL (backticks) will
 *  override this on its own driver when added. */
export function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}
