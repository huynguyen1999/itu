import { TrashController } from './trash.controller';

describe('TrashController global collections', () => {
  const trash = {
    restoreJournalEntry: jest.fn(),
    restoreExpense: jest.fn(),
    restoreGymWorkout: jest.fn(),
    restoreGymExercise: jest.fn(),
    deleteJournalEntry: jest.fn(),
    deleteExpense: jest.fn(),
    deleteGymWorkout: jest.fn(),
    deleteGymExercise: jest.fn(),
  };
  let controller: TrashController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TrashController(trash as any);
  });

  it('passes authenticated owner and route ids to restore handlers', async () => {
    trash.restoreJournalEntry.mockResolvedValue({ id: 'entry-1' });
    trash.restoreExpense.mockResolvedValue({ id: 'expense-1' });
    trash.restoreGymWorkout.mockResolvedValue({ id: 'workout-1' });
    trash.restoreGymExercise.mockResolvedValue({ id: 'exercise-1' });
    const req = { user: { sub: 'user-1' } } as any;

    await expect(controller.restoreJournalEntry(req, 'entry-1')).resolves.toEqual({ id: 'entry-1' });
    await expect(controller.restoreExpense(req, 'expense-1')).resolves.toEqual({ id: 'expense-1' });
    await expect(controller.restoreGymWorkout(req, 'workout-1')).resolves.toEqual({ id: 'workout-1' });
    await expect(controller.restoreGymExercise(req, 'exercise-1')).resolves.toEqual({ id: 'exercise-1' });

    expect(trash.restoreJournalEntry).toHaveBeenCalledWith('user-1', 'entry-1');
    expect(trash.restoreExpense).toHaveBeenCalledWith('user-1', 'expense-1');
    expect(trash.restoreGymWorkout).toHaveBeenCalledWith('user-1', 'workout-1');
    expect(trash.restoreGymExercise).toHaveBeenCalledWith('user-1', 'exercise-1');
  });

  it('returns an acknowledgement after permanent deletion', async () => {
    const req = { user: { sub: 'user-1' } } as any;

    await expect(controller.deleteJournalEntry(req, 'entry-1')).resolves.toEqual({ ok: true });
    await expect(controller.deleteExpense(req, 'expense-1')).resolves.toEqual({ ok: true });
    await expect(controller.deleteGymWorkout(req, 'workout-1')).resolves.toEqual({ ok: true });
    await expect(controller.deleteGymExercise(req, 'exercise-1')).resolves.toEqual({ ok: true });

    expect(trash.deleteJournalEntry).toHaveBeenCalledWith('user-1', 'entry-1');
    expect(trash.deleteExpense).toHaveBeenCalledWith('user-1', 'expense-1');
    expect(trash.deleteGymWorkout).toHaveBeenCalledWith('user-1', 'workout-1');
    expect(trash.deleteGymExercise).toHaveBeenCalledWith('user-1', 'exercise-1');
  });
});
