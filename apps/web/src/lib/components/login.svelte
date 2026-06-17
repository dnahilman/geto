<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import * as Card from '$lib/components/ui/card'

  let password = $state('')
  let error = $state(false)

  async function submit(e: Event) {
    e.preventDefault()
    error = false
    const ok = await auth.login(password)
    if (!ok) error = true
  }
</script>

<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="w-full max-w-sm">
    <Card.Header class="items-center">
      <img src="/logo.svg" alt="geto" class="mb-1 h-10 w-auto invert" />
      <Card.Description>Enter the access password to continue.</Card.Description>
    </Card.Header>
    <form onsubmit={submit}>
      <Card.Content class="space-y-2">
        <Input
          type="password"
          placeholder="Password"
          bind:value={password}
          autocomplete="current-password"
          aria-invalid={error}
        />
        {#if error}
          <p class="text-destructive text-sm">Invalid password.</p>
        {/if}
      </Card.Content>
      <Card.Footer class="mt-4">
        <Button type="submit" class="w-full" disabled={auth.loading}>
          {auth.loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </Card.Footer>
    </form>
  </Card.Root>
</div>
