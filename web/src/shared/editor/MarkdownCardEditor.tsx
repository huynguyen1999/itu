import { ClipboardEvent, useRef, useState } from 'react';
import { ImagePlus, Maximize2, X } from 'lucide-react';
import { MarkdownPreview } from '../markdown/MarkdownPreview';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog';

interface MarkdownCardEditorProps {
  label: string;
  value: string;
  onChange(value: string): void;
  onImage(file: File): string | Promise<string>;
  pendingImages?: File[];
  onRemovePendingImage?(index: number): void;
}

export function MarkdownCardEditor({
  label,
  value,
  onChange,
  onImage,
  pendingImages = [],
  onRemovePendingImage,
}: MarkdownCardEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  async function handleImage(file: File) {
    const url = await onImage(file);
    insertMarkdownImage(file.name, url);
  }

  function insertMarkdownImage(name: string, url: string) {
    const textarea = textareaRef.current;
    const alt = imageAltText(name);
    const imageMarkdown = `![${alt}](${url})`;

    if (!textarea) {
      onChange(appendMarkdown(value, imageMarkdown));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}${imageMarkdown}${value.slice(end)}`;
    onChange(nextValue);

    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + imageMarkdown.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const image = [...event.clipboardData.files].find((file) => file.type.startsWith('image/'));
    if (!image) return;

    event.preventDefault();
    void handleImage(image);
  }

  return (
    <div className="grid gap-2">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={value}
            onPaste={onPaste}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Use Markdown, ![[image.png|300]], and ```mermaid fenced diagrams..."
            className="min-h-[140px] resize-y bg-background font-mono text-sm text-foreground"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full gap-2 bg-primary/10 text-primary hover:bg-primary/20"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus size={16} /> Add image (or paste)
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImage(file);
              event.currentTarget.value = '';
            }}
          />
          {pendingImages.length > 0 && (
            <div className="space-y-1 rounded-md border bg-muted/40 p-2">
              {pendingImages.map((file, index) => (
                <PendingImageUpload
                  file={file}
                  index={index}
                  key={`${file.name}-${file.lastModified}-${index}`}
                  onRemove={onRemovePendingImage}
                />
              ))}
            </div>
          )}
        </div>
        <Card className="relative min-h-[140px] overflow-y-auto border-dashed bg-card p-3">
          <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 z-10 h-8 w-8 bg-background/80 shadow-sm hover:bg-background"
                aria-label={`Open full preview for ${label}`}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="h-[100dvh] max-h-[100dvh] max-w-none overflow-hidden rounded-none p-4 sm:h-auto sm:max-h-[88vh] sm:max-w-5xl sm:rounded-lg sm:p-6">
              <DialogHeader>
                <DialogTitle>{label} preview</DialogTitle>
              </DialogHeader>
              <div className="max-h-[calc(100dvh-7rem)] overflow-auto rounded-md border bg-card p-4 sm:max-h-[72vh] sm:p-5">
                <MarkdownPreview value={value} className="text-base" />
              </div>
            </DialogContent>
          </Dialog>
          <MarkdownPreview value={value} className="pr-9 text-sm" />
        </Card>
      </div>
    </div>
  );
}

function PendingImageUpload({ file, index, onRemove }: { file: File; index: number; onRemove?(index: number): void }) {
  return (
    <div className="flex items-center gap-2 rounded border bg-card px-2 py-1.5">
      <ImagePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
        <p className="text-[11px] text-muted-foreground">{formatFileSize(file.size)} pending upload</p>
      </div>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Remove ${file.name}`}
          onClick={() => onRemove(index)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function appendMarkdown(value: string, markdown: string): string {
  const prefix = value.trim() ? '\n\n' : '';
  return `${value}${prefix}${markdown}`;
}

function imageAltText(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[[\]()]/g, '') || 'image'
  );
}
