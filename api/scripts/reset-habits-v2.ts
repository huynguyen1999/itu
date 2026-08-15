import { PrismaClient, GrowthSourceType, ScheduledJobType } from '@prisma/client';

const confirmed = process.argv.includes('--confirm=RESET_HABITS');
const environment = process.env.NODE_ENV ?? 'development';
if (environment === 'production') throw new Error('Habits reset is limited to development/test environments');

async function main() {
  const prisma = new PrismaClient();
  try {
    const [habits, occurrences, checkIns, progressLogs, reminders, deliveries, reminderNotifications, checklistItems, occurrenceChecklistItems, tagAssignments, timeBlocks, commitments, taskTemplates, habitJobs, habitRules, sourceTasks] = await Promise.all([
      prisma.habit.count(),
      prisma.habitOccurrence.count(),
      prisma.habitCheckIn.count(),
      prisma.habitProgressLog.count(),
      prisma.habitReminder.count(),
      prisma.habitReminderDelivery.count(),
      prisma.notification.count({ where: { habitReminderDeliveryId: { not: null } } }),
      prisma.habitChecklistItem.count(),
      prisma.habitOccurrenceChecklistItem.count(),
      prisma.habitTagAssignment.count(),
      prisma.habitTimeBlock.count(),
      prisma.habitCommitmentPolicy.count(),
      prisma.habitTaskTemplate.count(),
      prisma.scheduledJob.count({ where: { type: ScheduledJobType.HABIT_REMINDER } }),
      prisma.growthEarningRule.count({ where: { sourceType: GrowthSourceType.HABIT } }),
      prisma.task.count({ where: { OR: [{ sourceHabitId: { not: null } }, { sourceHabitOccurrenceId: { not: null } }] } }),
    ]);
    const summary = {
      environment,
      habits,
      occurrences,
      checkIns,
      progressLogs,
      reminders,
      deliveries,
      reminderNotifications,
      checklistItems,
      occurrenceChecklistItems,
      tagAssignments,
      timeBlocks,
      commitments,
      taskTemplates,
      habitJobs,
      habitRules,
      sourceTasks,
      confirmed,
    };
    if (!confirmed) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\nDry run only. Re-run with --confirm=RESET_HABITS to reset Habit-owned data.\n`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      const templates = await tx.habit.findMany({ where: { taskTemplateConfigId: { not: null } }, select: { taskTemplateConfigId: true } });
      await tx.task.updateMany({
        where: { OR: [{ sourceHabitId: { not: null } }, { sourceHabitOccurrenceId: { not: null } }] },
        data: { sourceHabitId: null, sourceHabitOccurrenceId: null },
      });
      await tx.scheduledJob.deleteMany({ where: { type: ScheduledJobType.HABIT_REMINDER } });
      await tx.growthEarningRule.deleteMany({ where: { sourceType: GrowthSourceType.HABIT } });
      await tx.habit.deleteMany();
      await tx.habitTaskTemplate.deleteMany({ where: { id: { in: templates.flatMap((item) => item.taskTemplateConfigId ? [item.taskTemplateConfigId] : []) } } });
      await tx.habitTimeBlock.deleteMany();
    });
    process.stdout.write(`${JSON.stringify({ ...summary, deleted: true }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
