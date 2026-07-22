import React, { useRef, useEffect, useCallback } from 'react';
import { Icon } from './Icon.js';

interface ToolbarButton {
  label: string;
  title: string;
  command: string;
  value?: string;
}

const TOOLBAR: ToolbarButton[] = [
  { label: 'B',  title: 'Bold',          command: 'bold' },
  { label: 'I',  title: 'Italic',        command: 'italic' },
  { label: 'U',  title: 'Underline',     command: 'underline' },
  { label: 'H2', title: 'Heading',       command: 'formatBlock', value: 'h2' },
  { label: 'H3', title: 'Subheading',    command: 'formatBlock', value: 'h3' },
  { label: '¶',  title: 'Paragraph',     command: 'formatBlock', value: 'p' },
  { label: '•',  title: 'Bullet list',   command: 'insertUnorderedList' },
  { label: '1.', title: 'Numbered list', command: 'insertOrderedList' },
  { label: '"',  title: 'Quote',         command: 'formatBlock', value: 'blockquote' },
];

/**
 * A small contentEditable + execCommand rich text editor — no new npm
 * dependency (no RTE library exists in this codebase; AGENTS.md calls out
 * dependency hygiene, and this app's own pattern is to hand-build UI on
 * primitives rather than pull in component libraries). Emits/accepts a raw
 * HTML string; the server sanitizes on save (see cms.service.ts), so this
 * component doesn't need to worry about what a malicious paste might smuggle
 * in — only about giving an editor experience for the CMS's fixed toolbar.
 */
export function RichTextEditor({ value, onChange, placeholder }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Starts as null (not `value`) so the very first effect run below always
  // syncs the initial content into the contentEditable div — it has no
  // React-managed children, so without this the editor opens empty even
  // though `value` is non-empty.
  const lastValue = useRef<string | null>(null);

  // Only push external value changes into the DOM when they didn't originate
  // from this editor's own onInput — otherwise every keystroke would reset
  // the cursor to the start of the content.
  useEffect(() => {
    if (ref.current && value !== lastValue.current) {
      ref.current.innerHTML = value;
      lastValue.current = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const html = ref.current?.innerHTML ?? '';
    lastValue.current = html;
    onChange(html);
  }, [onChange]);

  const runCommand = useCallback((cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    handleInput();
  }, [handleInput]);

  return (
    <div className="rte-wrap">
      <div className="rte-toolbar">
        {TOOLBAR.map(btn => (
          <button
            key={btn.title}
            type="button"
            className="rte-toolbar-btn"
            title={btn.title}
            onMouseDown={e => { e.preventDefault(); runCommand(btn.command, btn.value); }}
          >
            {btn.label}
          </button>
        ))}
        <button
          type="button"
          className="rte-toolbar-btn"
          title="Link"
          onMouseDown={e => {
            e.preventDefault();
            const url = window.prompt('Link URL (https:// or mailto:)');
            if (url) runCommand('createLink', url);
          }}
        >
          <Icon name="link" size={13} />
        </button>
      </div>
      <div
        ref={ref}
        className="rte-body"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
      />
    </div>
  );
}
