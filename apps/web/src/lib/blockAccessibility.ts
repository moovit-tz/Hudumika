import type { CmsBlock } from '@hudumika/types';

export interface AccessibilityIssue {
  blockId: string;
  /** 1-based position in the block array, for a human-readable "block 3" reference. */
  position: number;
  message: string;
}

/**
 * §58 of the CMS master brief — a real audit pass over a block array,
 * buildable now that content is structured data (an image block's own
 * `alt` field, a heading block's own `level`) rather than an HTML blob no
 * static check could reason about. Three checks, each a real WCAG
 * criterion rather than a heuristic guess: missing alt text (1.1.1), a
 * skipped heading level (2.4.6 — this editor only offers H2/H3, so the
 * only possible skip is an H3 appearing before any H2), and a button with
 * no accessible label (4.1.2). Deliberately doesn't flag vague link text
 * ("click here") — that's a judgment call a heuristic gets wrong often
 * enough to be noise, not a structural fact this data can settle.
 */
export function auditBlocksAccessibility(blocks: CmsBlock[]): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  let sawH2 = false;

  blocks.forEach((block, idx) => {
    const p = block.props as any;
    const position = idx + 1;

    if (block.type === 'image' && p.url && !p.alt?.trim()) {
      issues.push({ blockId: block.id, position, message: `Image block ${position} has no alt text — screen readers will skip it silently.` });
    }

    if (block.type === 'heading') {
      const level = p.level ?? 2;
      if (level === 2) sawH2 = true;
      else if (level === 3 && !sawH2) {
        issues.push({ blockId: block.id, position, message: `Heading block ${position} is an H3 with no H2 before it — this skips a heading level.` });
      }
    }

    if (block.type === 'button' && p.url && !p.label?.trim()) {
      issues.push({ blockId: block.id, position, message: `Button block ${position} has a link but no label — it has no accessible name.` });
    }
  });

  return issues;
}
