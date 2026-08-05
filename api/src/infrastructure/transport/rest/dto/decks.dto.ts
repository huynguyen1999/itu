import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DeckColor, DeckIcon } from '@core/domain/enums';

export class CreateDeckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(DeckIcon)
  icon?: DeckIcon;

  @IsOptional()
  @IsEnum(DeckColor)
  color?: DeckColor;
}

export class UpdateDeckDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsEnum(DeckIcon)
  icon?: DeckIcon;

  @IsOptional()
  @IsEnum(DeckColor)
  color?: DeckColor;
}
