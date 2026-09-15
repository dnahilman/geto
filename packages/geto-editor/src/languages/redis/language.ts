import { autocompletion, type CompletionSource } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'

export interface RedisLanguageOptions {
  completionSource?: CompletionSource
}

/**
 * Redis command language extension.
 * Provides autocompletion for Redis commands and keys while maintaining
 * standard line-based command execution.
 */
export function createRedisLanguageExtension(options: RedisLanguageOptions = {}): Extension[] {
  const extensions: Extension[] = []
  if (options.completionSource) {
    extensions.push(
      autocompletion({
        override: [options.completionSource],
        activateOnTyping: true,
        icons: true,
      }),
    )
  }
  return extensions
}
