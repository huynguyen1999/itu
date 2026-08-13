import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import { JournalEntryKind } from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import {
  assertClientId,
  enumValue,
  fieldConflict,
  notFound,
  optionalString,
  requiredString,
  stale,
  stringArray,
} from './prisma-sync.helpers';

export const JOURNAL_SYNC_INCLUDE = {
  weeklyReview: true,
  dailyReview: true,
  tags: { include: { tag: true } },
  attachments: { where: { deletedAt: null } },
};

export class PrismaSyncJournal {
  readonly kinds: readonly string[] = [
    'journal.create',
    'journal.update',
    'journal.delete',
    'journal.restore',
    'journal_template.create',
    'journal_template.update',
    'journal_template.delete',
    'journal_tag.create',
    'journal_attachment.delete',
    'journal_revision.restore',
  ];

  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
  ): Promise<SyncConflict | null | undefined> {
    const payload = mutation.payload;
    switch (mutation.kind) {
      case 'journal_attachment.delete': {
        const attachment = await tx.journalAttachment.findFirst({ where: { id: mutation.entityId, userId } });
        if (!attachment) return null;
        const deleted = await tx.journalAttachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date() } });
        await recordSyncChange(tx, userId, 'journalattachment', deleted.id, 'DELETE', { id: deleted.id });
        return null;
      }
      case 'journal_revision.restore': {
        const revision = await tx.journalEntryRevision.findFirst({ where: { id: mutation.entityId, entry: { userId } } });
        if (!revision) return notFound(mutation, 'journalrevision');
        const snapshot = revision.snapshot as any;
        const revisionCount = await tx.journalEntryRevision.count({ where: { entryId: revision.entryId } });
        await tx.journalEntryRevision.create({ data: { id: `${revision.entryId}_rev_${revisionCount + 1}`, entryId: revision.entryId, revisionNumber: revisionCount + 1, snapshot: revision.snapshot as any, mutationId: mutation.id, deviceId: (mutation as any).serverDeviceId } });
        const tagIds = Array.isArray(snapshot.tagIds)
          ? snapshot.tagIds.filter((id: unknown): id is string => typeof id === 'string')
          : Array.isArray(snapshot.tags)
            ? snapshot.tags.map((tag: any) => tag.id).filter((id: unknown): id is string => typeof id === 'string')
            : [];
        if (tagIds.length) {
          const owned = await tx.journalTag.count({ where: { userId, id: { in: tagIds } } });
          if (owned !== tagIds.length) return notFound(mutation, 'journaltag');
        }
        const entry = await tx.journalEntry.update({ where: { id: revision.entryId }, data: { title: snapshot.title, contentMarkdown: snapshot.contentMarkdown ?? '', entryDate: new Date(snapshot.entryDate), timezone: snapshot.timezone ?? 'UTC', templateId: snapshot.templateId ?? null, version: { increment: 1 } } });
        await tx.journalTagAssignment.deleteMany({ where: { entryId: entry.id } });
        if (tagIds.length) await tx.journalTagAssignment.createMany({ data: tagIds.map((tagId: string) => ({ entryId: entry.id, tagId })) });
        if (snapshot.weeklyReview) {
          const wr = snapshot.weeklyReview;
          const reviewData = {
            periodStart: new Date(wr.periodStart),
            periodEnd: new Date(wr.periodEnd),
            summarySnapshot: wr.summarySnapshot ?? {},
            wentWellMarkdown: wr.wentWellMarkdown ?? null,
            frictionMarkdown: wr.frictionMarkdown ?? null,
            learnedMarkdown: wr.learnedMarkdown ?? null,
            differentFromLastWeekMarkdown: wr.differentFromLastWeekMarkdown ?? null,
            nextWeekMarkdown: wr.nextWeekMarkdown ?? null,
            experimentSnapshot: wr.experimentSnapshot ?? null,
            comparisonSnapshot: wr.comparisonSnapshot ?? null,
            aiInsightsSnapshot: wr.aiInsightsSnapshot ?? null,
            aiGenerationJobId: wr.aiGenerationJobId ?? null,
            aiGeneratedAt: wr.aiGeneratedAt ? new Date(wr.aiGeneratedAt as string) : null,
            aiPromptVersion: wr.aiPromptVersion ?? null,
            aiSourceEntryVersion: typeof wr.aiSourceEntryVersion === 'number' ? wr.aiSourceEntryVersion : null,
          };
          await tx.journalWeeklyReview.upsert({ where: { entryId: entry.id }, create: { entryId: entry.id, ...reviewData }, update: reviewData });
        }
        if (snapshot.dailyReview && typeof snapshot.dailyReview === 'object') {
          const dr = snapshot.dailyReview as Record<string, unknown>;
          await tx.journalDailyReview.upsert({
            where: { entryId: entry.id },
            create: {
              entryId: entry.id,
              periodDate: new Date(dr.periodDate as string),
              summarySnapshot: dr.summarySnapshot ?? {},
              wentWellMarkdown: optionalString(dr, 'wentWellMarkdown'),
              frictionMarkdown: optionalString(dr, 'frictionMarkdown'),
              learnedMarkdown: optionalString(dr, 'learnedMarkdown'),
              contextMarkdown: optionalString(dr, 'contextMarkdown'),
              aiInsightsSnapshot: dr.aiInsightsSnapshot && typeof dr.aiInsightsSnapshot === 'object' ? dr.aiInsightsSnapshot : undefined,
              aiGenerationJobId: optionalString(dr, 'aiGenerationJobId'),
              aiGeneratedAt: dr.aiGeneratedAt ? new Date(dr.aiGeneratedAt as string) : null,
              aiPromptVersion: optionalString(dr, 'aiPromptVersion'),
              aiSourceEntryVersion: typeof dr.aiSourceEntryVersion === 'number' ? dr.aiSourceEntryVersion : null,
            },
            update: {
              periodDate: dr.periodDate ? new Date(dr.periodDate as string) : undefined,
              summarySnapshot: dr.summarySnapshot ?? undefined,
              wentWellMarkdown: dr.wentWellMarkdown === undefined ? undefined : optionalString(dr, 'wentWellMarkdown'),
              frictionMarkdown: dr.frictionMarkdown === undefined ? undefined : optionalString(dr, 'frictionMarkdown'),
              learnedMarkdown: dr.learnedMarkdown === undefined ? undefined : optionalString(dr, 'learnedMarkdown'),
              contextMarkdown: dr.contextMarkdown === undefined ? undefined : optionalString(dr, 'contextMarkdown'),
              aiInsightsSnapshot: dr.aiInsightsSnapshot && typeof dr.aiInsightsSnapshot === 'object' ? dr.aiInsightsSnapshot : undefined,
              aiGenerationJobId: dr.aiGenerationJobId === undefined ? undefined : optionalString(dr, 'aiGenerationJobId'),
              aiGeneratedAt: dr.aiGeneratedAt === undefined ? undefined : (dr.aiGeneratedAt ? new Date(dr.aiGeneratedAt as string) : null),
              aiPromptVersion: dr.aiPromptVersion === undefined ? undefined : optionalString(dr, 'aiPromptVersion'),
              aiSourceEntryVersion: dr.aiSourceEntryVersion === undefined ? undefined : (typeof dr.aiSourceEntryVersion === 'number' ? dr.aiSourceEntryVersion : null),
            },
          });
        }
        const restored = await tx.journalEntry.findUniqueOrThrow({ where: { id: entry.id }, include: JOURNAL_SYNC_INCLUDE });
        await recordSyncChange(tx, userId, 'journalentry', entry.id, 'UPSERT', restored);
        return null;
      }
      case 'journal_tag.create': {
        assertClientId(mutation.entityId);
        const name = requiredString(payload, 'name').trim().toLowerCase();
        if (!name) throw new Error('Tag name is required');
        const color = optionalString(payload, 'color')?.toUpperCase() ?? 'SLATE';
        const existing = await tx.journalTag.findFirst({ where: { userId, name } });
        const tag = existing ?? await tx.journalTag.upsert({
          where: { id: mutation.entityId },
          create: { id: mutation.entityId, userId, name, color },
          update: {},
        });
        await recordSyncChange(tx, userId, 'journaltag', tag.id, 'UPSERT', tag);
        return null;
      }
      case 'journal.create': {
        assertClientId(mutation.entityId);
        const kind = enumValue(JournalEntryKind, payload.kind ?? 'NOTE', 'kind');
        const tagIds = stringArray(payload, 'tagIds');
        if (tagIds.length) {
          const ownedTags = await tx.journalTag.count({ where: { userId, id: { in: tagIds } } });
          if (ownedTags !== tagIds.length) {
            // auto-create missing tags
            for (const tagId of tagIds) {
              const tagExists = await tx.journalTag.findFirst({ where: { id: tagId, userId } });
              if (!tagExists) {
                await tx.journalTag.create({
                  data: { id: tagId, userId, name: `tag-${tagId.substring(0, 6)}` },
                });
              }
            }
          }
        }

        const entryDate = payload.entryDate ? new Date(payload.entryDate as string) : new Date();

        const entry = await tx.journalEntry.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            kind,
            title: requiredString(payload, 'title'),
            contentMarkdown: optionalString(payload, 'contentMarkdown') ?? '',
            entryDate,
            timezone: optionalString(payload, 'timezone') ?? 'UTC',
            templateId: optionalString(payload, 'templateId'),
            tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
          },
          update: {},
        });

        if (payload.weeklyReview && typeof payload.weeklyReview === 'object') {
          const wr = payload.weeklyReview as Record<string, unknown>;
          await tx.journalWeeklyReview.upsert({
            where: { entryId: entry.id },
            create: {
              entryId: entry.id,
              periodStart: new Date(wr.periodStart as string),
              periodEnd: new Date(wr.periodEnd as string),
              summarySnapshot: (wr.summarySnapshot as any) ?? {},
              wentWellMarkdown: optionalString(wr, 'wentWellMarkdown'),
              frictionMarkdown: optionalString(wr, 'frictionMarkdown'),
              learnedMarkdown: optionalString(wr, 'learnedMarkdown'),
              differentFromLastWeekMarkdown: optionalString(wr, 'differentFromLastWeekMarkdown'),
              nextWeekMarkdown: optionalString(wr, 'nextWeekMarkdown'),
              experimentSnapshot: (wr.experimentSnapshot as any) ?? undefined,
              comparisonSnapshot: (wr.comparisonSnapshot as any) ?? undefined,
            },
            update: {},
          });
        }
        if (payload.dailyReview && typeof payload.dailyReview === 'object') {
          const dr = payload.dailyReview as Record<string, unknown>;
          await tx.journalDailyReview.upsert({
            where: { entryId: entry.id },
            create: {
              entryId: entry.id,
              periodDate: new Date(dr.periodDate as string),
              summarySnapshot: dr.summarySnapshot ?? {},
              wentWellMarkdown: optionalString(dr, 'wentWellMarkdown'),
              frictionMarkdown: optionalString(dr, 'frictionMarkdown'),
              learnedMarkdown: optionalString(dr, 'learnedMarkdown'),
              contextMarkdown: optionalString(dr, 'contextMarkdown'),
            },
            update: {},
          });
        }

        const syncedEntry = await tx.journalEntry.findUniqueOrThrow({
          where: { id: entry.id },
          include: JOURNAL_SYNC_INCLUDE,
        });

        // Save initial revision
        const revCount = await tx.journalEntryRevision.count({ where: { entryId: entry.id } });
        if (revCount === 0) {
          await tx.journalEntryRevision.create({
            data: {
              id: `${entry.id}_rev_1`,
              entryId: entry.id,
              revisionNumber: 1,
              snapshot: JSON.parse(JSON.stringify(syncedEntry)),
              deviceId: (mutation as any).serverDeviceId,
              mutationId: mutation.id,
            },
          });
        }

        await recordSyncChange(tx, userId, 'journalentry', entry.id, 'UPSERT', syncedEntry);
        return null;
      }
      case 'journal.update': {
        const entry = await tx.journalEntry.findFirst({
          where: { id: mutation.entityId, userId },
          include: JOURNAL_SYNC_INCLUDE,
        });
        if (!entry) return notFound(mutation, 'journalentry');
        const conflict = fieldConflict(mutation, 'journalentry', entry as any);
        if (conflict) return conflict;

        // Create revision before updating
        const revCount = await tx.journalEntryRevision.count({ where: { entryId: entry.id } });
        await tx.journalEntryRevision.create({
          data: {
            id: `${entry.id}_rev_${revCount + 1}`,
            entryId: entry.id,
            revisionNumber: revCount + 1,
            snapshot: JSON.parse(JSON.stringify(entry)),
            deviceId: (mutation as any).serverDeviceId,
            mutationId: mutation.id,
          },
        });

        if (payload.tagIds !== undefined) {
          const tagIds = stringArray(payload, 'tagIds');
          await tx.journalTagAssignment.deleteMany({ where: { entryId: entry.id } });
          if (tagIds.length) {
            await tx.journalTagAssignment.createMany({
              data: tagIds.map((tagId) => ({ entryId: entry.id, tagId })),
            });
          }
        }

        const updated = await tx.journalEntry.update({
          where: { id: entry.id },
          data: {
            title: optionalString(payload, 'title') ?? entry.title,
            contentMarkdown:
              payload.contentMarkdown === undefined
                ? entry.contentMarkdown
                : (optionalString(payload, 'contentMarkdown') ?? ''),
            entryDate:
              payload.entryDate === undefined
                ? entry.entryDate
                : new Date(payload.entryDate as string),
            timezone: optionalString(payload, 'timezone') ?? entry.timezone,
            templateId:
              payload.templateId === undefined ? entry.templateId : optionalString(payload, 'templateId'),
            version: { increment: 1 },
          },
        });

        if (payload.weeklyReview && typeof payload.weeklyReview === 'object') {
          const wr = payload.weeklyReview as Record<string, unknown>;
          await tx.journalWeeklyReview.upsert({
            where: { entryId: entry.id },
            create: {
              entryId: entry.id,
              periodStart: new Date(wr.periodStart as string),
              periodEnd: new Date(wr.periodEnd as string),
              summarySnapshot: (wr.summarySnapshot as any) ?? {},
              wentWellMarkdown: optionalString(wr, 'wentWellMarkdown'),
              frictionMarkdown: optionalString(wr, 'frictionMarkdown'),
              learnedMarkdown: optionalString(wr, 'learnedMarkdown'),
              differentFromLastWeekMarkdown: optionalString(wr, 'differentFromLastWeekMarkdown'),
              nextWeekMarkdown: optionalString(wr, 'nextWeekMarkdown'),
              experimentSnapshot: (wr.experimentSnapshot as any) ?? undefined,
              comparisonSnapshot: (wr.comparisonSnapshot as any) ?? undefined,
            },
            update: {
              periodStart: wr.periodStart ? new Date(wr.periodStart as string) : undefined,
              periodEnd: wr.periodEnd ? new Date(wr.periodEnd as string) : undefined,
              summarySnapshot: wr.summarySnapshot ? ((wr.summarySnapshot as unknown) as any) : undefined,
              wentWellMarkdown: wr.wentWellMarkdown === undefined ? undefined : optionalString(wr, 'wentWellMarkdown'),
              frictionMarkdown: wr.frictionMarkdown === undefined ? undefined : optionalString(wr, 'frictionMarkdown'),
              nextWeekMarkdown: wr.nextWeekMarkdown === undefined ? undefined : optionalString(wr, 'nextWeekMarkdown'),
              experimentSnapshot: wr.experimentSnapshot === undefined ? undefined : (wr.experimentSnapshot as any),
              learnedMarkdown: wr.learnedMarkdown === undefined ? undefined : optionalString(wr, 'learnedMarkdown'),
              differentFromLastWeekMarkdown: wr.differentFromLastWeekMarkdown === undefined ? undefined : optionalString(wr, 'differentFromLastWeekMarkdown'),
              comparisonSnapshot: wr.comparisonSnapshot === undefined ? undefined : (wr.comparisonSnapshot as any),
            },
          });
        }
        if (payload.dailyReview && typeof payload.dailyReview === 'object') {
          const dr = payload.dailyReview as Record<string, unknown>;
          await tx.journalDailyReview.upsert({
            where: { entryId: entry.id },
            create: {
              entryId: entry.id,
              periodDate: new Date(dr.periodDate as string),
              summarySnapshot: dr.summarySnapshot ?? {},
              wentWellMarkdown: optionalString(dr, 'wentWellMarkdown'),
              frictionMarkdown: optionalString(dr, 'frictionMarkdown'),
              learnedMarkdown: optionalString(dr, 'learnedMarkdown'),
              contextMarkdown: optionalString(dr, 'contextMarkdown'),
            },
            update: {
              periodDate: dr.periodDate ? new Date(dr.periodDate as string) : undefined,
              summarySnapshot: dr.summarySnapshot ?? undefined,
              wentWellMarkdown: dr.wentWellMarkdown === undefined ? undefined : optionalString(dr, 'wentWellMarkdown'),
              frictionMarkdown: dr.frictionMarkdown === undefined ? undefined : optionalString(dr, 'frictionMarkdown'),
              learnedMarkdown: dr.learnedMarkdown === undefined ? undefined : optionalString(dr, 'learnedMarkdown'),
              contextMarkdown: dr.contextMarkdown === undefined ? undefined : optionalString(dr, 'contextMarkdown'),
            },
          });
        }

        const syncedEntry = await tx.journalEntry.findUniqueOrThrow({
          where: { id: updated.id },
          include: JOURNAL_SYNC_INCLUDE,
        });

        await recordSyncChange(tx, userId, 'journalentry', updated.id, 'UPSERT', syncedEntry);
        return null;
      }
      case 'journal.delete': {
        const entry = await tx.journalEntry.findFirst({ where: { id: mutation.entityId, userId } });
        if (!entry) return null;
        if (mutation.baseVersion !== undefined && mutation.baseVersion !== entry.version) {
          return stale(mutation, 'journalentry', entry);
        }
        await tx.journalEntry.update({
          where: { id: entry.id },
          data: { deletedAt: new Date(), deletedByDeviceId: (mutation as any).serverDeviceId, version: { increment: 1 } },
        });
        await tx.syncChange.create({
          data: {
            userId,
            entityType: 'journalentry',
            entityId: entry.id,
            operation: 'DELETE',
            data: { id: entry.id },
          },
        });
        return null;
      }
      case 'journal.restore': {
        const entry = await tx.journalEntry.findFirst({ where: { id: mutation.entityId, userId } });
        if (!entry) return notFound(mutation, 'journalentry');
        if (mutation.baseVersion !== undefined && mutation.baseVersion !== entry.version) {
          return stale(mutation, 'journalentry', entry);
        }
        const updated = await tx.journalEntry.update({
          where: { id: entry.id },
          data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } },
        });
        const syncedEntry = await tx.journalEntry.findUniqueOrThrow({
          where: { id: updated.id },
          include: JOURNAL_SYNC_INCLUDE,
        });
        await recordSyncChange(tx, userId, 'journalentry', updated.id, 'UPSERT', syncedEntry);
        return null;
      }
      case 'journal_template.create': {
        assertClientId(mutation.entityId);
        const template = await tx.journalTemplate.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            name: requiredString(payload, 'name'),
            entryKind: enumValue(JournalEntryKind, payload.entryKind ?? 'NOTE', 'entryKind'),
            titleTemplate: optionalString(payload, 'titleTemplate') ?? '',
            bodyMarkdown: optionalString(payload, 'bodyMarkdown') ?? '',
            defaults: (payload.defaults as any) ?? {},
            builtIn: typeof payload.builtIn === 'boolean' ? payload.builtIn : false,
          },
          update: {},
        });
        await recordSyncChange(tx, userId, 'journaltemplate', template.id, 'UPSERT', template);
        return null;
      }
      case 'journal_template.update': {
        const template = await tx.journalTemplate.findFirst({ where: { id: mutation.entityId, userId } });
        if (!template) return notFound(mutation, 'journaltemplate');
        const updated = await tx.journalTemplate.update({
          where: { id: template.id },
          data: {
            name: optionalString(payload, 'name') ?? template.name,
            entryKind: payload.entryKind ? enumValue(JournalEntryKind, payload.entryKind, 'entryKind') : template.entryKind,
            titleTemplate: payload.titleTemplate === undefined ? template.titleTemplate : (optionalString(payload, 'titleTemplate') ?? ''),
            bodyMarkdown: payload.bodyMarkdown === undefined ? template.bodyMarkdown : (optionalString(payload, 'bodyMarkdown') ?? ''),
            defaults: payload.defaults !== undefined ? (payload.defaults as any) : template.defaults,
            archivedAt: payload.archivedAt === undefined ? template.archivedAt : (payload.archivedAt ? new Date(payload.archivedAt as string) : null),
            version: { increment: 1 },
          },
        });
        await recordSyncChange(tx, userId, 'journaltemplate', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'journal_template.delete': {
        const template = await tx.journalTemplate.findFirst({ where: { id: mutation.entityId, userId, builtIn: false } });
        if (!template) return null;
        await tx.journalTemplate.delete({ where: { id: template.id } });
        await tx.syncChange.create({
          data: {
            userId,
            entityType: 'journaltemplate',
            entityId: template.id,
            operation: 'DELETE',
            data: { id: template.id },
          },
        });
        return null;
      }
      default:
        return undefined;
    }
  }
}
