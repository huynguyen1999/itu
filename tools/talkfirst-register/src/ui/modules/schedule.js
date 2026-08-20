/**
 * schedule.js
 *
 * Timetable grid computations, period slicing, quota metrics,
 * card decorations, selection/cancel queue management, and week navigation.
 */

export function createScheduleModule() {
  return {
    // ── Computed Properties ──────────────────────────────────────────────────
    get weekDateRangeLabel() {
      const mon = window.dayjs(this.currentMonday);
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
      return this.cacheStatus?.updatedAt
        ? `synced ${window.dayjs(this.cacheStatus.updatedAt).format('hh:mm A')}`
        : 'recent';
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
      if (this.lastSyncedAt) {
        return `Synced ${window.dayjs(this.lastSyncedAt).format('HH:mm:ss')} (${this.autoSyncIntervalLabel})`;
      }
      return `Auto-sync: ${this.autoSyncIntervalLabel}`;
    },

    get weekDays() {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const mon = window.dayjs(this.currentMonday);
      const todayStr = window.dayjs().format('YYYY-MM-DD');

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
      const sel = Array.from(this.selectedCoursesMap.values()).filter(
        (c) => this.getCategoryKey(c) === 'skills'
      ).length;
      const enr = (this.scheduleData?.flexibleClasses || []).filter(
        (c) => c.hasEnrolled && this.getCategoryKey(c) === 'skills'
      ).length;
      return `${sel}/∞ · ${enr} enr`;
    },

    // ── Grid & Card Logic ────────────────────────────────────────────────────
    decorateCourse(c) {
      const isPast = this.isClassPast(c);
      const curr = c.currentStudents || 0;
      const max = c.maxStudents || 1;
      const isFull = curr >= max;
      const isEnrolled = Boolean(c.hasEnrolled);
      const isSelected = this.isSelected(c);
      const isMarkedCancel = this.isMarkedCancel(c);

      const canRegister = !isPast && !isEnrolled && (!isFull || isSelected);
      const canClose = !isPast && isEnrolled;
      const isActionable = canRegister || canClose || isSelected || isMarkedCancel;

      const rawFullName = c.teacherFullName || c.teacherName || '';
      const rawNickName = c.teacherNickName || '';
      const rawCode = c.teacherCode || '';
      const noteObj = this.getTeacherNote(rawCode, rawFullName, rawNickName);
      const teacherNote =
        noteObj && typeof noteObj === 'object' ? noteObj.note : noteObj ? String(noteObj) : null;

      return {
        ...c,
        key: this.getCourseKey(c),
        cat: this.getCategoryKey(c),
        lessonTitle: c.lesson || c.lessonInfo?.lesson || 'Untitled Lesson',
        teacherName: rawNickName || rawFullName || 'Teacher',
        teacherFullName: rawFullName,
        teacherNickName: rawNickName,
        teacherCode: rawCode || (noteObj?.teacherCode || ''),
        hasTeacherNote: Boolean(teacherNote),
        teacherNote,
        currStudents: curr,
        maxStudents: max,
        isFull,
        isAlmostFull: !isFull && curr >= max - 1 && max > 1,
        isPast,
        canRegister,
        canClose,
        isActionable,
        dateShort: window.dayjs ? window.dayjs(c.date).format('D MMM') : c.date,
        timeStr: (c.startTime || '').slice(0, 5),
      };
    },

    getClassesForCell(dateStr, slotStart) {
      const slotPrefix = slotStart.slice(0, 5);
      const allFlex = this.scheduleData?.flexibleClasses || [];
      const allFixed = this.scheduleData?.fixedClasses || [];
      const all = [...allFlex, ...allFixed];
      const q = this.searchQuery.trim().toLowerCase();

      return all
        .filter((c) => c.date === dateStr && (c.startTime || '').slice(0, 5) === slotPrefix)
        .map((c) => this.decorateCourse(c))
        .filter((c) => {
          if (this.showOnlyEnrolled && !c.hasEnrolled) return false;
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
      if (c.isPast) {
        this.showToast(`"${c.lessonTitle}" is in the past and cannot be modified.`, 'info');
        return;
      }

      if (this.isSelected(c)) {
        this.toggleCourseSelection(c);
        return;
      }

      if (this.isMarkedCancel(c)) {
        this.toggleCourseToCancel(c);
        return;
      }

      if (c.hasEnrolled) {
        this.toggleCourseToCancel(c);
        return;
      }

      if (c.isFull) {
        this.showToast(`"${c.lessonTitle}" is full (${c.currStudents}/${c.maxStudents} seats).`, 'error');
        return;
      }

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

    selectWeekMode(mode) {
      this.weekMode = mode;
      let target;
      if (mode === 'prev') {
        target = window.dayjs().startOf('isoWeek').subtract(7, 'day');
      } else if (mode === 'next') {
        target = window.dayjs().startOf('isoWeek').add(7, 'day');
      } else {
        target = window.dayjs().startOf('isoWeek');
      }
      this.currentMonday = target.format('YYYY-MM-DD');
      this.fetchSchedule(this.currentMonday);
    },

    changeWeek(deltaDays) {
      const nextDate = window.dayjs(this.currentMonday).add(deltaDays, 'day');
      this.currentMonday = nextDate.format('YYYY-MM-DD');

      const thisMonday = window.dayjs().startOf('isoWeek').format('YYYY-MM-DD');
      const prevMonday = window.dayjs().startOf('isoWeek').subtract(7, 'day').format('YYYY-MM-DD');
      const nextMonday = window.dayjs().startOf('isoWeek').add(7, 'day').format('YYYY-MM-DD');

      if (this.currentMonday === thisMonday) this.weekMode = 'this';
      else if (this.currentMonday === prevMonday) this.weekMode = 'prev';
      else if (this.currentMonday === nextMonday) this.weekMode = 'next';
      else this.weekMode = '';

      this.fetchSchedule(this.currentMonday);
    },

    toggleShowOnlyEnrolled() {
      this.showOnlyEnrolled = !this.showOnlyEnrolled;
      localStorage.setItem('talkfirst_show_only_enrolled', String(this.showOnlyEnrolled));
      if (this.showOnlyEnrolled) {
        this.showToast('📌 Showing enrolled courses only', 'info', 2000);
      } else {
        this.showToast('Showing all scheduled courses', 'info', 2000);
      }
    },
  };
}
