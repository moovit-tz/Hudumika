import { WorkflowLearningService } from '../services/workflow-learning.service.js';

/**
 * Daily self-learning pass: re-diffs every tenant workflow against the template
 * it descends from, refreshes the cross-tenant learning signals, and files a
 * fresh consensus proposal for any template whose edits cleared the support
 * threshold. Never publishes — proposals wait for superadmin approval.
 */
export async function runWorkflowLearningJob(): Promise<void> {
  try {
    const summary = await WorkflowLearningService.analyze();
    const proposals = summary.filter((s) => s.proposal === 'created').length;
    console.log(`[WorkflowLearning] analysed ${summary.length} template(s); ${proposals} proposal(s) pending review.`);
  } catch (err: any) {
    console.error('[WorkflowLearning] analysis failed:', err.message);
  }
}
