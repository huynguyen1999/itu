import { Check, CornerDownRight, ListTodo, Plus, Trash2, X } from 'lucide-react';
import type { ProductivityTask, TaskTag } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';

export function TaskSubtasksSection({
  subtasks,
  newSubtaskTitle,
  onNewSubtaskTitleChange,
  onCreate,
  onToggle,
  onDelete,
}: {
  subtasks: ProductivityTask[];
  newSubtaskTitle: string;
  onNewSubtaskTitleChange: (value: string) => void;
  onCreate: (title: string) => void;
  onToggle: (subtask: ProductivityTask, isDone: boolean) => void;
  onDelete: (subtaskId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
        <span className="flex items-center gap-1.5">
          <ListTodo className="h-4 w-4 text-primary" />
          Subtasks ({subtasks.filter((subtask) => subtask.status === 'COMPLETED').length}/{subtasks.length})
        </span>
      </div>

      <div className="space-y-1.5">
        {subtasks.map((subtask) => {
          const isDone = subtask.status === 'COMPLETED';
          return (
            <div
              key={subtask.id}
              className="group flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs border border-border/60 hover:border-border transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onToggle(subtask, isDone)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    isDone ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                  }`}
                >
                  {isDone && <Check className="h-3 w-3 stroke-[3]" />}
                </button>
                <span className={`truncate text-foreground ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                  {subtask.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDelete(subtask.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (newSubtaskTitle.trim()) onCreate(newSubtaskTitle);
          }}
          className="flex items-center gap-2 rounded-lg border border-dashed border-input px-3 py-1.5 hover:border-primary transition-colors"
        >
          <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={newSubtaskTitle}
            onChange={(event) => onNewSubtaskTitleChange(event.target.value)}
            placeholder="Add subtask and press Enter..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {newSubtaskTitle.trim() && (
            <Button size="sm" type="submit" variant="ghost" className="h-6 px-2 text-xs text-primary">
              Add
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

export function TaskTagsSection({
  tags,
  allTags,
  onToggle,
}: {
  tags: ProductivityTask['tags'];
  allTags: TaskTag[];
  onToggle: (tagId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {tags.map(({ tag }) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs text-primary font-medium"
          >
            #{tag.name}
            <button type="button" onClick={() => onToggle(tag.id)} className="hover:text-rose-500 ml-0.5">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-input bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" /> Tag
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {allTags.map((tag) => {
              const isSelected = tags.some((assignment) => assignment.tag.id === tag.id);
              return (
                <DropdownMenuItem
                  key={tag.id}
                  onSelect={() => onToggle(tag.id)}
                  className="flex items-center justify-between text-xs cursor-pointer"
                >
                  <span>#{tag.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
