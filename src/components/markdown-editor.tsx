'use client';

import type { CSSProperties, ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

// WYSIWYG editor that submits Markdown: TipTap edits rich text, tiptap-markdown
// parses the stored Markdown in and serializes it back out into a hidden input,
// so the server keeps storing Markdown and nothing downstream changes.
// No underline/font pickers — Markdown has no syntax for them.

// Icons are inline SVG on a shared 16×16 grid rather than Unicode glyphs: those
// arrive at whatever size and baseline each font feels like, and the link emoji
// came in full colour. One grid, one stroke weight, currentColor throughout.
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const };
// the three body lines shared by both list icons
const listLines = [4, 8, 12].map((y) => <line key={y} x1="6.5" y1={y} x2="14" y2={y} {...stroke} />);

const ICONS: Record<string, ReactNode> = {
  // the arrowhead rides above the arc, so the combined ink spans y 2–11.5 and
  // would sit 1.25 high on a grid centred at 8; nudge the whole glyph down
  undo: (
    <Svg>
      <g transform="translate(0 1.25)">
        <path d="M5.5 4.5h4a3.5 3.5 0 010 7H6.5" {...stroke} />
        <polyline points="7.5,2 5,4.5 7.5,7" {...stroke} strokeLinejoin="round" />
      </g>
    </Svg>
  ),
  redo: (
    <Svg>
      <g transform="translate(0 1.25)">
        <path d="M10.5 4.5h-4a3.5 3.5 0 000 7h3" {...stroke} />
        <polyline points="8.5,2 11,4.5 8.5,7" {...stroke} strokeLinejoin="round" />
      </g>
    </Svg>
  ),
  code: (
    <Svg>
      <polyline points="5.5,4.5 2.5,8 5.5,11.5" {...stroke} strokeLinejoin="round" />
      <polyline points="10.5,4.5 13.5,8 10.5,11.5" {...stroke} strokeLinejoin="round" />
    </Svg>
  ),
  codeBlock: (
    <Svg>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...stroke} />
      <polyline points="6.5,6 4.5,8 6.5,10" {...stroke} strokeLinejoin="round" />
      <polyline points="9.5,6 11.5,8 9.5,10" {...stroke} strokeLinejoin="round" />
    </Svg>
  ),
  bulletList: (
    <Svg>
      {[4, 8, 12].map((y) => (
        <circle key={y} cx="3" cy={y} r="1.3" fill="currentColor" />
      ))}
      {listLines}
    </Svg>
  ),
  orderedList: (
    <Svg>
      <g fill="currentColor" fontSize="6" fontFamily="Arial, sans-serif" textAnchor="middle">
        <text x="3" y="6">
          1
        </text>
        <text x="3" y="10">
          2
        </text>
        <text x="3" y="14">
          3
        </text>
      </g>
      {listLines}
    </Svg>
  ),
  blockquote: (
    <Svg>
      <path d="M2.5 3v10" {...stroke} strokeWidth={2} />
      <line x1="6" y1="5" x2="14" y2="5" {...stroke} />
      <line x1="6" y1="8" x2="14" y2="8" {...stroke} />
      <line x1="6" y1="11" x2="11.5" y2="11" {...stroke} />
    </Svg>
  ),
  link: (
    <Svg>
      <path d="M6.7 9.3a2.6 2.6 0 010-3.7l2-2a2.6 2.6 0 013.7 3.7l-1 1" {...stroke} />
      <path d="M9.3 6.7a2.6 2.6 0 010 3.7l-2 2a2.6 2.6 0 01-3.7-3.7l1-1" {...stroke} />
    </Svg>
  ),
  // solid strokes, not opacity: the faint outer lines antialiased unevenly and
  // pulled the glyph's apparent centre downward
  rule: (
    <Svg>
      <line x1="2.5" y1="4" x2="13.5" y2="4" {...stroke} strokeWidth={1} />
      <line x1="1.5" y1="8" x2="14.5" y2="8" {...stroke} strokeWidth={2} />
      <line x1="2.5" y1="12" x2="13.5" y2="12" {...stroke} strokeWidth={1} />
    </Svg>
  ),
  clear: (
    <Svg>
      <text x="6" y="12" fill="currentColor" fontSize="11" fontFamily="Arial, sans-serif" textAnchor="middle">
        A
      </text>
      <line x1="2" y1="13.5" x2="14" y2="2.5" {...stroke} />
    </Svg>
  ),
};

type Btn = {
  label: ReactNode; // toolbar icon or letterform
  title: string;
  run: (e: Editor) => void;
  active?: (e: Editor) => boolean;
  enabled?: (e: Editor) => boolean;
};

const GROUPS: Btn[][] = [
  [
    { label: ICONS.undo, title: 'Undo', run: (e) => e.chain().focus().undo().run(), enabled: (e) => e.can().undo() },
    { label: ICONS.redo, title: 'Redo', run: (e) => e.chain().focus().redo().run(), enabled: (e) => e.can().redo() },
  ],
  [
    { label: <b>B</b>, title: 'Bold', run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
    { label: <i>I</i>, title: 'Italic', run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
    { label: <s>S</s>, title: 'Strikethrough', run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive('strike') },
    { label: ICONS.code, title: 'Inline code', run: (e) => e.chain().focus().toggleCode().run(), active: (e) => e.isActive('code') },
  ],
  [
    {
      label: <span className="md-heading-label">H1</span>,
      title: 'Heading 1',
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
      active: (e) => e.isActive('heading', { level: 1 }),
    },
    {
      label: <span className="md-heading-label">H2</span>,
      title: 'Heading 2',
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      active: (e) => e.isActive('heading', { level: 2 }),
    },
    {
      label: <span className="md-heading-label">H3</span>,
      title: 'Heading 3',
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
      active: (e) => e.isActive('heading', { level: 3 }),
    },
  ],
  [
    {
      label: ICONS.bulletList,
      title: 'Bulleted list',
      run: (e) => e.chain().focus().toggleBulletList().run(),
      active: (e) => e.isActive('bulletList'),
    },
    {
      label: ICONS.orderedList,
      title: 'Numbered list',
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      active: (e) => e.isActive('orderedList'),
    },
    {
      label: ICONS.blockquote,
      title: 'Blockquote',
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      active: (e) => e.isActive('blockquote'),
    },
    {
      label: ICONS.codeBlock,
      title: 'Code block',
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
      active: (e) => e.isActive('codeBlock'),
    },
  ],
  [
    {
      label: ICONS.link,
      title: 'Link',
      active: (e) => e.isActive('link'),
      run: (e) => {
        const url = window.prompt('Link URL (empty to remove)', e.getAttributes('link').href ?? 'https://');
        if (url === null) return;
        if (!url) return void e.chain().focus().unsetLink().run();
        e.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      },
    },
    { label: ICONS.rule, title: 'Horizontal rule', run: (e) => e.chain().focus().setHorizontalRule().run() },
    { label: ICONS.clear, title: 'Clear formatting', run: (e) => e.chain().focus().clearNodes().unsetAllMarks().run() },
  ],
];

export function MarkdownEditor({
  name,
  defaultValue,
  ariaLabel,
  contentStyle,
}: {
  name: string;
  defaultValue: string;
  ariaLabel: string;
  contentStyle?: CSSProperties;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), Markdown],
    content: defaultValue,
    immediatelyRender: false, // this renders inside a server-rendered tree
    // v3 defaults to off; the toolbar's pressed states and the hidden input
    // below both read live off the editor, so they need the re-render
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': ariaLabel } },
  });

  if (!editor) return <div className="md-editor" style={contentStyle} />;

  const markdown = (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();

  return (
    <div className="md-editor">
      <div className="md-toolbar" role="toolbar" aria-label={`${ariaLabel} formatting`}>
        {GROUPS.map((group, gi) => (
          <div key={gi} className="md-toolbar-group">
            {group.map((b, bi) => (
              <button
                key={b.title}
                type="button"
                title={b.title}
                aria-label={b.title}
                aria-pressed={b.active ? b.active(editor) : undefined}
                disabled={!(b.enabled?.(editor) ?? true)}
                // mousedown, not click: keeps the selection instead of blurring it away
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  b.run(editor);
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <EditorContent editor={editor} className="md-editor-content" style={contentStyle} />
      <input type="hidden" name={name} value={markdown} />
    </div>
  );
}
