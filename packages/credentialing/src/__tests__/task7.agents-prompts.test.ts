import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'

import { AGENT_CONFIGS } from '../agents/index.ts'
import { CaseState } from '../types.ts'

describe('Task 7 agent prompts and topology', () => {
  it('exports six agent configs with the exact tool subsets from spec', () => {
    const actual = AGENT_CONFIGS.map((cfg) => ({
      name: cfg.name,
      toolSubset: cfg.toolSubset,
    }))

    expect(actual).toEqual([
      { name: 'Coordinator', toolSubset: [] },
      { name: 'Intake', toolSubset: ['createCase', 'queryCases'] },
      {
        name: 'DocCollector',
        toolSubset: ['recordDocument', 'classifyDocument', 'queryCases', 'getCaseTimeline'],
      },
      {
        name: 'Verifier',
        toolSubset: ['runVerification', 'checkGuards', 'queryCases', 'getCaseTimeline'],
      },
      {
        name: 'PacketAssembler',
        toolSubset: ['assemblePacket', 'checkGuards', 'queryCases'],
      },
      {
        name: 'QualityReview',
        toolSubset: ['checkGuards', 'getCaseTimeline', 'queryCases', 'getFindingDetail'],
      },
    ])
  })

  it('includes six markdown prompt files and each file documents role and allowed tools', () => {
    expect(AGENT_CONFIGS).toHaveLength(6)

    for (const config of AGENT_CONFIGS) {
      expect(config.promptPath.endsWith('.md')).toBeTrue()
      expect(existsSync(config.promptPath)).toBeTrue()

      const prompt = readFileSync(config.promptPath, 'utf8')
      expect(prompt).toContain(`# ${config.name}`)
      expect(prompt).toContain('Allowed MCP Tools')

      for (const toolName of config.toolSubset) {
        expect(prompt).toContain(`- ${toolName}`)
      }
    }
  })

  it('coordinator prompt includes a case-state dispatch table for all non-terminal states', () => {
    const coordinator = AGENT_CONFIGS.find((cfg) => cfg.name === 'Coordinator')
    expect(coordinator).toBeDefined()

    const prompt = readFileSync(coordinator!.promptPath, 'utf8')
    expect(prompt).toContain('Dispatch Table')

    for (const state of [
      CaseState.offer_accepted,
      CaseState.documents_requested,
      CaseState.documents_collected,
      CaseState.verification_in_progress,
      CaseState.verification_complete,
      CaseState.packet_assembled,
      CaseState.submitted,
      CaseState.cleared,
      CaseState.closed,
    ]) {
      expect(prompt).toContain(state)
    }
  })
})
