<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Copy } from 'lucide-svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Button } from '$lib/components/ui/button'
  import { copyText } from '$lib/clipboard'
  import { prettyHtml } from '$lib/json'

  // Read-only pretty-printed JSON viewer. `value` is the already-parsed object/array.
  let {
    open = $bindable(false),
    value,
    title = 'JSON',
  }: { open?: boolean; value: unknown; title?: string } = $props()

  async function copy() {
    try {
      await copyText(JSON.stringify(value ?? null, null, 2))
      toast.success('Copied JSON')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        {title}
        <Button variant="ghost" size="icon" class="size-7" title="Copy JSON" onclick={copy}>
          <Copy class="size-4" />
        </Button>
      </Dialog.Title>
    </Dialog.Header>
    <pre
      class="max-h-[70vh] overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed">{@html prettyHtml(
        value,
      )}</pre>
  </Dialog.Content>
</Dialog.Root>
