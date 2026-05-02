/**
 * Marksheet Template B — Professional Academic Marksheet
 * Pixel-perfect clone of the reference design
 * 
 * This module ONLY handles HTML rendering.
 * All core calculation logic (GPA, grades, pass/fail, ranking, etc.)
 * is computed upstream in marksheetManager.js and passed via the `data` parameter.
 * 
 * @module marksheetTemplateB
 */

import { APP_VERSION } from '../version.js';
import { state } from './state.js';

/**
 * Render a single marksheet using Template B design
 * @param {Object} data - Pre-computed data from marksheetManager
 * @returns {string} HTML string
 */
export function renderTemplateB(data) {
    const {
        student,
        ms,            // marksheet settings
        examDisplayName,
        selectedSession,
        visibleSubjects,
        subjectRows,   // array of { name, mcq, cq, practical, total, grade, gp, isOptional, optionalBonus }
        grandTotal,
        maxGrand,
        avgGPA,
        overallGrade,
        allPassed,
        resultText,
        optionalBonusGP,
        tutorialExtraGP,
        tutIntEnabled,
        tutCount,
        totalTutorialEarnedPoints,
        history,
        studentRemark,
        uid,
        signaturesToRender,
        watermarkHtml,
        todayDate,
        isAbsentMark,
        attendanceStatus,
        failedSubjectsCount,
        exactRanks,
        apsData,
        progressEnabled,
        highestMarks,
        isCombinedMode,
        isIdSearch,
    } = data;

    const primaryColor = '#1E3A8A';
    const greenColor = '#16A34A';

    // Helpers
    const toBnNum = (num) => {
        const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return String(num).split('').map(c => bn[c] || c).join('');
    };

    const getGradeColorClass = (grade) => {
        if (grade === 'A+') return 'msb-g-aplus';
        if (grade === 'A') return 'msb-g-a';
        if (grade === 'A-') return 'msb-g-aminus';
        if (grade === 'B') return 'msb-g-b';
        if (grade === 'C') return 'msb-g-c';
        if (grade === 'D') return 'msb-g-d';
        if (grade === 'F') return 'msb-g-f';
        return '';
    };

    // Performance percentage from APS data if available
    const perfPctNum = apsData ? parseFloat(apsData.progressPercentage) || 0 : (maxGrand > 0 ? Math.round((grandTotal / maxGrand) * 100) : 0);
    const perfLabel = apsData ? apsData.grade : (perfPctNum >= 80 ? 'Excellent' : perfPctNum >= 60 ? 'Good Performance' : perfPctNum >= 40 ? 'Average' : 'Needs Improvement');
    const perfDisplay = apsData ? apsData.progressPercentage : `${perfPctNum}%`;

    // Stars for comment
    const starCount = perfPctNum >= 80 ? 5 : perfPctNum >= 60 ? 4 : perfPctNum >= 40 ? 3 : perfPctNum >= 20 ? 2 : 1;
    const starsHtml = '★'.repeat(starCount) + '☆'.repeat(5 - starCount);

    // Group color
    const groupColor = (() => {
        const g = (student.group || '').trim();
        const baseG = g.replace(/[\s\-_]*(গ্রুপ|Group)$/i, '').trim();
        return (ms.groupColorsEnabled && ms.groupColors)
            ? (ms.groupColors[g] || ms.groupColors[baseG] || primaryColor)
            : primaryColor;
    })();

    // Developer Credit
    const getDeveloperCreditHtml = () => {
        if (!state.developerCredit || state.developerCredit.enabled === false) return '';
        const text = state.developerCredit.text || '';
        const name = state.developerCredit.name || '';
        const link = state.developerCredit.link || '';
        if (!text && !name) return '';
        let content = `<span>${text} <strong>${name}</strong></span>`;
        if (link) {
            content += `<span style="margin: 0 6px; color: #cbd5e1;">|</span><a href="${link}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${link}</a>`;
        }
        return content;
    };

    // Rank display
    const classRankText = exactRanks?.classRank || '-';

    // Signature HTML
    const sigHtml = (signaturesToRender || []).map(sig =>
        `<div class="msb-sig-block">
            <div class="msb-sig-img-area">
                ${sig.url ? `<img src="${sig.url}" class="msb-sig-img" alt="Signature">` : ''}
            </div>
            <div class="msb-sig-line"></div>
            <span class="msb-sig-label">${sig.label}</span>
        </div>`
    ).join('');

    // Institution info
    const eiin = ms.institutionAddress ? ms.institutionAddress : '';

    // Build subject rows
    const tableRowsHtml = (subjectRows || []).map((row, idx) => {
        const isOpt = row.isOptional;
        const gradeClass = getGradeColorClass(row.grade);

        if (isOpt) {
            return `<tr class="msb-row-optional">
                <td colspan="2" class="msb-opt-name-cell">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="msb-opt-badge" style="flex-shrink: 0;"><i class="fas fa-book"></i> ঐচ্ছিক বিষয়</div>
                        <div style="display: flex; flex-direction: column; line-height: 1.3;">
                            <span class="msb-opt-subject" style="font-size: 0.8rem; font-weight: 700;">${row.name}</span>
                            <span style="font-size: 0.55rem; color: #94a3b8; font-weight: 500; white-space: nowrap;">${ms.boardStandardOptional ? 'বোর্ড স্ট্যন্ডার্ড' : 'সাধারণ বিষয় নীতি'}</span>
                        </div>
                    </div>
                </td>
                ${tutIntEnabled && tutCount > 0 ? (() => {
                        const tAvg = row.tutorialAvg || 0;
                        const point = row.tutorialEarnedPoint || 0;
                        const pointHtml = point > 0 ? `<span style="display: inline-flex; align-items: center; justify-content: center; color: #047857; font-size: 0.55rem; font-weight: 800; background: #ecfdf5; padding: 1.5px 4px; border-radius: 6px; border: 0.5px solid #6ee7b7; line-height: 1;">+${point}</span>` : '';
                        return `<td class="msb-td-num" style="padding: 0;">
                            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 24px; color:#6d28d9; font-weight:600; box-sizing: border-box;">
                                <div style="flex: 1; visibility: hidden;"></div>
                                <div style="flex: 0 1 auto; text-align: center; padding: 0 2px;">${tAvg > 0 ? tAvg : '-'}</div>
                                <div style="flex: 1; display: flex; justify-content: flex-end; padding-right: 3px;">${pointHtml}</div>
                            </div>
                        </td>`;
                    })() : ''}
                <td class="msb-td-num">${row.highestMark}</td>
                <td class="msb-td-num">${row.fullMarks}</td>
                <td class="msb-td-num ${row.mcqFail ? 'msb-mark-fail' : ''}">${row.mcq || '-'}</td>
                <td class="msb-td-num ${row.cqFail ? 'msb-mark-fail' : ''}">${row.cq || '-'}</td>
                <td class="msb-td-num ${row.pracFail ? 'msb-mark-fail' : ''}">${row.practical || '-'}</td>
                <td class="msb-td-num msb-td-total-mark">${row.total || 0}</td>
                <td class="msb-td-num ${gradeClass}">${row.grade}</td>
                <td class="msb-td-num" style="vertical-align: middle; text-align: center; padding: 4px;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.2;">
                        <span style="font-weight: 600; color: #64748b !important; font-size: 0.85rem; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${row.gp}</span>
                        <span style="font-size: 0.7rem; font-weight: 800; color: #16a34a !important; margin-top: 2px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">+${row.optionalBonus > 0 ? row.optionalBonus.toFixed(2) : '0.00'}</span>
                    </div>
                </td>
            </tr>`;
        }

        return `<tr>
            <td class="msb-td-num">${toBnNum(idx + 1)}</td>
            <td class="msb-td-subject">${row.name}</td>
            ${tutIntEnabled && tutCount > 0 ? (() => {
                        const tAvg = row.tutorialAvg || 0;
                        const point = row.tutorialEarnedPoint || 0;
                        const pointHtml = point > 0 ? `<span style="display: inline-flex; align-items: center; justify-content: center; color: #047857; font-size: 0.55rem; font-weight: 800; background: #ecfdf5; padding: 1.5px 4px; border-radius: 6px; border: 0.5px solid #6ee7b7; line-height: 1;">+${point}</span>` : '';
                        return `<td class="msb-td-num" style="padding: 0;">
                            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 24px; color:#6d28d9; font-weight:600; box-sizing: border-box;">
                                <div style="flex: 1; visibility: hidden;"></div>
                                <div style="flex: 0 1 auto; text-align: center; padding: 0 2px;">${tAvg > 0 ? tAvg : '-'}</div>
                                <div style="flex: 1; display: flex; justify-content: flex-end; padding-right: 3px;">${pointHtml}</div>
                            </div>
                        </td>`;
                    })() : ''}
            <td class="msb-td-num">${row.highestMark}</td>
            <td class="msb-td-num">${row.fullMarks}</td>
            <td class="msb-td-num ${row.mcqFail ? 'msb-mark-fail' : ''}">${row.mcq || '-'}</td>
            <td class="msb-td-num ${row.cqFail ? 'msb-mark-fail' : ''}">${row.cq || '-'}</td>
            <td class="msb-td-num ${row.pracFail ? 'msb-mark-fail' : ''}">${row.practical || '-'}</td>
            <td class="msb-td-num msb-td-total-mark">${row.total || 0}</td>
            <td class="msb-td-num ${gradeClass}">${row.grade}</td>
            <td class="msb-td-num">${row.gp}</td>
        </tr>`;
    }).join('');

    // History table
    const showSummaryClassRank = ms.showSummaryClassRank !== false;
    const showSummaryGroupRank = ms.showSummaryGroupRank !== false;
    const showClassRank = ms.showClassRank !== false;
    const showGroupRank = ms.showGroupRank !== false;

    const getRankText = (rankVal) => {
        if (rankVal === 'মেধাক্রম নেই' || rankVal === '-' || !rankVal) return '-';
        if (typeof rankVal === 'string' && /[মর্থষ্ঠ]/.test(rankVal)) return rankVal;

        let engStr = String(rankVal);
        const bnToEn = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
        engStr = engStr.replace(/[০-৯]/g, c => bnToEn[c] || c);
        const eng = parseInt(engStr, 10);

        if (isNaN(eng)) return rankVal;
        if (eng === 1) return '১ম';
        if (eng === 2) return '২য়';
        if (eng === 3) return '৩য়';
        if (eng === 4) return '৪র্থ';
        if (eng === 5) return '৫ম';
        if (eng === 6) return '৬ষ্ঠ';
        if (eng === 7) return '৭ম';
        if (eng === 8) return '৮ম';
        if (eng === 9) return '৯ম';
        if (eng === 10) return '১০ম';
        return `${toBnNum(eng)}তম`;
    };

    let historyThHtml = `
        <th style="text-align:left;">পরীক্ষার নাম</th>
        <th style="text-align:center;">GPA</th>`;
    if (showClassRank) historyThHtml += `<th style="text-align:center;">মেধাক্রম (C)</th>`;
    if (showGroupRank) historyThHtml += `<th style="text-align:center;">মেধাক্রম (G)</th>`;

    const historyHtml = (history || []).map(h => {
        let tdHtml = `
            <td style="text-align:left; font-size: 0.72rem; padding: 5px 8px; white-space: normal; word-break: break-word;">${h.name}</td>
            <td style="text-align:center; font-weight: 700; font-size: 0.8rem;">${h.gpa}</td>`;
        if (showClassRank) tdHtml += `<td style="text-align:center; font-size: 0.75rem; font-weight: 600; color: #475569;">${getRankText(h.rank)}</td>`;
        if (showGroupRank) tdHtml += `<td style="text-align:center; font-size: 0.75rem; font-weight: 600; color: #475569;">${getRankText(h.groupRank)}</td>`;
        return `<tr>${tdHtml}</tr>`;
    }).join('');

    const historyColCount = 2 + (showClassRank ? 1 : 0) + (showGroupRank ? 1 : 0);

    // Section Toggles
    const showRanking = (ms.showRanking !== false) && !(isIdSearch && ms.idSearchShowRanking === false);
    const showPerformance = progressEnabled;
    const showComments = (ms.showComments !== false) && !(isIdSearch && ms.idSearchShowComments === false);
    const showQRCode = (ms.showQRCode !== false) && !(isIdSearch && ms.idSearchShowQRCode === false);

    // Note: showClassRank and showGroupRank are already declared above for the history table logic

    let activeCards = 0;
    if (showRanking) activeCards++;
    if (showPerformance) activeCards++;
    if (showComments) activeCards++;

    // If there is an empty slot in the grid (less than 3 cards) and QR is enabled, put QR in the grid
    const putQrInGrid = showQRCode && activeCards < 3;

    // Build complete HTML
    return `
    <div class="msb-page" 
         id="ms_page_${student.id}_${student.group}"
         data-student-id="${student.id}"
         data-student-group="${student.group}"
         data-is-absent="${isAbsentMark}"
         style="--msb-primary: ${groupColor};">
        
        <div class="ms-actions-float no-print">
            <button class="ms-btn-action ms-btn-print-single" onclick="window.printSingleMarksheet('ms_page_${student.id}_${student.group}')">
                <i class="fas fa-print"></i> প্রিন্ট
            </button>
        </div>

        <div class="msb-frame">
            ${watermarkHtml ? `<div class="msb-watermark">${watermarkHtml}</div>` : ''}

            <!-- ===== HEADER SECTION ===== -->
            <div class="msb-header">
                <div class="msb-header-left">
                    ${ms.watermarkUrl
            ? `<img src="${ms.watermarkUrl}" class="msb-logo" alt="Logo">`
            : `<div class="msb-logo-placeholder"><i class="fas fa-graduation-cap"></i></div>`
        }
                </div>
                <div class="msb-header-center">
                    <h1 class="msb-inst-name">${ms.institutionName || 'প্রতিষ্ঠানের নাম'}</h1>
                    <p class="msb-inst-address">${eiin}</p>
                </div>
                <div class="msb-header-right">
                    <div class="msb-id-box">
                        <span class="msb-id-label">ID No.</span>
                        <span class="msb-id-value">${uid || '-'}</span>
                    </div>
                    <div class="msb-date-box">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${ms.footerPubDate || todayDate}</span>
                    </div>
                </div>
            </div>
            <div class="msb-header-divider"></div>

            <!-- ===== TITLE SECTION ===== -->
            <div class="msb-title-section">
                <h2 class="msb-title">${ms.headerLine1 || 'পরীক্ষার ফলাফল মার্ক শীট'}</h2>
                <p class="msb-subtitle">${examDisplayName} (${selectedSession})</p>
            </div>

            <!-- ===== STUDENT INFO + RESULT SUMMARY ===== -->
            <div class="msb-info-result-grid">
                <!-- Student Info Card -->
                <div class="msb-student-card">
                    <div class="msb-student-photo-area">
                        ${student.photoUrl
            ? `<img src="${student.photoUrl}" class="msb-student-photo" alt="Photo">`
            : `<div class="msb-photo-placeholder"><i class="fas fa-user"></i></div>`
        }
                    </div>
                    <div class="msb-student-details">
                        <div class="msb-detail-row">
                            <i class="fas fa-user"></i>
                            <span class="msb-detail-label">নাম</span>
                            <span class="msb-detail-sep">:</span>
                            <span class="msb-detail-value">${student.name}</span>
                        </div>
                        <div class="msb-detail-row">
                            <i class="fas fa-id-badge"></i>
                            <span class="msb-detail-label">রোল</span>
                            <span class="msb-detail-sep">:</span>
                            <span class="msb-detail-value">${student.id}</span>
                        </div>
                        <div class="msb-detail-row">
                            <i class="fas fa-chalkboard"></i>
                            <span class="msb-detail-label">শ্রেণি</span>
                            <span class="msb-detail-sep">:</span>
                            <span class="msb-detail-value">${student.class}</span>
                        </div>
                        <div class="msb-detail-row">
                            <i class="fas fa-layer-group"></i>
                            <span class="msb-detail-label">বিভাগ</span>
                            <span class="msb-detail-sep">:</span>
                            <span class="msb-detail-value">${student.group || '-'}</span>
                        </div>
                        <div class="msb-detail-row">
                            <i class="fas fa-calendar-check"></i>
                            <span class="msb-detail-label">শিক্ষাবর্ষ</span>
                            <span class="msb-detail-sep">:</span>
                            <span class="msb-detail-value">${student.session}</span>
                        </div>
                    </div>
                </div>

                <!-- Result Summary -->
                <div class="msb-result-summary">
                    <div class="msb-summary-title" style="display: flex; justify-content: space-between; align-items: center;">
                        <span>ফলাফল সারাংশ</span>
                        ${(showSummaryClassRank || showSummaryGroupRank) ? `
                        <div style="display: flex; gap: 8px;">
                            ${showSummaryClassRank ? `<span class="msb-rank-badge" style="background: #e0e7ff; color: #4f46e5; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"><i class="fas fa-users"></i> শ্রেণি র‍্যাঙ্ক : ${exactRanks?.classRank || '-'}</span>` : ''}
                            ${showSummaryGroupRank ? `<span class="msb-rank-badge" style="background: #ffffff; color: ${groupColor} !important; border: 1px solid ${groupColor} !important; padding: 1px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"><i class="fas fa-layer-group"></i> গ্রুপ র‍্যাঙ্ক : ${exactRanks?.groupRank || '-'}</span>` : ''}
                        </div>` : ''}
                    </div>
                    <div class="msb-summary-boxes">
                        <div class="msb-sum-box msb-box-gpa">
                            <span class="msb-sum-label">GPA</span>
                            <span class="msb-sum-value">${avgGPA}</span>
                        </div>
                        <div class="msb-sum-box msb-box-grade">
                            <span class="msb-sum-label">লেটার গ্রেড</span>
                            <span class="msb-sum-value">${overallGrade}</span>
                        </div>
                        <div class="msb-sum-box ${allPassed ? 'msb-box-pass' : 'msb-box-fail'}">
                            <span class="msb-sum-label">ফলাফল</span>
                            <span class="msb-sum-value msb-sum-result">${resultText} ${allPassed ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>'}</span>
                        </div>
                    </div>
                    <div class="msb-summary-details">
                        ${tutIntEnabled && tutCount > 0 && totalTutorialEarnedPoints > 0 ? `
                        <div class="msb-sum-detail">
                            <i class="fas fa-book-reader" style="color: #7c3aed !important; -webkit-text-fill-color: #7c3aed !important;"></i>
                            <span>টিউটোরিয়াল পয়েন্ট</span>
                            <strong style="color: #7c3aed !important; -webkit-text-fill-color: #7c3aed !important;">+${tutorialExtraGP.toFixed(2)}</strong>
                        </div>` : ''}
                        ${optionalBonusGP > 0 ? `
                        <div class="msb-sum-detail">
                            <i class="fas fa-star" style="color: #16A34A !important; -webkit-text-fill-color: #16A34A !important;"></i>
                            <span>ঐচ্ছিক পয়েন্ট</span>
                            <strong style="color: #16A34A !important; -webkit-text-fill-color: #16A34A !important;">+${optionalBonusGP.toFixed(2)}</strong>
                        </div>` : ''}
                        <div class="msb-sum-detail">
                            <i class="fas fa-user-clock" style="color: ${attendanceStatus === 'উপস্থিত' ? '#2563eb' : (attendanceStatus === 'আংশিক উপস্থিত' ? '#d97706' : '#dc2626')} !important; -webkit-text-fill-color: ${attendanceStatus === 'উপস্থিত' ? '#2563eb' : (attendanceStatus === 'আংশিক উপস্থিত' ? '#d97706' : '#dc2626')} !important;"></i>
                            <span>উপস্থিতি</span>
                            <strong style="color: ${attendanceStatus === 'উপস্থিত' ? '#2563eb' : (attendanceStatus === 'আংশিক উপস্থিত' ? '#d97706' : '#dc2626')} !important; -webkit-text-fill-color: ${attendanceStatus === 'উপস্থিত' ? '#2563eb' : (attendanceStatus === 'আংশিক উপস্থিত' ? '#d97706' : '#dc2626')} !important;">${attendanceStatus || 'উপস্থিত'}</strong>
                        </div>
                        ${(() => {
                            let detailCount = 1;
                            if (tutIntEnabled && tutCount > 0 && totalTutorialEarnedPoints > 0) detailCount++;
                            if (optionalBonusGP > 0) detailCount++;
                            const isAlone = detailCount % 2 === 0;
                            const failColor = failedSubjectsCount > 0 ? '#dc2626' : '#16A34A';
                            const failText = failedSubjectsCount > 0 ? `${toBnNum(failedSubjectsCount)} বিষয়ে ফেল` : 'সব বিষয়ে উত্তীর্ণ';
                            return `<div class="msb-sum-detail" style="display: flex; align-items: center; justify-content: center; gap: 5px;${isAlone ? ' grid-column: 1 / -1;' : ''}">
                                <i class="fas fa-exclamation-circle" style="color: ${failColor} !important; -webkit-text-fill-color: ${failColor} !important; margin-top: 2px;"></i>
                                <strong style="color: ${failColor} !important; -webkit-text-fill-color: ${failColor} !important; line-height: 1;">${failText}</strong>
                        </div>`;
                        })()}
                    </div>
                </div>
            </div>

            <!-- ===== SUBJECT TABLE ===== -->
            <div class="msb-table-section">
                <div class="msb-table-title-wrapper">
                    <div class="msb-table-title">বিষয়ভিত্তিক প্রাপ্ত নম্বর</div>
                </div>
                <table class="msb-table">
                    <thead>
                        <tr>
                            <th class="msb-th-sl">ক্র.</th>
                            <th class="msb-th-subject">বিষয়ের নাম</th>
                            ${(tutIntEnabled && tutCount > 0) ? `<th class="msb-th-num" style="width: 60px; line-height: 1.2;">টি.গড়<br><span style="font-size: 0.65rem; color: #4b5563; font-weight: 500;">(${toBnNum(tutCount)}টি)</span></th>` : ''}
                            <th class="msb-th-num">সর্বোচ্চ</th>
                            <th class="msb-th-num">পূর্ণমান</th>
                            <th class="msb-th-num">MCQ</th>
                            <th class="msb-th-num">CQ</th>
                            <th class="msb-th-num">Practical</th>
                            <th class="msb-th-num">মোট</th>
                            <th class="msb-th-num">গ্রেড</th>
                            <th class="msb-th-num">গ্রেড পয়েন্ট</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- ===== TOTAL SECTION ===== -->
            <div class="msb-total-section">
                <div class="msb-total-block msb-tb-main">
                    <i class="fas fa-clipboard-list"></i>
                    <span class="msb-tb-label">সর্বমোট প্রাপ্ত নম্বর</span>
                </div>
                <div class="msb-tb-divider"></div>
                <div class="msb-total-block msb-tb-marks">
                    <span class="msb-tb-val-large">${grandTotal}</span>
                    <span class="msb-tb-val-small">/ ${maxGrand}</span>
                </div>
                <div class="msb-tb-divider"></div>
                <div class="msb-total-block msb-tb-grade">
                    <span class="msb-tb-label">লেটার গ্রেড</span>
                    <span class="msb-tb-val-grade ${getGradeColorClass(overallGrade)}">${overallGrade}</span>
                </div>
                <div class="msb-tb-divider"></div>
                <div class="msb-total-block msb-tb-gpa">
                    <span class="msb-tb-label">GPA</span>
                    <span class="msb-tb-val-gpa">${avgGPA}</span>
                </div>
            </div>

            <!-- ===== BOTTOM 3 CARDS ===== -->
            <div class="msb-bottom-grid">
                <!-- History -->
                ${(() => {
            if (!showRanking) return '';
            return `
                <div class="msb-bottom-card">
                    <div class="msb-bottom-card-title"><i class="fas fa-history"></i> ফলাফলের ইতিহাস ও মেধাক্রম</div>
                    <table class="msb-history-table">
                        <thead>
                            <tr>
                                ${historyThHtml}
                            </tr>
                        </thead>
                        <tbody>
                            ${historyHtml || `<tr><td colspan="${historyColCount}" style="text-align:center; color:#94a3b8; padding:12px; font-style:italic;">কোনো ইতিহাস নেই</td></tr>`}
                        </tbody>
                    </table>
                </div>`;
        })()}

                <!-- Performance Circle -->
                ${(() => {
            if (!showPerformance) return '';
            return `
                <div class="msb-bottom-card msb-perf-card">
                    <div class="msb-bottom-card-title"><i class="fas fa-chart-pie"></i> পারফরমান্স বিশ্লেষণ</div>
                    <div class="msb-perf-circle-wrapper">
                        <div class="msb-perf-circle" style="--msb-perf-pct: ${perfPctNum};">
                            <svg viewBox="0 0 120 120" class="msb-perf-svg">
                                <circle cx="60" cy="60" r="54" class="msb-perf-bg"></circle>
                                <circle cx="60" cy="60" r="54" class="msb-perf-fill" style="stroke-dashoffset: ${339.3 - (339.3 * perfPctNum / 100)};"></circle>
                            </svg>
                            <div class="msb-perf-text" style="font-size: 1.15rem;">${perfDisplay}</div>
                        </div>
                        <div class="msb-perf-sub">পারফরমান্স লেভেল</div>
                        <div class="msb-perf-badge">${perfLabel} <i class="fas fa-thumbs-up"></i></div>
                    </div>
                </div>`;
        })()}

                <!-- Comments -->
                ${(() => {
            if (!showComments) return '';
            return `
                <div class="msb-bottom-card msb-comment-card">
                    <div class="msb-bottom-card-title"><i class="fas fa-comment-dots"></i> মন্তব্য</div>
                    <div class="msb-comment-body">
                        <div class="msb-comment-text">${studentRemark}</div>
                        <div class="msb-comment-stars">${starsHtml}</div>
                    </div>
                </div>`;
        })()}



                <!-- QR Code (if in grid) -->
                ${(() => {
            if (!putQrInGrid) return '';
            return `
                <div class="msb-bottom-card msb-qr-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                    <div style="font-size: 0.72rem; font-weight: 700; color: var(--msb-primary);"><i class="fas fa-qrcode"></i> ফলাফল যাচাই করুন</div>
                    <canvas class="ms-mr-qr-canvas" data-uid="${uid}" data-exam="${examDisplayName}" data-name="${student.name}" style="max-height: 80px;"></canvas>
                    <div style="font-size: 0.65rem; color: #64748b; font-weight: 600;">@ ${window.location.hostname}</div>
                </div>`;
        })()}
            </div>

            <!-- ===== FOOTER ===== -->
            <div class="msb-footer-section">
                <div class="msb-footer-row">
                    ${(!putQrInGrid && showQRCode) ? `
                    <div class="msb-footer-qr">
                        <canvas class="ms-mr-qr-canvas" data-uid="${uid}" data-exam="${examDisplayName}" data-name="${student.name}"></canvas>
                        <div class="msb-qr-info">
                            <div class="msb-qr-scan-text">ফলাফল যাচাই করুন</div>
                            <div class="msb-qr-scan-text">- Scan QR Code</div>
                            <div class="msb-qr-link">@ ${window.location.hostname}</div>
                        </div>
                    </div>` : ''}
                    <div class="msb-footer-signatures" style="display: grid; grid-template-columns: repeat(${(signaturesToRender || []).length || 2}, 1fr); width: 100%; justify-items: center; gap: 20px; padding: 0 15px;">
                        ${sigHtml}
                    </div>
                </div>
                <div class="msb-footer-bottom">
                    <div class="msb-footer-gen">
                        <i class="fas fa-clock"></i>
                        Generated: ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </div>
                    <div class="msb-footer-dev">
                        ${ms.footerDevName
            ? (ms.footerDevLink
                ? `<a href="${ms.footerDevLink}" target="_blank" rel="noopener noreferrer">${ms.footerDevName}</a>`
                : ms.footerDevName)
            : getDeveloperCreditHtml()
        }
                    </div>
                    <div class="msb-footer-verify">
                        Verify this result at:<br>
                        <a href="https://${window.location.hostname}" target="_blank">${window.location.hostname}</a>
                    </div>
                    <div class="msb-footer-version">V${APP_VERSION}</div>
                </div>
            </div>

            <!--EXAM_SUMMARY_PLACEHOLDER-->

        </div>
    </div>`;
}
