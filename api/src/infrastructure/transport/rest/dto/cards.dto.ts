import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CardSide, CardType } from '@core/domain/enums';
import { CardImageModel } from '@core/domain/models';

export class CreateCardDto {
  @IsEnum(CardType)
  type!: CardType;

  @IsString()
  @MaxLength(20000)
  promptRichText!: string;

  @IsString()
  @MaxLength(20000)
  answerRichText!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  resetReviewDate?: boolean;
}

export class UpdateCardDto {
  @IsOptional()
  @IsEnum(CardType)
  type?: CardType;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  promptRichText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  answerRichText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];
}

export class MoveCardsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayMinSize(1)
  @IsString({ each: true })
  cardIds!: string[];

  @IsString()
  @MinLength(1)
  targetDeckId!: string;
}

export class UploadCardImageDto {
  @IsEnum(CardSide)
  side!: CardSide;
}

export class CardImageResponseDto {
  id!: string;
  cardId!: string;
  side!: CardSide;
  url!: string;
  mimeType!: string;
  width!: number;
  height!: number;
  sizeBytes!: number;
  sortOrder!: number;
  createdAt!: Date;
}

export function toCardImageResponseDto(image: CardImageModel): CardImageResponseDto {
  return {
    id: image.id,
    cardId: image.cardId,
    side: image.side,
    url: image.url,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    sizeBytes: image.sizeBytes,
    sortOrder: image.sortOrder,
    createdAt: image.createdAt,
  };
}

export class AiCardSuggestionDto {
  @IsString()
  @MaxLength(20000)
  pastedText!: string;
}

export class AiSessionGradingDto {
  @IsString()
  @MaxLength(20000)
  summary!: string;
}

export class ImportCardItemDto {
  @IsString()
  @MaxLength(20000)
  question!: string;

  @IsString()
  @MaxLength(20000)
  answer!: string;

  @IsOptional()
  @IsString()
  nextReviewDate?: string;

  @IsOptional()
  @IsBoolean()
  generateReverse?: boolean;
}

export class ImportCardsDto {
  @IsString()
  @MinLength(1)
  deckName!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportCardItemDto)
  items!: ImportCardItemDto[];
}
