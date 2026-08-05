import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { api } from '../api/client';
import { isApiMediaUrl } from '../api/httpClient';
import { renderMarkdown } from './renderMarkdown';
import { cn } from '@/lib/utils';

let mermaidInitialized = false;

interface MarkdownPreviewProps {
  value: string;
  className?: string;
  emptyHtml?: string;
}

export function MarkdownPreview({ value, className, emptyHtml }: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(value), [value]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const protectedImages: Array<{ image: HTMLImageElement; src: string }> = [];
    const images = Array.from(container.querySelectorAll('img'));
    images.forEach((image) => {
      const src = image.getAttribute('src');
      if (src && isApiMediaUrl(src)) protectedImages.push({ image, src });
    });

    const objectUrls: string[] = [];
    let revoked = false;
    protectedImages.forEach(({ image, src }) => {
      void api
        .objectUrl(src)
        .then((objectUrl) => {
          if (revoked) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          objectUrls.push(objectUrl);
          image.setAttribute('src', objectUrl);
        })
        .catch(() => {
          if (!revoked) image.classList.add('opacity-40');
        });
    });

    return () => {
      revoked = true;
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [html]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const blocks = Array.from(container.querySelectorAll('pre > code.language-mermaid'));
    if (blocks.length === 0) return;

    let isCurrent = true;

    void import('mermaid').then(({ default: mermaid }) => {
      if (!isCurrent) return;

      if (!mermaidInitialized) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'default',
        });
        mermaidInitialized = true;
      }

      blocks.forEach((block, index) => {
        const pre = block.parentElement;
        if (!pre) return;

        const source = block.textContent?.trim();
        if (!source) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'not-prose my-4 overflow-auto rounded-md border border-border bg-card p-3';
        wrapper.dataset.mermaidSource = source;
        wrapper.textContent = 'Rendering diagram...';
        pre.replaceWith(wrapper);

        const id = `mermaid-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
        void mermaid
          .render(id, source)
          .then(({ svg }) => {
            if (!isCurrent) return;
            wrapper.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
            wrapper.querySelector('svg')?.classList.add('mx-auto', 'h-auto', 'max-w-full');
          })
          .catch((error: unknown) => {
            if (!isCurrent) return;
            wrapper.className = 'not-prose my-4 rounded-md border border-destructive/30 bg-destructive/5 p-3';
            wrapper.textContent = error instanceof Error ? error.message : 'Unable to render Mermaid diagram.';
          });
      });
    });

    return () => {
      isCurrent = false;
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={cn('markdown-preview', className)}
      dangerouslySetInnerHTML={{
        __html: html || emptyHtml || '<p class="text-muted-foreground italic">Preview will appear here</p>',
      }}
    />
  );
}
