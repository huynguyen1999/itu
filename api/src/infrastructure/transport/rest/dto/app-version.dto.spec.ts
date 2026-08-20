import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { APP_VERSION_ERRORS } from '@core/domain/app-version';
import { CheckAppVersionQueryDto } from './app-version.dto';

describe('CheckAppVersionQueryDto', () => {
  it('accepts a supported app-version query', async () => {
    const dto = plainToInstance(CheckAppVersionQueryDto, {
      platform: 'ios',
      version: '1.10.0',
      channel: 'stable',
    });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it.each([
    { platform: 'android', version: '1.0.0', channel: 'stable' },
    { platform: 'ios', version: '1.x.0', channel: 'stable' },
    { platform: 'ios', version: '1.0.0', channel: 'beta' },
  ])('rejects invalid query %j', async (query) => {
    expect(await validate(plainToInstance(CheckAppVersionQueryDto, query))).not.toEqual([]);
  });

  it('uses stable error codes for invalid platform and version', async () => {
    const errors = await validate(
      plainToInstance(CheckAppVersionQueryDto, {
        platform: 'android',
        version: '1.x.0',
        channel: 'stable',
      }),
    );

    expect(errors.find(({ property }) => property === 'platform')?.constraints).toEqual(
      expect.objectContaining({ isEnum: APP_VERSION_ERRORS.platformInvalid }),
    );
    expect(errors.find(({ property }) => property === 'version')?.constraints).toEqual(
      expect.objectContaining({ matches: APP_VERSION_ERRORS.versionInvalid }),
    );
  });
});
