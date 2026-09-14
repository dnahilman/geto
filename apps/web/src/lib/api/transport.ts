import { isTauri, invoke } from '@tauri-apps/api/core'

export { isTauri }

/**
 * Execute a backend action via Tauri IPC when running inside the desktop app,
 * or fall back to HTTP REST fetch when running in the browser or Docker.
 */
export async function execute<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  httpFallback: () => Promise<T>,
): Promise<T> {
  if (isTauri()) {
    try {
      return await invoke<T>(command, args)
    } catch (err) {
      if (err instanceof Error) {
        throw err
      }
      const message =
        typeof err === 'string'
          ? err
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err)
      throw new Error(message || 'Command execution failed', { cause: err })
    }
  }
  return httpFallback()
}
