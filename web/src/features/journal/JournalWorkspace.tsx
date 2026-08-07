import { Route, Routes } from 'react-router-dom';
import { JournalDashboard } from './JournalDashboard';
import { JournalEntryPage } from './JournalEntryPage';
import { JournalSearchPage } from './JournalSearchPage';

export function JournalWorkspace() {
  return (
    <Routes>
      <Route path="/" element={<JournalDashboard />} />
      <Route path="/entry/:id" element={<JournalEntryPage />} />
      <Route path="/search" element={<JournalSearchPage />} />
    </Routes>
  );
}
export default JournalWorkspace;
