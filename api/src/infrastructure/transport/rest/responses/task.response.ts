import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '@prisma/client';

export class TaskListResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) description?: string | null;
  @ApiProperty() color!: string;
  @ApiPropertyOptional() isDefault?: boolean;
  @ApiPropertyOptional({ nullable: true }) archivedAt?: string | null;
  @ApiProperty() version!: number;
  @ApiPropertyOptional() taskCount?: number;
}

export class TaskTagResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() color!: string;
}

export class TaskTagWrapperResponse {
  @ApiProperty({ type: () => TaskTagResponse }) tag!: TaskTagResponse;
}

export class TaskSectionResponse {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) taskListId?: string | null;
  @ApiPropertyOptional({ nullable: true }) projectId?: string | null;
  @ApiProperty() title!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() version!: number;
}

export class TaskReminderResponse {
  @ApiProperty() id!: string;
  @ApiProperty() remindAt!: string;
  @ApiProperty({ enum: ['ABSOLUTE', 'RELATIVE'] }) type!: string;
  @ApiPropertyOptional({ enum: ['DUE_AT', 'SCHEDULE_START_AT'], nullable: true }) relativeTo?: string | null;
  @ApiPropertyOptional({ nullable: true }) offsetMinutes?: number | null;
  @ApiPropertyOptional({ nullable: true }) calendarDayOffset?: number | null;
  @ApiPropertyOptional({ nullable: true }) timeOfDayMinutes?: number | null;
  @ApiPropertyOptional({ nullable: true }) timeZone?: string | null;
  @ApiProperty({ enum: ['SCHEDULED', 'SNOOZED', 'DISMISSED', 'DELIVERED', 'CANCELED'] }) status!: string;
  @ApiProperty() persistent!: boolean;
}

export class SubtaskChildResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: TaskStatus }) status!: TaskStatus;
}

export class ProductivityTaskResponse {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) taskListId?: string | null;
  @ApiPropertyOptional({ nullable: true }) projectId?: string | null;
  @ApiPropertyOptional({ nullable: true }) sectionId?: string | null;
  @ApiPropertyOptional({ nullable: true }) parentId?: string | null;
  @ApiProperty() title!: string;
  @ApiProperty() descriptionMarkdown!: string;
  @ApiProperty({ enum: TaskPriority }) priority!: TaskPriority;
  @ApiProperty() important!: boolean;
  @ApiPropertyOptional({ nullable: true }) urgentOverride?: boolean | null;
  @ApiProperty() urgent!: boolean;
  @ApiProperty() urgencyReason!: string;
  @ApiPropertyOptional({ nullable: true }) scheduledStartAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) scheduledEndAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) dueAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) estimatedMinutes?: number | null;
  @ApiPropertyOptional({ nullable: true }) recurrenceRule?: string | null;
  @ApiProperty({ enum: TaskStatus }) status!: TaskStatus;
  @ApiProperty() sortOrder!: number;
  @ApiPropertyOptional({ nullable: true }) completedAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) deletedAt?: string | null;
  @ApiPropertyOptional() createdAt?: string;
  @ApiPropertyOptional() updatedAt?: string;
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ type: () => TaskListResponse, nullable: true }) taskList?: TaskListResponse | null;
  @ApiPropertyOptional({ type: () => TaskListResponse, nullable: true }) project?: TaskListResponse | null;
  @ApiPropertyOptional({ type: () => TaskSectionResponse, nullable: true }) section?: TaskSectionResponse | null;
  @ApiProperty({ type: () => [TaskTagWrapperResponse] }) tags!: TaskTagWrapperResponse[];
  @ApiProperty({ type: () => [TaskReminderResponse] }) reminders!: TaskReminderResponse[];
  @ApiProperty({ type: () => [SubtaskChildResponse] }) children!: SubtaskChildResponse[];
}

export class TaskMatrixResponse {
  @ApiProperty({ type: () => [ProductivityTaskResponse] }) doFirst!: ProductivityTaskResponse[];
  @ApiProperty({ type: () => [ProductivityTaskResponse] }) schedule!: ProductivityTaskResponse[];
  @ApiProperty({ type: () => [ProductivityTaskResponse] }) delegate!: ProductivityTaskResponse[];
  @ApiProperty({ type: () => [ProductivityTaskResponse] }) dontDo!: ProductivityTaskResponse[];
}
