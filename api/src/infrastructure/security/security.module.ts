import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TOKENS } from '@core/application/constants/tokens';
import { BcryptPasswordHasher } from './bcrypt-password-hasher';
import { JwtTokenService } from './jwt-token.service';

@Module({
  imports: [JwtModule.register({}), PassportModule],
  providers: [
    BcryptPasswordHasher,
    JwtTokenService,
    { provide: TOKENS.PASSWORD_HASHER, useExisting: BcryptPasswordHasher },
    { provide: TOKENS.TOKEN_SERVICE, useExisting: JwtTokenService },
  ],
  exports: [TOKENS.PASSWORD_HASHER, TOKENS.TOKEN_SERVICE, JwtModule, PassportModule],
})
export class SecurityModule {}
