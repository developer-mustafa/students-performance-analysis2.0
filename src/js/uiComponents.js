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
  formatDateBengali,
} from './utils.js';
import { FAILING_THRESHOLD, MAX_CHART_ENTRIES, MAX_TABLE_ENTRIES } from './constants.js';

/**
 * Render statistics cards
 * @param {HTMLElement} container - Stats container element
 * @param {Array} data - Student data array
 */
export function renderStats(container, data, options = {}) {
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

  const stats = calculateStatistics(data, options);

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
export function renderGroupStats(container, data, options = {}) {
  const { metaElement } = options;
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="group-stat-card fade-in">কোনো ডেটা নেই</div>';
    if (metaElement) metaElement.innerHTML = '';
    return;
  }

  const groupStats = calculateGroupStatistics(data, options);

  // Update Header Meta
  if (metaElement) {
    const firstStudent = data[0];
    const groups = [...new Set(data.map(s => s.group))].join(', ');
    metaElement.innerHTML = `
      <span class="meta-item"><i class="fas fa-graduation-cap"></i> শ্রেণি: ${firstStudent.class || 'N/A'}</span>
      <span class="meta-item"><i class="fas fa-calendar-alt"></i> সেশন: ${firstStudent.session || 'N/A'}</span>
      <span class="meta-item"><i class="fas fa-users"></i> বিভাগ: ${groups}</span>
      <span class="meta-item count-badge"><i class="fas fa-check-circle"></i> মোট: ${data.length} জন</span>
    `;
  }

  container.innerHTML = groupStats
    .map((stat) => {
      const groupClass = getGroupClass(stat.group);

      return `
        <div class="group-stat-card fade-in ${groupClass}">
          <div class="group-stat-header">
            <span class="group-name"><i class="fas fa-folder"></i> ${stat.group}</span>
            <span class="group-total">মোট: ${stat.totalStudents}</span>
          </div>
          <div class="group-stat-info">
             <div class="info-item"><span>অনুপস্থিত:</span> <strong>${stat.absentStudents}</strong></div>
             <div class="info-item"><span>পরীক্ষার্থী:</span> <strong>${stat.participants}</strong></div>
          </div>
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


export function renderFailedStudents(container, data, options = {}) {
  const { metaElement } = options;

  // যদি data না থাকে
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="failed-student fade-in">কোনো ডেটা নেই</div>';
    if (metaElement) metaElement.innerHTML = '';
    return;
  }

  const { writtenPass = FAILING_THRESHOLD.written, mcqPass = FAILING_THRESHOLD.mcq, totalPass = 33 } = options;
  let failedStudents = getFailedStudents(data, options);

  // Sort by Group (Bengali) and Roll
  failedStudents.sort((a, b) => {
    const groupCompare = (a.group || '').localeCompare(b.group || '', 'bn');
    if (groupCompare !== 0) return groupCompare;
    return (parseInt(a.roll || a.id) || 0) - (parseInt(b.roll || b.id) || 0);
  });

  // Update meta if exists
  if (metaElement) {
    const firstStudent = data[0];
    const groups = [...new Set(data.map(s => s.group))].join(', ');
    metaElement.innerHTML = `
      <span class="meta-item"><i class="fas fa-graduation-cap"></i> শ্রেণি: ${firstStudent.class || 'N/A'}</span>
      <span class="meta-item"><i class="fas fa-calendar-alt"></i> সেশন: ${firstStudent.session || 'N/A'}</span>
      <span class="meta-item"><i class="fas fa-users"></i> বিভাগ: ${groups}</span>
      <span class="meta-item count-badge danger"><i class="fas fa-exclamation-triangle"></i> মোট ফেল: ${failedStudents.length} জন</span>
    `;
  }

  if (failedStudents.length === 0) {
    container.innerHTML = '<div class="failed-student fade-in">এই গ্রুপে কোনো ফেল করা শিক্ষার্থী নেই</div>';
    return;
  }

  // 🔹 Parent grid classes add (JS-only)
  container.classList.add(
    'w-full',       // পূর্ণ প্রস্থ
    'grid',         // grid layout
    'gap-6',        // gap between cards
    'grid-cols-1',  // mobile
    'sm:grid-cols-2',
    'md:grid-cols-3',
    'lg:grid-cols-4'
  );

  // Render each student card
  container.innerHTML = failedStudents
    .map(student => {
      const gradeInfo = calculateGrade(student.total);
      const failReason = Number(student.written) < writtenPass
        ? `লিখিত < ${writtenPass}`
        : Number(student.mcq) < mcqPass
        ? `MCQ < ${mcqPass}`
        : `মোট মার্কস < ${totalPass}`;

      return `
        <div class="failed-student bg-white dark:bg-gray-900 rounded-2xl 
                    border border-gray-200 dark:border-gray-700
                    shadow-sm hover:shadow-xl 
                    hover:-translate-y-1
                    transition-all duration-300
                    p-5 flex flex-col gap-4
                    border-l-4 
                    ${
                      student.group === 'বিজ্ঞান গ্রুপ'
                        ? 'border-l-blue-500'
                        : student.group === 'ব্যবসায় গ্রুপ'
                        ? 'border-l-green-500'
                        : 'border-l-purple-500'
                    }">

          <!-- Header -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-bold ${
                student.group === 'বিজ্ঞান গ্রুপ'
                  ? 'text-blue-600 dark:text-blue-400'
                  : student.group === 'ব্যবসায় গ্রুপ'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-purple-600 dark:text-purple-400'
              }">
                ${student.name ? student.name.charAt(0) : 'S'}
              </div>
              <div class="min-w-0">
                <p class="font-bold text-gray-800 dark:text-white truncate">${student.name}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">রোল ${student.roll || student.id}</p>
              </div>
            </div>
            <span class="text-xs px-3 py-1 rounded-full ${
              student.group === 'বিজ্ঞান গ্রুপ'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
                : student.group === 'ব্যবসায় গ্রুপ'
                ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
            }">${student.group}</span>
          </div>

          <!-- Stats -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center text-sm">
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg py-2">
              <p class="text-gray-500 dark:text-gray-400 text-xs">লিখিত</p>
              <p class="font-semibold text-gray-800 dark:text-white">${student.written}</p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg py-2">
              <p class="text-gray-500 dark:text-gray-400 text-xs">এমসিকিউ</p>
              <p class="font-semibold text-gray-800 dark:text-white">${student.mcq}</p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg py-2">
              <p class="text-gray-500 dark:text-gray-400 text-xs">প্র্যাকটিক্যাল</p>
              <p class="font-semibold text-gray-800 dark:text-white">${student.practical}</p>
            </div>
            <div class="bg-yellow-50 dark:bg-yellow-900/30 rounded-lg py-2">
              <p class="text-yellow-600 dark:text-yellow-400 text-xs">মোট</p>
              <p class="font-bold text-yellow-700 dark:text-yellow-300">${student.total}</p>
            </div>
            <div class="bg-red-50 dark:bg-red-900/30 rounded-lg py-2 col-span-2 sm:col-span-1">
              <p class="text-red-600 dark:text-red-400 text-xs">গ্রেড</p>
              <p class="font-bold text-red-700 dark:text-red-300">${gradeInfo.grade}</p>
            </div>
          </div>

          <!-- Fail Reason -->
          <div class="flex items-center gap-2 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-sm px-3 py-2 rounded-lg">
            <span class="w-2 h-2 bg-red-500 rounded-full"></span>
            ফেল কারণ: <span class="font-medium">${failReason}</span>
          </div>

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
      const { writtenPass = FAILING_THRESHOLD.written, mcqPass = FAILING_THRESHOLD.mcq, practicalPass = 0 } = options;

      return `
        <tr class="${rowClass}">
          <td>${student.id}</td>
          <td>${student.name}</td>
          <td>${student.group}</td>
          <td>${student.class || '-'}</td>
          <td>${student.session || '-'}</td>
          <td class="${Number(student.written) < writtenPass ? 'text-danger-custom' : ''}">${student.written}</td>
          <td class="${Number(student.mcq) < mcqPass ? 'text-danger-custom' : ''}">${student.mcq}</td>
          <td>${student.practical}</td>
          <td><strong>${student.total}</strong></td>
          <td><span class="grade-cell ${getGradeClass(gradeInfo.grade)}">${gradeInfo.grade}</span></td>
          <td><span class="status-cell ${statusClass}">${status}</span></td>
        </tr >
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
    if (button) {
      const icon = button.querySelector('i');
      if (icon) icon.className = 'fas fa-sun';
    }
  } else {
    document.body.classList.remove('dark-mode');
    if (button) {
      const icon = button.querySelector('i');
      if (icon) icon.className = 'fas fa-moon';
    }
  }
}
/**
 * Render saved exams list with pagination
 */
export function renderSavedExamsList(container, exams, options = {}) {
  if (!container) return;
  const {
    currentPage = 1,
    perPage = 6,
    currentExamId = null,
    defaultExamId = null,
    classFilter = 'all',
    onLoad = null,
    onEdit = null,
    onDelete = null,
    onSetDefault = null,
    onPageChange = null,
    onFilterChange = null,
    subjectConfigs = {}
  } = options;

  // Render count and filters
  const countBadge = document.getElementById('savedExamsCount');
  if (countBadge) {
    countBadge.innerHTML = `মোট: <strong>${exams.length}</strong>টি এক্সাম`;
  }

  const filterContainer = document.getElementById('savedExamsClassFilters');
  if (filterContainer) {
    renderSavedExamsFilters(filterContainer, exams, classFilter, onFilterChange);
  }

  // Filter exams
  let filteredExams = exams;
  if (classFilter && classFilter !== 'all') {
    filteredExams = exams.filter(e => (e.class || 'N/A') === classFilter);
  }

  if (!filteredExams || filteredExams.length === 0) {
    container.innerHTML = '<div class="no-exams">কোনো সংরক্ষিত পরীক্ষা পাওয়া যায়নি</div>';
    if (options.paginationContainer) options.paginationContainer.innerHTML = '';
    return;
  }

  // Pagination
  const totalPages = Math.ceil(filteredExams.length / perPage);
  const start = (currentPage - 1) * perPage;
  const end = start + perPage;
  const paginatedExams = filteredExams.slice(start, end);

  container.innerHTML = paginatedExams.map(exam => {
    const date = exam.date || (exam.createdAt?.toDate ? formatDateBengali(exam.createdAt.toDate()) : 'N/A');

    // Dynamically recalculate stats based on CURRENT config for better sync
    const config = (subjectConfigs && subjectConfigs[exam.subject]) || {};
    const dynamicStats = (exam.studentData && exam.studentData.length > 0)
      ? calculateStatistics(exam.studentData, {
        writtenPass: Number(config.writtenPass) || undefined,
        mcqPass: Number(config.mcqPass) || undefined
      })
      : (exam.stats || {});

    const stats = dynamicStats;
    const isCurrent = exam.docId === currentExamId;

    // Calculate pass percentage
    const participants = stats.participants || 0;
    const passed = stats.passedStudents || 0;
    const passRate = participants > 0 ? Math.round((passed / participants) * 100) : 0;

    // Get color based on pass rate
    const barColor = passRate >= 80 ? '#27ae60' : passRate >= 50 ? '#f39c12' : '#e74c3c';

    // Session Color Logic
    const getSessionStyle = (session) => {
      if (!session) return '';
      const colors = [
        { bg: 'rgba(67, 97, 238, 0.1)', text: '#4361ee' },
        { bg: 'rgba(114, 9, 183, 0.1)', text: '#7209b7' },
        { bg: 'rgba(76, 175, 80, 0.1)', text: '#4caf50' },
        { bg: 'rgba(255, 152, 0, 0.1)', text: '#ff9800' },
        { bg: 'rgba(0, 188, 212, 0.1)', text: '#00bcd4' },
        { bg: 'rgba(233, 30, 99, 0.1)', text: '#e91e63' }
      ];
      const hash = session.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const color = colors[Math.abs(hash) % colors.length];
      return `style="background: ${color.bg}; color: ${color.text}; border: 1px solid ${color.text.replace(')', ', 0.3)')}"`;
    };

    const sessionStyle = getSessionStyle(exam.session);

    return `
            <div class="exam-card ${isCurrent ? 'active' : ''}" data-id="${exam.docId}">
                <div class="exam-card-header-compact">
                    <div class="card-meta">
                        <div class="meta-badges">
                          <span class="class-tag">${exam.class || 'N/A'}</span>
                          <span class="session-tag" ${sessionStyle}>${exam.session || 'N/A'}</span>
                          ${exam.docId === defaultExamId ? '<div class="default-pin" title="ডিফল্ট এক্সাম"><i class="fas fa-thumbtack"></i></div>' : ''}
                        </div>
                        <span class="card-date-minimal"><i class="far fa-calendar-alt"></i> ${date}</span>
                    </div>
                    <div class="exam-card-title-minimal">
                        <strong>${exam.name}</strong>
                    </div>
                    <div class="subject-row-minimal">
                        <span class="subject-text-minimal"><i class="fas fa-book-open"></i> ${exam.subject}</span>
                    </div>
                </div>
                
                <div class="exam-card-body-compact">
                    <div class="stats-row-minimal">
                        <div class="stat-group">
                          <span class="stat-label-tiny">মোট</span>
                          <div class="stat-bubble" title="শিক্ষার্থী"><i class="fas fa-users"></i> ${exam.studentCount || 0}</div>
                        </div>
                        <div class="stat-group">
                          <span class="stat-label-tiny">পরীক্ষার্থী</span>
                          <div class="stat-bubble" title="পরীক্ষার্থী"><i class="fas fa-user-edit"></i> ${participants}</div>
                        </div>
                        <div class="stat-group">
                          <span class="stat-label-tiny">পাশ</span>
                          <div class="stat-bubble pass" title="পাস"><i class="fas fa-check-circle"></i> ${passed}</div>
                        </div>
                        <div class="stat-group">
                          <span class="stat-label-tiny">ফেল</span>
                          <div class="stat-bubble fail" title="ফেল"><i class="fas fa-times-circle"></i> ${stats.failedStudents || 0}</div>
                        </div>
                    </div>

                    <div class="progress-section-minimal">
                        <div class="progress-container-minimal">
                          <div class="progress-fill-minimal" style="width: ${passRate}%; background: ${barColor}"></div>
                        </div>
                        <span class="pass-rate-minimal">${passRate}%</span>
                    </div>
                </div>

                <div class="exam-card-actions-compact">
                    <button class="card-btn-min load-btn" title="লোড করুন"><i class="fas fa-eye"></i> ভিউ</button>
                    <label class="pin-toggle admin-only" title="ডিফল্ট হিসেবে সেট করুন">
                        <input type="checkbox" class="pin-checkbox" ${exam.docId === defaultExamId ? 'checked' : ''}>
                        <span class="pin-slider"></span>
                    </label>
                    <button class="card-btn-min edit-btn admin-only" title="এডিট"><i class="fas fa-edit"></i></button>
                    <button class="card-btn-min delete-btn admin-only" title="মুছুন"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
  }).join('');

  // Attach Listeners
  container.querySelectorAll('.exam-card').forEach((card, index) => {
    const exam = paginatedExams[index];
    card.querySelector('.load-btn').addEventListener('click', () => onLoad && onLoad(exam));
    card.querySelector('.pin-checkbox')?.addEventListener('change', (e) => {
      e.stopPropagation();
      // Only trigger if checked (we don't "un-set" via toggle in this global logic)
      if (e.target.checked) {
        onSetDefault && onSetDefault(exam);
      } else {
        // If they try to toggle off, we force it back to checked because one MUST be default 
        // (or we can allow unsetting, but the logic currently assumes one is default)
        // For now, let's allow unsetting if the user wants no default
        onSetDefault && onSetDefault(e.target.checked ? exam : { docId: null, name: 'None' });
      }
    });
    card.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      onEdit && onEdit(exam);
    });
    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete && onDelete(exam);
    });
  });

  // Render Pagination
  if (options.paginationContainer) {
    renderPagination(options.paginationContainer, currentPage, totalPages, onPageChange);
  }
}

function renderPagination(container, current, total, onChange) {
  if (total <= 1) {
    container.innerHTML = '';
    return;
  }

  let buttonsHtml = `
        <button class="page-btn" ${current === 1 ? 'disabled' : ''} data-page="${current - 1}"><i class="fas fa-chevron-left"></i></button>
    `;

  for (let i = 1; i <= total; i++) {
    buttonsHtml += `<button class="page-btn ${i === current ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  buttonsHtml += `
        <button class="page-btn" ${current === total ? 'disabled' : ''} data-page="${current + 1}"><i class="fas fa-chevron-right"></i></button>
    `;

  container.innerHTML = `
    <div class="pagination-wrapper">
      <div class="pagination-controls">
        ${buttonsHtml}
      </div>
    </div>
  `;

  container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => onChange && onChange(parseInt(btn.dataset.page)));
  });
}

/**
 * Render class filters for saved exams
 */
export function renderSavedExamsFilters(container, exams, currentFilter, onFilterChange) {
  if (!container) return;

  // Extract unique classes
  const classes = [...new Set(exams.map(e => e.class || 'N/A'))].filter(Boolean).sort();

  let html = `
    <button class="class-filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-class="all">সব ক্লাস</button>
  `;

  html += classes.map(cls => `
    <button class="class-filter-btn ${currentFilter === cls ? 'active' : ''}" data-class="${cls}">${cls}</button>
  `).join('');

  container.innerHTML = html;

  container.querySelectorAll('.class-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (onFilterChange) onFilterChange(btn.dataset.class);
    });
  });
}

/**
 * Render student history for analysis view
 */
export function renderStudentHistory(container, history, studentInfo) {
  if (!container) return;
  if (!studentInfo) {
    container.innerHTML = '<div class="no-history">কোনো শিক্ষার্থীর তথ্য পাওয়া যায়নি</div>';
    return;
  }

  const groupClass = getGroupClass(studentInfo.group);
  const sessionColor = getSessionColor(studentInfo.session);

  container.innerHTML = `
        <div class="student-info-main">
            <h3>${studentInfo.name} <span class="roll-number-label">(রোল: ${studentInfo.id})</span></h3>
            <div class="student-meta-badges">
                <span class="badge badge-session" style="--session-color: ${sessionColor}">
                    <i class="fas fa-calendar-alt"></i> সেশন: ${studentInfo.session || 'N/A'}
                </span>
                <span class="badge badge-group ${groupClass}">
                    ${getIconForGroup(studentInfo.group)} ${studentInfo.group}
                </span>
                <span class="badge badge-class">
                    <i class="fas fa-graduation-cap"></i> শ্রেণি: ${studentInfo.class || 'HSC'}
                </span>
                <span class="badge badge-exam-count">
                    <i class="fas fa-chart-line"></i> মোট পরীক্ষা: ${history.length}
                </span>
            </div>
        </div>
    `;
}

/**
 * Generate a consistent color for a session string
 */
function getSessionColor(session) {
  if (!session) return '#727cf5';
  let hash = 0;
  for (let i = 0; i < session.length; i++) {
    hash = session.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Use HSL for vibrant, safe colors
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 45%)`;
}

function getIconForGroup(group) {
  if (!group) return '<i class="fas fa-users"></i>';
  if (group.includes('বিজ্ঞান') || group.toLowerCase().includes('science')) return '<i class="fas fa-microscope"></i>';
  if (group.includes('ব্যবসায়') || group.toLowerCase().includes('business')) return '<i class="fas fa-chart-line"></i>';
  if (group.includes('মানবিক') || group.toLowerCase().includes('humanities') || group.toLowerCase().includes('arts')) return '<i class="fas fa-palette"></i>';
  return '<i class="fas fa-users"></i>';
}

/**
 * Render search results for candidate selection
 */
export function renderCandidateResults(container, candidates, onSelect) {
  if (!container) return;
  if (!candidates || candidates.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'grid';
  container.className = 'search-results-grid'; // Ensure class is correct

  container.innerHTML = candidates.map(c => {
    const groupClass = getGroupClass(c.group);
    return `
        <div class="candidate-card ${groupClass}" data-id="${c.id}" data-group="${c.group}">
            <div class="candidate-card-body">
                <h4 class="candidate-name">${c.name}</h4>
                <div class="candidate-details">
                    <span><strong>রোল:</strong> ${c.id}</span> | 
                    <span><strong>গ্রুপ:</strong> ${c.group}</span>
                </div>
                <div class="candidate-meta">
                    <span>শ্রেণি: ${c.class || 'HSC'}</span> |
                    <span>সেশন: ${c.session || 'N/A'}</span>
                </div>
            </div>
        </div>
    `;
  }).join('');

  container.querySelectorAll('.candidate-card').forEach(item => {
    item.addEventListener('click', () => {
      const candidate = candidates.find(c => String(c.id) === item.dataset.id && c.group === item.dataset.group);
      if (onSelect) onSelect(candidate);
      container.style.display = 'none';
    });
  });
}
