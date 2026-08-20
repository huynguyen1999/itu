/**
 * api.js
 *
 * Server API communication, schedule fetching & delta patching,
 * cache status, background auto-sync polling, dry run, and auto-register execution.
 */

export function createApiModule() {
  return {
    // ── Auto-Sync & Interval Management ───────────────────────────────────────
    setIntervalMs(ms) {
      this.autoSyncIntervalMs = ms;
      localStorage.setItem('talkfirst_auto_sync_interval_ms', String(ms));
      this.isIntervalMenuOpen = false;

      if (ms === 0) {
        this.stopAutoSync();
        this.showToast('⏸️ Auto-refresh turned off (manual fetch only).', 'info');
      } else {
        this.startAutoSync();
        this.showToast(`⏱️ Auto-refresh set to every ${this.autoSyncIntervalLabel}.`, 'success');
      }
    },

    applyCustomInterval() {
      const sec = Number(this.customIntervalSec);
      if (!sec || isNaN(sec) || sec < 3 || sec > 3600) {
        this.showToast('Please enter a valid interval between 3 and 3600 seconds.', 'error');
        return;
      }
      this.customIntervalSec = '';
      this.setIntervalMs(sec * 1000);
    },

    startAutoSync() {
      this.stopAutoSync();
      if (this.autoSyncIntervalMs <= 0) return;
      this.autoSyncIntervalId = setInterval(() => {
        this.performAutoSync();
      }, this.autoSyncIntervalMs);
    },

    stopAutoSync() {
      if (this.autoSyncIntervalId) {
        clearInterval(this.autoSyncIntervalId);
        this.autoSyncIntervalId = null;
      }
    },

    async performAutoSync() {
      if (this.isAutoSyncing || this.isManualFetching) return;
      this.isAutoSyncing = true;
      try {
        await this.fetchSchedule(this.currentMonday, true, true);
        await this.updateCacheStatusDisplay();
        this.lastSyncedAt = new Date();
      } catch (err) {
        console.debug('Background auto-sync failed:', err);
      } finally {
        setTimeout(() => {
          this.isAutoSyncing = false;
        }, 600);
      }
    },

    /**
     * In-place granular delta patching of schedule data.
     * Updates only changed items in flexibleClasses/fixedClasses without recreating DOM elements or dropping selections.
     */
    mergeScheduleData(newSchedule) {
      if (!newSchedule) return;

      if (!this.scheduleData || this.scheduleData.monday !== newSchedule.monday) {
        this.scheduleData = newSchedule;
        this.reconcileSelectionStates();
        return;
      }

      // 1. Merge flexibleClasses in-place
      const incomingFlex = newSchedule.flexibleClasses || [];
      const currentFlex = this.scheduleData.flexibleClasses || [];
      const existingFlexMap = new Map();

      currentFlex.forEach((c) => {
        existingFlexMap.set(this.getCourseKey(c), c);
      });

      const updatedFlex = [];
      for (const inc of incomingFlex) {
        const key = this.getCourseKey(inc);
        const existing = existingFlexMap.get(key);

        if (existing) {
          existing.currentStudents = inc.currentStudents;
          existing.maxStudents = inc.maxStudents;
          existing.hasEnrolled = inc.hasEnrolled;
          existing.teacherName = inc.teacherName;
          existing.teacherNickName = inc.teacherNickName;
          existing.room = inc.room;
          existing.lesson = inc.lesson;
          existing.lessonInfo = inc.lessonInfo;
          existing.subClassType = inc.subClassType;
          existing.programClassName = inc.programClassName;
          updatedFlex.push(existing);
          existingFlexMap.delete(key);
        } else {
          updatedFlex.push(inc);
        }
      }

      this.scheduleData.flexibleClasses = updatedFlex;
      this.scheduleData.fixedClasses = newSchedule.fixedClasses || [];
      this.scheduleData.summary = newSchedule.summary || [];
      this.scheduleData.canBooking = newSchedule.canBooking;
      this.scheduleData.updatedAt = newSchedule.updatedAt;
      this.scheduleData.isCached = newSchedule.isCached;

      // 2. Reconcile selection queue with latest schedule status
      this.reconcileSelectionStates();
    },

    /**
     * Reconciles selectedCoursesMap and toCancelCoursesMap with latest enrolled and capacity statuses.
     */
    reconcileSelectionStates() {
      const allFlex = this.scheduleData?.flexibleClasses || [];
      const allFixed = this.scheduleData?.fixedClasses || [];
      const allCombined = [...allFlex, ...allFixed];
      const slotMap = new Map();

      allCombined.forEach((c) => slotMap.set(this.getCourseKey(c), c));

      // Update selectedCoursesMap
      for (const [key, selected] of this.selectedCoursesMap.entries()) {
        const latest = slotMap.get(key);
        if (latest) {
          if (latest.hasEnrolled) {
            this.selectedCoursesMap.delete(key);
            this.showToast(`📌 "${selected.lesson || selected.lessonTitle}" is now enrolled!`, 'success');
          } else {
            this.selectedCoursesMap.set(key, latest);
          }
        }
      }
      this.selectedCoursesMap = new Map(this.selectedCoursesMap);

      // Update toCancelCoursesMap
      for (const [key, marked] of this.toCancelCoursesMap.entries()) {
        const latest = slotMap.get(key);
        if (latest) {
          if (!latest.hasEnrolled) {
            this.toCancelCoursesMap.delete(key);
            this.showToast(`✅ "${marked.lesson || marked.lessonTitle}" was cancelled.`, 'info');
          } else {
            this.toCancelCoursesMap.set(key, latest);
          }
        }
      }
      this.toCancelCoursesMap = new Map(this.toCancelCoursesMap);
    },

    // ── API Operations ────────────────────────────────────────────────────────
    async fetchSchedule(mondayStr, forceRefresh = false, isSilent = false) {
      try {
        const res = await fetch(`/api/schedule?date=${mondayStr}${forceRefresh ? '&refresh=true' : ''}`);
        if (!res.ok) {
          if (!isSilent) this.showToast(`Failed to load schedule (${res.status})`, 'error');
          return;
        }
        const data = await res.json();
        this.mergeScheduleData(data);
      } catch (err) {
        if (!isSilent) {
          this.showToast(`Failed to load schedule: ${err.message}`, 'error');
        }
      }
    },

    async fetchLatestSchedule() {
      if (this.isManualFetching) return;
      this.isManualFetching = true;
      this.showToast('Fetching latest timetable from TalkFirst...', 'info', 2000);
      try {
        await this.fetchSchedule(this.currentMonday, true);
        await this.updateCacheStatusDisplay();
        this.lastSyncedAt = new Date();
        this.showToast('✅ Timetable updated successfully!', 'success');
      } catch (err) {
        this.showToast(`Fetch error: ${err.message}`, 'error');
      } finally {
        setTimeout(() => {
          this.isManualFetching = false;
        }, 600);
      }
    },

    async loadAuthStatus() {
      try {
        const res = await fetch('/api/auth-status');
        this.auth = await res.json();
      } catch {
        this.auth = { isOfflineMode: true };
      }
    },

    async updateCacheStatusDisplay() {
      try {
        const res = await fetch('/api/classes-cache-status');
        this.cacheStatus = await res.json();
      } catch {}
    },

    async loadEnrolledHistory() {
      try {
        const res = await fetch('/api/enrolled-classes');
        if (res.ok) {
          const data = await res.json();
          this.enrolledClassesHistory = Array.isArray(data.enrolledClasses) ? data.enrolledClasses : [];
        }
      } catch (err) {
        console.debug('Failed to load enrolled history:', err);
      }
    },

    async loadTeacherNotes() {
      try {
        const res = await fetch('/api/teacher-notes');
        if (res.ok) {
          this.teacherNotes = await res.json();
        }
      } catch (err) {
        console.warn('[App] Failed to load teacher notes:', err);
      }
    },

    async executeSaveCourses() {
      try {
        const courses = Array.from(this.selectedCoursesMap.values()).map((c) => this.toCriteria(c));
        if (courses.length === 0) {
          return this.showToast('No courses selected to save.', 'error');
        }
        await fetch('/api/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courses }),
        });
        this.showToast(`✅ Saved ${courses.length} course(s) to courses.json!`, 'success');
      } catch (err) {
        this.showToast(`Failed to save: ${err.message}`, 'error');
      }
    },

    async executeDryRun() {
      const courses = Array.from(this.selectedCoursesMap.values());
      if (courses.length === 0) return this.showToast('Please select at least 1 course first.', 'error');

      try {
        const res = await fetch('/api/dry-run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courses, week: this.weekMode }),
        });
        const data = await res.json();

        let rowsHtml = '';
        (data.plan || []).forEach((item) => {
          const s = item.selected || item.request || {};
          const isReady = item.status === 'READY' || item.status === 'MULTIPLE_MATCHES';
          const color = isReady ? 'var(--freetalk)' : 'var(--danger)';
          rowsHtml += `
            <tr style="border-bottom: 1px solid var(--border-soft);">
              <td style="padding: 8px 10px; font-weight: 600; color: ${color};">${item.status}</td>
              <td style="padding: 8px 10px;">${s.lesson || 'Untitled'}</td>
              <td style="padding: 8px 10px; color: var(--text-dim);">${s.date || 'N/A'} ${(s.startTime || '').slice(0, 5)}</td>
              <td style="padding: 8px 10px; color: var(--text-dim);">${s.teacherNickName || s.teacherName || 'N/A'}</td>
              <td style="padding: 8px 10px; font-size: 11px; color: var(--text-faint);">${item.reason || 'OK'}</td>
            </tr>`;
        });

        this.openModal(
          '🧪 Pre-Flight Dry Run Validation',
          `
          <div style="margin-bottom: 14px; font-size: 12.5px; color: var(--text-dim);">Target Week: <strong>${data.targetWeekLabel || 'N/A'}</strong> • Available to Book: <strong style="color: var(--freetalk);">${data.availableCount} / ${data.totalRequested}</strong></div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead><tr style="background: var(--panel); border-bottom: 1px solid var(--border); text-align: left; color: var(--text-faint);"><th style="padding: 8px 10px;">Status</th><th style="padding: 8px 10px;">Lesson Topic</th><th style="padding: 8px 10px;">Date & Time</th><th style="padding: 8px 10px;">Teacher</th><th style="padding: 8px 10px;">Notes</th></tr></thead>
            <tbody>${rowsHtml || '<tr><td colspan="5" style="padding: 20px; text-align: center;">No courses.</td></tr>'}</tbody>
          </table>`
        );
      } catch (err) {
        this.showToast(`Validation check failed: ${err.message}`, 'error');
      }
    },

    async executeAutoRegister() {
      const selectedList = Array.from(this.selectedCoursesMap.values());
      const toCancelList = Array.from(this.toCancelCoursesMap.values());
      if (selectedList.length === 0 && toCancelList.length === 0) {
        return this.showToast('Please select courses to register or mark enrolled courses to close.', 'error');
      }

      let confirmMsg = '🚀 Launch automated browser pipeline in Chrome?';
      if (toCancelList.length > 0)
        confirmMsg += `\n\n• STEP 1 (Cancel): Spawn ${toCancelList.length} tab(s) to close/cancel marked courses first.`;
      if (selectedList.length > 0)
        confirmMsg += `\n• STEP 2 (Register): Spawn ${selectedList.length} tab(s) to register selected courses.`;
      if (!confirm(confirmMsg)) return;

      this.showToast(
        `Running pipeline: Closing ${toCancelList.length} & Registering ${selectedList.length}...`,
        'info',
        15000
      );

      try {
        const criteria = selectedList.map((c) => this.toCriteria(c));
        const cancelCriteria = toCancelList.map((c) => this.toCriteria(c));
        const res = await fetch('/api/auto-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courses: criteria,
            toCancelCourses: cancelCriteria,
            week: this.currentMonday,
          }),
        });
        const data = await res.json();
        this.toCancelCoursesMap.clear();
        this.toCancelCoursesMap = new Map();

        const report = data?.report || data;
        let rowsHtml = '';
        (report?.results || []).forEach((r, idx) => {
          const isCancel = r.action === 'CANCEL' || (r.status || '').includes('CANCELLED');
          const isOk =
            (r.status || '').includes('REGISTERED') ||
            (r.status || '').includes('CANCELLED') ||
            (r.status || '').includes('READY');
          let badgeColor = isCancel && isOk ? '#f87171' : isOk ? 'var(--freetalk)' : 'var(--danger)';
          const actionTag = isCancel
            ? `<span style="padding: 2px 6px; font-size: 10px; font-weight: 700; border-radius: 4px; background-color: var(--danger-soft); color: var(--danger); margin-right: 6px;">CLOSE</span>`
            : `<span style="padding: 2px 6px; font-size: 10px; font-weight: 700; border-radius: 4px; background-color: var(--freetalk-soft); color: var(--freetalk); margin-right: 6px;">REGISTER</span>`;
          rowsHtml += `
            <tr style="border-bottom: 1px solid var(--border-soft);">
              <td style="padding: 8px 10px; font-weight: 600;">${idx + 1}</td>
              <td style="padding: 8px 10px;">${actionTag} <strong>${r.lesson || 'Course'}</strong></td>
              <td style="padding: 8px 10px; color: var(--text-dim);">${r.date || 'N/A'} • ${(r.time || '').slice(0, 5)}</td>
              <td style="padding: 8px 10px; color: var(--text-dim);">${r.teacher || 'N/A'}</td>
              <td style="padding: 8px 10px;"><span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: var(--panel); color: ${badgeColor}; border: 1px solid ${badgeColor}40;">${r.status || 'STATUS'}</span></td>
              <td style="padding: 8px 10px; font-size: 11px; color: var(--text-faint);">${r.message || ''}</td>
            </tr>`;
        });

        this.openModal(
          '🚀 Automated Action Report',
          `
          <div style="margin-bottom: 14px; font-size: 12px; color: var(--text-dim);">Executed on <strong>${new Date().toLocaleTimeString()}</strong> • Multi-tab concurrent cancellation & registration</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead><tr style="background: var(--panel); border-bottom: 1px solid var(--border); text-align: left; color: var(--text-faint);"><th style="padding: 8px 10px;">#</th><th style="padding: 8px 10px;">Action & Topic</th><th style="padding: 8px 10px;">Date & Time</th><th style="padding: 8px 10px;">Teacher</th><th style="padding: 8px 10px;">Status</th><th style="padding: 8px 10px;">Details</th></tr></thead>
            <tbody>${rowsHtml || '<tr><td colspan="6" style="padding: 20px; text-align: center;">No operations performed.</td></tr>'}</tbody>
          </table>`
        );

        await this.fetchSchedule(this.currentMonday, true);
        await this.loadEnrolledHistory();
      } catch (err) {
        this.showToast(`Auto-register failed: ${err.message}`, 'error', 6000);
      }
    },
  };
}
