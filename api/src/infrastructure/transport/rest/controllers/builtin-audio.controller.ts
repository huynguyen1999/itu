import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_KEYS, DEFAULT_URLS } from '@core/application/constants/app.constants';
import { BUILTIN_FOCUS_SOUNDS } from '@core/application/constants/focus-sound.constants';

import { ApiParam } from '@nestjs/swagger';

const BUILTIN_FOCUS_AUDIO_FILES = new Set(BUILTIN_FOCUS_SOUNDS.map((sound) => path.basename(sound.url)));

type BuiltinAudioRouteParams = {
  '*': string;
};

@Controller()
export class BuiltinAudioController {
  constructor(private readonly config: ConfigService) {}

  @ApiParam({ name: 'path', required: true })
  @Get('audio/focus/*')
  async getFocusAudio(@Param() params: BuiltinAudioRouteParams, @Res() res: FastifyReply) {
    const file = path.basename(params['*']);
    if (!BUILTIN_FOCUS_AUDIO_FILES.has(file)) throw new NotFoundException();

    const publicRoot = this.config.get<string>(CONFIG_KEYS.publicRoot, DEFAULT_URLS.publicRoot);
    const audioPath = path.resolve(process.cwd(), publicRoot, 'audio', 'focus', file);
    await fs.access(audioPath).catch(() => {
      throw new NotFoundException();
    });

    res.header('Content-Type', 'audio/mpeg');
    res.header('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(createReadStream(audioPath));
  }
}
