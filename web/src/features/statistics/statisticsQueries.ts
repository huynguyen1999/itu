import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { statisticsDateTimeRange, type StatisticsPeriod } from './statisticsPeriod';

export const statisticsQueryKeys = {
  calendar: (period: StatisticsPeriod) => ['statistics', 'productivity', period.from, period.to, period.grouping] as const,
  growth: (period: StatisticsPeriod) => ['statistics', 'growth', period.from, period.to, period.grouping] as const,
  calendarComparison: (period: StatisticsPeriod) => ['statistics', 'productivity-comparison', period.comparisonFrom, period.comparisonTo, period.grouping] as const,
  growthComparison: (period: StatisticsPeriod) => ['statistics', 'growth-comparison', period.comparisonFrom, period.comparisonTo, period.grouping] as const,
  growthOverview: () => ['statistics', 'growth-overview'] as const,
  usage: (period: StatisticsPeriod) => ['statistics', 'usage', period.from, period.to, period.grouping] as const,
  websiteUsage: (period: StatisticsPeriod) => ['statistics', 'website-usage', period.from, period.to, period.grouping] as const,
  habits: (period: StatisticsPeriod) => ['statistics', 'habits', period.from, period.to, period.grouping] as const,
  habitsComparison: (period: StatisticsPeriod) => ['statistics', 'habits-comparison', period.comparisonFrom, period.comparisonTo, period.grouping] as const,
  gym: (period: StatisticsPeriod) => ['statistics', 'gym', period.from, period.to, period.grouping] as const,
  gymComparison: (period: StatisticsPeriod) => ['statistics', 'gym-comparison', period.comparisonFrom, period.comparisonTo, period.grouping] as const,
  budget: (period: StatisticsPeriod) => ['statistics', 'budget', period.from, period.to, period.grouping] as const,
};

export function useStatisticsQueries(period: StatisticsPeriod) {
  const range = statisticsDateTimeRange(period);
  const calendar = useQuery({
    queryKey: statisticsQueryKeys.calendar(period),
    queryFn: () => api.studyCalendarRange(period.from, period.to),
  });
  const growth = useQuery({
    queryKey: statisticsQueryKeys.growth(period),
    queryFn: () => api.growthStatistics(range.from, range.to),
  });
  const calendarComparison = useQuery({
    queryKey: statisticsQueryKeys.calendarComparison(period),
    queryFn: () => api.studyCalendarRange(period.comparisonFrom, period.comparisonTo),
  });
  const growthComparison = useQuery({
    queryKey: statisticsQueryKeys.growthComparison(period),
    queryFn: () => {
      const comparison = statisticsDateTimeRange({ from: period.comparisonFrom, to: period.comparisonTo });
      return api.growthStatistics(comparison.from, comparison.to);
    },
  });
  const growthOverview = useQuery({
    queryKey: statisticsQueryKeys.growthOverview(),
    queryFn: () => api.growthOverview(),
  });
  const usage = useQuery({
    queryKey: statisticsQueryKeys.usage(period),
    queryFn: () => api.usageSummaries(period.from, period.to),
  });
  const websiteUsage = useQuery({
    queryKey: statisticsQueryKeys.websiteUsage(period),
    queryFn: () => api.websiteUsageStatistics(period.from, period.to),
  });
  const habits = useQuery({
    queryKey: statisticsQueryKeys.habits(period),
    queryFn: () => api.habitCalendar(period.from, period.to),
  });
  const habitsComparison = useQuery({
    queryKey: statisticsQueryKeys.habitsComparison(period),
    queryFn: () => api.habitCalendar(period.comparisonFrom, period.comparisonTo),
  });
  const gym = useQuery({
    queryKey: statisticsQueryKeys.gym(period),
    queryFn: () => api.getGymAnalyticsForPeriod(period.from, period.to),
  });
  const gymComparison = useQuery({
    queryKey: statisticsQueryKeys.gymComparison(period),
    queryFn: () => api.getGymAnalyticsForPeriod(period.comparisonFrom, period.comparisonTo),
  });
  const budget = useQuery({
    queryKey: statisticsQueryKeys.budget(period),
    queryFn: () => api.getBudgetStatistics(period.from, period.to),
  });

  return { calendar, growth, calendarComparison, growthComparison, growthOverview, usage, websiteUsage, habits, habitsComparison, gym, gymComparison, budget };
}
