import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../shared/api/client';
import type { DueItem, ReviewGrade } from '../../shared/api/client';
import { AiFeedbackPanel } from '@/features/ai';
import { MarkdownPreview } from '../../shared/markdown/MarkdownPreview';
import { AuthenticatedImage } from '../../shared/ui/AuthenticatedImage';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import { AlertCircle, Eye, Keyboard, LibraryBig, LoaderCircle, PlayCircle, SkipForward } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthProvider';
import { createUlid } from '@/shared/sync/syncIdentity';
import { PageHeader } from '@/shared/ui/PageHeader';

const grades = [
  { value: 'AGAIN', label: 'Again', shortcut: '1', className: 'border-red-200 text-red-700 hover:bg-red-50' },
  { value: 'HARD', label: 'Hard', shortcut: '2', className: 'border-amber-200 text-amber-700 hover:bg-amber-50' },
  { value: 'GOOD', label: 'Good', shortcut: '3', className: 'border-primary/30 text-primary hover:bg-primary/5' },
  { value: 'EASY', label: 'Easy', shortcut: '4', className: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' },
] as const;

export function ReviewPage() {
  const canUseAi = useAuth().user?.permissions?.includes('AI_USE') ?? false;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deckId = searchParams.get('deckId') ?? undefined;
  const due = useQuery({ queryKey: ['due', deckId], queryFn: () => api.due(deckId) });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [cardStartedAt, setCardStartedAt] = useState(() => Date.now());
  const [skippedCount, setSkippedCount] = useState(0);
  const [gradedCount, setGradedCount] = useState(0);

  const current = useMemo<DueItem | undefined>(() => due.data?.[index], [due.data, index]);
  const reviewSides = useMemo(() => {
    if (!current) return null;
    const isReverse = current.state.direction === 'BACK_TO_FRONT';
    return {
      promptHtml: isReverse ? current.card.answerRichText : current.card.promptRichText,
      answerHtml: isReverse ? current.card.promptRichText : current.card.answerRichText,
      promptImageSide: isReverse ? 'ANSWER' : 'PROMPT',
      answerImageSide: isReverse ? 'PROMPT' : 'ANSWER',
    } as const;
  }, [current]);

  useEffect(() => {
    setRevealed(false);
    setUserAnswer('');
    setCardStartedAt(Date.now());
  }, [current?.card.id, current?.state.direction]);

  const start = useMutation({
    mutationFn: () => api.startSession(deckId, 'DUE'),
    onSuccess: (session) => setSessionId(session.id),
  });

  const review = useMutation({
    mutationFn: ({ grade, idempotencyKey }: { grade: ReviewGrade; idempotencyKey: string }) =>
      api.submitReview(sessionId!, {
        cardId: current!.card.id,
        direction: current!.state.direction,
        grade,
        userAnswer,
        responseMs: Date.now() - cardStartedAt,
        idempotencyKey,
      }),
    onSuccess: () => {
      setGradedCount((value) => value + 1);
      setIndex((value) => value + 1);
    },
  });

  const submitGrade = (grade: ReviewGrade) => {
    review.mutate({ grade, idempotencyKey: createUlid() });
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.isContentEditable;

      if (!isTyping && event.key.toLowerCase() === 's' && !review.isPending) {
        event.preventDefault();
        setSkippedCount((value) => value + 1);
        setIndex((value) => value + 1);
        return;
      }

      if (!revealed && !isTyping && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        setRevealed(true);
        return;
      }

      if (!revealed || review.isPending || isTyping) return;
      const grade = grades.find((item) => item.shortcut === event.key);
      if (!grade) return;
      event.preventDefault();
      submitGrade(grade.value);
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [revealed, review]);

  if (sessionId && !current && due.isSuccess) {
    return (
      <div className="space-y-5">
        <PageHeader
          kicker="Learning"
          title="Review complete"
          description={`${gradedCount} card${gradedCount === 1 ? '' : 's'} reviewed in this session.`}
        />
        <AiFeedbackPanel
          sessionId={sessionId}
          canUseAi={canUseAi && gradedCount > 0}
          emptySession={gradedCount === 0}
          reviewedCount={gradedCount}
          onFinish={() => {
            navigate('/');
          }}
        />
      </div>
    );
  }

  if (!sessionId) {
    if (due.isLoading) {
      return (
        <ReviewStateCard
          icon={<LoaderCircle className="h-7 w-7 animate-spin text-primary" />}
          title="Preparing your review"
          description="Finding the cards that are ready to strengthen today."
        />
      );
    }

    if (due.isError) {
      return (
        <ReviewStateCard
          icon={<AlertCircle className="h-7 w-7 text-destructive" />}
          title="We couldn't load your review"
          description="Check your connection and try again. Your progress is safe."
          action={
            <Button className="w-full" onClick={() => due.refetch()}>
              Try again
            </Button>
          }
        />
      );
    }

    if (due.data?.length === 0) {
      return (
        <ReviewStateCard
          icon={<LibraryBig className="h-7 w-7 text-primary" />}
          title="You're caught up"
          description="No cards are due right now. Add cards to a deck or come back for your next scheduled review."
          action={
            <Button className="w-full" onClick={() => navigate('/learn/decks')}>
              Browse your decks
            </Button>
          }
        />
      );
    }

    return (
      <ReviewStateCard
        icon={<PlayCircle className="h-8 w-8 text-primary" />}
        eyebrow="Today's review"
        title={`${due.data?.length ?? 0} cards ready`}
        description="A focused session now will keep these memories strong."
        action={
          <Button
            size="lg"
            className="w-full text-base font-semibold"
            onClick={() => start.mutate()}
            disabled={start.isPending}
          >
            {start.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {start.isPending ? 'Starting session' : 'Start review'}
          </Button>
        }
        footer="You can type an answer before revealing the card."
      />
    );
  }

  if (!current || !reviewSides) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-12 pt-1 animate-in fade-in duration-300">
      <PageHeader
        kicker="Learning"
        title="Review"
        description="Recall the answer, reveal it when ready, then grade the card."
      />
      <div className="flex items-center gap-3 px-1">
        <span className="shrink-0 text-sm font-medium text-slate-500">
          Card {index + 1} of {due.data?.length}
        </span>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="Review progress"
          aria-valuemin={0}
          aria-valuemax={due.data?.length ?? 0}
          aria-valuenow={index}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${(index / (due.data?.length ?? 1)) * 100}%` }}
          />
        </div>
        {skippedCount > 0 && <span className="text-xs text-slate-400">{skippedCount} skipped</span>}
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <CardContent className="p-0">
          <div className="flex min-h-[240px] flex-col justify-center p-7 sm:p-10 md:min-h-[280px] md:p-12">
            <MarkdownPreview value={reviewSides!.promptHtml} className="prose-lg mx-auto text-center text-slate-900" />

            {current.card.images.some((img) => img.side === reviewSides!.promptImageSide) && (
              <div className="flex justify-center gap-4 mt-8 flex-wrap">
                {current.card.images
                  .filter((image) => image.side === reviewSides!.promptImageSide)
                  .map((image) => (
                    <AuthenticatedImage
                      src={image.url}
                      alt=""
                      key={image.id}
                      className="max-w-full h-auto max-h-64 rounded-lg shadow-sm border"
                    />
                  ))}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t bg-slate-50/80 p-5 sm:p-6 md:p-8">
            <Label htmlFor="answer" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Your Answer
            </Label>
            <Textarea
              id="answer"
              className="min-h-[96px] resize-y bg-white text-base shadow-sm"
              value={userAnswer}
              onChange={(event) => setUserAnswer(event.target.value)}
              placeholder="Recall the answer in your own words…"
              disabled={revealed}
            />
          </div>

          {revealed && (
            <div className="p-8 md:p-12 border-t bg-white min-h-[200px] animate-in slide-in-from-top-4 fade-in duration-500">
              <Label className="text-xs font-semibold text-primary uppercase tracking-wider mb-4 block text-center">
                Correct Answer
              </Label>
              <MarkdownPreview
                value={reviewSides!.answerHtml}
                className="prose-lg mx-auto text-center text-slate-800"
              />

              {current.card.images.some((img) => img.side === reviewSides!.answerImageSide) && (
                <div className="flex justify-center gap-4 mt-8 flex-wrap">
                  {current.card.images
                    .filter((image) => image.side === reviewSides!.answerImageSide)
                    .map((image) => (
                      <AuthenticatedImage
                        src={image.url}
                        alt=""
                        key={image.id}
                        className="max-w-full h-auto max-h-64 rounded-lg shadow-sm border"
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-20 flex justify-center pt-2 md:bottom-6">
        {!revealed ? (
          <div className="w-full max-w-sm space-y-2 text-center">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button
                size="lg"
                className="w-full gap-2 shadow-lg transition-shadow hover:shadow-xl"
                onClick={() => setRevealed(true)}
              >
                <Eye size={18} /> Reveal answer
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setSkippedCount((value) => value + 1);
                  setIndex((value) => value + 1);
                }}
              >
                <SkipForward className="h-4 w-4" />
                Skip
              </Button>
            </div>
            <p className="hidden items-center justify-center gap-1.5 text-xs text-slate-400 sm:flex">
              <Keyboard className="h-3.5 w-3.5" /> Space to reveal · S to skip
            </p>
          </div>
        ) : (
          <div className="grid w-full max-w-3xl grid-cols-2 gap-2 rounded-xl border bg-white/95 p-2 shadow-lg backdrop-blur sm:grid-cols-5 sm:gap-3">
            {grades.map((grade) => (
              <Button
                key={grade.value}
                variant="outline"
                size="lg"
                className={`border font-semibold transition-colors ${grade.className}`}
                onClick={() => submitGrade(grade.value)}
                disabled={review.isPending}
              >
                <span>{grade.label}</span>
                <kbd className="hidden rounded border bg-white/70 px-1.5 py-0.5 font-mono text-[10px] font-normal text-slate-400 sm:inline">
                  {grade.shortcut}
                </kbd>
              </Button>
            ))}
            <Button
              variant="ghost"
              size="lg"
              className="gap-2 text-slate-500"
              onClick={() => {
                setSkippedCount((value) => value + 1);
                setIndex((value) => value + 1);
              }}
              disabled={review.isPending}
            >
              <SkipForward className="h-4 w-4" />
              Skip <kbd className="hidden text-[10px] sm:inline">S</kbd>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewStateCard({
  icon,
  eyebrow,
  title,
  description,
  action,
  footer,
}: {
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  footer?: string;
}) {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Learning" title="Review" description="A focused session for strengthening what you know." />
      <div className="flex min-h-[65vh] items-center justify-center animate-in fade-in duration-500">
        <Card className="w-full max-w-md border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardContent className="space-y-6 p-7 text-center sm:p-9">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">{icon}</div>
            <div className="space-y-2">
              {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h2>
              <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
            {action}
            {footer && <p className="text-xs text-slate-400">{footer}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
