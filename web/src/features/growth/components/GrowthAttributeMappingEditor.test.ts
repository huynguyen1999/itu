import { describe, expect, it } from 'vitest';
import type { GrowthAttributeMapping, GrowthSkill } from '@/shared/api/types';
import {
  growthMappingSummary,
  growthMappingSyncStatus,
  selectLatestGrowthMappingMutation,
  shouldConfirmGrowthMapping,
} from './GrowthAttributeMappingEditor';

const attribute = (id: string, name: string): GrowthSkill => ({
  id,
  name,
  kind: 'ATTRIBUTE',
  description: '',
  icon: 'STAR',
  color: 'TEAL',
  sortOrder: 0,
  starterKey: null,
  cycleId: 'cycle-1',
  archivedAt: null,
  version: 1,
  level: 1,
  currentXp: 0,
  levelStartXp: 0,
  nextLevelXp: 100,
  progressXp: 0,
  requiredXp: 100,
  baseXp: 0,
});

describe('growth mapping editor summary', () => {
  it('resolves names from active attributes when an optimistic row has no nested attribute', () => {
    const mapping: GrowthAttributeMapping = {
      id: 'optimistic:skill-1:PRIMARY',
      skillId: 'skill-1',
      attributeId: 'intelligence',
      slot: 'PRIMARY',
      weight: 80,
      attribute: null,
    };

    expect(growthMappingSummary([mapping], [attribute('intelligence', 'Intelligence')])).toBe('Intelligence 80%');
  });

  it('describes queued and failed sync states without claiming the save is authoritative', () => {
    expect(growthMappingSyncStatus({ pending: true, offline: true })).toContain('queued offline');
    expect(growthMappingSyncStatus({ pending: true, offline: false })).toContain('queued for server sync');
    expect(growthMappingSyncStatus({ pending: true, errorCode: 'VALIDATION_ERROR', offline: false })).toContain(
      'Retry sync',
    );
  });

  it('only replaces queued copy after a pending mutation was observed and then acknowledged', () => {
    expect(shouldConfirmGrowthMapping({ awaitingConfirmation: true, pendingSeen: false, pending: false })).toBe(false);
    expect(shouldConfirmGrowthMapping({ awaitingConfirmation: true, pendingSeen: true, pending: true })).toBe(false);
    expect(shouldConfirmGrowthMapping({ awaitingConfirmation: true, pendingSeen: true, pending: false })).toBe(true);
    expect(
      shouldConfirmGrowthMapping({
        awaitingConfirmation: true,
        pendingSeen: true,
        pending: false,
        errorCode: 'VALIDATION_ERROR',
      }),
    ).toBe(false);
  });

  it('uses the newest pending edit when an older mapping mutation failed', () => {
    const latest = selectLatestGrowthMappingMutation(
      [
        {
          id: 'older',
          kind: 'growthattributemapping.upsert',
          entityId: 'skill-1',
          payload: {},
          occurredAt: '2026-08-03T10:00:00.000Z',
          lastErrorCode: 'VALIDATION_ERROR',
        },
        {
          id: 'newer',
          kind: 'growthattributemapping.upsert',
          entityId: 'skill-1',
          payload: {},
          occurredAt: '2026-08-03T10:01:00.000Z',
        },
      ],
      'skill-1',
    );

    expect(latest?.id).toBe('newer');
    expect(latest?.lastErrorCode).toBeUndefined();
  });
});
