/**
 * utils.js
 *
 * Pure utility functions and helper methods for date/time formatting,
 * category mapping, teacher note matching, and criteria transformations.
 */

export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function hasTimeOverlap(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return Math.max(s1, s2) < Math.min(e1, e2);
}

export function normalize(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isClassPast(c) {
  if (!c?.date) return false;
  const timeStr = c.startTime || '00:00:00';
  const [y, m, d] = c.date.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0).getTime() < Date.now();
}

export function getCourseKey(c) {
  return c.id || `${c.date}_${(c.startTime || '').slice(0, 5)}_${c.lesson || c.lessonInfo?.lesson || ''}`;
}

export function createUtilsModule() {
  return {
    isClassPast,
    getCourseKey,

    getCategoryKey(c) {
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

    getTeacherNote(teacherCode, teacherName, teacherNickName) {
      if (!this.teacherNotes) return null;
      if (teacherCode && this.teacherNotes[teacherCode]) {
        const direct = this.teacherNotes[teacherCode];
        return typeof direct === 'object' ? direct : { note: direct, teacherCode };
      }
      const codeKey = (teacherCode || '').trim().toLowerCase();
      const nameKey = (teacherName || '').trim().toLowerCase();
      const nickKey = (teacherNickName || '').trim().toLowerCase();
      const normName = normalize(nameKey);
      const normNick = normalize(nickKey);

      for (const [k, v] of Object.entries(this.teacherNotes)) {
        if (!v) continue;
        const vObj = typeof v === 'object' ? v : { note: v, teacherCode: k };
        const kLow = k.toLowerCase();
        const vCodeLow = (vObj.teacherCode || k || '').toLowerCase();
        const vNameLow = (vObj.teacherName || '').toLowerCase();
        const normVName = normalize(vNameLow);

        if (codeKey && (kLow === codeKey || vCodeLow === codeKey)) return vObj;
        if (nameKey && (vNameLow === nameKey || normVName === normName)) return vObj;
        if (nameKey && (vNameLow.includes(nameKey) || nameKey.includes(vNameLow))) return vObj;
        if (normName && normVName && (normVName.includes(normName) || normName.includes(normVName))) return vObj;
        if (nickKey && normVName && normVName.includes(normNick)) return vObj;
      }
      return null;
    },

    toCriteria(c) {
      const criteria = {};
      if (c.id) criteria.id = c.id;
      if (c.lessonTitle || c.lesson) criteria.lesson = c.lessonTitle || c.lesson;
      if (c.date) criteria.date = c.date;
      if (c.startTime) criteria.startTime = c.startTime;
      if (c.teacherName || c.teacherNickName || c.teacherFullName) {
        criteria.teacher = c.teacherNickName || c.teacherFullName || c.teacherName;
      }
      if (c.room) criteria.room = c.room;
      return criteria;
    },
  };
}
