import { DeckColor, DeckIcon, GrowthOnboardingState, GrowthProgressKind, PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG, PERMISSIONS } from '../src/core/application/constants/permissions';
import { STARTER_SKILLS } from '../src/core/application/use-cases/growth-starter-skills';
import bcrypt from 'bcrypt';
import { createUlid } from '../src/infrastructure/persistence/prisma/ulid';

const prisma = new PrismaClient();

const DEFAULT_DECK = {
  title: 'Inbox',
  description: 'Cards waiting to be organized',
  icon: DeckIcon.INBOX,
  color: DeckColor.SLATE,
  isDefault: true,
} as const;

const DEFAULT_TASK_LIST = {
  title: 'Inbox',
  isDefault: true,
} as const;

const STARTER_TASKS = [
  'Create a new task',
  'Try more task actions',
  'Explore the task details page',
  'Complete your first task',
] as const;

async function main() {
  for (const permission of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: permission,
      create: { id: createUlid(), ...permission },
    });
  }

  await prisma.role.upsert({
    where: { name: 'FREE' },
    update: { isDefault: true },
    create: { id: createUlid(), name: 'FREE', description: 'Default learner access', isDefault: true },
  });
  const premiumRole = await prisma.role.upsert({
    where: { name: 'PREMIUM' },
    update: {},
    create: { id: createUlid(), name: 'PREMIUM', description: 'AI and import access' },
  });
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { id: createUlid(), name: 'ADMIN', description: 'Administrator access' },
  });
  const superadminRole = await prisma.role.upsert({
    where: { name: 'SUPERADMIN' },
    update: {},
    create: { id: createUlid(), name: 'SUPERADMIN', description: 'Full administration access' },
  });
  const permissions = await prisma.permission.findMany();
  await prisma.rolePermission.createMany({
    data: permissions
      .filter((item) => [PERMISSIONS.aiUse, PERMISSIONS.cardImport].includes(item.key as never))
      .map((item) => ({ roleId: premiumRole.id, permissionId: item.id })),
    skipDuplicates: true,
  });
  await prisma.rolePermission.createMany({
    data: permissions.map((item) => ({ roleId: adminRole.id, permissionId: item.id })),
    skipDuplicates: true,
  });
  await prisma.rolePermission.createMany({
    data: permissions.map((item) => ({ roleId: superadminRole.id, permissionId: item.id })),
    skipDuplicates: true,
  });

  const passwordHash = await bcrypt.hash('admin', 10);
  let user = await prisma.user.findFirst({ where: { username: 'admin' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: createUlid(),
        username: 'admin',
        displayName: 'Admin User',
        passwordHash,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
  }

  await prisma.userRole.upsert({
    where: { userId: user.id },
    update: { roleId: superadminRole.id },
    create: { userId: user.id, roleId: superadminRole.id },
  });

  await ensureSeedUserDefaults(user.id);
}

async function ensureSeedUserDefaults(userId: string) {
  const defaultDeck = await prisma.deck.findFirst({ where: { userId, isDefault: true } });
  if (!defaultDeck) {
    await prisma.deck.create({
      data: {
        ...DEFAULT_DECK,
        id: createUlid(),
        userId,
      },
    });
  }

  let defaultList = await prisma.taskList.findFirst({ where: { userId, isDefault: true } });
  if (!defaultList) {
    defaultList = await prisma.taskList.create({
      data: {
        ...DEFAULT_TASK_LIST,
        id: createUlid(),
        userId,
      },
    });
  }

  for (const [index, title] of STARTER_TASKS.entries()) {
    const existingTask = await prisma.task.findFirst({ where: { userId, title } });
    if (existingTask) continue;
    await prisma.task.create({
      data: {
        id: createUlid(),
        userId,
        taskListId: defaultList.id,
        title,
        descriptionMarkdown: '',
        sortOrder: index + 1,
      },
    });
  }

  let profile = await prisma.growthProfile.findUnique({ where: { userId } });
  if (!profile) {
    const cycle = await prisma.growthCycle.create({ data: { id: createUlid(), userId } });
    profile = await prisma.growthProfile.create({
      data: {
        id: createUlid(),
        userId,
        activeCycleId: cycle.id,
        onboardingState: GrowthOnboardingState.COMPLETED,
      },
    });
  }

  const existingSkills = await prisma.growthSkill.findMany({ where: { userId } });
  for (const general of existingSkills.filter(
    (entry) => entry.kind === GrowthProgressKind.ATTRIBUTE &&
      (entry.starterKey === 'attribute-general' || entry.name.toLocaleLowerCase() === 'general') &&
      !entry.archivedAt,
  )) {
    await prisma.growthSkill.update({ where: { id: general.id }, data: { archivedAt: new Date() } });
  }
  const existingKeys = new Set(existingSkills.map((entry) => entry.starterKey).filter(Boolean));
  let sortOrder = existingSkills.reduce((max, entry) => Math.max(max, entry.sortOrder), -1) + 1;

  for (const starter of STARTER_SKILLS) {
    if (existingKeys.has(starter.key)) continue;
    const matchingEntry = existingSkills.find(
      (entry) => entry.kind === starter.kind && entry.name.toLocaleLowerCase() === starter.name.toLocaleLowerCase(),
    );
    if (matchingEntry && !matchingEntry.starterKey) {
      await prisma.growthSkill.update({
        where: { id: matchingEntry.id },
        data: { starterKey: starter.key, kind: starter.kind },
      });
      existingKeys.add(starter.key);
      continue;
    }

    await prisma.growthSkill.create({
      data: {
        id: createUlid(),
        userId,
        name: starter.name,
        description: starter.description,
        icon: starter.icon,
        color: starter.color,
        kind: starter.kind,
        starterKey: starter.key,
        cycleId: profile.activeCycleId,
        baseXp: 100,
        sortOrder: sortOrder++,
        ...(starter.key === 'attribute-general' ? { archivedAt: new Date() } : {}),
      },
    });
    existingKeys.add(starter.key);
  }

  const seededSkills = await prisma.growthSkill.findMany({ where: { userId, archivedAt: null } });
  const byKey = new Map(seededSkills.map((entry) => [entry.starterKey, entry]));
  const routes: Array<[string, string, string, number, number]> = [
    ['skill-programming', 'attribute-intelligence', 'attribute-creativity', 80, 20],
    ['skill-writing', 'attribute-creativity', 'attribute-charisma', 70, 30],
    ['skill-fitness', 'attribute-strength', 'attribute-resilience', 70, 30],
    ['skill-cooking', 'attribute-dexterity', 'attribute-creativity', 70, 30],
    ['skill-language', 'attribute-intelligence', 'attribute-charisma', 70, 30],
  ];
  for (const [skillKey, primaryKey, secondaryKey, primaryWeight, secondaryWeight] of routes) {
    const skill = byKey.get(skillKey);
    const primary = byKey.get(primaryKey);
    const secondary = byKey.get(secondaryKey);
    if (!skill || !primary || !secondary) continue;
    await prisma.$transaction(async (tx) => {
      await tx.growthAttributeMapping.deleteMany({ where: { userId, skillId: skill.id } });
      await tx.growthAttributeMapping.createMany({
        data: [
          { id: createUlid(), userId, skillId: skill.id, attributeId: primary.id, slot: 'PRIMARY', weight: primaryWeight },
          { id: createUlid(), userId, skillId: skill.id, attributeId: secondary.id, slot: 'SECONDARY', weight: secondaryWeight },
        ],
      });
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
