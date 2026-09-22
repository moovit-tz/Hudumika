import { useCallback, useState } from 'react';
import { apiFetch } from '../lib/api.js';

export interface AgentPendingApproval {
  id: string;
  toolId: string;
  toolLabel: string;
  requestedEffect: string;
  approverRole: string;
  requiredApprovals: number;
}

export interface AgentChatMessage { role: 'user' | 'assistant'; content: string }

/** Client-side mirror of agent.routes.ts's canDecideApproval() — UI gating
 *  only (whether to show Approve/Reject); the server enforces the real check
 *  on every decision. */
export function canDecideAgentApproval(userRole: string | undefined, approverRole: string): boolean {
  if (!userRole) return false;
  return approverRole === 'MANAGER'
    ? ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(userRole)
    : userRole === approverRole;
}

/**
 * One conversation with the governed agent runtime (/v1/agent/runs) — the
 * first message starts a run, every later one continues it, and a tool that
 * needs a human decision surfaces as `pendingApproval` instead of running.
 * Used by the app-shell sidebar assistant; AgenticHome.tsx carries its own
 * equivalent inline logic from before this hook existed.
 */
export function useAgentChat() {
  const [runId, setRunId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<AgentPendingApproval | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);

  const apply = useCallback((status: string, s: { finalText?: string; errorMessage?: string; pendingApproval?: AgentPendingApproval }) => {
    if (s.pendingApproval) { setPendingApproval(s.pendingApproval); return; }
    setPendingApproval(null);
    if (status === 'completed') setMessages(p => [...p, { role: 'assistant', content: s.finalText || 'Done.' }]);
    else if (status === 'failed') setError(s.errorMessage || 'Something went wrong.');
    else if (status === 'cancelled') setMessages(p => [...p, { role: 'assistant', content: 'This step was not carried out.' }]);
  }, []);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy || pendingApproval) return;
    setMessages(p => [...p, { role: 'user', content: message }]);
    setBusy(true);
    setError(null);
    try {
      const res = runId
        ? await apiFetch(`/v1/agent/runs/${runId}/messages`, { method: 'POST', body: JSON.stringify({ message }) })
        : await apiFetch('/v1/agent/runs', { method: 'POST', body: JSON.stringify({ goal: message }) });
      setRunId(res.id);
      apply(res.status, res);
    } catch (err: any) {
      setError(err?.message || 'Could not reach the AI assistant.');
    } finally {
      setBusy(false);
    }
  }, [busy, pendingApproval, runId, apply]);

  const decide = useCallback(async (decision: 'approved' | 'rejected') => {
    if (!pendingApproval || decisionBusy) return;
    setDecisionBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/agent/approvals/${pendingApproval.id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
      if (res.status === 'pending') {
        // Quorum not met yet — this person's vote is recorded, another approver is still needed.
        setPendingApproval(null);
        const more = res.approvalsRequired - res.approvalsReceived;
        setMessages(p => [...p, { role: 'assistant', content: `Recorded. Waiting on ${more} more approver${more === 1 ? '' : 's'} before this continues.` }]);
      } else if (res.status === 'rejected') {
        setPendingApproval(null);
        apply('cancelled', {});
      } else {
        apply(res.runStatus, res);
      }
    } catch (err: any) {
      setError(err?.message || "Couldn't record that decision — try again.");
    } finally {
      setDecisionBusy(false);
    }
  }, [pendingApproval, decisionBusy, apply]);

  return { messages, busy, error, pendingApproval, decisionBusy, send, decide };
}
