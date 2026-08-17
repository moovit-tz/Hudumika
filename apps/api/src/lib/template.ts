/**
 * `{{var}}` merge-tag substitution — the one templating convention this
 * platform already has two live consumers for (the notification matrix and
 * Workflow Studio's per-step AutoComms), now also used by the shared mail
 * template system (mail-template.service.ts). Relocated out of
 * notification-matrix.ts since it's no longer notification-specific.
 */
export function formatTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
  }
  return result;
}
