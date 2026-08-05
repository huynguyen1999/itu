import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.use({
  async: false,
  gfm: true,
  breaks: true,
});

export function renderMarkdown(markdown: string): string {
  const html = marked.parse(preprocessImageSyntax(markdown), { async: false }) as string;

  return DOMPurify.sanitize(highlightFencedCodeBlocks(html), {
    ADD_ATTR: ['width', 'height', 'loading', 'data-language'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

function preprocessImageSyntax(markdown: string): string {
  return markdown
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?]]/g, (_match, target: string, size?: string) =>
      renderSizedImage(target.trim(), '', size),
    )
    .replace(/!\[([^\]]*)]\(([^)\s]+)\|([^)]*)\)/g, (_match, alt: string, target: string, size: string) =>
      renderSizedImage(target.trim(), alt.trim(), size),
    );
}

function renderSizedImage(target: string, alt: string, size?: string): string {
  const dimensions = parseImageDimensions(size);
  const attrs = [
    `src="${escapeHtmlAttribute(target)}"`,
    `alt="${escapeHtmlAttribute(alt || imageAltText(target))}"`,
    'loading="lazy"',
    'onError="this.style.display=\'none\'"',
    dimensions.width ? `width="${dimensions.width}"` : '',
    dimensions.height ? `height="${dimensions.height}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `<img ${attrs} />`;
}

function parseImageDimensions(size?: string): { width?: number; height?: number } {
  if (!size) return {};

  const [widthInput, heightInput] = size
    .toLowerCase()
    .split('x')
    .map((part) => part.trim());
  const width = parseDimension(widthInput);
  const height = parseDimension(heightInput);

  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

function parseDimension(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, 24), 1200);
}

function imageAltText(target: string): string {
  const fileName = target.split('/').pop() ?? target;
  return decodeURIComponent(fileName)
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightFencedCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code(?: class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (match, rawLanguage: string | undefined, code: string) => {
      const language = rawLanguage?.trim().toLowerCase();
      if (language === 'mermaid') return match;

      const languageLabel = language || 'text';
      return [
        '<figure class="not-prose my-4 overflow-hidden rounded-md border border-slate-700 bg-slate-950 shadow-sm">',
        '<figcaption class="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-1.5">',
        `<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-300" data-language="${escapeHtmlAttribute(languageLabel)}">${escapeHtmlAttribute(languageLabel)}</span>`,
        '</figcaption>',
        '<pre class="m-0 max-h-[420px] overflow-auto bg-slate-950 p-3 text-left text-sm leading-6 text-slate-100">',
        `<code class="${language ? `language-${escapeHtmlAttribute(language)}` : ''} whitespace-pre font-mono">${code}</code>`,
        '</pre>',
        '</figure>',
      ].join('');
    },
  );
}
