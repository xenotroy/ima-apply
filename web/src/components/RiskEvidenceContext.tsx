import { createContext, useContext, type ReactNode } from 'react';
import type { Evidence } from '../data/dossier';
import { evaluateWorkspaceRisk } from '../data/risk-evidence';
import type { RiskEvidenceContext } from '../data/risk-evidence';
import type { Scenario } from '../domain/types';
import type { EvidenceFileSession } from '../data/evidence-files';
import type { GitHubEvidenceClient } from '../data/github-evidence';

interface RiskEvidenceValue {
  workspaceId: string;
  evidence: readonly Evidence[];
  context: RiskEvidenceContext;
  fileSession: EvidenceFileSession;
  cloud?: GitHubEvidenceClient;
  onSessionChange: () => void;
}
const Context = createContext<RiskEvidenceValue | null>(null);
export function RiskEvidenceProvider({
  children,
  ...value
}: RiskEvidenceValue & { children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useRiskEvidence(): RiskEvidenceValue {
  const value = useContext(Context);
  if (!value) throw new Error('De actuele bewijscontext ontbreekt.');
  return value;
}
export function useRiskEvaluator() {
  const { evidence, context } = useRiskEvidence();
  return (scenario: Scenario) => evaluateWorkspaceRisk(scenario, evidence, context);
}
