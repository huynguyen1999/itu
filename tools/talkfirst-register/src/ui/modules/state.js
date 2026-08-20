/**
 * state.js
 *
 * Reactive state baseline, periods layout configuration, and auto-sync options
 * for the TalkFirst Pre-Registrar application.
 */

export function createInitialState() {
  const initialMonday = window.dayjs
    ? window.dayjs().startOf('isoWeek').format('YYYY-MM-DD')
    : new Date().toISOString().slice(0, 10);

  return {
    currentMonday: initialMonday,
    targetDate: null,
    weekMode: 'this', // 'this' | 'next' | 'custom'
    weekData: null,
    scheduleData: null,
    selectedCoursesMap: new Map(),
    toCancelCoursesMap: new Map(),
    activeFilter: 'all', // 'all' | 'main' | 'freetalk' | 'skills'
    showOnlyEnrolled: false,
    enrolledClassesHistory: [],
    searchQuery: '',
    auth: null,
    cacheStatus: null,
    isAutoSyncing: false,
    isManualFetching: false,
    lastSyncedAt: null,
    autoSyncIntervalId: null,
    autoSyncIntervalMs: 15000, // 15 seconds default
    isIntervalMenuOpen: false,
    customIntervalSec: '',
    intervalOptions: [
      { value: 0, label: 'Off', desc: 'Manual only' },
      { value: 5000, label: '5s', desc: 'Real-time' },
      { value: 10000, label: '10s', desc: 'Fast' },
      { value: 15000, label: '15s', desc: 'Default' },
      { value: 30000, label: '30s', desc: 'Standard' },
      { value: 60000, label: '1m', desc: 'Relaxed' },
      { value: 120000, label: '2m', desc: 'Low network' },
      { value: 300000, label: '5m', desc: 'Slow' },
    ],
    isMobileSidebarOpen: false,
    modal: { open: false, title: '', content: '' },
    popover: {
      visible: false,
      x: 0,
      y: 0,
      title: '',
      category: '',
      catBg: '',
      catColor: '',
      teacher: '',
      teacherName: '',
      teacherNickName: '',
      teacherCode: '',
      teacherNote: null,
      room: '',
      time: '',
      seats: '',
      fillPct: 0,
      status: '',
      statusColor: '',
      hint: '',
      pastEnrolled: [],
    },
    teacherNotes: {},
    trFilter: {
      startDate: '',
      endDate: '',
      activeTab: 'summary',
      searchQuery: '',
      selectedTeacher: null,
      expandedTeachers: new Set(),
      showImport: false,
    },

    PERIODS_CONFIG: [
      {
        id: 'morning',
        name: 'Morning',
        class: 'morning',
        slots: [
          { start: '08:50:00', end: '10:20:00', labelHtml: '08:50<br>–10:20' },
          { start: '10:30:00', end: '12:00:00', labelHtml: '10:30<br>–12:00' },
        ],
      },
      {
        id: 'afternoon',
        name: 'Afternoon',
        class: 'afternoon',
        slots: [
          { start: '13:30:00', end: '15:00:00', labelHtml: '13:30<br>–15:00' },
          { start: '15:30:00', end: '17:00:00', labelHtml: '15:30<br>–17:00' },
        ],
      },
      {
        id: 'evening',
        name: 'Evening',
        class: 'evening',
        slots: [
          { start: '18:15:00', end: '19:45:00', labelHtml: '18:15<br>–19:45' },
          { start: '19:50:00', end: '21:20:00', labelHtml: '19:50<br>–21:20' },
          { start: '20:00:00', end: '21:30:00', labelHtml: '20:00<br>–21:30' },
        ],
      },
    ],
  };
}
