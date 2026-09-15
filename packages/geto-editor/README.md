# @geto/editor

A modular, framework-agnostic, and database-agnostic CodeMirror 6 query editor built for the Geto database client (inspired by DataGrip).

---

## 🏛️ Architecture: Language vs Metadata

The editor strictly separates two core dimensions:
1. **Language**: Handles tokenization, syntax highlighting, Lezer grammar, dialect parsing, indentation, formatting, and statement splitting.
2. **Metadata**: Manages database entities (tables, columns, foreign key relations, functions, collections) cached per instance to power autocompletion and linting.

```
                    query-editor
                         │
             ┌───────────┴───────────┐
             │                       │
          Language                Metadata
             │                       │
      ┌──────┼──────┐          ┌─────┼─────┐
      │      │      │          │     │     │
     SQL   Mongo   Redis      SQL   Mongo  Redis
```

---

## 🎯 12 DataGrip Best Practices

1. **Database-Agnostic Core**: The core only manages CodeMirror 6 view, state, history, selection, shortcuts, and dynamic compartments. SQL, MongoDB, and Redis dialects act as language providers.
2. **Autocomplete ≠ Formatter**: Autocomplete inserts tokens directly as structured uppercase keywords (e.g. `fro` → `FROM`, `whe` → `WHERE`, `ord` → `ORDER BY`). It never aggressively alters or reformats text outside the chosen completion.
3. **Completion-Driven Keyword Casing**: Rather than aggressive realtime auto-uppercase on every keystroke/delimiter, keyword casing is guided cleanly by completion sources. Typing `sel` suggests `SELECT`, `fro` suggests `FROM`, leaving user typing flow smooth, predictable, and non-intrusive.
4. **Context-Aware Autocomplete**:
   - `SELECT u.` → columns belonging to alias `u`
   - `FROM ` → tables and views
   - `JOIN ... ON` → automated Foreign Key join conditions
5. **Schema Caching**: Schema definitions and derived lookup indices are cached per metadata instance. Schema structure is never recalculated on every keystroke.
6. **Separation of Linting**:
   - **Parser lint**: Fast local diagnostics (unclosed quotes, invalid syntax, mismatched parentheses) via `@codemirror/lint`.
   - **Database lint**: Asynchronous validation handled by the backend Rust/database engine.
7. **Explicit Formatting Only**: Formatting is executed only on explicit user actions (button click or shortcut like `Shift-Alt-F`), never automatically while typing.
8. **Dialect as a Provider**: PostgreSQL, MySQL, and SQLite each have dedicated dialect parsers, keywords, and configurations.
9. **Debouncing Expensive Operations**: Linters and heavy parsing operations are debounced.
10. **Minimalist Public API**:
    ```ts
    editor.getValue(): string
    editor.setValue(text: string): void
    editor.getSelectedOrAll(): string
    editor.focus(): void
    editor.format(): void
    editor.destroy(): void
    ```
11. **Database Logic Kept Outside**: The editor does not execute database queries directly. Interaction with the Tauri/Rust backend occurs externally via event handlers (`onRun`, `onRunStatement`).
12. **Multi-Tab Isolation & Memory Leak Prevention**: Every tab maintains an independent `EditorState`. Equipped with `EditorCache` to cleanly release memory and DOM listeners when tabs are closed.

---

## 📦 Directory Structure

```
packages/geto-editor/
├── README.md
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    │
    ├── core/
    │   ├── create-editor.ts      # createEditor() factory & controller
    │   ├── extensions.ts         # Base extensions bundle (numbers, history, theme)
    │   ├── state.ts              # Compartment manager & custom state fields
    │   ├── cache.ts              # EditorCache (Multi-tab management & memory leak guard)
    │   └── types.ts              # Type definitions
    │
    ├── languages/
    │   ├── sql/
    │   │   ├── language.ts       # SQL language extension, statement splitter, run-gutter
    │   │   ├── dialect.ts        # PostgreSQL, MySQL, SQLite dialect resolvers
    │   │   └── formatter.ts      # Explicit SQL formatter
    │   │
    │   ├── mongodb/              # [Next Update] Placeholder interfaces & stubs
    │   │   ├── language.ts
    │   │   └── formatter.ts
    │   │
    │   └── redis/                # [Next Update] Placeholder interfaces & stubs
    │       ├── language.ts
    │       └── formatter.ts
    │
    ├── autocomplete/
    │   ├── completion.ts         # Context-aware autocomplete source
    │   ├── keywords.ts           # Reserved keywords & quoting rules
    │   └── schema.ts             # Metadata store & index lookup
    │
    ├── lint/
    │   └── lint.ts               # Local parser linting
    │
    └── plugins/
        └── shortcuts.ts          # Keyboard shortcuts (Mod-Enter, Shift-Alt-F, Ctrl-Alt-L)
```

---

## 🗺️ Roadmap & Milestones

- [x] **Milestone 1: Package Initialization & Workspace Setup**
  - Setup monorepo workspace & `@geto/editor` package manifest.
  - TypeScript `tsconfig.json` configuration.
  - Architecture and best practices documentation.
- [x] **Milestone 2: Agnostic Core & EditorCache**
  - Type contracts (`types.ts`).
  - `EditorCache` with auto-destroy to prevent memory leaks.
  - Base extensions bundle & VS Code Dark theme.
  - `createEditor` factory & state compartment manager.
- [x] **Milestone 3: SQL Language Provider & Statements**
  - Dialect resolver (StandardSQL fallback, PostgreSQL, MySQL, SQLite, MSSQL).
  - Explicit SQL formatter wrapper (`sql-formatter`).
  - AST statement splitter & run-statement gutter (▶).
  - MongoDB & Redis language stubs.
- [x] **Milestone 4: Autocomplete, Metadata, & Linting**
  - Metadata schema store & derived index caching with `WeakMap`.
  - Context-aware completion (columns, tables, joins, functions).
  - Completion-driven uppercase keywords (`fro` → `FROM`, `whe` → `WHERE`, `ord` → `ORDER BY`).
  - DataGrip-style automatic trailing space on completion acceptance.
  - Local parser linting with `@codemirror/lint` (unclosed quotes/parens, debounced).
- [x] **Milestone 5: Plugins & Public Exports**
  - Shortcuts plugin (`Mod-Enter`, `Shift-Alt-F`, `Ctrl-Alt-L`).
  - Public barrel export in `src/index.ts`.
  - Automated unit test suite with `bun test` (17 tests passing).
  - Verification with `tsc --noEmit` & `eslint`.
