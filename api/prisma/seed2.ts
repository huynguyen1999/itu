import {
  DeckColor,
  DeckIcon,
  FocusMode,
  FocusPhase,
  FocusSessionStatus,
  GrowthCurrency,
  GrowthLedgerKind,
  GrowthProgressKind,
  GrowthScalingMode,
  GrowthSourceType,
  HabitDirection,
  HabitScheduleType,
  HabitTargetType,
  PrismaClient,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { createUlid } from '../src/infrastructure/persistence/prisma/ulid';

const prisma = new PrismaClient();
const sampleDate = new Date();
const dayStart = new Date(sampleDate);
dayStart.setHours(0, 0, 0, 0);

const SAMPLE_DECKS = [
  { title: 'TypeScript Patterns', description: 'Practical TypeScript concepts and patterns.', icon: DeckIcon.BOOK },
  {
    title: 'Distributed Systems',
    description: 'Consensus, queues, caching, and scalable architecture.',
    icon: DeckIcon.BRAIN,
  },
] as const;

const ACTIVE_TASKS: Array<{ title: string; dueToday?: boolean; status?: TaskStatus }> = [
  { title: 'Review flashcards for distributed systems' },
  { title: '整理 weekly finances and budget', dueToday: true },
  { title: 'Complete your first task' },
  { title: 'Create a new task', status: TaskStatus.IN_PROGRESS },
];

const REWARDED_TASKS: Array<{ title: string; skills: string[]; xp: number; coins: number; dueToday?: boolean }> = [
  { title: 'Build a small TypeScript practice project', skills: ['Strength', 'Programming'], xp: 25, coins: 2 },
  {
    title: 'Plan quarterly learning goals',
    skills: ['General', 'Intelligence'],
    xp: 40,
    coins: 3,
    dueToday: true,
  },
];

const DELETED_TASKS: string[] = ['Read 20 pages of a product design book', 'Plan a weekend hiking route'];
const SAMPLE_HABITS: string[] = ['Morning planning', 'Read and reflect', 'Evening shutdown'];

async function main() {
  const user = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!user) throw new Error('Run prisma:seed before prisma:seed2 so the admin user exists.');

  const list = await prisma.taskList.findFirst({ where: { userId: user.id, isDefault: true } });
  if (!list) throw new Error('Run prisma:seed before prisma:seed2 so the default task list exists.');

  for (const deck of SAMPLE_DECKS) {
    const existing = await prisma.deck.findFirst({ where: { userId: user.id, title: deck.title } });
    if (existing) {
      await prisma.deck.update({
        where: { id: existing.id },
        data: { ...deck, color: DeckColor.TEAL, isDefault: false },
      });
      continue;
    }
    await prisma.deck.create({
      data: { id: createUlid(), userId: user.id, ...deck, color: DeckColor.TEAL, isDefault: false },
    });
  }

  for (const task of ACTIVE_TASKS) {
    await upsertTask(user.id, list.id, task.title, {
      status: task.status ?? TaskStatus.INBOX,
      dueAt: task.dueToday ? dayStart : null,
    });
  }

  for (const task of REWARDED_TASKS) {
    const taskId = await upsertTask(user.id, list.id, task.title, {
      priority: TaskPriority.HIGH,
      status: TaskStatus.COMPLETED,
      dueAt: task.dueToday ? dayStart : null,
      completedAt: sampleDate,
    });
    await upsertTaskReward(user.id, taskId, task.skills, task.xp, task.coins);
    await upsertTaskLedger(user.id, taskId, task.title, task.skills, task.xp, task.coins);
  }

  for (const title of DELETED_TASKS) {
    await upsertTask(user.id, list.id, title, { deletedAt: sampleDate });
  }

  for (const name of SAMPLE_HABITS) {
    const existing = await prisma.habit.findFirst({ where: { userId: user.id, name } });
    if (existing) continue;
    await prisma.habit.create({
      data: {
        id: createUlid(),
        userId: user.id,
        name,
        targetType: HabitTargetType.BOOLEAN,
        targetValue: 1,
        direction: HabitDirection.BUILD,
        scheduleType: HabitScheduleType.WEEKDAYS,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        startDate: dayStart,
        timezone: 'Asia/Ho_Chi_Minh',
      },
    });
  }

  const focusTasks = [...DELETED_TASKS, 'Review flashcards for distributed systems'];
  for (const [index, title] of focusTasks.entries()) {
    const task = await prisma.task.findFirst({ where: { userId: user.id, title } });
    if (!task) throw new Error(`Expected focus task was not found: ${title}`);
    const startedAt = new Date(sampleDate.getTime() - (index + 1) * 5 * 60_000);
    const existing = await prisma.focusSession.findFirst({
      where: { userId: user.id, taskId: task.id, status: FocusSessionStatus.COMPLETED },
    });
    if (existing) continue;
    await prisma.focusSession.create({
      data: {
        id: createUlid(),
        userId: user.id,
        taskId: task.id,
        mode: FocusMode.COUNTDOWN,
        phase: FocusPhase.WORK,
        status: FocusSessionStatus.COMPLETED,
        plannedSeconds: 60,
        taskTitleSnapshot: title,
        startedAt,
        completedAt: new Date(startedAt.getTime() + 60_000),
      },
    });
  }
}

async function upsertTask(
  userId: string,
  taskListId: string,
  title: string,
  values: {
    priority?: TaskPriority;
    status?: TaskStatus;
    dueAt?: Date | null;
    completedAt?: Date;
    deletedAt?: Date;
  } = {},
) {
  const existing = await prisma.task.findFirst({ where: { userId, title } });
  const data = {
    taskListId,
    priority: values.priority ?? TaskPriority.NONE,
    status: values.status ?? TaskStatus.INBOX,
    dueAt: values.dueAt,
    completedAt: values.completedAt,
    deletedAt: values.deletedAt,
  };
  if (existing) {
    await prisma.task.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await prisma.task.create({ data: { id: createUlid(), userId, title, ...data } });
  return created.id;
}

async function upsertTaskReward(
  userId: string,
  taskId: string,
  skillNames: readonly string[],
  xp: number,
  coins: number,
) {
  const skills = await prisma.growthSkill.findMany({
    where: {
      userId,
      kind: { in: [GrowthProgressKind.ATTRIBUTE, GrowthProgressKind.SKILL] },
      name: { in: [...skillNames] },
    },
  });
  if (skills.length !== skillNames.length) throw new Error(`Missing growth skills: ${skillNames.join(', ')}`);

  const rule = await prisma.growthEarningRule.upsert({
    where: { userId_sourceType_sourceId: { userId, sourceType: GrowthSourceType.TASK, sourceId: taskId } },
    update: { coinReward: coins, enabled: true, scalingMode: GrowthScalingMode.FIXED },
    create: {
      id: createUlid(),
      userId,
      sourceType: GrowthSourceType.TASK,
      sourceId: taskId,
      coinReward: coins,
      enabled: true,
      scalingMode: GrowthScalingMode.FIXED,
    },
  });
  await prisma.growthEarningRuleSkill.deleteMany({ where: { ruleId: rule.id } });
  await prisma.growthEarningRuleSkill.createMany({
    data: skills.map((skill) => ({ ruleId: rule.id, skillId: skill.id, xpReward: xp })),
  });
}

async function upsertTaskLedger(
  userId: string,
  taskId: string,
  title: string,
  skillNames: readonly string[],
  xp: number,
  coins: number,
) {
  const skills = await prisma.growthSkill.findMany({ where: { userId, name: { in: [...skillNames] } } });
  const profile = await prisma.growthProfile.findUnique({ where: { userId } });
  if (!profile) throw new Error('Growth profile is missing; run prisma:seed first.');

  for (const skill of skills) {
    await prisma.growthLedgerEntry.upsert({
      where: { userId_entryKey: { userId, entryKey: `seed2:${taskId}:skill:${skill.id}` } },
      update: { amount: xp, titleSnapshot: title },
      create: {
        id: createUlid(),
        userId,
        currency: GrowthCurrency.SKILL_XP,
        skillId: skill.id,
        amount: xp,
        kind: GrowthLedgerKind.ACTIVITY_AWARD,
        sourceType: GrowthSourceType.TASK,
        sourceId: taskId,
        entryKey: `seed2:${taskId}:skill:${skill.id}`,
        cycleId: profile.activeCycleId,
        titleSnapshot: title,
      },
    });
  }

  await prisma.growthLedgerEntry.upsert({
    where: { userId_entryKey: { userId, entryKey: `seed2:${taskId}:coins` } },
    update: { amount: coins, titleSnapshot: title },
    create: {
      id: createUlid(),
      userId,
      currency: GrowthCurrency.COIN,
      amount: coins,
      kind: GrowthLedgerKind.ACTIVITY_AWARD,
      sourceType: GrowthSourceType.TASK,
      sourceId: taskId,
      entryKey: `seed2:${taskId}:coins`,
      cycleId: profile.activeCycleId,
      titleSnapshot: title,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
