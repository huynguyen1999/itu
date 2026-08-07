import { useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { MarkdownPreview } from '@/shared/markdown/MarkdownPreview';
import { useTheme } from '@/shared/ui/ThemeProvider';
import { Eye, Code, Sparkles, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/ui/button';

export type EditorMode = 'live' | 'source' | 'reading';
export type SaveStatus = 'saved' | 'syncing' | 'synced' | 'conflict';

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
      className={`flex flex-col ${
        frameless ? 'bg-transparent' : 'rounded-xl border border-border bg-card overflow-hidden'
      }`}
      onKeyDown={handleKeyDown}
    >
      {/* Editor Controls Bar */}
      <div className="flex items-center justify-between pb-3 text-xs border-b border-border/20 mb-2">
        <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/40">
          <Button
            type="button"
            variant={mode === 'live' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('live')}
            className="h-6 px-2 text-[11px] gap-1"
          >
            <Sparkles className="w-3 h-3 text-emerald-500" />
            Live Preview
          </Button>
          <Button
            type="button"
            variant={mode === 'source' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('source')}
            className="h-6 px-2 text-[11px] gap-1"
          >
            <Code className="w-3 h-3 text-muted-foreground" />
            Source
          </Button>
          <Button
            type="button"
            variant={mode === 'reading' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('reading')}
            className="h-6 px-2 text-[11px] gap-1"
          >
            <Eye className="w-3 h-3 text-muted-foreground" />
            Reading
          </Button>
        </div>

        {/* Autosave Status */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-muted-foreground/80">
              <Check className="w-3 h-3 text-emerald-500" /> Saved locally
            </span>
          )}
          {saveStatus === 'syncing' && (
            <span className="flex items-center gap-1 text-primary">
              <RefreshCw className="w-3 h-3 animate-spin" /> Syncing…
            </span>
          )}
          {saveStatus === 'synced' && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="w-3 h-3" /> Synced
            </span>
          )}
          {saveStatus === 'conflict' && (
            <span className="flex items-center gap-1 text-destructive font-semibold">
              <AlertTriangle className="w-3 h-3" /> Conflict detected
            </span>
          )}
        </div>
      </div>

      {/* Content Canvas */}
      <div className="min-h-[360px] relative">
        {mode === 'reading' ? (
          <div className="py-2 prose dark:prose-invert max-w-none min-h-[360px]">
            <MarkdownPreview value={value} />
          </div>
        ) : (
          <CodeMirror
            value={value}
            height={minHeight}
            extensions={[markdown()]}
            theme={isDarkMode ? oneDark : 'light'}
            onChange={handleTextChange}
            placeholder={placeholder}
            className="text-sm font-sans border-0 focus:outline-none bg-transparent"
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
