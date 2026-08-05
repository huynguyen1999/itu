import { useState, useRef, useEffect, ChangeEvent, DragEvent } from 'react';
import { UploadCloud, FileText, Trash2, AlertCircle, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Checkbox } from '@/shared/ui/checkbox';
import { Label } from '@/shared/ui/label';
import { downloadCsvTemplate, downloadExcelTemplate, downloadJsonTemplate } from '../import/importTemplates';
import type { ImportCardInput, ParsedCard } from '../import/importTypes';
import {
  detectDelimiter,
  mapRowsToCards,
  parseDelimitedText,
  parseJsonCards,
  parsePastedCards,
  validateImportedCard,
} from '../import/parseImportCards';

interface CardImporterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDeckName?: string;
  readOnlyDeckName?: boolean;
  onImportSuccess: () => void;
  apiClient: {
    importCards: (deckName: string, items: ImportCardInput[]) => Promise<unknown>;
    decks?: (params?: { limit?: number }) => Promise<{ data: Array<{ title: string }> }>;
  };
}

export function CardImporterModal({
  open,
  onOpenChange,
  defaultDeckName = '',
  readOnlyDeckName = false,
  onImportSuccess,
  apiClient,
}: CardImporterModalProps) {
  const [deckName, setDeckName] = useState(defaultDeckName);
  const [existingDecks, setExistingDecks] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importSessionRef = useRef(0);

  // Reset deck name when modal default name changes
  useEffect(() => {
    setDeckName(defaultDeckName);
  }, [defaultDeckName]);

  // Load existing decks for autocomplete dropdown
  useEffect(() => {
    if (open && !readOnlyDeckName && apiClient.decks) {
      apiClient
        .decks({ limit: 50 })
        .then((res) => {
          const titles = res.data.map((deck) => deck.title);
          setExistingDecks(titles);
        })
        .catch(() => {});
    }
  }, [open, readOnlyDeckName, apiClient]);

  // Parse file contents
  function handleFile(file: File) {
    const importSession = ++importSessionRef.current;
    const fileType = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    setParsedCards([]);
    setSubmitError(null);

    if (fileType === 'json') {
      reader.onload = (e) => {
        if (importSession !== importSessionRef.current) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(String(e.target?.result ?? ''));
        } catch {
          setSubmitError('Failed to parse JSON file. Check that the file contains valid JSON.');
          return;
        }

        try {
          const items = parseJsonCards(parsed);
          setParsedCards(items);
          setSubmitError(null);
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : 'Failed to read cards from JSON file');
        }
      };
      reader.readAsText(file);
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      reader.onload = (e) => {
        if (importSession !== importSessionRef.current) return;

        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });
          const items = mapRowsToCards(rows);
          setParsedCards(items);
          setSubmitError(null);
        } catch (err) {
          setSubmitError('Failed to parse Excel file');
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (fileType === 'csv' || fileType === 'tsv' || fileType === 'txt') {
      reader.onload = (e) => {
        if (importSession !== importSessionRef.current) return;

        try {
          const text = e.target?.result as string;
          const delimiter = fileType === 'tsv' ? '\t' : detectDelimiter(text);
          const rows = parseDelimitedText(text, delimiter);
          const items = mapRowsToCards(rows);
          setParsedCards(items);
          setSubmitError(null);
        } catch (err) {
          setSubmitError('Failed to parse text/CSV file');
        }
      };
      reader.readAsText(file);
    } else {
      setSubmitError('Unsupported file type');
    }
  }

  // Paste handler
  function handlePasteImport() {
    if (!pasteText.trim()) return;
    importSessionRef.current++;
    try {
      const items = parsePastedCards(pasteText);
      setParsedCards(items);
      setPasteText('');
      setSubmitError(null);
    } catch (err) {
      setSubmitError('Failed to parse pasted content. Check your formatting.');
    }
  }

  // Handlers for dragging & selecting
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  // Edit fields
  const handleUpdateCard = (id: string, updates: Partial<ParsedCard>) => {
    setParsedCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const newCard = { ...c, ...updates };
        newCard.errors = validateImportedCard(newCard.question, newCard.answer);
        return newCard;
      }),
    );
  };

  // Delete card from preview list
  const handleDeleteCard = (id: string) => {
    setParsedCards((prev) => prev.filter((c) => c.id !== id));
  };

  // Clear all parsed cards
  const handleClearAll = () => {
    setParsedCards([]);
    setSubmitError(null);
  };

  // Final Submit
  const handleImportSubmit = async () => {
    if (!deckName.trim()) {
      setSubmitError('Deck Name is required');
      return;
    }
    if (parsedCards.length === 0) {
      setSubmitError('No cards to import');
      return;
    }
    const hasErrors = parsedCards.some((c) => c.errors.length > 0);
    if (hasErrors) {
      setSubmitError('Please fix validation errors in the preview list first.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const itemsToSubmit = parsedCards.map((c) => ({
        question: c.question,
        answer: c.answer,
        nextReviewDate: c.nextReviewDate || undefined,
        generateReverse: c.generateReverse,
      }));

      await apiClient.importCards(deckName.trim(), itemsToSubmit);
      onImportSuccess();
      onOpenChange(false);
      setParsedCards([]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to import cards');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        <DialogHeader className="border-b border-border pb-3 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-foreground">
            <UploadCloud className="w-6 h-6 text-primary animate-pulse" />
            Import Multiple Flashcards
          </DialogTitle>
          <p className="text-sm text-muted-foreground mb-2">
            Quickly load multiple cards into your deck by copying and pasting text, or dragging files.
          </p>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-2 items-center">
            <span>Download format template:</span>
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="text-primary hover:underline font-semibold transition-all"
            >
              CSV
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={downloadExcelTemplate}
              className="text-primary hover:underline font-semibold transition-all"
            >
              Excel (XLSX)
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={downloadJsonTemplate}
              className="text-primary hover:underline font-semibold transition-all"
            >
              JSON
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-6">
          {/* Deck Configuration */}
          <div className="space-y-2">
            <Label htmlFor="deck-name-import" className="text-sm font-semibold text-foreground">
              Target Deck Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="deck-name-import"
              placeholder="e.g. Spanish Basics"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              disabled={readOnlyDeckName}
              list="existing-decks"
              className="bg-background border-input focus:ring-2 focus:ring-primary h-10 text-base disabled:opacity-80 disabled:cursor-not-allowed"
            />
            {!readOnlyDeckName && (
              <datalist id="existing-decks">
                {existingDecks.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
            )}
            <p className="text-xs text-muted-foreground">
              {readOnlyDeckName
                ? 'Importing directly into the current deck.'
                : 'If this deck name already exists, cards will be added to it. Otherwise, a new deck will be created.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* File Drag Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : 'border-muted-foreground/20 hover:border-primary/50 bg-background/50'
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground text-center">
                Drag & drop a file here, or <span className="text-primary font-semibold">browse</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1 text-center">Supports CSV, TSV, JSON, XLSX, XLS</p>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv,.tsv,.json,.xlsx,.xls,.txt"
                onChange={handleFileChange}
              />
            </div>

            {/* Direct Paste Area */}
            <div className="space-y-3 flex flex-col">
              <div className="flex-1 min-h-[120px]">
                <Textarea
                  placeholder="Paste comma/tab separated text, or JSON array...&#10;e.g.&#10;Bonjour,Hello&#10;Au revoir,Goodbye"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="font-mono text-sm w-full h-full bg-background border-input focus:ring-2 focus:ring-primary min-h-[120px]"
                />
              </div>
              <Button
                variant="outline"
                onClick={handlePasteImport}
                disabled={!pasteText.trim()}
                className="w-full text-foreground hover:bg-muted"
              >
                <FileText className="w-4 h-4 mr-2" />
                Parse Paste Area
              </Button>
            </div>
          </div>

          {/* Cards Preview Grid */}
          {parsedCards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-t border-border pt-4">
                <h3 className="font-semibold text-lg flex items-center gap-2 text-foreground">
                  Preview List ({parsedCards.length} cards detected)
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-muted-foreground hover:text-destructive"
                >
                  Clear All
                </Button>
              </div>

              <div className="border border-border rounded-lg overflow-x-auto shadow-inner bg-background/30">
                <table className="w-full text-sm text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Question / Front</th>
                      <th className="px-4 py-3 font-semibold">Answer / Back</th>
                      <th className="px-4 py-3 font-semibold w-40">Next Review</th>
                      <th className="px-4 py-3 font-semibold w-24 text-center">Reverse?</th>
                      <th className="px-4 py-3 font-semibold w-16 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {parsedCards.map((card) => (
                      <tr
                        key={card.id}
                        className={`hover:bg-muted/30 transition-colors ${
                          card.errors.length > 0 ? 'bg-destructive/5' : ''
                        }`}
                      >
                        <td className="px-4 py-2 vertical-align-top">
                          <div className="flex flex-col gap-1">
                            <Input
                              value={card.question}
                              onChange={(e) => handleUpdateCard(card.id, { question: e.target.value })}
                              className="bg-background border-input text-foreground h-8 text-sm"
                            />
                            {card.errors.includes('Question is required') && (
                              <span className="text-xs text-destructive flex items-center gap-1 font-medium mt-0.5">
                                <AlertCircle className="w-3.5 h-3.5" /> Required
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 vertical-align-top">
                          <div className="flex flex-col gap-1">
                            <Input
                              value={card.answer}
                              onChange={(e) => handleUpdateCard(card.id, { answer: e.target.value })}
                              className="bg-background border-input text-foreground h-8 text-sm"
                            />
                            {card.errors.includes('Answer is required') && (
                              <span className="text-xs text-destructive flex items-center gap-1 font-medium mt-0.5">
                                <AlertCircle className="w-3.5 h-3.5" /> Required
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="datetime-local"
                            value={card.nextReviewDate ? card.nextReviewDate.slice(0, 16) : ''}
                            onChange={(e) =>
                              handleUpdateCard(card.id, {
                                nextReviewDate: e.target.value ? new Date(e.target.value).toISOString() : '',
                              })
                            }
                            className="bg-background border-input text-foreground h-8 text-sm font-mono"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={card.generateReverse}
                              onCheckedChange={(checked) => handleUpdateCard(card.id, { generateReverse: !!checked })}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCard(card.id)}
                            className="text-muted-foreground hover:text-destructive w-8 h-8 rounded-full"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Errors & Submitting */}
        <div className="border-t border-border pt-4 flex-shrink-0 space-y-4">
          {submitError && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 flex items-start gap-2 text-sm font-medium">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>All imports are atomic. Valid past dates are kept as-is.</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="h-10 text-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleImportSubmit}
                disabled={isSubmitting || parsedCards.length === 0}
                className="h-10 px-6 font-semibold bg-primary text-primary-foreground hover:bg-primary/95 shadow-md hover:shadow-lg transition-all"
              >
                {isSubmitting ? 'Importing...' : `Import ${parsedCards.length} Cards`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
