/**
 * Copy text to the clipboard, working over plain HTTP too.
 *
 * The async Clipboard API (`navigator.clipboard`) is only available in a secure
 * context (HTTPS or localhost). geto is commonly self-hosted over plain HTTP on a
 * LAN/Tailscale, where `navigator.clipboard` is `undefined`. We try it first when
 * present, then fall back to the legacy `<textarea>` + `execCommand('copy')` path.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // fall through to the legacy path (e.g. permission/secure-context quirks)
    }
  }

  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Copy command was rejected')
  } finally {
    document.body.removeChild(ta)
  }
}
