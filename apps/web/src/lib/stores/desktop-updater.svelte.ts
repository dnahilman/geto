import { isTauri } from '$lib/api/transport'
import { toast } from 'svelte-sonner'

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error'

class DesktopUpdater {
  status = $state<UpdateStatus>('idle')
  version = $state<string | null>(null)
  private hasChecked = false

  /**
   * Check for updates once upon application startup.
   * Runs only inside the Tauri desktop app after a 5-second post-boot delay.
   */
  async checkOnStartup(): Promise<void> {
    if (!isTauri() || this.hasChecked) return
    this.hasChecked = true

    // Wait 5s post-boot so initial rendering and database initialization are instantaneous
    await new Promise((resolve) => setTimeout(resolve, 5000))

    try {
      this.status = 'checking'
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (update) {
        this.status = 'downloading'
        this.version = update.version

        const toastId = 'geto-updater'
        toast.loading(`Mengunduh pembaruan v${update.version} di latar belakang...`, {
          id: toastId,
          duration: Infinity,
          cancel: {
            label: 'Tutup',
            onClick: () => {},
          },
        })

        // Download and stage the update package in the background
        await update.downloadAndInstall()

        this.status = 'ready'

        // Transform toast to ready state with custom Restart and Nanti action buttons
        toast.success(`Pembaruan v${update.version} siap dipasang!`, {
          id: toastId,
          description: 'Restart aplikasi untuk menerapkan versi terbaru.',
          duration: Infinity,
          action: {
            label: 'Restart Sekarang',
            onClick: () => {
              void this.relaunch()
            },
          },
          cancel: {
            label: 'Nanti',
            onClick: () => {},
          },
        })
      } else {
        this.status = 'idle'
      }
    } catch (err) {
      // In development mode, offline, or before release keys are signed, catch gracefully
      console.warn('[desktop-updater] Update check skipped or failed:', err)
      this.status = 'idle'
    }
  }

  /**
   * Relaunch the desktop application to apply the staged update.
   */
  async relaunch(): Promise<void> {
    if (!isTauri()) return
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err) {
      console.error('[desktop-updater] Failed to relaunch application:', err)
      toast.error('Gagal me-restart aplikasi. Silakan tutup dan buka kembali Geto secara manual.')
    }
  }
}

export const desktopUpdater = new DesktopUpdater()
