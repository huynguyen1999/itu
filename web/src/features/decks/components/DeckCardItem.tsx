import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FolderInput, ImageIcon, Maximize2, Pencil, Repeat2, Trash2 } from 'lucide-react';
import { api } from '../../../shared/api/client';
import type { Card as APICard } from '../../../shared/api/client';
import { MarkdownCardEditor } from '../../../shared/editor/MarkdownCardEditor';
import { MarkdownPreview } from '../../../shared/markdown/MarkdownPreview';
import { renderMarkdown } from '../../../shared/markdown/renderMarkdown';
import { AuthenticatedImage } from '../../../shared/ui/AuthenticatedImage';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

const CARD_TYPE_STYLES = {
  BASIC: {
    label: 'Basic',
    bar: 'bg-sky-500',
  },
  REVERSE: {
    label: 'Reverse',
    bar: 'bg-violet-500',
  },
} as const;

export function DeckCardItem({
  card,
  deckId,
  selectionMode = false,
  selected = false,
  onSelectedChange,
  onMove,
}: {
  card: APICard;
  deckId: string;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onMove?: () => void;
}) {
  const [isViewing, setIsViewing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [promptRichText, setPrompt] = useState(card.promptRichText);
  const [answerRichText, setAnswer] = useState(card.answerRichText);
  const [resetReviewDate, setResetReviewDate] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const updateCard = useMutation({
    mutationFn: () => api.updateCard(deckId, card.id, { promptRichText, answerRichText, resetReviewDate }),
    onSuccess: () => {
      setIsEditing(false);
      setResetReviewDate(false);
      void queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
      void queryClient.invalidateQueries({ queryKey: ['due'] });
    },
  });

  const deleteCard = useMutation({
    mutationFn: () => api.deleteCard(deckId, card.id),
    onSuccess: () => {
      setIsDeleteDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    },
  });

  const promptImages = card.images.filter((image) => image.side === 'PROMPT');
  const answerImages = card.images.filter((image) => image.side === 'ANSWER');
  const promptInlineImageUrls = getMarkdownImageUrls(card.promptRichText);
  const answerInlineImageUrls = getMarkdownImageUrls(card.answerRichText);
  const unreferencedPromptImages = promptImages.filter((image) => !promptInlineImageUrls.has(image.url));
  const unreferencedAnswerImages = answerImages.filter((image) => !answerInlineImageUrls.has(image.url));
  const typeStyle = CARD_TYPE_STYLES[card.type];
  const dueStatus = formatNextReview(card.reviewSummary?.nextDueAt);
  const thumbnailUrl =
    promptImages[0]?.url ?? getFirstMarkdownImageUrl(card.promptRichText) ?? card.images[0]?.url ?? null;
  const contentPreview = getCollapsedCardText(card.promptRichText, Boolean(thumbnailUrl));

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (selectionMode) {
      onSelectedChange?.(!selected);
      return;
    }
    setIsViewing(true);
  };

  return (
    <div className="group relative border-b last:border-b-0">
      <div className={`absolute inset-y-0 left-0 w-1 ${typeStyle.bar}`} aria-hidden="true" />
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${contentPreview}`}
        onClick={() => (selectionMode ? onSelectedChange?.(!selected) : setIsViewing(true))}
        onKeyDown={handleRowKeyDown}
        className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-3 pl-4 pr-2 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:items-center sm:gap-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          {selectionMode && (
            <Checkbox
              checked={selected}
              aria-label={`Select ${contentPreview}`}
              onCheckedChange={(checked) => onSelectedChange?.(Boolean(checked))}
              onClick={(event) => event.stopPropagation()}
            />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <CardThumbnail url={thumbnailUrl} />
              <p className="min-w-0 truncate text-sm font-medium leading-5 text-foreground">{contentPreview}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:gap-x-3">
            <span>{typeStyle.label}</span>
            {card.tags.length > 0 && <span className="max-w-[18rem] truncate">{card.tags.join(', ')}</span>}
            {(promptImages.length > 0 || answerImages.length > 0) && (
              <span className="inline-flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5" />
                {formatImageCaption(promptImages.length, answerImages.length)}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 ${dueStatus.isUrgent ? 'text-destructive' : ''}`}>
              <CalendarClock className="h-3.5 w-3.5" />
              {dueStatus.label}
            </span>
            <span className="inline-flex items-center gap-1">
              <Repeat2 className="h-3.5 w-3.5" />
              {card.reviewSummary?.reviewCount ?? 0} reviewed
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <div
            className="flex items-center gap-1"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Dialog open={isEditing} onOpenChange={setIsEditing}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" aria-label="Edit card">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Edit Card</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
                  <MarkdownCardEditor
                    label="Front side (Prompt)"
                    value={promptRichText}
                    onChange={setPrompt}
                    onImage={async (file) => {
                      const image = await api.uploadCardImage(card.id, 'PROMPT', file);
                      void queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
                      return image.url;
                    }}
                  />
                  <MarkdownCardEditor
                    label="Back side (Answer)"
                    value={answerRichText}
                    onChange={setAnswer}
                    onImage={async (file) => {
                      const image = await api.uploadCardImage(card.id, 'ANSWER', file);
                      void queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
                      return image.url;
                    }}
                  />
                  <div className="flex items-center space-x-2 rounded-md border bg-muted/40 p-3">
                    <Checkbox
                      id={`reset-review-date-${card.id}`}
                      checked={resetReviewDate}
                      onCheckedChange={(checked) => setResetReviewDate(Boolean(checked))}
                    />
                    <Label htmlFor={`reset-review-date-${card.id}`} className="cursor-pointer text-sm">
                      Reset review date to now
                    </Label>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => updateCard.mutate()} disabled={updateCard.isPending}>
                    Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            {onMove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8"
                aria-label="Move card"
                onClick={onMove}
              >
                <FolderInput className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive sm:h-8 sm:w-8"
              aria-label="Delete card"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <ConfirmDialog
              open={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
              title="Delete card?"
              description="This card will be permanently removed from the deck and future reviews."
              confirmLabel="Delete card"
              isPending={deleteCard.isPending}
              onConfirm={() => deleteCard.mutate()}
            />
          </div>
          <Maximize2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>

      <Dialog open={isViewing} onOpenChange={setIsViewing}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] max-w-none overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-lg">
          <DialogHeader className="border-b px-4 py-4 sm:px-6">
            <DialogTitle className="pr-8">{contentPreview}</DialogTitle>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{typeStyle.label}</span>
              {card.tags.length > 0 && <span>{card.tags.join(', ')}</span>}
              <span className={`inline-flex items-center gap-1 ${dueStatus.isUrgent ? 'text-destructive' : ''}`}>
                <CalendarClock className="h-3.5 w-3.5" />
                {dueStatus.label}
              </span>
              <span className="inline-flex items-center gap-1">
                <Repeat2 className="h-3.5 w-3.5" />
                {card.reviewSummary?.reviewCount ?? 0} reviewed
              </span>
            </div>
          </DialogHeader>

          <div className="grid max-h-[calc(100dvh-6rem)] gap-0 overflow-y-auto lg:max-h-[78vh] lg:grid-cols-2">
            <section className="space-y-4 border-b p-4 sm:p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question</p>
              <MarkdownPreview value={card.promptRichText} className="text-base" />
              {unreferencedPromptImages.length > 0 && <CardImages images={unreferencedPromptImages} />}
            </section>

            <section className="space-y-4 p-4 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Answer</p>
              <MarkdownPreview value={card.answerRichText} className="text-base" />
              {unreferencedAnswerImages.length > 0 && <CardImages images={unreferencedAnswerImages} />}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardThumbnail({ url }: { url: string | null }) {
  const fallback = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground sm:h-12 sm:w-12">
      <ImageIcon className="h-5 w-5" />
    </span>
  );

  return (
    <AuthenticatedImage
      src={url}
      alt=""
      className="h-10 w-10 shrink-0 rounded-md border bg-muted object-cover sm:h-12 sm:w-12"
      fallback={fallback}
    />
  );
}

function CardImages({ images }: { images: APICard['images'] }) {
  return (
    <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:flex-wrap">
      {images.map((image) => (
        <AuthenticatedImage
          src={image.url}
          alt=""
          key={image.id}
          className="aspect-square w-full rounded-md border object-cover sm:h-24 sm:w-24"
          fallback={
            <span className="flex aspect-square w-full items-center justify-center rounded-md border bg-muted text-muted-foreground sm:h-24 sm:w-24">
              <ImageIcon className="h-5 w-5" />
            </span>
          }
        />
      ))}
    </div>
  );
}

function getCollapsedCardText(value: string, hasPromptImage: boolean): string {
  const text = stripRenderedText(value);
  return text || (hasPromptImage ? 'Image prompt' : 'Untitled card');
}

function getFirstMarkdownImageUrl(value: string): string | null {
  return getMarkdownImageUrls(value).values().next().value ?? null;
}

function getMarkdownImageUrls(value: string): Set<string> {
  const urls = new Set<string>();

  for (const match of value.matchAll(/!\[[^\]]*]\(([^)\s|]+)(?:\|[^)]*)?\)/g)) {
    if (match[1]) urls.add(match[1]);
  }

  for (const match of value.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]+)?]]/g)) {
    if (match[1]) urls.add(match[1]);
  }

  return urls;
}

function stripRenderedText(value: string): string {
  const rendered = renderMarkdown(value);

  if (typeof window !== 'undefined' && 'DOMParser' in window) {
    const doc = new DOMParser().parseFromString(rendered, 'text/html');
    return normalizePreviewText(doc.body.textContent ?? '');
  }

  return normalizePreviewText(
    rendered
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"'),
  );
}

function normalizePreviewText(value: string): string {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[`*_~>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatImageCaption(promptCount: number, answerCount: number): string {
  if (promptCount > 0 && answerCount > 0) return `${promptCount + answerCount} images`;
  if (promptCount > 0) return promptCount === 1 ? 'Prompt image' : `${promptCount} prompt images`;
  return answerCount === 1 ? 'Answer image' : `${answerCount} answer images`;
}

function formatNextReview(value?: string | null): { label: string; isUrgent: boolean } {
  if (!value) return { label: 'No review scheduled', isUrgent: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: 'No review scheduled', isUrgent: false };
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfDueDay.getTime() - startOfToday.getTime()) / 86_400_000);

  if (dayDiff < 0) return { label: 'Overdue', isUrgent: true };
  if (dayDiff === 0) return { label: 'Due today', isUrgent: true };
  if (dayDiff === 1) return { label: 'Tomorrow', isUrgent: false };
  if (dayDiff <= 30) return { label: `In ${dayDiff} days`, isUrgent: false };

  return {
    label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    isUrgent: false,
  };
}
