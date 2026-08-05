import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, CircleDot, Inbox, Tag } from 'lucide-react';
import { api } from '@/shared/api/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import {
  SectionRail,
  SectionRailBadge,
  SectionRailButton,
  SectionRailCreator,
  SectionRailDot,
  SectionRailLabel,
  SectionRailLink,
  SectionRailNav,
  SectionRailSection,
  SectionRailSections,
} from '@/shared/ui/SectionRail';
import { usePlanning } from '../PlanningContext';

const planningNavigation = [
  { to: '/inbox', label: 'Inbox', icon: Inbox, end: false },
  { to: '/plan/today', label: 'Today', icon: CalendarDays, end: false },
  { to: '/upcoming', label: 'Next 7 Days', icon: CircleDot, end: false },
] as const;

export function PlanningSidebar() {
  const { setSelectedTaskList, setSelectedTag, selectedTaskList, selectedTag } = usePlanning();
  const projects = useQuery({ queryKey: ['task-lists', 'with-counts'], queryFn: () => api.taskLists(true) });
  const tags = useQuery({ queryKey: ['task-tags'], queryFn: () => api.taskTags() });
  const queryClient = useQueryClient();
  const [projectTitle, setProjectTitle] = useState('');
  const [tagName, setTagName] = useState('');

  const createProject = useMutation({
    mutationFn: () => api.createProject({ title: projectTitle.trim() }),
    onSuccess: async (project) => {
      setProjectTitle('');
      setSelectedTaskList(project.id);
      setSelectedTag(null);
      await queryClient.invalidateQueries({ queryKey: ['task-lists'] });
    },
  });
  const createTag = useMutation({
    mutationFn: () => api.createTaskTag({ name: tagName.trim() }),
    onSuccess: async (tag) => {
      setTagName('');
      setSelectedTag(tag.id);
      setSelectedTaskList(null);
      await queryClient.invalidateQueries({ queryKey: ['task-tags'] });
    },
  });

  const projectColor = (color: string) => {
    const colors: Record<string, string> = {
      TEAL: '#0f766e',
      BLUE: '#2563eb',
      VIOLET: '#7c3aed',
      ROSE: '#e11d48',
      AMBER: '#d97706',
      EMERALD: '#059669',
    };
    return colors[color] ?? '#64748b';
  };

  const tagColor = (color: string) => projectColor(color);

  return (
    <SectionRail kicker="Planning" title="Views" ariaLabel="Planning navigation">
      <SectionRailNav>
        {planningNavigation.map(({ to, label, icon, end }) => (
          <SectionRailLink key={to} to={to} label={label} icon={icon} end={end} />
        ))}
      </SectionRailNav>

      <SectionRailSections>
        <SectionRailSection title="Lists">
          {projects.data
            ?.filter((project) => !project.archivedAt)
            .map((project) => (
              <SectionRailButton
                key={project.id}
                active={selectedTaskList === project.id}
                onClick={() => {
                  setSelectedTaskList(project.id);
                  setSelectedTag(null);
                }}
              >
                <SectionRailDot color={projectColor(project.color)} />
                <SectionRailLabel>{project.title}</SectionRailLabel>
                <SectionRailBadge>{project.taskCount || ''}</SectionRailBadge>
              </SectionRailButton>
            ))}
          <SectionRailCreator
            placeholder="New list"
            value={projectTitle}
            onChange={(event) => setProjectTitle(event.target.value)}
            onSubmit={(event) => {
              event.preventDefault();
              if (projectTitle.trim()) createProject.mutate();
            }}
          />
        </SectionRailSection>

        <SectionRailSection title="Tags">
          {tags.data?.map((tag) => (
            <SectionRailButton
              key={tag.id}
              active={selectedTag === tag.id}
              onClick={() => {
                setSelectedTag(tag.id);
                setSelectedTaskList(null);
              }}
            >
              <Tag className="h-4 w-4 shrink-0" style={{ color: tagColor(tag.color) }} />
              <SectionRailLabel>{tag.name}</SectionRailLabel>
              <SectionRailDot color={tagColor(tag.color)} />
            </SectionRailButton>
          ))}
          <SectionRailCreator
            placeholder="New tag"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            onSubmit={(event) => {
              event.preventDefault();
              if (tagName.trim()) createTag.mutate();
            }}
          />
        </SectionRailSection>
      </SectionRailSections>

      <div className="itu-section-rail__mobile-groups">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={`itu-section-rail__group-trigger${selectedTaskList ? ' is-active' : ''}`}>
              <span>Lists</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="itu-section-rail__menu">
            <DropdownMenuLabel>Lists</DropdownMenuLabel>
            {projects.data
              ?.filter((project) => !project.archivedAt)
              .map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onSelect={() => {
                    setSelectedTaskList(project.id);
                    setSelectedTag(null);
                  }}
                  className={selectedTaskList === project.id ? 'bg-primary/10 text-primary' : ''}
                >
                  <SectionRailDot color={projectColor(project.color)} />
                  <span className="min-w-0 flex-1 truncate">{project.title}</span>
                  <span className="text-xs text-muted-foreground">{project.taskCount || ''}</span>
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <form
              className="itu-section-rail__menu-creator"
              onSubmit={(event) => {
                event.preventDefault();
                if (projectTitle.trim()) createProject.mutate();
              }}
            >
              <input
                placeholder="New list"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
              />
            </form>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={`itu-section-rail__group-trigger${selectedTag ? ' is-active' : ''}`}>
              <span>Tags</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="itu-section-rail__menu">
            <DropdownMenuLabel>Tags</DropdownMenuLabel>
            {tags.data?.map((tag) => (
              <DropdownMenuItem
                key={tag.id}
                onSelect={() => {
                  setSelectedTag(tag.id);
                  setSelectedTaskList(null);
                }}
                className={selectedTag === tag.id ? 'bg-primary/10 text-primary' : ''}
              >
                <Tag className="h-4 w-4 shrink-0" style={{ color: tagColor(tag.color) }} />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <SectionRailDot color={tagColor(tag.color)} />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <form
              className="itu-section-rail__menu-creator"
              onSubmit={(event) => {
                event.preventDefault();
                if (tagName.trim()) createTag.mutate();
              }}
            >
              <input placeholder="New tag" value={tagName} onChange={(event) => setTagName(event.target.value)} />
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SectionRail>
  );
}
