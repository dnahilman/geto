import { client } from '$lib/api/client'
import { isTauri } from '$lib/api/transport'

class AuthState {
  authenticated = $state(false)
  checked = $state(false)
  loading = $state(false)

  async check() {
    // Desktop mode does not require authentication
    if (isTauri()) {
      this.authenticated = true
      this.checked = true
      return
    }

    try {
      const { data } = await client.GET('/api/auth/me')
      this.authenticated = data?.authenticated ?? false
    } catch {
      this.authenticated = false
    } finally {
      this.checked = true
    }
  }

  async login(password: string): Promise<boolean> {
    if (isTauri()) {
      this.authenticated = true
      return true
    }

    this.loading = true
    try {
      const { data, error } = await client.POST('/api/auth/login', { body: { password } })
      if (error) return false
      this.authenticated = data?.authenticated ?? false
      return this.authenticated
    } finally {
      this.loading = false
    }
  }

  async logout() {
    if (isTauri()) {
      return
    }

    await client.POST('/api/auth/logout')
    this.authenticated = false
  }
}

export const auth = new AuthState()
