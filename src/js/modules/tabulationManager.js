/**
 * Tabulation Sheet Manager Module
 * Public-facing tabulation sheet for viewing exam results in a detailed table format.
 * Data is sourced from saved exams (same as marksheet) ensuring 100% data parity.
 * @module tabulationManager
 */

import {
    getSavedExams,
    getExamsByCriteria,
    getSubjectConfigs,
    getStudentLookupMap,
    generateStudentDocId
} from '../firestoreService.js';
import { state } from './state.js';
import { showNotification, convertToEnglishDigits, convertToBengaliDigits, normalizeText } from '../utils.js';
import { loadMarksheetRules, currentMarksheetRules } from './marksheetRulesManager.js';
import { loadMarksheetSettings, getMarksheetSettings } from './marksheetManager.js';

// ==========================================
// MODULE STATE
// ==========================================
let hideNames = false;
let currentTabulationData = null;
let allExamsCache = null;

// ==========================================
// INITIALIZATION
// ==========================================
let stickyObserver = null;
let stickyScrollHandler = null;
let stickyResizeHandler = null;

export async function initTabulationManager() {
    setupEventListeners();
    await populateTabulationDropdowns();
    console.log('[TabulationManager] Initialized');
}

function setupEventListeners() {
    const viewBtn = document.getElementById('tabViewBtn');
    if (viewBtn) viewBtn.addEventListener('click', handleViewTabulation);

    const printBtn = document.getElementById('tabPrintBtn');
    if (printBtn) printBtn.addEventListener('click', handlePrint);

    const toggleNameBtn = document.getElementById('tabToggleNames');
    if (toggleNameBtn) {
        toggleNameBtn.addEventListener('click', () => {
            hideNames = !hideNames;
            const table = document.getElementById('tabulationTable');
            if (table) table.classList.toggle('tab-hide-names', hideNames);
            toggleNameBtn.innerHTML = `<i class="fas ${hideNames ? 'fa-eye' : 'fa-eye-slash'}"></i> ${hideNames ? 'নাম দেখান' : 'নাম লুকান'}`;
            toggleNameBtn.classList.toggle('active', hideNames);
        });
    }

    const searchInput = document.getElementById('tabSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterTabulationTable);
    }

    const advType = document.getElementById('tabAdvFilterType');
    const advOp = document.getElementById('tabFilterOperator');
    const advNum = document.getElementById('tabFilterNumVal');
    const advEnum = document.getElementById('tabFilterEnumVal');
    const sortOrder = document.getElementById('tabSortOrder');
    const applyBtn = document.getElementById('tabApplyFilterBtn');
    const resetBtn = document.getElementById('tabResetFilterBtn');

    if (advType) {
        advType.addEventListener('change', () => {
            const v = advType.value;
            const numericGroup = document.getElementById('tabFilterNumericGroup');

            if (numericGroup) numericGroup.style.display = 'none';
            if (advEnum) advEnum.style.display = 'none';
            if (sortOrder) sortOrder.style.display = (v !== 'none') ? 'block' : 'none';
            if (resetBtn) resetBtn.style.display = (v !== 'none') ? 'block' : 'none';
            if (applyBtn) applyBtn.style.display = (v !== 'none') ? 'block' : 'none';

            if (v === 'gpa' || v === 'marks' || v === 'cq' || v === 'mcq') {
                if (numericGroup) numericGroup.style.display = 'flex';
            } else if (v === 'result') {
                if (advEnum) {
                    advEnum.innerHTML = '<option value="all">সকল ফলাফল</option><option value="pass">পাশ</option><option value="fail">ফেল</option>';
                    advEnum.style.display = 'block';
                }
            } else if (v === 'status') {
                if (advEnum) {
                    advEnum.innerHTML = '<option value="all">সকল স্ট্যাটাস</option><option value="উপস্থিত">উপস্থিত</option><option value="আংশিক উপস্থিত">আংশিক উপস্থিত</option><option value="অনুপস্থিত">অনুপস্থিত</option>';
                    advEnum.style.display = 'block';
                }
            }
            filterTabulationTable();
        });
    }

    [advOp, advNum, advEnum, sortOrder].forEach(el => {
        if (el) el.addEventListener('change', filterTabulationTable);
    });
    if (advNum) advNum.addEventListener('input', filterTabulationTable);
    if (applyBtn) applyBtn.addEventListener('click', filterTabulationTable);

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const numericGroup = document.getElementById('tabFilterNumericGroup');
            if (advType) advType.value = 'none';
            if (advOp) advOp.value = '>';
            if (advNum) advNum.value = '';
            if (advEnum) advEnum.value = 'all';
            if (sortOrder) sortOrder.value = 'desc';

            if (numericGroup) numericGroup.style.display = 'none';
            if (advEnum) advEnum.style.display = 'none';
            if (sortOrder) sortOrder.style.display = 'none';
            if (resetBtn) resetBtn.style.display = 'none';
            if (applyBtn) applyBtn.style.display = 'none';

            filterTabulationTable();
        });
    }

    // Cascading dropdowns
    const classSelect = document.getElementById('tabClass');
    const sessionSelect = document.getElementById('tabSession');
    const groupSelect = document.getElementById('tabGroup');
    if (classSelect) classSelect.addEventListener('change', () => { updateGroupDropdown(); updateExamDropdown(); });
    if (sessionSelect) sessionSelect.addEventListener('change', () => { updateGroupDropdown(); updateExamDropdown(); });
}

// ==========================================
// DROPDOWN POPULATION
// ==========================================
export async function populateTabulationDropdowns() {
    const classSelect = document.getElementById('tabClass');
    const sessionSelect = document.getElementById('tabSession');
    if (!classSelect || !sessionSelect) return;

    try {
        allExamsCache = await getSavedExams();
        const classes = [...new Set(allExamsCache.map(e => e.class).filter(Boolean))].sort();
        const sessions = [...new Set(allExamsCache.map(e => e.session).filter(Boolean))].sort().reverse();

        classSelect.innerHTML = '<option value="">শ্রেণি নির্বাচন</option>';
        classes.forEach(c => classSelect.innerHTML += `<option value="${c}">${c}</option>`);

        sessionSelect.innerHTML = '<option value="">সেশন নির্বাচন</option>';
        sessions.forEach(s => sessionSelect.innerHTML += `<option value="${s}">${s}</option>`);

        updateExamDropdown();
    } catch (err) {
        console.error('[Tabulation] Dropdown population failed:', err);
    }
}

async function updateGroupDropdown() {
    const cls = document.getElementById('tabClass')?.value;
    const session = document.getElementById('tabSession')?.value;
    const groupSelect = document.getElementById('tabGroup');
    if (!groupSelect) return;

    if (!cls || !session) {
        groupSelect.innerHTML = '<option value="all">সকল বিভাগ (সমন্বিত)</option>';
        return;
    }

    try {
        const exams = (allExamsCache || await getSavedExams()).filter(e => e.class === cls && e.session === session);
        const groupSet = new Set();
        exams.forEach(ex => {
            (ex.studentData || []).forEach(s => {
                if (s.group && s.group.trim()) groupSet.add(s.group.trim());
            });
        });

        const groups = [...groupSet].sort();

        groupSelect.innerHTML = '<option value="all">সকল বিভাগ (সমন্বিত)</option>';
        groups.forEach(g => {
            groupSelect.innerHTML += `<option value="${g}">${g}</option>`;
        });
    } catch (err) {
        console.error('Group dropdown failed:', err);
    }
}

async function updateExamDropdown() {
    const examSelect = document.getElementById('tabExam');
    if (!examSelect) return;

    const cls = document.getElementById('tabClass')?.value;
    const session = document.getElementById('tabSession')?.value;

    if (!cls || !session) {
        examSelect.innerHTML = '<option value="">প্রথমে শ্রেণি ও সেশন নির্বাচন করুন</option>';
        examSelect.disabled = true;
        return;
    }

    examSelect.disabled = false;
    const exams = (allExamsCache || await getSavedExams())
        .filter(e => e.class === cls && e.session === session);
    const examNames = [...new Set(exams.map(e => e.name).filter(Boolean))].sort();

    examSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন করুন</option>';
    examNames.forEach(name => {
        examSelect.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

// ==========================================
// MAIN VIEW HANDLER
// ==========================================
async function handleViewTabulation() {
    const cls = document.getElementById('tabClass')?.value;
    const session = document.getElementById('tabSession')?.value;
    const examName = document.getElementById('tabExam')?.value;
    const selGroup = document.getElementById('tabGroup')?.value || 'all';

    if (!cls || !session || !examName) {
        showNotification('শ্রেণি, সেশন ও পরীক্ষা নির্বাচন করুন', 'error');
        return;
    }

    const container = document.getElementById('tabulationContent');
    const emptyState = document.getElementById('tabEmptyState');
    if (!container) return;

    container.innerHTML = '<div class="tab-loading"><i class="fas fa-spinner fa-spin"></i> টেবুলেশন শীট তৈরি হচ্ছে...</div>';
    if (emptyState) emptyState.style.display = 'none';
    container.style.display = 'block';

    try {
        await loadMarksheetSettings();
        await loadMarksheetRules();
        const subjectConfigs = await getSubjectConfigs();
        const lookupMap = await getStudentLookupMap();

        // Fetch all exams for this class/session/examName
        const allExams = allExamsCache || await getSavedExams();
        const relevantExams = allExams.filter(e =>
            e.class === cls && e.session === session && e.name === examName
        );

        if (relevantExams.length === 0) {
            container.innerHTML = '<div class="tab-empty-msg"><i class="fas fa-inbox"></i> কোনো ডেটা পাওয়া যায়নি।</div>';
            return;
        }

        // Aggregate students
        const studentMap = new Map();

        relevantExams.forEach(exam => {
            const subject = exam.subject || '';

            (exam.studentData || []).forEach(s => {
                const sRoll = convertToEnglishDigits(String(s.id || '').trim().replace(/^0+/, '')) || '0';

                // Get the most accurate group from the master student lookup map
                const tempStudentKey = generateStudentDocId({ id: s.id, group: s.group || '', class: cls, session });
                const latestDoc = lookupMap.get(tempStudentKey);
                const actualGroup = latestDoc && latestDoc.group ? latestDoc.group : (s.group || '');

                const sGroup = normalizeText(actualGroup);
                const key = `${sRoll}_${sGroup}`;

                // Filter by group if selected
                if (selGroup !== 'all') {
                    const normSelGroup = normalizeText(selGroup);
                    // Strictly match, avoiding empty string substring matching
                    const isMatch = sGroup === normSelGroup ||
                        (sGroup && sGroup.includes(normSelGroup)) ||
                        (sGroup && normSelGroup.includes(sGroup));

                    if (!isMatch) {
                        return; // Skip student if they don't match the selected group
                    }
                }

                if (!studentMap.has(key)) {
                    if (latestDoc && (latestDoc.status === false || String(latestDoc.status) === 'false')) return;

                    studentMap.set(key, {
                        id: s.id,
                        name: latestDoc ? (latestDoc.name || s.name) : s.name,
                        group: actualGroup || '—',
                        section: s.section || latestDoc?.section || '',
                        subjects: {},
                        lastUpdated: null
                    });
                }

                const student = studentMap.get(key);
                if (!student) return;

                const hasMarks = (s.written > 0) || (s.mcq > 0) || (s.practical > 0) || (s.total > 0);
                const subjData = {
                    written: s.written,
                    mcq: s.mcq,
                    practical: s.practical,
                    total: s.total,
                    grade: s.grade || '',
                    status: s.status || ''
                };

                // Track update date
                if (exam.updatedAt || exam.createdAt) {
                    const dateVal = exam.updatedAt || exam.createdAt;
                    let ts = null;
                    try {
                        if (dateVal?.toDate) {
                            ts = dateVal.toDate();
                        } else if (typeof dateVal === 'object' && (dateVal.seconds || dateVal._seconds)) {
                            ts = new Date((dateVal.seconds || dateVal._seconds) * 1000);
                        } else {
                            ts = new Date(dateVal);
                        }
                    } catch (e) { }

                    if (ts && !isNaN(ts.getTime())) {
                        if (!student.lastUpdated || ts > student.lastUpdated) {
                            student.lastUpdated = ts;
                        }
                    }
                }

                const existing = student.subjects[subject];
                if (!existing || hasMarks) {
                    student.subjects[subject] = subjData;
                }
            });
        });

        // After filtering students, build subjectsSet dynamically ONLY based on what these students took
        const rawSubjectsSet = new Set();
        const students = [...studentMap.values()].sort((a, b) => {
            const ra = parseInt(convertToEnglishDigits(String(a.id))) || 0;
            const rb = parseInt(convertToEnglishDigits(String(b.id))) || 0;
            return ra - rb;
        });

        students.forEach(st => {
            Object.keys(st.subjects).forEach(subj => rawSubjectsSet.add(subj));
        });

        const rules = currentMarksheetRules[cls] || currentMarksheetRules['All'] || {};
        const generalSubjects = rules.generalSubjects || [];
        const groupSubjectsObj = rules.groupSubjects || {};
        const optionalSubjectsObj = rules.optionalSubjects || {};

        const subjectsSet = new Set();

        if (selGroup === 'all') {
            // For 'all', collect allowed subjects from ALL groups
            const allAllowed = new Set(generalSubjects.map(s => normalizeText(s)));
            Object.values(groupSubjectsObj).flat().forEach(s => allAllowed.add(normalizeText(s)));
            Object.values(optionalSubjectsObj).flat().forEach(s => allAllowed.add(normalizeText(s)));

            rawSubjectsSet.forEach(s => {
                const normS = normalizeText(s);
                if (allAllowed.has(normS)) {
                    subjectsSet.add(s);
                }
            });
        } else {
            const normSel = normalizeText(selGroup);
            const findGroup = (obj) => Object.keys(obj).find(k => normalizeText(k) === normSel || normalizeText(k).includes(normSel) || normSel.includes(normalizeText(k)));

            const gKey = findGroup(groupSubjectsObj);
            const oKey = findGroup(optionalSubjectsObj);

            const allowedGroupSubs = gKey ? groupSubjectsObj[gKey] : [];
            const allowedOptSubs = oKey ? optionalSubjectsObj[oKey] : [];

            const allowedSet = new Set([...generalSubjects, ...allowedGroupSubs, ...allowedOptSubs].map(s => normalizeText(s)));

            rawSubjectsSet.forEach(s => {
                const normS = normalizeText(s);
                // STRICTLY adhere to marksheet rules. If a subject isn't in the rules for this group, it's completely ignored.
                if (allowedSet.has(normS)) {
                    subjectsSet.add(s);
                }
            });
        }

        let subjects = [...subjectsSet].sort((a, b) => {
            const getScore = (sub) => {
                if (generalSubjects.includes(sub)) return 1000 + generalSubjects.indexOf(sub);

                // Check if group subject
                for (const g of Object.values(groupSubjectsObj)) {
                    if (g.includes(sub)) return 2000;
                }

                // Check if optional
                for (const o of Object.values(optionalSubjectsObj)) {
                    if (o.includes(sub)) return 5000;
                }

                return 3000; // Unknown
            };
            return getScore(a) - getScore(b);
        });

        // Calculate pass/fail for each student
        // rules already defined above

        students.forEach(st => {
            let totalMarks = 0, totalObtained = 0, failedSubjects = 0, presentSubjects = 0;
            let compulsoryGP = 0;
            let compulsoryCount = 0;
            let optionalBonusGP = 0;
            let hasOptionalTaken = false;

            const msSettings = getMarksheetSettings() || {};
            const boardStandard = msSettings.boardStandardOptional === true;
            // The critical subjectMapping from marksheet settings (roll-based per-subject mapping)
            const subjectMapping = msSettings.subjectMapping || [];

            const studentGroup = st.group || '';
            
            // Build the specific allowed subjects set for THIS student's group
            const generalSubjects = rules?.generalSubjects || [];
            const groupSubjectsObj = rules?.groupSubjects || {};
            const optionalSubsObj = rules?.optionalSubjects || {};
            const norm = normalizeText;
            
            const gKey = Object.keys(groupSubjectsObj).find(k => norm(k) === norm(studentGroup) || norm(k).includes(norm(studentGroup)) || norm(studentGroup).includes(norm(k))) || studentGroup;
            const oKey = Object.keys(optionalSubsObj).find(k => norm(k) === norm(studentGroup) || norm(k).includes(norm(studentGroup)) || norm(studentGroup).includes(norm(k))) || studentGroup;
            
            const allowedGroupSubs = gKey ? groupSubjectsObj[gKey] : [];
            const allowedOptSubs = oKey ? optionalSubsObj[oKey] : [];
            const allowedSet = new Set([...generalSubjects, ...allowedGroupSubs, ...allowedOptSubs].map(s => norm(s)));

            const optSubs = allowedOptSubs.map(os => norm(os));

            // IDENTICAL to marksheet checkMarks: determines if a student is eligible for a subject
            const checkStudentHasSubject = (subjName) => {
                const cleanName = norm(subjName).replace(/\[.*?\]/g, '').replace(/\s+/g, '');
                const sRoll = String(st.id || '').trim().replace(/^0+/, '');
                const sGroupNorm = norm(studentGroup);

                const thisSubMap = subjectMapping.find(m => {
                    const mapSubNorm = norm(m.subject).replace(/\[.*?\]/g, '').replace(/\s+/g, '');
                    const mapGroupNorm = norm(m.group || '');
                    return mapSubNorm === cleanName &&
                        (sGroupNorm.includes(mapGroupNorm) || mapGroupNorm.includes(sGroupNorm) || mapGroupNorm === '');
                });

                if (thisSubMap) {
                    // If a mapping exists, student MUST be in the roll list
                    return thisSubMap.rolls.map(r => String(r).replace(/^0+/, '')).includes(sRoll);
                }

                // No mapping exists → rely on exam data (actual marks or explicit absent status)
                const d = st.subjects[subjName];
                if (d) {
                    const hasActualMarks = (d.written !== undefined && d.written !== '') ||
                                          (d.mcq !== undefined && d.mcq !== '') ||
                                          (d.practical !== undefined && d.practical !== '') ||
                                          (d.total !== undefined && d.total !== '');
                    const isExplicitlyAbsent = d.status === 'অনুপস্থিত' || d.status === 'absent';
                    return hasActualMarks || isExplicitlyAbsent;
                }
                return false;
            };

            let hasAnyMarksForStudent = false;

            subjects.forEach(subj => {
                const d = st.subjects[subj];

                // CRITICAL: Ignore subjects not in this student's group rules
                if (!allowedSet.has(norm(subj))) return;

                // CRITICAL: Ignore subjects not assigned to this student (by subjectMapping)
                if (!checkStudentHasSubject(subj)) return;

                // Check if they have ANY marks for the summary check
                if ((d?.written || 0) > 0 || (d?.mcq || 0) > 0 || (d?.practical || 0) > 0 || (d?.total || 0) > 0) {
                    hasAnyMarksForStudent = true;
                }

                if (!d) return;

                const sTotal = parseFloat(d.total) || 0;
                totalObtained += sTotal;

                // Marksheet attendance logic:
                // Note: 0 marks + empty status = present (scored 0 while attending)
                // Only explicit 'অনুপস্থিত' status = absent
                const status = (d.status || '').toLowerCase();
                const isExplicitlyAbsent = (status === 'absent' || status === 'অনুপস্থিত');
                
                // Track if student participated in any subject to determine overall attendance
                if (sTotal > 0 || !isExplicitlyAbsent) {
                    presentSubjects++; 
                }

                const cfg = getSubjectCfg(subjectConfigs, subj);
                const maxTotal = parseInt(cfg.total) || 100;
                const pct = maxTotal > 0 ? (sTotal / maxTotal) * 100 : 0;
                const gp = getGradePoint(pct);
                const grade = pct >= 80 ? 'A+' : pct >= 70 ? 'A' : pct >= 60 ? 'A-' : pct >= 50 ? 'B' : pct >= 40 ? 'C' : pct >= 33 ? 'D' : 'F';

                let isFail = (grade === 'F');
                
                // Match marksheet getMarkClass: if mark=0 or missing, getMarkClass returns '' (no fail)
                // Only trigger fail if mark is a valid non-zero number that is below pass mark
                const wMark = d.written;
                const mMark = d.mcq;
                const pMark = d.practical;
                if (wMark && wMark !== '-' && cfg.writtenPass !== undefined && parseFloat(wMark) < parseFloat(cfg.writtenPass)) isFail = true;
                if (mMark && mMark !== '-' && cfg.mcqPass !== undefined && parseFloat(mMark) < parseFloat(cfg.mcqPass)) isFail = true;
                if (pMark && pMark !== '-' && cfg.practicalPass !== undefined && parseFloat(pMark) < parseFloat(cfg.practicalPass)) isFail = true;
                if (status === 'ফেল' || status === 'fail') isFail = true;

                const isOptional = optSubs.some(os => {
                    const ns = norm(subj);
                    if (ns === os) return true;
                    const shorter = Math.min(ns.length, os.length);
                    const longer = Math.max(ns.length, os.length);
                    if (longer === 0 || shorter / longer < 0.6) return false;
                    return ns.includes(os) || os.includes(ns);
                });

                if (isOptional) {
                    hasOptionalTaken = true;
                    if (!isFail && gp > 2.00) {
                        // Align with marksheetManager: replace, not accumulate
                        optionalBonusGP = gp - 2.00;
                    }
                    // Align with marksheetManager: if not board standard, optional fail causes overall fail
                    if (!boardStandard && isFail) {
                        failedSubjects++;
                    }
                } else {
                    compulsoryGP += gp;
                    compulsoryCount++;
                    if (isFail) {
                        failedSubjects++;
                    }
                }
            });

            // Accurate Attendance Logic
            let reqCount = 0;
            subjects.forEach(subj => {
                const ns = norm(subj);
                const isGen = generalSubjects.some(s => {
                    const n = norm(s);
                    return ns === n || ns.includes(n) || n.includes(ns);
                });
                const isGrp = allowedGroupSubs.some(s => {
                    const n = norm(s);
                    return ns === n || ns.includes(n) || n.includes(ns);
                });
                const isOpt = optSubs.some(s => {
                    const n = norm(s);
                    return ns === n || ns.includes(n) || n.includes(ns);
                });

                if (isGen || isGrp) {
                    reqCount++;
                } else if (isOpt && hasOptionalTaken) {
                    reqCount++;
                }
            });

            st._totalObtained = totalObtained;
            st._failedSubjects = failedSubjects;
            st._presentSubjects = presentSubjects;

            // Match marksheet summary logic: if they have NO marks anywhere, they are absent from the statistics
            if (presentSubjects === 0 || !hasAnyMarksForStudent) {
                st._isAbsent = true;
                st._attendanceStatus = 'অনুপস্থিত';
            } else if (presentSubjects < reqCount) {
                st._isAbsent = false;
                st._attendanceStatus = 'আংশিক উপস্থিত';
            } else {
                st._isAbsent = false;
                st._attendanceStatus = 'উপস্থিত';
            }

            st._isPass = !st._isAbsent && failedSubjects === 0;

            // Finalize GPA and Grade
            if (st._isPass && compulsoryCount > 0) {
                const totalGP = compulsoryGP + optionalBonusGP;
                const avgGP = Math.min(5.00, totalGP / compulsoryCount);
                st._gpa = avgGP.toFixed(2);
                st._grade = getGradeFromGP(avgGP);
            } else if (!st._isAbsent) {
                st._gpa = '0.00';
                st._grade = 'F';
            } else {
                st._gpa = '—';
                st._grade = '—';
            }
            st._originalIndex = students.indexOf(st);
        });

        const selGroupName = selGroup === 'all' ? 'সকল বিভাগ' : selGroup;
        currentTabulationData = { students, subjects, cls, session, examName, subjectConfigs };
        renderTabulationSheet(students, subjects, cls, session, examName, subjectConfigs, selGroupName);

        // Show controls
        document.getElementById('tabControls')?.classList.add('visible');

    } catch (err) {
        console.error('[Tabulation] Error:', err);
        container.innerHTML = '<div class="tab-empty-msg"><i class="fas fa-exclamation-triangle"></i> ত্রুটি হয়েছে। পুনরায় চেষ্টা করুন।</div>';
    }
}

// ==========================================
// RENDER TABULATION SHEET
// ==========================================
function renderTabulationSheet(students, subjects, cls, session, examName, subjectConfigs, selGroupName = 'সকল বিভাগ') {
    const container = document.getElementById('tabulationContent');
    if (!container) return;

    const ms = getMarksheetSettings() || {};
    const collegeName = ms.collegeName || '';
    const collegeAddress = ms.collegeAddress || '';
    const collegeLogo = ms.collegeLogoUrl || '';

    // Stats
    const total = students.length;
    const present = students.filter(s => !s._isAbsent).length;
    const absent = total - present;
    const passed = students.filter(s => s._isPass).length;
    const failed = students.filter(s => !s._isPass && !s._isAbsent).length;
    const passRate = present > 0 ? ((passed / present) * 100).toFixed(1) : '0.0';

    let html = `
    <div class="tabulation-sheet" id="tabulationSheet">
        <!-- Header for Print -->
        <div class="tab-sheet-header">
            ${collegeLogo ? `<img src="${collegeLogo}" alt="Logo" class="tab-logo">` : ''}
            <div class="tab-header-text">
                <h2 class="tab-college-name">${collegeName}</h2>
                <p class="tab-college-address">${collegeAddress}</p>
                <h3 class="tab-exam-title">টেবুলেশন শীট — ${examName}</h3>
                <p class="tab-meta">শ্রেণি: ${cls} | সেশন: ${session} | বিভাগ: ${selGroupName}</p>
            </div>
        </div>

        <!-- Stats Summary Boxes -->
        <div class="tab-stats-boxes">
            <div class="tab-stat-box total">
                <i class="fas fa-users"></i>
                <div class="tab-stat-info">
                    <span class="tab-stat-label">মোট শিক্ষার্থী</span>
                    <span class="tab-stat-val">${convertToBengaliDigits(total)}</span>
                </div>
            </div>
            <div class="tab-stat-box present">
                <i class="fas fa-user-check"></i>
                <div class="tab-stat-info">
                    <span class="tab-stat-label">উপস্থিত</span>
                    <span class="tab-stat-val">${convertToBengaliDigits(present)}</span>
                </div>
            </div>
            <div class="tab-stat-box absent">
                <i class="fas fa-user-times"></i>
                <div class="tab-stat-info">
                    <span class="tab-stat-label">অনুপস্থিত</span>
                    <span class="tab-stat-val">${convertToBengaliDigits(absent)}</span>
                </div>
            </div>
            <div class="tab-stat-box pass">
                <i class="fas fa-check-circle"></i>
                <div class="tab-stat-info">
                    <span class="tab-stat-label">কৃতকার্য (পাস)</span>
                    <span class="tab-stat-val">${convertToBengaliDigits(passed)}</span>
                </div>
            </div>
            <div class="tab-stat-box fail">
                <i class="fas fa-times-circle"></i>
                <div class="tab-stat-info">
                    <span class="tab-stat-label">অকৃতকার্য (ফেল)</span>
                    <span class="tab-stat-val">${convertToBengaliDigits(failed)}</span>
                </div>
            </div>
            <div class="tab-stat-box rate">
                <i class="fas fa-percentage"></i>
                <div class="tab-stat-info">
                    <span class="tab-stat-label">পাশের হার</span>
                    <span class="tab-stat-val">${convertToBengaliDigits(passRate)}%</span>
                </div>
            </div>
        </div>

        <!-- Table -->
        <div class="tabulation-table-wrapper">
            <table class="tab-table ${hideNames ? 'tab-hide-names' : ''}" id="tabulationTable">
                <thead>
                    <tr>
                        <th rowspan="2" class="tab-col-serial">ক্রম</th>
                        <th rowspan="2" class="tab-col-name">শিক্ষার্থীর নাম</th>
                        <th rowspan="2" class="tab-col-roll">রোল</th>
                        <th rowspan="2" class="tab-col-group">বিভাগ</th>
                        ${subjects.map((s, i) => `
                            <th colspan="4" class="tab-subj-th-${i % 6}">${s}</th>
                        `).join('')}
                        <th rowspan="2">সর্বমোট</th>
                        <th rowspan="2">GPA</th>
                        <th rowspan="2">আপডেট</th>
                        <th rowspan="2">ফলাফল</th>
                        <th rowspan="2">স্ট্যাটাস</th>
                    </tr>
                    <tr>
                        ${subjects.map((s, i) => `
                            <th class="tab-subj-sub-th tab-subj-th-${i % 6}">লিঃ</th>
                            <th class="tab-subj-sub-th tab-subj-th-${i % 6}">নৈঃ</th>
                            <th class="tab-subj-sub-th tab-subj-th-${i % 6}">ব্যঃ</th>
                            <th class="tab-subj-sub-th tab-subj-th-${i % 6}">মোট</th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${students.map((st, idx) => {
        const resultClass = st._isAbsent ? 'absent' : (st._isPass ? 'pass' : 'fail');
        const statusBadgeClass = st._isAbsent ? 'status-absent' : (st._isPass ? 'status-pass' : 'status-fail');
        const resultText = st._isAbsent ? 'অনুপস্থিত' : (st._isPass ? 'পাশ' : 'ফেল');
        const dateStr = st.lastUpdated ? formatDateBn(st.lastUpdated) : '—';

        return `
                        <tr class="tab-row tab-row-${resultClass}" data-student-key="${idx}">
                            <td class="tab-col-serial">${convertToBengaliDigits(idx + 1)}</td>
                            <td class="tab-td-name tab-col-name">
                                <button class="tab-name-btn" onclick="window.__tabShowDetail(${st._originalIndex !== undefined ? st._originalIndex : idx})" title="বিস্তারিত দেখুন">
                                    ${st.name}
                                </button>
                            </td>
                            <td class="tab-col-roll">${st.id}</td>
                            <td class="tab-col-group">${st.group || '—'}</td>
                            ${subjects.map((subj, i) => {
            // Re-derive subjectMapping check for rendering (same logic as stats loop)
            const ms = getMarksheetSettings() || {};
            const subjMapForRender = ms.subjectMapping || [];
            const stGroupNorm = normalizeText(st.group || '');
            const stRollClean = String(st.id || '').trim().replace(/^0+/, '');
            const cleanSubjName = normalizeText(subj).replace(/\[.*?\]/g, '').replace(/\s+/g, '');

            const thisSubMapRender = subjMapForRender.find(m => {
                const mapSubNorm = normalizeText(m.subject).replace(/\[.*?\]/g, '').replace(/\s+/g, '');
                const mapGroupNorm = normalizeText(m.group || '');
                return mapSubNorm === cleanSubjName &&
                    (stGroupNorm.includes(mapGroupNorm) || mapGroupNorm.includes(stGroupNorm) || mapGroupNorm === '');
            });

            // Student not eligible for this subject by mapping → show N/A cells
            if (thisSubMapRender && !thisSubMapRender.rolls.map(r => String(r).replace(/^0+/, '')).includes(stRollClean)) {
                const tintCls = `tab-subj-tint-${i % 6} tab-subj-na`;
                return `
                                    <td class="${tintCls}">—</td>
                                    <td class="${tintCls}">—</td>
                                    <td class="${tintCls}">—</td>
                                    <td class="${tintCls} tab-subj-last-col">—</td>
                                `;
            }

            const d = st.subjects[subj] || {};
            const cfg = getSubjectCfg(subjectConfigs, subj);
            const wPass = num(cfg.writtenPass);
            const mPass = num(cfg.mcqPass);
            const pPass = num(cfg.practicalPass);

            const w = d.written || 0;
            const m = d.mcq || 0;
            const p = d.practical || 0;
            const t = d.total || 0;
            const hasData = w > 0 || m > 0 || p > 0 || t > 0 || d.status;

            const wFail = num(cfg.written) > 0 && w < wPass && !!d.written && d.written !== '-';
            const mFail = num(cfg.mcq) > 0 && m < mPass && !!d.mcq && d.mcq !== '-';
            const pFail = num(cfg.practical) > 0 && !cfg.practicalOptional && p < pPass && !!d.practical && d.practical !== '-';
            const isSubjFail = wFail || mFail || pFail || ((d.status || '').toLowerCase() === 'fail') || ((d.status || '').toLowerCase() === 'ফেল');

            const tintCls = `tab-subj-tint-${i % 6}`;

            const wCls = `${tintCls} ${hasData && wFail ? 'tab-mark-fail' : ''}`.trim();
            const mCls = `${tintCls} ${hasData && mFail ? 'tab-mark-fail' : ''}`.trim();
            const pCls = `${tintCls} ${hasData && pFail ? 'tab-mark-fail' : ''}`.trim();
            const tCls = `${tintCls} tab-subj-last-col ${hasData && isSubjFail ? 'tab-mark-fail' : ''}`.trim();

            return `
                                    <td class="${wCls}">${hasData && d.written !== undefined && d.written !== '' ? w : '—'}</td>
                                    <td class="${mCls}">${hasData && d.mcq !== undefined && d.mcq !== '' ? m : '—'}</td>
                                    <td class="${pCls}">${hasData && d.practical !== undefined && d.practical !== '' ? p : '—'}</td>
                                    <td class="${tCls}" style="font-weight:700;">${hasData && t > 0 ? t : '—'}</td>
                                `;
        }).join('')}
                            <td style="font-weight:800;">${convertToBengaliDigits(st._totalObtained)}</td>
                            <td style="font-weight:800; color:#4f46e5;">
                                ${st._gpa !== '—' ? convertToBengaliDigits(st._gpa) : '—'}<br>
                                <span style="font-size: 0.75rem; color: #64748b;">${st._grade}</span>
                            </td>
                            <td style="font-size:0.75rem;">${dateStr}</td>
                            <td><span class="tab-status-badge ${statusBadgeClass}">${resultText}</span></td>
                            <td style="font-size:0.75rem; white-space:nowrap; font-weight: 500;">${st._attendanceStatus}</td>
                        </tr>`;
    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;

    container.innerHTML = html;

    // Expose detail handler
    window.__tabShowDetail = (idx) => showStudentDetail(idx);
    
    // Setup robust dynamic sticky observer
    setupStickyObserver();
}

// ==========================================
// DYNAMIC WRAPPER HEIGHT FOR TABLE-LEVEL SCROLL
// ==========================================
function setupStickyObserver() {
    // Cleanup previous observers and listeners
    if (stickyObserver) stickyObserver.disconnect();
    if (stickyScrollHandler) window.removeEventListener('scroll', stickyScrollHandler);
    if (stickyResizeHandler) window.removeEventListener('resize', stickyResizeHandler);
    
    const wrapper = document.querySelector('.tabulation-table-wrapper');
    if (!wrapper) return;
    
    // Clear any old inline top values from previous logic
    document.querySelectorAll('#tabulationTable thead th').forEach(th => {
        th.style.top = '';
    });
    
    function updateWrapperHeight() {
        if (window.innerWidth < 769) {
            wrapper.style.maxHeight = '';
            return;
        }
        // Calculate remaining viewport height from the wrapper's current position
        const rect = wrapper.getBoundingClientRect();
        const available = window.innerHeight - rect.top - 10;
        wrapper.style.maxHeight = `${Math.max(300, available)}px`;
    }
    
    // Initial calculation
    updateWrapperHeight();
    
    // Update on scroll (wrapper position changes as page scrolls)
    stickyScrollHandler = updateWrapperHeight;
    window.addEventListener('scroll', stickyScrollHandler, { passive: true });
    
    // Update on resize (viewport height changes)
    stickyResizeHandler = updateWrapperHeight;
    window.addEventListener('resize', stickyResizeHandler, { passive: true });
    
    // Observe action bar for size changes (e.g. filters expanding)
    const actionBar = document.getElementById('tabControls');
    if (actionBar) {
        stickyObserver = new ResizeObserver(() => updateWrapperHeight());
        stickyObserver.observe(actionBar);
    }
}

// ==========================================
// STUDENT DETAIL MODAL
// ==========================================
function showStudentDetail(idx) {
    if (!currentTabulationData) return;
    const { students, subjects, subjectConfigs, examName } = currentTabulationData;
    const st = students[idx];
    if (!st) return;

    // Remove existing modal
    document.getElementById('tabDetailModal')?.remove();

    const ms = getMarksheetSettings() || {};
    const subjMapForRender = ms.subjectMapping || [];
    const stGroupNorm = normalizeText(st.group || '');
    const stRollClean = String(st.id || '').trim().replace(/^0+/, '');

    const applicableSubjects = subjects.filter(subj => {
        const cleanSubjName = normalizeText(subj).replace(/\[.*?\]/g, '').replace(/\s+/g, '');
        const thisSubMapRender = subjMapForRender.find(m => {
            const mapSubNorm = normalizeText(m.subject).replace(/\[.*?\]/g, '').replace(/\s+/g, '');
            const mapGroupNorm = normalizeText(m.group || '');
            return mapSubNorm === cleanSubjName &&
                (stGroupNorm.includes(mapGroupNorm) || mapGroupNorm.includes(stGroupNorm) || mapGroupNorm === '');
        });

        // If a mapping exists for this subject/group and the student's roll is NOT in it, filter it out
        if (thisSubMapRender && !thisSubMapRender.rolls.map(r => String(r).replace(/^0+/, '')).includes(stRollClean)) {
            return false;
        }
        return true;
    });

    let subjectRows = applicableSubjects.map(subj => {
        const d = st.subjects[subj] || {};
        const cfg = getSubjectCfg(subjectConfigs, subj);
        const hasData = (d.written > 0) || (d.mcq > 0) || (d.practical > 0) || (d.total > 0);

        const wMax = num(cfg.written);
        const mMax = num(cfg.mcq);
        const pMax = num(cfg.practical);
        const tMax = num(cfg.total) || (wMax + mMax + pMax);

        const wPass = num(cfg.writtenPass);
        const mPass = num(cfg.mcqPass);
        const pPass = num(cfg.practicalPass);

        const wFail = wMax > 0 && d.written < wPass && hasData;
        const mFail = mMax > 0 && d.mcq < mPass && hasData;
        const pFail = pMax > 0 && !cfg.practicalOptional && d.practical < pPass && hasData;

        return `
        <tr class="${!hasData ? 'tab-detail-absent' : ''}">
            <td class="tab-detail-subj">${subj}</td>
            <td class="${wFail ? 'tab-detail-fail' : ''}">${hasData ? `${d.written}/${wMax}` : '—'}</td>
            <td class="${mFail ? 'tab-detail-fail' : ''}">${hasData ? (mMax > 0 ? `${d.mcq}/${mMax}` : '—') : '—'}</td>
            <td class="${pFail ? 'tab-detail-fail' : ''}">${hasData ? (pMax > 0 ? `${d.practical}/${pMax}` : '—') : '—'}</td>
            <td class="tab-detail-total">${hasData ? `${d.total}/${tMax}` : '—'}</td>
            <td>${d.grade || '—'}</td>
        </tr>`;
    }).join('');

    const resultClass = st._isAbsent ? 'absent' : (st._isPass ? 'pass' : 'fail');
    const resultText = st._isAbsent ? 'অনুপস্থিত' : (st._isPass ? 'পাশ' : 'ফেল');

    const modal = document.createElement('div');
    modal.id = 'tabDetailModal';
    modal.className = 'tab-modal-overlay';
    modal.innerHTML = `
    <div class="tab-modal">
        <div class="tab-modal-header">
            <h3><i class="fas fa-user-graduate"></i> বিস্তারিত ফলাফল</h3>
            <button class="tab-modal-close" id="tabModalClose"><i class="fas fa-times"></i></button>
        </div>
        <div class="tab-modal-body">
            <div class="tab-detail-info">
                <div class="tab-detail-field"><span class="tab-detail-label">নাম:</span> <strong>${st.name}</strong></div>
                <div class="tab-detail-field"><span class="tab-detail-label">রোল:</span> <strong>${st.id}</strong></div>
                <div class="tab-detail-field"><span class="tab-detail-label">বিভাগ:</span> <strong>${st.group || 'সাধারণ'}</strong></div>
                <div class="tab-detail-field"><span class="tab-detail-label">পরীক্ষা:</span> <strong>${examName}</strong></div>
                <div class="tab-detail-field"><span class="tab-detail-label">ফলাফল:</span> <span class="tab-badge tab-badge-${resultClass}">${resultText}</span></div>
                <div class="tab-detail-field"><span class="tab-detail-label">সর্বমোট নম্বর:</span> <strong>${convertToBengaliDigits(st._totalObtained)}</strong></div>
            </div>
            <table class="tab-detail-table">
                <thead>
                    <tr>
                        <th>বিষয়</th>
                        <th>লিখিত</th>
                        <th>MCQ</th>
                        <th>ব্যবহারিক</th>
                        <th>মোট</th>
                        <th>গ্রেড</th>
                    </tr>
                </thead>
                <tbody>${subjectRows}</tbody>
            </table>
        </div>
    </div>`;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));

    const closeModal = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    };

    document.getElementById('tabModalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// ==========================================
// SEARCH / FILTER
// ==========================================
function filterTabulationTable() {
    if (!currentTabulationData) return;
    const { students, subjects, cls, session, examName, subjectConfigs } = currentTabulationData;

    const query = (document.getElementById('tabSearchInput')?.value || '').toLowerCase().trim();
    const q = convertToEnglishDigits(query);

    const filterType = document.getElementById('tabAdvFilterType')?.value || 'none';
    const filterOp = document.getElementById('tabFilterOperator')?.value || '=';
    const filterNumVal = parseFloat(convertToEnglishDigits(document.getElementById('tabFilterNumVal')?.value || '0'));
    const filterEnumVal = document.getElementById('tabFilterEnumVal')?.value || 'all';
    const sortOrder = document.getElementById('tabSortOrder')?.value || 'desc';

    let filtered = students.filter(st => {
        // 1. Text Search
        const nameMatch = st.name.toLowerCase().includes(query);
        const rollMatch = convertToEnglishDigits(String(st.id)).includes(q);
        const groupMatch = (st.group || '').toLowerCase().includes(query);
        if (query && !nameMatch && !rollMatch && !groupMatch) return false;

        // 2. Advanced Filters
        if (filterType === 'none') return true;

        if (filterType === 'gpa') {
            const val = parseFloat(st._gpa !== '—' ? st._gpa : 0);
            if (filterOp === '>') return val > filterNumVal;
            if (filterOp === '<') return val < filterNumVal;
            return val === filterNumVal;
        }
        if (filterType === 'marks') {
            const val = st._totalObtained || 0;
            if (filterOp === '>') return val > filterNumVal;
            if (filterOp === '<') return val < filterNumVal;
            return val === filterNumVal;
        }
        if (filterType === 'cq' || filterType === 'mcq') {
            let totalMarks = 0;
            subjects.forEach(subj => {
                const d = st.subjects[subj];
                if (d) {
                    totalMarks += num(filterType === 'cq' ? d.written : d.mcq);
                }
            });
            if (filterOp === '>') return totalMarks > filterNumVal;
            if (filterOp === '<') return totalMarks < filterNumVal;
            return totalMarks === filterNumVal;
        }
        if (filterType === 'result') {
            if (filterEnumVal === 'all') return true;
            if (filterEnumVal === 'pass') return st._isPass;
            if (filterEnumVal === 'fail') return !st._isPass && !st._isAbsent;
            return true;
        }
        if (filterType === 'status') {
            if (filterEnumVal === 'all') return true;
            return st._attendanceStatus === filterEnumVal;
        }

        return true;
    });

    // 3. Sorting
    if (filterType !== 'none') {
        filtered.sort((a, b) => {
            let valA = 0, valB = 0;
            if (filterType === 'gpa') {
                valA = parseFloat(a._gpa !== '—' ? a._gpa : 0);
                valB = parseFloat(b._gpa !== '—' ? b._gpa : 0);
            } else if (filterType === 'marks') {
                valA = a._totalObtained || 0;
                valB = b._totalObtained || 0;
            } else if (filterType === 'cq' || filterType === 'mcq') {
                subjects.forEach(subj => {
                    if (a.subjects[subj]) valA += num(filterType === 'cq' ? a.subjects[subj].written : a.subjects[subj].mcq);
                    if (b.subjects[subj]) valB += num(filterType === 'cq' ? b.subjects[subj].written : b.subjects[subj].mcq);
                });
            } else {
                valA = a._totalObtained || 0;
                valB = b._totalObtained || 0;
            }

            if (sortOrder === 'asc') return valA - valB;
            return valB - valA; // desc
        });
    }

    const selGroup = document.getElementById('tabGroup')?.value || 'all';
    const selGroupName = selGroup === 'all' ? 'সকল বিভাগ' : selGroup;

    // Re-render completely using filtered array to update dynamic stats boxes
    renderTabulationSheet(filtered, subjects, cls, session, examName, subjectConfigs, selGroupName);
}

// ==========================================
// PRINT
// ==========================================
function handlePrint() {
    const sheet = document.getElementById('tabulationSheet');
    if (!sheet) {
        showNotification('প্রথমে টেবুলেশন শীট তৈরি করুন', 'error');
        return;
    }

    // Add print class to body
    document.body.classList.add('tab-printing');
    window.print();
    // Clean up after print
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('tab-printing');
    }, { once: true });
}

// ==========================================
// HELPERS
// ==========================================
function num(val) {
    if (val === '' || val === null || val === undefined) return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
}

function getSubjectCfg(configs, subjectName) {
    let found = configs?.[subjectName];
    if (!found) {
        const normalized = normalizeText(subjectName);
        const key = Object.keys(configs || {}).find(k => k !== 'updatedAt' && normalizeText(k) === normalized);
        found = key ? configs[key] : null;
    }
    return found || { total: 100, written: 100, writtenPass: 33, mcq: 0, mcqPass: 0, practical: 0, practicalPass: 0 };
}

function getGradePoint(pct) {
    if (pct >= 80) return 5.00;
    if (pct >= 70) return 4.00;
    if (pct >= 60) return 3.50;
    if (pct >= 50) return 3.00;
    if (pct >= 40) return 2.00;
    if (pct >= 33) return 1.00;
    return 0.00;
}

function getGradeFromGP(gp) {
    if (gp >= 5.00) return 'A+';
    if (gp >= 4.00) return 'A';
    if (gp >= 3.50) return 'A-';
    if (gp >= 3.00) return 'B';
    if (gp >= 2.00) return 'C';
    if (gp >= 1.00) return 'D';
    return 'F';
}

function formatDateBn(date) {
    if (!date) return '—';
    try {
        let d;
        if (date instanceof Date) {
            d = date;
        } else if (date.toDate) {
            d = date.toDate();
        } else if (typeof date === 'object' && (date.seconds || date._seconds)) {
            d = new Date((date.seconds || date._seconds) * 1000);
        } else {
            d = new Date(date);
        }

        if (isNaN(d.getTime())) return '—';

        const day = d.getDate();
        const months = ['জানু', 'ফেব', 'মার্চ', 'এপ্রি', 'মে', 'জুন', 'জুলা', 'আগ', 'সেপ্ট', 'অক্টো', 'নভে', 'ডিসে'];

        let hours = d.getHours();
        const minutes = d.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const minsStr = minutes < 10 ? '0' + minutes : minutes;

        const datePart = `${convertToBengaliDigits(day)} ${months[d.getMonth()]}`;
        const timePart = `${convertToBengaliDigits(hours)}:${convertToBengaliDigits(minsStr)} ${ampm}`;

        return `${datePart}<br><span style="font-size:0.75rem; color:#6b7280; font-family:var(--font-en);">${timePart}</span>`;
    } catch {
        return '—';
    }
}
