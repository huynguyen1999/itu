/**
 * teacher-report.js
 *
 * Dedicated modal view for Teacher Reports, enrolled classes directory,
 * multi-tab grouping, teacher note CRUD operations, and live campus data sync.
 */

export function createTeacherReportModule() {
  return {
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

    async showTeacherReportModal(activeTab = 'accordion', customStartDate = null, customEndDate = null) {
      this.openModal(
        '🧑‍🏫 Teachers & Enrolled Classes Report',
        '<div style="text-align: center; padding: 40px; color: var(--text-dim);"><div class="ico spin" style="font-size: 24px; margin-bottom: 8px;">⟳</div><div>Loading teacher report & enrolled classes data...</div></div>'
      );

      try {
        const start = customStartDate !== null ? customStartDate : this.trFilter?.startDate;
        const end = customEndDate !== null ? customEndDate : this.trFilter?.endDate;
        const query = start && end ? `?startDate=${start}&endDate=${end}` : '';

        const [reportRes, enrolledRes] = await Promise.allSettled([
          fetch(`/api/teacher-report${query}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/enrolled-classes${query}`).then((r) => (r.ok ? r.json() : null)),
        ]);

        const report = reportRes.status === 'fulfilled' ? reportRes.value : null;
        let enrolledStore = enrolledRes.status === 'fulfilled' ? enrolledRes.value : null;

        if (enrolledStore && start && end) {
          const filtered = (enrolledStore.enrolledClasses || []).filter((item) => {
            const d = item.flexibleClassSchedule?.date?.slice(0, 10);
            return d && d >= start && d <= end;
          });
          enrolledStore = {
            ...enrolledStore,
            enrolledClasses: filtered,
            totalEnrolled: filtered.length,
            dateRange: { startDate: start, endDate: end },
          };
        }

        if (!this.trFilter) {
          this.trFilter = {
            startDate: report?.dateRange?.startDate || this.currentMonday,
            endDate:
              report?.dateRange?.endDate ||
              window.dayjs(this.currentMonday).add(6, 'day').format('YYYY-MM-DD'),
            selectedTeacher: '',
            searchQuery: '',
            expandedTeachers: new Set(),
            showImport: false,
          };
        } else if (customStartDate !== null && customEndDate !== null) {
          this.trFilter.startDate = customStartDate;
          this.trFilter.endDate = customEndDate;
        }

        this.renderTeacherReportModal(report, enrolledStore, activeTab);
      } catch (err) {
        this.openModal(
          '🧑‍🏫 Teacher Report',
          `<div style="padding: 24px; color: var(--danger); text-align: center;">Failed to load report: ${err.message}</div>`
        );
      }
    },

    renderTeacherReportModal(report, enrolledStore, activeTab = 'accordion') {
      const allTeachers = report?.teachers || [];
      const totalTeachers = report?.totalTeachers ?? allTeachers.length;
      const totalEnrolled = report?.totalEnrolledClasses ?? (enrolledStore?.totalEnrolled || 0);
      const currStart = this.trFilter?.startDate || report?.dateRange?.startDate || this.currentMonday;
      const currEnd =
        this.trFilter?.endDate ||
        report?.dateRange?.endDate ||
        window.dayjs(this.currentMonday).add(6, 'day').format('YYYY-MM-DD');
      const showImport = this.trFilter?.showImport || false;
      const selectedTeacher = this.trFilter?.selectedTeacher || '';
      const searchQuery = (this.trFilter?.searchQuery || '').trim().toLowerCase();

      if (activeTab === 'teachers') activeTab = 'accordion';
      if (activeTab === 'enrolled') activeTab = 'table';

      if (!this.trFilter.expandedTeachers) {
        this.trFilter.expandedTeachers = new Set();
      }

      let filteredTeachers = allTeachers;
      if (selectedTeacher) {
        filteredTeachers = filteredTeachers.filter((t) => t.teacherCode === selectedTeacher);
      }
      if (searchQuery) {
        filteredTeachers = filteredTeachers.filter((t) => {
          const noteObj = this.getTeacherNote(t.teacherCode, t.fullName, t.nickName);
          const noteText = noteObj ? (typeof noteObj === 'object' ? noteObj.note : noteObj) : '';
          const matchTeacher =
            (t.fullName && t.fullName.toLowerCase().includes(searchQuery)) ||
            (t.nickName && t.nickName.toLowerCase().includes(searchQuery)) ||
            (t.teacherCode && t.teacherCode.toLowerCase().includes(searchQuery)) ||
            (t.email && t.email.toLowerCase().includes(searchQuery)) ||
            (noteText && noteText.toLowerCase().includes(searchQuery));
          const matchClass = (t.classes || []).some(
            (c) =>
              (c.lesson && c.lesson.toLowerCase().includes(searchQuery)) ||
              (c.subClassType && c.subClassType.toLowerCase().includes(searchQuery)) ||
              (c.room && c.room.toLowerCase().includes(searchQuery))
          );
          return matchTeacher || matchClass;
        });
      }

      const allFlatClasses = [];
      allTeachers.forEach((t) => {
        (t.classes || []).forEach((c) => {
          allFlatClasses.push({ ...c, teacherObj: t });
        });
      });
      allFlatClasses.sort((a, b) => (a.date + a.timeRange).localeCompare(b.date + b.timeRange));

      let filteredClasses = allFlatClasses;
      if (selectedTeacher) {
        filteredClasses = filteredClasses.filter((c) => c.teacherObj?.teacherCode === selectedTeacher);
      }
      if (searchQuery) {
        filteredClasses = filteredClasses.filter((c) => {
          const matchTeacher =
            (c.teacherObj?.fullName && c.teacherObj.fullName.toLowerCase().includes(searchQuery)) ||
            (c.teacherObj?.nickName && c.teacherObj.nickName.toLowerCase().includes(searchQuery)) ||
            (c.teacherObj?.teacherCode && c.teacherObj.teacherCode.toLowerCase().includes(searchQuery));
          const matchClass =
            (c.lesson && c.lesson.toLowerCase().includes(searchQuery)) ||
            (c.subClassType && c.subClassType.toLowerCase().includes(searchQuery)) ||
            (c.room && c.room.toLowerCase().includes(searchQuery));
          return matchTeacher || matchClass;
        });
      }

      let teacherChipsHtml = `
        <button class="tr-chip ${!selectedTeacher ? 'active' : ''}" onclick="window.appFilterTeacher('')">
          All (${totalEnrolled})
        </button>
      `;
      allTeachers.forEach((t) => {
        const isSel = selectedTeacher === t.teacherCode;
        teacherChipsHtml += `
          <button class="tr-chip ${isSel ? 'active' : ''}" onclick="window.appFilterTeacher('${t.teacherCode}')">
            ${t.nickName || t.fullName} <span style="opacity:0.75; font-size:10px;">(${t.totalClasses})</span>
          </button>
        `;
      });

      let contentHtml = `
        <div class="tr-modal-wrap">
          <div class="tr-unified-bar">
            <div class="tr-bar-left">
              <label style="font-size: 11px; color: var(--text-faint); font-weight: 600;">📅</label>
              <input type="date" id="tr-start-date" class="tr-date-input" value="${currStart}" onchange="window.appOnDateChange()" title="Filter Start Date">
              <span style="color: var(--text-faint); font-size: 10px;">→</span>
              <input type="date" id="tr-end-date" class="tr-date-input" value="${currEnd}" onchange="window.appOnDateChange()" title="Filter End Date">

              <div class="tr-presets-group">
                <button class="tr-preset-btn" onclick="window.appSetDatePreset('prev')" title="Previous Week">Prev Wk</button>
                <button class="tr-preset-btn" onclick="window.appSetDatePreset('this')" title="Current Week">This Wk</button>
                <button class="tr-preset-btn" onclick="window.appSetDatePreset('next')" title="Next Week">Next Wk</button>
                <button class="tr-preset-btn" onclick="window.appSetDatePreset('month')" title="This Month">Month</button>
                <button class="tr-preset-btn" onclick="window.appSetDatePreset('all')" title="All Stored">All</button>
              </div>
            </div>

            <div class="tr-bar-right">
              <span class="tr-stat-tag">👥 <b>${totalTeachers}</b> Teachers</span>
              <span class="tr-stat-tag">📚 <b style="color: var(--main);">${totalEnrolled}</b> Classes</span>
              <button class="btn btn-fetch" style="padding: 4px 10px; font-size: 11px; font-weight: 700;" onclick="window.appFetchLiveEnrolled()" title="Fetch from TalkFirst Campus API">
                <span class="ico">⟳</span> Sync
              </button>
              <button class="btn" style="padding: 4px 9px; font-size: 10.5px; background: var(--surface);" onclick="window.appToggleImportBox()">
                ${showImport ? '✕ Close' : '📥 Import'}
              </button>
            </div>
          </div>

          ${
            showImport
              ? `
          <div class="tr-import-box">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="font-size: 11.5px; color: var(--text);">📥 Import TalkFirst API Response JSON</strong>
              <small style="color: var(--text-dim); font-size: 10.5px;">Paste JSON from DevTools (<code>registed-list</code>) below:</small>
            </div>
            <textarea id="tr-import-json" placeholder='Paste JSON from campus.talkfirst.vn/api/student/registed-list here...' style="width: 100%; height: 80px; font-family: var(--font-mono); font-size: 11px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 6px 8px; resize: vertical; box-sizing: border-box;"></textarea>
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn" style="padding: 3px 8px; font-size: 10.5px;" onclick="window.appToggleImportBox()">Cancel</button>
              <button class="btn btn-save" style="padding: 3px 10px; font-size: 10.5px; font-weight: 700;" onclick="window.appImportEnrolledJson()">💾 Save &amp; Generate Report</button>
            </div>
          </div>`
              : ''
          }

          <div class="tr-sub-strip">
            <input type="text" id="tr-search" class="tr-search-input" placeholder="🔍 Search teacher, topic, feedback..." value="${searchQuery}" oninput="window.appOnSearch(this.value)">

            <div class="tr-tabs" style="border-bottom: none; padding-bottom: 0;">
              <button class="tr-tab-btn ${activeTab === 'accordion' ? 'active' : ''}" onclick="window.appSwitchTeacherTab('accordion')">
                🧑‍🏫 By Teacher (${filteredTeachers.length})
              </button>
              <button class="tr-tab-btn ${activeTab === 'table' ? 'active' : ''}" onclick="window.appSwitchTeacherTab('table')">
                📅 All Classes (${filteredClasses.length})
              </button>
              <button class="tr-tab-btn ${activeTab === 'directory' ? 'active' : ''}" onclick="window.appSwitchTeacherTab('directory')">
                📊 Directory
              </button>
            </div>
          </div>

          <div class="tr-chips-strip">
            ${teacherChipsHtml}
          </div>
      `;

      if (activeTab === 'accordion') {
        let accordionCardsHtml = '';
        filteredTeachers.forEach((t) => {
          const isExpanded = this.trFilter.expandedTeachers.has(t.teacherCode);
          const noteObj = this.getTeacherNote(t.teacherCode, t.fullName, t.nickName);
          const noteText = noteObj ? (typeof noteObj === 'object' ? noteObj.note : noteObj) : '';

          let classRows = '';
          (t.classes || []).forEach((c) => {
            const typeBadgeStyle = c.subClassBgColor
              ? `background: ${c.subClassBgColor}22; color: ${c.subClassBgColor}; border: 1px solid ${c.subClassBgColor}55;`
              : 'background: var(--skills-soft); color: var(--skills); border: 1px solid var(--skills-line);';

            classRows += `
              <tr>
                <td style="color: var(--text-dim); white-space: nowrap;">${c.date} • <span style="font-weight: 600;">${c.dayOfWeek.slice(0, 3)}</span></td>
                <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); white-space: nowrap;">${c.timeRange}</td>
                <td>
                  <span class="tr-type-pill" style="${typeBadgeStyle}">
                    ${c.subClassType}
                  </span>
                </td>
                <td><strong style="color: var(--text); font-size: 12px;">${c.lesson}</strong></td>
                <td style="color: var(--text-dim); white-space: nowrap;">${c.room}</td>
              </tr>`;
          });

          const notePillHtml = noteText
            ? `<span class="tr-teacher-note-pill" onclick="event.stopPropagation(); window.appEditTeacherNote('${t.teacherCode}', '${t.fullName}')" title="Feedback: ${noteText}">
                <span>💡</span> ${noteText}
               </span>`
            : `<button class="tr-note-btn" onclick="event.stopPropagation(); window.appEditTeacherNote('${t.teacherCode}', '${t.fullName}')" title="Add feedback / note for this teacher">
                <span>✏️</span> Note
               </button>`;

          accordionCardsHtml += `
            <div class="tr-accordion-card">
              <div class="tr-accordion-head" onclick="window.appToggleAccordion('${t.teacherCode}')">
                <div class="tr-accordion-left">
                  <div class="tr-teacher-avatar-sm">🧑‍🏫</div>
                  <strong style="font-size: 12.5px; color: var(--text);">${t.fullName}</strong>
                  ${t.nickName ? `<span style="color: var(--text-dim); font-size: 11.5px;">(${t.nickName})</span>` : ''}
                  <span class="tr-badge-code">${t.teacherCode}</span>
                  ${t.email ? `<a href="mailto:${t.email}" style="color: var(--freetalk); font-size: 11px; text-decoration: none;" onclick="event.stopPropagation();">${t.email}</a>` : ''}
                  ${t.phone ? `<span style="color: var(--text-faint); font-size: 10.5px;">• ${t.phone}</span>` : ''}
                  ${notePillHtml}
                </div>
                <div class="tr-accordion-right">
                  <span class="tr-badge-count">${t.totalClasses} class${t.totalClasses !== 1 ? 'es' : ''}</span>
                  <button class="tr-view-detail-btn" onclick="event.stopPropagation(); window.appToggleAccordion('${t.teacherCode}')">
                    <span>👁️</span> ${isExpanded ? 'Hide Classes ▲' : 'View Classes ▼'}
                  </button>
                </div>
              </div>
              ${
                isExpanded
                  ? `
              <div style="overflow-x: auto; border-top: 1px solid var(--border-soft);">
                <table class="tr-dense-table">
                  <thead>
                    <tr>
                      <th>Date &amp; Day</th>
                      <th>Time</th>
                      <th>Program / Type</th>
                      <th>Lesson Topic</th>
                      <th>Room</th>
                    </tr>
                  </thead>
                  <tbody>${classRows || '<tr><td colspan="5" style="padding: 8px; text-align: center; color: var(--text-dim);">No classes for this teacher.</td></tr>'}</tbody>
                </table>
              </div>`
                  : ''
              }
            </div>`;
        });

        contentHtml += `
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding: 0 2px;">
              <span style="font-size: 11px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Teachers &amp; Classes (${filteredTeachers.length})</span>
              <div style="display: flex; gap: 4px;">
                <button class="tr-preset-btn" onclick="window.appToggleAllAccordions(true)">▼ Expand All</button>
                <button class="tr-preset-btn" onclick="window.appToggleAllAccordions(false)">▲ Collapse All</button>
              </div>
            </div>
            ${accordionCardsHtml || '<div style="padding: 24px; text-align: center; color: var(--text-dim);">No teachers or classes match your search.</div>'}
          </div>
        `;
      } else if (activeTab === 'table') {
        let flatClassRows = '';
        filteredClasses.forEach((c, idx) => {
          const t = c.teacherObj || {};
          const noteObj = this.getTeacherNote(t.teacherCode, t.fullName, t.nickName);
          const noteText = noteObj ? (typeof noteObj === 'object' ? noteObj.note : noteObj) : '';

          const typeBadgeStyle = c.subClassBgColor
            ? `background: ${c.subClassBgColor}22; color: ${c.subClassBgColor}; border: 1px solid ${c.subClassBgColor}55;`
            : 'background: var(--skills-soft); color: var(--skills); border: 1px solid var(--skills-line);';

          flatClassRows += `
            <tr>
              <td style="color: var(--text-faint); font-weight: 600; width: 24px;">${idx + 1}</td>
              <td style="color: var(--text-dim); white-space: nowrap;">${c.date} • <span style="font-weight: 600;">${c.dayOfWeek.slice(0, 3)}</span></td>
              <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); white-space: nowrap;">${c.timeRange}</td>
              <td style="white-space: nowrap;">
                <span style="font-weight: 600; color: var(--text);">${t.fullName || t.nickName || 'N/A'}</span>
                <span class="tr-badge-code" style="margin-left: 4px;">${t.teacherCode || ''}</span>
                ${noteText ? `<span style="margin-left: 4px; font-size: 11px; cursor: pointer;" title="Feedback: ${noteText}">💡</span>` : ''}
              </td>
              <td>
                <span class="tr-type-pill" style="${typeBadgeStyle}">
                  ${c.subClassType}
                </span>
              </td>
              <td><strong style="color: var(--text); font-size: 12px;">${c.lesson}</strong></td>
              <td style="color: var(--text-dim); white-space: nowrap;">${c.room}</td>
            </tr>`;
        });

        contentHtml += `
          <div style="background: var(--bg-1); border-radius: var(--radius-md); border: 1px solid var(--border-soft); overflow: hidden;">
            <div style="overflow-x: auto;">
              <table class="tr-dense-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date &amp; Day</th>
                    <th>Time</th>
                    <th>Teacher</th>
                    <th>Type</th>
                    <th>Lesson Topic</th>
                    <th>Room</th>
                  </tr>
                </thead>
                <tbody>${flatClassRows || '<tr><td colspan="7" style="padding: 20px; text-align: center; color: var(--text-dim);">No classes match your filter.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        `;
      } else {
        let directoryRows = '';
        filteredTeachers.forEach((t, idx) => {
          const noteObj = this.getTeacherNote(t.teacherCode, t.fullName, t.nickName);
          const noteText = noteObj ? (typeof noteObj === 'object' ? noteObj.note : noteObj) : '';
          const notePillHtml = noteText
            ? `<span class="tr-teacher-note-pill" onclick="window.appEditTeacherNote('${t.teacherCode}', '${t.fullName}')" title="Feedback: ${noteText}">
                <span>💡</span> ${noteText}
               </span>`
            : `<button class="tr-note-btn" onclick="window.appEditTeacherNote('${t.teacherCode}', '${t.fullName}')" title="Add feedback / note for this teacher">
                <span>✏️</span> + Note
               </button>`;

          directoryRows += `
            <tr>
              <td style="color: var(--text-faint); font-weight: 600; width: 24px;">${idx + 1}</td>
              <td><strong style="color: var(--text);">${t.fullName}</strong></td>
              <td style="color: var(--text-dim);">${t.nickName || '—'}</td>
              <td><span class="tr-badge-code">${t.teacherCode || 'N/A'}</span></td>
              <td>${t.email ? `<a href="mailto:${t.email}" style="color: var(--freetalk); text-decoration: none;">${t.email}</a>` : '—'}</td>
              <td style="color: var(--text-dim);">${t.phone || '—'}</td>
              <td style="text-align: center;"><span class="tr-badge-count">${t.totalClasses}</span></td>
              <td>${notePillHtml}</td>
              <td style="text-align: right;">
                <button class="tr-view-detail-btn" onclick="window.appViewTeacherDetail('${t.teacherCode}')">
                  <span>👁️</span> View Classes
                </button>
              </td>
            </tr>`;
        });

        contentHtml += `
          <div style="background: var(--bg-1); border-radius: var(--radius-md); border: 1px solid var(--border-soft); overflow: hidden;">
            <div style="overflow-x: auto;">
              <table class="tr-dense-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Teacher Name</th>
                    <th>Nickname</th>
                    <th>Code</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th style="text-align: center;">Classes</th>
                    <th>Feedback / Note</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody>${directoryRows || '<tr><td colspan="9" style="padding: 20px; text-align: center; color: var(--text-dim);">No teachers found.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        `;
      }

      contentHtml += `</div>`;

      this.openModal('🧑‍🏫 Teachers & Enrolled Classes Report', contentHtml);

      // Restore scroll position if previously saved
      if (typeof this._teacherReportScrollTop === 'number' && this._teacherReportScrollTop > 0) {
        const targetScroll = this._teacherReportScrollTop;
        setTimeout(() => {
          const modalContent = document.querySelector('.modal-content');
          if (modalContent) {
            modalContent.scrollTop = targetScroll;
          }
        }, 50);
      }

      // Window callbacks for dynamic modal actions
      window.appSwitchTeacherTab = (tab) => {
        this._teacherReportScrollTop = 0;
        this.renderTeacherReportModal(report, enrolledStore, tab);
      };

      window.appFilterTeacher = (code) => {
        this._teacherReportScrollTop = 0;
        this.trFilter.selectedTeacher = code;
        this.renderTeacherReportModal(report, enrolledStore, activeTab);
      };

      window.appOnSearch = (val) => {
        this.trFilter.searchQuery = val;
        this.renderTeacherReportModal(report, enrolledStore, activeTab);
      };

      window.appToggleAccordion = (code) => {
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) this._teacherReportScrollTop = modalContent.scrollTop;

        if (!this.trFilter.expandedTeachers) this.trFilter.expandedTeachers = new Set();
        if (this.trFilter.expandedTeachers.has(code)) {
          this.trFilter.expandedTeachers.delete(code);
        } else {
          this.trFilter.expandedTeachers.add(code);
        }
        this.renderTeacherReportModal(report, enrolledStore, activeTab);
      };

      window.appViewTeacherDetail = (code) => {
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) this._teacherReportScrollTop = modalContent.scrollTop;

        if (!this.trFilter.expandedTeachers) this.trFilter.expandedTeachers = new Set();
        this.trFilter.expandedTeachers.add(code);
        this.renderTeacherReportModal(report, enrolledStore, 'accordion');
      };

      window.appToggleAllAccordions = (expand) => {
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) this._teacherReportScrollTop = modalContent.scrollTop;

        if (expand) {
          this.trFilter.expandedTeachers = new Set(allTeachers.map((t) => t.teacherCode));
        } else {
          this.trFilter.expandedTeachers = new Set();
        }
        this.renderTeacherReportModal(report, enrolledStore, activeTab);
      };

      window.appOnDateChange = () => {
        this._teacherReportScrollTop = 0;
        const s = document.getElementById('tr-start-date')?.value || '';
        const e = document.getElementById('tr-end-date')?.value || '';
        if (s && e) {
          this.showTeacherReportModal(activeTab, s, e);
        }
      };

      window.appSetDatePreset = (preset) => {
        this._teacherReportScrollTop = 0;
        let s = '',
          e = '';
        if (preset === 'prev') {
          s = window.dayjs().startOf('isoWeek').subtract(7, 'day').format('YYYY-MM-DD');
          e = window.dayjs().startOf('isoWeek').subtract(1, 'day').format('YYYY-MM-DD');
        } else if (preset === 'this') {
          s = window.dayjs().startOf('isoWeek').format('YYYY-MM-DD');
          e = window.dayjs().startOf('isoWeek').add(6, 'day').format('YYYY-MM-DD');
        } else if (preset === 'next') {
          s = window.dayjs().startOf('isoWeek').add(7, 'day').format('YYYY-MM-DD');
          e = window.dayjs().startOf('isoWeek').add(13, 'day').format('YYYY-MM-DD');
        } else if (preset === 'month') {
          s = window.dayjs().startOf('month').format('YYYY-MM-DD');
          e = window.dayjs().endOf('month').format('YYYY-MM-DD');
        } else if (preset === 'all') {
          s = '';
          e = '';
        }
        if (this.trFilter) {
          this.trFilter.startDate = s;
          this.trFilter.endDate = e;
        }
        this.showTeacherReportModal(activeTab, s, e);
      };

      window.appToggleImportBox = () => {
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) this._teacherReportScrollTop = modalContent.scrollTop;

        if (!this.trFilter) this.trFilter = {};
        this.trFilter.showImport = !this.trFilter.showImport;
        this.renderTeacherReportModal(report, enrolledStore, activeTab);
      };

      window.appEditTeacherNote = (code, name) => {
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
          this._teacherReportScrollTop = modalContent.scrollTop;
        }

        const existing = this.getTeacherNote(code, name);
        const existingNote = existing ? (typeof existing === 'object' ? existing.note : existing) : '';

        const noteModalHtml = `
          <div style="display: flex; flex-direction: column; gap: 12px; padding: 4px 0;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <strong style="font-size: 14px; color: var(--text);">${name || 'Teacher'}</strong>
                <span class="tr-badge-code" style="margin-left: 6px;">${code || 'N/A'}</span>
              </div>
              <small style="color: var(--text-faint); font-size: 11px;">Saved to teacher-notes.json &amp; shown on schedule hover</small>
            </div>

            <div>
              <label style="display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 4px; font-weight: 600;">
                Personal Feedback / Notes:
              </label>
              <textarea id="tn-input-note" placeholder="E.g. Great pronunciation, gives good feedback on grammar, very friendly..." style="width: 100%; height: 100px; background: var(--bg-1); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 8px 10px; font-size: 12px; resize: vertical; box-sizing: border-box; outline: none;"></textarea>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
              <div>
                ${
                  existingNote
                    ? `<button class="btn" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); font-size: 11px; padding: 5px 10px;" onclick="window.appSubmitDeleteNote('${code}', '${name}')">🗑️ Delete Note</button>`
                    : ''
                }
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn" style="padding: 5px 12px; font-size: 11.5px;" onclick="window.appCloseNoteEditor()">Cancel</button>
                <button class="btn btn-save" style="padding: 5px 14px; font-size: 11.5px; font-weight: 700;" onclick="window.appSubmitSaveNote('${code}', '${name}')">💾 Save Feedback</button>
              </div>
            </div>
          </div>
        `;

        this.openModal(`📝 Teacher Feedback: ${name}`, noteModalHtml);

        setTimeout(() => {
          const input = document.getElementById('tn-input-note');
          if (input) {
            input.value = existingNote || '';
            input.focus();
          }
        }, 50);

        window.appCloseNoteEditor = () => {
          this.renderTeacherReportModal(report, enrolledStore, activeTab);
        };

        window.appSubmitSaveNote = async (tCode, tName) => {
          const noteText = document.getElementById('tn-input-note')?.value?.trim() || '';
          if (!noteText) {
            this.showToast('Note text is empty', 'error', 3000);
            return;
          }
          try {
            const res = await fetch('/api/teacher-notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ teacherCode: tCode, teacherName: tName, note: noteText }),
            });
            const result = await res.json();
            if (!res.ok || result.error) throw new Error(result.error || 'Failed to save note');
            if (!this.teacherNotes) this.teacherNotes = {};
            this.teacherNotes[tCode] = result.note;
            this.showToast(`Feedback saved for ${tName}!`, 'success', 3000);
            this.renderTeacherReportModal(report, enrolledStore, activeTab);
          } catch (err) {
            this.showToast(`Save error: ${err.message}`, 'error', 4000);
          }
        };

        window.appSubmitDeleteNote = async (tCode, tName) => {
          try {
            const res = await fetch(`/api/teacher-notes/${encodeURIComponent(tCode)}`, {
              method: 'DELETE',
            });
            const result = await res.json();
            if (!res.ok || result.error) throw new Error(result.error || 'Failed to delete note');
            if (this.teacherNotes && this.teacherNotes[tCode]) {
              delete this.teacherNotes[tCode];
            }
            this.showToast(`Feedback removed for ${tName}`, 'info', 3000);
            this.renderTeacherReportModal(report, enrolledStore, activeTab);
          } catch (err) {
            this.showToast(`Delete error: ${err.message}`, 'error', 4000);
          }
        };
      };

      window.appImportEnrolledJson = async () => {
        const text = document.getElementById('tr-import-json')?.value?.trim();
        if (!text) {
          this.showToast('Please paste valid JSON response', 'error', 3000);
          return;
        }
        try {
          const parsed = JSON.parse(text);
          const s = document.getElementById('tr-start-date')?.value || this.trFilter?.startDate || '2026-08-17';
          const e = document.getElementById('tr-end-date')?.value || this.trFilter?.endDate || '2026-08-23';
          const res = await fetch('/api/import-enrolled', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw: parsed, startDate: s, endDate: e }),
          });
          const result = await res.json();
          if (!res.ok || result.error) {
            throw new Error(result.error || 'Import failed');
          }
          if (this.trFilter) this.trFilter.showImport = false;
          this.showToast(`Imported ${result.totalEnrolled || 0} enrolled classes!`, 'success', 3000);
          this.showTeacherReportModal(activeTab, s, e);
        } catch (err) {
          this.showToast(`Import error: ${err.message}`, 'error', 5000);
        }
      };

      window.appFetchLiveEnrolled = async () => {
        try {
          const s =
            document.getElementById('tr-start-date')?.value ||
            this.trFilter?.startDate ||
            this.currentMonday;
          const e =
            document.getElementById('tr-end-date')?.value ||
            this.trFilter?.endDate ||
            window.dayjs(this.currentMonday).add(6, 'day').format('YYYY-MM-DD');
          this.showToast(`Fetching enrolled classes (${s} to ${e}) from TalkFirst campus...`, 'info', 3000);
          const postRes = await fetch('/api/fetch-enrolled', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: s, endDate: e }),
          });
          const result = await postRes.json();
          if (!postRes.ok || result.error) {
            throw new Error(result.error || 'Failed to fetch enrolled classes');
          }
          if (result.warning) {
            this.showToast(result.warning, 'error', 6000);
          } else {
            this.showToast(`Updated ${result.totalEnrolled || 0} enrolled classes!`, 'success', 3000);
          }
          this.showTeacherReportModal(activeTab, s, e);
        } catch (fErr) {
          this.showToast(`Fetch error: ${fErr.message}`, 'error', 6000);
        }
      };
    },
  };
}
