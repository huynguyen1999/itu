import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/module.esm.js';
import { createInitialState } from './modules/state.js';
import { createUtilsModule } from './modules/utils.js';
import { createScheduleModule } from './modules/schedule.js';
import { createPopoverModule } from './modules/popover.js';
import { createApiModule } from './modules/api.js';
import { createTeacherReportModule } from './modules/teacher-report.js';

function mergeModules(target, ...sources) {
  for (const src of sources) {
    if (!src) continue;
    Object.defineProperties(target, Object.getOwnPropertyDescriptors(src));
  }
  return target;
}

export function preRegistrarApp() {
  const app = mergeModules(
    {},
    createInitialState(),
    createUtilsModule(),
    createScheduleModule(),
    createPopoverModule(),
    createApiModule(),
    createTeacherReportModule()
  );

  app.init = async function init() {
    this.initSidebarResizer();

    // Load persisted refresh interval preference
    const savedInterval = localStorage.getItem('talkfirst_auto_sync_interval_ms');
    if (savedInterval !== null) {
      const parsed = Number(savedInterval);
      if (!isNaN(parsed) && parsed >= 0) {
        this.autoSyncIntervalMs = parsed;
      }
    }

    // Load persisted enrolled-only filter preference
    const savedShowOnlyEnrolled = localStorage.getItem('talkfirst_show_only_enrolled');
    if (savedShowOnlyEnrolled !== null) {
      this.showOnlyEnrolled = savedShowOnlyEnrolled === 'true';
    }

    await this.loadAuthStatus();
    await this.updateCacheStatusDisplay();
    await this.loadEnrolledHistory();
    await this.loadTeacherNotes();
    await this.fetchSchedule(this.currentMonday);

    // Start automatic interval background sync if enabled (> 0)
    if (this.autoSyncIntervalMs > 0) {
      this.startAutoSync();
    }

    // Trigger immediate sync upon returning to tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.autoSyncIntervalMs > 0) {
        this.performAutoSync();
      }
    });
  };

  return app;
}

// Register with Alpine.js
window.Alpine = Alpine;
window.preRegistrarApp = preRegistrarApp;
Alpine.data('preRegistrarApp', preRegistrarApp);
Alpine.start();
