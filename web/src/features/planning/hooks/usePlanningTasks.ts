import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ProductivityTask } from '@/shared/api/types';

export type PlanningView = 'all' | 'today' | 'inbox' | 'upcoming';

export function usePlanningTasks({
  view,
  selectedTaskList,
  selectedTag,
  searchQuery,
}: {
  view: PlanningView;
  selectedTaskList: string | null;
  selectedTag: string | null;
  searchQuery: string;
}) {
  const effectiveView = selectedTaskList || selectedTag ? 'all' : view;
  const [allTasksData, setAllTasksData] = useState<ProductivityTask[]>([]);
  const tasks = useInfiniteQuery({
    queryKey: ['tasks', effectiveView, selectedTaskList, selectedTag, searchQuery, 'paginated-20'],
    queryFn: async ({ pageParam }) => {
      const page = await api.tasks({
        view: effectiveView,
        taskListId: selectedTaskList ?? undefined,
        tagId: selectedTag ?? undefined,
        q: searchQuery || undefined,
        cursor: pageParam,
        limit: 20,
      });
      return Array.isArray(page) ? { data: page, meta: { hasNextPage: false, nextCursor: null } } : page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    retry: 1,
  });

  useEffect(() => {
    if (tasks.data) setAllTasksData(tasks.data.pages.flatMap((page) => page.data));
  }, [tasks.data]);

  const projects = useQuery({ queryKey: ['task-lists'], queryFn: () => api.taskLists() });
  const inboxListId = projects.data?.find((project) => project.isDefault)?.id ?? null;
  const tags = useQuery({ queryKey: ['task-tags'], queryFn: () => api.taskTags() });
  const sections = useQuery({ queryKey: ['task-sections'], queryFn: () => api.taskSections() });

  return { tasks, allTasksData, setAllTasksData, projects, inboxListId, tags, sections };
}
