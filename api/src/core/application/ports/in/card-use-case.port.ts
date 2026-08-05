import { CardSide, CardType } from '@core/domain/enums';
import { CardImageModel, CardModel } from '@core/domain/models';
import { CursorPage, CursorPageOptions } from '@core/application/ports/pagination.port';

export interface CreateCardCommand {
  type: CardType;
  promptRichText: string;
  answerRichText: string;
  tags?: string[];
}

export interface UpdateCardCommand {
  type?: CardType;
  promptRichText?: string;
  answerRichText?: string;
  tags?: string[];
  resetReviewDate?: boolean;
}

export interface AttachImageCommand {
  cardId: string;
  side: CardSide;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ImportCardsCommand {
  deckName: string;
  items: Array<{
    question: string;
    answer: string;
    nextReviewDate?: string;
    generateReverse?: boolean;
  }>;
}

export interface MoveCardsCommand {
  cardIds: string[];
  targetDeckId: string;
}

export interface ICardUseCase {
  list(userId: string, deckId: string, options?: CursorPageOptions): Promise<CursorPage<CardModel>>;
  get(userId: string, cardId: string): Promise<CardModel>;
  create(userId: string, deckId: string, command: CreateCardCommand): Promise<CardModel>;
  update(userId: string, cardId: string, command: UpdateCardCommand): Promise<CardModel>;
  remove(userId: string, cardId: string): Promise<void>;
  attachImage(userId: string, command: AttachImageCommand): Promise<CardImageModel>;
  removeImage(userId: string, cardId: string, imageId: string): Promise<void>;
  importCards(userId: string, command: ImportCardsCommand): Promise<CardModel[]>;
  move(userId: string, command: MoveCardsCommand): Promise<{ movedCardIds: string[]; targetDeckId: string }>;
}
