import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { defineConfig } from 'bumpp'

export default defineConfig({
  files: [
    'package.json',
    'apps/desktop/package.json',
  ],
  commit: 'chore: release v{version}',
  tag: 'v{version}',
  push: false,
  all: true,
  confirm: true,
  execute: async (config) => {
    const newVersion = config.state.newVersion
    const rootDir = process.cwd()
    const cargoPath = resolve(rootDir, 'Cargo.toml')

    // 1. Update [workspace.package].version in root Cargo.toml
    let cargoContent = readFileSync(cargoPath, 'utf-8')
    const workspaceVersionRegex = /(\[workspace\.package\][^[]*?version\s*=\s*)"[^"]+"/
    if (workspaceVersionRegex.test(cargoContent)) {
      cargoContent = cargoContent.replace(workspaceVersionRegex, `$1"${newVersion}"`)
      writeFileSync(cargoPath, cargoContent, 'utf-8')
      console.log(`[bump] Updated Cargo.toml workspace version to ${newVersion}`)
    }

    // 2. Update Cargo.lock & verify workspace compilation
    console.log('[bump] Updating Cargo.lock & checking workspace...')
    const checkResult = spawnSync('cargo', ['check', '--workspace'], { cwd: rootDir, stdio: 'inherit' })
    if (checkResult.status !== 0) {
      console.error('[bump] Cargo check failed!')
      process.exit(checkResult.status ?? 1)
    }

    // 3. Stage Cargo files for the commit
    spawnSync('git', ['add', 'Cargo.toml', 'Cargo.lock'], { cwd: rootDir, stdio: 'inherit' })
  },
})
