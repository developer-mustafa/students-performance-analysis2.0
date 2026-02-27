/**
 * UI Components Module - Handles all DOM rendering
 * @module uiComponents
 */
import { state } from './modules/state.js';

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
  normalizeText,
  convertToBengaliDigits,
} from './utils.js';
import { FAILING_THRESHOLD, MAX_CHART_ENTRIES, MAX_TABLE_ENTRIES, GROUP_NAMES } from './constants.js';
import { captureElementAsImage } from './dataService.js';

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
  const firstStudent = data[0] || {};

  // Update Header Meta
  const { examName, subjectName } = options;
  if (metaElement) {
    metaElement.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 10px;">
        <div class="meta-items-group" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <span class="meta-item"><i class="fas fa-graduation-cap"></i> শ্রেণি: ${firstStudent.class || 'N/A'}</span>
          <span class="meta-item"><i class="fas fa-calendar-alt"></i> সেশন: ${firstStudent.session || 'N/A'}</span>
          ${examName ? `<span class="meta-item"><i class="fas fa-book"></i> ${examName}</span>` : ''}
          ${subjectName ? `<span class="meta-item"><i class="fas fa-book-open"></i> ${subjectName}</span>` : ''}
        </div>
        <button class="view-btn btn-premium-download" id="downloadGroupStatsBtn" style="margin: 0; padding: 6px 14px; font-size: 0.85rem;">
          <i class="fas fa-download"></i> ডাউনলোড
        </button>
      </div>
    `;

    // Re-attach event listener as the element is re-created
    const newBtn = document.getElementById('downloadGroupStatsBtn');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        const statsGrid = document.getElementById('groupStatsContainer');
        if (statsGrid) {
          captureElementAsImage(statsGrid, `group-stats-${examName || 'report'}.png`);
        }
      });
    }
  }

  // Calculate Global Grade Distribution
  const globalStats = calculateStatistics(data, options);
  const globalGrades = globalStats.gradeDistribution || {};
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
           <div class="vibrant-meta-pill success">
              <span class="v-label">মোট পাস</span>
              <span class="v-value">${globalStats.passedStudents}</span>
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
  const { metaElement, paginationContainer } = options;

  // যদি data না থাকে
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="failed-student fade-in">কোনো ডেটা নেই</div>';
    if (metaElement) metaElement.innerHTML = '';
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  const {
    writtenPass = FAILING_THRESHOLD.written,
    mcqPass = FAILING_THRESHOLD.mcq,
    totalPass = 33,
    currentPage = 1,
    perPage = 12,
    onPageChange = null
  } = options;
  let failedStudents = getFailedStudents(data, options);

  // Sort by Group (Bengali) and Roll
  failedStudents.sort((a, b) => {
    const groupCompare = (a.group || '').localeCompare(b.group || '', 'bn');
    if (groupCompare !== 0) return groupCompare;
    return (parseInt(a.roll || a.id) || 0) - (parseInt(b.roll || b.id) || 0);
  });

  // Update group toggle chip counts
  const groupCounts = {};
  failedStudents.forEach(s => {
    const normGroup = normalizeText(s.group);
    groupCounts[normGroup] = (groupCounts[normGroup] || 0) + 1;
  });

  document.querySelectorAll('.chip-count[data-count-group]').forEach(el => {
    const normAttr = normalizeText(el.dataset.countGroup);
    el.textContent = groupCounts[normAttr] || 0;
  });

  if (failedStudents.length === 0) {
    container.innerHTML = '<div class="failed-student fade-in">এই গ্রুপে কোনো ফেল করা শিক্ষার্থী নেই</div>';
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  // Pagination Logic
  const totalPages = Math.ceil(failedStudents.length / perPage);
  const start = (currentPage - 1) * perPage;
  const end = start + perPage;
  const paginatedStudents = failedStudents.slice(start, end);

  // Dynamic Title Update
  const cardTitle = container.closest('.failed-students')?.querySelector('.card-title');
  if (cardTitle && data.length > 0) {
    cardTitle.innerHTML = `<i class="fas fa-user-slash"></i> ফেল করা শিক্ষার্থী (${data[0].class || 'HSC'})`;
  }

  // Update meta if exists
  if (metaElement) {
    const firstStudent = data[0];
    const { examName, subjectName } = options;
    metaElement.innerHTML = `
      <div class="context-meta-bar compact-1-line">
        <span class="meta-item"><i class="fas fa-graduation-cap"></i> শ্রেণি: ${firstStudent.class || 'N/A'}</span>
        <span class="meta-item"><i class="fas fa-calendar-alt"></i> সেশন: ${firstStudent.session || 'N/A'}</span>
        ${examName ? `<span class="meta-item"><i class="fas fa-book"></i> ${examName}</span>` : ''}
        ${subjectName ? `<span class="meta-item"><i class="fas fa-book-open"></i> ${subjectName}</span>` : ''}
      </div>
    `;
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
  container.innerHTML = paginatedStudents
    .map(student => {
      const gradeInfo = calculateGrade(student.total);
      const failReason = Number(student.written) < writtenPass
        ? `লিখিত: ${student.written} < ${writtenPass}`
        : Number(student.mcq) < mcqPass
          ? `MCQ: ${student.mcq} < ${mcqPass}`
          : `মোট মার্কস < ${totalPass}`;

      const groupColorClass = student.group === GROUP_NAMES.science ? 'grp-science' :
        student.group === GROUP_NAMES.business ? 'grp-business' : 'grp-arts';
      const groupShort = student.group === GROUP_NAMES.science ? 'বিজ্ঞান' :
        student.group === GROUP_NAMES.business ? 'ব্যবসায়' : 'মানবিক';

      return `
        <div class="refined-readable-card ${groupColorClass}" data-group="${student.group}">
          <div class="card-left-content">
            <div class="student-header-mini">
              <div class="avatar-box ${student.group === GROUP_NAMES.science ? 'bg-blue-soft text-blue-main' :
          student.group === GROUP_NAMES.business ? 'bg-green-soft text-green-main' : 'bg-purple-soft text-purple-main'
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

          <div class="card-right-stats ${student.group === GROUP_NAMES.science ? 'border-blue' :
          student.group === GROUP_NAMES.business ? 'border-green' : 'border-purple'
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

  // Render Pagination
  if (paginationContainer) {
    if (totalPages > 1) {
      renderPagination(paginationContainer, currentPage, totalPages, onPageChange);
    } else {
      paginationContainer.innerHTML = '';
    }
  }
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

  const statsData = options.fullData || data;
  const overallStats = calculateStatistics(statsData, options);
  const groupStats = calculateGroupStatistics(statsData, options);
  const overallPassRate = overallStats.participants > 0 ? Math.round((overallStats.passedStudents / overallStats.participants) * 100) : 0;

  // Dynamic Filters HTML
  const filterChips = [];
  if (options.groupFilter && options.groupFilter !== 'সব গ্রুপ') {
    filterChips.push(`<span class="f-chip">বিভাগ: ${options.groupFilter}</span>`);
  }
  if (options.gradeFilter && options.gradeFilter !== 'সব গ্রেড') {
    filterChips.push(`<span class="f-chip">গ্রেড: ${options.gradeFilter}</span>`);
  }
  if (options.statusFilter && options.statusFilter !== 'সব শিক্ষার্থী') {
    filterChips.push(`<span class="f-chip">অবস্থা: ${options.statusFilter}</span>`);
  }
  if (options.searchTerm && options.searchTerm.trim() !== '') {
    filterChips.push(`<span class="f-chip">সার্চ: ${options.searchTerm}</span>`);
  }
  const filtersHTML = filterChips.length > 0 ? `<div class="f-row">🔍 ফিল্টার: ${filterChips.join('')}</div>` : '';

  const gradeDist = overallStats.gradeDistribution;
  const gradesOrder = ['A+', 'A', 'A-', 'B', 'C', 'D', 'F'];
  const gradeSummary = gradesOrder.map(g => {
    const c = gradeDist[g] || 0;
    const gClass = g.replace('+', 'plus').replace('-', 'minus');
    return `
      <div class="grade-box gb-${gClass}">
        <div class="gb-top">${g}</div>
        <div class="gb-btm">${convertToBengaliDigits(c)}</div>
      </div>`;
  }).join('');

  const groupSummaryHTML = groupStats.map(g => `
    <div class="g-card">
      <span class="gn">${g.group}</span>
      <span class="gv">${convertToBengaliDigits(g.failedStudents)} জন ফেল</span>
    </div>`).join('');

  const tableRows = failedStudents.map((s, i) => `
    <tr>
      <td>${convertToBengaliDigits(i + 1)}</td>
      <td>${convertToBengaliDigits(s.roll || s.id)}</td>
      <td class="name-td">${s.name}</td>
      <td class="${getGroupClass(s.group)}">${s.group || '-'}</td>
      <td ${Number(s.written) < writtenPass ? 'style="color: #ef4444; font-weight: bold;"' : ''}>${convertToBengaliDigits(s.written || 0)}</td>
      <td ${Number(s.mcq) < mcqPass ? 'style="color: #ef4444; font-weight: bold;"' : ''}>${convertToBengaliDigits(s.mcq || 0)}</td>
      <td>${convertToBengaliDigits(s.practical || 0)}</td>
      <td><strong>${convertToBengaliDigits(s.total || 0)}</strong></td>
      <td class="s-fail">${Number(s.written) < writtenPass ? 'CQ ফেল' : Number(s.mcq) < mcqPass ? 'MCQ ফেল' : 'মোট ফেল'}</td>
    </tr>`).join('');

  const printHTML = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <title> </title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust: exact; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; font-size: 10px; line-height: 1.3; }
    
    .h { text-align: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #0f172a; }
    .h h1 { font-size: 20px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .h .sub { font-size: 13px; color: #334155; font-weight: 700; background: #f1f5f9; display: inline-block; padding: 2px 15px; border-radius: 20px; border: 1px solid #e2e8f0; }

    .top-bar { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; padding: 5px 12px; border-radius: 6px; margin-bottom: 10px; }
    .top-item { display: flex; gap: 6px; font-size: 10px; }
    .lbl { color: #64748b; font-weight: 600; }
    .val { color: #0f172a; font-weight: 800; }
    .pm-box { background: #fff7ed; padding: 1px 10px; border-radius: 4px; border: 1px solid #fed7aa; color: #9a3412; }

    .f-row { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; background: #fffbeb; border: 1px solid #fef3c7; padding: 4px; border-radius: 6px; font-size: 9px; font-weight: 700; color: #92400e; }
    .f-chip { background: #fbbf24; color: #78350f; padding: 1px 8px; border-radius: 4px; border: 1px solid #f59e0b; }

    .dash { display: grid; grid-template-columns: 1fr 280px; gap: 10px; margin-bottom: 10px; }
    .section { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: white; }
    .st { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .overall-pass-badge { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); color: white; padding: 4px 15px; border-radius: 8px; font-size: 11px; font-weight: 900; letter-spacing: 0.5px; box-shadow: 0 3px 10px rgba(22, 163, 74, 0.4); border: 1.5px solid #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.2); }
    
    .pass-dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px; }
    .grp-progress-item { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 12px; }
    .grp-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-size: 10px; font-weight: 800; }
    .progress-bar { height: 7px; background: #f1f5f9; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }
    .progress-fill { height: 100%; border-radius: 10px; }
    .fill-science { background: #6366f1; }
    .fill-business { background: #f59e0b; }
    .fill-arts { background: #f43f5e; }
    
    /* Grade Box Split Design */
    .grade-grid { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; }
    .grade-box { width: 52px; border: 1.5px solid #e2e8f0; border-radius: 10px; overflow: hidden; text-align: center; }
    .gb-top { font-size: 12px; font-weight: 800; padding: 4px 0; background: white; }
    .gb-btm { font-size: 14px; font-weight: 900; padding: 4px 0; color: white; }

    /* Grade Colors */
    .gb-Aplus { border-color: #10b981; } .gb-Aplus .gb-top { color: #10b981; } .gb-Aplus .gb-btm { background: #10b981; }
    .gb-A { border-color: #22c55e; } .gb-A .gb-top { color: #22c55e; } .gb-A .gb-btm { background: #22c55e; }
    .gb-Aminus { border-color: #84cc16; } .gb-Aminus .gb-top { color: #84cc16; } .gb-Aminus .gb-btm { background: #84cc16; }
    .gb-B { border-color: #3b82f6; } .gb-B .gb-top { color: #3b82f6; } .gb-B .gb-btm { background: #3b82f6; }
    .gb-C { border-color: #f59e0b; } .gb-C .gb-top { color: #f59e0b; } .gb-C .gb-btm { background: #f59e0b; }
    .gb-D { border-color: #f97316; } .gb-D .gb-top { color: #f97316; } .gb-D .gb-btm { background: #f97316; }
    .gb-F { border-color: #ef4444; } .gb-F .gb-top { color: #ef4444; } .gb-F .gb-btm { background: #ef4444; }

    .sum-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; height: calc(100% - 20px); align-items: center; }
    .s-boxInner { text-align: center; padding: 5px 2px; border-radius: 6px; display: flex; flex-direction: column; justify-content: center; border: 1px solid transparent; }
    .s-boxInner.tot { background: #f8fafc; color: #475569; border-color: #e2e8f0; }
    .s-boxInner.t { background: #eff6ff; color: #1e40af; border-color: #dbeafe; }
    .s-boxInner.p { background: #f0fdf4; color: #166534; border-color: #dcfce7; }
    .s-boxInner.f { background: #fef2f2; color: #991b1b; border-color: #fee2e2; }
    .s-boxInner.a { background: #f1f5f9; color: #64748b; border-color: #e2e8f0; }
    .sn { font-size: 8px; font-weight: 700; opacity: 0.8; margin-top: 1px; }
    .sv { font-size: 14px; font-weight: 900; }

    .group-row { display: flex; gap: 8px; margin-bottom: 10px; }
    .g-card { flex: 1; border: 1px solid #e2e8f0; padding: 6px; border-radius: 6px; display: flex; flex-direction: column; align-items: center; text-align: center; background: white; }
    .g-card .gn { font-size: 8px; color: #64748b; font-weight: 800; border-bottom: 1px solid #f1f5f9; width: 100%; margin-bottom: 2px; }
    .g-card .gv { font-size: 11px; font-weight: 900; color: #ef4444; }

    table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; margin-top: 5px; }
    th { background: #f1f5f9; color: #334155; padding: 7px 4px; font-size: 9px; font-weight: 800; border: 1px solid #e2e8f0; border-bottom: 2px solid #cbd5e1; }
    td { padding: 4px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px; }
    tr:nth-child(even) { background: #f8fafc; }
    .name-td { text-align: left; font-weight: 600; padding-left: 8px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .s-fail { color: #ef4444; font-weight: 800; font-size: 8.5px; }

    /* Dynamic Group Colors */
    .science-group { background: #ecfeff !important; color: #0891b2 !important; font-weight: 700; }
    .business-group { background: #fffbeb !important; color: #b45309 !important; font-weight: 700; }
    .arts-group { background: #fdf2f8 !important; color: #be185d !important; font-weight: 700; }
    
    /* Persistent Footer Logic */
    .ftr { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1.5px solid #e2e8f0; padding: 10px 0; text-align: center; }
    .ftr-dev { font-size: 10px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
    .ftr-contact { font-size: 9px; color: #64748b; font-weight: 600; }
    .ftr-soft { color: #10b981; font-weight: 800; border-left: 2px solid #e2e8f0; margin-left: 8px; padding-left: 8px; }
    
    @media print {
      body { padding: 0; margin: 0; }
      .section, .g-card { break-inside: avoid; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }
  </style>
</head>
<body>
  <div class="h">
    <h1>অকৃতকার্য শিক্ষার্থীদের তালিকা</h1>
    <div class="sub">${examName} — ${subjectName}</div>
  </div>

  <div class="top-bar">
    <div class="top-item"><span class="lbl">শ্রেণি ও সেশন:</span> <span class="val">${className} (${convertToBengaliDigits(session)})</span></div>
    <div class="top-item pm-box"><span class="lbl">Pass (CQ/MCQ):</span> <span class="val">${convertToBengaliDigits(writtenPass)} / ${convertToBengaliDigits(mcqPass)}</span></div>
  </div>

  ${filtersHTML}

  <div class="dash">
    <div class="section">
      <div class="st">গ্রেড বিন্যাস</div>
      <div class="grade-grid">${gradeSummary}</div>
    </div>
    <div class="section">
      <div class="st">সারসংক্ষেপ</div>
      <div class="sum-grid">
        <div class="s-boxInner tot"><div class="sv">${convertToBengaliDigits(overallStats.totalStudents)}</div><div class="sn">মোট শিক্ষার্থী</div></div>
        <div class="s-boxInner t"><div class="sv">${convertToBengaliDigits(overallStats.participants)}</div><div class="sn">পরীক্ষার্থী</div></div>
        <div class="s-boxInner p"><div class="sv">${convertToBengaliDigits(overallStats.passedStudents)}</div><div class="sn">পাস</div></div>
        <div class="s-boxInner f"><div class="sv">${convertToBengaliDigits(overallStats.failedStudents)}</div><div class="sn">ফেল</div></div>
        <div class="s-boxInner a"><div class="sv">${convertToBengaliDigits(overallStats.absentStudents)}</div><div class="sn">অনুপস্থিত</div></div>
      </div>
    </div>
  </div>

  <div class="section" style="margin-bottom: 10px;">
    <div class="st"><span>বিভাগ ভিত্তিক পাশের হার</span> <span class="overall-pass-badge">মোট পাশের হার: ${convertToBengaliDigits(overallPassRate)}%</span></div>
    <div class="pass-dashboard">
      ${groupStats.map(gs => {
    const rate = gs.participants > 0 ? Math.round((gs.passedStudents / gs.participants) * 100) : 0;
    const gClass = gs.group.includes('বিজ্ঞান') ? 'fill-science' : gs.group.includes('ব্যবসায়') ? 'fill-business' : 'fill-arts';
    return `<div class="grp-progress-item">
          <div class="grp-info"><span>${gs.group}</span> <span>${convertToBengaliDigits(rate)}%</span></div>
          <div class="progress-bar"><div class="progress-fill ${gClass}" style="width: ${rate}%"></div></div>
        </div>`;
  }).join('')}
    </div>
  </div>

  <div class="group-row">${groupSummaryHTML}</div>

  <table>
    <thead>
      <tr>
        <th width="40">ক্র.নং</th>
        <th width="60">রোল</th>
        <th style="text-align:left; padding-left: 8px;">নাম</th>
        <th width="80">বিভাগ</th>
        <th width="40">CQ</th>
        <th width="40">MCQ</th>
        <th width="40">Prac</th>
        <th width="50">Total</th>
        <th width="70">অবস্থা</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="9" style="border: none; padding: 0; height: 65px;"></td>
      </tr>
    </tfoot>
  </table>

  <!-- Persistent Footer -->
  <div class="ftr">
    <div class="ftr-dev">সফটওয়্যার নির্মাতা: মোস্তফা রাহমান, সিনিয়র সফটওয়্যার ইন্জিনিয়্যার, ইস্তাম্বুল, তুরস্ক</div>
    <div class="ftr-contact">যোগাযোগ: ০১৮৪০-৬৪৩৯৪৬ <span class="ftr-soft">অটোমেটেড এক্সাম এনালিষ্ট সফটওয়্যার</span></div>
    <div class="ftr-contact" style="margin-top: 2px; color: #3b82f6; font-weight: 700;">${window.location.host}</div>
  </div>

  <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); }</script>
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
  const first = data[0] || {};
  const className = first.class || 'N/A';
  const session = first.session || 'N/A';

  const statsData = options.fullData || data;
  const overallStats = calculateStatistics(statsData, options);
  const groupStats = calculateGroupStatistics(statsData, options);
  const overallPassRate = overallStats.participants > 0 ? Math.round((overallStats.passedStudents / overallStats.participants) * 100) : 0;

  // Dynamic Filters HTML
  const filterChips = [];

  if (options.gradeFilter && options.gradeFilter !== 'সব গ্রেড') {
    filterChips.push(`<span class="f-chip">গ্রেড: ${options.gradeFilter}</span>`);
  }
  if (options.statusFilter && options.statusFilter !== 'সব শিক্ষার্থী') {
    filterChips.push(`<span class="f-chip">অবস্থা: ${options.statusFilter}</span>`);
  }
  if (options.searchTerm && options.searchTerm.trim() !== '') {
    filterChips.push(`<span class="f-chip">সার্চ: ${options.searchTerm}</span>`);
  }
  const filtersHTML = filterChips.length > 0 ? `<div class="f-row">🔍 ফিল্টার: ${filterChips.join('')}</div>` : '';

  // Sorting
  const sortBy = options.sortBy || 'total';
  const sortOrder = options.sortOrder || 'desc';
  const sorted = [...data].sort((a, b) => {
    if (sortOrder === 'roll-asc' || sortOrder === 'roll-desc') {
      const groupCompare = (a.group || '').localeCompare(b.group || '', 'bn');
      if (groupCompare !== 0) return groupCompare;
      const rollA = parseInt(a.roll || a.id) || 0;
      const rollB = parseInt(b.roll || b.id) || 0;
      return sortOrder === 'roll-asc' ? rollA - rollB : rollB - rollA;
    }
    const valA = Number(a[sortBy]) || 0;
    const valB = Number(b[sortBy]) || 0;
    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  // Grade Summary (Split-card)
  const gradeDist = overallStats.gradeDistribution;
  const gradesOrder = ['A+', 'A', 'A-', 'B', 'C', 'D', 'F'];
  const gradeSummary = gradesOrder.map(g => {
    const c = gradeDist[g] || 0;
    const gClass = g.replace('+', 'plus').replace('-', 'minus');
    return `<div class="grade-box gb-${gClass}"><div class="gb-top">${g}</div><div class="gb-btm">${convertToBengaliDigits(c)}</div></div>`;
  }).join('');

  const tableRows = sorted.map((s, i) => {
    const gradeInfo = calculateGrade(s.total);
    const status = determineStatus(s, options);
    const isAbs = status === 'অনুপস্থিত';
    const isFailed = status === 'ফেল';
    const groupColorClass = (s.group || '').includes('বিজ্ঞান') ? 'grp-science' : (s.group || '').includes('ব্যবসায়') ? 'grp-business' : 'grp-arts';

    return `<tr class="${isFailed ? 'row-fail' : ''}">
      <td>${convertToBengaliDigits(i + 1)}</td>
      <td>${convertToBengaliDigits(s.roll || s.id)}</td>
      <td class="name-td">${s.name}</td>
      <td class="${getGroupClass(s.group)}">${s.group || '-'}</td>
      <td ${Number(s.written) < writtenPass ? 'style="color: #ef4444; font-weight: bold;"' : ''}>${convertToBengaliDigits(s.written || 0)}</td>
      <td ${Number(s.mcq) < mcqPass ? 'style="color: #ef4444; font-weight: bold;"' : ''}>${convertToBengaliDigits(s.mcq || 0)}</td>
      <td>${convertToBengaliDigits(s.practical || 0)}</td>
      <td><strong>${convertToBengaliDigits(s.total || 0)}</strong></td>
      <td>${convertToBengaliDigits(gradeInfo.point.toFixed(2))}</td>
      <td>${gradeInfo.grade}</td>
      <td class="${isAbs ? 's-abs' : isFailed ? 's-fail' : 's-pass'}">${status}</td>
    </tr>`;
  }).join('');

  const printHTML = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <title> </title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust: exact; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; font-size: 10px; line-height: 1.3; }
    
    .h { text-align: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #0f172a; }
    .h h1 { font-size: 20px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .h .sub { font-size: 13px; color: #334155; font-weight: 700; background: #f1f5f9; display: inline-block; padding: 2px 15px; border-radius: 20px; border: 1px solid #e2e8f0; }

    .top-bar { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; padding: 5px 12px; border-radius: 6px; margin-bottom: 10px; }
    .top-item { display: flex; gap: 6px; font-size: 10px; }
    .lbl { color: #64748b; font-weight: 600; }
    .val { color: #0f172a; font-weight: 800; }
    .pm-box { background: #fff7ed; padding: 1px 10px; border-radius: 4px; border: 1px solid #fed7aa; color: #9a3412; }

    .dash { display: grid; grid-template-columns: 1fr 280px; gap: 10px; margin-bottom: 10px; }
    .section { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: white; }
    .st { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .overall-pass-badge { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); color: white; padding: 4px 15px; border-radius: 8px; font-size: 11px; font-weight: 900; letter-spacing: 0.5px; box-shadow: 0 3px 10px rgba(22, 163, 74, 0.4); border: 1.5px solid #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.2); }
    

    .pass-dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px; }
    .grp-progress-item { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 12px; }
    .grp-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-size: 10px; font-weight: 800; }
    .progress-bar { height: 7px; background: #f1f5f9; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }
    .progress-fill { height: 100%; border-radius: 10px; }
    .fill-science { background: #6366f1; }
    .fill-business { background: #f59e0b; }
    .fill-arts { background: #f43f5e; }

    
    .grade-grid { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; }
    .grade-box { width: 52px; border: 1.5px solid #e2e8f0; border-radius: 10px; overflow: hidden; text-align: center; }
    .gb-top { font-size: 12px; font-weight: 800; padding: 4px 0; background: white; color: #1e293b; }
    .gb-btm { font-size: 14px; font-weight: 900; padding: 4px 0; color: white; }

    .gb-Aplus { border-color: #10b981; } .gb-Aplus .gb-top { color: #10b981; } .gb-Aplus .gb-btm { background: #10b981; }
    .gb-A { border-color: #22c55e; } .gb-A .gb-top { color: #22c55e; } .gb-A .gb-btm { background: #22c55e; }
    .gb-Aminus { border-color: #84cc16; } .gb-Aminus .gb-top { color: #84cc16; } .gb-Aminus .gb-btm { background: #84cc16; }
    .gb-B { border-color: #3b82f6; } .gb-B .gb-top { color: #3b82f6; } .gb-B .gb-btm { background: #3b82f6; }
    .gb-C { border-color: #f59e0b; } .gb-C .gb-top { color: #f59e0b; } .gb-C .gb-btm { background: #f59e0b; }
    .gb-D { border-color: #f97316; } .gb-D .gb-top { color: #f97316; } .gb-D .gb-btm { background: #f97316; }
    .gb-F { border-color: #ef4444; } .gb-F .gb-top { color: #ef4444; } .gb-F .gb-btm { background: #ef4444; }

    .sum-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; height: calc(100% - 20px); align-items: center; }
    .s-boxInner { text-align: center; padding: 5px 2px; border-radius: 6px; display: flex; flex-direction: column; justify-content: center; border: 1px solid transparent; }
    .s-boxInner.tot { background: #f8fafc; color: #475569; border-color: #e2e8f0; }
    .s-boxInner.t { background: #eff6ff; color: #1e40af; border-color: #dbeafe; }
    .s-boxInner.p { background: #f0fdf4; color: #166534; border-color: #dcfce7; }
    .s-boxInner.f { background: #fef2f2; color: #991b1b; border-color: #fee2e2; }
    .s-boxInner.a { background: #f1f5f9; color: #64748b; border-color: #e2e8f0; }
    .sn { font-size: 8px; font-weight: 700; opacity: 0.8; margin-top: 1px; }
    .sv { font-size: 14px; font-weight: 900; }

    table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; margin-top: 5px; }
    th { background: #f1f5f9; color: #334155; padding: 7px 4px; font-size: 9px; font-weight: 800; border: 1px solid #e2e8f0; border-bottom: 2px solid #cbd5e1; }
    td { padding: 4px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px; }
    tr:nth-child(even) { background: #f8fafc; }
    .name-td { text-align: left; font-weight: 600; padding-left: 8px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    
    /* Dynamic Group Colors */
    .science-group { background: #ecfeff !important; color: #0891b2 !important; font-weight: 700; }
    .business-group { background: #fffbeb !important; color: #b45309 !important; font-weight: 700; }
    .arts-group { background: #fdf2f8 !important; color: #be185d !important; font-weight: 700; }

    .s-pass { color: #27ae60; font-weight: 800; }
    .s-fail { color: #ef4444; font-weight: 800; }
    .s-abs { color: #94a3b8; font-weight: 700; }
    
    .ftr { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1.5px solid #e2e8f0; padding: 10px 0; text-align: center; }
    .ftr-dev { font-size: 10px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
    .ftr-contact { font-size: 9px; color: #64748b; font-weight: 600; }
    .ftr-soft { color: #10b981; font-weight: 800; border-left: 2px solid #e2e8f0; margin-left: 8px; padding-left: 8px; }
    
    @media print {
      body { padding: 0; margin: 0; }
      .section { break-inside: avoid; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }
  </style>
</head>
<body>
  <div class="h">
    <h1>শিক্ষার্থীদের পূর্ণাঙ্গ ফলাফল তালিকা</h1>
    <div class="sub">${examName} — ${subjectName}</div>
  </div>

  <div class="top-bar">
    <div class="top-item"><span class="lbl">শ্রেণি ও সেশন:</span> <span class="val">${className} (${convertToBengaliDigits(session)})</span></div>
    <div class="top-item pm-box"><span class="lbl">Pass (CQ/MCQ):</span> <span class="val">${convertToBengaliDigits(writtenPass)} / ${convertToBengaliDigits(mcqPass)}</span></div>
  </div>

  ${filtersHTML}

  <div class="dash">
    <div class="section">
      <div class="st">গ্রেড বিন্যাস</div>
      <div class="grade-grid">${gradeSummary}</div>
    </div>
    <div class="section">
      <div class="st">সারসংক্ষেপ</div>
      <div class="sum-grid">
        <div class="s-boxInner tot"><div class="sv">${convertToBengaliDigits(overallStats.totalStudents)}</div><div class="sn">মোট শিক্ষার্থী</div></div>
        <div class="s-boxInner t"><div class="sv">${convertToBengaliDigits(overallStats.participants)}</div><div class="sn">পরীক্ষার্থী</div></div>
        <div class="s-boxInner p"><div class="sv">${convertToBengaliDigits(overallStats.passedStudents)}</div><div class="sn">পাস</div></div>
        <div class="s-boxInner f"><div class="sv">${convertToBengaliDigits(overallStats.failedStudents)}</div><div class="sn">ফেল</div></div>
        <div class="s-boxInner a"><div class="sv">${convertToBengaliDigits(overallStats.absentStudents)}</div><div class="sn">অনুপস্থিত</div></div>
      </div>
    </div>
  </div>

  <div class="section" style="margin-bottom: 10px;">
    <div class="st"><span>বিভাগ ভিত্তিক পাশের হার</span> <span class="overall-pass-badge">মোট পাশের হার: ${convertToBengaliDigits(overallPassRate)}%</span></div>
    <div class="pass-dashboard">
      ${groupStats.map(gs => {
    const rate = gs.participants > 0 ? Math.round((gs.passedStudents / gs.participants) * 100) : 0;
    const gClass = gs.group.includes('বিজ্ঞান') ? 'fill-science' : gs.group.includes('ব্যবসায়') ? 'fill-business' : 'fill-arts';
    return `<div class="grp-progress-item">
          <div class="grp-info"><span>${gs.group}</span> <span>${convertToBengaliDigits(rate)}%</span></div>
          <div class="progress-bar"><div class="progress-fill ${gClass}" style="width: ${rate}%"></div></div>
        </div>`;
  }).join('')}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th width="35">ক্র.নং</th>
        <th width="50">রোল</th>
        <th style="text-align:left; padding-left: 8px;">নাম</th>
        <th width="80">বিভাগ</th>
        <th width="35">CQ</th>
        <th width="35">MCQ</th>
        <th width="35">Prac</th>
        <th width="45">Total</th>
        <th width="40">GPA</th>
        <th width="40">Grade</th>
        <th width="60">অবস্থা</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="11" style="border: none; padding: 0; height: 65px;"></td>
      </tr>
    </tfoot>
  </table>

  <div class="ftr">
    <div class="ftr-dev">সফটওয়্যার নির্মাতা: মোস্তফা রাহমান, সিনিয়র সফটওয়্যার ইন্জিনিয়্যার, ইস্তাম্বুল, তুরস্ক</div>
    <div class="ftr-contact">যোগাযোগ: ০১৮৪০-৬৪৩৯৪৬ <span class="ftr-soft">অটোমেটেড এক্সাম এনালিষ্ট সফটওয়্যার</span></div>
    <div class="ftr-contact" style="margin-top: 2px; color: #3b82f6; font-weight: 700;">${window.location.host}</div>
  </div>

  <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); }</script>
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
      const status = determineStatus(student, options);
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
 * Helper to get consistent session styles
 */
export function getSessionStyle(session) {
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
    sessionFilter = 'all',
    onLoad = null,
    onEdit = null,
    onDelete = null,
    onSetDefault = null,
    onPageChange = null,
    onFilterChange = null,
    onSessionFilterChange = null,
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

  const sessionFilterContainer = document.getElementById('savedExamsSessionFilters');
  if (sessionFilterContainer) {
    renderSavedExamsSessionFilters(sessionFilterContainer, exams, sessionFilter, onSessionFilterChange);
  }

  // Filter exams
  let filteredExams = exams;
  if (classFilter && classFilter !== 'all') {
    filteredExams = filteredExams.filter(e => (e.class || 'N/A') === classFilter);
  }
  if (sessionFilter && sessionFilter !== 'all') {
    filteredExams = filteredExams.filter(e => (e.session || 'N/A') === sessionFilter);
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
    const manuallyLoadedId = localStorage.getItem('loadedExamId');
    const isActiveLoad = exam.docId === manuallyLoadedId;

    // Logic to hide "Load" button permanently for default exams (for non-admins)
    const shouldHideLoadBtn = !state.isAdmin && exam.docId === defaultExamId;

    // Calculate pass percentage
    const participants = stats.participants || 0;
    const passed = stats.passedStudents || 0;
    const passRate = participants > 0 ? Math.round((passed / participants) * 100) : 0;

    // Get color based on pass rate
    const barColor = passRate >= 80 ? '#27ae60' : passRate >= 50 ? '#f39c12' : '#e74c3c';

    const sessionStyle = getSessionStyle(exam.session);
    const isDefault = exam.docId === defaultExamId;

    return `
            <div class="exam-card ${isCurrent ? 'active' : ''} ${isActiveLoad ? 'is-active-load' : ''} ${isDefault ? 'is-default' : ''}" data-id="${exam.docId}">
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
                    <button class="card-btn-min load-btn ${isActiveLoad ? 'is-active' : ''}" title=" এক্সাম লোড.." ${shouldHideLoadBtn ? 'style="display: none"' : ''}><i class="fas fa-eye"></i> ${isActiveLoad ? 'আন-লোড' : (state.currentUser ? 'লোড করুন' : 'এই পরীক্ষার ফলাফল দেখতে ক্লিক করুন')} </button>
                    <label class="pin-toggle super-admin-only" title="ডিফল্ট হিসেবে সেট করুন">
                        <input type="checkbox" class="pin-checkbox" ${exam.docId === defaultExamId ? 'checked' : ''}>
                        <span class="pin-slider"></span>
                    </label>
                    <button class="card-btn-min edit-btn admin-only" title="এডিট"><i class="fas fa-edit"></i></button>
                    <button class="card-btn-min delete-btn super-admin-only" title="মুছুন"><i class="fas fa-trash"></i></button>
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
 * Render session filters with dynamic colors
 */
export function renderSavedExamsSessionFilters(container, exams, currentFilter, onFilterChange) {
  if (!container) return;

  // Extract unique sessions
  const sessions = [...new Set(exams.map(e => e.session || 'N/A'))].filter(Boolean).sort().reverse();

  let html = `
    <button class="class-filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-session="all">সব সেশন</button>
  `;

  html += sessions.map(session => {
    const isActive = currentFilter === session;
    const sessionStyle = getSessionStyle(session);
    // Remove 'style="' and the closing '"' to extract the inner style
    const styleContent = sessionStyle.replace('style="', '').slice(0, -1);

    return `
      <button class="class-filter-btn ${isActive ? 'active' : ''}" 
        data-session="${session}"
        style="${isActive ? '' : styleContent}">
        ${session}
      </button>
    `;
  }).join('');

  container.innerHTML = html;

  container.querySelectorAll('[data-session]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (onFilterChange) onFilterChange(btn.dataset.session);
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
            <!-- Row 1: Name & Roll -->
            <div class="student-name-block">
                <h3 class="student-name">${studentInfo.name}</h3>
                <span class="roll-badge">রোল: ${studentInfo.id}</span>
            </div>
            
            <!-- Row 2: Metadata & Context Info -->
            <div class="student-meta-row">
                <div class="student-meta-block">
                    <span class="badge badge-session" style="--session-color: ${sessionColor}">
                        <i class="fas fa-calendar-alt"></i> ${studentInfo.session || 'N/A'}
                    </span>
                    <span class="badge badge-group ${groupClass}">
                        ${getIconForGroup(studentInfo.group)} ${studentInfo.group}
                    </span>
                    <span class="badge badge-class">
                        <i class="fas fa-graduation-cap"></i> ${studentInfo.class || 'HSC'}
                    </span>
                    <span class="badge badge-exam-count">
                        <i class="fas fa-chart-line"></i> ${history.filter(h =>
    (!studentInfo.session || h.session === studentInfo.session) &&
    (!studentInfo.class || h.class === studentInfo.class)
  ).length
    } পরীক্ষা
                    </span>
                    
                    <!-- Dynamic Context Info (Now inline with badges) -->
                    <span id="analysisContextInfo" class="analysis-context-info"></span>
                </div>
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

  container.innerHTML = `<button class="search-close-btn" aria-label="বন্ধ করুন">&times;</button>` + candidates.map(c => {
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

  // Close button handler
  container.querySelector('.search-close-btn')?.addEventListener('click', () => {
    container.style.display = 'none';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
  });

  container.querySelectorAll('.candidate-card').forEach(item => {
    item.addEventListener('click', () => {
      const candidate = candidates.find(c => String(c.id) === item.dataset.id && c.group === item.dataset.group);
      if (onSelect) onSelect(candidate);
      container.style.display = 'none';
    });
  });
}
