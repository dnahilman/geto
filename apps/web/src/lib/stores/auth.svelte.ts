import { client } from '$lib/api/eden'

class AuthState {
  authenticated = $state(false)
  checked = $state(false)
  loading = $state(false)

  async check() {
    const { data } = await client.api.auth.me.get()
    this.authenticated = data?.authenticated ?? false
    this.checked = true
  }

  async login(password: string): Promise<boolean> {
    this.loading = true
    try {
      const { data, error } = await client.api.auth.login.post({ password })
      if (error) return false
      this.authenticated = data?.authenticated ?? false
      return this.authenticated
    } finally {
      this.loading = false
    }
  }

  async logout() {
    await client.api.auth.logout.post()
    this.authenticated = false
  }
}

export const auth = new AuthState()
