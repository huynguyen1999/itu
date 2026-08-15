import { Route, Routes, Navigate } from 'react-router-dom';
import { GymLayout } from './GymLayout';
import { GymOverviewPage } from './overview/GymOverviewPage';
import { GymRoutinesPage } from './routines/GymRoutinesPage';
import { WorkoutHistoryPage } from './history/WorkoutHistoryPage';
import { ExerciseLibraryPage } from './exercises/ExerciseLibraryPage';
import { ActiveWorkoutPage } from './active/ActiveWorkoutPage';

export function GymWorkspace() {
  return (
    <Routes>
      <Route element={<GymLayout />}>
        <Route index element={<GymOverviewPage />} />
        <Route path="routines" element={<GymRoutinesPage />} />
        <Route path="history" element={<WorkoutHistoryPage />} />
        <Route path="exercises" element={<ExerciseLibraryPage />} />
        <Route path="workouts/:id" element={<ActiveWorkoutPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/gym" replace />} />
    </Routes>
  );
}
