import { ACTIONS_BY_ID } from './actions.js';
import { TRIGGERS_BY_ID } from './triggers.js';

export function validateExecutableGraph(triggerEvent: string, rawNodes: unknown, rawEdges: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) return ['Nodes and edges must be arrays'];
  if (!rawNodes.length || rawNodes.length > 100 || rawEdges.length > 100) return ['A workflow needs 1–100 nodes and at most 100 edges'];
  const nodes = rawNodes as any[];
  if (nodes.some(node => !node || typeof node.id !== 'string' || !node.id || !['trigger', 'action', 'condition', 'forEach'].includes(node.type))) return ['Invalid node identity or type'];
  const ids = new Set(nodes.map(node => node.id));
  if (ids.size !== nodes.length) errors.push('Node IDs must be unique');
  const trigger = TRIGGERS_BY_ID.get(triggerEvent);
  if (!trigger) errors.push('Trigger is not registered');
  if (trigger?.kind === 'SCHEDULE') errors.push('Scheduled execution is not yet available');
  const starts = nodes.filter(node => node.type === 'trigger');
  if (starts.length !== 1 || starts[0]?.eventOrAction !== triggerEvent) errors.push('Exactly one matching trigger node is required');
  const outgoing = new Map<string, string>();
  const incoming = new Set<string>();
  for (const edge of rawEdges as any[]) {
    if (!edge || !ids.has(edge.source) || !ids.has(edge.target)) { errors.push('Every edge must reference existing nodes'); continue; }
    if (outgoing.has(edge.source) || incoming.has(edge.target)) errors.push('Branching and merging are not yet supported');
    outgoing.set(edge.source, edge.target); incoming.add(edge.target);
  }
  const reached = new Set<string>();
  let next: string | undefined = starts[0]?.id;
  while (next) {
    if (reached.has(next)) { errors.push('Cycles are not supported'); break; }
    reached.add(next); next = outgoing.get(next);
  }
  if (reached.size !== nodes.length) errors.push('Every node must be reachable from the trigger');
  if (starts[0] && incoming.has(starts[0].id)) errors.push('Trigger cannot have an incoming edge');
  if (!nodes.some(node => node.type === 'action')) errors.push('At least one action is required');
  if (nodes.filter(node => node.type === 'forEach').length > 1) errors.push('Nested or multiple loops are not supported');
  for (const node of nodes) {
    if (node.type === 'action') {
      const action = ACTIONS_BY_ID.get(node.eventOrAction);
      if (!action) errors.push(`Action ${node.eventOrAction ?? node.id} is not registered`);
      else if (action.restricted) errors.push(`Action ${action.id} requires an approval policy before live execution`);
      if (!node.config?.input || typeof node.config.input !== 'object' || Array.isArray(node.config.input)) errors.push(`Action ${node.id} needs input configuration`);
      else if (action && !JSON.stringify(node.config.input).includes('{{')) {
        const parsed = action.inputSchema.safeParse(node.config.input);
        if (!parsed.success) errors.push(`Action ${node.id} has invalid input: ${parsed.error.issues.map(issue => issue.path.join('.') + ' ' + issue.message).join('; ')}`);
      }
    }
    if (node.type === 'condition' && !node.config?.field) errors.push(`Condition ${node.id} needs a field`);
    if (node.type === 'forEach' && (!node.config?.over || !node.config?.as)) errors.push(`Loop ${node.id} needs collection and item bindings`);
  }
  return [...new Set(errors)];
}
