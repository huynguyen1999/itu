import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { CONFIG_KEYS, DEFAULT_URLS } from '@core/application/constants/app.constants';
import { BuiltinAudioController } from '@infrastructure/transport/rest/controllers/builtin-audio.controller';
import path from 'path';

@Module({
  imports: [
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const publicRoot = config.get<string>(CONFIG_KEYS.publicRoot, DEFAULT_URLS.publicRoot);
        return [
          {
            rootPath: path.resolve(process.cwd(), publicRoot),
            serveRoot: '/',
            exclude: [
              '/api*',
              '/auth*',
              '/productivity*',
              '/media*',
              '/sync*',
              '/decks*',
              '/study*',
              '/growth*',
              '/dashboard*',
              '/ai*',
              '/trash*',
              '/devices*',
              '/cards*',
            ],
          },
        ];
      },
    }),
  ],
  controllers: [BuiltinAudioController],
})
export class PublicModule {}
