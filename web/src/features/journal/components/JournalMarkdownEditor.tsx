import { useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { MarkdownPreview } from '@/shared/markdown/MarkdownPreview';
import { useTheme } from '@/shared/ui/ThemeProvider';
import { Eye, Code, Sparkles, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/ui/button';

export type EditorMode = 'live' | 'source' | 'reading';
export type SaveStatus = 'saved' | 'syncing' | 'synced' | 'conflict';

function journalEditorTheme(isDarkMode: boolean) {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--itu-surface)',
        color: 'var(--itu-ink)',
        fontFamily: "'Manrope', system-ui, sans-serif",
      },
      '.cm-content': {
        minHeight: '100%',
        padding: '18px 20px',
        caretColor: 'var(--itu-teal-500)',
      },
      '.cm-line': { lineHeight: '1.65' },
      '.cm-scroller': { overflow: 'auto' },
      '.cm-gutters': {
        border: 0,
        backgroundColor: 'var(--itu-surface-2)',
        color: 'var(--itu-ink-faint)',
      },
      '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--itu-mint-50) 60%, transparent)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--itu-mint-50)', color: 'var(--itu-teal-700)' },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: 'color-mix(in srgb, var(--itu-teal-400) 28%, transparent)',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--itu-teal-500)' },
      '.cm-placeholder': { color: 'var(--itu-ink-faint)' },
    },
    { dark: isDarkMode },
  );
}

interface JournalMarkdownEditorProps {
  value: string;
  onChange: (newValue: string) => void;
  onSave?: (immediateValue: string) => void;
  saveStatus?: SaveStatus;
  placeholder?: string;
  minHeight?: string;
  frameless?: boolean;
}

export function JournalMarkdownEditor({
  value,
  onChange,
  onSave,
  saveStatus = 'saved',
  placeholder = 'Write in Markdown...',
  minHeight = '360px',
  frameless = true,
}: JournalMarkdownEditorProps) {
  const [mode, setMode] = useState<EditorMode>('live');
  const { theme } = useTheme();
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTextChange = (val: string) => {
    onChange(val);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      onSave?.(val);
    }, 750);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      onSave?.(value);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const isDarkMode = theme === 'dark';

  return (
    <div
      className={`journal-markdown-editor flex min-w-0 flex-col ${
        frameless ? 'bg-transparent' : 'overflow-hidden rounded-[var(--itu-radius-m)] border border-border bg-card'
      }`}
      onKeyDown={handleKeyDown}
    >
      {/* Editor Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs">
        <div className="flex items-center gap-1 rounded-[var(--itu-radius-s)] border border-border bg-muted/40 p-0.5">
          <Button
            type="button"
            variant={mode === 'live' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('live')}
            className="h-8 gap-1 px-2 text-[11px]"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            Live Preview
          </Button>
          <Button
            type="button"
            variant={mode === 'source' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('source')}
            className="h-8 gap-1 px-2 text-[11px]"
          >
            <Code className="w-3 h-3 text-muted-foreground" />
            Source
          </Button>
          <Button
            type="button"
            variant={mode === 'reading' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('reading')}
            className="h-8 gap-1 px-2 text-[11px]"
          >
            <Eye className="w-3 h-3 text-muted-foreground" />
            Reading
          </Button>
        </div>

        {/* Autosave Status */}
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground" aria-live="polite">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Check className="h-3 w-3 text-primary" /> Saved locally
            </span>
          )}
          {saveStatus === 'syncing' && (
            <span className="flex items-center gap-1 text-primary">
              <RefreshCw className="h-3 w-3 motion-safe:animate-spin" /> Syncing…
            </span>
          )}
          {saveStatus === 'synced' && (
            <span className="flex items-center gap-1 text-primary">
              <Check className="h-3 w-3" /> Synced
            </span>
          )}
          {saveStatus === 'conflict' && (
            <span className="flex items-center gap-1 text-destructive font-semibold">
              <AlertTriangle className="h-3 w-3" /> Conflict detected
            </span>
          )}
        </div>
      </div>

      {/* Content Canvas */}
      <div className="relative min-h-[360px] overflow-hidden rounded-[var(--itu-radius-s)] bg-card">
        {mode === 'reading' ? (
          <div className="prose min-h-[360px] max-w-none bg-card px-5 py-4 dark:prose-invert">
            <MarkdownPreview value={value} />
          </div>
        ) : (
          <CodeMirror
            value={value}
            height={minHeight}
            extensions={[markdown()]}
            theme={journalEditorTheme(isDarkMode)}
            onChange={handleTextChange}
            placeholder={placeholder}
            className="journal-markdown-editor__codemirror border-0 bg-card text-sm focus:outline-none"
            basicSetup={{
              lineNumbers: mode === 'source',
              foldGutter: false,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              highlightActiveLine: mode === 'source',
            }}
          />
        )}
      </div>
    </div>
  );
}
