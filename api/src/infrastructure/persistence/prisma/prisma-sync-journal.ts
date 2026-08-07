import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import { ExpenseCategory, JournalEntryKind, PaymentMethod } from '@prisma/client';
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
  expense: true,
  workout: {
    include: {
      exercises: {
        include: { exercise: true, sets: { orderBy: { sortOrder: 'asc' as const } } },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
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
  ];

  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
  ): Promise<SyncConflict | null | undefined> {
    const payload = mutation.payload;
    switch (mutation.kind) {
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
            },
            update: {},
          });
        }

        if (payload.expense && typeof payload.expense === 'object') {
          const exp = payload.expense as Record<string, unknown>;
          await tx.journalExpense.upsert({
            where: { entryId: entry.id },
            create: {
              entryId: entry.id,
              amount: (exp.amount as number) ?? 0,
              currency: (exp.currency as string) ?? 'VND',
              category: exp.category ? enumValue(ExpenseCategory, exp.category, 'category') : ExpenseCategory.OTHER,
              merchant: optionalString(exp, 'merchant'),
              paymentMethod: exp.paymentMethod ? enumValue(PaymentMethod, exp.paymentMethod, 'paymentMethod') : PaymentMethod.CASH,
              transactionAt: exp.transactionAt ? new Date(exp.transactionAt as string) : new Date(),
            },
            update: {},
          });
        }

        if (payload.workout && typeof payload.workout === 'object') {
          const wo = payload.workout as Record<string, unknown>;
          await tx.journalWorkout.upsert({
            where: { entryId: entry.id },
            create: {
              entryId: entry.id,
              startedAt: wo.startedAt ? new Date(wo.startedAt as string) : null,
              durationMinutes: typeof wo.durationMinutes === 'number' ? wo.durationMinutes : null,
            },
            update: {},
          });

          if (Array.isArray(wo.exercises)) {
            for (const ex of wo.exercises as Record<string, unknown>[]) {
              const exId = (ex.id as string) || `ex_${Math.random().toString(36).substring(2, 9)}`;
              const exerciseId = requiredString(ex, 'exerciseId');
              const createdEx = await tx.journalWorkoutExercise.create({
                data: {
                  id: exId,
                  workoutEntryId: entry.id,
                  exerciseId,
                  sortOrder: typeof ex.sortOrder === 'number' ? ex.sortOrder : 0,
                  note: optionalString(ex, 'note'),
                },
              });
              if (Array.isArray(ex.sets)) {
                for (const s of ex.sets as Record<string, unknown>[]) {
                  const setId = (s.id as string) || `set_${Math.random().toString(36).substring(2, 9)}`;
                  await tx.journalWorkoutSet.create({
                    data: {
                      id: setId,
                      workoutExerciseId: createdEx.id,
                      sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : 0,
                      reps: typeof s.reps === 'number' ? s.reps : 0,
                      weight: typeof s.weight === 'number' ? s.weight : 0,
                    },
                  });
                }
              }
            }
          }
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
              deviceId: (mutation as any).deviceId,
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
            deviceId: (mutation as any).deviceId,
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

        if (payload.expense && typeof payload.expense === 'object') {
          const exp = payload.expense as Record<string, unknown>;
          await tx.journalExpense.upsert({
            where: { entryId: entry.id },
            create: {
              entryId: entry.id,
              amount: (exp.amount as number) ?? 0,
              currency: (exp.currency as string) ?? 'VND',
              category: exp.category ? enumValue(ExpenseCategory, exp.category, 'category') : ExpenseCategory.OTHER,
              merchant: optionalString(exp, 'merchant'),
              paymentMethod: exp.paymentMethod ? enumValue(PaymentMethod, exp.paymentMethod, 'paymentMethod') : PaymentMethod.CASH,
              transactionAt: exp.transactionAt ? new Date(exp.transactionAt as string) : new Date(),
            },
            update: {
              amount: exp.amount !== undefined ? (exp.amount as number) : undefined,
              currency: exp.currency !== undefined ? (exp.currency as string) : undefined,
              category: exp.category ? enumValue(ExpenseCategory, exp.category, 'category') : undefined,
              merchant: exp.merchant !== undefined ? optionalString(exp, 'merchant') : undefined,
              paymentMethod: exp.paymentMethod ? enumValue(PaymentMethod, exp.paymentMethod, 'paymentMethod') : undefined,
              transactionAt: exp.transactionAt ? new Date(exp.transactionAt as string) : undefined,
            },
          });
        }

        if (payload.workout && typeof payload.workout === 'object') {
          const wo = payload.workout as Record<string, unknown>;
          await tx.journalWorkout.upsert({
            where: { entryId: entry.id },
            create: {
              entryId: entry.id,
              startedAt: wo.startedAt ? new Date(wo.startedAt as string) : null,
              durationMinutes: typeof wo.durationMinutes === 'number' ? wo.durationMinutes : null,
            },
            update: {
              startedAt: wo.startedAt !== undefined ? (wo.startedAt ? new Date(wo.startedAt as string) : null) : undefined,
              durationMinutes: wo.durationMinutes !== undefined ? (wo.durationMinutes as number) : undefined,
            },
          });

          if (Array.isArray(wo.exercises)) {
            await tx.journalWorkoutExercise.deleteMany({ where: { workoutEntryId: entry.id } });
            for (const ex of wo.exercises as Record<string, unknown>[]) {
              const exId = (ex.id as string) || `ex_${Math.random().toString(36).substring(2, 9)}`;
              const exerciseId = requiredString(ex, 'exerciseId');
              const createdEx = await tx.journalWorkoutExercise.create({
                data: {
                  id: exId,
                  workoutEntryId: entry.id,
                  exerciseId,
                  sortOrder: typeof ex.sortOrder === 'number' ? ex.sortOrder : 0,
                  note: optionalString(ex, 'note'),
                },
              });
              if (Array.isArray(ex.sets)) {
                for (const s of ex.sets as Record<string, unknown>[]) {
                  const setId = (s.id as string) || `set_${Math.random().toString(36).substring(2, 9)}`;
                  await tx.journalWorkoutSet.create({
                    data: {
                      id: setId,
                      workoutExerciseId: createdEx.id,
                      sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : 0,
                      reps: typeof s.reps === 'number' ? s.reps : 0,
                      weight: typeof s.weight === 'number' ? s.weight : 0,
                    },
                  });
                }
              }
            }
          }
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
          data: { deletedAt: new Date(), version: { increment: 1 } },
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
        const updated = await tx.journalEntry.update({
          where: { id: entry.id },
          data: { deletedAt: null, version: { increment: 1 } },
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
