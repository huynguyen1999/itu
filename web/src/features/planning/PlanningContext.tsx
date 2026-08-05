import { createContext, useContext, useState, type ReactNode } from 'react';

interface PlanningContextValue {
  selectedTaskList: string | null;
  setSelectedTaskList: (id: string | null) => void;
  selectedTag: string | null;
  setSelectedTag: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const PlanningContext = createContext<PlanningContextValue | null>(null);

export function PlanningProvider({ children }: { children: ReactNode }) {
  const [selectedTaskList, setSelectedTaskList] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <PlanningContext.Provider
      value={{
        selectedTaskList,
        setSelectedTaskList,
        selectedTag,
        setSelectedTag,
        searchQuery,
        setSearchQuery,
      }}
    >
      {children}
    </PlanningContext.Provider>
  );
}

export function usePlanning() {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error('usePlanning must be used within <PlanningProvider>');
  return ctx;
}
