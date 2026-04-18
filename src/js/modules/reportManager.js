import { state } from './state.js';
import { getMarksheetSettings, loadMarksheetSettings, applyCombinedPaperLogic } from './marksheetManager.js';
import { loadMarksheetRules, currentMarksheetRules } from './marksheetRulesManager.js';
import { showNotification, convertToBengaliDigits, convertToEnglishDigits, isAbsent, determineStatus, normalizeText, calculateStatistics, isStudentEligibleForSubject } from '../utils.js';
import { getSavedExams, getSettings, getUnifiedStudents, getExamConfigs, getStudentLookupMap, generateStudentDocId } from '../firestoreService.js';
import { FAILING_THRESHOLD } from '../constants.js';

let lastGeneratedSubjects = [];

function getGradePoint(pct) {
    if (pct >= 80) return 5.00;
    if (pct >= 70) return 4.00;
    if (pct >= 60) return 3.50;
    if (pct >= 50) return 3.00;
    if (pct >= 40) return 2.00;
    if (pct >= 33) return 1.00;
    return 0.00;
}

function getLetterGrade(pct) {
    if (pct >= 80) return 'A+';
    if (pct >= 70) return 'A';
    if (pct >= 60) return 'A-';
    if (pct >= 50) return 'B';
    if (pct >= 40) return 'C';
    if (pct >= 33) return 'D';
    return 'F';
}

function getOverallGradeFromGPA(gpa, allPassed) {
    if (!allPassed || gpa < 1.0) return 'F';
    if (gpa >= 5.0) return 'A+';
    if (gpa >= 4.0) return 'A';
    if (gpa >= 3.5) return 'A-';
    if (gpa >= 3.0) return 'B';
    if (gpa >= 2.0) return 'C';
    return 'D';
}

function getMappedKey(group, keys) {
    const normGroup = normalizeText(group);
    return keys.find(k => normalizeText(k) === normGroup) || group;
}

export async function populateReportDropdowns() {
    const classSelect = document.getElementById('rptClass');
    const sessionSelect = document.getElementById('rptSession');
    const examSelect = document.getElementById('rptExamName');

    if (!classSelect || !sessionSelect || !examSelect) return;

    const exams = await getSavedExams();
    const classes = [...new Set(exams.map(e => e.class).filter(Boolean))].sort();
    const sessions = [...new Set(exams.map(e => e.session).filter(Boolean))].sort().reverse();

    classSelect.innerHTML = '<option value="">শ্রেণি নির্বাচন</option>';
    classes.forEach(c => classSelect.innerHTML += `<option value="${c}">${c}</option>`);

    sessionSelect.innerHTML = '<option value="">সেশন নির্বাচন</option>';
    sessions.forEach(s => sessionSelect.innerHTML += `<option value="${s}">${s}</option>`);

    const updateExams = async () => {
        const selClass = classSelect.value;
        const selSession = sessionSelect.value;
        if (!selClass || !selSession) {
            examSelect.innerHTML = '<option value="">শ্রেণি ও সেশন নির্বাচন করুন</option>';
            return;
        }
        try {
            const { getExamConfigs } = await import('../firestoreService.js');
            const configs = await getExamConfigs(selClass, selSession);
            const examNames = [...new Set(configs.map(c => c.examName).filter(Boolean))].sort();

            examSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন</option>';
            if (examNames.length === 0) {
                examSelect.innerHTML = '<option value="">শাখা/শ্রেণিতে কোনো এক্সাম কনফিগ নেই</option>';
            } else {
                examNames.forEach(n => examSelect.innerHTML += `<option value="${n}">${n}</option>`);
            }
        } catch (err) {
            console.error('Dropdown error:', err);
            examSelect.innerHTML = '<option value="">লোড করতে সমস্যা হয়েছে</option>';
        }
    };

    classSelect.addEventListener('change', updateExams);
    sessionSelect.addEventListener('change', updateExams);
    if (classSelect.value && sessionSelect.value) updateExams();
}

export async function generateReport() {
    const rptClass = document.getElementById('rptClass')?.value;
    const rptSession = document.getElementById('rptSession')?.value;
    const examName = document.getElementById('rptExamName')?.value;
    const calcMode = document.getElementById('rptCalculationMode')?.value || 'auto';

    if (!rptClass || !rptSession || !examName) {
        showNotification('শ্রেণি, সেশন এবং পরীক্ষা নির্বাচন করুন!', 'warning');
        return;
    }

    // Fetch all necessary data in parallel for optimal performance and sync
    const [allExams, masterRules, _msSetResult, specificConfigs, studentLookupMap, rawAllStudents] = await Promise.all([
        getSavedExams(),
        loadMarksheetRules(), // Ensures latest rules are loaded
        loadMarksheetSettings(), // Ensures latest subject mappings are loaded
        getExamConfigs(rptClass, rptSession),
        getStudentLookupMap(),
        getUnifiedStudents()
    ]);

    const clsNorm = normalizeText(rptClass);
    const sesNorm = normalizeText(rptSession);
    const examNorm = normalizeText(examName);

    const relevantExams = allExams.filter(e => {
        const dbClass = normalizeText(e.class);
        const dbSession = normalizeText(e.session);
        const dbExamName = normalizeText(e.examName || e.name || '');
        return dbClass === clsNorm && dbSession === sesNorm && dbExamName === examNorm;
    });

    if (relevantExams.length === 0) {
        showNotification('ডেটা পাওয়া যায়নি!', 'error');
        return;
    }

    const masterStudents = rawAllStudents.filter(s => {
        // Exclude inactive students via lookup map for dashboard consistency
        const key = generateStudentDocId({ id: s.id, group: s.group, class: rptClass, session: rptSession });
        const lookup = studentLookupMap.get(key);
        if (lookup && (lookup.status === false || lookup.status === 'false')) return false;

        const sCls = normalizeText(s.class || s.currentClass || '');
        const sSes = normalizeText(s.session || s.academicSession || '');
        const classMatch = sCls === clsNorm || sCls.includes(clsNorm) || clsNorm.includes(sCls);
        const cleanSess = (val) => val.replace(/[^\d]/g, '');
        const sesMatch = sSes === sesNorm || cleanSess(sSes).includes(cleanSess(sesNorm)) || cleanSess(sesNorm).includes(cleanSess(sSes));
        return classMatch && sesMatch;
    });

    const masterLookup = new Map();
    masterStudents.forEach(ms => masterLookup.set(String(ms.id).trim(), ms));

    const studentAgg = new Map();
    const subjectsSet = new Set();
    const ms = getMarksheetSettings();
    const rules = masterRules || currentMarksheetRules;
    const hiddenSet = new Set((ms.reportHiddenSubjects || []).map(s => normalizeText(s)));

    relevantExams.forEach(exam => {
        if (hiddenSet.has(normalizeText(exam.subject))) return;
        subjectsSet.add(exam.subject);
        exam.studentData.forEach(s => {
            const rollKey = String(s.id || s.roll).trim();
            if (!masterLookup.has(rollKey)) return;

            const master = masterLookup.get(rollKey);
            if (!studentAgg.has(rollKey)) {
                studentAgg.set(rollKey, {
                    roll: rollKey,
                    name: master.name,
                    class: master.class || rptClass,
                    session: master.session || rptSession,
                    group: master.group || '',
                    subjects: {}
                });
            }

            const curSub = studentAgg.get(rollKey).subjects[exam.subject] || { written: null, mcq: null, practical: null, total: null, status: null };

            const hasVal = (v) => v !== undefined && v !== null && v !== '';

            if (hasVal(s.written)) curSub.written = (curSub.written === null ? 0 : curSub.written) + Number(s.written);
            if (hasVal(s.mcq)) curSub.mcq = (curSub.mcq === null ? 0 : curSub.mcq) + Number(s.mcq);
            if (hasVal(s.practical)) curSub.practical = (curSub.practical === null ? 0 : curSub.practical) + Number(s.practical);
            if (hasVal(s.total)) curSub.total = (curSub.total === null ? 0 : curSub.total) + Number(s.total);

            // Maintain the database status as an exact fallback backup
            if (s.status) curSub.status = s.status;

            studentAgg.get(rollKey).subjects[exam.subject] = curSub;
        });
    });

    const subjects = [...subjectsSet].sort();
    lastGeneratedSubjects = subjects;
    const allStudents = [...studentAgg.values()];

    const groupStats = new Map();
    const overallGrades = { 'A+': 0, 'A': 0, 'A-': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    let gT = 0, gE = 0, gP = 0, gF = 0;

    const clsRules = rules[rptClass] || rules['All'] || { generalSubjects: [], groupSubjects: {}, optionalSubjects: {} };
    const optSubsObj = clsRules.optionalSubjects || {};

    let isCombinedMode = clsRules.mode === 'combined';
    if (calcMode === 'combined') isCombinedMode = true;
    if (calcMode === 'single') isCombinedMode = false;

    const getCanonicalGroup = (grp) => {
        const t = normalizeText(grp || '');
        if (t.includes('বিজ্ঞান') || t.includes('science')) return 'বিজ্ঞান গ্রুপ';
        if (t.includes('ব্যবসায়') || t.includes('business')) return 'ব্যবসায় গ্রুপ';
        if (t.includes('মানবিক') || t.includes('arts') || t.includes('humanities')) return 'মানবিক গ্রুপ';
        return 'অন্যান্য';
    };

    // ============================================================
    // BUILD MARKSHEET-IDENTICAL SUMMARY AGGREGATION
    // Mirrors marksheetManager.js lines 350-413 and 561-603 EXACTLY
    // Key = ${roll}_${group} (like marksheet), subject key normalized,
    // data handling = overwrite (like marksheet), NOT accumulate
    // ============================================================

    const summaryAgg = new Map();
    // Initialize groupStats and summaryAgg with all ACTIVE master students (true enrollment)
    masterStudents.forEach(ms => {
        const group = getCanonicalGroup(ms.group || '');
        if (!groupStats.has(group)) groupStats.set(group, { total: 0, examinees: 0, pass: 0, fail: 0 });
        groupStats.get(group).total++;

        // Pre-populate summaryAgg to ensure all active students are counted in totals
        const sRoll = convertToEnglishDigits(String(ms.id || '').trim().replace(/^0+/, '')) || '0';
        const sGroupKey = normalizeText(group); // Use canonical group for the key
        const key = `${sRoll}_${sGroupKey}`;
        if (!summaryAgg.has(key)) {
            summaryAgg.set(key, {
                id: ms.id,
                name: ms.name,
                group: group, // Store canonical name
                status: true,
                subjects: {}
            });
        }
    });

    relevantExams.forEach(exam => {
        if (hiddenSet.has(normalizeText(exam.subject))) return;
        if (exam.studentData) {
            exam.studentData.forEach(s => {
                const sRoll = convertToEnglishDigits(String(s.id || '').trim().replace(/^0+/, '')) || '0';
                const sGroupKey = normalizeText(getCanonicalGroup(s.group || ''));
                const key = `${sRoll}_${sGroupKey}`;

                const targetEntry = summaryAgg.get(key);
                if (!targetEntry) return; 

                // Use EXACT same subject key normalization as marksheet
                const subjKey = normalizeText(exam.subject).replace(/\s+/g, '') || exam.subject;
                const existingSubData = targetEntry.subjects[subjKey];

                const hasVal = (v) => v !== undefined && v !== null && v !== '';
                const hasMarks = hasVal(s.written) || hasVal(s.mcq) || hasVal(s.practical) || hasVal(s.total);

                if (!existingSubData || hasMarks) {
                    targetEntry.subjects[subjKey] = {
                        written: s.written || 0,
                        mcq: s.mcq || 0,
                        practical: s.practical || 0,
                        total: s.total || 0,
                        grade: s.grade || '',
                        gpa: s.gpa || '',
                        status: s.status || ''
                    };
                }
            });
        }
    });

    // Get all active students for summary (marksheet line 405-406)
    const allSummaryStudents = [...summaryAgg.values()]
        .filter(s => String(s.status) !== 'false');

    // Apply Combined Paper Logic for accurate subject counts
    const allOptSubsList = Object.values(optSubsObj).flat().map(os => normalizeText(os));
    let displaySubjects = subjects.map(s => ({ paper: s, isCombined: false, isOptional: allOptSubsList.some(os => s.includes(os) || os.includes(s)) }));
    if (isCombinedMode && clsRules.combinedSubjects?.length > 0) {
        displaySubjects = applyCombinedPaperLogic(allSummaryStudents, subjects, clsRules, allOptSubsList);
    }

    // Count totals from summary students — GROUP-WISE breakdown (marksheet lines 561-603)
    allSummaryStudents.forEach(student => {
        const group = getCanonicalGroup(student.group || '');
        const gs = groupStats.get(group);
        if (!gs) return; // Should not happen

        // --- Examinee Calculation (Matching exactly with marksheetManager logic for 100% sync) ---
        // A student is an "examinee" ONLY if they have ANY marks > 0 in ANY subject criteria
        const isExaminee = Object.values(student.subjects).some(data =>
            ((data.written || 0) > 0 || (data.mcq || 0) > 0 || (data.practical || 0) > 0 || (data.total || 0) > 0)
        );
        
        if (!isExaminee) return; 

        gs.examinees++;

        // Calculate GPA like marksheet ranking (lines 872-960)
        let compulsoryGPA = 0;
        let compulsoryCount = 0;
        let optionalBonus = 0;
        let allPassed = true;

        // Get optional subjects for this student's group
        const normGroup = normalizeText(student.group || '');
        const optKey = Object.keys(clsRules.groupSubjects || {}).find(k => {
            const nk = normalizeText(k);
            return nk === normGroup || nk.includes(normGroup) || normGroup.includes(nk);
        }) || student.group;

        const generalSubs = (clsRules.generalSubjects || []).map(s => normalizeText(s));
        const groupSubs = (clsRules.groupSubjects?.[optKey] || []).map(s => normalizeText(s));
        const optSubs = (optSubsObj[optKey] || []).map(s => normalizeText(s));

        const visibleSubjects = displaySubjects.filter(subjObj => {
            const isObj = typeof subjObj === 'object';
            const subjName = isObj ? (subjObj.name || subjObj.paper) : subjObj;
            const normSubjName = normalizeText(subjName);
            const papers = isObj ? (subjObj.papers || []) : [subjName];

            const matchesList = (normList) => {
                if (normList.includes(normSubjName)) return true;
                if (isObj && subjObj.papers) {
                    return subjObj.papers.some(p => normList.includes(normalizeText(p)));
                }
                return normList.some(item => normSubjName === item || normSubjName.includes(item) || item.includes(normSubjName));
            };

            const isGeneral = matchesList(generalSubs);
            const isGroup = matchesList(groupSubs);
            const isOpt = matchesList(optSubs);

            const checkMarks = (name) => {
                const sSubjKey = normalizeText(name).replace(/\s+/g, '');
                const data = student.subjects[sSubjKey];

                const sRoll = String(student.id || '').trim().replace(/^0+/, '');
                const sGroupNorm = normalizeText(student.group || '');

                // --- STRICT MAPPING ENFORCEMENT ---
                const cleanName = normalizeText(name).replace(/\[.*?\]/g, '').replace(/\s+/g, '');
                const thisSubMap = (ms.subjectMapping || []).find(m => {
                    const mapSubNorm = normalizeText(m.subject).replace(/\[.*?\]/g, '').replace(/\s+/g, '');
                    const mapGroupNorm = normalizeText(m.group);
                    return mapSubNorm === cleanName &&
                        (sGroupNorm.includes(mapGroupNorm) || mapGroupNorm.includes(sGroupNorm));
                });

                if (thisSubMap) {
                    // If a mapping exists for this subject, the student MUST be in it to "have" the subject.
                    return thisSubMap.rolls.map(r => String(r).replace(/^0+/, '')).includes(sRoll);
                }

                // If no mapping exists, rely on exam data presence
                // Only consider it valid if they have actual marks or explicit status, preventing ghost records
                if (data) {
                    const hasVal = (v) => v !== undefined && v !== null && v !== '';
                    const hasActualMarks = (hasVal(data.written) || hasVal(data.mcq) || hasVal(data.practical) || hasVal(data.total));
                    const isExplicitlyAbsent = data.status === 'অনুপস্থিত' || String(data.status).toLowerCase() === 'absent';
                    return hasActualMarks || isExplicitlyAbsent;
                }

                return false;
            };

            // If it's only in the optional list (and not general/group)
            // Show if student has marks OR is mapped to this subject
            if (isOpt && !isGeneral && !isGroup) {
                const hasData = checkMarks(subjName) || papers.some(p => checkMarks(p));
                // Show if has data OR if it's the only optional subject defined for this group
                if (!hasData && optSubs.length > 2) return false;
            }

            // Alternative Subject Logic (Electives)
            if (clsRules.alternativePairs && clsRules.alternativePairs.length > 0) {
                const matchedPairs = clsRules.alternativePairs.filter(p => {
                    const p1 = normalizeText(p.sub1);
                    const p2 = normalizeText(p.sub2);
                    if (p1 === normSubjName || p2 === normSubjName) return true;
                    if (papers.some(paper => normalizeText(paper) === p1 || normalizeText(paper) === p2)) return true;
                    return false;
                });

                if (matchedPairs.length > 0) {
                    let hasAnyPartnerMarks = false;
                    const hasCurrentMarks = checkMarks(subjName) || papers.some(p => checkMarks(p));

                    matchedPairs.forEach(altPair => {
                        const p1 = normalizeText(altPair.sub1);
                        const isP1Current = p1 === normSubjName || papers.some(paper => normalizeText(paper) === p1);
                        const partner = isP1Current ? altPair.sub2 : altPair.sub1;

                        if (checkMarks(partner)) {
                            hasAnyPartnerMarks = true;
                        }
                    });

                    // If any alternative partner is active (has marks or is mapped) and current is not, hide current
                    if (hasAnyPartnerMarks && !hasCurrentMarks) return false;
                }
            }

            // Filter out purely alternative/unmatched cross-group subjects
            return isGeneral || isGroup || isOpt;

        });

        // Iterate over the student's visibleSubjects 
        visibleSubjects.forEach(subjObj => {
            const isObj = typeof subjObj === 'object';
            const subjName = isObj ? (subjObj.name || subjObj.paper) : subjObj;
            const isOptional = isObj ? subjObj.isOptional : false;

            const isCompFail = (mark, passMark) => {
                if (!mark || mark === '-') return false;
                const m = parseFloat(mark) || 0;
                const p = parseFloat(passMark) || 0;
                return (p > 0 && m < p);
            };

            if (isCombinedMode && isObj && subjObj.isCombined) {
                const papers = subjObj.papers || [];
                const combinedData = student.subjects[subjName] || {};

                let isSubjectFail = false;
                papers.forEach(p => {
                    const pSubjKey = normalizeText(p).replace(/\s+/g, '');
                    const pData = student.subjects[pSubjKey] || {};
                    const pConfig = state.subjectConfigs?.[p] || {};

                    if (isCompFail(pData.written, pConfig.writtenPass) ||
                        isCompFail(pData.mcq, pConfig.mcqPass) ||
                        isCompFail(pData.practical, pConfig.practicalPass)) {
                        isSubjectFail = true;
                    }
                });

                let grade = combinedData.grade || 'F';
                let gp = (combinedData.gpa || 0);

                if (isSubjectFail) {
                    grade = 'F';
                    gp = 0;
                }

                if (combinedData.status === 'ফেল' || combinedData.status === 'fail') {
                    if (ms.boardStandardOptional === true) {
                        if (!isOptional) allPassed = false;
                    } else {
                        allPassed = false;
                    }
                }

                if (isOptional) {
                    if (grade !== 'F' && gp > 2.00) {
                        optionalBonus = Math.max(optionalBonus, gp - 2.00);
                    }
                    if (ms.boardStandardOptional !== true && grade === 'F') {
                        allPassed = false;
                    }
                } else {
                    compulsoryGPA += gp;
                    compulsoryCount++;
                    if (grade === 'F') allPassed = false;
                }

            } else {
                const sSubjKey = normalizeText(subjName).replace(/\s+/g, '');
                const data = student.subjects[sSubjKey] || {};
                const total = data.total || 0;

                const config = state.subjectConfigs?.[subjName] ||
                    Object.entries(state.subjectConfigs || {}).find(([k]) =>
                        normalizeText(k).replace(/\s+/g, '') === sSubjKey
                    )?.[1] || { total: 100 };
                const maxTotal = parseInt(config.total) || 100;
                const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

                let gp = getGradePoint(pct);
                let grade = getLetterGrade(pct);

                if (isCompFail(data.written, config.writtenPass) ||
                    isCompFail(data.mcq, config.mcqPass) ||
                    isCompFail(data.practical, config.practicalPass)) {
                    grade = 'F';
                    gp = 0;
                }

                if (data.status === 'ফেল' || data.status === 'fail') {
                    if (ms.boardStandardOptional === true) {
                        if (!isOptional) allPassed = false;
                    } else {
                        allPassed = false;
                    }
                }

                if (isCombinedMode) {
                    if (isOptional) {
                        if (grade !== 'F' && gp > 2.00) {
                            optionalBonus = Math.max(optionalBonus, gp - 2.00);
                        }
                        if (ms.boardStandardOptional !== true && grade === 'F') {
                            allPassed = false;
                        }
                    } else {
                        compulsoryGPA += gp;
                        compulsoryCount++;
                        if (grade === 'F') allPassed = false;
                    }
                } else {
                    if (isOptional) {
                        if (grade !== 'F' && gp > 2.00) {
                            optionalBonus = Math.max(optionalBonus, gp - 2.00);
                        }
                        if (ms.boardStandardOptional !== true && grade === 'F') {
                            allPassed = false;
                        }
                    } else {
                        compulsoryGPA += gp;
                        compulsoryCount++;
                        if (grade === 'F') allPassed = false;
                    }
                }
            }
        });

        // Final GPA (marksheet lines 943-948)
        let finalGPA = 0;
        if (compulsoryCount > 0) {
            finalGPA = Math.min(5.00, (compulsoryGPA + optionalBonus) / compulsoryCount);
        }

        const grade = getOverallGradeFromGPA(finalGPA, allPassed);

        if (allPassed) {
            gs.pass++;
            overallGrades[grade]++;
        } else {
            gs.fail++;
            overallGrades['F']++;
        }
    });

    gT = masterStudents.length;
    for (const gs of groupStats.values()) {
        gE += gs.examinees;
        gP += gs.pass;
        gF += gs.fail;
    }
    const pRate = gE > 0 ? ((gP / gE) * 100).toFixed(1) : '0.0';

    const todayDate = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });
    const dev = (await getSettings('developerCredit')) || {};
    const devH = (dev.enabled !== false && (dev.text || dev.name)) ? `<div class="rpt-dev-credit">${dev.text || ''} <strong>${dev.name || ''}</strong></div>` : '';

    const reportHtml = `
    <div class="rpt-page" id="rpt_page_main">
        <div class="rpt-inner">
            <div class="rpt-header">
                ${ms.watermarkUrl ? `<img src="${ms.watermarkUrl}" class="rpt-logo" alt="Logo">` :
            `<div class="rpt-logo-placeholder"><i class="fas fa-graduation-cap"></i></div>`}
                <div class="rpt-header-text">
                    <h1 class="rpt-inst-name">${ms.institutionName || 'শিক্ষা প্রতিষ্ঠানের নাম'}</h1>
                    ${ms.institutionAddress ? `<p class="rpt-inst-addr">${ms.institutionAddress}</p>` : ''}
                </div>
            </div>

            <div class="rpt-title-pill">
                <div class="rpt-pill-left">পরীক্ষার সামারি রিপোর্ট</div>
                <div class="rpt-pill-right">${examName} — ${rptSession}</div>
            </div>

            <div class="rpt-meta-row">
                <span class="rpt-meta-item"><i class="fas fa-graduation-cap"></i> শ্রেণি: <strong>${rptClass}</strong></span>
                <span class="rpt-meta-item"><i class="fas fa-calendar-alt"></i> সেশন: <strong>${rptSession}</strong></span>
                <span class="rpt-meta-item"><i class="fas fa-list"></i> মোট বিষয়: <strong>${convertToBengaliDigits(subjects.length)}</strong></span>
            </div>

            <div class="rpt-section">
                <div class="rpt-section-title">
                    <i class="fas fa-chart-bar"></i> সামগ্রিক ফলাফল পরিসংখ্যান
                    <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8; margin-left: 8px;">(সকল বিষয়ের পাশ মার্ক বিবেচনায়)</span>
                </div>
                <div class="rpt-stats-grid">
                    <div class="rpt-stat-card rpt-stat-total">
                        <div class="rpt-stat-icon"><i class="fas fa-users"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(gT)}</span>
                            <span class="rpt-stat-label">মোট শিক্ষার্থী</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-examinees">
                        <div class="rpt-stat-icon"><i class="fas fa-user-check"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(gE)}</span>
                            <span class="rpt-stat-label">পরীক্ষায় অংশগ্রহণ</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-pass">
                        <div class="rpt-stat-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(gP)} জন</span>
                            <span class="rpt-stat-label">সকল বিষয়ে পাশ</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-fail">
                        <div class="rpt-stat-icon"><i class="fas fa-times-circle"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(gF)} জন</span>
                            <span class="rpt-stat-label">ফেল</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-absent">
                        <div class="rpt-stat-icon"><i class="fas fa-user-minus"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(gT - gE)}</span>
                            <span class="rpt-stat-label">অনুপস্থিত</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card rpt-stat-rate">
                        <div class="rpt-stat-icon"><i class="fas fa-percentage"></i></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-value">${convertToBengaliDigits(pRate)}%</span>
                            <span class="rpt-stat-label">পাশের হার</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rpt-section">
                <div class="rpt-section-title">
                    <i class="fas fa-layer-group"></i> বিভাগভিত্তিক ফলাফল বিশ্লেষণ
                    <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8; margin-left: 8px;">(সকল বিষয়ের পাশ মার্ক বিবেচনায়)</span>
                </div>
                <table class="rpt-summary-table">
                    <thead>
                        <tr>
                            <th>বিভাগ</th><th>মোট</th><th>অংশগ্রহণ</th><th>অনুপস্থিত</th><th>পাশ</th><th>ফেল</th><th>পাশের হার</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...groupStats.entries()].map(([g, s]) => {
                const abs = s.total - s.examinees;
                const pr = s.examinees > 0 ? ((s.pass / s.examinees) * 100).toFixed(1) : '0.0';
                return `<tr>
                                <td class="rpt-group-name">${g}</td>
                                <td>${convertToBengaliDigits(s.total)}</td>
                                <td>${convertToBengaliDigits(s.examinees)}</td>
                                <td>${convertToBengaliDigits(abs)}</td>
                                <td class="rpt-td-pass">${convertToBengaliDigits(s.pass)}</td>
                                <td class="rpt-td-fail">${convertToBengaliDigits(s.fail)}</td>
                                <td class="rpt-td-rate">${convertToBengaliDigits(pr)}%</td>
                            </tr>`;
            }).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td>সর্বমোট</td>
                            <td>${convertToBengaliDigits(gT)}</td>
                            <td>${convertToBengaliDigits(gE)}</td>
                            <td>${convertToBengaliDigits(gT - gE)}</td>
                            <td class="rpt-td-pass">${convertToBengaliDigits(gP)}</td>
                            <td class="rpt-td-fail">${convertToBengaliDigits(gF)}</td>
                            <td class="rpt-td-rate">${convertToBengaliDigits(pRate)}%</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div class="rpt-section">
                <div class="rpt-section-title">
                    <i class="fas fa-medal"></i> গ্রেডিং পরিসংখ্যান
                    <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8; margin-left: 8px;">(সকল বিষয়ের পাশ মার্ক বিবেচনায়)</span>
                </div>
                <div class="rpt-grade-grid">
                    ${['A+', 'A', 'A-', 'B', 'C', 'D', 'F'].map(grade => {
                const count = overallGrades[grade] || 0;
                const gClass = grade === 'A+' ? 'aplus' : grade === 'A-' ? 'aminus' : grade.toLowerCase();
                return `
                        <div class="rpt-grade-item rpt-g-${gClass}">
                            <div class="rpt-grade-letter">${grade}</div>
                            <div class="rpt-grade-count">${convertToBengaliDigits(count)}</div>
                            <div class="rpt-grade-label">জন</div>
                        </div>`;
            }).join('')}
                </div>
            </div>

            <div class="rpt-section">
                <div class="rpt-section-title">
                    <i class="fas fa-book-open"></i> বিষয়ভিত্তিক বিস্তারিত ফলাফল 
                    <span style="margin-left: auto; font-size: 0.7rem; opacity: 0.9; font-weight: 600;">(মোট শিক্ষার্থী: ${convertToBengaliDigits(masterStudents.length)} জন)</span>
                </div>
                <div style="overflow-x: auto;">
                    <table class="rpt-subject-table">
                        <thead>
                            <tr>
                                <th rowspan="2" style="text-align: left !important; padding-left: 20px !important; background: #1e3a5f !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 950 !important;">বিষয়ের নাম</th>
                                <th rowspan="2" style="background: #1e3a5f !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 950 !important;">মোট</th>
                                <th rowspan="2" style="background: #1e3a5f !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 950 !important;">অনুপস্থিত</th>
                                <th rowspan="2" style="background: #1e3a5f !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 950 !important;">পরীক্ষার্থী</th>
                                <th colspan="4" style="background: #1e3a5f !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 950 !important;">Achievement</th>
                                <th rowspan="2" style="background: #065f46 !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 950 !important;">পাশ</th>
                                <th rowspan="2" style="background: #1e3a5f !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 950 !important;">হার</th>
                                <th rowspan="2" style="background: #1e3a5f !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 950 !important;">সর্বোচ্চ</th>
                            </tr>
                            <tr>
                                <th style="background: #065f46 !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 800 !important;">উত্তম(A+,A)</th>
                                <th style="background: #1e40af !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 800 !important;">মাঝারি(A-,B)</th>
                                <th style="background: #9a3412 !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 800 !important;">দুর্বল(C,D)</th>
                                <th style="background: #991b1b !important; color: #ffffff !important; border: 1px solid #ffffff33 !important; font-weight: 800 !important;">ফেল(F)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(() => {
            const generateRow = (subj) => {
                const examForSubj = relevantExams.find(e => e.subject === subj || e.subjectName === subj);
                if (!examForSubj || !examForSubj.studentData) return '';

                const cfg = specificConfigs.find(c => normalizeText(c.subjectName) === normalizeText(subj)) || null;
                const opts = {
                    writtenPass: cfg ? (Number(cfg.writtenPass) || 0) : FAILING_THRESHOLD.written,
                    mcqPass: cfg ? (Number(cfg.mcqPass) || 0) : FAILING_THRESHOLD.mcq,
                    practicalPass: cfg ? (Number(cfg.practicalPass) || 0) : 0,
                    totalPass: cfg ? (Number(cfg.totalPass) || 33) : 33
                };

                // SYNC: Filter target data exactly like the Dashboard Exam Card
                let targetData = examForSubj.studentData || [];
                const msSettingsForSubj = getMarksheetSettings() || {};
                const subjMappingsForSubj = msSettingsForSubj.subjectMapping || [];

                if (targetData.length > 0) {
                    targetData = targetData.filter(s => {
                        // 1. Check if student is active (Status check)
                        if (studentLookupMap) {
                            const studentKey = generateStudentDocId({
                                id: s.id,
                                group: s.group || '',
                                class: rptClass,
                                session: rptSession
                            });
                            const lookupEntry = studentLookupMap.get(studentKey);
                            if (lookupEntry && (lookupEntry.status === false || lookupEntry.status === 'false')) return false;
                        }
                        
                        // 2. Subject Mapping & Group Filtering Rules
                        return isStudentEligibleForSubject(s, subj, { 
                            subjectMappings: subjMappingsForSubj, 
                            marksheetRules: rules,
                            className: rptClass || 'HSC'
                        });
                    });
                }

                // Use the EXACT same calculation helper as Dashboard Exam Cards on the FILTERED data
                const stats = calculateStatistics(targetData, opts);
                const gd = stats.gradeDistribution || {};

                // Map Grading Scale to Achievement Columns
                const excellent = (gd['A+'] || 0) + (gd['A'] || 0);
                const mid = (gd['A-'] || 0) + (gd['B'] || 0);
                const weak = (gd['C'] || 0) + (gd['D'] || 0);
                const failCount = gd['F'] || 0;

                // Find highest mark manually from the FILTERED target dataset
                let highest = 0;
                targetData.forEach(s => {
                    const total = Number(s.total) || (Number(s.written || 0) + Number(s.mcq || 0) + Number(s.practical || 0));
                    if (total > highest) highest = total;
                });

                const passRate = stats.participants > 0 ? ((stats.passedStudents / stats.participants) * 100).toFixed(1) : '0.0';

                return `<tr>
                        <td style="text-align: left !important; padding-left: 20px !important; font-weight: 500; color: #334155;">${subj}</td>
                        <td style="color: #475569; font-weight: 700; background: #f8fafc;">${convertToBengaliDigits(stats.totalStudents)}</td>
                        <td style="color: #ef4444; font-weight: 700;">${convertToBengaliDigits(stats.absentStudents)}</td>
                        <td style="color: #0f172a; font-weight: 800;">${convertToBengaliDigits(stats.participants)}</td>
                        <td><span style="font-weight: 700;">${convertToBengaliDigits(excellent)}</span></td>
                        <td><span style="font-weight: 700;">${convertToBengaliDigits(mid)}</span></td>
                        <td><span style="font-weight: 700;">${convertToBengaliDigits(weak)}</span></td>
                        <td style="color: #dc2626; font-weight: 700; background: #fef2f2;">${convertToBengaliDigits(failCount)}</td>
                        <td style="color: #166534; font-weight: 700; background: #f0fdf4;">${convertToBengaliDigits(stats.passedStudents)}</td>
                        <td style="font-weight: 700; color: #475569;">${convertToBengaliDigits(passRate)}%</td>
                        <td style="color: #4f46e5; font-weight: 700;">${convertToBengaliDigits(highest)}</td>
                    </tr>`;
            };

            return subjects.map(subj => generateRow(subj)).join('');
        })()}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="rpt-footer">তারিখ: ${todayDate}${devH}</div>
        </div>
    </div>`;
    document.getElementById('reportPreview').innerHTML = reportHtml;
    document.getElementById('rptPreviewHeader').style.display = 'flex';
    document.getElementById('rptPrintBtn').style.display = 'inline-flex';
    showNotification('রিপোর্ট সফলভাবে তৈরি হয়েছে ✅');
}

export function openReportSettings() {
    const modal = document.getElementById('reportSettingsModal');
    if (!modal) {
        console.error('Report settings modal not found in HTML');
        return;
    }

    const list = document.getElementById('reportSubjectVisibilityList');
    if (list) {
        const ms = getMarksheetSettings();
        // Use normalized set for comparison
        const hiddenSet = new Set((ms.reportHiddenSubjects || []).map(s => normalizeText(s)));

        const reportConsiderOptional = document.getElementById('reportConsiderOptional');
        if (reportConsiderOptional) {
            reportConsiderOptional.checked = ms.reportConsiderOptional === true;
        }

        if (!lastGeneratedSubjects || lastGeneratedSubjects.length === 0) {
            list.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #64748b;">
                    <i class="fas fa-info-circle" style="font-size: 1.5rem; margin-bottom: 10px; display: block;"></i>
                    <p>প্রথমে একটি রিপোর্ট তৈরি করুন যাতে বিষয়ের তালিকা পাওয়া যায়।</p>
                </div>`;
        } else {
            list.innerHTML = lastGeneratedSubjects.map(subj => {
                const isHidden = hiddenSet.has(normalizeText(subj));
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-color, #f1f5f9); background: var(--card-bg, transparent);">
                        <span style="font-weight: 600; color: var(--text-color, #1e293b);">${subj}</span>
                        <label class="toggle-switch">
                            <input type="checkbox" class="report-subject-toggle" value="${subj}" ${!isHidden ? 'checked' : ''}>
                            <span class="toggle-slider round"></span>
                        </label>
                    </div>`;
            }).join('');
        }
    }

    modal.classList.add('active');
}

export function closeReportSettings() {
    const modal = document.getElementById('reportSettingsModal');
    if (modal) modal.classList.remove('active');
}

export async function saveReportSettings() {
    const toggles = document.querySelectorAll('.report-subject-toggle');
    const hiddenSubjects = [];
    toggles.forEach(t => {
        if (!t.checked) hiddenSubjects.push(t.value);
    });

    const considerOptional = document.getElementById('reportConsiderOptional')?.checked || false;

    const { saveMarksheetSettings } = await import('./marksheetManager.js');
    await saveMarksheetSettings({
        reportHiddenSubjects: hiddenSubjects,
        reportConsiderOptional: considerOptional
    });

    showNotification('রিপোর্ট সেটিংস সংরক্ষিত হয়েছে ✅');
    closeReportSettings();

    // Auto-refresh report if we have subjects
    if (lastGeneratedSubjects && lastGeneratedSubjects.length > 0) {
        generateReport();
    }
}

export function initReportManager() {
    const genBtn = document.getElementById('rptGenerateBtn');
    if (genBtn) genBtn.onclick = generateReport;

    const setBtn = document.getElementById('reportSettingsBtn');
    if (setBtn) {
        setBtn.onclick = openReportSettings;
        setBtn.style.display = 'block'; // Ensure it's visible
    }

    const rstBtn = document.getElementById('rptResetBtn');
    if (rstBtn) {
        rstBtn.onclick = () => {
            ['rptClass', 'rptSession', 'rptExamName'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const prev = document.getElementById('reportPreview');
            if (prev) prev.innerHTML = '';
            const head = document.getElementById('rptPreviewHeader');
            if (head) head.style.display = 'none';
        };
    }

    const saveSetBtn = document.getElementById('saveReportSettingsBtn');
    if (saveSetBtn) saveSetBtn.onclick = saveReportSettings;

    const closeSetBtn = document.getElementById('closeReportSettingsBtn');
    if (closeSetBtn) closeSetBtn.onclick = closeReportSettings;

    const prntBtn = document.getElementById('rptPrintBtn');
    if (prntBtn) {
        prntBtn.onclick = () => {
            document.body.classList.add('printing-report');
            window.print();
            document.body.classList.remove('printing-report');
        };
    }

    // Load dropdowns on init
    populateReportDropdowns();
}

window.initReportManager = initReportManager;
window.generateReport = generateReport;
window.openReportSettings = openReportSettings;
window.closeReportSettings = closeReportSettings;
window.saveReportSettings = saveReportSettings;
