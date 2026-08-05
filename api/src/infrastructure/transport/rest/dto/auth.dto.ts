import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class LoginDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  identifier?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsString()
  @MaxLength(256)
  password!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username?: string | null;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  newPassword!: string;
}

export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;
}

export class GoogleRegisterDto {
  @IsString()
  @IsNotEmpty()
  registerToken!: string;

  @IsBoolean()
  termsAgreed!: boolean;
}

export class OAuthExchangeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
