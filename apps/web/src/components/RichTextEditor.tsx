import React, { useRef, useEffect, useCallback, useState } from 'react';
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
 * A contentEditable + execCommand rich text editor with image resizing capabilities.
 * Emits/accepts a raw HTML string. Clicking any image inside the editor opens size presets
 * (Small, Medium, Large, Fit Width) and a width slider to easily adjust to fit.
 */
export function RichTextEditor({ value, onChange, placeholder, onInsertImage }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Resolves to a URL to insert at the cursor, or null if the caller cancelled. */
  onInsertImage?: () => Promise<string | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string | null>(null);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [imgWidth, setImgWidth] = useState<number>(240);

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

  // Track image selection inside the editor
  useEffect(() => {
    const editor = ref.current;
    if (!editor) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        editor.querySelectorAll('img.rte-img-selected').forEach(el => el.classList.remove('rte-img-selected'));
        img.classList.add('rte-img-selected');
        setSelectedImg(img);
        const curW = img.offsetWidth || parseInt(img.style.width, 10) || 240;
        setImgWidth(curW);
      } else {
        if (!(e.target as HTMLElement)?.closest('.rte-img-toolbar')) {
          editor.querySelectorAll('img.rte-img-selected').forEach(el => el.classList.remove('rte-img-selected'));
          setSelectedImg(null);
        }
      }
    };

    editor.addEventListener('click', handleClick);
    return () => editor.removeEventListener('click', handleClick);
  }, []);

  const applyImageWidth = useCallback((width: string | number) => {
    if (!selectedImg) return;
    if (typeof width === 'number') {
      selectedImg.style.width = `${width}px`;
      selectedImg.style.maxWidth = '100%';
      selectedImg.style.height = 'auto';
      selectedImg.setAttribute('width', String(width));
      setImgWidth(width);
    } else if (width === '100%') {
      selectedImg.style.width = '100%';
      selectedImg.style.maxWidth = '100%';
      selectedImg.style.height = 'auto';
      selectedImg.removeAttribute('width');
      setImgWidth(ref.current?.clientWidth || 500);
    } else if (width === 'original') {
      selectedImg.style.width = '';
      selectedImg.style.maxWidth = '100%';
      selectedImg.style.height = 'auto';
      selectedImg.removeAttribute('width');
      setImgWidth(selectedImg.naturalWidth || 300);
    }
    handleInput();
  }, [selectedImg, handleInput]);

  const applyImageAlign = useCallback((align: 'left' | 'center' | 'right') => {
    if (!selectedImg) return;
    if (align === 'left') {
      selectedImg.style.display = 'inline-block';
      selectedImg.style.marginLeft = '0';
      selectedImg.style.marginRight = 'auto';
    } else if (align === 'center') {
      selectedImg.style.display = 'block';
      selectedImg.style.marginLeft = 'auto';
      selectedImg.style.marginRight = 'auto';
    } else if (align === 'right') {
      selectedImg.style.display = 'inline-block';
      selectedImg.style.marginLeft = 'auto';
      selectedImg.style.marginRight = '0';
    }
    handleInput();
  }, [selectedImg, handleInput]);

  const deleteSelectedImage = useCallback(() => {
    if (!selectedImg) return;
    selectedImg.remove();
    setSelectedImg(null);
    handleInput();
  }, [selectedImg, handleInput]);

  const handleInsertImage = () => {
    if (!onInsertImage) return;
    onInsertImage().then(url => {
      if (url) {
        runCommand('insertImage', url);
        setTimeout(() => {
          if (ref.current) {
            const imgs = ref.current.querySelectorAll('img');
            imgs.forEach(img => {
              if (!img.style.maxWidth) img.style.maxWidth = '100%';
              if (!img.style.height) img.style.height = 'auto';
            });
            handleInput();
          }
        }, 50);
      }
    });
  };

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
        {onInsertImage && (
          <button
            type="button"
            className="rte-toolbar-btn"
            title="Insert image"
            onMouseDown={e => {
              e.preventDefault();
              handleInsertImage();
            }}
          >
            <Icon name="image" size={13} />
          </button>
        )}
      </div>

      {/* Image Resizer & Fit Controls when an image is clicked */}
      {selectedImg && (
        <div className="rte-img-toolbar" onMouseDown={e => e.preventDefault()}>
          <div className="rte-img-toolbar-label">
            <Icon name="image" size={13} />
            <span>Resize:</span>
          </div>

          <div className="rte-img-presets">
            <button
              type="button"
              className={`rte-img-btn ${imgWidth === 120 ? 'is-active' : ''}`}
              onClick={() => applyImageWidth(120)}
              title="Small width (120px)"
            >
              Small (120px)
            </button>
            <button
              type="button"
              className={`rte-img-btn ${imgWidth === 240 ? 'is-active' : ''}`}
              onClick={() => applyImageWidth(240)}
              title="Medium width (240px)"
            >
              Medium (240px)
            </button>
            <button
              type="button"
              className={`rte-img-btn ${imgWidth === 400 ? 'is-active' : ''}`}
              onClick={() => applyImageWidth(400)}
              title="Large width (400px)"
            >
              Large (400px)
            </button>
            <button
              type="button"
              className="rte-img-btn"
              onClick={() => applyImageWidth('100%')}
              title="Fit to editor width"
            >
              Fit Width (100%)
            </button>
            <button
              type="button"
              className="rte-img-btn"
              onClick={() => applyImageWidth('original')}
              title="Original dimensions"
            >
              Original
            </button>
          </div>

          <div className="rte-img-slider-wrap">
            <input
              type="range"
              min="40"
              max="800"
              step="10"
              value={imgWidth}
              onChange={e => applyImageWidth(Number(e.target.value))}
              className="rte-img-slider"
              title="Adjust image width"
            />
            <span className="rte-img-size-val">{imgWidth}px</span>
          </div>

          <div className="rte-img-align-group">
            <button type="button" className="rte-img-btn" onClick={() => applyImageAlign('left')} title="Align left">Left</button>
            <button type="button" className="rte-img-btn" onClick={() => applyImageAlign('center')} title="Align center">Center</button>
            <button type="button" className="rte-img-btn" onClick={() => applyImageAlign('right')} title="Align right">Right</button>
          </div>

          <button
            type="button"
            className="rte-img-btn rte-img-btn--danger"
            onClick={deleteSelectedImage}
            title="Remove image"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      )}

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
