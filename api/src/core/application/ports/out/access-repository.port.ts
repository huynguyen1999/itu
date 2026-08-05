export interface RoleSummary {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  userCount: number;
  permissionKeys: string[];
}

export interface AdminUserSummary {
  id: string;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  createdAt: Date;
  bannedAt?: Date | null;
  roleIds: string[];
}

export interface IAccessRepository {
  getUserAccess(userId: string): Promise<{ roles: string[]; permissions: string[] }>;
  assignDefaultRoles(userId: string): Promise<void>;
  listRoles(): Promise<RoleSummary[]>;
  listPermissions(): Promise<Array<{ id: string; key: string; description: string; category: string }>>;
  listUsers(): Promise<AdminUserSummary[]>;
  createRole(data: { name: string; description?: string; isDefault: boolean }): Promise<RoleSummary>;
  updateRolePermissions(roleId: string, permissionIds: string[]): Promise<RoleSummary>;
  updateUserRoles(userId: string, roleIds: string[]): Promise<AdminUserSummary>;
  updateUserBan(userId: string, banned: boolean): Promise<AdminUserSummary>;
  getAdminMetrics(): Promise<Record<string, number>>;
}
