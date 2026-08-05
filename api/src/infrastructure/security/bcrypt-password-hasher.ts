import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { IPasswordHasher } from '@core/application/ports/out/services.port';

@Injectable()
export class BcryptPasswordHasher implements IPasswordHasher {
  hash(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
