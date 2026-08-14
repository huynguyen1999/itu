import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../shared/api/client';
import type { CardGrading } from '../../shared/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { BrainCircuit, CheckCircle2, Settings2, Target } from 'lucide-react';
import { MarkdownPreview } from '../../shared/markdown/MarkdownPreview';
import { useGrowthSync } from '@/features/growth';
import { studyCompletionMessage, studyReceiptAccountXp } from '@/features/review';
import { parseSseEventLine } from '../../shared/utils/sse';

interface DisplayFeedback {
  id: string;
  userId: string;
  sessionId: string;
  summary: string;
  cardGradings: CardGrading[];
  confidence?: number | null;
  gradePoint?: number | null;
  createdAt: string;
}

export function AiFeedbackPanel({
  sessionId,
  onFinish,
  canUseAi = true,
  emptySession = false,
  reviewedCount = 0,
}: {
  sessionId: string;
  onFinish: () => void;
  canUseAi?: boolean;
  emptySession?: boolean;
  reviewedCount?: number;
}) {
  const [streamedFeedback, setStreamedFeedback] = useState<DisplayFeedback | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGradingLoading, setIsGradingLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamErrorCode, setStreamErrorCode] = useState<string | null>(null);
  const [rating, setRating] = useState(8);
  const [showRatingForm, setShowRatingForm] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [wantsAiReview, setWantsAiReview] = useState(false);
  const [completedReviewedCount, setCompletedReviewedCount] = useState(reviewedCount);
  const { growthReceipts } = useGrowthSync();
  const completionReceipt = growthReceipts.find(
    (receipt) => receipt.sourceType === 'REVIEW_DECK' && receipt.sourceId === sessionId,
  );
  const navigate = useNavigate();
  const aiCredentialsQuery = useQuery({
    queryKey: ['ai-credentials'],
    queryFn: () => api.listAiCredentials(),
    enabled: canUseAi,
  });
  const hasUsableAiCredentials = aiCredentialsQuery.data?.some((credential) => credential.usable) ?? false;

  const cancelledRef = useRef(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const feedbackQuery = useQuery({
    queryKey: ['session-feedback', sessionId],
    queryFn: () => api.sessionFeedback(sessionId),
    enabled: sessionSaved,
  });

  const feedbackData = feedbackQuery.data;

  useEffect(() => {
    if (feedbackData) {
      const cardGradings: CardGrading[] = feedbackData.weakAreas.map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return { cardId: '', correctness: 'INCORRECT', explanation: item };
        }
      });
      const gradePoint = feedbackData.nextSteps[0] ? Number(feedbackData.nextSteps[0]) : undefined;
      setStreamedFeedback({
        ...feedbackData,
        cardGradings,
        gradePoint,
      });
      setShowRatingForm(false);
      return;
    }

    if (!wantsAiReview || feedbackQuery.isLoading || feedbackData || feedbackQuery.isError) {
      return;
    }

    let active = true;
    cancelledRef.current = false;

    const runFeedback = async () => {
      setIsStreaming(true);
      setIsGradingLoading(false);
      setStreamError(null);
      setStreamErrorCode(null);
      let buffer = '';
      let summary = '';

      try {
        const stream = await api.sessionSummaryStream(sessionId);
        const reader = stream.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();

        const processLine = (line: string) => {
          const parsedLine = parseSseEventLine<{ chunk?: string; error?: string }>(line);
          if (!parsedLine.isData || !parsedLine.data) return;
          if (parsedLine.error) {
            throw new AiStreamError(parsedLine.error, parsedLine.code ?? undefined);
          }
          const chunk = parsedLine.data.chunk;
          if (chunk) {
            summary += chunk;
            setStreamedFeedback((prev) => ({
              id: sessionId,
              userId: '',
              sessionId,
              summary,
              cardGradings: prev?.cardGradings || [],
              confidence: prev?.confidence ?? null,
              gradePoint: prev?.gradePoint ?? null,
              createdAt: new Date().toISOString(),
            }));
          }
        };

        while (active && !cancelledRef.current) {
          const { done, value } = await reader.read();
          if (done || cancelledRef.current) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            processLine(event.trim());
          }
        }

        if (buffer.trim() && !cancelledRef.current) {
          processLine(buffer.trim());
        }

        if (!summary.trim()) {
          throw new Error('AI returned an empty session summary.');
        }

        if (!active || cancelledRef.current) return;

        setIsStreaming(false);
        setIsGradingLoading(true);
        const grading = await api.sessionGrading(sessionId, summary);
        if (!active || cancelledRef.current) return;
        setStreamedFeedback((prev) => ({
          id: sessionId,
          userId: '',
          sessionId,
          summary: prev?.summary || summary,
          cardGradings: grading.cardGradings,
          confidence: grading.confidence ?? null,
          gradePoint: grading.gradePoint,
          createdAt: new Date().toISOString(),
        }));
      } catch (err) {
        if (active && !cancelledRef.current) {
          setStreamError(err instanceof Error ? err.message : String(err));
          setStreamErrorCode(err instanceof AiStreamError ? (err.code ?? null) : errorCode(err));
        }
      } finally {
        if (active) {
          setIsStreaming(false);
          setIsGradingLoading(false);
          readerRef.current = null;
        }
      }
    };

    void runFeedback();

    return () => {
      active = false;
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
    };
  }, [feedbackData, feedbackQuery.isLoading, feedbackQuery.isError, sessionId, wantsAiReview]);

  useEffect(() => {
    if (streamedFeedback && !isStreaming && !isGradingLoading && !feedbackData && !cancelledRef.current) {
      setShowRatingForm(sessionSaved);
    }
  }, [streamedFeedback, isStreaming, isGradingLoading, feedbackData, sessionSaved]);

  const handleSkip = () => {
    cancelledRef.current = true;
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
    }
    setIsStreaming(false);
    setIsGradingLoading(false);

    setStreamedFeedback(null);
    setWantsAiReview(false);
    setShowRatingForm(false);
  };

  const handleSaveSession = async () => {
    setIsSaving(true);
    try {
      const completion = await api.completeSession(sessionId, rating);
      setCompletedReviewedCount(completion.reviewed ?? reviewedCount);
      setSessionSaved(true);
      setShowRatingForm(false);
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartAiReview = async () => {
    setStreamError(null);
    setStreamErrorCode(null);
    if (!hasUsableAiCredentials) {
      setStreamError('Configure Gemini in Settings to use AI');
      setStreamErrorCode('GEMINI_NOT_CONFIGURED');
      return;
    }
    setWantsAiReview(true);
    await feedbackQuery.refetch();
  };

  const showResults = streamedFeedback && !isStreaming && !isGradingLoading;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in slide-in-from-bottom-8 duration-700">
      <div className="flex flex-col items-center justify-center text-center space-y-4 mb-8">
        <div className="bg-green-100 p-4 rounded-full">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {emptySession ? 'No cards were graded' : 'Review session complete!'}
        </h1>
        <p className="text-muted-foreground text-lg">
          {emptySession
            ? 'Skipped cards are still due. Save this session when you are ready.'
            : 'Save your session, then choose whether to generate an AI review.'}
        </p>
        {!emptySession && (
          <p role="status" className="text-sm text-muted-foreground">
            {studyCompletionMessage(completedReviewedCount)}
            {completionReceipt && (
              <span className="ml-1 font-medium text-primary">
                Account XP: {studyReceiptAccountXp(completionReceipt)}
              </span>
            )}
          </p>
        )}
      </div>

      {sessionSaved && !wantsAiReview && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-center space-y-4">
            <div>
              <h3 className="font-bold text-lg text-slate-900">Generate AI review?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Get personalized feedback for this completed study session.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              {canUseAi &&
                (aiCredentialsQuery.isSuccess && !hasUsableAiCredentials ? (
                  <Button variant="outline" className="font-semibold" onClick={() => navigate('/settings?section=ai')}>
                    <Settings2 /> Configure Gemini in Settings
                  </Button>
                ) : (
                  <Button
                    className="font-semibold"
                    onClick={handleStartAiReview}
                    disabled={aiCredentialsQuery.isLoading}
                  >
                    <BrainCircuit className="h-4 w-4" />
                    Generate AI review
                  </Button>
                ))}
              <Button variant="outline" onClick={onFinish}>
                {canUseAi ? 'Not now' : 'Done'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {wantsAiReview && (
        <Card className="border-primary/20 shadow-lg shadow-primary/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <BrainCircuit className="w-24 h-24 text-primary" />
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <BrainCircuit className="h-5 w-5" />
              AI Session Insights
            </CardTitle>
            <CardDescription>Personalized feedback based on your review performance.</CardDescription>
          </CardHeader>
          <CardContent>
            {feedbackQuery.isError || streamError ? (
              <div className="space-y-4">
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                  {streamError || 'Unable to load AI feedback right now.'}
                </div>
                {streamErrorCode === 'GEMINI_NOT_CONFIGURED' ? (
                  <Button variant="outline" onClick={() => navigate('/settings?section=ai')}>
                    <Settings2 /> Open Settings → AI
                  </Button>
                ) : null}
                <Button variant="outline" onClick={onFinish}>
                  Done
                </Button>
              </div>
            ) : !streamedFeedback && !isStreaming ? (
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-sm">Initiating session insights...</p>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[90%]" />
              </div>
            ) : (
              <div className="mt-4 space-y-5">
                {(isStreaming || isGradingLoading) && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-slate-900 border"
                      onClick={handleSkip}
                    >
                      Stop AI review
                    </Button>
                  </div>
                )}

                <div className="rounded-md border bg-primary/5 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-primary">Summary</p>
                    <div className="flex items-center gap-2">
                      {streamedFeedback && typeof streamedFeedback.gradePoint === 'number' && (
                        <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-bold text-primary">
                          Grade: {streamedFeedback.gradePoint}%
                        </span>
                      )}
                      {streamedFeedback && typeof streamedFeedback.confidence === 'number' && (
                        <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-muted-foreground border">
                          {Math.round(streamedFeedback.confidence * 100)}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                  {streamedFeedback?.summary ? (
                    <MarkdownPreview value={streamedFeedback.summary} className="prose-sm leading-6 text-slate-800" />
                  ) : !isStreaming ? (
                    <span className="text-muted-foreground text-sm">No AI summary was returned.</span>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      Analyzing answers and generating summary...
                    </span>
                  )}
                </div>

                <div className="rounded-md border p-6 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 border-b pb-3">
                    <Target className="h-4 w-4 text-primary" />
                    Flashcard Answer Evaluations
                  </div>
                  {showResults ? (
                    streamedFeedback.cardGradings.length > 0 ? (
                      <div className="space-y-4">
                        {streamedFeedback.cardGradings.map((grading, index) => {
                          const correctnessColors = {
                            CORRECT: 'bg-green-50 text-green-700 border-green-200',
                            PARTIALLY_CORRECT: 'bg-amber-50 text-amber-700 border-amber-200',
                            INCORRECT: 'bg-destructive/5 text-destructive border-destructive/10',
                          };
                          const correctnessLabels = {
                            CORRECT: 'Correct',
                            PARTIALLY_CORRECT: 'Partially Correct',
                            INCORRECT: 'Incorrect',
                          };

                          return (
                            <div
                              key={grading.cardId || index}
                              className="rounded-lg border p-4 bg-slate-50/50 space-y-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold text-slate-500 uppercase">
                                  Flashcard #{index + 1}
                                </span>
                                <span
                                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${correctnessColors[grading.correctness]}`}
                                >
                                  {correctnessLabels[grading.correctness]}
                                </span>
                              </div>
                              <p className="text-sm text-slate-700 leading-relaxed">{grading.explanation}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No card evaluations were returned.</p>
                    )
                  ) : (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  )}
                </div>
                {showResults && (
                  <div className="flex justify-end">
                    <Button onClick={onFinish}>Done</Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showRatingForm && (
        <Card className="border-primary/20 bg-primary/5 animate-in slide-in-from-bottom-4 duration-500">
          <CardContent className="pt-6 text-center space-y-6">
            <div>
              <h3 className="font-bold text-lg text-slate-900">Rate this study session</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Your rating helps track progress and optimize future reviews.
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 max-w-md mx-auto">
              <span className="text-sm font-medium text-slate-400">1</span>
              <input
                type="range"
                min="1"
                max="10"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className="text-sm font-medium text-slate-400">10</span>
            </div>
            <div className="text-3xl font-black text-primary">{rating}</div>
            <Button className="w-full max-w-xs font-semibold" onClick={handleSaveSession} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Finish Study Session'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

class AiStreamError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null;
}
