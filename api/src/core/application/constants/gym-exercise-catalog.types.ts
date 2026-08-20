import { ExerciseMetricType, WeightUnit } from '../../domain/gym/gym.domain';

export interface CatalogExerciseDefinition {
  catalogKey: string;
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string;
  metricType: ExerciseMetricType;
  defaultWeightUnit: WeightUnit;
  defaultRestSeconds: number;
  description?: string;
}


