import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { REST_ROUTES } from '../../../../core/application/constants/app.constants';
import { TOKENS } from '../../../../core/application/constants/tokens';
import type { IMediaStorage } from '../../../../core/application/ports/out/services.port';
import { GymService } from '../../../../core/application/use-cases/gym.service';
import { AuthGuard } from '../guards/auth.guard';
import {
  CreateExerciseDto,
  UpdateExerciseDto,
  CreateWorkoutDto,
  UpdateWorkoutDto,
} from '../dto/gym.dto';
import type { AuthenticatedMultipartRequest, AuthenticatedRequest } from '../types/authenticated-request';
import { createUlid } from '../../../../core/application/ulid';
import type { FastifyReply } from 'fastify';

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.gym)
export class GymController {
  constructor(
    private readonly gymService: GymService,
    @Inject(TOKENS.MEDIA_STORAGE) private readonly mediaStorage: IMediaStorage,
  ) {}

  @Get('overview')
  getOverview(@Req() req: AuthenticatedRequest) {
    return this.gymService.getOverview(req.user.sub);
  }

  @Get('exercises')
  getExercises(@Req() req: AuthenticatedRequest) {
    return this.gymService.getExercises(req.user.sub);
  }

  @Post('exercises')
  createExercise(@Req() req: AuthenticatedRequest, @Body() dto: CreateExerciseDto) {
    return this.gymService.createExercise(req.user.sub, dto);
  }

  @Get('exercises/:id')
  async getExerciseById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const ex = await this.gymService.getExerciseById(req.user.sub, id);
    if (!ex) throw new NotFoundException(`Exercise ${id} not found`);
    return ex;
  }

  @Patch('exercises/:id')
  updateExercise(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateExerciseDto) {
    return this.gymService.updateExercise(req.user.sub, id, dto);
  }

  @Delete('exercises/:id')
  archiveExercise(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.archiveExercise(req.user.sub, id);
  }

  @Post('exercises/:id/image')
  async uploadExerciseImage(@Req() req: AuthenticatedMultipartRequest, @Param('id') id: string) {
    const upload = await req.file();
    if (!upload) throw new BadRequestException('Image file is required');
    const imageId = createUlid();
    const storageKey = `gym/exercises/${req.user.sub}/${id}/${imageId}_${upload.filename || 'image'}`;
    const buffer = await upload.toBuffer();
    await this.mediaStorage.storeRawBuffer(storageKey, buffer);
    const imageUrl = `/gym/exercises/${id}/image`;
    return this.gymService.updateExerciseImage(req.user.sub, id, storageKey, imageUrl);
  }

  @Get('exercises/:id/image')
  async getExerciseImageFile(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res() res: FastifyReply) {
    const ex = await this.gymService.getExerciseById(req.user.sub, id);
    if (!ex || !ex.imageStorageKey) throw new NotFoundException('Exercise image not found');
    const stream = await this.mediaStorage.read(ex.imageStorageKey);
    if (!stream) throw new NotFoundException('Exercise image file not found');
    res.header('Content-Type', 'image/webp');
    res.header('Cache-Control', 'public, max-age=86400');
    return res.send(stream);
  }

  @Delete('exercises/:id/image')
  deleteExerciseImage(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.deleteExerciseImage(req.user.sub, id);
  }

  @Get('exercises/:id/stats')
  getExerciseStats(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.getExerciseStats(req.user.sub, id);
  }

  @Get('workouts')
  getWorkouts(@Req() req: AuthenticatedRequest, @Query('status') status?: any, @Query('limit') limit?: string) {
    return this.gymService.getWorkouts(req.user.sub, {
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('workouts')
  createWorkout(@Req() req: AuthenticatedRequest, @Body() dto: CreateWorkoutDto) {
    return this.gymService.createWorkout(req.user.sub, {
      ...dto,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
    });
  }

  @Get('workouts/:id')
  async getWorkoutById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workout = await this.gymService.getWorkoutById(req.user.sub, id);
    if (!workout) throw new NotFoundException(`Workout ${id} not found`);
    return workout;
  }

  @Patch('workouts/:id')
  updateWorkout(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateWorkoutDto) {
    return this.gymService.updateWorkout(req.user.sub, id, {
      ...dto,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
    });
  }

  @Delete('workouts/:id')
  deleteWorkout(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.deleteWorkout(req.user.sub, id);
  }

  @Post('workouts/:id/complete')
  completeWorkout(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.completeWorkout(req.user.sub, id);
  }

  @Post('workouts/:id/abandon')
  abandonWorkout(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.abandonWorkout(req.user.sub, id);
  }
}
