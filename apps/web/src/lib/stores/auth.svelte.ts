import { client } from '$lib/api/client'

class AuthState {
  authenticated = $state(false)
  checked = $state(false)
  loading = $state(false)

  async check() {
    const { data } = await client.GET('/api/auth/me')
    this.authenticated = data?.authenticated ?? false
    this.checked = true
  }

  async login(password: string): Promise<boolean> {
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
    await client.POST('/api/auth/logout')
    this.authenticated = false
  }
}

export const auth = new AuthState()
