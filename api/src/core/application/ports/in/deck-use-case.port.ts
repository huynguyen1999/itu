import { DeckModel } from '@core/domain/models';
import { CursorPage, CursorPageOptions } from '@core/application/ports/pagination.port';
import { DeckColor, DeckIcon } from '@core/domain/enums';

export interface CreateDeckCommand {
  title: string;
  description?: string;
  icon?: DeckIcon;
  color?: DeckColor;
}

export interface UpdateDeckCommand {
  title?: string;
  description?: string | null;
  archived?: boolean;
  icon?: DeckIcon;
  color?: DeckColor;
}

export interface DeckStudyStats {
  totalCards: number;
  toReviewCount: number;
  newCount: number;
  dueCount: number;
  reviewedCount: number;
  lastStudiedAt?: Date | null;
}

export interface DeckListItem extends DeckModel {
  studyStats: DeckStudyStats;
}

export interface IDeckUseCase {
  list(userId: string, options?: CursorPageOptions): Promise<CursorPage<DeckListItem>>;
  get(userId: string, deckId: string): Promise<DeckModel>;
  create(userId: string, command: CreateDeckCommand): Promise<DeckModel>;
  update(userId: string, deckId: string, command: UpdateDeckCommand): Promise<DeckModel>;
  remove(userId: string, deckId: string): Promise<void>;
}
