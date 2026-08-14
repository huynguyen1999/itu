import { useEffect, useRef, useState } from 'react';
import { CheckSquare2, Columns3, EyeOff, List, ListFilter, MoreHorizontal, Plus, Printer, Search, X } from 'lucide-react';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
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
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import type { TaskPreferences } from '@/shared/api/preferencesApi';
import type { TaskList } from '@/shared/api/types';
import { PlanSettingsPopover } from '../PlanSettingsPopover';
import type { GroupMode, SortMode } from '../planning.types';

export function PlanningHeader({
  title,
  kicker,
  searchQuery,
  onSearchChange,
  groupMode,
  sortMode,
  displayMode,
  hideCompleted,
  hideDetails,
  taskPreferences,
  taskLists,
  onViewChange,
  onAddSection,
  onTaskPreferencesChange,
}: {
  title: string;
  kicker: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  groupMode: GroupMode;
  sortMode: SortMode;
  displayMode: 'list' | 'kanban';
  hideCompleted: boolean;
  hideDetails: boolean;
  taskPreferences?: TaskPreferences;
  taskLists: TaskList[];
  onViewChange: (patch: Partial<{ groupMode: GroupMode; sortMode: SortMode; displayMode: 'list' | 'kanban'; hideCompleted: boolean; hideDetails: boolean }>) => void;
  onAddSection: () => void;
  onTaskPreferencesChange: (patch: Partial<TaskPreferences>) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchDraft, setSearchDraft] = useState(searchQuery);

  useEffect(() => setSearchDraft(searchQuery), [searchQuery]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const commitSearch = () => onSearchChange(searchDraft.trim());
  const clearSearch = () => {
    setSearchDraft('');
    onSearchChange('');
    searchRef.current?.blur();
  };

  return (
    <PageHeader kicker={kicker} title={title} className="px-5 pt-4">
      <GroupAndSortMenu
        groupMode={groupMode}
        sortMode={sortMode}
        onGroupChange={(value) => onViewChange({ groupMode: value })}
        onSortChange={(value) => onViewChange({ sortMode: value })}
      />
      <ViewOptionsMenu
        displayMode={displayMode}
        hideCompleted={hideCompleted}
        hideDetails={hideDetails}
        onDisplayModeChange={(value) => onViewChange({ displayMode: value })}
        onHideCompletedChange={(value) => onViewChange({ hideCompleted: value })}
        onHideDetailsChange={(value) => onViewChange({ hideDetails: value })}
        onAddSection={onAddSection}
      />
      <div className="relative w-56">
        <button
          type="button"
          onClick={commitSearch}
          aria-label="Search tasks"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Search className="h-4 w-4" />
        </button>
        <Input
          ref={searchRef}
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitSearch();
            if (event.key === 'Escape') clearSearch();
          }}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="h-9 pl-9 pr-8"
        />
        {searchDraft || searchQuery ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <FeatureSettingsButton title="Plan settings">
        <PlanSettingsPopover
          taskPreferences={taskPreferences}
          taskLists={taskLists}
          onChange={onViewChange}
          onTaskPreferencesChange={onTaskPreferencesChange}
        />
      </FeatureSettingsButton>
    </PageHeader>
  );
}

function GroupAndSortMenu({
  groupMode,
  sortMode,
  onGroupChange,
  onSortChange,
}: {
  groupMode: GroupMode;
  sortMode: SortMode;
  onGroupChange: (value: GroupMode) => void;
  onSortChange: (value: SortMode) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={groupMode === 'project' && sortMode === 'created-desc' ? 'ghost' : 'secondary'} size="icon" aria-label="Group and sort tasks">
          <ListFilter className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Group &amp; Sort</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Columns3 />Group by<span className="ml-auto mr-2 text-xs text-muted-foreground">{groupLabel(groupMode)}</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup value={groupMode} onValueChange={(value) => onGroupChange(value as GroupMode)}>
              {(['project', 'time', 'tag', 'status', 'priority', 'created', 'section', 'none'] as GroupMode[]).map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>{groupLabel(value)}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><ListFilter />Sort by<span className="ml-auto mr-2 text-xs text-muted-foreground">{sortLabel(sortMode)}</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => onSortChange(value as SortMode)}>
              {(['manual', 'due', 'priority', 'created-desc', 'created-asc', 'modified-desc', 'modified-asc', 'title'] as SortMode[]).map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>{sortLabel(value)}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {(groupMode !== 'project' || sortMode !== 'created-desc') && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { onGroupChange('project'); onSortChange('created-desc'); }}>Restore defaults</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ViewOptionsMenu({
  displayMode,
  hideCompleted,
  hideDetails,
  onDisplayModeChange,
  onHideCompletedChange,
  onHideDetailsChange,
  onAddSection,
}: {
  displayMode: 'list' | 'kanban';
  hideCompleted: boolean;
  hideDetails: boolean;
  onDisplayModeChange: (value: 'list' | 'kanban') => void;
  onHideCompletedChange: (value: boolean) => void;
  onHideDetailsChange: (value: boolean) => void;
  onAddSection: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Task view options"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={displayMode} onValueChange={(value) => onDisplayModeChange(value as 'list' | 'kanban')} className="grid grid-cols-2 gap-1 p-1">
          <DropdownMenuRadioItem value="list" className="justify-center rounded-md px-2 pl-7"><List className="mr-1" />List</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="kanban" className="justify-center rounded-md px-2 pl-7"><Columns3 className="mr-1" />Kanban</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={!hideCompleted} onCheckedChange={(value) => onHideCompletedChange(!value)}><CheckSquare2 className="mr-2 h-4 w-4" />Show completed &amp; won&apos;t do</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={hideDetails} onCheckedChange={(value) => onHideDetailsChange(!!value)}><EyeOff className="mr-2 h-4 w-4" />Hide row details</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAddSection}><Plus />Add section</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.print()}><Printer />Print current view</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function groupLabel(mode: GroupMode) {
  return { time: 'Time', project: 'List', tag: 'Tag', status: 'Status', priority: 'Priority', created: 'Created', section: 'Section', none: 'None' }[mode];
}

function sortLabel(mode: SortMode) {
  return { manual: 'Manual order', due: 'Due date', priority: 'Priority', created: 'Created newest', 'created-desc': 'Created newest', 'created-asc': 'Created oldest', 'modified-desc': 'Modified newest', 'modified-asc': 'Modified oldest', title: 'Title' }[mode];
}
