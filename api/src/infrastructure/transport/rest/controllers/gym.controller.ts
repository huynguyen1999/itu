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
  CreateRoutineDto,
  UpdateRoutineDto,
  CreateWorkoutDto,
  UpdateWorkoutDto,
  UpdateWorkoutExerciseDto,
  ExerciseStatsResponseDto,
} from '../dto/gym.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import type { AuthenticatedMultipartRequest, AuthenticatedRequest } from '../types/authenticated-request';
import { createUlid } from '../../../../core/application/ulid';
import type { FastifyReply } from 'fastify';
import { hcmcDateOnly } from '@core/application/utils/calendar';
import { parseDate } from '@core/application/use-cases/usage-validation';

function normalizeWorkoutExercises(exercises: UpdateWorkoutExerciseDto[] | undefined) {
  return exercises?.map((exercise) => ({
    ...exercise,
    sets: exercise.sets?.map((set) => ({
      ...set,
      completedAt: set.completedAt === undefined || set.completedAt === null ? set.completedAt : new Date(set.completedAt),
    })),
  }));
}

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

  @Get('analytics')
  getAnalytics(@Req() req: AuthenticatedRequest, @Query('range') range?: any, @Query('from') from?: string, @Query('to') to?: string) {
    if (from || to) {
      if (!from || !to) throw new BadRequestException('from and to are required together');
      parseDate(from, 'from');
      parseDate(to, 'to');
      const start = hcmcDateOnly(from);
      const end = new Date(hcmcDateOnly(to).getTime() + 86_400_000 - 1);
      return this.gymService.getAnalytics(req.user.sub, 'CUSTOM', start, end);
    }
    return this.gymService.getAnalytics(req.user.sub, range);
  }

  // ---------------------------------------------------------------------------
  // EXERCISES
  // ---------------------------------------------------------------------------

  @Get('exercises')
  getExercises(
    @Req() req: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('muscle') muscle?: string,
    @Query('equipment') equipment?: string,
    @Query('favoriteOnly') favoriteOnly?: string,
  ) {
    return this.gymService.getExercises(req.user.sub, {
      search,
      muscle,
      equipment,
      favoriteOnly: favoriteOnly === 'true',
    });
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

  @Post('exercises/:id/favorite')
  toggleFavoriteExercise(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.toggleFavoriteExercise(req.user.sub, id);
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
    try {
      return await this.gymService.updateExerciseImage(req.user.sub, id, storageKey, imageUrl);
    } catch (error) {
      await this.mediaStorage.delete(storageKey).catch(() => undefined);
      throw error;
    }
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
  @ApiOkResponse({ type: ExerciseStatsResponseDto })
  getExerciseStats(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.getExerciseStats(req.user.sub, id);
  }

  @Get('exercises/:id/progress')
  getExerciseProgress(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('range') range?: any) {
    return this.gymService.getExerciseProgress(req.user.sub, id, range);
  }

  // ---------------------------------------------------------------------------
  // ROUTINES
  // ---------------------------------------------------------------------------

  @Get('routines')
  getRoutines(@Req() req: AuthenticatedRequest) {
    return this.gymService.getRoutines(req.user.sub);
  }

  @Post('routines')
  createRoutine(@Req() req: AuthenticatedRequest, @Body() dto: CreateRoutineDto) {
    return this.gymService.createRoutine(req.user.sub, dto);
  }

  @Get('routines/:id')
  async getRoutineById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const routine = await this.gymService.getRoutineById(req.user.sub, id);
    if (!routine) throw new NotFoundException(`Routine ${id} not found`);
    return routine;
  }

  @Patch('routines/:id')
  updateRoutine(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateRoutineDto) {
    return this.gymService.updateRoutine(req.user.sub, id, dto);
  }

  @Delete('routines/:id')
  deleteRoutine(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.deleteRoutine(req.user.sub, id);
  }

  @Post('routines/:id/archive')
  archiveRoutine(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.archiveRoutine(req.user.sub, id);
  }

  @Post('routines/:id/start')
  startWorkoutFromRoutine(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.startWorkoutFromRoutine(req.user.sub, id);
  }

  @Post('routines/create-from-workout')
  createRoutineFromWorkout(@Req() req: AuthenticatedRequest, @Body() body: { workoutId: string; name?: string }) {
    if (!body.workoutId) throw new BadRequestException('workoutId is required');
    return this.gymService.createRoutineFromWorkout(req.user.sub, body.workoutId, body.name);
  }

  @Post('routines/:id/update-from-workout')
  updateRoutineFromWorkout(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { workoutId: string },
  ) {
    if (!body.workoutId) throw new BadRequestException('workoutId is required');
    return this.gymService.updateRoutineFromWorkout(req.user.sub, id, body.workoutId);
  }

  // ---------------------------------------------------------------------------
  // WORKOUTS
  // ---------------------------------------------------------------------------

  @Get('workouts')
  getWorkouts(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: any,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.gymService.getWorkouts(req.user.sub, {
      status,
      limit: limit ? Number(limit) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Post('workouts')
  createWorkout(@Req() req: AuthenticatedRequest, @Body() dto: CreateWorkoutDto) {
    return this.gymService.createWorkout(req.user.sub, {
      ...dto,
      status: dto.status as any,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
      exercises: normalizeWorkoutExercises(dto.exercises),
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
      status: dto.status as any,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
      exercises: normalizeWorkoutExercises(dto.exercises),
    });
  }

  @Delete('workouts/:id')
  deleteWorkout(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.deleteWorkout(req.user.sub, id);
  }

  @Post('workouts/:id/repeat')
  repeatWorkout(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.gymService.repeatWorkout(req.user.sub, id);
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
