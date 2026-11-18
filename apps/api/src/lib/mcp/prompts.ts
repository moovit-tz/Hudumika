/**
 * MCP prompts: ready-made starting points a client can offer as slash
 * commands. A prompt is only text that steers the assistant toward existing
 * tools, so it grants nothing; each one is listed only when every tool it
 * needs is available to the caller (same checks as tools/list).
 */
import type { McpActorType } from './types.js';

export interface McpPromptArg { name: string; description: string; required?: boolean }
export interface McpPrompt {
  name: string;
  title: string;
  description: string;
  actors: McpActorType[];
  /** Tool ids that must all be available for the prompt to be listed. */
  requires: string[];
  arguments: McpPromptArg[];
  render(args: Record<string, string>): string;
}

export const MCP_PROMPTS: McpPrompt[] = [
  {
    name: 'customer_briefing', title: 'Customer briefing', actors: ['staff'],
    description: 'A one-page briefing on a customer: account, open invoices, shipments and support tickets.',
    requires: ['workspace.customer_overview'],
    arguments: [{ name: 'customer', description: 'Customer name or id', required: true }],
    render: a => `Prepare a short briefing on the customer "${a.customer}".\n`
      + '1. If that is not a UUID, find the customer with the search or crm__list_customers tool.\n'
      + '2. Call workspace__customer_overview with its id.\n'
      + '3. Summarise: account details, unpaid or overdue invoices with amounts and due dates, active shipments with stage and ETA, and open tickets. '
      + 'Say which sections were unavailable and why. Do not invent figures.',
  },
  {
    name: 'overdue_invoices', title: 'Overdue invoices follow-up', actors: ['staff'],
    description: 'List overdue invoices and draft a polite follow-up for each customer.',
    requires: ['finops.list_invoices'],
    arguments: [{ name: 'tone', description: 'Optional: friendly, firm or formal' }],
    render: a => 'Call finops__list_invoices with status "Overdue". Group the invoices by customer and list number, due date, currency and amount received. '
      + `Then draft one ${a.tone || 'friendly'} follow-up message per customer. Only draft; do not send anything.`,
  },
  {
    name: 'shipment_status', title: 'Where is my shipment?', actors: ['staff', 'customer'],
    description: 'Current stage, ETA and next step for a shipment.',
    requires: ['clearos.list_shipments', 'clearos.get_shipment'],
    arguments: [{ name: 'reference', description: 'Shipment reference, BL or AWB number', required: true }],
    render: a => `Find the shipment "${a.reference}" with clearos__list_shipments (search), then open it with clearos__get_shipment. `
      + 'Explain its current stage, vessel or flight, origin and destination, ETA and SLA deadline in plain language. If it cannot be found, say so.',
  },
  {
    name: 'my_day', title: 'My day', actors: ['staff'],
    description: 'Today’s tasks, events and notifications in one summary.',
    requires: ['tasks.list_tasks', 'calendar.list_events', 'workspace.list_notifications'],
    arguments: [],
    render: () => 'Build my plan for today. Call tasks__list_tasks, calendar__list_events (from and to = today) and workspace__list_notifications. '
      + 'List meetings in time order, then tasks due today or overdue by priority, then unread notifications that need action.',
  },
  {
    name: 'ticket_reply', title: 'Reply to a support ticket', actors: ['staff', 'customer'],
    description: 'Read a ticket and draft a reply; post it only after you confirm.',
    requires: ['bliss.get_ticket', 'bliss.reply_to_ticket'],
    arguments: [{ name: 'ticket_id', description: 'Ticket id', required: true }],
    render: a => `Open ticket ${a.ticket_id} with bliss__get_ticket and draft a reply. Show me the draft first. `
      + 'Only if I approve, post it with bliss__reply_to_ticket: the first call returns a summary and a confirmation_token; call again with the token after I confirm.',
  },
];
