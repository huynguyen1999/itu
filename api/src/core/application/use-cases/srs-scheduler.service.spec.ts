import { ReviewDirection, ReviewGrade } from '@core/domain/enums';
import { ReviewStateModel } from '@core/domain/models';
import { SrsSchedulerService } from './srs-scheduler.service';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const baseState: ReviewStateModel = {
  id: 'state-1',
  userId: 'user-1',
  cardId: 'card-1',
  direction: ReviewDirection.FRONT_TO_BACK,
  dueAt: new Date('2026-01-01T00:00:00Z'),
  stability: 1,
  difficulty: 5,
  intervalDays: 0,
  lapseCount: 0,
  reviewCount: 0,
};

describe('SrsSchedulerService', () => {
  it('keeps again cards due immediately and counts a lapse', () => {
    const result = new SrsSchedulerService().schedule(baseState, ReviewGrade.AGAIN, new Date('2026-01-01T00:00:00Z'));

    expect(result.state.intervalDays).toBe(0);
    expect(result.state.lapseCount).toBe(1);
    expect(result.state.reviewCount).toBe(1);
  });

  it('schedules easy cards farther than good cards', () => {
    const scheduler = new SrsSchedulerService();
    const good = scheduler.schedule(baseState, ReviewGrade.GOOD, new Date('2026-01-01T00:00:00Z'));
    const easy = scheduler.schedule(baseState, ReviewGrade.EASY, new Date('2026-01-01T00:00:00Z'));

    expect(easy.state.intervalDays).toBeGreaterThan(good.state.intervalDays);
  });

  it('matches the scheduling fixture shared with Flutter', () => {
    const fixture = JSON.parse(readFileSync(path.resolve(process.cwd(), 'fixtures/srs-scheduling.json'), 'utf8')) as {
      grades: ReviewGrade[];
      expected: Array<
        Pick<ReviewStateModel, 'stability' | 'difficulty' | 'intervalDays' | 'lapseCount' | 'reviewCount'>
      >;
    };
    const scheduler = new SrsSchedulerService();
    let state = { ...baseState, stability: 0 };
    fixture.grades.forEach((grade, index) => {
      state = scheduler.schedule(state, grade, new Date('2026-01-01T00:00:00Z')).state;
      expect(state).toMatchObject(fixture.expected[index]);
    });
  });
});
