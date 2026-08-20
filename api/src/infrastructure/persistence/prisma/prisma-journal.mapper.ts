import { JournalEntryKind } from '@core/domain/enums';
import { JournalDailyReviewModel, JournalEntryModel } from '@core/domain/journal/journal.types';
import { formatDateOnly } from '@core/application/utils/calendar';

export function mapEntryToModel(entry: any): JournalEntryModel {
  return {
    id: entry.id,
    userId: entry.userId,
    kind: entry.kind as JournalEntryKind,
    title: entry.title,
    contentMarkdown: entry.contentMarkdown,
    entryDate: entry.entryDate,
    timezone: entry.timezone,
    templateId: entry.templateId,
    version: entry.version,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
    deletedByDeviceId: entry.deletedByDeviceId,
    contextType: entry.contextType,
    contextId: entry.contextId,
    contextData: entry.contextData as Record<string, unknown> | null,
    weeklyReview: entry.weeklyReview
      ? {
          entryId: entry.weeklyReview.entryId,
          periodStart: formatDateOnly(entry.weeklyReview.periodStart),
          periodEnd: formatDateOnly(entry.weeklyReview.periodEnd),
          summarySnapshot: entry.weeklyReview.summarySnapshot as Record<string, unknown>,
          wentWellMarkdown: entry.weeklyReview.wentWellMarkdown,
          frictionMarkdown: entry.weeklyReview.frictionMarkdown,
          learnedMarkdown: entry.weeklyReview.learnedMarkdown,
          differentFromLastWeekMarkdown: entry.weeklyReview.differentFromLastWeekMarkdown,
          nextWeekMarkdown: entry.weeklyReview.nextWeekMarkdown,
          experimentSnapshot: entry.weeklyReview.experimentSnapshot as Record<string, unknown> | null,
          comparisonSnapshot: entry.weeklyReview.comparisonSnapshot as Record<string, unknown> | null,
          aiInsightsSnapshot: entry.weeklyReview.aiInsightsSnapshot as Record<string, unknown> | null,
          aiGenerationJobId: entry.weeklyReview.aiGenerationJobId,
          aiGeneratedAt: entry.weeklyReview.aiGeneratedAt,
          aiPromptVersion: entry.weeklyReview.aiPromptVersion,
          aiSourceEntryVersion: entry.weeklyReview.aiSourceEntryVersion,
        }
      : null,
    dailyReview: entry.dailyReview
      ? ({
          entryId: entry.dailyReview.entryId,
          periodDate: formatDateOnly(entry.dailyReview.periodDate),
          summarySnapshot: entry.dailyReview.summarySnapshot as Record<string, unknown>,
          wentWellMarkdown: entry.dailyReview.wentWellMarkdown,
          frictionMarkdown: entry.dailyReview.frictionMarkdown,
          learnedMarkdown: entry.dailyReview.learnedMarkdown,
          contextMarkdown: entry.dailyReview.contextMarkdown,
          aiInsightsSnapshot: entry.dailyReview.aiInsightsSnapshot as Record<string, unknown> | null,
          aiGenerationJobId: entry.dailyReview.aiGenerationJobId,
          aiGeneratedAt: entry.dailyReview.aiGeneratedAt,
          aiPromptVersion: entry.dailyReview.aiPromptVersion,
          aiSourceEntryVersion: entry.dailyReview.aiSourceEntryVersion,
        } satisfies JournalDailyReviewModel)
      : null,
    tags: (entry.tags || []).map((assignment: any) => ({
      id: assignment.tag.id,
      userId: assignment.tag.userId,
      name: assignment.tag.name,
      color: assignment.tag.color,
      createdAt: assignment.tag.createdAt,
      updatedAt: assignment.tag.updatedAt,
    })),
    attachments: (entry.attachments || []).map((att: any) => ({
      id: att.id,
      userId: att.userId,
      entryId: att.entryId,
      fileName: att.fileName,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      storageKey: att.storageKey,
      url: `/journal/attachments/${att.id}/file`,
      createdAt: att.createdAt,
      deletedAt: att.deletedAt,
    })),
  };
}
