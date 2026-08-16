/**
 * app.js
 * Alpine.js application controller for TalkFirst Course Pre-Registrar UI.
 *
 * Features:
 * - Interval background auto-sync without page reloads or layout shifts.
 * - In-place granular delta patching of schedule grid items.
 * - Resilient selection state preservation (cards remain selectable/deselectable even after status/capacity changes).
 * - Full turnstile & browser registrar integration.
 */

function preRegistrarApp() {
  return {
    currentMonday: dayjs().startOf('isoWeek').add(7, 'day').format('YYYY-MM-DD'),
    weekMode: 'next',
    scheduleData: null,
    selectedCoursesMap: new Map(),
    toCancelCoursesMap: new Map(),
    activeFilter: 'all',
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
      room: '',
      time: '',
      seats: '',
      fillPct: 0,
      status: '',
      statusColor: '',
      hint: '',
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

    async init() {
      this.initSidebarResizer();

      // Load persisted refresh interval preference
      const savedInterval = localStorage.getItem('talkfirst_auto_sync_interval_ms');
      if (savedInterval !== null) {
        const parsed = Number(savedInterval);
        if (!isNaN(parsed) && parsed >= 0) {
          this.autoSyncIntervalMs = parsed;
        }
      }

      await this.loadAuthStatus();
      await this.updateCacheStatusDisplay();
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
    },

    // ── Computed Properties ──────────────────────────────────────────────────
    get weekDateRangeLabel() {
      const mon = dayjs(this.currentMonday);
      const sun = mon.add(6, 'day');
      return `${mon.format('D MMM')} – ${sun.format('D MMM YYYY')}`;
    },

    get authEmail() {
      if (this.auth?.isOfflineMode) return 'Offline (classes.json)';
      if (this.auth?.loggedIn) return this.auth.email || 'Student';
      return 'Unauthenticated';
    },

    get authDotClass() {
      if (this.auth?.isOfflineMode) return 'offline';
      if (this.auth?.loggedIn) return '';
      return 'expired';
    },

    get cacheSlotsCount() {
      return this.cacheStatus?.hasCache ? `${this.cacheStatus.totalCachedClasses || 0} slots` : 'live API';
    },

    get cacheSyncedTime() {
      return this.cacheStatus?.updatedAt ? `synced ${dayjs(this.cacheStatus.updatedAt).format('hh:mm A')}` : 'recent';
    },

    get autoSyncIntervalLabel() {
      if (this.autoSyncIntervalMs === 0) return 'Off';
      const s = Math.round(this.autoSyncIntervalMs / 1000);
      if (s < 60) return `${s}s`;
      const m = Math.round(s / 60);
      return `${m}m`;
    },

    get autoSyncStatusText() {
      if (this.isAutoSyncing || this.isManualFetching) return 'Syncing...';
      if (this.autoSyncIntervalMs === 0) return 'Sync: Paused';
      if (this.lastSyncedAt) return `Synced ${dayjs(this.lastSyncedAt).format('HH:mm:ss')} (${this.autoSyncIntervalLabel})`;
      return `Auto-sync: ${this.autoSyncIntervalLabel}`;
    },

    get weekDays() {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const mon = dayjs(this.currentMonday);
      const todayStr = dayjs().format('YYYY-MM-DD');

      return days.map((dayName, i) => {
        const d = mon.add(i, 'day');
        const dateStr = d.format('YYYY-MM-DD');
        const classes = (this.scheduleData?.flexibleClasses || []).filter((c) => c.date === dateStr);
        const total = classes.length || 1;
        let mCount = 0,
          fCount = 0,
          sCount = 0;
        classes.forEach((c) => {
          const cat = this.getCategoryKey(c);
          if (cat === 'main') mCount++;
          else if (cat === 'freetalk') fCount++;
          else sCount++;
        });

        const mPct = (mCount / total) * 100;
        const fPct = (fCount / total) * 100;
        let conic = `conic-gradient(var(--main) 0% ${mPct}%, var(--freetalk) ${mPct}% ${mPct + fPct}%, var(--skills) ${mPct + fPct}% 100%)`;
        if (classes.length === 0) conic = 'conic-gradient(var(--border) 0% 100%)';

        return {
          dayName,
          dateStr,
          dayNumber: d.format('D'),
          dateShort: d.format('D MMM YYYY'),
          isToday: dateStr === todayStr,
          conicGradient: conic,
        };
      });
    },

    get visiblePeriods() {
      const all = this.scheduleData?.flexibleClasses || [];
      return this.PERIODS_CONFIG.map((period) => {
        const activeSlots = period.slots.filter((slot) => {
          const slotPrefix = slot.start.slice(0, 5);
          return all.some((c) => (c.startTime || '').slice(0, 5) === slotPrefix);
        });
        return { ...period, activeSlots };
      }).filter((p) => p.activeSlots.length > 0);
    },

    get bookCourses() {
      return Array.from(this.selectedCoursesMap.values()).map((c) => this.decorateCourse(c));
    },

    get closeCourses() {
      return Array.from(this.toCancelCoursesMap.values()).map((c) => this.decorateCourse(c));
    },

    get sidebarStatusText() {
      const b = this.selectedCoursesMap.size;
      const c = this.toCancelCoursesMap.size;
      return b > 0 || c > 0 ? `${b} to Book · ${c} to Close` : 'Nothing selected';
    },

    get autoRegisterButtonText() {
      const b = this.selectedCoursesMap.size;
      const c = this.toCancelCoursesMap.size;
      return b > 0 || c > 0 ? `🚀 Proceed (${b} Book · ${c} Close)` : '🚀 Proceed';
    },

    get enrolledTotalCount() {
      const flex = (this.scheduleData?.flexibleClasses || []).filter((c) => c.hasEnrolled);
      const fixed = this.scheduleData?.fixedClasses || [];
      return flex.length + fixed.length;
    },

    get enrolledBreakdownText() {
      const enrolled = [
        ...(this.scheduleData?.flexibleClasses || []).filter((c) => c.hasEnrolled),
        ...(this.scheduleData?.fixedClasses || []),
      ];
      let m = 0,
        f = 0,
        s = 0;
      enrolled.forEach((c) => {
        const cat = this.getCategoryKey(c);
        if (cat === 'main') m++;
        else if (cat === 'freetalk') f++;
        else s++;
      });
      return `(${m} Main · ${f} Free‑Talk · ${s} Skills)`;
    },

    get mainQuotaText() {
      const sel = Array.from(this.selectedCoursesMap.values()).filter((c) => this.getCategoryKey(c) === 'main').length;
      const enr = (this.scheduleData?.flexibleClasses || []).filter(
        (c) => c.hasEnrolled && this.getCategoryKey(c) === 'main'
      ).length;
      return `${sel}/2 · ${enr} enr`;
    },

    get mainQuotaClass() {
      const sel = Array.from(this.selectedCoursesMap.values()).filter((c) => this.getCategoryKey(c) === 'main').length;
      return sel > 2 ? 'danger' : sel === 2 ? 'warning' : '';
    },

    get freeTalkQuotaText() {
      const sel = Array.from(this.selectedCoursesMap.values()).filter(
        (c) => this.getCategoryKey(c) === 'freetalk'
      ).length;
      const enr = (this.scheduleData?.flexibleClasses || []).filter(
        (c) => c.hasEnrolled && this.getCategoryKey(c) === 'freetalk'
      ).length;
      return `${sel}/2 · ${enr} enr`;
    },

    get freeTalkQuotaClass() {
      const sel = Array.from(this.selectedCoursesMap.values()).filter(
        (c) => this.getCategoryKey(c) === 'freetalk'
      ).length;
      return sel > 2 ? 'danger' : sel === 2 ? 'warning' : '';
    },

    get skillsQuotaText() {
      const sel = Array.from(this.selectedCoursesMap.values()).filter((c) => this.getCategoryKey(c) === 'skills').length;
      const enr = (this.scheduleData?.flexibleClasses || []).filter(
        (c) => c.hasEnrolled && this.getCategoryKey(c) === 'skills'
      ).length;
      return `${sel}/∞ · ${enr} enr`;
    },

    // ── Helper Methods ────────────────────────────────────────────────────────
    getCategoryKey(c) {
      if (!c) return 'skills';

      const pid = c.programClassId;

      // 1. Exact Program ID check from TalkFirst API
      if (pid === '019b08a3-11f1-7f49-aee8-6ba81cdb469f') return 'main';
      if (pid === '019b08a3-50e9-7c33-b9ce-0b86668579b6') return 'freetalk';
      if (pid === '019b08a3-b490-7c6c-bd25-d7d11e1c4c35') return 'skills';

      // 2. Summary Program Name lookup
      if (this.scheduleData?.summary && Array.isArray(this.scheduleData.summary)) {
        const summaryItem = this.scheduleData.summary.find((s) => s.programClassId === pid);
        if (summaryItem) {
          const pName = (summaryItem.programClassName || '').toLowerCase();
          if (pName.includes('main')) return 'main';
          if (pName.includes('free') || pName.includes('talk')) return 'freetalk';
          if (pName.includes('skill')) return 'skills';
        }
      }

      // 3. Direct Program Class Name match
      const pName = (c.programClassName || '').toLowerCase();
      if (pName.includes('main')) return 'main';
      if (pName.includes('free') || pName.includes('talk')) return 'freetalk';
      if (pName.includes('skill')) return 'skills';

      // 4. SubClassType Name mapping
      const subName = (typeof c.subClassType === 'object' ? c.subClassType?.name : c.subClassType || '').toLowerCase();
      if (
        subName === 'grammar' ||
        subName.startsWith('communicative') ||
        subName === 'vocabulary' ||
        subName === 'pronunciation'
      ) {
        return 'main';
      }
      if (subName.startsWith('freetalk') || subName.startsWith('free talk')) {
        return 'freetalk';
      }
      if (
        subName.includes('drama') ||
        subName.includes('pitch') ||
        subName.includes('debate') ||
        subName.includes('writing') ||
        subName.includes('public speaking') ||
        subName.includes('presentation') ||
        subName.includes('club')
      ) {
        return 'skills';
      }

      return 'skills';
    },

    isClassPast(c) {
      if (!c?.date) return false;
      const timeStr = c.startTime || '00:00:00';
      const [y, m, d] = c.date.split('-').map(Number);
      const [hh, mm, ss] = timeStr.split(':').map(Number);
      return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0).getTime() < Date.now();
    },

    getCourseKey(c) {
      return c.id || `${c.date}_${(c.startTime || '').slice(0, 5)}_${c.lesson || c.lessonInfo?.lesson || ''}`;
    },

    decorateCourse(c) {
      const isPast = this.isClassPast(c);
      const curr = c.currentStudents || 0;
      const max = c.maxStudents || 1;
      const isFull = curr >= max;
      const isEnrolled = Boolean(c.hasEnrolled);
      const isSelected = this.isSelected(c);
      const isMarkedCancel = this.isMarkedCancel(c);

      // A course is actionable if open to register, already enrolled to close, or currently in user's selection queue
      const canRegister = !isPast && !isEnrolled && (!isFull || isSelected);
      const canClose = !isPast && isEnrolled;
      const isActionable = canRegister || canClose || isSelected || isMarkedCancel;

      return {
        ...c,
        key: this.getCourseKey(c),
        cat: this.getCategoryKey(c),
        lessonTitle: c.lesson || c.lessonInfo?.lesson || 'Untitled Lesson',
        teacherName: c.teacherNickName || c.teacherName || 'Teacher',
        currStudents: curr,
        maxStudents: max,
        isFull,
        isAlmostFull: !isFull && curr >= max - 1 && max > 1,
        isPast,
        canRegister,
        canClose,
        isActionable,
        dateShort: dayjs(c.date).format('D MMM'),
        timeStr: (c.startTime || '').slice(0, 5),
      };
    },

    getClassesForCell(dateStr, slotStart) {
      const slotPrefix = slotStart.slice(0, 5);
      const all = this.scheduleData?.flexibleClasses || [];
      const q = this.searchQuery.trim().toLowerCase();

      return all
        .filter((c) => c.date === dateStr && (c.startTime || '').slice(0, 5) === slotPrefix)
        .map((c) => this.decorateCourse(c))
        .filter((c) => {
          if (this.activeFilter !== 'all' && c.cat !== this.activeFilter) return false;
          if (q) {
            const target = `${c.lessonTitle} ${c.teacherName} ${c.room || ''}`.toLowerCase();
            if (!target.includes(q)) return false;
          }
          return true;
        });
    },

    isSelected(c) {
      return this.selectedCoursesMap.has(this.getCourseKey(c));
    },

    isMarkedCancel(c) {
      return this.toCancelCoursesMap.has(this.getCourseKey(c));
    },

    // ── Interaction Handlers ──────────────────────────────────────────────────
    onCardClick(c) {
      // 1. Guard past classes
      if (c.isPast) {
        this.showToast(`"${c.lessonTitle}" is in the past and cannot be modified.`, 'info');
        return;
      }

      // 2. If already selected to book -> clicking card ALWAYS deselects it
      if (this.isSelected(c)) {
        this.toggleCourseSelection(c);
        return;
      }

      // 3. If already marked to close -> clicking card ALWAYS unmarks it
      if (this.isMarkedCancel(c)) {
        this.toggleCourseToCancel(c);
        return;
      }

      // 4. If enrolled -> clicking card queues it for cancellation
      if (c.hasEnrolled) {
        this.toggleCourseToCancel(c);
        return;
      }

      // 5. If full and not selected -> notify user
      if (c.isFull) {
        this.showToast(`"${c.lessonTitle}" is full (${c.currStudents}/${c.maxStudents} seats).`, 'error');
        return;
      }

      // 6. Normal open course -> select it
      this.toggleCourseSelection(c);
    },

    toggleCourseSelection(c) {
      const key = this.getCourseKey(c);
      if (this.selectedCoursesMap.has(key)) {
        this.selectedCoursesMap.delete(key);
      } else {
        if (c.isPast) return;
        if (c.isFull && !this.selectedCoursesMap.has(key)) {
          this.showToast(`"${c.lessonTitle}" is full (${c.currStudents}/${c.maxStudents} seats).`, 'error');
          return;
        }
        this.selectedCoursesMap.set(key, c);
      }
      this.selectedCoursesMap = new Map(this.selectedCoursesMap);
    },

    toggleCourseToCancel(c) {
      const key = this.getCourseKey(c);
      if (this.toCancelCoursesMap.has(key)) {
        this.toCancelCoursesMap.delete(key);
        this.showToast(`Unmarked "${c.lessonTitle}" from close queue.`, 'info');
      } else {
        if (c.isPast) return;
        this.toCancelCoursesMap.set(key, c);
        this.showToast(`🗑️ Marked "${c.lessonTitle}" to close on Auto Register.`, 'info');
      }
      this.toCancelCoursesMap = new Map(this.toCancelCoursesMap);
    },

    clearAllSelections() {
      this.selectedCoursesMap.clear();
      this.toCancelCoursesMap.clear();
      this.selectedCoursesMap = new Map();
      this.toCancelCoursesMap = new Map();
    },

    locateCard(c) {
      if (window.innerWidth <= 860) {
        this.isMobileSidebarOpen = false;
      }
      const cardEl = document.getElementById('card-' + this.getCourseKey(c));
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        cardEl.classList.remove('card-flash');
        void cardEl.offsetWidth;
        cardEl.classList.add('card-flash');
        setTimeout(() => cardEl.classList.remove('card-flash'), 1400);
      }
    },

    // ── Week Switching ────────────────────────────────────────────────────────
    selectWeekMode(mode) {
      this.weekMode = mode;
      const target = mode === 'this' ? dayjs().startOf('isoWeek') : dayjs().startOf('isoWeek').add(7, 'day');
      this.currentMonday = target.format('YYYY-MM-DD');
      this.fetchSchedule(this.currentMonday);
    },

    changeWeek(deltaDays) {
      this.weekMode = '';
      this.currentMonday = dayjs(this.currentMonday).add(deltaDays, 'day').format('YYYY-MM-DD');
      this.fetchSchedule(this.currentMonday);
    },

    // ── Auto-Sync & Schedule Merging ──────────────────────────────────────────
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

      if (!this.scheduleData) {
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
          // In-place patch properties that might change
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
          // New class added in schedule
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
          // If the course is now enrolled, remove from selection and notify user
          if (latest.hasEnrolled) {
            this.selectedCoursesMap.delete(key);
            this.showToast(`📌 "${selected.lesson || selected.lessonTitle}" is now enrolled!`, 'success');
          } else {
            // Update course data reference to reflect latest seats/teacher
            this.selectedCoursesMap.set(key, latest);
          }
        }
      }
      this.selectedCoursesMap = new Map(this.selectedCoursesMap);

      // Update toCancelCoursesMap
      for (const [key, marked] of this.toCancelCoursesMap.entries()) {
        const latest = slotMap.get(key);
        if (latest) {
          // If course is no longer enrolled, remove from cancel queue
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

    /**
     * Maps a decorated card object back to a clean CourseCriteria suitable
     * for saving to courses.json and passing to the auto-register pipeline.
     * Uses `id` for exact slot matching (most reliable), with human-readable
     * fallback fields for debugging.
     */
    toCriteria(c) {
      return {
        id: c.id,
        lesson: c.lesson || c.lessonTitle,
        date: c.date,
        startTime: c.startTime,
        teacher: c.teacherNickName || c.teacherName,
        room: c.room,
        programClassId: c.programClassId,
        subClassType: c.subClassType,
      };
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
            <tbody>${rowsHtml || '<tr><td colspan="6" style="padding: 20px; text-align: center;">No results.</td></tr>'}</tbody>
          </table>`
        );
        this.showToast('✅ Auto-registration run completed! See report for details.', 'success');
        await this.fetchSchedule(this.currentMonday, true);
      } catch (err) {
        this.showToast(`Auto-registration failed: ${err.message}`, 'error', 8000);
      }
    },

    showEnrolledModal() {
      const combined = [
        ...(this.scheduleData?.flexibleClasses || []).filter((c) => c.hasEnrolled),
        ...(this.scheduleData?.fixedClasses || []),
      ];
      const weekLabel = this.weekDateRangeLabel;

      let rowsHtml = '';
      combined.forEach((raw, idx) => {
        const c = this.decorateCourse(raw);
        const isMarked = this.isMarkedCancel(c);
        const docKey = c.lessonInfo?.studentDocKey;
        const docLink =
          docKey && docKey !== 'N/A'
            ? `<a href="https://campus.talkfirst.vn/${docKey}" target="_blank" style="color: var(--freetalk); text-decoration: underline; font-size: 11px;">📄 Materials</a>`
            : '<span style="color: var(--text-faint); font-size: 11px;">None</span>';
        let statusBadge = `<span style="padding: 2px 7px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: var(--main-soft); color: var(--main); border: 1px solid var(--main-line);">📌 Enrolled</span>`;
        let actionBtn = `<button class="btn" style="padding: 4px 10px; font-size: 11px; font-weight: 700; background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger); border-radius: 6px;" onclick="window.appToggleCancel('${c.key}')">🗑️ Mark to Close</button>`;

        if (c.isPast) {
          statusBadge = `<span style="padding: 2px 7px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: rgba(255,255,255,0.06); color: var(--text-faint); border: 1px solid var(--border-soft);">⌛ Completed</span>`;
          actionBtn = `<span style="font-size: 11px; color: var(--text-faint); padding: 4px 8px;">🔒 Past Class</span>`;
        } else if (isMarked) {
          statusBadge = `<span style="padding: 2px 7px; border-radius: 4px; font-size: 10.5px; font-weight: 700; background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger);">🗑️ Queued to Close</span>`;
          actionBtn = `<button class="btn" style="padding: 4px 10px; font-size: 11px; font-weight: 700; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px;" onclick="window.appToggleCancel('${c.key}')">↩️ Unmark</button>`;
        }

        rowsHtml += `
          <tr style="border-bottom: 1px solid var(--border-soft); ${isMarked ? 'background: var(--danger-soft);' : ''} ${c.isPast ? 'opacity: 0.6;' : ''}">
            <td style="padding: 8px 10px; font-weight: 600; color: var(--text-faint);">${idx + 1}</td>
            <td style="padding: 8px 10px;"><strong>${c.lessonTitle}</strong></td>
            <td style="padding: 8px 10px; color: var(--text-dim);">${c.date || 'N/A'} • ${c.timeStr}</td>
            <td style="padding: 8px 10px; color: var(--text-dim);">${c.teacherName}</td>
            <td style="padding: 8px 10px;">${docLink}</td>
            <td style="padding: 8px 10px;">${statusBadge}</td>
            <td style="padding: 8px 10px; text-align: right;">${actionBtn}</td>
          </tr>`;
      });

      this.openModal(
        `📌 My Enrolled Classes (${weekLabel})`,
        `
        <div style="margin-bottom: 12px; font-size: 12.5px; color: var(--text-dim); display: flex; justify-content: space-between;"><span>Target Week: <strong>${weekLabel}</strong></span><span>Total Enrolled: <strong style="color: var(--main);">${combined.length} class(es)</strong></span></div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead><tr style="background: var(--panel); border-bottom: 1px solid var(--border); text-align: left; color: var(--text-faint);"><th style="padding: 8px 10px;">#</th><th style="padding: 8px 10px;">Lesson Topic</th><th style="padding: 8px 10px;">Date & Time</th><th style="padding: 8px 10px;">Teacher</th><th style="padding: 8px 10px;">Materials</th><th style="padding: 8px 10px;">Status</th><th style="padding: 8px 10px; text-align: right;">Action</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="7" style="padding: 20px; text-align: center;">No enrolled classes found.</td></tr>'}</tbody>
        </table>`
      );

      window.appToggleCancel = (key) => {
        const found = combined.find((item) => this.getCourseKey(item) === key);
        if (found) {
          this.toggleCourseToCancel(found);
          this.showEnrolledModal();
        }
      };
    },

    // ── Popover & Modals ──────────────────────────────────────────────────────
    showPopover(e, c) {
      const isMarked = this.isMarkedCancel(c);
      let status = 'Open to Register ✅',
        statusColor = 'var(--freetalk)',
        hint = this.isSelected(c) ? 'Click to deselect' : 'Click to select';

      if (c.isPast) {
        status = c.hasEnrolled ? 'Enrolled (Past Class) 📌⌛' : 'Past Class (Ended) ⌛';
        statusColor = 'var(--text-faint)';
        hint = c.hasEnrolled ? 'Past class (cannot cancel)' : 'Past class (cannot register)';
      } else if (c.hasEnrolled) {
        status = isMarked ? 'Marked to Close 🗑️' : 'Enrolled 📌';
        statusColor = isMarked ? '#f87171' : '#60a5fa';
        hint = isMarked ? 'Click to unmark' : 'Click card to queue for close';
      } else if (c.isFull) {
        status = this.isSelected(c) ? 'Selected (Now Full ⚠️)' : 'Closed / Full 🚫';
        statusColor = 'var(--danger)';
        hint = this.isSelected(c) ? 'Click to deselect from queue' : 'Capacity reached (cannot register)';
      }

      this.popover = {
        visible: true,
        x: e.clientX + 16,
        y: e.clientY + 16,
        title: c.lessonTitle,
        category:
          c.cat === 'main'
            ? `Main · ${c.subClassType?.name || 'Grammar/Comm'}`
            : c.cat === 'freetalk'
            ? `Free Talk · ${c.subClassType?.name || 'Discussion'}`
            : `Skills · ${c.subClassType?.name || 'Development'}`,
        catBg:
          c.cat === 'main'
            ? 'rgba(251, 169, 49, 0.22)'
            : c.cat === 'freetalk'
            ? 'rgba(45, 169, 225, 0.22)'
            : 'rgba(36, 188, 168, 0.22)',
        catColor:
          c.cat === 'main'
            ? '#FBA931'
            : c.cat === 'freetalk'
            ? '#2DA9E1'
            : '#24BCA8',
        teacher: `${c.teacherName}${c.teacherNickName ? ` (${c.teacherNickName})` : ''}`,
        room: c.room || 'N/A',
        time: `${c.date} • ${(c.startTime || '').slice(0, 5)} – ${(c.endTime || '').slice(0, 5)}`,
        seats: `${c.currStudents} / ${c.maxStudents}`,
        fillPct: Math.min(100, Math.round((c.currStudents / c.maxStudents) * 100)),
        status,
        statusColor,
        hint,
      };
      this.movePopover(e);
    },

    movePopover(e) {
      let x = e.clientX + 16;
      let y = e.clientY + 16;
      if (x + 320 > window.innerWidth - 10) x = e.clientX - 336;
      if (y + 220 > window.innerHeight - 10) y = window.innerHeight - 230;
      if (y < 10) y = 10;
      this.popover.x = x;
      this.popover.y = y;
    },

    hidePopover() {
      this.popover.visible = false;
    },

    openModal(title, content) {
      this.modal = { open: true, title, content };
    },

    showToast(message, type = 'success', duration = 3500) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = message;
      toast.className = `visible ${type}`;
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => {
        toast.className = '';
      }, duration);
    },

    // ── Resizer ───────────────────────────────────────────────────────────────
    initSidebarResizer() {
      const resizer = document.getElementById('sidebarResizer');
      const sidebar = document.getElementById('sidebar');
      if (!resizer || !sidebar) return;

      const saved = localStorage.getItem('tf_sidebar_width');
      if (saved) sidebar.style.width = `${Math.max(240, Math.min(650, Number(saved)))}px`;

      let isResizing = false,
        startX = 0,
        startW = 0;
      resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startW = sidebar.getBoundingClientRect().width;
        resizer.classList.add('is-resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newW = Math.max(240, Math.min(650, startW + (startX - e.clientX)));
        sidebar.style.width = `${newW}px`;
      });

      window.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          resizer.classList.remove('is-resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          localStorage.setItem('tf_sidebar_width', sidebar.getBoundingClientRect().width);
        }
      });
    },
  };
}
