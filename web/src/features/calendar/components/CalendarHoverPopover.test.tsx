import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CalendarHoverPopover } from './CalendarHoverPopover';
import type { CalendarTimelineItem } from '@/shared/api/client';

describe('CalendarHoverPopover', () => {
  const dummyRect = {
    top: 100,
    bottom: 140,
    left: 200,
    right: 350,
    width: 150,
    height: 40,
    x: 200,
    y: 100,
    toJSON: () => {},
  } as DOMRect;

  it('renders task details with priority, status, and duration', () => {
    const item: CalendarTimelineItem = {
      id: 'task-1',
      kind: 'TASK_DURATION',
      title: 'Design System Revamp',
      startAt: '2026-08-14T09:00:00Z',
      endAt: '2026-08-14T10:30:00Z',
      sourceName: 'Core Product',
      color: '#10b981',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      description: 'Update color tokens and typography hierarchy.',
      readOnly: false,
    };

    const markup = renderToStaticMarkup(
      <CalendarHoverPopover item={item} targetRect={dummyRect} isOpen={true} />,
    );

    expect(markup).toContain('TASK');
    expect(markup).toContain('P1 High');
    expect(markup).toContain('In Progress');
    expect(markup).toContain('Design System Revamp');
    expect(markup).toContain('Core Product');
    expect(markup).toContain('1h 30m');
    expect(markup).toContain('Update color tokens and typography hierarchy.');
    expect(markup).toContain('Click to view details · Drag to schedule');
  });

  it('renders focus session details with violet badge and read-only indicator', () => {
    const item: CalendarTimelineItem = {
      id: 'focus-1',
      kind: 'FOCUS_SESSION',
      title: 'Deep Coding Session',
      startAt: '2026-08-14T14:00:00Z',
      endAt: '2026-08-14T14:50:00Z',
      sourceName: 'Focus',
      color: '#8b6fc9',
      readOnly: true,
    };

    const markup = renderToStaticMarkup(
      <CalendarHoverPopover item={item} targetRect={dummyRect} isOpen={true} />,
    );

    expect(markup).toContain('FOCUS SESSION');
    expect(markup).toContain('Deep Coding Session');
    expect(markup).toContain('Focus');
    expect(markup).toContain('50m');
    expect(markup).toContain('Read-only item');
  });

  it('renders calendar subscription details with location and external notes', () => {
    const item: CalendarTimelineItem = {
      id: 'sub-1',
      kind: 'EXTERNAL_EVENT',
      title: 'Team Architecture Sync',
      startAt: '2026-08-14T15:00:00Z',
      endAt: '2026-08-14T16:00:00Z',
      sourceName: 'Work Google Calendar',
      location: 'Building 4 - Room 101',
      description: 'Discuss Q3 technical roadmap.',
      readOnly: true,
    };

    const markup = renderToStaticMarkup(
      <CalendarHoverPopover item={item} targetRect={dummyRect} isOpen={true} />,
    );

    expect(markup).toContain('CALENDAR EVENT');
    expect(markup).toContain('Team Architecture Sync');
    expect(markup).toContain('Work Google Calendar');
    expect(markup).toContain('Building 4 - Room 101');
    expect(markup).toContain('Discuss Q3 technical roadmap.');
    expect(markup).toContain('Read-only item');
  });

  it('renders due date task accurately', () => {
    const item: CalendarTimelineItem = {
      id: 'task-due-1',
      kind: 'TASK_DUE',
      title: 'Submit Tax Forms',
      startAt: '2026-08-14T17:00:00Z',
      dueAt: '2026-08-14T17:00:00Z',
      sourceName: 'Finance',
      readOnly: false,
    };

    const markup = renderToStaticMarkup(
      <CalendarHoverPopover item={item} targetRect={dummyRect} isOpen={true} />,
    );

    expect(markup).toContain('DUE DATE');
    expect(markup).toContain('Submit Tax Forms');
    expect(markup).toContain('Finance');
    expect(markup).toContain('Due');
  });

  it('renders multiline and escaped \\n description across separate lines', () => {
    const item: CalendarTimelineItem = {
      id: 'sub-2',
      kind: 'EXTERNAL_EVENT',
      title: 'Class Session',
      startAt: '2026-08-14T15:00:00Z',
      description: 'Class: TO+-Skill-Talk\\nProgram: Talk Show\\nTeacher: Teacher Name',
      readOnly: true,
    };

    const markup = renderToStaticMarkup(
      <CalendarHoverPopover item={item} targetRect={dummyRect} isOpen={true} />,
    );

    expect(markup).toContain('Class: TO+-Skill-Talk');
    expect(markup).toContain('Program: Talk Show');
    expect(markup).toContain('Teacher: Teacher Name');
    expect(markup).not.toContain('\\n');
  });
});
