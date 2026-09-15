import type { Extension } from '@codemirror/state'

export interface MongoLanguageOptions {
  // Placeholder options for future MongoDB query language configuration
  collectionSuggestions?: boolean
}

/**
 * MongoDB MQL / Shell language extension stub (scheduled for future update).
 */
export function createMongoLanguageExtension(_options: MongoLanguageOptions = {}): Extension[] {
  return []
}
