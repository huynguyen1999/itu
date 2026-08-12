import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { MEDIA_CONSTANTS, MEDIA_ERRORS, REST_ROUTES } from '@core/application/constants/app.constants';
import { TaskService } from '@core/application/use-cases/task.service';
import { TaskStatus } from '@prisma/client';
import { HabitService } from '@core/application/use-cases/habit.service';
import { FocusService } from '@core/application/use-cases/focus.service';
import { AuthGuard } from '../guards/auth.guard';
import type { AuthenticatedMultipartRequest, AuthenticatedRequest } from '../types/authenticated-request';
import { REMINDER_ACTION, HABIT_OCCURRENCE_ACTION } from '@core/application/constants/productivity.constants';
import {
  AdjustFocusDto,
  CreateFocusPresetDto,
  CreateHabitDto,
  CreateHabitTimeBlockDto,
  CreateTaskListDto,
  CreateReminderDto,
  CreateTagDto,
  CreateTaskDto,
  CreateTaskSectionDto,
  FocusActionDto,
  HabitCheckInDto,
  HabitChecklistActionDto,
  HabitOccurrenceActionDto,
  HabitRangeDto,
  UpsertHabitCommitmentPolicyDto,
  ReorderTasksDto,
  SnoozeReminderDto,
  StartFocusDto,
  TaskQueryDto,
  UpdateHabitDto,
  UpdateTaskListDto,
  UpdateTaskDto,
  UpdateTaskSectionDto,
  UpdateReminderDto,
} from '../dto/productivity.dto';
import { CursorPageQueryDto } from '../dto/pagination.dto';

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.productivity)
export class ProductivityController {
  constructor(
    private readonly tasksService: TaskService,
    private readonly habitsService: HabitService,
    private readonly focusService: FocusService,
  ) {}

  // Task Lists & Projects
  @Get(REST_ROUTES.taskLists)
  @Get(REST_ROUTES.projects)
  taskLists(@Req() req: AuthenticatedRequest, @Query() query: CursorPageQueryDto) {
    return this.tasksService.listTaskLists(req.user.sub, query);
  }

  @Post(REST_ROUTES.taskLists)
  @Post(REST_ROUTES.projects)
  createTaskList(@Req() req: AuthenticatedRequest, @Body() dto: CreateTaskListDto) {
    return this.tasksService.createTaskList(req.user.sub, dto);
  }

  @Patch(REST_ROUTES.taskListById)
  @Patch(REST_ROUTES.projectById)
  updateTaskList(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateTaskListDto) {
    return this.tasksService.updateTaskList(req.user.sub, id, dto);
  }

  @Delete(REST_ROUTES.taskListById)
  @Delete(REST_ROUTES.projectById)
  deleteTaskList(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.deleteTaskList(req.user.sub, id);
  }

  // Task Tags
  @Get(REST_ROUTES.taskTags)
  tags(@Req() req: AuthenticatedRequest) {
    return this.tasksService.listTaskTags(req.user.sub);
  }

  @Post(REST_ROUTES.taskTags)
  createTag(@Req() req: AuthenticatedRequest, @Body() dto: CreateTagDto) {
    return this.tasksService.createTaskTag(req.user.sub, dto);
  }

  // Task Sections
  @Get(REST_ROUTES.taskSections)
  sections(@Req() req: AuthenticatedRequest, @Query() query: CursorPageQueryDto) {
    return this.tasksService.listSections(req.user.sub, query.taskListId, query);
  }

  @Post(REST_ROUTES.taskSections)
  createSection(@Req() req: AuthenticatedRequest, @Body() dto: CreateTaskSectionDto) {
    return this.tasksService.createSection(req.user.sub, dto);
  }

  @Patch(REST_ROUTES.taskSectionById)
  updateSection(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateTaskSectionDto) {
    return this.tasksService.updateSection(req.user.sub, id, dto);
  }

  @Delete(REST_ROUTES.taskSectionById)
  deleteSection(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.deleteSection(req.user.sub, id);
  }

  // Tasks & Reminders
  @ApiOperation({ operationId: 'listTasks' })
  @Get(REST_ROUTES.tasks)
  tasks(@Req() req: AuthenticatedRequest, @Query() query: TaskQueryDto) {
    return this.tasksService.listTasks(req.user.sub, query);
  }

  @Get(REST_ROUTES.taskMatrix)
  matrix(@Req() req: AuthenticatedRequest) {
    return this.tasksService.getMatrix(req.user.sub);
  }

  @Post(REST_ROUTES.tasks)
  createTask(@Req() req: AuthenticatedRequest, @Body() dto: CreateTaskDto) {
    return this.tasksService.createTask(req.user.sub, dto);
  }

  @Get(REST_ROUTES.taskById)
  getTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.findTaskById(req.user.sub, id);
  }

  @Post(REST_ROUTES.taskReorder)
  reorderTasks(@Req() req: AuthenticatedRequest, @Body() dto: ReorderTasksDto) {
    return this.tasksService.reorderTasks(req.user.sub, dto.taskIds);
  }

  @Patch(REST_ROUTES.taskById)
  updateTask(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.updateTask(req.user.sub, id, dto);
  }

  @Post(REST_ROUTES.taskComplete)
  completeTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.setTaskStatus(req.user.sub, id, TaskStatus.COMPLETED);
  }

  @Post(REST_ROUTES.taskReopen)
  reopenTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.setTaskStatus(req.user.sub, id, TaskStatus.PLANNED);
  }

  @Post(REST_ROUTES.taskCancel)
  cancelTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.setTaskStatus(req.user.sub, id, TaskStatus.CANCELED);
  }

  @Post(REST_ROUTES.taskArchive)
  archiveTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.setTaskStatus(req.user.sub, id, TaskStatus.ARCHIVED);
  }

  @Delete(REST_ROUTES.taskById)
  deleteTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.deleteTask(req.user.sub, id);
  }

  @Post(REST_ROUTES.taskReminders)
  createReminder(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: CreateReminderDto) {
    return this.tasksService.createReminder(req.user.sub, id, dto);
  }

  @Patch(REST_ROUTES.taskReminderById)
  updateReminder(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateReminderDto) {
    return this.tasksService.updateReminder(req.user.sub, id, dto);
  }

  @Post(REST_ROUTES.taskReminderSnooze)
  snoozeReminder(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: SnoozeReminderDto) {
    return this.tasksService.reminderAction(req.user.sub, id, REMINDER_ACTION.SNOOZE, dto.remindAt);
  }

  @Post(REST_ROUTES.taskReminderDismiss)
  dismissReminder(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.reminderAction(req.user.sub, id, REMINDER_ACTION.DISMISS);
  }

  // Notifications
  @Get(REST_ROUTES.notifications)
  notifications(@Req() req: AuthenticatedRequest, @Query() query: CursorPageQueryDto) {
    return this.tasksService.listNotifications(req.user.sub, query);
  }

  @Post(REST_ROUTES.notificationsReadAll)
  markAllNotificationsRead(@Req() req: AuthenticatedRequest) {
    return this.tasksService.markAllNotificationsRead(req.user.sub);
  }

  @Patch(REST_ROUTES.notificationReadById)
  markNotificationRead(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.tasksService.markNotificationRead(req.user.sub, id);
  }

  // Focus
  @Get(REST_ROUTES.focusPresets)
  presets(@Req() req: AuthenticatedRequest) {
    return this.focusService.listFocusPresets(req.user.sub);
  }

  @Post(REST_ROUTES.focusPresets)
  createPreset(@Req() req: AuthenticatedRequest, @Body() dto: CreateFocusPresetDto) {
    return this.focusService.createFocusPreset(req.user.sub, dto);
  }

  @Get(REST_ROUTES.focusSessionsActive)
  activeFocus(@Req() req: AuthenticatedRequest) {
    return this.focusService.getActiveFocusSession(req.user.sub);
  }

  @Get(REST_ROUTES.focusSessionsHistory)
  focusHistory(@Req() req: AuthenticatedRequest) {
    return this.focusService.listFocusHistory(req.user.sub);
  }

  @Get(REST_ROUTES.focusSessionsSummary)
  focusSummary(@Req() req: AuthenticatedRequest) {
    return this.focusService.getFocusSummary(req.user.sub);
  }

  @Get(REST_ROUTES.focusSounds)
  focusSounds(@Req() req: AuthenticatedRequest) {
    return this.focusService.listFocusSounds(req.user.sub);
  }

  @Post(REST_ROUTES.focusSounds)
  async uploadFocusSound(@Req() req: AuthenticatedMultipartRequest) {
    const upload = await req.file();
    if (!upload) throw new BadRequestException(MEDIA_ERRORS.audioFileRequired);
    if (!MEDIA_CONSTANTS.allowedAudioMimeTypes.includes(upload.mimetype)) {
      throw new BadRequestException(MEDIA_ERRORS.unsupportedAudioType);
    }
    const nameField = upload.fields.name as { value?: string } | undefined;
    const name = nameField?.value?.trim() || upload.filename.replace(/\.mp3$/i, '');
    if (!name) throw new BadRequestException('Sound name is required');
    return this.focusService.createFocusSound(req.user.sub, {
      name: name.slice(0, 80),
      originalName: upload.filename,
      mimeType: upload.mimetype,
      buffer: await upload.toBuffer(),
    });
  }

  @Delete(REST_ROUTES.focusSoundById)
  deleteFocusSound(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.focusService.deleteFocusSound(req.user.sub, id);
  }

  @Patch(REST_ROUTES.focusSoundById)
  updateFocusSound(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string },
  ) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Sound name is required');
    return this.focusService.updateFocusSound(req.user.sub, id, { name });
  }

  @Patch(`${REST_ROUTES.focusSounds}/:soundKey/preferences`)
  updateFocusSoundPreference(
    @Req() req: AuthenticatedRequest,
    @Param('soundKey') soundKey: string,
    @Body() body: { enabled?: boolean; sortOrder?: number; volume?: number },
  ) {
    return this.focusService.updateFocusSoundPreference(req.user.sub, soundKey, {
      enabled: body.enabled,
      sortOrder: body.sortOrder,
      volume: body.volume,
    });
  }

  @Post(REST_ROUTES.focusSessions)
  startFocus(@Req() req: AuthenticatedRequest, @Body() dto: StartFocusDto) {
    return this.focusService.startFocusSession(req.user.sub, dto);
  }

  @Post(REST_ROUTES.focusSessionAction)
  focusAction(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('action') action: 'pause' | 'resume' | 'complete' | 'abandon' | 'extend' | 'takeover' | 'attach' | 'rename',
    @Body() dto: FocusActionDto,
  ) {
    return this.focusService.focusAction(req.user.sub, id, action, dto);
  }

  @Patch(REST_ROUTES.focusSessionAdjust)
  adjustFocus(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: AdjustFocusDto) {
    return this.focusService.adjustFocus(
      req.user.sub,
      id,
      dto.startedAt,
      dto.completedAt,
      dto.taskId ?? undefined,
      dto.expectedVersion,
      dto.idempotencyKey,
    );
  }

  // Habits
  @Get(REST_ROUTES.habits)
  habits(@Req() req: AuthenticatedRequest) {
    return this.habitsService.listHabitsWithStats(req.user.sub);
  }

  @Post(REST_ROUTES.habits)
  createHabit(@Req() req: AuthenticatedRequest, @Body() dto: CreateHabitDto) {
    return this.habitsService.createHabit(req.user.sub, dto);
  }

  @Patch(REST_ROUTES.habitById)
  updateHabit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateHabitDto) {
    return this.habitsService.updateHabit(req.user.sub, id, dto);
  }

  @Get(REST_ROUTES.habitOccurrences)
  occurrences(@Req() req: AuthenticatedRequest, @Query() query: HabitRangeDto) {
    return this.habitsService.listHabitOccurrences(req.user.sub, query);
  }

  @Post(REST_ROUTES.habitOccurrenceCheckIn)
  checkIn(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: HabitCheckInDto) {
    return this.habitsService.checkIn(req.user.sub, id, dto);
  }

  @Post(REST_ROUTES.habitOccurrenceSkip)
  skip(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: HabitOccurrenceActionDto) {
    return this.habitsService.habitOccurrenceAction(req.user.sub, id, HABIT_OCCURRENCE_ACTION.SKIP, dto?.idempotencyKey);
  }

  @Post(REST_ROUTES.habitOccurrenceFail)
  fail(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: HabitOccurrenceActionDto) {
    return this.habitsService.habitOccurrenceAction(req.user.sub, id, HABIT_OCCURRENCE_ACTION.FAIL, dto?.idempotencyKey);
  }

  @Post(REST_ROUTES.habitOccurrenceUndo)
  undo(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: HabitOccurrenceActionDto) {
    return this.habitsService.habitOccurrenceAction(req.user.sub, id, HABIT_OCCURRENCE_ACTION.UNDO, dto?.idempotencyKey);
  }

  @Patch(REST_ROUTES.habitOccurrenceChecklist)
  setChecklistItem(
    @Req() req: AuthenticatedRequest,
    @Param('occurrenceId') occurrenceId: string,
    @Param('itemId') itemId: string,
    @Body() dto: HabitChecklistActionDto,
  ) {
    return this.habitsService.setOccurrenceChecklistItem(req.user.sub, occurrenceId, itemId, dto.completed);
  }

  @Get(REST_ROUTES.habitTimeBlocks)
  habitTimeBlocks(@Req() req: AuthenticatedRequest) {
    return this.habitsService.listTimeBlocks(req.user.sub);
  }

  @Post(REST_ROUTES.habitTimeBlocks)
  createHabitTimeBlock(@Req() req: AuthenticatedRequest, @Body() dto: CreateHabitTimeBlockDto) {
    return this.habitsService.createTimeBlock(req.user.sub, dto);
  }

  @Get(REST_ROUTES.habitStats)
  habitStats(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.habitsService.habitStats(req.user.sub, id);
  }

  @Get(REST_ROUTES.habitCommitmentPolicy)
  commitmentPolicy(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.habitsService.getCommitmentPolicy(req.user.sub, id);
  }

  @Patch(REST_ROUTES.habitCommitmentPolicy)
  updateCommitmentPolicy(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpsertHabitCommitmentPolicyDto) {
    return this.habitsService.upsertCommitmentPolicy(req.user.sub, id, dto);
  }

  @Post(REST_ROUTES.habitOccurrenceEvaluateCommitment)
  evaluateCommitment(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: HabitOccurrenceActionDto) {
    return this.habitsService.evaluateCommitment(req.user.sub, id, new Date(), dto?.idempotencyKey);
  }

  @Post(REST_ROUTES.habitOccurrenceExcuseCommitment)
  excuseCommitment(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: HabitOccurrenceActionDto) {
    return this.habitsService.excuseCommitment(req.user.sub, id, dto?.idempotencyKey);
  }
}
