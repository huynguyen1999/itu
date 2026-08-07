import { useState } from 'react';
import { ArrowLeft, Filter, Search, Tag as TagIcon, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useJournalEntries, useJournalTags } from './journalQueries';
import { JournalEntryCard } from './components/JournalEntryCard';
import type { ExpenseCategory, JournalEntryKind } from './journal.types';

export function JournalSearchPage() {
  const navigate = useNavigate();
  const { data: tags = [] } = useJournalTags();

  const [kind, setKind] = useState<JournalEntryKind | undefined>(undefined);
  const [tagId, setTagId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<ExpenseCategory | undefined>(undefined);
  const [query, setQuery] = useState('');

  const filter = {
    kind,
    tagId,
    category,
    query: query.trim() || undefined,
  };

  const { data: entries = [], isLoading } = useJournalEntries(filter);

  const clearFilters = () => {
    setKind(undefined);
    setTagId(undefined);
    setCategory(undefined);
    setQuery('');
  };

  const hasActiveFilters = Boolean(kind || tagId || category || query.trim());

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/journal')}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Journal
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-medium transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear Filters
          </button>
        )}
      </div>

      {/* SEARCH HEADER & FILTERS */}
      <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search entries by title, content, merchant, attachment file..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1 text-slate-400 font-medium mr-1">
            <Filter className="w-3.5 h-3.5" />
            Filters:
          </div>

          <select
            value={kind || ''}
            onChange={(e) => setKind((e.target.value as JournalEntryKind) || undefined)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Kinds</option>
            <option value="NOTE">NOTE</option>
            <option value="WEEKLY_REVIEW">WEEKLY REVIEW</option>
            <option value="EXPENSE">EXPENSE</option>
            <option value="WORKOUT">WORKOUT</option>
          </select>

          <select
            value={tagId || ''}
            onChange={(e) => setTagId(e.target.value || undefined)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.name}
              </option>
            ))}
          </select>

          <select
            value={category || ''}
            onChange={(e) => setCategory((e.target.value as ExpenseCategory) || undefined)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Categories</option>
            <option value="FOOD">FOOD</option>
            <option value="TRANSPORT">TRANSPORT</option>
            <option value="SHOPPING">SHOPPING</option>
            <option value="BILLS">BILLS</option>
            <option value="HEALTH">HEALTH</option>
            <option value="EDUCATION">EDUCATION</option>
            <option value="ENTERTAINMENT">ENTERTAINMENT</option>
            <option value="FITNESS">FITNESS</option>
            <option value="TRAVEL">TRAVEL</option>
            <option value="OTHER">OTHER</option>
          </select>
        </div>
      </div>

      {/* RESULTS LIST */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Results ({entries.length})
        </div>

        {isLoading ? (
          <div className="text-xs text-slate-500 py-6">Searching entries...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
            <Search className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-300">No matching entries found</div>
            <p className="text-xs text-slate-500">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entries.map((entry) => (
              <JournalEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
