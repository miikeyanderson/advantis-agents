export type AgentRole =
  | 'Coordinator'
  | 'Intake'
  | 'DocCollector'
  | 'Verifier'
  | 'PacketAssembler'
  | 'QualityReview'

export interface AgentConfig {
  name: AgentRole
  promptPath: string
  toolSubset: string[]
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    name: 'Coordinator',
    promptPath: 'packages/credentialing/src/agents/coordinator.md',
    toolSubset: [],
  },
  {
    name: 'Intake',
    promptPath: 'packages/credentialing/src/agents/intake.md',
    toolSubset: ['createCase', 'queryCases'],
  },
  {
    name: 'DocCollector',
    promptPath: 'packages/credentialing/src/agents/doc-collector.md',
    toolSubset: ['recordDocument', 'classifyDocument', 'queryCases', 'getCaseTimeline'],
  },
  {
    name: 'Verifier',
    promptPath: 'packages/credentialing/src/agents/verifier.md',
    toolSubset: ['runVerification', 'checkGuards', 'queryCases', 'getCaseTimeline'],
  },
  {
    name: 'PacketAssembler',
    promptPath: 'packages/credentialing/src/agents/packet-assembler.md',
    toolSubset: ['assemblePacket', 'checkGuards', 'queryCases'],
  },
  {
    name: 'QualityReview',
    promptPath: 'packages/credentialing/src/agents/quality-review.md',
    toolSubset: ['checkGuards', 'getCaseTimeline', 'queryCases', 'getFindingDetail'],
  },
]

export function getAgentConfig(role: AgentRole): AgentConfig {
  const config = AGENT_CONFIGS.find((item) => item.name === role)
  if (!config) {
    throw new Error(`Unknown agent role: ${role}`)
  }
  return config
}

export function isToolAllowedForAgent(role: AgentRole, toolName: string): boolean {
  return getAgentConfig(role).toolSubset.includes(toolName)
}
