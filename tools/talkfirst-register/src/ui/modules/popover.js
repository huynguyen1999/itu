/**
 * popover.js
 *
 * Hover tooltip management, past enrolled class matching for teachers,
 * modal dialog triggers, toast notifications, and sidebar resizer logic.
 */

export function createPopoverModule() {
  return {
    getPastEnrolledForTeacher(c) {
      if (!c || !this.enrolledClassesHistory || this.enrolledClassesHistory.length === 0) {
        return [];
      }

      const tFull = (c.teacherFullName || '').trim().toLowerCase();
      const tName = (c.teacherName || '').trim().toLowerCase();
      const tNick = (c.teacherNickName || '').trim().toLowerCase();
      const tCode = (c.teacherCode || '').trim().toLowerCase();
      if (!tFull && !tName && !tNick && !tCode) return [];

      const nowMs = Date.now();

      return this.enrolledClassesHistory
        .filter((raw) => {
          try {
            const schedule = raw.flexibleClassSchedule;
            if (!schedule) return false;

            const teacher = schedule.teacher;
            const fullName = (teacher?.fullName || '').trim().toLowerCase();
            const nickName = (teacher?.nickName || '').trim().toLowerCase();
            const code = (teacher?.teacherCode || '').trim().toLowerCase();

            const isMatch =
              (tCode && code && tCode === code) ||
              (tFull && fullName && (fullName.includes(tFull) || tFull.includes(fullName))) ||
              (tNick && nickName && (nickName === tNick || fullName.includes(tNick))) ||
              (tName && (fullName.includes(tName) || tName.includes(fullName) || nickName.includes(tName)));

            if (!isMatch) return false;

            const dateStr = schedule.date ? schedule.date.slice(0, 10) : '';
            if (!dateStr) return false;
            const startTime = schedule.slotTime?.startTime || '00:00:00';
            const [y, m, d] = dateStr.split('-').map(Number);
            const [hh, mm, ss] = startTime.split(':').map(Number);
            const classTimeMs = new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0).getTime();

            const isPast = classTimeMs < nowMs;
            const isSameSlot = dateStr === c.date && startTime.slice(0, 5) === (c.startTime || '').slice(0, 5);

            return isPast && !isSameSlot;
          } catch {
            return false;
          }
        })
        .map((raw) => {
          const schedule = raw.flexibleClassSchedule;
          const dateStr = schedule.date ? schedule.date.slice(0, 10) : '';
          const subType = schedule.flexibleClass?.subClassType;
          return {
            key: raw.id || `${dateStr}_${schedule.slotTime?.startTime}`,
            dateStr,
            dateFormatted: window.dayjs ? window.dayjs(dateStr).format('D MMM YYYY (ddd)') : dateStr,
            dateShort: window.dayjs ? window.dayjs(dateStr).format('D MMM') : dateStr,
            timeStr: (schedule.slotTime?.startTime || '').slice(0, 5),
            lesson: schedule.lesson?.lesson || 'Untitled Lesson',
            subType: subType?.name || 'Class',
            bg: subType?.bgColor ? `${subType.bgColor}22` : 'rgba(255,255,255,0.08)',
            color: subType?.bgColor || '#ffffff',
            room: schedule.room?.name || 'Ground',
            teacherDocLink: schedule.lesson?.teacherDocLink || null,
          };
        })
        .sort((a, b) => b.dateStr.localeCompare(a.dateStr)); // Most recent first
    },

    showPopover(e, c) {
      if (!c) return;

      try {
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

        const pastEnrolled = this.getPastEnrolledForTeacher(c);
        const noteObj = this.getTeacherNote(c.teacherCode, c.teacherFullName || c.teacherName, c.teacherNickName);
        const teacherNote =
          c.teacherNote || (noteObj && typeof noteObj === 'object' ? noteObj.note : noteObj) || null;
        const teacherCode =
          c.teacherCode || (noteObj && typeof noteObj === 'object' ? noteObj.teacherCode : '') || '';

        const subTypeName =
          typeof c.subClassType === 'object'
            ? c.subClassType?.name
            : typeof c.subClassType === 'string'
              ? c.subClassType
              : '';
        const subTypeLabel =
          subTypeName ||
          (c.cat === 'main' ? 'Grammar/Comm' : c.cat === 'freetalk' ? 'Discussion' : 'Development');

        const teacherDisplay =
          c.teacherFullName && c.teacherNickName && c.teacherFullName !== c.teacherNickName
            ? `${c.teacherFullName} (${c.teacherNickName})`
            : c.teacherFullName || c.teacherNickName || c.teacherName || 'Teacher';

        this.popover.title = c.lessonTitle || 'Untitled Lesson';
        this.popover.category =
          c.cat === 'main'
            ? `Main · ${subTypeLabel}`
            : c.cat === 'freetalk'
              ? `Free Talk · ${subTypeLabel}`
              : `Skills · ${subTypeLabel}`;
        this.popover.catBg =
          c.cat === 'main'
            ? 'rgba(251, 169, 49, 0.22)'
            : c.cat === 'freetalk'
              ? 'rgba(45, 169, 225, 0.22)'
              : 'rgba(36, 188, 168, 0.22)';
        this.popover.catColor =
          c.cat === 'main' ? '#FBA931' : c.cat === 'freetalk' ? '#2DA9E1' : '#24BCA8';
        this.popover.teacher = teacherDisplay;
        this.popover.teacherName = c.teacherFullName || c.teacherName || '';
        this.popover.teacherNickName = c.teacherNickName || '';
        this.popover.teacherCode = teacherCode;
        this.popover.teacherNote = teacherNote;
        this.popover.room = c.room || 'N/A';
        this.popover.time = `${c.date} • ${(c.startTime || '').slice(0, 5)} – ${(c.endTime || '').slice(0, 5)}`;
        this.popover.seats = `${c.currStudents} / ${c.maxStudents}`;
        this.popover.fillPct = Math.min(100, Math.round((c.currStudents / c.maxStudents) * 100));
        this.popover.status = status;
        this.popover.statusColor = statusColor;
        this.popover.hint = hint;
        this.popover.pastEnrolled = pastEnrolled || [];

        if (e) {
          this.movePopover(e);
        } else {
          this.popover.x = 100;
          this.popover.y = 100;
        }

        this.popover.visible = true;
      } catch (err) {
        console.error('[Popover] Error displaying popover:', err);
      }
    },

    movePopover(e) {
      if (!e) return;
      let x = e.clientX + 16;
      let y = e.clientY + 16;
      const popoverW = 340;
      const popoverH = 380;
      if (x + popoverW > window.innerWidth - 10) x = e.clientX - (popoverW + 16);
      if (y + popoverH > window.innerHeight - 10) y = window.innerHeight - (popoverH + 10);
      if (x < 10) x = 10;
      if (y < 10) y = 10;
      this.popover.x = Math.round(x);
      this.popover.y = Math.round(y);
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
