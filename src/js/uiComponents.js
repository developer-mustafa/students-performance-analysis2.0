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

  // Calculate Global Grade Distribution
  const globalStats = calculateStatistics(data, options);
  const globalGrades = globalStats.gradeDistribution || {};
  const { examName = 'N/A', subjectName = 'N/A' } = options;
  const firstStudent = data[0] || {};
  const className = firstStudent.class || 'N/A';
  const sessionName = firstStudent.session || 'N/A';

  // Calculate Pass Rate Percentage
  const overallPassRate = globalStats.participants > 0
    ? Math.round((globalStats.passedStudents / globalStats.participants) * 100)
    : 0;

  // Simple Circular Progress SVG logic
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (overallPassRate / 100) * circumference;

  let html = `
    <!-- Global Grade Summary Section - Premium Vibrant Design -->
    <div class="vibrant-performance-card fade-in">
      <div class="vibrant-header-row">
        <div class="vibrant-title-group">
          <div class="vibrant-icon-wrapper">
             <i class="fas fa-chart-pie"></i>
          </div>
          <div class="vibrant-text-info">
            <h3 class="vibrant-main-title">সার্বিক গ্রেড পরিসংখ্যান</h3>
            <p class="vibrant-subtitle">সকল গ্রুপ ও শিক্ষার্থীর সম্মিলিত ফলাফল</p>
          </div>
        </div>
        
        <!-- NEW: Exam & Subject Info + Circular Pass Rate -->
        <div class="vibrant-center-details">
           <div class="vcd-labels">
              <div class="vcd-top-badges">
                <span class="vcd-badge cls">শ্রেণি: ${className}</span>
                <span class="vcd-badge ses">সেশন: ${sessionName}</span>
              </div>
              <span class="vcd-exam">${examName}</span>
              <span class="vcd-subject">${subjectName}</span>
           </div>
           <div class="vcd-progress-container">
              <svg class="vcd-svg" width="70" height="70">
                <circle class="vcd-circle-bg" cx="35" cy="35" r="${radius}" />
                <circle class="vcd-circle-fill" cx="35" cy="35" r="${radius}" 
                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset};" />
              </svg>
              <div class="vcd-progress-text">
                 <span class="vcd-p-val">${overallPassRate}%</span>
                 <span class="vcd-p-label">পাস</span>
              </div>
           </div>
        </div>

        <div class="vibrant-meta-pills">
           <div class="vibrant-meta-pill">
              <span class="v-label">মোট শিক্ষার্থী</span>
              <span class="v-value">${globalStats.totalStudents}</span>
           </div>
           <div class="vibrant-meta-pill highlight">
              <span class="v-label">পরীক্ষার্থী</span>
              <span class="v-value">${globalStats.participants}</span>
           </div>
        </div>
      </div>

      <div class="vibrant-grade-grid">
        ${['A+', 'A', 'A-', 'B', 'C', 'D', 'F'].map(grade => {
    const count = globalGrades[grade] || 0;
    const gradeClass = grade === 'A+' ? 'a-plus' : grade === 'A-' ? 'a-minus' : grade.toLowerCase();
    return `
            <div class="vibrant-grade-item g-${gradeClass}">
              <div class="g-circle">
                <span class="g-letter">${grade}</span>
              </div>
              <div class="g-info">
                <span class="g-count">${count}</span>
                <span class="g-label">জন</span>
              </div>
            </div>
          `;
  }).join('')}
      </div>
    </div>

    <!-- Group Statistics Grid - Professional Compact -->
    <div class="professional-group-grid">
  `;

  html += groupStats
    .map((stat) => {
      const groupClass = getGroupClass(stat.group);

      // Calculate Pass Rate
      const passRate = stat.participants > 0 ? Math.round((stat.passedStudents / stat.participants) * 100) : 0;
      // Fixed Business Contrast: Using a darker Orange/Gold instead of pale yellow
      const passColor = passRate >= 80 ? '#00b894' : passRate >= 50 ? '#f39c12' : '#ff7675';

      return `
        <div class="professional-group-card ${groupClass} fade-in">
          <div class="pg-header">
            <div class="pg-title">
              <i class="fas fa-users-rectangle"></i>
              <span>${stat.group}</span>
            </div>
            <div class="pg-rate-badge" style="background: ${passColor}15; color: ${passColor}">
               পাস হার: ${passRate}%
            </div>
          </div>
          
          <div class="pg-stats-row">
            <div class="pg-stat-item">
              <span class="psi-label">মোট</span>
              <span class="psi-value">${stat.totalStudents}</span>
            </div>
            <div class="pg-stat-item participants">
              <span class="psi-label">পরীক্ষার্থী</span>
              <span class="psi-value">${stat.participants}</span>
            </div>
            <div class="pg-stat-item passed">
              <span class="psi-label">পাস</span>
              <span class="psi-value">${stat.passedStudents}</span>
            </div>
            <div class="pg-stat-item failed">
              <span class="psi-label">ফেল</span>
              <span class="psi-value">${stat.failedStudents}</span>
            </div>
          </div>
          
          <div class="pg-progress-bar">
            <div class="pg-progress-fill" style="width: ${passRate}%; background: ${passColor}"></div>
          </div>
        </div>
      `;
    })
    .join('');

  html += '</div>';
  container.innerHTML = html;
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

  // Dynamic Title Update
  const cardTitle = container.closest('.failed-students')?.querySelector('.card-title');
  if (cardTitle && data.length > 0) {
    cardTitle.innerHTML = `<i class="fas fa-user-slash"></i> ফেল করা শিক্ষার্থী (${data[0].class || 'HSC'})`;
  }

  // Update meta if exists
  if (metaElement) {
    const firstStudent = data[0];
    const groups = [...new Set(data.map(s => s.group))].join(', ');
    metaElement.innerHTML = `
      <span class="meta-item"><i class="fas fa-graduation-cap"></i> শ্রেণি: ${firstStudent.class || 'N/A'}</span>
      <span class="meta-item"><i class="fas fa-calendar-alt"></i> সেশন: ${firstStudent.session || 'N/A'}</span>
      <span class="meta-item"><i class="fas fa-layer-group"></i> বিভাগ: ${groups}</span>
      <span class="meta-item count-badge danger"><i class="fas fa-user-times"></i> ফেল: ${failedStudents.length} জন</span>
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
        ? `লিখিত: ${student.written} < ${writtenPass}`
        : Number(student.mcq) < mcqPass
          ? `MCQ: ${student.mcq} < ${mcqPass}`
          : `মোট মার্কস < ${totalPass}`;

      const groupColorClass = student.group === 'বিজ্ঞান গ্রুপ' ? 'grp-science' :
        student.group === 'ব্যবসায় গ্রুপ' ? 'grp-business' : 'grp-arts';
      const groupShort = student.group === 'বিজ্ঞান গ্রুপ' ? 'বিজ্ঞান' :
        student.group === 'ব্যবসায় গ্রুপ' ? 'ব্যবসায়' : 'মানবিক';

      return `
        <div class="refined-readable-card ${groupColorClass}" data-group="${student.group}">
          <div class="card-left-content">
            <div class="student-header-mini">
              <div class="avatar-box ${student.group === 'বিজ্ঞান গ্রুপ' ? 'bg-blue-soft text-blue-main' :
          student.group === 'ব্যবসায় গ্রুপ' ? 'bg-green-soft text-green-main' : 'bg-purple-soft text-purple-main'
        }">
                <i class="fas fa-user-graduate"></i>
              </div>
              <div class="identity-info">
                <div class="name-row">
                  <div class="name-main">${student.name}</div>
                </div>
                <div class="roll-sub-text">রোল: ${student.roll || student.id} | <span class="group-color-badge ${groupColorClass}">${groupShort} গ্রুপ</span></div>
              </div>
            </div>
            
            <div class="marks-row-under">
              <div class="mark-item"><span>লিখিত:</span> <strong>${student.written}</strong></div>
              <div class="mark-item"><span>MCQ:</span> <strong>${student.mcq}</strong></div>
              <div class="mark-item"><span>ব্যবহারিক:</span> <strong>${student.practical}</strong></div>
            </div>

            <div class="fail-pill-ribbon">
              ${Number(student.written) < writtenPass ? '<i class="fas fa-pen-nib"></i>' :
          Number(student.mcq) < mcqPass ? '<i class="fas fa-check-double"></i>' :
            '<i class="fas fa-calculator"></i>'} ${failReason}
            </div>
          </div>

          <div class="card-right-stats ${student.group === 'বিজ্ঞান গ্রুপ' ? 'border-blue' :
          student.group === 'ব্যবসায় গ্রুপ' ? 'border-green' : 'border-purple'
        }">
            <div class="total-big">
              <span class="label">মোট</span>
              <span class="value">${student.total}</span>
            </div>
            <div class="grade-big">
              <span class="label">গ্রেড</span>
              <span class="value">${gradeInfo.grade}</span>
            </div>
            <span class="badg-fail">ফেল</span>
          </div>
        </div>
      `;
    })
    .join('');

  // Update group toggle chip counts
  const groupCounts = {};
  failedStudents.forEach(s => {
    groupCounts[s.group] = (groupCounts[s.group] || 0) + 1;
  });
  document.querySelectorAll('.chip-count[data-count-group]').forEach(el => {
    el.textContent = groupCounts[el.dataset.countGroup] || 0;
  });
}


/**
 * Print failed students as A4 document with header info and table
 */
export function printFailedStudents(data, options = {}) {
  if (!data || data.length === 0) return;

  const { writtenPass = FAILING_THRESHOLD.written, mcqPass = FAILING_THRESHOLD.mcq, totalPass = 33 } = options;
  const failedStudents = getFailedStudents(data, options);

  failedStudents.sort((a, b) => {
    const groupCompare = (a.group || '').localeCompare(b.group || '', 'bn');
    if (groupCompare !== 0) return groupCompare;
    return (parseInt(a.roll || a.id) || 0) - (parseInt(b.roll || b.id) || 0);
  });

  const first = data[0] || {};
  const examName = options.examName || 'N/A';
  const subjectName = options.subjectName || 'N/A';
  const className = first.class || 'N/A';
  const session = first.session || 'N/A';
  const totalStudents = data.length;
  const participants = data.filter(s => Number(s.written) > 0 || Number(s.mcq) > 0).length;
  const passedCount = participants - failedStudents.length;

  const groupCounts = {};
  failedStudents.forEach(s => { groupCounts[s.group] = (groupCounts[s.group] || 0) + 1; });
  const groupSummary = Object.entries(groupCounts).map(([g, c]) => `${g}: ${c} জন`).join(' | ');

  const tableRows = failedStudents.map((s, i) => {
    const failReason = Number(s.written) < writtenPass ? 'CQ ফেল'
      : Number(s.mcq) < mcqPass ? 'MCQ ফেল' : 'মোট ফেল';
    return `<tr>
      <td>${i + 1}</td>
      <td>${s.roll || s.id}</td>
      <td class="name-cell">${s.name}</td>
      <td>${s.group || '-'}</td>
      <td>${s.written}</td>
      <td>${s.mcq}</td>
      <td>${s.practical}</td>
      <td><strong>${s.total}</strong></td>
      <td class="status-fail">${failReason}</td>
    </tr>`;
  }).join('');

  const printHTML = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <title>ফেল করা শিক্ষার্থী - ${examName}</title>
  <style>
    @page { size: A4; margin: 15mm 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a2e; font-size: 11px; line-height: 1.4; }
    .print-header { text-align: center; border-bottom: 3px double #1a1a2e; padding-bottom: 10px; margin-bottom: 12px; }
    .print-header h1 { font-size: 18px; font-weight: 900; margin-bottom: 4px; }
    .print-header .sub { font-size: 12px; color: #555; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 16px; margin-bottom: 12px; padding: 8px 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6; }
    .info-item { font-size: 11px; }
    .info-item .label { font-weight: 700; color: #555; }
    .info-item .val { font-weight: 800; color: #1a1a2e; }
    .stats-row { display: flex; gap: 12px; margin-bottom: 12px; justify-content: center; }
    .stat-box { padding: 6px 16px; border-radius: 6px; text-align: center; font-size: 11px; font-weight: 700; border: 1px solid #dee2e6; }
    .stat-box.total-box { background: #e8f4fd; color: #0c5460; }
    .stat-box.pass-box { background: #d4edda; color: #155724; }
    .stat-box.fail-box { background: #f8d7da; color: #721c24; }
    .group-summary { text-align: center; font-size: 10px; color: #666; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { background: #1a1a2e; color: white; padding: 6px 4px; text-align: center; font-weight: 700; font-size: 10px; }
    td { padding: 5px 4px; text-align: center; border-bottom: 1px solid #dee2e6; }
    tr:nth-child(even) { background: #f8f9fa; }
    .name-cell { text-align: left; font-weight: 600; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status-fail { color: #dc3545; font-weight: 800; font-size: 9.5px; }
    .print-footer { margin-top: 15px; text-align: center; font-size: 9px; color: #999; border-top: 1px solid #dee2e6; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>ফেল করা শিক্ষার্থীদের তালিকা</h1>
    <div class="sub">${examName} — ${subjectName}</div>
  </div>

  <div class="info-grid">
    <div class="info-item"><span class="label">শ্রেণি:</span> <span class="val">${className}</span></div>
    <div class="info-item"><span class="label">সেশন:</span> <span class="val">${session}</span></div>
    <div class="info-item"><span class="label">মোট শিক্ষার্থী:</span> <span class="val">${totalStudents} জন</span></div>
    <div class="info-item"><span class="label">পরীক্ষার্থী:</span> <span class="val">${participants} জন</span></div>
    <div class="info-item"><span class="label">পাস মার্ক (CQ):</span> <span class="val">${writtenPass}</span></div>
    <div class="info-item"><span class="label">পাস মার্ক (MCQ):</span> <span class="val">${mcqPass}</span></div>
  </div>

  <div class="stats-row">
    <div class="stat-box total-box">পরীক্ষার্থী: <strong>${participants}</strong> জন</div>
    <div class="stat-box pass-box">পাস: <strong>${passedCount}</strong> জন</div>
    <div class="stat-box fail-box">ফেল: <strong>${failedStudents.length}</strong> জন</div>
  </div>

  <div class="group-summary">বিভাগভিত্তিক ফেল: ${groupSummary}</div>

  <table>
    <thead>
      <tr>
        <th>ক্র.নং</th>
        <th>রোল</th>
        <th style="text-align:left">নাম</th>
        <th>বিভাগ</th>
        <th>CQ</th>
        <th>MCQ</th>
        <th>Practical</th>
        <th>Total</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="print-footer">
    Generated from Students Performance Analysis — ${new Date().toLocaleDateString('bn-BD')}
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(printHTML);
  printWindow.document.close();
}


/**
 * Print ALL students as A4 document with dynamic header, summary, and full table
 */
export function printAllStudents(data, options = {}) {
  if (!data || data.length === 0) return;

  const { writtenPass = FAILING_THRESHOLD.written, mcqPass = FAILING_THRESHOLD.mcq, totalPass = 33 } = options;
  const examName = options.examName || 'N/A';
  const subjectName = options.subjectName || 'N/A';
  const groupFilter = options.groupFilter || 'সব গ্রুপ';
  const gradeFilter = options.gradeFilter || 'সব গ্রেড';
  const first = data[0] || {};
  const className = first.class || 'N/A';
  const session = first.session || 'N/A';

  // Build filter info for header
  const filterParts = [];
  if (groupFilter && groupFilter !== 'সব গ্রুপ') filterParts.push(`বিভাগ: ${groupFilter}`);
  if (gradeFilter && gradeFilter !== 'সব গ্রেড') filterParts.push(`গ্রেড: ${gradeFilter}`);
  const filterLine = filterParts.length > 0 ? filterParts.join(' | ') : '';

  // Dynamic sorting based on filter panel
  const sortBy = options.sortBy || 'total';
  const sortOrder = options.sortOrder || 'desc';
  const sortLabels = { 'total': 'মোট স্কোর', 'written': 'লিখিত', 'mcq': 'MCQ', 'practical': 'প্র্যাকটিক্যাল' };
  const orderLabels = { 'desc': 'সর্বোচ্চ → সর্বনিম্ন', 'asc': 'সর্বনিম্ন → সর্বোচ্চ', 'roll-asc': 'রোল: ছোট → বড়', 'roll-desc': 'রোল: বড় → ছোট' };

  const sorted = [...data].sort((a, b) => {
    if (sortOrder === 'roll-asc' || sortOrder === 'roll-desc') {
      // First sort by group (বিজ্ঞান → ব্যবসায় → মানবিক)
      const groupCompare = (a.group || '').localeCompare(b.group || '', 'bn');
      if (groupCompare !== 0) return groupCompare;
      // Then by roll within each group
      const rollA = parseInt(a.roll || a.id) || 0;
      const rollB = parseInt(b.roll || b.id) || 0;
      return sortOrder === 'roll-asc' ? rollA - rollB : rollB - rollA;
    }
    const valA = Number(a[sortBy]) || 0;
    const valB = Number(b[sortBy]) || 0;
    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  const totalStudents = sorted.length;
  const participants = sorted.filter(s => Number(s.written) > 0 || Number(s.mcq) > 0).length;
  const failedStudents = getFailedStudents(sorted, options);
  const passedCount = participants - failedStudents.length;
  const passRate = participants > 0 ? ((passedCount / participants) * 100).toFixed(1) : 0;

  // Grade distribution (exclude absent students)
  const gradeDist = {};
  let absentCount = 0;
  sorted.forEach(s => {
    if (Number(s.written) === 0 && Number(s.mcq) === 0) {
      absentCount++;
      return;
    }
    // If CQ or MCQ below pass mark → F grade
    const isFailed = Number(s.written) < writtenPass || Number(s.mcq) < mcqPass;
    const g = isFailed ? 'F' : calculateGrade(s.total).grade;
    gradeDist[g] = (gradeDist[g] || 0) + 1;
  });
  const gradeColors = { 'A+': '#10b981', 'A': '#22c55e', 'A-': '#84cc16', 'B': '#3b82f6', 'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444' };
  const gradeBoxes = ['A+', 'A', 'A-', 'B', 'C', 'D', 'F'].map(g => {
    const count = gradeDist[g] || 0;
    const color = gradeColors[g];
    return `<div class="grade-box" style="border-color: ${color};">
      <span class="gb-grade" style="color: ${color};">${g}</span>
      <span class="gb-count" style="background: ${color};">${count}</span>
    </div>`;
  }).join('') + (absentCount > 0 ? `<div class="grade-box" style="border-color: #94a3b8;">
      <span class="gb-grade" style="color: #94a3b8;">অনু.</span>
      <span class="gb-count" style="background: #94a3b8;">${absentCount}</span>
    </div>` : '');

  const tableRows = sorted.map((s, i) => {
    const gradeInfo = calculateGrade(s.total);
    const isFailed = Number(s.written) < writtenPass || Number(s.mcq) < mcqPass;
    const isAbsent = Number(s.written) === 0 && Number(s.mcq) === 0;
    const status = isAbsent ? 'অনুপস্থিত' : isFailed ? 'ফেল' : 'পাস';
    const statusClass = isAbsent ? 'status-absent' : isFailed ? 'status-fail' : 'status-pass';
    const groupColorClass = (s.group || '').includes('বিজ্ঞান') ? 'grp-science' :
      (s.group || '').includes('ব্যবসায়') ? 'grp-business' : 'grp-arts';
    const rowGroupClass = (s.group || '').includes('বিজ্ঞান') ? 'row-science' :
      (s.group || '').includes('ব্যবসায়') ? 'row-business' : 'row-arts';
    return `<tr class="${rowGroupClass} ${isFailed ? 'row-fail' : ''}">
      <td>${i + 1}</td>
      <td>${s.roll || s.id}</td>
      <td class="name-cell">${s.name}</td>
      <td><span class="grp-cell ${groupColorClass}">${s.group || '-'}</span></td>
      <td>${s.written}</td>
      <td>${s.mcq}</td>
      <td>${s.practical}</td>
      <td><strong>${s.total}</strong></td>
      <td>${gradeInfo.point.toFixed(2)}</td>
      <td>${gradeInfo.grade}</td>
      <td class="${statusClass}">${status}</td>
    </tr>`;
  }).join('');

  const printHTML = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <title>${examName} - ফলাফল</title>
  <style>
    @page { size: A4; margin: 12mm 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a2e; font-size: 10px; line-height: 1.3; }

    .print-header { text-align: center; border-bottom: 3px double #1a1a2e; padding-bottom: 8px; margin-bottom: 10px; }
    .print-header h1 { font-size: 16px; font-weight: 900; margin-bottom: 2px; }
    .print-header .sub { font-size: 11px; color: #555; margin-bottom: 4px; }
    .header-badges { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
    .header-badge { padding: 3px 12px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #f0f0f0; border: 1px solid #ccc; }

    .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 10px; }
    .summary-item { text-align: center; padding: 6px 4px; border-radius: 6px; border: 1px solid #dee2e6; }
    .summary-item .s-label { font-size: 8px; font-weight: 700; color: #777; text-transform: uppercase; display: block; }
    .summary-item .s-value { font-size: 14px; font-weight: 900; display: block; }
    .summary-item.total-box { background: #e8f4fd; }
    .summary-item.total-box .s-value { color: #0c5460; }
    .summary-item.exam-box { background: #fff3cd; }
    .summary-item.exam-box .s-value { color: #856404; }
    .summary-item.pass-box { background: #d4edda; }
    .summary-item.pass-box .s-value { color: #155724; }
    .summary-item.fail-box { background: #f8d7da; }
    .summary-item.fail-box .s-value { color: #721c24; }
    .summary-item.rate-box { background: #e2e3f1; }
    .summary-item.rate-box .s-value { color: #383d6e; }

    .grade-section { margin-bottom: 10px; }
    .grade-section-title { text-align: center; font-size: 9px; color: #888; font-weight: 700; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
    .grade-boxes { display: flex; justify-content: center; gap: 6px; }
    .grade-box { display: flex; flex-direction: column; align-items: center; border: 2px solid #ccc; border-radius: 8px; min-width: 44px; overflow: hidden; background: white; }
    .gb-grade { font-size: 13px; font-weight: 900; padding: 4px 0 2px; }
    .gb-count { display: block; width: 100%; text-align: center; color: white; font-size: 11px; font-weight: 800; padding: 2px 0; }

    table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
    th { background: #1a1a2e; color: white; padding: 5px 3px; text-align: center; font-weight: 700; font-size: 8.5px; text-transform: uppercase; }
    td { padding: 4px 3px; text-align: center; border-bottom: 1px solid #e9ecef; }
    tr:nth-child(even) { background: #f8f9fa; }
    .row-fail { background: #fff5f5 !important; }
    .name-cell { text-align: left; font-weight: 600; }
    .status-pass { color: #27ae60; font-weight: 800; }
    .status-fail { color: #e74c3c; font-weight: 800; }
    .status-absent { color: #95a5a6; font-weight: 700; }

    .grp-cell { font-weight: 700; font-size: 8.5px; padding: 2px 6px; border-radius: 4px; color: white; white-space: nowrap; display: inline-block; }
    .grp-science { background: #6366f1; }
    .grp-business { background: #f59e0b; }
    .grp-arts { background: #f43f5e; }
    tr.row-science { border-left: 3px solid #6366f1; }
    tr.row-business { border-left: 3px solid #f59e0b; }
    tr.row-arts { border-left: 3px solid #f43f5e; }

    .filter-info { text-align: center; font-size: 9px; color: #e74c3c; font-weight: 700; margin-bottom: 8px; }
    .filter-tag { display: inline-block; background: #fff3cd; color: #856404; padding: 2px 8px; border-radius: 4px; font-size: 9px; margin: 0 2px; border: 1px solid #ffc107; }

    .print-footer { margin-top: 10px; text-align: center; font-size: 8px; color: #aaa; border-top: 1px solid #dee2e6; padding-top: 4px; }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>${examName}</h1>
    <div class="sub">${subjectName}</div>
    <div class="header-badges">
      <span class="header-badge">📚 শ্রেণি: ${className}</span>
      <span class="header-badge">📅 সেশন: ${session}</span>
    </div>
    ${filterLine ? `<div class="filter-info">🔍 ফিল্টার: ${filterParts.map(f => `<span class="filter-tag">${f}</span>`).join(' ')}</div>` : ''}
    <div class="filter-info">📊 সাজানো: <span class="filter-tag">${sortLabels[sortBy] || sortBy} — ${orderLabels[sortOrder] || sortOrder}</span></div>
  </div>

  <div class="summary-grid">
    <div class="summary-item total-box">
      <span class="s-label">মোট শিক্ষার্থী</span>
      <span class="s-value">${totalStudents}</span>
    </div>
    <div class="summary-item exam-box">
      <span class="s-label">পরীক্ষার্থী</span>
      <span class="s-value">${participants}</span>
    </div>
    <div class="summary-item pass-box">
      <span class="s-label">পাস</span>
      <span class="s-value">${passedCount}</span>
    </div>
    <div class="summary-item fail-box">
      <span class="s-label">ফেল</span>
      <span class="s-value">${failedStudents.length}</span>
    </div>
    <div class="summary-item rate-box">
      <span class="s-label">পাসের হার</span>
      <span class="s-value">${passRate}%</span>
    </div>
  </div>

  <div class="grade-section">
    <div class="grade-section-title">গ্রেড বিন্যাস</div>
    <div class="grade-boxes">${gradeBoxes}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ক্র.নং</th>
        <th>রোল</th>
        <th style="text-align:left">নাম</th>
        <th>বিভাগ</th>
        <th>CQ</th>
        <th>MCQ</th>
        <th>Practical</th>
        <th>Total</th>
        <th>GPA</th>
        <th>Grade</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="print-footer">
    Students Performance Analysis — ${new Date().toLocaleDateString('bn-BD')}
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(printHTML);
  printWindow.document.close();
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
            <div class="student-header-top">
                <h3>${studentInfo.name} <span class="roll-number-label">(রোল: ${studentInfo.id})</span></h3>
            </div>
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
