/**
 * UI Components Module - Handles all DOM rendering
 * @module uiComponents
 */

import {
  calculateGrade,
  getGroupClass,
  getGradeClass,
  determineStatus,
  calculateStatistics,
  calculateGroupStatistics,
  getFailedStudents,
  isAbsent,
  sortStudentData,
} from './utils.js';
import { FAILING_THRESHOLD, MAX_CHART_ENTRIES, MAX_TABLE_ENTRIES } from './constants.js';

/**
 * Render statistics cards
 * @param {HTMLElement} container - Stats container element
 * @param {Array} data - Student data array
 */
export function renderStats(container, data) {
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="stat-card fade-in">
        <div class="stat-value">0</div>
        <div class="stat-label">মোট শিক্ষার্থী</div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-value">0</div>
        <div class="stat-label">অনুপস্থিত</div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-value" style="color: var(--danger)">0</div>
        <div class="stat-label">ফেল করেছে</div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-value" style="color: var(--success)">0</div>
        <div class="stat-label">পাস করেছে</div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-value" style="color: var(--info)">0</div>
        <div class="stat-label">পরীক্ষার্থী সংখ্যা</div>
      </div>
    `;
    return;
  }

  const stats = calculateStatistics(data);

  container.innerHTML = `
    <div class="stat-card fade-in">
      <div class="stat-value">${stats.totalStudents}</div>
      <div class="stat-label">মোট শিক্ষার্থী</div>
    </div>
    <div class="stat-card fade-in">
      <div class="stat-value">${stats.absentStudents}</div>
      <div class="stat-label">অনুপস্থিত</div>
    </div>
    <div class="stat-card fade-in">
      <div class="stat-value" style="color: var(--danger)">${stats.failedStudents}</div>
      <div class="stat-label">ফেল করেছে</div>
    </div>
    <div class="stat-card fade-in">
      <div class="stat-value" style="color: var(--success)">${stats.passedStudents}</div>
      <div class="stat-label">পাস করেছে</div>
    </div>
    <div class="stat-card fade-in">
      <div class="stat-value" style="color: var(--info)">${stats.participants}</div>
      <div class="stat-label">পরীক্ষার্থী সংখ্যা</div>
    </div>
  `;
}

/**
 * Render group statistics
 * @param {HTMLElement} container - Group stats container element
 * @param {Array} data - Student data array
 */
export function renderGroupStats(container, data) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="group-stat-card fade-in">কোনো ডেটা নেই</div>';
    return;
  }

  const groupStats = calculateGroupStatistics(data);

  container.innerHTML = groupStats
    .map((stat) => {
      const groupClass = getGroupClass(stat.group);

      return `
        <div class="group-stat-card fade-in ${groupClass}">
          <div class="group-stat-header">
            <span class="group-name">${stat.group}</span>
            <span>মোট: ${stat.totalStudents}</span>
          </div>
          <div>অনুপস্থিত: ${stat.absentStudents}</div>
          <div>পরীক্ষার্থী: ${stat.participants}</div>
          <div class="pass-fail-stats">
            <div class="pass-count">
              <div class="stat-value">${stat.passedStudents}</div>
              <div class="stat-label">পাস করেছে</div>
            </div>
            <div class="fail-count">
              <div class="stat-value">${stat.failedStudents}</div>
              <div class="stat-label">ফেল করেছে</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

/**
 * Render failed students list
 * @param {HTMLElement} container - Failed students container element
 * @param {Array} data - Student data array
 */
export function renderFailedStudents(container, data) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="failed-student fade-in">কোনো ডেটা নেই</div>';
    return;
  }

  const failedStudents = getFailedStudents(data);

  if (failedStudents.length === 0) {
    container.innerHTML = '<div class="failed-student fade-in">এই গ্রুপে কোনো ফেল করা শিক্ষার্থী নেই</div>';
    return;
  }

  container.innerHTML = failedStudents
    .map((student) => {
      const groupClass = getGroupClass(student.group);
      const gradeInfo = calculateGrade(student.total);
      const failReason = student.written < FAILING_THRESHOLD.written ? 'লিখিত < ১৭' : 'মোট মার্কস < ৩৩';

      return `
        <div class="failed-student fade-in ${groupClass}">
          <strong>${student.name}</strong><br>
          গ্রুপ: ${student.group}<br>
          লিখিত: ${student.written}<br>
          এমসিকিউ: ${student.mcq}<br>
          প্র্যাকটিক্যাল: ${student.practical}<br>
          মোট: ${student.total}<br>
          গ্রেড: ${gradeInfo.grade}<br>
          <strong style="color: var(--danger)">ফেল কারণ: ${failReason}</strong>
        </div>
      `;
    })
    .join('');
}

/**
 * Render data table
 * @param {HTMLElement} tbody - Table body element
 * @param {Array} data - Student data array
 * @param {Object} options - Sorting options
 */
export function renderTable(tbody, data, options = {}) {
  const { sortBy = 'total', sortOrder = 'desc', onRowClick = null } = options;

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">কোনো ডেটা নেই</td></tr>';
    return;
  }

  // Sort data
  // Sort data using shared utility (supports group priority)
  let sortedData = sortStudentData(data, sortBy, sortOrder);

  // Limit entries for table (use larger limit than chart)
  if (sortedData.length > MAX_TABLE_ENTRIES) {
    sortedData = sortedData.slice(0, MAX_TABLE_ENTRIES);
  }

  tbody.innerHTML = sortedData
    .map((student) => {
      const rowClass = getGroupClass(student.group);
      const gradeInfo = calculateGrade(student.total);
      const status = determineStatus(student);
      const statusClass = status === 'পাস' ? 'status-pass' : status === 'ফেল' ? 'status-fail' : 'status-absent';

      return `
        <tr class="${rowClass}">
          <td>${student.id}</td>
          <td>${student.name}</td>
          <td>${student.group}</td>
          <td>${student.class || '-'}</td>
          <td>${student.session || '-'}</td>
          <td class="${student.written < FAILING_THRESHOLD.written ? 'text-danger-custom' : ''}">${student.written}</td>
          <td class="${student.mcq < FAILING_THRESHOLD.mcq ? 'text-danger-custom' : ''}">${student.mcq}</td>
          <td>${student.practical}</td>
          <td><strong>${student.total}</strong></td>
          <td><span class="grade-cell ${getGradeClass(gradeInfo.grade)}">${gradeInfo.grade}</span></td>
          <td><span class="status-cell ${statusClass}">${status}</span></td>
        </tr>
      `;
    })
    .join('');

  // Attach click listeners if onRowClick is provided
  if (onRowClick) {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row, index) => {
      if (sortedData[index]) {
        row.style.cursor = 'pointer';
        row.title = 'বিস্তারিত দেখতে ক্লিক করুন';
        row.addEventListener('click', () => onRowClick(sortedData[index]));
      }
    });
  }
}

/**
 * Render JSON preview
 * @param {HTMLElement} container - Preview container element
 * @param {Array} data - Student data array
 */
export function renderJSONPreview(container, data) {
  if (!container) return; // Prevention for runtime crash

  if (!data || data.length === 0) {
    container.textContent = 'কোনো ডেটা নেই';
    return;
  }

  // Show full data for "JSON View", but limit for performance if needed
  // Since user asked for "JSON Preview", usually means they want to see the data structure
  container.textContent = JSON.stringify(data, null, 2);
}

/**
 * Toggle dark/light theme
 * @param {HTMLButtonElement} button - Theme toggle button
 * @returns {boolean} - True if dark mode is now active
 */
export function toggleTheme(button) {
  document.body.classList.toggle('dark-mode');
  const isDarkMode = document.body.classList.contains('dark-mode');
  const icon = button.querySelector('i');

  if (isDarkMode) {
    icon.className = 'fas fa-sun';
  } else {
    icon.className = 'fas fa-moon';
  }

  return isDarkMode;
}

/**
 * Apply theme
 * @param {boolean} isDark - Whether to apply dark mode
 * @param {HTMLButtonElement} button - Theme toggle button
 */
export function applyTheme(isDark, button) {
  if (isDark) {
    document.body.classList.add('dark-mode');
    button.querySelector('i').className = 'fas fa-sun';
  } else {
    document.body.classList.remove('dark-mode');
    button.querySelector('i').className = 'fas fa-moon';
  }
}
