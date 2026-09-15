import type { EditorInstance } from './types'

export interface EditorCacheOptions {
  /**
   * If true, automatically invoke `editor.destroy()` when `deleteEditor`,
   * `clearEditors`, or when overwriting an existing ID in `addEditor`.
   * Defaults to `true` to guarantee no memory leaks in multi-tab applications.
   */
  autoDestroyOnDelete?: boolean
}

/**
 * In-memory registry and lifecycle manager for multi-tab editor instances.
 * Prevents memory leaks by ensuring destroyed/closed tabs cleanly release
 * their CodeMirror 6 EditorView, DOM nodes, and event listeners.
 */
export class EditorCache {
  private cache: Map<string, EditorInstance> = new Map()
  private autoDestroy: boolean

  constructor(options?: EditorCacheOptions) {
    this.autoDestroy = options?.autoDestroyOnDelete ?? true
  }

  /**
   * Register an editor instance by its ID (e.g. tab ID or connection tab key).
   * If an instance already exists for this ID, it is cleanly destroyed first.
   */
  addEditor = (editorId: string, editor: EditorInstance): void => {
    const existing = this.cache.get(editorId)
    if (existing && existing !== editor && this.autoDestroy) {
      existing.destroy()
    }
    this.cache.set(editorId, editor)
  }

  /**
   * Retrieve an editor instance by its ID.
   */
  getEditor = (editorId: string): EditorInstance | undefined => {
    return this.cache.get(editorId)
  }

  /**
   * Check if an editor instance exists for the given ID.
   */
  hasEditor = (editorId: string): boolean => {
    return this.cache.has(editorId)
  }

  /**
   * Remove an editor instance from cache and destroy it to release resources.
   */
  deleteEditor = (editorId: string): boolean => {
    const editor = this.cache.get(editorId)
    if (editor && this.autoDestroy) {
      editor.destroy()
    }
    return this.cache.delete(editorId)
  }

  /**
   * Remove all editor instances from cache and destroy them.
   */
  clearEditors = (): void => {
    if (this.autoDestroy) {
      for (const editor of this.cache.values()) {
        editor.destroy()
      }
    }
    this.cache.clear()
  }

  /**
   * Return the total count of active editor instances in the cache.
   */
  size = (): number => {
    return this.cache.size
  }

  /**
   * Return all currently cached editor IDs.
   */
  keys = (): string[] => {
    return Array.from(this.cache.keys())
  }
}
