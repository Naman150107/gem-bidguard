import { AuditAction, type AuditAction as AuditActionT } from "./types";

/** Human-readable labels for audit actions. */
export const AUDIT_ACTION_LABEL: Record<AuditActionT, string> = {
  [AuditAction.VERIFICATION_STARTED]: "Verification started",
  [AuditAction.DOCUMENT_EXTRACTED]: "Document extracted",
  [AuditAction.SOURCE_VERIFIED]: "Government source checked",
  [AuditAction.DISCREPANCY_DETECTED]: "Discrepancy detected",
  [AuditAction.RULE_EVALUATED]: "Rule evaluated",
  [AuditAction.RISK_SCORED]: "Risk scored",
  [AuditAction.AI_SUMMARY]: "AI summary generated",
  [AuditAction.OFFICER_DECISION]: "Officer decision",
  [AuditAction.BANDWIDTH_ASSESSED]: "Bandwidth assessed",
  [AuditAction.OBLIGATION_LEDGER_VIEWED]: "Obligation ledger viewed",
  [AuditAction.AWARD_SIMULATION_RUN]: "Award simulation run",
};

export function humanizeAction(action: string): string {
  return (
    AUDIT_ACTION_LABEL[action as AuditActionT] ??
    action.replace(/_/g, " ").toLowerCase()
  );
}
