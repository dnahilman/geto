export { default as QueryEditor } from './query-editor.svelte'
export * from './context'

// Re-export core types for easy access from apps/web
export type {
  EditorInstance,
  EditorMetadata,
  SQLMetadata,
  SQLMetadataTable,
  SQLMetadataColumn,
  SQLMetadataFunction,
  SQLMetadataForeignKey,
  MongoMetadata,
  RedisMetadata,
  SupportedLanguage,
  StatementRange,
  SQLDialect,
} from '@geto/editor'
