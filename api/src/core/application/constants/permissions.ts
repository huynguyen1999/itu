export const PERMISSIONS = {
  aiUse: 'AI_USE',
  cardImport: 'CARD_IMPORT',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: ReadonlyArray<{ key: PermissionKey; description: string; category: string }> = [
  { key: PERMISSIONS.aiUse, description: 'Use AI card generation and study feedback', category: 'AI' },
  { key: PERMISSIONS.cardImport, description: 'Import cards from supported files and pasted data', category: 'Cards' },
];
