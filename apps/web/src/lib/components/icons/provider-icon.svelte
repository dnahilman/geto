<script lang="ts">
  import { Database } from 'lucide-svelte'
  import PostgresIcon from './postgres-icon.svelte'
  import MysqlIcon from './mysql-icon.svelte'

  interface Props {
    provider?: string
    class?: string
  }

  let { provider = '', class: className = 'size-3.5' }: Props = $props()

  const normalized = $derived(provider.toLowerCase().trim())
</script>

{#if normalized === 'postgres' || normalized === 'postgresql'}
  <PostgresIcon class={className} />
{:else if normalized === 'mysql' || normalized === 'mysql2'}
  <MysqlIcon class={className} />
{:else if normalized === 'sqlite'}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
  >
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L3 12.5V21h8.5z" />
    <path d="M16 8L2 22" />
    <path d="M17.5 15H9" />
  </svg>
{:else if normalized === 'duckdb'}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
  >
    <path
      d="M7 14c-2.5 0-4-1.5-4-4 0-3 3-5 7-5 2.5 0 4.5 1 5.5 2.5L19 7c1 0 2 1 2 2s-1 2-2.5 2.2c-.3 1.5-1.5 2.8-3 3.3L15 15c0 3-2 5-6 5-4 0-5.5-2-5.5-3.5 0-.5.5-1 1.5-1h2z"
    />
    <circle cx="13" cy="8.5" r="1" fill="currentColor" />
  </svg>
{:else if normalized === 'redis'}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
  >
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
{:else if normalized === 'clickhouse'}
  <svg viewBox="0 0 24 24" fill="currentColor" class={className}>
    <rect x="2" y="9" width="2.5" height="6" rx="1" />
    <rect x="6" y="6" width="2.5" height="12" rx="1" />
    <rect x="10" y="4" width="2.5" height="16" rx="1" />
    <rect x="14" y="2" width="2.5" height="20" rx="1" />
    <rect x="18" y="7" width="2.5" height="10" rx="1" />
  </svg>
{:else if normalized === 'turso' || normalized === 'libsql'}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
  >
    <path
      d="M12 3c-4.97 0-9 4.03-9 9 0 3.53 2.04 6.58 5 8.05V15.5c-1.16-.41-2-1.52-2-2.83 0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.31-.84 2.42-2 2.83v4.55c2.96-1.47 5-4.52 5-8.05 0-4.97-4.03-9-9-9z"
    />
  </svg>
{:else}
  <Database class={className} />
{/if}
