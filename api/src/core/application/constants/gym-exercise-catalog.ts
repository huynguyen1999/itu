import { CORE_CONDITIONING_EXERCISES } from './gym-exercise-catalog.core_conditioning';
import { ARMS_EXERCISES } from './gym-exercise-catalog.arms';
import { LOWER_BODY_EXERCISES } from './gym-exercise-catalog.lower_body';
import { UPPER_BODY_EXERCISES } from './gym-exercise-catalog.upper_body';
import type { CatalogExerciseDefinition } from './gym-exercise-catalog.types';

export type { CatalogExerciseDefinition } from './gym-exercise-catalog.types';

export const BUILT_IN_EXERCISE_CATALOG: CatalogExerciseDefinition[] = [
  ...UPPER_BODY_EXERCISES,
  ...ARMS_EXERCISES,
  ...LOWER_BODY_EXERCISES,
  ...CORE_CONDITIONING_EXERCISES,
];
