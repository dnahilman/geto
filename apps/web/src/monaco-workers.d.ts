// Worker-internal monaco modules have no shipped type declarations.
declare module 'monaco-editor/esm/vs/editor/editor.worker' {
  export function initialize(
    foreignModule: (ctx: unknown, createData: unknown) => unknown,
  ): void
}
declare module 'monaco-sql-languages/esm/languages/pgsql/PgSQLWorker' {
  export const PgSQLWorker: new (ctx: unknown, createData: unknown) => unknown
}
