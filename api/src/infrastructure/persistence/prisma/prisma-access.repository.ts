import { Injectable } from '@nestjs/common';
import { PERMISSION_CATALOG } from '@core/application/constants/permissions';
import type { IAccessRepository } from '@core/application/ports/out/access-repository.port';
import {
  EntityNotFoundException,
  ForbiddenResourceException,
  InvalidRoleAssignmentException,
} from '@core/domain/exceptions';
import { createUlid } from './ulid';
import { PrismaService } from './prisma.service';

const SUPERADMIN_ROLE_NAME = 'SUPERADMIN';
const FREE_ROLE_NAME = 'FREE';

@Injectable()
export class PrismaAccessRepository implements IAccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getUserAccess(userId: string) {
    const assignments = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const roles = assignments.map(({ role }) => role.name);
    if (roles.includes(SUPERADMIN_ROLE_NAME)) {
      return { roles, permissions: PERMISSION_CATALOG.map((permission) => permission.key) };
    }
    return {
      roles,
      permissions: [...new Set(assignments.flatMap(({ role }) => role.permissions.map((item) => item.permission.key)))],
    };
  }

  async assignDefaultRoles(userId: string): Promise<void> {
    const role =
      (await this.prisma.role.findUnique({ where: { name: FREE_ROLE_NAME } })) ??
      (await this.prisma.role.findFirst({ where: { isDefault: true }, orderBy: { name: 'asc' } }));
    if (!role) return;
    const existing = await this.prisma.userRole.findFirst({ where: { userId }, select: { userId: true } });
    if (!existing) await this.prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } }, permissions: { include: { permission: true } } },
    });
    return roles.map((role) => this.mapRole(role));
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { roles: { select: { roleId: true } } },
    });
    return users.map((user) => this.mapUserSummary(user));
  }

  async createRole(data: { name: string; description?: string; isDefault: boolean }) {
    const role = await this.prisma.role.create({
      data: {
        id: createUlid(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        isDefault: data.isDefault,
      },
      include: { _count: { select: { users: true } }, permissions: { include: { permission: true } } },
    });
    return this.mapRole(role);
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]) {
    const role = await this.prisma.$transaction(async (tx) => {
      const exists = await tx.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
      if (!exists) throw new EntityNotFoundException('Role', roleId);
      if (exists.name === SUPERADMIN_ROLE_NAME) throw new ForbiddenResourceException();
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length) {
        await tx.rolePermission.createMany({
          data: [...new Set(permissionIds)].map((permissionId) => ({ roleId, permissionId })),
        });
      }
      return tx.role.findUniqueOrThrow({
        where: { id: roleId },
        include: { _count: { select: { users: true } }, permissions: { include: { permission: true } } },
      });
    });
    return this.mapRole(role);
  }

  async updateUserRoles(userId: string, roleIds: string[]) {
    if (roleIds.length !== 1) throw new InvalidRoleAssignmentException('A user must have exactly one role');
    const [roleId] = roleIds;
    await this.prisma.$transaction(async (tx) => {
      const currentAssignment = await tx.userRole.findUnique({
        where: { userId },
        select: { role: { select: { name: true } } },
      });
      if (!currentAssignment) {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw new EntityNotFoundException('User', userId);
      }
      if (currentAssignment?.role.name === SUPERADMIN_ROLE_NAME) {
        throw new ForbiddenResourceException();
      }
      const role = await tx.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
      if (!role) throw new EntityNotFoundException('Role', roleId);
      if (role.name === SUPERADMIN_ROLE_NAME) throw new ForbiddenResourceException();
      if (currentAssignment) {
        await tx.userRole.update({ where: { userId }, data: { roleId } });
        return;
      }
      await tx.userRole.create({ data: { userId, roleId } });
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { select: { roleId: true } } },
    });
    if (!user) throw new EntityNotFoundException('User', userId);
    return this.mapUserSummary(user);
  }

  async updateUserBan(userId: string, banned: boolean) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { roles: { select: { roleId: true } } },
    });
    if (!user) throw new EntityNotFoundException('User', userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { bannedAt: banned ? new Date() : null },
      include: { roles: { select: { roleId: true } } },
    });
    return this.mapUserSummary(updated);
  }

  async getAdminMetrics() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [users, decks, cards, sessions, completedSessions, activeUsers7d, aiJobs, failedAiJobs, dueCards] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.deck.count(),
        this.prisma.card.count(),
        this.prisma.studySession.count(),
        this.prisma.studySession.count({ where: { completedAt: { not: null } } }),
        this.prisma.studySession
          .groupBy({ by: ['userId'], where: { startedAt: { gte: sevenDaysAgo } } })
          .then((rows) => rows.length),
        this.prisma.aiJob.count(),
        this.prisma.aiJob.count({ where: { status: 'FAILED' } }),
        this.prisma.reviewState.count({ where: { dueAt: { lte: new Date() } } }),
      ]);
    return {
      users,
      decks,
      cards,
      reviewSessions: sessions,
      completedSessions,
      activeUsers7d,
      aiJobs,
      failedAiJobs,
      dueCards,
    };
  }

  private mapRole(role: {
    id: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    _count: { users: number };
    permissions: Array<{ permission: { key: string } }>;
  }) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isDefault: role.isDefault,
      userCount: role._count.users,
      permissionKeys: role.permissions.map((item) => item.permission.key),
    };
  }

  private mapUserSummary(user: {
    id: string;
    email: string | null;
    username?: string | null;
    displayName: string | null;
    createdAt: Date;
    bannedAt: Date | null;
    roles: Array<{ roleId: string }>;
  }) {
    return {
      id: user.id,
      email: user.email,
      username: user.username ?? null,
      displayName: user.displayName,
      createdAt: user.createdAt,
      bannedAt: user.bannedAt,
      roleIds: user.roles.map((role) => role.roleId),
    };
  }
}
