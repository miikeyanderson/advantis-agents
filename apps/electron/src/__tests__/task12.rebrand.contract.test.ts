import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

const builder = readFileSync('/Users/mikeyanderson/advantis-agents/apps/electron/electron-builder.yml', 'utf8')
const windowManager = readFileSync('/Users/mikeyanderson/advantis-agents/apps/electron/src/main/window-manager.ts', 'utf8')
const electronPackage = readFileSync('/Users/mikeyanderson/advantis-agents/apps/electron/package.json', 'utf8')
const readme = readFileSync('/Users/mikeyanderson/advantis-agents/README.md', 'utf8')
const appMenu = readFileSync('/Users/mikeyanderson/advantis-agents/apps/electron/src/renderer/components/AppMenu.tsx', 'utf8')

describe('Task 12 rebrand contracts', () => {
  it('updates electron-builder metadata to Advantis Agents', () => {
    expect(builder).toContain('productName: Advantis Agents')
    expect(builder).toContain('appId: com.advantis.agents')
    expect(builder).toContain('title: "Advantis Agents"')
    expect(builder).toContain('icon: resources/icon.icns')
  })

  it('sets BrowserWindow title to Advantis Agents', () => {
    expect(windowManager).toContain("title: 'Advantis Agents'")
  })

  it('updates app package description and README header', () => {
    expect(electronPackage).toContain('Advantis Agents')
    expect(readme).toContain('# Advantis Agents')
    expect(readme).toContain('travel nurse credentialing platform')
  })

  it('updates renderer shell text to Advantis Agents', () => {
    expect(appMenu).toContain('Quit Advantis Agents')
  })
})
