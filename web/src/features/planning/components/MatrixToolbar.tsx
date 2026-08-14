import type { RefObject } from 'react';
import type { MatrixPreferences } from '@/shared/api/preferencesApi';
import type { TaskPriority } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/PageHeader';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Flag, ListFilter, Plus, Search, X } from 'lucide-react';
import type { SortMode } from '../planning.types';
import {
  MatrixSettingsPopover,
  type MatrixViewDisplaySettings,
} from '../MatrixSettingsPopover';

export type PriorityFilter = TaskPriority | 'ALL';

type MatrixToolbarProps = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  showSearch: boolean;
  searchQuery: string;
  sortMode: SortMode;
  priorityFilter: ReadonlySet<PriorityFilter>;
  hasActiveFilters: boolean;
  preferences?: MatrixPreferences;
  displaySettings: MatrixViewDisplaySettings;
  onSearchChange: (value: string) => void;
  onToggleSearch: () => void;
  onSortChange: (value: SortMode) => void;
  onTogglePriority: (priority: TaskPriority) => void;
  onResetPriorityFilter: () => void;
  onRemoveSearch: () => void;
  onClearFilters: () => void;
  onNewTask: () => void;
  onChangePreferences: (patch: Partial<MatrixPreferences>) => void;
  onChangeDisplay: (patch: Partial<MatrixViewDisplaySettings>) => void;
};

export function MatrixToolbar({
  searchInputRef,
  showSearch,
  searchQuery,
  sortMode,
  priorityFilter,
  hasActiveFilters,
  preferences,
  displaySettings,
  onSearchChange,
  onToggleSearch,
  onSortChange,
  onTogglePriority,
  onResetPriorityFilter,
  onRemoveSearch,
  onClearFilters,
  onNewTask,
  onChangePreferences,
  onChangeDisplay,
}: MatrixToolbarProps) {
  return (
    <>
      <PageHeader
        kicker="Prioritization & Matrix"
        title="Eisenhower Matrix"
        stickyControls={
          showSearch ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search tasks across all quadrants…"
                className="h-10 pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : null
        }
      >
        <div className="flex items-center gap-2">
          <Button
            variant={showSearch ? 'secondary' : 'ghost'}
            size="icon"
            aria-label="Search tasks"
            onClick={onToggleSearch}
          >
            <Search className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={hasActiveFilters && sortMode !== 'manual' ? 'secondary' : 'ghost'}
                size="icon"
                aria-label="Filter and sort tasks"
              >
                <ListFilter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter &amp; Sort</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ListFilter />
                  Sort by
                  <span className="ml-auto mr-2 text-xs text-muted-foreground">{sortLabel(sortMode)}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => onSortChange(value as SortMode)}>
                    <DropdownMenuRadioItem value="manual">Manual order</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="due">Due date</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="title">Title</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Flag />
                  Priority
                  <span className="ml-auto mr-2 text-xs text-muted-foreground">
                    {priorityFilterLabel(priorityFilter)}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuCheckboxItem checked={priorityFilter.has('ALL')} onCheckedChange={onResetPriorityFilter}>
                    All priorities
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={priorityFilter.has('HIGH')}
                    onCheckedChange={() => onTogglePriority('HIGH')}
                  >
                    <Flag className="mr-2 h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                    High
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={priorityFilter.has('MEDIUM')}
                    onCheckedChange={() => onTogglePriority('MEDIUM')}
                  >
                    <Flag className="mr-2 h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    Medium
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={priorityFilter.has('LOW')}
                    onCheckedChange={() => onTogglePriority('LOW')}
                  >
                    <Flag className="mr-2 h-3.5 w-3.5 fill-blue-500 text-blue-500" />
                    Low
                  </DropdownMenuCheckboxItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onClearFilters}>Restore defaults</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="gap-2" onClick={onNewTask}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New task</span>
          </Button>

          <FeatureSettingsButton title="Matrix settings">
            <MatrixSettingsPopover
              preferences={preferences}
              displaySettings={displaySettings}
              onChangePreferences={onChangePreferences}
              onChangeDisplay={onChangeDisplay}
            />
          </FeatureSettingsButton>
        </div>
      </PageHeader>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {searchQuery && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
              <Search className="h-3 w-3" />"{searchQuery}"
              <button
                onClick={onRemoveSearch}
                className="ml-0.5 hover:text-foreground"
                aria-label="Remove search filter"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {!priorityFilter.has('ALL') &&
            ([...priorityFilter] as TaskPriority[]).map((priority) => (
              <span
                key={priority}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
              >
                <Flag
                  className={`h-3 w-3 ${priority === 'HIGH' ? 'fill-rose-500 text-rose-500' : priority === 'MEDIUM' ? 'fill-amber-500 text-amber-500' : 'fill-blue-500 text-blue-500'}`}
                />
                {priority.toLowerCase()}
                <button
                  onClick={() => onTogglePriority(priority)}
                  className="ml-0.5 hover:text-foreground"
                  aria-label={`Remove ${priority} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          {sortMode !== 'manual' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
              <ListFilter className="h-3 w-3" />
              Sort: {sortLabel(sortMode)}
            </span>
          )}
          <button
            onClick={onClearFilters}
            className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}
    </>
  );
}

function sortLabel(mode: SortMode) {
  return (
    {
      created: 'Created',
      'created-desc': 'Created newest',
      'created-asc': 'Created oldest',
      'modified-desc': 'Modified newest',
      'modified-asc': 'Modified oldest',
      manual: 'Manual order',
      due: 'Due date',
      priority: 'Priority',
      title: 'Title',
    } as const
  )[mode];
}

function priorityFilterLabel(priorityFilter: ReadonlySet<PriorityFilter>) {
  if (priorityFilter.has('ALL')) return 'All';
  const labels = [...priorityFilter].map((priority) => priority.toLowerCase());
  return labels.length <= 2 ? labels.join(', ') : `${labels.length} selected`;
}
