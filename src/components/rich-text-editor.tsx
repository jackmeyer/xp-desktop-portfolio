'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { EditorContent, Node, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { imageUpload } from '../app/actions';

// WYSIWYG editor over HTML: what the editor renders is what gets stored and
// what the site serves. The server sanitizes on save against the same tag set
// this schema can produce, so the editor's capabilities are the allowlist.

// Images carry their display width, which is the whole reason for storing HTML
// rather than Markdown — Markdown has no syntax for it.
const MIN_IMAGE_WIDTH = 40;

const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('width'),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    };
  },

  // A node view purely to hang a resize grip off the corner. The width is
  // updated live on the <img> while dragging (cheap, no transactions) and
  // committed to the document once on release, so a drag is a single undo step.
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.className = 'rte-image';
      const img = document.createElement('img');
      const handle = document.createElement('span');
      handle.className = 'rte-image-handle';
      handle.title = 'Drag to resize';
      dom.append(img, handle);

      let current = node;
      const paint = (n: typeof node) => {
        img.src = n.attrs.src;
        img.alt = n.attrs.alt ?? '';
        if (n.attrs.width) img.setAttribute('width', String(n.attrs.width));
        else img.removeAttribute('width');
      };
      paint(node);

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault(); // don't start a node drag or move the selection
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = img.getBoundingClientRect().width;
        // never let an image be dragged wider than the column it sits in
        const max = dom.parentElement?.getBoundingClientRect().width ?? Infinity;
        const widthAt = (e: PointerEvent) =>
          Math.round(Math.min(max, Math.max(MIN_IMAGE_WIDTH, startWidth + e.clientX - startX)));
        const onMove = (e: PointerEvent) => img.setAttribute('width', String(widthAt(e)));
        const onUp = (e: PointerEvent) => {
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
          const pos = getPos();
          if (typeof pos !== 'number') return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, width: widthAt(e) })
          );
        };
        handle.setPointerCapture(event.pointerId); // keep tracking outside the grip
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
      });

      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== node.type.name) return false;
          current = updated;
          paint(updated); // keeps the toolbar presets in sync with the grip
          return true;
        },
      };
    };
  },
});

// The document schema drops any tag it doesn't know, so an <iframe> typed into
// the HTML view would vanish the moment you switched back. This keeps it as an
// opaque block — the editor never edits inside one, it just carries it through.
const Iframe = Node.create({
  name: 'iframe',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () =>
    Object.fromEntries(
      ['src', 'width', 'height', 'title', 'loading', 'allow', 'allowfullscreen', 'frameborder'].map((a) => [
        a,
        { default: null },
      ])
    ),
  parseHTML: () => [{ tag: 'iframe' }],
  renderHTML: ({ HTMLAttributes }) => ['iframe', HTMLAttributes],
});

// Pretty-printing for the HTML view. TipTap emits one unbroken line, which is
// unreadable past a paragraph or two. The rule: break between block elements,
// never inside one. A newline between two inline elements parses back as a
// space, so reformatting there would quietly edit the prose — a paragraph
// stays on its one long line and the textarea soft-wraps it.
const BLOCK =
  /^(p|h[1-6]|ul|ol|li|blockquote|pre|hr|div|figure|figcaption|iframe|table|thead|tbody|tr|td|th)$/;

const isBlock = (n: ChildNode): n is Element => n.nodeType === 1 && BLOCK.test((n as Element).localName);

// Only split a node's children when *all* of them are blocks; a mixed bag means
// the whitespace between them is load-bearing, so that node is left as one line.
const splittable = (el: Element): boolean => {
  const kids = [...el.childNodes].filter((n) => n.nodeType !== 3 || n.textContent?.trim());
  return kids.length > 0 && kids.every(isBlock);
};

const openTag = (el: Element) =>
  `<${el.localName}${[...el.attributes]
    .map((a) => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`)
    .join('')}>`;

const indent = (el: Element, depth: number): string[] =>
  [...el.children].flatMap((c) => {
    const pad = '  '.repeat(depth);
    return splittable(c)
      ? [pad + openTag(c), ...indent(c, depth + 1), `${pad}</${c.localName}>`]
      : [pad + c.outerHTML];
  });

const prettyHtml = (html: string): string => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return splittable(host) ? indent(host, 0).join('\n') : html;
};

const IMAGE_SIZES: [string, number | null][] = [
  ['Small', 240],
  ['Medium', 480],
  ['Full width', null],
];

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
  alignLeft: (
    <Svg>
      {[3, 6, 9, 12].map((y, i) => (
        <line key={y} x1="2" y1={y} x2={i % 2 ? 10 : 14} y2={y} {...stroke} />
      ))}
    </Svg>
  ),
  alignCenter: (
    <Svg>
      {[3, 6, 9, 12].map((y, i) => (
        <line key={y} x1={i % 2 ? 4 : 2} y1={y} x2={i % 2 ? 12 : 14} y2={y} {...stroke} />
      ))}
    </Svg>
  ),
  alignRight: (
    <Svg>
      {[3, 6, 9, 12].map((y, i) => (
        <line key={y} x1={i % 2 ? 6 : 2} y1={y} x2="14" y2={y} {...stroke} />
      ))}
    </Svg>
  ),
  image: (
    <Svg>
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" {...stroke} />
      <circle cx="5.5" cy="6.5" r="1.2" fill="currentColor" />
      <polyline points="2.5,12 6,8.5 8.5,10.5 11,7.5 13.5,10.5" {...stroke} strokeLinejoin="round" />
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

// A drag/paste can expose its payload via .files, via .items, or (from some
// apps) as a File with an empty `type`. Take anything that looks like a file
// and let the server's allowlist be the judge.
const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;
const filesFrom = (dt: DataTransfer | null | undefined): File[] => {
  if (!dt) return [];
  const files = dt.files?.length
    ? [...dt.files]
    : [...(dt.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()!).filter(Boolean);
  return files.filter((f) => f.type.startsWith('image/') || IMAGE_RE.test(f.name));
};

type Ctx = { pickImage: () => void };

type Btn = {
  label: ReactNode; // toolbar icon or letterform
  title: string;
  run: (e: Editor, ctx: Ctx) => void;
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
    { label: <u>U</u>, title: 'Underline', run: (e) => e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive('underline') },
    { label: <s>S</s>, title: 'Strikethrough', run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive('strike') },
    { label: ICONS.code, title: 'Inline code', run: (e) => e.chain().focus().toggleCode().run(), active: (e) => e.isActive('code') },
  ],
  [
    {
      label: <span className="rte-heading-label">H1</span>,
      title: 'Heading 1',
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
      active: (e) => e.isActive('heading', { level: 1 }),
    },
    {
      label: <span className="rte-heading-label">H2</span>,
      title: 'Heading 2',
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      active: (e) => e.isActive('heading', { level: 2 }),
    },
    {
      label: <span className="rte-heading-label">H3</span>,
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
    ...(['left', 'center', 'right'] as const).map((align) => ({
      label: ICONS[`align${align[0].toUpperCase()}${align.slice(1)}`],
      title: `Align ${align}`,
      run: (e: Editor) => e.chain().focus().setTextAlign(align).run(),
      active: (e: Editor) => e.isActive({ textAlign: align }),
    })),
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
    { label: ICONS.image, title: 'Insert image', run: (_e, ctx) => ctx.pickImage() },
    { label: ICONS.rule, title: 'Horizontal rule', run: (e) => e.chain().focus().setHorizontalRule().run() },
    { label: ICONS.clear, title: 'Clear formatting', run: (e) => e.chain().focus().clearNodes().unsetAllMarks().run() },
  ],
];

export function RichTextEditor({
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
  const fileInput = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // null = WYSIWYG; a string = the HTML source view, which is then the thing
  // being edited and the thing that gets submitted. Switching back re-parses it
  // through the schema, so anything the schema can't hold is normalised away.
  const [source, setSource] = useState<string | null>(null);
  // the native listeners below are bound once; a ref keeps them on the live editor
  const editorRef = useRef<Editor | null>(null);

  // the one upload path: toolbar button, paste and drop all land here. `at`
  // lets a drop insert where it was dropped rather than at the caret.
  const insertImages = async (files: File[], at?: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    if (at !== undefined) ed.commands.setTextSelection(at);
    for (const file of files) {
      const body = new FormData();
      body.set('image', file);
      const r = await imageUpload(body);
      if (r.error || !r.url) return void window.alert(r.error ?? 'Upload failed.');
      ed.chain().focus().setImage({ src: r.url, alt: file.name }).run();
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      SizedImage.configure({ inline: true }),
      Iframe,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: defaultValue, // stored HTML, parsed straight into the document
    immediatelyRender: false, // this renders inside a server-rendered tree
    // v3 defaults to off; the toolbar's pressed states and the hidden input
    // below both read live off the editor, so they need the re-render
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': ariaLabel } },
  });

  editorRef.current = editor;

  // Image paste/drop is bound natively in the capture phase rather than through
  // ProseMirror's handlePaste/handleDrop props: those run inside ProseMirror's
  // own pipeline, and when they don't claim the event the browser's default
  // drops the *filename* into the document as text. Capture means we decide
  // first, and only for file payloads — text and in-document node drags never
  // reach this and keep TipTap's behaviour.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); // allow the drop
    };
    const onDrop = (e: DragEvent) => {
      const files = filesFrom(e.dataTransfer);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      const view = editorRef.current?.view;
      insertImages(files, view?.posAtCoords({ left: e.clientX, top: e.clientY })?.pos);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = filesFrom(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      insertImages(files);
    };
    el.addEventListener('dragover', onDragOver, true);
    el.addEventListener('drop', onDrop, true);
    el.addEventListener('paste', onPaste, true);
    return () => {
      el.removeEventListener('dragover', onDragOver, true);
      el.removeEventListener('drop', onDrop, true);
      el.removeEventListener('paste', onPaste, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return <div className="rte-editor" style={contentStyle} />;

  const ctx: Ctx = { pickImage: () => fileInput.current?.click() };

  const imageSelected = editor.isActive('image');

  return (
    <div className="rte-editor" ref={boxRef}>
      <div className="rte-toolbar" role="toolbar" aria-label={`${ariaLabel} formatting`}>
        <div className="rte-toolbar-group">
          <button
            type="button"
            title={source === null ? 'Edit HTML source' : 'Back to the editor'}
            aria-pressed={source !== null}
            onMouseDown={(ev) => {
              ev.preventDefault();
              if (source === null) return setSource(prettyHtml(editor.getHTML()));
              editor.commands.setContent(source);
              setSource(null);
            }}
          >
            <span className="rte-heading-label">HTML</span>
          </button>
        </div>
        {source === null &&
          GROUPS.map((group, gi) => (
          <div key={gi} className="rte-toolbar-group">
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
                  b.run(editor, ctx);
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        ))}
        {/* only meaningful with an image selected, so it stays out of the way
            until there is one rather than sitting permanently disabled */}
        {source === null && imageSelected && (
          <div className="rte-toolbar-group">
            {IMAGE_SIZES.map(([label, width]) => (
              <button
                key={label}
                type="button"
                title={`Image: ${label.toLowerCase()}`}
                aria-pressed={(editor.getAttributes('image').width ?? null) === width}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  editor.chain().focus().updateAttributes('image', { width }).run();
                }}
              >
                <span className="rte-size-label">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {source === null ? (
        <EditorContent editor={editor} className="rte-editor-content" style={contentStyle} />
      ) : (
        <textarea
          className="rte-editor-content rte-source"
          style={contentStyle}
          aria-label={`${ariaLabel} HTML source`}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // let the same file be picked again
          if (file) insertImages([file]);
        }}
      />
      {/* saving straight from the source view submits exactly what's typed,
          without a round trip through the schema */}
      <input type="hidden" name={name} value={source ?? editor.getHTML()} />
    </div>
  );
}
