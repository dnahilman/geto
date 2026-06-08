// Vite-compatible pgSQL worker entry.
//
// monaco-sql-languages' bundled `pgsql.worker` defers `initialize()` until after
// a dummy first message (webpack worker-loader sends one; Vite does not), so the
// worker host is never created → "Missing requestHandler: doCompletionWithEntities".
// Calling `initialize` at top level matches monaco's single-message protocol.
import { initialize } from 'monaco-editor/esm/vs/editor/editor.worker'
import { PgSQLWorker } from 'monaco-sql-languages/esm/languages/pgsql/PgSQLWorker'

initialize((ctx, createData) => new PgSQLWorker(ctx, createData))
