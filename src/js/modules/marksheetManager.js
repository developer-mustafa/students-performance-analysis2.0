/**
 * Marksheet Manager Module
 * Generates professional Bangladeshi HSC-style marksheets 
 * @module marksheetManager
 */

import {
    getSavedExams,
    getExamConfigs,
    getSettings,
    getStudentLookupMap,
    generateStudentDocId,
    getClassSubjectMappings
} from '../firestoreService.js';
import { state } from './state.js';
import { showNotification, convertToEnglishDigits, normalizeText } from '../utils.js';
import { compressImage } from '../imageUtils.js';
import QRCode from 'qrcode';
import { generateStudentUniqueId } from './studentResultsManager.js';
import { loadMarksheetRules, currentMarksheetRules } from './marksheetRulesManager.js';
import { showConfirmModal } from './uiManager.js';

let marksheetSettings = {
    institutionName: '',
    institutionAddress: '',
    headerLine1: 'পরীক্ষার ফলাফল পত্র',
    watermarkUrl: '',
    watermarkOpacity: 0.1,
    primaryColor: '#4361ee',
    fontSize: 'medium',
    theme: 'classic',
    borderStyle: 'double',
    typography: 'default',
    rowDensity: 'normal',
    hiddenSubjects: [],
    historyExams: [],
    showSummary: true,
    showGradeScale: true,
    signatures: [
        { label: 'শ্রেণি শিক্ষক', url: '' },
        { label: 'পরীক্ষা কমিটি', url: '' },
        { label: 'অধ্যক্ষ', url: '' }
    ]
};

/**
 * Get current marksheet settings
 */
export function getMarksheetSettings() {
    return marksheetSettings;
}

/**
 * Load marksheet settings from Firestore
 */
export async function loadMarksheetSettings() {
    try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../firebase.js');
        const docRef = doc(db, 'settings', 'marksheet_config');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            Object.assign(marksheetSettings, snap.data());
            try { localStorage.setItem('pa_marksheet_settings', JSON.stringify(marksheetSettings)); } catch (e) { }
        }
    } catch (e) {
        console.warn('মার্কশীট সেটিংস লোড করা যায়নি, ডিফল্ট ব্যবহার হচ্ছে');
    }
}

/**
 * Subscribe to marksheet settings changes
 * @param {Function} callback - Callback function for settings updates
 * @returns {Function} - Unsubscribe function
 */
export async function subscribeToMarksheetSettings(callback) {
    const { doc, onSnapshot } = await import('firebase/firestore');
    const { db } = await import('../firebase.js');
    const docRef = doc(db, 'settings', 'marksheet_config');

    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            Object.assign(marksheetSettings, docSnap.data());
            try { localStorage.setItem('pa_marksheet_settings', JSON.stringify(marksheetSettings)); } catch (e) { }
            if (callback) callback(marksheetSettings);
        }
    });
}

/**
 * Save marksheet settings to Firestore
 */
export async function saveMarksheetSettings(settings) {
    try {
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('../firebase.js');
        const docRef = doc(db, 'settings', 'marksheet_config');
        await setDoc(docRef, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
        Object.assign(marksheetSettings, settings);
        try { localStorage.setItem('pa_marksheet_settings', JSON.stringify(marksheetSettings)); } catch (e) { }
        showNotification('মার্কশীট সেটিংস সংরক্ষণ হয়েছে ✅');
        return true;
    } catch (e) {
        console.error('মার্কশীট সেটিংস সংরক্ষণ সমস্যা:', e);
        return false;
    }
}

/**
 * Populate marksheet page dropdowns
 */
export async function populateMSDropdowns() {
    const exams = await getSavedExams();

    const classes = [...new Set(exams.map(e => e.class).filter(Boolean))].sort();
    const sessions = [...new Set(exams.map(e => e.session).filter(Boolean))].sort().reverse();

    const classSelect = document.getElementById('msClass');
    const sessionSelect = document.getElementById('msSession');

    if (classSelect) {
        classSelect.innerHTML = '<option value="">শ্রেণি নির্বাচন</option>';
        classes.forEach(c => classSelect.innerHTML += `<option value="${c}">${c}</option>`);
        // Auto-select if only 1
        if (classes.length === 1) classSelect.value = classes[0];
    }

    if (sessionSelect) {
        sessionSelect.innerHTML = '<option value="">সেশন নির্বাচন</option>';
        sessions.forEach(s => sessionSelect.innerHTML += `<option value="${s}">${s}</option>`);
        if (sessions.length === 1) sessionSelect.value = sessions[0];
    }

    let currentFilteredExams = [];

    const updateGroupDropdown = () => {
        const msGroup = document.getElementById('msGroup');
        if (msGroup) {
            const currentVal = msGroup.value;
            msGroup.innerHTML = '<option value="all">সকল গ্রুপ</option>';
            const groups = new Set();
            currentFilteredExams.forEach(exam => {
                if (exam.studentData) {
                    exam.studentData.forEach(s => {
                        if (s.group) groups.add(s.group);
                    });
                }
            });
            const sortedGroups = [...groups].sort();
            sortedGroups.forEach(g => {
                const selected = g === currentVal ? 'selected' : '';
                msGroup.innerHTML += `<option value="${g}" ${selected}>${g}</option>`;
            });
        }
    };

    const updateStudentDropdown = () => {
        const msGroup = document.getElementById('msGroup')?.value || 'all';
        const studentMap = new Map();
        currentFilteredExams.forEach(exam => {
            if (exam.studentData) {
                exam.studentData.forEach(async s => {
                    const sGroup = s.group || '';
                    if (msGroup !== 'all' && sGroup !== msGroup) return;

                    const key = `${s.id}_${sGroup}`;
                    if (!studentMap.has(key)) {
                        // We can't easily do async inside forEach like this if we want it to be fast
                        // But populateMSDropdowns is already async. 
                        // Wait, updateStudentDropdown is defined inside populateMSDropdowns.
                        studentMap.set(key, { id: s.id, name: s.name, group: sGroup });
                    }
                });
            }
        });
        const studentSelect = document.getElementById('msStudent');
        if (studentSelect) {
            studentSelect.innerHTML = '<option value="all">সকল শিক্ষার্থী</option>';

            // Get lookup map for names
            getStudentLookupMap().then(lookupMap => {
                [...studentMap.values()].sort((a, b) => {
                    const groupA = a.group.toLowerCase();
                    const groupB = b.group.toLowerCase();
                    if (groupA < groupB) return -1;
                    if (groupA > groupB) return 1;

                    return (parseInt(convertToEnglishDigits(String(a.id))) || 0) - (parseInt(convertToEnglishDigits(String(b.id))) || 0);
                }).forEach(s => {
                    const studentKey = generateStudentDocId({
                        id: s.id,
                        group: s.group,
                        class: classSelect.value,
                        session: sessionSelect.value
                    });
                    const latest = lookupMap.get(studentKey);
                    
                    // Skip inactive students
                    if (latest && String(latest.status) === 'false') return;
                    
                    const displayName = latest ? (latest.name || s.name) : s.name;
                    studentSelect.innerHTML += `<option value="${s.id}_${s.group}">${s.id} - ${displayName}</option>`;
                });
            });
        }
    };

    const updateExamNames = async () => {
        const selClass = classSelect?.value;
        const selSession = sessionSelect?.value;
        const examSelect = document.getElementById('msExamName');

        if (examSelect) {
            if (!selClass || !selSession) {
                examSelect.innerHTML = '<option value="">শ্রেণি ও সেশন নির্বাচন</option>';
                currentFilteredExams = [];
                updateGroupDropdown();
                updateStudentDropdown();
                return;
            }

            examSelect.innerHTML = '<option value="">লোড হচ্ছে...</option>';

            const configs = await getExamConfigs(selClass, selSession);
            const examNames = configs.map(c => c.examName);

            examSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন</option>';
            if (examNames.length > 0) {
                examSelect.innerHTML += '<option value="__all__">সব পরীক্ষা (Combined)</option>';
                examNames.forEach(n => examSelect.innerHTML += `<option value="${n}">${n}</option>`);
            } else {
                examSelect.innerHTML = '<option value="">কোনো পরীক্ষা তৈরি করা নেই</option>';
            }
        }

        currentFilteredExams = exams.filter(e =>
            (!selClass || e.class === selClass) &&
            (!selSession || e.session === selSession)
        );

        updateGroupDropdown();
        updateStudentDropdown();
    };

    const msGroupEl = document.getElementById('msGroup');
    if (msGroupEl) {
        msGroupEl.addEventListener('change', updateStudentDropdown);
    }

    if (classSelect) classSelect.addEventListener('change', updateExamNames);
    if (sessionSelect) sessionSelect.addEventListener('change', updateExamNames);

    // Trigger initial update
    updateExamNames();
}

// Cache to prevent O(N^2) recalculations during batch generation
const _examRankCache = new Map();

/**
 * Generate marksheets
 */
async function generateMarksheets() {
    _examRankCache.clear(); // Clear cache at start of new generation
    const cls = document.getElementById('msClass')?.value;
    const session = document.getElementById('msSession')?.value;
    const examName = document.getElementById('msExamName')?.value;
    const selectedGroup = document.getElementById('msGroup')?.value || 'all';
    const studentSelection = document.getElementById('msStudent')?.value || 'all';

    if (!cls || !session) {
        showNotification('শ্রেণি ও সেশন নির্বাচন করুন', 'error');
        return;
    }

    await loadMarksheetSettings();

    // Load developer credit settings properly before rendering
    const globalSettings = await getSettings();
    state.developerCredit = globalSettings?.developerCredit || null;

    const allExams = await getSavedExams();
    let relevantExams = allExams.filter(e => e.class === cls && e.session === session);

    if (examName && examName !== '__all__') {
        relevantExams = relevantExams.filter(e => e.name === examName);
    }

    if (relevantExams.length === 0) {
        showNotification('নির্বাচিত তথ্য অনুযায়ী কোনো পরীক্ষা পাওয়া যায়নি', 'error');
        return;
    }

    const lookupMap = await getStudentLookupMap();

    const subjectsSet = new Set(relevantExams.map(e => e.subject).filter(Boolean));
    let subjects = [...subjectsSet];

    let allOptSubs = [];
    // --- Hierarchical Subject Sorting Logic ---
    try {
        await loadMarksheetRules();
        const rules = currentMarksheetRules[cls] || currentMarksheetRules["All"] || {};

        const generalSubjects = rules.generalSubjects || [];
        const groupSubjects = (rules.groupSubjects || {})[selectedGroup] || [];
        // Flatten all group subjects if "all" groups selected
        const allGroupSubs = selectedGroup === 'all'
            ? Object.values(rules.groupSubjects || {}).flat()
            : groupSubjects;

        const optionalSubjects = (rules.optionalSubjects || {})[selectedGroup] || [];
        allOptSubs = selectedGroup === 'all'
            ? Object.values(rules.optionalSubjects || {}).flat()
            : optionalSubjects;

        subjects.sort((a, b) => {
            const getScore = (sub) => {
                // 1. General Subjects (Highest Priority)
                const genIdx = generalSubjects.indexOf(sub);
                if (genIdx !== -1) return 1000 + genIdx;

                // Hardcoded fallback for common general subjects if not in rules
                const hardcodedGen = ['বাংলা ১ম পত্র', 'বাংলা ২য় পত্র', 'ইংরেজি ১ম পত্র', 'ইংরেজি ২য় পত্র', 'তথ্য ও যোগাযোগ প্রযুক্তি'];
                const hardIdx = hardcodedGen.indexOf(sub);
                if (hardIdx !== -1) return 1100 + hardIdx;

                // 2. Group Subjects
                if (allGroupSubs.some(gs => sub.includes(gs) || gs.includes(sub))) return 2000;

                // 3. Everything else
                // Check if it's optional first, if not, it's "else"
                const isOptional = allOptSubs.some(os => sub.includes(os) || os.includes(sub));
                if (isOptional) return 5000; // Always at the end

                return 3000;
            };

            const scoreA = getScore(a);
            const scoreB = getScore(b);

            if (scoreA !== scoreB) return scoreA - scoreB;
            return a.localeCompare(b, 'bn'); // Alphabetical within same tier
        });
    } catch (err) {
        console.warn("Subject sorting failed, using default order", err);
    }
    // ------------------------------------------

    // Build student aggregation (UNFILTERED - for accurate exam summary)
    const studentAgg = new Map();
    relevantExams.forEach(exam => {
        if (exam.studentData) {
            exam.studentData.forEach(s => {
                // Standardize group and roll for consistent keying
                const sGroup = normalizeText(s.group || '');
                const sRoll = convertToEnglishDigits(String(s.id || '').trim().replace(/^0+/, '')) || '0';
                const key = `${sRoll}_${sGroup}`;

                if (!studentAgg.has(key)) {
                    const studentKey = generateStudentDocId({
                        id: s.id,
                        group: sGroup,
                        class: cls,
                        session: session
                    });
                    const latest = lookupMap.get(studentKey);

                    studentAgg.set(key, {
                        id: s.id,
                        name: latest ? (latest.name || s.name) : s.name,
                        group: sGroup,
                        class: cls,
                        session: session,
                        status: latest ? (latest.status !== undefined ? latest.status : true) : true,
                        subjects: {}
                    });
                }

                // Get existing subject data if any
                const subjKey = normalizeText(exam.subject).replace(/\s+/g, '') || exam.subject;
                const existingSubData = studentAgg.get(key).subjects[subjKey];

                // Only overwrite or update if the new exam has actual marks or if no data exists yet.
                const hasMarks = (s.written !== null && s.written !== '' && s.written > 0) ||
                    (s.mcq !== null && s.mcq !== '' && s.mcq > 0) ||
                    (s.practical !== null && s.practical !== '' && s.practical > 0);

                if (!existingSubData || hasMarks) {
                    studentAgg.get(key).subjects[subjKey] = {
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

    // ALL active students for the exam summary (unfiltered by group/student)
    const allStudentsForSummary = [...studentAgg.values()]
        .filter(s => String(s.status) !== 'false')
        .sort((a, b) => {
            const groupA = a.group.toLowerCase();
            const groupB = b.group.toLowerCase();
            if (groupA < groupB) return -1;
            if (groupA > groupB) return 1;
            return (parseInt(convertToEnglishDigits(String(a.id))) || 0) - (parseInt(convertToEnglishDigits(String(b.id))) || 0);
        });

    // Filtered students for DISPLAY (apply group + individual student filter)
    let studentsArray = allStudentsForSummary.filter(s => {
        if (selectedGroup !== 'all' && s.group !== selectedGroup) return false;
        return true;
    });

    if (studentSelection !== 'all') {
        studentsArray = studentsArray.filter(s => {
            const sRollForSel = convertToEnglishDigits(String(s.id));
            const sGroupForSel = normalizeText(s.group || '');
            return `${sRollForSel}_${sGroupForSel}` === studentSelection;
        });
    }

    if (studentsArray.length === 0) {
        showNotification('শিক্ষার্থী পাওয়া যায়নি', 'error');
        return;
    }

    const examDisplayName = examName === '__all__' ? 'সমন্বিত ফলাফল' : (examName || 'পরীক্ষা');

    // --- Combined Paper Logic Integration ---
    let displaySubjects = subjects;
    let rules = {};
    try {
        rules = currentMarksheetRules[cls] || currentMarksheetRules["All"] || {};
        if (rules.mode === 'combined' && rules.combinedSubjects?.length > 0) {
            displaySubjects = applyCombinedPaperLogic(studentsArray, subjects, rules, allOptSubs);
        } else {
            // Standard mode: wrap strings in objects for consistent processing if desired, 
            // but let's keep renderSingleMarksheet flexible.
        }
    } catch (err) {
        console.error("Combined paper logic failed:", err);
    }
    // ------------------------------------------

    const previewArea = document.getElementById('marksheetPreview');
    const subjectConfigs = await getExamConfigs() || {};

    // --- Exam Summary: Two-Pass Rendering for 100% Accuracy ---
    // Pass 1: Render ALL active students' marksheets (without summary) to count pass/fail
    //         This ensures the summary uses the EXACT same logic as each marksheet's own
    //         pass/fail determination (including hidden subjects, optional handling,
    //         combined papers, component pass marks, etc.)
    const allRenderedData = [];
    for (const student of allStudentsForSummary) {
        const html = await renderSingleMarksheet(student, displaySubjects, examDisplayName, session, null, rules, allOptSubs, allExams, subjectConfigs, null, false);
        allRenderedData.push({
            html,
            key: `${student.id}_${student.group}`,
            group: student.group,
            subjects: student.subjects
        });
    }

    // Count totals from rendered marksheets — GROUP-WISE breakdown
    const groupStats = new Map();
    const overallGradeCounts = { 'A+': 0, 'A': 0, 'A-': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };

    for (const item of allRenderedData) {
        const group = item.group || 'অন্যান্য';
        if (!groupStats.has(group)) {
            groupStats.set(group, { total: 0, examinees: 0, pass: 0, fail: 0 });
        }
        const gs = groupStats.get(group);
        gs.total++;

        // A student is an "examinee" if they have ANY non-zero marks in ANY subject criteria
        const hasAnyMarks = Object.values(item.subjects).some(data =>
            ((data.written || 0) > 0 || (data.mcq || 0) > 0 || (data.practical || 0) > 0 || (data.total || 0) > 0)
        );
        if (!hasAnyMarks) continue;

        gs.examinees++;

        // Count pass/fail by detecting the CSS class from the rendered marksheet HTML
        if (item.html.includes('ms-result-pass')) {
            gs.pass++;
            const match = item.html.match(/<span class="ms-result-label">গ্রেড<\/span>\s*<span class="ms-result-value">\s*(A\+|A|A-|B|C|D)\s*<\/span>/);
            if (match && overallGradeCounts[match[1]] !== undefined) {
                overallGradeCounts[match[1]]++;
            }
        } else if (item.html.includes('ms-result-fail')) {
            gs.fail++;
            overallGradeCounts['F']++;
        }
    }

    // Compute grand totals
    let grandTotalStudents = 0, grandExaminees = 0, grandAbsent = 0, grandPass = 0, grandFail = 0;
    for (const [, gs] of groupStats) {
        const absent = gs.total - gs.examinees;
        grandTotalStudents += gs.total;
        grandExaminees += gs.examinees;
        grandAbsent += absent;
        grandPass += gs.pass;
        grandFail += gs.fail;
    }
    const grandPassRate = grandExaminees > 0 ? ((grandPass / grandExaminees) * 100).toFixed(1) : '0.0';

    // Build group rows for summary table
    const groupRowsHtml = [...groupStats.entries()].map(([group, gs]) => {
        const absent = gs.total - gs.examinees;
        const passRate = gs.examinees > 0 ? ((gs.pass / gs.examinees) * 100).toFixed(1) : '0.0';
        return `<tr>
            <td>${group}</td>
            <td>${gs.total}</td>
            <td>${gs.examinees}</td>
            <td>${absent}</td>
            <td class="ms-sumtbl-pass">${gs.pass}</td>
            <td class="ms-sumtbl-fail">${gs.fail}</td>
            <td class="ms-sumtbl-rate">${passRate}%</td>
        </tr>`;
    }).join('');

    // Build exam summary TABLE HTML
    const examSummaryHtml = `
        <div class="ms-exam-summary-section">
            <table class="ms-exam-summary-tbl">
                <caption>পরীক্ষার ফলাফল সামারি</caption>
                <thead>
                    <tr>
                        <th>বিভাগ</th>
                        <th>মোট</th>
                        <th>পরীক্ষার্থী</th>
                        <th>অনুপস্থিত</th>
                        <th>পাশ</th>
                        <th>ফেল</th>
                        <th>পাশের হার</th>
                    </tr>
                </thead>
                <tbody>
                    ${groupRowsHtml}
                </tbody>
                <tfoot>
                    <tr>
                        <td>সর্বমোট</td>
                        <td>${grandTotalStudents}</td>
                        <td>${grandExaminees}</td>
                        <td>${grandAbsent}</td>
                        <td class="ms-sumtbl-pass">${grandPass}</td>
                        <td class="ms-sumtbl-fail">${grandFail}</td>
                        <td class="ms-sumtbl-rate">${grandPassRate}%</td>
                    </tr>
                </tfoot>
            </table>
        </div>`;

    // Pass 2: Select marksheets to display and inject the summary and grade counts
    let displayItems = allRenderedData;
    // Apply group filter
    if (selectedGroup !== 'all') {
        displayItems = displayItems.filter(item => item.group === selectedGroup);
    }
    // Apply individual student filter
    if (studentSelection !== 'all') {
        displayItems = displayItems.filter(item => item.key === studentSelection);
    }

    const marksheetsHtml = displayItems.map(item => {
        const ms = getMarksheetSettings();
        let finalHtml = item.html;

        // Handle Summary Section
        if (ms.showSummary !== false) {
            finalHtml = finalHtml.replace('<!--EXAM_SUMMARY_PLACEHOLDER-->', examSummaryHtml);
        } else {
            finalHtml = finalHtml.replace('<!--EXAM_SUMMARY_PLACEHOLDER-->', '');
        }

        // Handle Grade Scale Counts
        finalHtml = finalHtml.replace('<!--GS_AP-->', overallGradeCounts['A+']);
        finalHtml = finalHtml.replace('<!--GS_A-->', overallGradeCounts['A']);
        finalHtml = finalHtml.replace('<!--GS_AM-->', overallGradeCounts['A-']);
        finalHtml = finalHtml.replace('<!--GS_B-->', overallGradeCounts['B']);
        finalHtml = finalHtml.replace('<!--GS_C-->', overallGradeCounts['C']);
        finalHtml = finalHtml.replace('<!--GS_D-->', overallGradeCounts['D']);
        finalHtml = finalHtml.replace('<!--GS_F-->', overallGradeCounts['F']);

        return finalHtml;
    }).join('');
    // --- End Exam Summary ---

    previewArea.innerHTML = marksheetsHtml;

    // Render QRs - Explicitly await to ensure they exist before user can print
    try {
        await renderMarksheetQRCodes(previewArea);
    } catch (qrErr) {
        console.error("QR rendering failed in main flow:", qrErr);
    }

    // Show bulk print buttons
    const bulkBtn = document.getElementById('msPrintAllBtn');
    const presentBtn = document.getElementById('msPrintPresentBtn');
    const absentBtn = document.getElementById('msPrintAbsentBtn');

    if (bulkBtn) bulkBtn.style.display = 'inline-flex';
    if (presentBtn) presentBtn.style.display = 'inline-flex';
    if (absentBtn) absentBtn.style.display = 'inline-flex';

    showNotification(`${displayItems.length} জন শিক্ষার্থীর মার্কশীট তৈরি হয়েছে ✅`);

    // ... (rest of the function)

    // Show main zoom header
    const mainHeader = document.getElementById('msMainPreviewHeader');
    if (mainHeader) {
        mainHeader.style.display = 'flex';
        // Auto-fit check for mobile
        if (window.innerWidth <= 768) {
            const zoomInput = document.getElementById('msMainZoom');
            const zoomLevelValue = document.getElementById('msMainZoomLevel');
            const initialScale = window.innerWidth <= 480 ? 0.48 : 0.58;
            if (zoomInput) zoomInput.value = initialScale;
            if (zoomLevelValue) zoomLevelValue.innerText = Math.round(initialScale * 100) + '%';
            previewArea.style.setProperty('--ms-main-scale', initialScale);
        }
    }

    // Update internal state of subjects seen during this generation
    state.lastGeneratedSubjects = displaySubjects;
    renderSubjectVisibilityToggles();
}

/**
 * Calculate merit rank for a student across all relevant exams.
 * 
 * ⚠️ CRITICAL MAINTENANCE NOTE:
 * This function calculates GPA independently for ranking purposes.
 * The same GPA calculation also exists in renderSingleMarksheet() (~line 1016+).
 * If you change GPA logic here, you MUST also update renderSingleMarksheet()
 * and vice versa, otherwise displayed GPA won't match ranking GPA.
 * 
 * Key shared functions: getGradePoint(), getLetterGrade(), getGradeFromGP()
 * Key shared rules: optionalSubjects, writtenPass/mcqPass/practicalPass
 */
async function getStudentExamsHistory(student, allExams, cls, session, rules, subjectConfigs) {
    const studentHistory = [];
    if (!allExams || !Array.isArray(allExams)) return [];

    const norm = (txt) => (txt || '').trim().toLowerCase();
    const toEng = (txt) => convertToEnglishDigits(String(txt || ''));

    // Cache key includes hidden subjects so rank recalculates when subjects change
    const hiddenKey = (marksheetSettings.hiddenSubjects || []).sort().join(',');
    const cacheKeyBase = `${cls}_${session}_h${hiddenKey}`;
    
    let examSessions = [...new Set(allExams.filter(e => e.class === cls && e.session === session).map(e => e.name))];
    if (marksheetSettings.historyExams && marksheetSettings.historyExams.length > 0) {
        examSessions = examSessions.filter(name => marksheetSettings.historyExams.includes(name));
    }

    for (const examName of examSessions) {
        const cacheKey = `${cacheKeyBase}_${examName}`;
        let results = _examRankCache.get(cacheKey);

        if (!results) {
            const sessionExams = allExams.filter(e => e.class === cls && e.session === session && e.name === examName);
            // Filter out hidden subjects so ranking uses SAME subjects as marksheet display
            const hiddenSet = new Set((marksheetSettings.hiddenSubjects || []).map(s => norm(s)));
            const subjectsInSession = [...new Set(sessionExams.map(e => e.subject).filter(Boolean))]
                .filter(subj => !hiddenSet.has(norm(subj)));

            const studentsInSession = new Map();
            sessionExams.forEach(ex => {
                if (!ex.studentData) return;
                ex.studentData.forEach(s => {
                    const sId = toEng(s.id);
                    const sGroup = norm(s.group);
                    const key = `${sId}_${sGroup}`;
                    if (!studentsInSession.has(key)) {
                        studentsInSession.set(key, { id: sId, name: s.name, group: sGroup, originalGroup: s.group, subjects: {} });
                    }
                    const currentSubs = studentsInSession.get(key).subjects;
                    const existing = currentSubs[ex.subject];
                    const hasBetterMarks = !existing || (parseFloat(s.total) || 0) > (parseFloat(existing.total) || 0);
                    if (hasBetterMarks) {
                        currentSubs[ex.subject] = s;
                    }
                });
            });

            const tempResults = [];
            studentsInSession.forEach(st => {
                let totalMarks = 0;
                let totalGPA = 0;
                let compulsoryGPA = 0;
                let compulsoryCount = 0;
                let optionalBonus = 0;
                let allPassed = true;
                let visibleCount = 0;
                let failedCount = 0;
                let allAbsent = true;

                subjectsInSession.forEach(subj => {
                    const data = st.subjects[subj];
                    if (!data) return;

                    const sTotal = parseFloat(data.total) || 0;
                    totalMarks += sTotal;

                    // A student is "present" if:
                    // 1. They have marks > 0, OR
                    // 2. Their status is NOT explicitly 'absent'/'অনুপস্থিত'
                    // Note: 0 marks + empty status = present (scored 0 while attending)
                    // Only explicit 'অনুপস্থিত' status = absent
                    const status = (data.status || '').toLowerCase();
                    if (sTotal > 0 || !(status === 'absent' || status === 'অনুপস্থিত')) {
                        allAbsent = false;
                    }

                    const config = subjectConfigs?.[subj] || { total: 100 };
                    const maxTotal = parseInt(config.total) || 100;
                    const pct = maxTotal > 0 ? (sTotal / maxTotal) * 100 : 0;
                    const gp = getGradePoint(pct);
                    const grade = getLetterGrade(pct);

                    let isFail = (grade === 'F');
                    if (data.written !== undefined && config.writtenPass !== undefined && parseFloat(data.written) < parseFloat(config.writtenPass)) isFail = true;
                    if (data.mcq !== undefined && config.mcqPass !== undefined && parseFloat(data.mcq) < parseFloat(config.mcqPass)) isFail = true;
                    if (data.practical !== undefined && config.practicalPass !== undefined && parseFloat(data.practical) < parseFloat(config.practicalPass)) isFail = true;
                    // Also check explicit fail status from data entry
                    if (status === 'ফেল' || status === 'fail') isFail = true;

                    const studentGroup = st.originalGroup || '';
                    const optionalSubsObj = rules?.optionalSubjects || {};
                    const optKey = Object.keys(optionalSubsObj).find(k => norm(k) === norm(studentGroup) || norm(k).includes(norm(studentGroup)) || norm(studentGroup).includes(norm(k))) || studentGroup;
                    const optSubs = (optionalSubsObj[optKey] || []).map(os => norm(os));
                    // Fix: Safer substring matching — require >60% length overlap to prevent
                    // false matches like "গণিত" matching "উচ্চতর গণিত"
                    const isOptional = optSubs.some(os => {
                        const ns = norm(subj);
                        if (ns === os) return true;
                        const shorter = Math.min(ns.length, os.length);
                        const longer = Math.max(ns.length, os.length);
                        if (longer === 0 || shorter / longer < 0.6) return false;
                        return ns.includes(os) || os.includes(ns);
                    });

                    if (isOptional) {
                        if (!isFail && gp > 2.00) optionalBonus = Math.max(optionalBonus, gp - 2.00);
                    } else {
                        compulsoryGPA += gp;
                        compulsoryCount++;
                        if (isFail) {
                            allPassed = false;
                            failedCount++;
                        }
                    }
                    totalGPA += gp;
                    visibleCount++;
                });

                let finalGPA = 0;
                if (compulsoryCount > 0) {
                    finalGPA = Math.min(5.00, (compulsoryGPA + optionalBonus) / compulsoryCount);
                } else if (visibleCount > 0) {
                    finalGPA = totalGPA / visibleCount;
                }

                tempResults.push({
                    key: `${st.id}_${st.group}`,
                    id: st.id,
                    group: st.group,
                    gpa: allPassed ? finalGPA : -1,
                    total: totalMarks,
                    allPassed: allPassed,
                    failedCount: failedCount,
                    allAbsent: allAbsent,
                    displayGPA: allPassed ? finalGPA.toFixed(2) : '0.00'
                });
            });

            tempResults.sort((a, b) => {
                if (a.allAbsent !== b.allAbsent) return a.allAbsent ? 1 : -1;
                if (a.allAbsent && b.allAbsent) return parseInt(a.id) - parseInt(b.id);
                if (a.allPassed !== b.allPassed) return a.allPassed ? -1 : 1;

                if (a.allPassed) {
                    const g1 = Number(a.gpa) || 0;
                    const g2 = Number(b.gpa) || 0;
                    if (Math.abs(g2 - g1) > 0.0001) return g2 - g1;
                } else {
                    if (a.failedCount !== b.failedCount) return a.failedCount - b.failedCount;
                }

                const t1 = Number(a.total) || 0;
                const t2 = Number(b.total) || 0;
                if (Math.abs(t2 - t1) > 0.01) return t2 - t1;

                return (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
            });

            _examRankCache.set(cacheKey, tempResults);
            results = tempResults;
        }

        const studentId = toEng(student.id);
        const studentGroup = norm(student.group);
        const searchKey = `${studentId}_${studentGroup}`;
        
        const studentRankIdx = results.findIndex(r => r.key === searchKey || (r.id === studentId && r.group === studentGroup));
        const groupResults = results.filter(r => r.group === studentGroup);
        const groupRankIdx = groupResults.findIndex(r => r.key === searchKey || (r.id === studentId && r.group === studentGroup));

        if (studentRankIdx !== -1) {
            const res = results[studentRankIdx];
            const gRes = groupRankIdx !== -1 ? groupResults[groupRankIdx] : null;

            studentHistory.push({
                name: examName,
                gpa: res.allPassed ? res.displayGPA : '0.00',
                rank: res.allAbsent ? 'রেঙ্ক নেই' : studentRankIdx + 1,
                groupRank: (gRes && gRes.allAbsent) ? 'রেঙ্ক নেই' : (groupRankIdx !== -1 ? groupRankIdx + 1 : '-')
            });
        }
    }
    return studentHistory;
}


/**
 * Helper to get CSS class for marks if failing
 */
const getMarkClass = (mark, passMark) => {
    if (!mark || mark === '-') return '';
    const m = parseFloat(mark) || 0;
    const p = parseFloat(passMark) || 0;
    return (p > 0 && m < p) ? 'ms-mark-fail' : '';
};


export async function renderSingleMarksheet(student, subjects, examDisplayName, selectedSession, customSettings = null, rules = null, allOptSubs = [], allExams = [], subjectConfigs = {}, examSummary = null, skipHeavyOps = false) {

    const history = skipHeavyOps ? [] : await getStudentExamsHistory(student, allExams, student.class, selectedSession, rules, subjectConfigs);
    const uid = student.uniqueId || generateStudentUniqueId(student.name, student.class, selectedSession, student.id, student.group);

    /**
     * Helper to normalize Bengali text for resilient matching
     * Normalizes Unicode variations and removes spaces/case
     */
    const norm = (text) => {
        if (!text) return '';
        return text.toString()
            .replace(/\u09AF\u09BC/g, '\u09DF') // Standardize য় (Ya + Nukta to Yya)
            .replace(/\u09B0\u09BC/g, '\u09DC') // Standardize ড় (Ra + Nukta to Rra)
            .replace(/\s+/g, '') // Remove all whitespace
            .trim()
            .toLowerCase();
    };

    /**
     * Group Name Mapping
     * Maps variations to rule keys (e.g., "বিজ্ঞান গ্রুপ" -> "Science")
     */
    const getMappedGroupKey = (groupName, availableKeys) => {
        if (!groupName || !availableKeys.length) return groupName;
        const nGroup = norm(groupName);

        // 1. Direct or Normalized Match
        const directMatch = availableKeys.find(k => norm(k) === nGroup);
        if (directMatch) return directMatch;

        // 2. Mapping by Keyword
        const mappings = {
            'science': ['বিজ্ঞান', 'science'],
            'business': ['ব্যবসায়', 'business', 'commerce'],
            'humanities': ['মানবিক', 'humanities', 'arts']
        };

        for (const [key, aliases] of Object.entries(mappings)) {
            // If the student group contains any of the aliases
            if (aliases.some(alias => nGroup.includes(norm(alias)))) {
                // Return the actual key from the object if it exists (normalized)
                const actualKey = availableKeys.find(k => norm(k) === norm(key));
                if (actualKey) return actualKey;
            }
        }

        return groupName;
    };



    const ms = customSettings || marksheetSettings;
    const hiddenSet = new Set((ms.hiddenSubjects || []).map(s => norm(s)));

    // 1. Group-specific Subject Filtering and Hierarchical Sorting
    let visibleSubjects = [];
    if (rules) {
        const studentGroup = student.group || '';
        const groupSubjectsObj = rules.groupSubjects || {};
        const optionalSubjectsObj = rules.optionalSubjects || {};

        const groupKey = getMappedGroupKey(studentGroup, Object.keys(groupSubjectsObj));
        const optKey = getMappedGroupKey(studentGroup, Object.keys(optionalSubjectsObj));

        const generalSubs = (rules.generalSubjects || []).map(s => norm(s));
        const groupSubs = (groupSubjectsObj[groupKey] || []).map(s => norm(s));
        const optSubs = (optionalSubjectsObj[optKey] || []).map(s => norm(s));

        visibleSubjects = subjects.filter(subjObj => {
            const isObj = typeof subjObj === 'object';
            const subjName = isObj ? subjObj.name : subjObj;
            const normSubjName = norm(subjName);

            // Check if hidden by user settings
            if (hiddenSet.has(normSubjName)) return false;

            const matchesList = (normList) => {
                if (normList.includes(normSubjName)) return true;
                if (isObj && subjObj.papers) {
                    return subjObj.papers.some(p => normList.includes(norm(p)));
                }
                return normList.some(item => normSubjName === item || normSubjName.includes(item) || item.includes(normSubjName));
            };

            const isGeneral = matchesList(generalSubs);
            const isGroup = matchesList(groupSubs);
            const isOpt = matchesList(optSubs);

            // Shared helper: check if student has marks for a subject
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
                    const hasActualMarks = (data.written > 0 || data.mcq > 0 || data.practical > 0 || data.total > 0);
                    const isExplicitlyAbsent = data.status === 'অনুপস্থিত' || data.status === 'absent';
                    return hasActualMarks || isExplicitlyAbsent;
                }

                return false;
            };
            const papers = isObj ? (subjObj.papers || []) : [subjName];

            // If it's only in the optional list (and not general/group)
            // Show if student has marks OR is mapped to this subject
            if (isOpt && !isGeneral && !isGroup) {
                const hasData = checkMarks(subjName) || papers.some(p => checkMarks(p));
                // Show if has data OR if it's the only optional subject defined for this group
                if (!hasData && optSubs.length > 2) return false; 
                // (length > 2 because a single subject might have 2 papers, so we allow 1-2 papers)
            }

            // 1.5. Alternative Subject Logic (Electives)
            if (rules.alternativePairs && rules.alternativePairs.length > 0) {
                const matchedPairs = rules.alternativePairs.filter(p => {
                    const p1 = norm(p.sub1);
                    const p2 = norm(p.sub2);
                    if (p1 === normSubjName || p2 === normSubjName) return true;
                    if (papers.some(paper => norm(paper) === p1 || norm(paper) === p2)) return true;
                    return false;
                });

                if (matchedPairs.length > 0) {
                    let hasAnyPartnerMarks = false;
                    const hasCurrentMarks = checkMarks(subjName) || papers.some(p => checkMarks(p));

                    matchedPairs.forEach(altPair => {
                        const p1 = norm(altPair.sub1);
                        const isP1Current = p1 === normSubjName || papers.some(paper => norm(paper) === p1);
                        const partner = isP1Current ? altPair.sub2 : altPair.sub1;
                        
                        if (checkMarks(partner)) {
                            hasAnyPartnerMarks = true;
                        }
                    });

                    // If any alternative partner is active (has marks or is mapped) and current is not, hide current
                    if (hasAnyPartnerMarks && !hasCurrentMarks) return false;
                }
            }

            return isGeneral || isGroup || isOpt;
        });

        // Hierarchy-based Sorting: General > Group > Optional
        visibleSubjects.sort((a, b) => {
            const getRank = (subjObj) => {
                const name = typeof subjObj === 'object' ? subjObj.name : subjObj;
                const normName = norm(name);
                const papers = typeof subjObj === 'object' ? (subjObj.papers || []) : [subjObj];
                const normPapers = papers.map(p => norm(p));

                const findInList = (normList) => {
                    const idx = normList.indexOf(normName);
                    if (idx !== -1) return idx;
                    return normList.findIndex(item => normPapers.some(p => p === item || p.includes(item) || item.includes(p)));
                };

                // 1. General Rank
                const genIdx = findInList(generalSubs);
                if (genIdx !== -1) return 100 + genIdx;

                // 2. Group Rank
                const groupIdx = findInList(groupSubs);
                if (groupIdx !== -1) return 200 + groupIdx;

                // 3. Optional Rank
                const optIdx = findInList(optSubs);
                if (optIdx !== -1) return 300 + optIdx;

                return 999;
            };
            return getRank(a) - getRank(b);
        });
    } else {
        // Fallback for when no rules are provided
        visibleSubjects = subjects.filter(subjObj => {
            const subjName = typeof subjObj === 'object' ? subjObj.name : subjObj;
            return !hiddenSet.has(norm(subjName));
        });
    }

    // Calculate per-subject grades and grand totals
    let grandTotal = 0;
    let maxGrand = 0;
    let allPassed = true;
    let compulsoryGP = 0;
    let compulsoryCount = 0;
    let optionalBonusGP = 0;
    let totalGradePointSum = 0; // Keeping for simple mode

    const isCombinedMode = rules && rules.mode === 'combined';

    const subjectRows = visibleSubjects.flatMap((subjObj, idx) => {
        const isObj = typeof subjObj === 'object';
        const subjName = isObj ? subjObj.name : subjObj;

        if (isCombinedMode && isObj && subjObj.isCombined) {
            const papers = subjObj.papers || [];
            const sSubjKey = normalizeText(subjName).replace(/\s+/g, '');
            const combinedData = student.subjects[sSubjKey] || {};

            return papers.map((paperName, pIdx) => {
                const pSubjKey = normalizeText(paperName).replace(/\s+/g, '');
                const data = student.subjects[pSubjKey] || {};
                const config = state.subjectConfigs?.[paperName] || { total: 100 };
                const maxTotal = parseInt(config.total) || 100;

                // For grand stats, we only add individual papers
                grandTotal += (data.total || 0);
                maxGrand += maxTotal;

                let cells = '';
                // Calculate isOptional per student group once per subject
                const studentGroup = student.group || '';
                const optionalSubjectsObj = rules?.optionalSubjects || {};
                const optKey = getMappedGroupKey(studentGroup, Object.keys(optionalSubjectsObj));
                const optSubs = (optionalSubjectsObj[optKey] || []).map(s => norm(s));
                const normSubjName = norm(subjName);

                const isOptional = optSubs.some(os =>
                    normSubjName === os ||
                    normSubjName.includes(os) ||
                    os.includes(normSubjName) ||
                    (isObj && subjObj.papers && subjObj.papers.some(p => norm(p) === os || norm(p).includes(os) || os.includes(norm(p))))
                );

                if (pIdx === 0) {
                    // First row of the combined subject
                    cells += `<td class="ms-td-sl" rowspan="${papers.length}">${idx + 1}</td>`;
                    cells += `<td class="ms-td-subject" rowspan="${papers.length}">
                        <div class="ms-subject-name-cell">
                            <span>${subjName}</span>
                            ${isOptional ? '<div class="ms-optional-tag">(Optional Subject)</div>' : ''}
                        </div>
                    </td>`;
                }

                cells += `<td class="ms-td-subject">${paperName}</td>`;
                cells += `<td class="ms-td-num">${maxTotal}</td>`;
                cells += `<td class="ms-td-num ${getMarkClass(data.written, config.writtenPass)}">${data.written || '-'}</td>`;
                cells += `<td class="ms-td-num ${getMarkClass(data.mcq, config.mcqPass)}">${data.mcq || '-'}</td>`;
                cells += `<td class="ms-td-num ${getMarkClass(data.practical, config.practicalPass)}">${data.practical || '-'}</td>`;
                cells += `<td class="ms-td-num ms-td-total">${data.total || 0}</td>`;

                if (pIdx === 0) {
                    const avgMarks = (combinedData.avgMarks || 0).toFixed(1).replace('.0', '');

                    // HSC Board Correction: Grade and GP should be based on total combined percentage,
                    // BUT only if both papers' components pass.
                    // The combinedData already has status: 'ফেল' if any paper was marked 'ফেল' in result entry.
                    // We also check our custom pass marks here.
                    let isSubjectFail = false;
                    papers.forEach(p => {
                        const pSubjKey = normalizeText(p).replace(/\s+/g, '');
                        const pData = student.subjects[pSubjKey] || {};
                        const pConfig = state.subjectConfigs?.[p] || {};
                        if (getMarkClass(pData.written, pConfig.writtenPass) === 'ms-mark-fail' ||
                            getMarkClass(pData.mcq, pConfig.mcqPass) === 'ms-mark-fail' ||
                            getMarkClass(pData.practical, pConfig.practicalPass) === 'ms-mark-fail') {
                            isSubjectFail = true;
                        }
                    });

                    let grade = combinedData.grade || 'F';
                    let gp = (combinedData.gpa || 0);

                    if (isSubjectFail) {
                        grade = 'F';
                        gp = 0;
                    }

                    const gpaStr = gp.toFixed(2);

                    cells += `<td class="ms-td-num" rowspan="${papers.length}">${avgMarks}</td>`;
                    cells += `<td class="ms-td-grade ${grade === 'F' ? 'ms-grade-fail' : ''}" rowspan="${papers.length}">${grade}</td>`;
                    cells += `<td class="ms-td-gp" rowspan="${papers.length}">
                        <div class="ms-gp-col-content">
                            <span>${gpaStr}</span>
                        </div>
                    </td>`;

                    totalGradePointSum += gp;

                    // GPA Logic
                    if (isCombinedMode) {
                        if (isOptional) {
                            if (grade !== 'F' && gp > 2.00) {
                                optionalBonusGP = gp - 2.00;
                            }
                        } else {
                            compulsoryGP += gp;
                            compulsoryCount++;
                            if (grade === 'F') allPassed = false;
                        }
                    } else {
                        // Simple Mode: treat all equal
                        if (grade === 'F') allPassed = false;
                    }

                    if (combinedData.status === 'ফেল') {
                        if (!isOptional) allPassed = false;
                    }
                }

                return `<tr>${cells}</tr>`;
            });
        } else {
            // Single subject (either string or non-combined object)
            const subj = isObj ? subjObj.paper : subjObj;
            const sSubjKey = normalizeText(subj).replace(/\s+/g, '');
            const data = student.subjects[sSubjKey] || {};
            const total = data.total || 0;
            const config = state.subjectConfigs?.[subj] || { total: 100 };
            const maxTotal = parseInt(config.total) || 100;

            grandTotal += total;
            maxGrand += maxTotal;

            const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
            let grade = getLetterGrade(pct);
            let gp = getGradePoint(pct);

            // Strict Component Pass/Fail check
            const isCompFail = getMarkClass(data.written, config.writtenPass) === 'ms-mark-fail' ||
                getMarkClass(data.mcq, config.mcqPass) === 'ms-mark-fail' ||
                getMarkClass(data.practical, config.practicalPass) === 'ms-mark-fail';

            if (isCompFail) {
                grade = 'F';
                gp = 0;
            }

            totalGradePointSum += gp;

            // Determine if optional (Unified logic)
            const studentGroup = student.group || '';
            const optionalSubjectsObj = rules?.optionalSubjects || {};
            const optKey = getMappedGroupKey(studentGroup, Object.keys(optionalSubjectsObj));
            const optSubs = (optionalSubjectsObj[optKey] || []).map(s => norm(s));
            const normSubjName = norm(subjName);
            const isOptional = optSubs.some(os => normSubjName === os || normSubjName.includes(os) || os.includes(normSubjName));

            if (isCombinedMode) {
                if (isOptional) {
                    if (grade !== 'F' && gp > 2.00) {
                        optionalBonusGP = gp - 2.00;
                    }
                } else {
                    compulsoryGP += gp;
                    compulsoryCount++;
                    if (grade === 'F') allPassed = false;
                }
            } else {
                // Single Paper Mode — Both ON/OFF: separate optional subject
                if (isOptional) {
                    if (grade !== 'F' && gp > 2.00) {
                        optionalBonusGP = gp - 2.00;
                    }
                    // OFF: optional F = overall fail | ON: optional F ignored
                    if (ms.boardStandardOptional !== true && grade === 'F') {
                        allPassed = false;
                    }
                } else {
                    compulsoryGP += gp;
                    compulsoryCount++;
                    if (grade === 'F') allPassed = false;
                }
            }

            if (data.status === 'ফেল' || data.status === 'fail') {
                if (isCombinedMode || ms.boardStandardOptional === true) {
                    if (!isOptional) allPassed = false;
                } else {
                    allPassed = false;
                }
            }

            if (isCombinedMode) {
                // Return row with extra columns for consistency
                return `
                    <tr>
                        <td class="ms-td-sl">${idx + 1}</td>
                        <td class="ms-td-subject">
                            <div class="ms-subject-name-cell">
                                <span>${subjName}</span>
                                ${isOptional ? '<div class="ms-optional-tag">(Optional Subject)</div>' : ''}
                            </div>
                        </td>
                        <td class="ms-td-subject">${subj}</td>
                        <td class="ms-td-num">${maxTotal}</td>
                        <td class="ms-td-num ${getMarkClass(data.written, config.writtenPass)}">${data.written || '-'}</td>
                        <td class="ms-td-num ${getMarkClass(data.mcq, config.mcqPass)}">${data.mcq || '-'}</td>
                        <td class="ms-td-num ${getMarkClass(data.practical, config.practicalPass)}">${data.practical || '-'}</td>
                        <td class="ms-td-num ms-td-total">${total}</td>
                        <td class="ms-td-num">${total}</td>
                        <td class="ms-td-grade ${grade === 'F' ? 'ms-grade-fail' : ''}">${grade}</td>
                        <td class="ms-td-gp">
                            <div class="ms-gp-col-content">
                                <span>${gp.toFixed(2)}</span>
                            </div>
                        </td>
                    </tr>`;
            } else {
                const studentGroup = student.group || '';
                const optionalSubjectsObj = rules?.optionalSubjects || {};
                const optKey = getMappedGroupKey(studentGroup, Object.keys(optionalSubjectsObj));
                const optSubs = (optionalSubjectsObj[optKey] || []).map(s => norm(s));
                const isOptional = optSubs.some(os => norm(subj) === os || norm(subj).includes(os) || os.includes(norm(subj)));

                return `
                    <tr>
                        <td class="ms-td-sl">${idx + 1}</td>
                        <td class="ms-td-subject">
                            <div class="ms-subject-name-cell">
                                <span>${subj}</span>
                                ${isOptional ? '<div class="ms-optional-tag">(Optional Subject)</div>' : ''}
                            </div>
                        </td>
                        <td class="ms-td-num">${maxTotal}</td>
                        <td class="ms-td-num ${getMarkClass(data.written, config.writtenPass)}">${data.written || '-'}</td>
                        <td class="ms-td-num ${getMarkClass(data.mcq, config.mcqPass)}">${data.mcq || '-'}</td>
                        <td class="ms-td-num ${getMarkClass(data.practical, config.practicalPass)}">${data.practical || '-'}</td>
                        <td class="ms-td-num ms-td-total">${total}</td>
                        <td class="ms-td-grade ${grade === 'F' ? 'ms-grade-fail' : ''}">${grade}</td>
                        <td class="ms-td-gp">
                            <div class="ms-gp-col-content">
                                <span>${gp.toFixed(2)}</span>
                            </div>
                        </td>
                    </tr>`;
            }
        }
    }).join('');

    let avgGPA = '0.00';
    if (isCombinedMode) {
        const totalGP = compulsoryGP + optionalBonusGP;
        const finalGP = compulsoryCount > 0 ? Math.min(5.00, totalGP / compulsoryCount) : 0;
        avgGPA = allPassed ? finalGP.toFixed(2) : '0.00';
    } else {
        // Single Paper Mode (both ON/OFF): GPA = (Compulsory GP + Bonus) / Compulsory Count
        if (allPassed && compulsoryCount > 0) {
            const totalGP = compulsoryGP + optionalBonusGP;
            const finalGP = Math.min(5.00, totalGP / compulsoryCount);
            avgGPA = finalGP.toFixed(2);
        } else {
            avgGPA = '0.00';
        }
    }

    const overallGrade = allPassed ? getGradeFromGP(parseFloat(avgGPA)) : 'F';

    let studentRemark = '';
    if (overallGrade === 'A+' || overallGrade === 'A') {
        studentRemark = 'আলহামদুলিল্লাহ! অসাধারণ ফলাফল, তোমার উত্তরোত্তর সফলতা কামনা করছি';
    } else if (overallGrade === 'A-' || overallGrade === 'B') {
        studentRemark = 'ফলাফল:মোটামুটি ভালো!এভাবে চেষ্টা করে এগিয়ে যাও,তোমার জন্য শুভকামনা';
    } else if (overallGrade === 'C' || overallGrade === 'D') {
        studentRemark = 'ফলাফল:হতাশাজনক! বিষয়ভিত্তিক শিক্ষকদের হেল্প নাও,সমাধান কর এবং চেষ্টার কমতি রেখো না';
    } else if (overallGrade === 'F') {
        studentRemark = 'ফলাফল:খুবই দুঃখজনক! চেষ্টার যথেষ্ট ঘাটতি রয়েছে এবং ফেল করা বিষয়গুলোতে আরো বেশি করে ফোকাস দিতে হবে।';
    }

    // Synchronize history table GPA to exactly match the current marksheet's calculated GPA
    history.forEach(h => {
        if (h.name === examDisplayName) {
            h.gpa = overallGrade === 'F' ? `${avgGPA} (F)` : avgGPA;
        }
    });

    // ... (rest of the function for grand gpa if needed)

    // Footer and other parts...

    const headerRow = isCombinedMode ? `
        <tr>
            <th class="ms-th-sl" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">ক্রঃ</th>
            <th class="ms-th-subject" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">বিষয়ের নাম</th>
            <th class="ms-th-subject" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">পত্র সমূহ</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">পূর্ণমান</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">CQ</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">MCQ</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">ব্যবহারিক </th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">প্রাপ্ত নম্বর</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">গড়</th>
            <th class="ms-th-grade" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">গ্রেড</th>
            <th class="ms-th-gp" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">GPA</th>
        </tr>` : `
        <tr>
            <th class="ms-th-sl" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">ক্রঃ</th>
            <th class="ms-th-subject" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">বিষয়ের নাম</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">পূর্ণমান</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">লিখিত</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">MCQ</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">ব্যবহারিক</th>
            <th class="ms-th-num" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">প্রাপ্ত নম্বর</th>
            <th class="ms-th-grade" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">গ্রেড</th>
            <th class="ms-th-gp" style="background:#0d5e2e !important; color:#ffffff !important; -webkit-print-color-adjust:exact !important;">GPA</th>

        </tr>`;

    // Final result text should use pass/fail logic
    const resultText = allPassed ? 'পাস' : 'অকৃতকার্য';
    const resultClass = allPassed ? 'ms-result-pass' : 'ms-result-fail';

    const signaturesToRender = ms.signatures || (ms.signatureLabels || ['শ্রেণি শিক্ষক', 'পরীক্ষা কমিটি', 'অধ্যক্ষ']).map(l => ({ label: l, url: '' }));

    const signatureHtml = signaturesToRender.map(sig =>
        `<div class="ms-sig-block" style="display: flex; flex-direction: column; justify-content: flex-end; align-items: center; min-width: 120px;">
            <div style="height: 40px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 2px; width: 100%;">
                ${sig.url ? `<img src="${sig.url}" class="ms-sig-img" alt="Signature" style="max-height: 40px; object-fit: contain;">` : ''}
            </div>
            <div class="ms-sig-line" style="width: 120px; border-bottom: 1.5px solid #333; margin: 0 auto 2px;"></div>
            <span style="font-size: 0.78rem; font-weight: 700; color: #333;">${sig.label}</span>
        </div>`
    ).join('');

    const watermarkHtml = ms.watermarkUrl ?
        `<img src="${ms.watermarkUrl}" class="ms-watermark-img" style="opacity: ${ms.watermarkOpacity || 0.1};" alt="Watermark">` : '';

    const todayDate = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });

    function getDeveloperCreditHtml(className) {
        if (!state.developerCredit || state.developerCredit.enabled === false) return '';
        const text = state.developerCredit.text || '';
        const name = state.developerCredit.name || '';
        const link = state.developerCredit.link || '';

        if (!text && !name) return '';

        let content = `<span style="color: inherit;">${text} <strong>${name}</strong></span>`;
        if (link) {
            content += `<span style="margin: 0 6px; color: #cbd5e1;">|</span><a href="${link}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${link}</a>`;
        }

        return `<div class="${className}" style="margin: 0; padding: 0; display: inline-block;">${content.trim()}</div>`;
    }

    // Determine if student is absent (no marks in any subject)
    const hasAnyMarks = Object.values(student.subjects || {}).some(data =>
        ((data.written || 0) > 0 || (data.mcq || 0) > 0 || (data.practical || 0) > 0 || (data.total || 0) > 0)
    );
    const isAbsentMark = !hasAnyMarks;

    return `
        <div class="ms-page font-${ms.fontSize || 'medium'} theme-${ms.theme || 'classic'} border-${ms.borderStyle || 'double'} typography-${ms.typography || 'default'} density-${ms.rowDensity || 'normal'}" 
             id="ms_page_${student.id}_${student.group}" 
             data-student-id="${student.id}"
             data-student-group="${student.group}"
             data-is-absent="${isAbsentMark}"
             style="--ms-primary: ${ms.primaryColor || '#4361ee'};">
            
            <div class="ms-actions-float no-print">
                <button class="ms-btn-action ms-btn-print-single" onclick="window.printSingleMarksheet('ms_page_${student.id}_${student.group}')">
                    <i class="fas fa-print"></i> প্রিন্ট
                </button>
            </div>

            <!-- Decorative Border -->
            <div class="ms-border-frame">
                
                <!-- Header Section -->
                <div class="ms-header-section">
                    <div class="ms-header-main-info">
                        ${ms.watermarkUrl ? `<img src="${ms.watermarkUrl}" class="ms-inst-logo" alt="College Logo">` :
            `<div class="ms-emblem"><i class="fas fa-graduation-cap"></i></div>`}
                        <div class="ms-inst-details">
                            <h1 class="ms-inst-name">${ms.institutionName || 'প্রতিষ্ঠানের নাম'}</h1>
                            ${ms.institutionAddress ? `<p class="ms-inst-address">${ms.institutionAddress}</p>` : ''}
                        </div>
                    </div>
                    
                    <div class="ms-header-pill-container" style="text-align:center;">
                        <div class="ms-header-pill">
                            <div class="ms-pill-left">${ms.headerLine1 || 'পরীক্ষার ফলাফল মার্কশীট'}</div>
                            <div class="ms-pill-divider"></div>
                            <div class="ms-pill-right">${examDisplayName} (${selectedSession})</div>
                        </div>
                    </div>
                </div>

                <!-- Student Info Section -->
                <div class="ms-student-section">
                    <div class="ms-info-grid">
                        <div class="ms-info-item">
                            <span class="ms-info-label">শিক্ষার্থীর নাম</span>
                            <span class="ms-info-value ms-info-name">${student.name}</span>
                        </div>
                        <div class="ms-info-item">
                            <span class="ms-info-label">রোল নম্বর</span>
                            <span class="ms-info-value">${student.id}</span>
                        </div>
                        <div class="ms-info-item">
                            <span class="ms-info-label">শ্রেণি</span>
                            <span class="ms-info-value">${student.class}</span>
                        </div>
                        <div class="ms-info-item">
                            <span class="ms-info-label">বিভাগ</span>
                            <span class="ms-info-value">${student.group || '-'}</span>
                        </div>
                        <div class="ms-info-item">
                            <span class="ms-info-label">শিক্ষাবর্ষ</span>
                            <span class="ms-info-value">${student.session}</span>
                        </div>
                    </div>
                </div>

                <!-- Marks Table with Watermark -->
                <div class="ms-table-wrapper" style="position: relative;">
                    ${watermarkHtml}
                    <table class="ms-table">
                        <thead>
                            ${headerRow}
                        </thead>
                        <tbody>
                            ${subjectRows}
                        </tbody>
                        <tfoot>
                            <tr class="ms-row-total">
                                <td colspan="${isCombinedMode ? 3 : 2}" class="ms-td-total-label">সর্বমোট</td>
                                <td class="ms-td-num">${maxGrand}</td>
                                <td colspan="3"></td>
                                <td class="ms-td-num ms-td-total">${grandTotal}</td>
                                ${isCombinedMode ? '<td class="ms-td-num"></td>' : ''}
                                <td class="ms-td-grade">${overallGrade}</td>
                                <td class="ms-td-gp">${avgGPA}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <!-- Result Summary -->
                <div class="ms-result-section">
                    ${optionalBonusGP > 0 ? `
                    <div class="ms-result-box" style="background: linear-gradient(135deg, #e8f5e9, #c8e6c9); border: 1px solid #a5d6a7;">
                        <span class="ms-result-label" style="color: #2e7d32; font-size: 0.55rem;">ঐচ্ছিক বোনাস</span>
                        <span class="ms-result-value" style="color: #1b5e20; font-size: 1.1rem;">+${optionalBonusGP.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    ${grandTotal === 0 ? `
                    <div class="ms-result-box" style="background: #ffffff; border: 1.5px solid #e53935;">
                        <span class="ms-result-label" style="color: #e53935; font-size: 0.55rem;">স্ট্যাটাস</span>
                        <span class="ms-result-value" style="color: #d32f2f; font-size: 1rem; font-weight: 700; letter-spacing: 1px;">অনুপস্থিত</span>
                    </div>
                    ` : ''}
                    <div class="ms-result-box">
                        <span class="ms-result-label">GPA</span>
                        <span class="ms-result-value ms-gpa-value">${avgGPA}</span>
                    </div>
                    <div class="ms-result-box">
                        <span class="ms-result-label">গ্রেড</span>
                        <span class="ms-result-value">${overallGrade}</span>
                    </div>
                    <div class="ms-result-box ${resultClass}">
                        <span class="ms-result-label">ফলাফল</span>
                        <span class="ms-result-value">${resultText}</span>
                    </div>
                    <div class="ms-result-box">
                        <span class="ms-result-label">মোট নম্বর</span>
                        <span class="ms-result-value">${grandTotal} / ${maxGrand}</span>
                    </div>
                    </div>
                    <!--EXAM_SUMMARY_PLACEHOLDER-->

                <!-- Grade Scale Reference -->
                <div class="ms-grade-scale" style="${ms.showGradeScale === false ? 'display: none !important;' : ''}">
                    <div class="ms-grade-scale-wrapper">
                        <span class="ms-gs-title" style="letter-spacing: 0.5px;">GRADING SCALE :</span>
                        <div class="ms-grade-badges">
                            <div class="ms-gs-item gs-ap" style="flex: 1 1 50px; min-width: 58px;">
                                <div class="ms-gs-top" style="font-size: 0.57rem; white-space: nowrap;"><strong>A+</strong> <span style="font-weight: 500;">(80-100)</span> <strong>5.00</strong></div>
                                <div class="ms-gs-bottom" style="font-size: 0.68rem; font-weight: 800;"><strong><!--GS_AP--></strong> জন</div>
                            </div>
                            <div class="ms-gs-item gs-a" style="flex: 1 1 50px; min-width: 58px;">
                                <div class="ms-gs-top" style="font-size: 0.57rem; white-space: nowrap;"><strong>A</strong> <span style="font-weight: 500;">(70-79)</span> <strong>4.00</strong></div>
                                <div class="ms-gs-bottom" style="font-size: 0.68rem; font-weight: 800;"><strong><!--GS_A--></strong> জন</div>
                            </div>
                            <div class="ms-gs-item gs-am" style="flex: 1 1 50px; min-width: 58px;">
                                <div class="ms-gs-top" style="font-size: 0.57rem; white-space: nowrap;"><strong>A-</strong> <span style="font-weight: 500;">(60-69)</span> <strong>3.50</strong></div>
                                <div class="ms-gs-bottom" style="font-size: 0.68rem; font-weight: 800;"><strong><!--GS_AM--></strong> জন</div>
                            </div>
                            <div class="ms-gs-item gs-b" style="flex: 1 1 50px; min-width: 58px;">
                                <div class="ms-gs-top" style="font-size: 0.57rem; white-space: nowrap;"><strong>B</strong> <span style="font-weight: 500;">(50-59)</span> <strong>3.00</strong></div>
                                <div class="ms-gs-bottom" style="font-size: 0.68rem; font-weight: 800;"><strong><!--GS_B--></strong> জন</div>
                            </div>
                            <div class="ms-gs-item gs-c" style="flex: 1 1 50px; min-width: 58px;">
                                <div class="ms-gs-top" style="font-size: 0.57rem; white-space: nowrap;"><strong>C</strong> <span style="font-weight: 500;">(40-49)</span> <strong>2.00</strong></div>
                                <div class="ms-gs-bottom" style="font-size: 0.68rem; font-weight: 800;"><strong><!--GS_C--></strong> জন</div>
                            </div>
                            <div class="ms-gs-item gs-d" style="flex: 1 1 50px; min-width: 58px;">
                                <div class="ms-gs-top" style="font-size: 0.57rem; white-space: nowrap;"><strong>D</strong> <span style="font-weight: 500;">(33-39)</span> <strong>1.00</strong></div>
                                <div class="ms-gs-bottom" style="font-size: 0.68rem; font-weight: 800;"><strong><!--GS_D--></strong> জন</div>
                            </div>
                            <div class="ms-gs-item gs-f" style="flex: 1 1 50px; min-width: 58px;">
                                <div class="ms-gs-top" style="font-size: 0.57rem; white-space: nowrap;"><strong>F</strong> <span style="font-weight: 500;">(0-32)</span> <strong>0.00</strong></div>
                                <div class="ms-gs-bottom" style="font-size: 0.68rem; font-weight: 800; color: #dc2626 !important;"><strong><!--GS_F--></strong> জন</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Extra Sections: History, Comments, QR -->
                <div class="ms-extra-grid">
                    <div class="ms-extra-box ms-history-column" style="display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
                        <span class="ms-extra-title">পরীক্ষার ফলাফল ইতিহাস ও মেরিট পজিশন</span>
                        <div class="ms-history-grid-container" style="flex-grow: 1; display: flex; flex-direction: column; width: 100%;">
                            <!-- Header Row -->
                            <div style="display: grid; grid-template-columns: 42% 14% 22% 22%; width: 100%; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 4px;">
                                <div style="display: flex; align-items: flex-end; font-size: 0.75rem; font-weight: 700; color: #475569; text-align: left; padding: 2px;">পরীক্ষার নাম</div>
                                <div style="display: flex; align-items: flex-end; justify-content: center; font-size: 0.75rem; font-weight: 700; color: #475569; text-align: center; padding: 2px;">GPA</div>
                                <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; font-size: 0.75rem; font-weight: 700; color: #475569; text-align: center; padding: 2px;" title="সমন্বিত">
                                    <span>ক্লাস</span>
                                    <span style="font-size:0.55rem; font-weight:800; color:#64748b; margin-top:2px; letter-spacing:0.3px;">RANK</span>
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; font-size: 0.75rem; font-weight: 700; color: #475569; text-align: center; padding: 2px;" title="বিভাগীয়">
                                    <span>বিভাগীয়</span>
                                    <span style="font-size:0.55rem; font-weight:800; color:#64748b; margin-top:2px; letter-spacing:0.3px;">RANK</span>
                                </div>
                            </div>
                            
                            <!-- Data Rows -->
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                ${history.length > 0 ? history.map(h => `
                                    <div style="display: grid; grid-template-columns: 42% 14% 22% 22%; width: 100%; border-bottom: 1px dashed #f1f5f9; padding: 6px 0; align-items: center;">
                                        <div style="font-size: 0.72rem; font-weight: 600; color: #334155; text-align: left; padding: 2px; white-space: normal; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.3;">${h.name}</div>
                                        <div style="font-size: 0.8rem; font-weight: 700; color: #0f172a; text-align: center; padding: 2px;">${h.gpa}</div>
                                        <div style="text-align: center; padding: 2px;">
                                            <div style="display: inline-block; background: rgba(67, 97, 238, 0.08); color: var(--ms-primary, #4361ee); padding: 4px 6px; border-radius: 4px; font-size: ${h.rank === 'রেঙ্ক নেই' ? '0.68rem' : '0.85rem'}; font-weight: 800; line-height: 1; min-width: 38px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                                                ${h.rank}${h.rank !== 'রেঙ্ক নেই' ? '<span style="font-size: 0.6rem; font-weight: 700; margin-left: 1px;">তম</span>' : ''}
                                            </div>
                                        </div>
                                        <div style="text-align: center; padding: 2px;">
                                            <div style="display: inline-block; background: rgba(22, 163, 74, 0.08); color: #16a34a; padding: 4px 6px; border-radius: 4px; font-size: ${h.groupRank === 'রেঙ্ক নেই' ? '0.68rem' : '0.85rem'}; font-weight: 800; line-height: 1; min-width: 38px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                                                ${h.groupRank}${h.groupRank !== 'রেঙ্ক নেই' && h.groupRank !== '-' ? '<span style="font-size: 0.6rem; font-weight: 700; margin-left: 1px;">তম</span>' : ''}
                                            </div>
                                        </div>
                                    </div>
                                `).join('') : '<div style="text-align:center; font-size: 0.75rem; opacity:0.5; padding: 10px 0; width: 100%;">হিস্টোরি নেই</div>'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="ms-extra-box ms-comments-box">
                        <span class="ms-extra-title">মন্তব্য:</span>
                        <div class="ms-comment-lines" style="position: relative;">
                            <div style="position: absolute; top: 0px; left: 8px; right: 4px; line-height: 22px; font-weight: 700; font-size: 0.78rem; color: #1e3a8a; font-style: italic; z-index: 10;">${studentRemark}</div>
                            <div class="ms-dot-line"></div>
                            <div class="ms-dot-line"></div>
                            <div class="ms-dot-line"></div>
                        </div>
                    </div>
                    
                    <div class="ms-extra-box ms-qr-column" style="justify-content: space-between; padding: 2px !important; padding-bottom: 0 !important;">
                        <div class="ms-qr-canvas-wrapper" style="margin-bottom: -4px; padding: 0;">
                            <canvas class="ms-mr-qr-canvas" data-uid="${uid}" data-exam="${examDisplayName}" data-name="${student.name}"></canvas>
                        </div>
                        <div class="ms-qr-text-info" style="display: flex; flex-direction: column; align-items: center; width: 100%; margin-top: -2px;">
                            <div style="color: #0f172a; font-size: 0.58rem; font-weight: 800; margin-bottom: 1px; line-height: 1;">স্ক্যান এন্ড ভেরিফাই</div>
                            <div style="font-size: 0.62rem; color: #2563eb; font-weight: 700; margin-bottom: 0px; letter-spacing: 0.2px; text-transform: lowercase;">${window.location.hostname}</div>
                            <div class="ms-qr-uid" style="margin-top: 0; background: #f8fafc; width: 100%; padding: 3px 0; border-top: 1px dashed #cbd5e1; font-size: 0.65rem; color: #1e293b; font-weight: 700;">ID No. ${uid}</div>
                        </div>
                    </div>
                </div>


                <!-- Signatures -->
                <div class="ms-flex-spacer" style="flex-grow: 1;"></div>
                <div class="ms-signatures-section" style="position: relative; display: flex; justify-content: space-between; align-items: flex-end; margin-top: 15px; padding: 0 10px;">
                    ${signatureHtml}
                </div>

                <!-- Footer with safe flexible inline layout -->
                <div class="ms-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; padding: 8px 0 10px 0;">
                    <span style="white-space: nowrap;">জেনারেটেড তারিখ: ${todayDate}</span>
                    <div style="text-align: center; white-space: nowrap; padding: 0 4px;">
                        ${getDeveloperCreditHtml('ms-dev-credit')}
                    </div>
                    <span style="white-space: nowrap;">এটি কম্পিউটার জেনারেটেড ফলাফল পত্র</span>
                </div>
            </div>
        </div>
    `;
}

export function getLetterGrade(pct) {
    if (pct >= 80) return 'A+';
    if (pct >= 70) return 'A';
    if (pct >= 60) return 'A-';
    if (pct >= 50) return 'B';
    if (pct >= 40) return 'C';
    if (pct >= 33) return 'D';
    return 'F';
}

export function getGradePoint(pct) {
    if (pct >= 80) return 5.00;
    if (pct >= 70) return 4.00;
    if (pct >= 60) return 3.50;
    if (pct >= 50) return 3.00;
    if (pct >= 40) return 2.00;
    if (pct >= 33) return 1.00;
    return 0.00;
}

export function getGradeFromGP(gp) {
    if (gp >= 5.00) return 'A+';
    if (gp >= 4.00) return 'A';
    if (gp >= 3.50) return 'A-';
    if (gp >= 3.00) return 'B';
    if (gp >= 2.00) return 'C';
    if (gp >= 1.00) return 'D';
    return 'F';
}

/**
 * Update Live Preview in Marksheet Settings Modal
 */
async function updateSettingsLivePreview() {
    const previewContainer = document.getElementById('msSettingsLivePreview');
    if (!previewContainer) return;

    // Helper to get element values
    const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : '';

    const currentSettings = {
        institutionName: getVal('msInstitutionName') || 'প্রতিষ্ঠানের নাম',
        institutionAddress: getVal('msInstitutionAddress') || 'ঠিকানা এখানে',
        headerLine1: getVal('msHeaderLine1') || 'পরীক্ষার ফলাফল পত্র',
        primaryColor: getVal('msPrimaryColor') || '#4361ee',
        fontSize: getVal('msFontSize') || 'medium',
        theme: getVal('msTheme') || 'classic',
        borderStyle: getVal('msBorderStyle') || 'double',
        typography: getVal('msTypography') || 'default',
        rowDensity: getVal('msRowDensity') || 'normal',
        watermarkUrl: marksheetSettings.watermarkUrl || '',
        watermarkOpacity: (document.getElementById('msWatermarkOpacity') ? parseInt(document.getElementById('msWatermarkOpacity').value) : 10) / 100,
        showSummary: document.getElementById('msShowSummary') ? document.getElementById('msShowSummary').checked : true,
        showGradeScale: document.getElementById('msShowGradeScale') ? document.getElementById('msShowGradeScale').checked : true,
        signatures: marksheetSettings.signatures || []
    };

    // Render the mock preview using existing render function
    const mockStudent = {
        id: 'mock-1',
        name: 'মোহাম্মদ আব্দুল্লাহ',
        roll: '১০১',
        group: 'বিজ্ঞান',
        marks: {
            'Bangla': { cq: 65, mcq: 25, practical: 0, total: 90 },
            'English': { cq: 85, mcq: 0, practical: 0, total: 85 },
            'Math': { cq: 75, mcq: 20, practical: 0, total: 95 }
        }
    };

    const html = await renderSingleMarksheet(mockStudent, currentSettings, '২০২৫-২০২৬', 'অর্ধ-বার্ষিক পরীক্ষা ২০২৬');
    previewContainer.innerHTML = html;

    // Render QRs in preview
    setTimeout(async () => {
        await renderMarksheetQRCodes(previewContainer);
    }, 100);

    // Hide non-printable action buttons in preview
    const actions = previewContainer.querySelectorAll('.ms-actions-float');
    actions.forEach(a => a.style.display = 'none');
}

/**
 * Initialize Marksheet Settings Modal
 */
function initMarksheetSettingsModal() {
    const settingsBtn = document.getElementById('marksheetSettingsBtn');
    const modal = document.getElementById('marksheetSettingsModal');
    const closeBtn = document.getElementById('closeMarksheetSettingsModal');
    const form = document.getElementById('marksheetSettingsForm');
    const opacitySlider = document.getElementById('msWatermarkOpacity');
    const opacityVal = document.getElementById('msOpacityVal');

    if (opacitySlider && opacityVal) {
        opacitySlider.addEventListener('input', () => {
            opacityVal.textContent = opacitySlider.value;
        });
        opacityVal.textContent = opacitySlider.value;
    }

    const menuItems = document.querySelectorAll('.config-menu-item');
    const tabContents = document.querySelectorAll('.config-tab-content');

    // MOCK DATA for Live Preview
    const MOCK_PREVIEW_STUDENT = {
        id: 'mock-123',
        name: 'মোহাম্মদ আব্দুল্লাহ',
        roll: '১০১',
        group: 'বিজ্ঞান',
        subjects: {
            'Bangla': { written: 65, mcq: 25, practical: 0, total: 90 },
            'English': { written: 85, mcq: 0, practical: 0, total: 85 },
            'Math': { written: 75, mcq: 20, practical: 0, total: 95 }
        }
    };

    /**
     * Update Live Preview in Settings
     */
    const updateSettingsLivePreview = async () => {
        const previewContainer = document.getElementById('msSettingsLivePreview');
        if (!previewContainer) return;

        const currentSettings = {
            institutionName: document.getElementById('msInstitutionName').value || 'প্রতিষ্ঠানের নাম',
            institutionAddress: document.getElementById('msInstitutionAddress').value || 'ঠিকানা এখানে',
            headerLine1: document.getElementById('msHeaderLine1').value || 'পরীক্ষার ফলাফল পত্র',
            primaryColor: document.getElementById('msPrimaryColor').value,
            fontSize: document.getElementById('msFontSize').value,
            theme: document.getElementById('msTheme').value,
            borderStyle: document.getElementById('msBorderStyle').value,
            typography: document.getElementById('msTypography').value,
            rowDensity: document.getElementById('msRowDensity').value,
            watermarkUrl: marksheetSettings.watermarkUrl || '',
            watermarkOpacity: parseInt(document.getElementById('msWatermarkOpacity').value) / 100,
            signatures: marksheetSettings.signatures || [
                { label: 'শ্রেণি শিক্ষক', url: '' },
                { label: 'পরীক্ষা কমিটি', url: '' },
                { label: 'অধ্যক্ষ', url: '' }
            ]
        };

        const mockSubjects = Object.keys(MOCK_PREVIEW_STUDENT.subjects);

        // Render the preview
        const html = await renderSingleMarksheet(MOCK_PREVIEW_STUDENT, mockSubjects, 'অর্ধ-বার্ষিক পরীক্ষা ২০২৬', '২০২৫-২০২৬', currentSettings);

        // Use a wrapper to keep the scale separate from the content
        previewContainer.innerHTML = html;

        // Render QRs in preview
        setTimeout(async () => {
            await renderMarksheetQRCodes(previewContainer);
        }, 100);

        // Hide non-printable action buttons in preview
        const actions = previewContainer.querySelectorAll('.ms-actions-float');
        actions.forEach(a => a.style.display = 'none');
    };


    // Add listeners to all form controls for live preview
    const controls = form.querySelectorAll('input, select, textarea');
    controls.forEach(control => {
        const eventName = control.type === 'range' || control.type === 'color' ? 'input' : 'change';
        control.addEventListener(eventName, updateSettingsLivePreview);

        // For text inputs, update on keyup for instant feel
        if (control.type === 'text') {
            control.addEventListener('keyup', updateSettingsLivePreview);
        }
    });

    // Zoom and Refresh Logic
    const zoomInput = document.getElementById('msPreviewZoom');
    const zoomLevel = document.getElementById('msZoomLevel');
    const refreshBtn = document.getElementById('refreshPreviewBtn');
    const previewWrapper = document.getElementById('msSettingsLivePreview');

    if (zoomInput && zoomLevel && previewWrapper) {
        zoomInput.addEventListener('input', () => {
            const scale = zoomInput.value;
            previewWrapper.style.setProperty('--ms-preview-scale', scale);
            zoomLevel.textContent = Math.round(scale * 100) + '%';
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.classList.add('fa-spin');
            updateSettingsLivePreview();
            setTimeout(() => refreshBtn.classList.remove('fa-spin'), 1000);
        });
    }

    // Tab Switching Logic
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.dataset.tab;

            // Update Menu
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Update Content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) content.classList.add('active');
            });
        });
    });

    if (settingsBtn) {
        settingsBtn.addEventListener('click', async () => {
            await loadMarksheetSettings();
            const el = (id) => document.getElementById(id);
            if (el('msInstitutionName')) el('msInstitutionName').value = marksheetSettings.institutionName || '';
            if (el('msInstitutionAddress')) el('msInstitutionAddress').value = marksheetSettings.institutionAddress || '';
            if (el('msHeaderLine1')) el('msHeaderLine1').value = marksheetSettings.headerLine1 || '';
            if (el('msPrimaryColor')) el('msPrimaryColor').value = marksheetSettings.primaryColor || '#4361ee';
            if (el('msFontSize')) el('msFontSize').value = marksheetSettings.fontSize || 'medium';
            if (el('msTheme')) el('msTheme').value = marksheetSettings.theme || 'classic';
            if (el('msBorderStyle')) el('msBorderStyle').value = marksheetSettings.borderStyle || 'double';
            if (el('msTypography')) el('msTypography').value = marksheetSettings.typography || 'default';
            if (el('msRowDensity')) el('msRowDensity').value = marksheetSettings.rowDensity || 'normal';
            if (el('msShowSummary')) el('msShowSummary').checked = marksheetSettings.showSummary !== false;
            if (el('msShowGradeScale')) el('msShowGradeScale').checked = marksheetSettings.showGradeScale !== false;
            if (el('msBoardStandardOptional')) el('msBoardStandardOptional').checked = marksheetSettings.boardStandardOptional === true;

            // Render Signature Slots
            renderSignatureSlots();

            if (opacitySlider) {
                opacitySlider.value = (marksheetSettings.watermarkOpacity || 0.1) * 100;
                if (opacityVal) opacityVal.textContent = opacitySlider.value;
            }
            if (marksheetSettings.watermarkUrl) {
                const preview = document.getElementById('msWatermarkPreview');
                if (preview) preview.innerHTML = `<img src="${marksheetSettings.watermarkUrl}" style="max-width:80px; opacity:0.3; border-radius:6px;">`;
            }

            // Initial Preview Load
            updateSettingsLivePreview();

            // Render checklists
            renderSubjectVisibilityToggles();
            renderHistoryExamsChecklist();

            // Populate mapping dropdown (async load all subjects)
            try {
                const msMapSubSelect = document.getElementById('msMapSubject');
                if (msMapSubSelect) await populateSubjectSelect(msMapSubSelect);
            } catch (e) {
                console.warn('Subject population failed:', e);
            }

            // Always render mappings even if dropdown fails
            renderSubjectMappings();

            if (modal) modal.classList.add('active');
        });
    }

    // Add Signature Slot Button
    const addSlotBtn = document.getElementById('addSignatureSlotBtn');
    if (addSlotBtn) {
        addSlotBtn.addEventListener('click', () => {
            if (!marksheetSettings.signatures) marksheetSettings.signatures = [];
            marksheetSettings.signatures.push({ label: '', url: '' });
            renderSignatureSlots();
            updateSettingsLivePreview(); // Update preview when adding slot
        });
    }

    // Initialize Checklists
    renderSubjectVisibilityToggles();
    renderHistoryExamsChecklist();

    if (closeBtn) {

        closeBtn.addEventListener('click', () => { if (modal) modal.classList.remove('active'); });
    }

    // Close modal on backdrop click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    }

    const watermarkUpload = document.getElementById('msWatermarkUpload');
    if (watermarkUpload) {
        watermarkUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    let base64 = ev.target.result;
                    try {
                        base64 = await compressImage(base64, 800, 800, 0.7);
                    } catch (err) {
                        console.warn("Watermark compression failed", err);
                    }
                    marksheetSettings.watermarkUrl = base64;
                    const preview = document.getElementById('msWatermarkPreview');
                    if (preview) preview.innerHTML = `<img src="${base64}" style="max-width:80px; opacity:0.3; border-radius:6px;">`;
                    updateSettingsLivePreview(); // Update preview after upload
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Instant Preview Toggle Logic
    const togglePreviewBtn = document.getElementById('toggleMSPreviewMode');
    if (togglePreviewBtn) {
        togglePreviewBtn.addEventListener('click', () => {
            const isPreviewActive = modal.classList.toggle('preview-mode-active');

            // Update button text and icon
            if (isPreviewActive) {
                togglePreviewBtn.innerHTML = '<i class="fas fa-edit"></i> কনফিগারেশনে ফিরুন';
                togglePreviewBtn.classList.remove('dm-report');
                togglePreviewBtn.classList.add('dm-secondary');
                // Ensure preview is updated when entering preview mode
                updateSettingsLivePreview();
            } else {
                togglePreviewBtn.innerHTML = '<i class="fas fa-eye"></i> পূর্ণাঙ্গ প্রিভিউ';
                togglePreviewBtn.classList.remove('dm-secondary');
                togglePreviewBtn.classList.add('dm-report');
            }

            showNotification(isPreviewActive ? 'ইনস্ট্যান্ট প্রিভিউ মোড সক্রিয়' : 'কনফিগারেশন মোড সক্রিয়');
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Gather Signatures from UI
            const sigCards = document.querySelectorAll('.sig-slot-card');
            const signatures = [];
            sigCards.forEach(card => {
                const label = card.querySelector('.sig-label-input').value.trim();
                const url = card.dataset.url || '';
                if (label) {
                    signatures.push({ label, url });
                }
            });

            await saveMarksheetSettings({
                institutionName: document.getElementById('msInstitutionName').value.trim(),
                institutionAddress: document.getElementById('msInstitutionAddress').value.trim(),
                headerLine1: document.getElementById('msHeaderLine1').value.trim(),
                primaryColor: document.getElementById('msPrimaryColor').value,
                fontSize: document.getElementById('msFontSize').value,
                theme: document.getElementById('msTheme').value,
                borderStyle: document.getElementById('msBorderStyle').value,
                typography: document.getElementById('msTypography').value,
                rowDensity: document.getElementById('msRowDensity').value,
                watermarkUrl: marksheetSettings.watermarkUrl || '',
                watermarkOpacity: parseInt(document.getElementById('msWatermarkOpacity').value) / 100,
                hiddenSubjects: marksheetSettings.hiddenSubjects || [],
                historyExams: marksheetSettings.historyExams || [],
                showSummary: document.getElementById('msShowSummary').checked,
                showGradeScale: document.getElementById('msShowGradeScale').checked,
                boardStandardOptional: document.getElementById('msBoardStandardOptional')?.checked || false,
                signatures: signatures.length > 0 ? signatures : [
                    { label: 'শ্রেণি শিক্ষক', url: '' },
                    { label: 'পরীক্ষা কমিটি', url: '' },
                    { label: 'অধ্যক্ষ', url: '' }
                ]
            });

            if (modal) modal.classList.remove('active');
        });
    }
}

/**
 * Render Signature Slots in Settings Modal
 */
function renderSignatureSlots() {
    const container = document.getElementById('msSignatureSlotsContainer');
    if (!container) return;

    if (!marksheetSettings.signatures || marksheetSettings.signatures.length === 0) {
        marksheetSettings.signatures = [
            { label: 'শ্রেণি শিক্ষক', url: '' },
            { label: 'পরীক্ষা কমিটি', url: '' },
            { label: 'অধ্যক্ষ', url: '' }
        ];
    }

    container.innerHTML = marksheetSettings.signatures.map((sig, index) => `
        <div class="sig-slot-card" data-index="${index}" data-url="${sig.url || ''}">
            <div class="sig-input-wrapper">
                <input type="text" class="form-control sig-label-input" value="${sig.label}" placeholder="পদের নাম (উদাঃ অধ্যক্ষ)">
            </div>
            <div class="sig-previews" style="display: flex; align-items: center; gap: 8px;">
                <div class="sig-preview-thumb">
                    ${sig.url ? `<img src="${sig.url}" alt="Signature">` : '<i class="fas fa-image" style="opacity: 0.2;"></i>'}
                </div>
                <label class="sig-upload-btn" title="স্বাক্ষর আপলোড">
                    <i class="fas fa-upload"></i>
                    <input type="file" accept="image/*" class="sig-file-input" style="display: none;">
                </label>
            </div>
            <i class="fas fa-trash-alt btn-remove-sig" title="মুছে ফেলুন"></i>
        </div>
    `).join('');

    // Add Event Listeners to Slots
    container.querySelectorAll('.sig-slot-card').forEach(card => {
        const index = card.dataset.index;
        const fileInput = card.querySelector('.sig-file-input');
        const removeBtn = card.querySelector('.btn-remove-sig');
        const labelInput = card.querySelector('.sig-label-input');

        labelInput.addEventListener('input', (e) => {
            marksheetSettings.signatures[index].label = e.target.value;
            updateSettingsLivePreview();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    let url = ev.target.result;
                    try {
                        url = await compressImage(url, 500, 300, 0.7);
                    } catch (err) {
                        console.warn("Signature compression failed", err);
                    }
                    card.dataset.url = url;
                    marksheetSettings.signatures[index].url = url;
                    card.querySelector('.sig-preview-thumb').innerHTML = `<img src="${url}" alt="Signature">`;
                    updateSettingsLivePreview();
                };
                reader.readAsDataURL(file);
            }
        });

        removeBtn.addEventListener('click', () => {
            marksheetSettings.signatures.splice(index, 1);
            renderSignatureSlots();
            updateSettingsLivePreview();
        });
    });
}

/**
 * Build a clean print-only HTML document for marksheet(s)
 * This approach completely bypasses all conflicting @media print rules
 * by creating an isolated document with only marksheet content and CSS.
 */
function buildMarksheetPrintDocument(marksheetHtmlArray) {
    // Collect all styles and stylesheets from the current page
    // Crucial for environments like Vite that inject CSS via <style> tags
    const allStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(el => el.outerHTML)
        .join('\n');

    const marksheetContent = marksheetHtmlArray.join('\n');

    return `<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>মার্কশীট প্রিন্ট</title>
    ${allStyles}
    <style>
        /* ===== ISOLATED PRINT-ONLY OVERRIDE ===== */
        /* Reset everything for a clean print environment */
        *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            width: 100% !important;
            height: auto !important;
        }

        body {
            display: block !important;
        }

        /* Screen preview styling */
        @media screen {
            body {
                background: #e5e7eb !important;
                padding: 20px !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                gap: 30px !important;
            }
            .ms-page {
                box-shadow: 0 20px 50px rgba(0,0,0,0.15) !important;
            }
        }

        /* CRITICAL: Override the ms-page for perfect A4 fit */
        html body .ms-page {
            display: block !important;
            visibility: visible !important;
            width: 210mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: #fff !important;
            position: relative !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            transform: none !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            break-inside: avoid !important;
        }

        html body .ms-page:last-child {
            page-break-after: avoid !important;
            break-after: auto !important;
        }

        /* Hide print/action buttons */
        .ms-actions-float,
        .no-print {
            display: none !important;
        }

        /* Preserve all backgrounds and colors during print */
        @media print {
            @page {
                size: A4 portrait;
                margin: 0;
            }

            html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                width: 210mm !important;
            }

            html body .ms-page {
                width: 210mm !important;
                height: 297mm !important;
                max-height: 297mm !important;
                margin: 0 auto !important;
                padding: 0 !important;
                box-shadow: none !important;
                transform: none !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                break-after: page !important;
                break-inside: avoid !important;
            }

            html body .ms-page:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
            }

            /* Force preserve backgrounds */
            .ms-table thead tr,
            .ms-table tbody tr:nth-child(even),
            .ms-row-total,
            .ms-student-section,
            .ms-result-box,
            .ms-result-pass,
            .ms-result-fail,
            .ms-grade-scale,
            .ms-optional-tag,
            .ms-header-pill,
            .ms-watermark-img {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            .ms-watermark-img {
                display: block !important;
            }

            .ms-border-frame {
                position: absolute !important;
                visibility: visible !important;
            }
        }
    </style>
</head>
<body>
    ${marksheetContent}
    <script>
        // Auto-print when loaded, then close
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 400);
        };
        window.onafterprint = function() {
            window.close();
        };
    </script>
</body>
</html>`;
}

/**
 * Print a single marksheet - Opens an isolated print window
 */
window.printSingleMarksheet = function (containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const htmlContent = buildMarksheetPrintDocument([el.outerHTML]);
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        showNotification('পপ-আপ ব্লক করা হয়েছে। অনুগ্রহ করে পপ-আপ অনুমতি দিন।', 'error');
        return;
    }
    printWindow.document.write(htmlContent);
    printWindow.document.close();
};

/**
 * Bulk Print - Opens an isolated print window with all or filtered marksheets
 * @param {string} filter - 'all', 'absent', or 'present'
 */
function bulkPrint(filter = 'all') {
    const previewArea = document.getElementById('marksheetPreview');
    if (!previewArea) return;

    let allPages = Array.from(previewArea.querySelectorAll('.ms-page'));

    // Filter logic
    if (filter === 'absent') {
        allPages = allPages.filter(p => p.getAttribute('data-is-absent') === 'true');
    } else if (filter === 'present') {
        allPages = allPages.filter(p => p.getAttribute('data-is-absent') === 'false');
    }

    if (allPages.length === 0) {
        const msg = filter === 'absent' ? 'কোনো অনুপস্থিত শিক্ষার্থীর মার্কশীট নেই' :
            filter === 'present' ? 'কোনো উপস্থিত শিক্ষার্থীর মার্কশীট নেই' :
                'প্রিন্ট করার জন্য কোনো মার্কশীট নেই';
        showNotification(msg, 'error');
        return;
    }

    const marksheetHtmlArray = allPages.map(p => p.outerHTML);
    const htmlContent = buildMarksheetPrintDocument(marksheetHtmlArray);
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        showNotification('পপ-আপ ব্লক করা হয়েছে। অনুগ্রহ করে পপ-আপ অনুমতি দিন।', 'error');
        return;
    }
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

/**
 * Initialize Marksheet Manager
 */
export async function initMarksheetManager() {
    const generateBtn = document.getElementById('msGenerateBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateMarksheets);
    }

    // Print Buttons
    const printAllBtn = document.getElementById('msPrintAllBtn');
    if (printAllBtn) {
        printAllBtn.onclick = () => bulkPrint('all');
    }

    const printPresentBtn = document.getElementById('msPrintPresentBtn');
    if (printPresentBtn) {
        printPresentBtn.onclick = () => bulkPrint('present');
    }

    const printAbsentBtn = document.getElementById('msPrintAbsentBtn');
    if (printAbsentBtn) {
        printAbsentBtn.onclick = () => bulkPrint('absent');
    }

    const resetBtn = document.getElementById('msResetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const preview = document.getElementById('marksheetPreview');
            if (preview) {
                preview.innerHTML = `
                    <div class="empty-state-msg">
                        <i class="fas fa-scroll" style="font-size: 2rem; opacity: 0.3;"></i>
                        <p>মার্কশীট দেখতে উপরে থেকে তথ্য নির্বাচন করে "মার্কশীট তৈরি করুন" বাটনে ক্লিক করুন।</p>
                    </div>
                `;
            }
            if (printAllBtn) printAllBtn.style.display = 'none';
            const mainHeader = document.getElementById('msMainPreviewHeader');
            if (mainHeader) mainHeader.style.display = 'none';
            showNotification('মার্কশীট প্রিভিউ রিসেট করা হয়েছে');
        });
    }

    // Initialize Main Zoom Controls
    const mainZoomInput = document.getElementById('msMainZoom');
    const mainZoomLevel = document.getElementById('msMainZoomLevel');
    const mainPreviewArea = document.getElementById('marksheetPreview');

    if (mainZoomInput && mainZoomLevel && mainPreviewArea) {
        mainZoomInput.addEventListener('input', (e) => {
            const val = e.target.value;
            mainZoomLevel.innerText = Math.round(val * 100) + '%';
            mainPreviewArea.style.setProperty('--ms-main-scale', val);
        });
    }

    const mainRefreshBtn = document.getElementById('msMainRefreshBtn');
    if (mainRefreshBtn) {
        mainRefreshBtn.addEventListener('click', generateMarksheets);
    }

    initMarksheetSettingsModal();
    await populateMSDropdowns();

    // The mapping UI is now initialized via initStudentMappingUI triggered from app.js
    // to ensure the bindings happen even when skipping the main marksheet view
}

/**
 * Initialize Student-wise Mapping UI events and states
 */
export function initStudentMappingUI() {
    const msMapSubjectSelect = document.getElementById('msMapSubject');
    const msMapAddBtn = document.getElementById('msMapAddBtn');

    // Check if dropdowns need re-populating (though populateMarksheetSettingsDropdowns shouldn't conflict)
    if (msMapSubjectSelect && msMapSubjectSelect.options.length <= 1) {
        populateSubjectSelect(msMapSubjectSelect);

        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#marksheet-settings') {
                populateSubjectSelect(msMapSubjectSelect);
                renderSubjectMappings();
            }
        });
    }

    if (msMapAddBtn) {
        // Rewrite click handler to perfectly catch user input and prevent defaults
        msMapAddBtn.onclick = (e) => {
            e.preventDefault();
            addSubjectMapping();
        };
    }

    renderSubjectMappings();
}

/**
 * Render Exam History checklist in settings modal
 */
async function renderHistoryExamsChecklist() {
    const container = document.getElementById('msHistoryChecklist');
    if (!container) return;

    try {
        const exams = await getSavedExams();
        const uniqueExamNames = [...new Set(exams.map(e => e.name).filter(Boolean))].sort();

        if (uniqueExamNames.length === 0) {
            container.innerHTML = '<p style="opacity: 0.6; font-size: 0.9rem;">কোনো পরীক্ষা পাওয়া যায়নি।</p>';
            return;
        }

        const selectedHistory = new Set(marksheetSettings.historyExams || []);

        container.innerHTML = uniqueExamNames.map(examName => {
            return `
            <label style="display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                <input type="checkbox" class="ms-history-toggle" data-val="${examName}" ${selectedHistory.has(examName) ? 'checked' : ''} style="width: 18px; height: 18px;">
                <span style="font-size: 0.9rem; font-weight: 600;">${examName}</span>
            </label>`;
        }).join('');

        // Add listeners
        container.querySelectorAll('.ms-history-toggle').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const val = checkbox.dataset.val;
                if (!marksheetSettings.historyExams) marksheetSettings.historyExams = [];

                if (checkbox.checked) {
                    if (!marksheetSettings.historyExams.includes(val)) {
                        marksheetSettings.historyExams.push(val);
                    }
                } else {
                    marksheetSettings.historyExams = marksheetSettings.historyExams.filter(e => e !== val);
                }

                // Note: live preview for history is tricky as it's not in the mock data usually
                // but we can refresh the main UI if needed.
            });
        });

    } catch (err) {
        console.error("Failed to load exams for checklist", err);
        container.innerHTML = '<p style="color:red;">ডাটা লোড করতে ব্যর্থ হয়েছে</p>';
    }
}

/**
 * Render subject toggles in settings modal
 */
function renderSubjectVisibilityToggles() {
    const container = document.getElementById('msSubjectToggles');
    if (!container) return;

    const subjects = state.lastGeneratedSubjects || [];
    if (subjects.length === 0) {
        container.innerHTML = '<p style="opacity: 0.6; font-size: 0.9rem; grid-column: 1/-1;">কোনো বিষয় পাওয়া যায়নি। প্রথমে মার্কশীট জেনারেট করুন।</p>';
        return;
    }

    const hiddenSet = new Set(marksheetSettings.hiddenSubjects || []);

    container.innerHTML = subjects.map(s => {
        const sub = typeof s === 'object' ? s.name : s;
        return `
        <label style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.2s;">
            <input type="checkbox" class="ms-subject-toggle" data-subject="${sub}" ${!hiddenSet.has(sub) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
            <span style="font-size: 0.9rem; font-weight: 600;">${sub}</span>
        </label>`;
    }).join('');

    // Add listeners to new checkboxes
    container.querySelectorAll('.ms-subject-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const sub = checkbox.dataset.subject;
            const hidden = !checkbox.checked;

            if (!marksheetSettings.hiddenSubjects) marksheetSettings.hiddenSubjects = [];

            if (hidden) {
                if (!marksheetSettings.hiddenSubjects.includes(sub)) {
                    marksheetSettings.hiddenSubjects.push(sub);
                }
            } else {
                marksheetSettings.hiddenSubjects = marksheetSettings.hiddenSubjects.filter(s => s !== sub);
            }

            // Trigger live preview update
            updateSettingsLivePreview();
        });
    });
}

/**
 * Combined Paper Calculation Logic
 * Merges Paper 1 and Paper 2 results based on rules
 */
export function applyCombinedPaperLogic(studentsArray, currentSubjects, rules, allOptSubs = []) {
    const combinedMappings = rules.combinedSubjects || [];
    const groupedSubjects = [];
    const processedPapers = new Set();

    currentSubjects.forEach(subj => {
        if (processedPapers.has(subj)) return;

        const mapping = combinedMappings.find(m => m.paper1 === subj || m.paper2 === subj);

        if (mapping) {
            const p1 = mapping.paper1;
            const p2 = mapping.paper2;
            const combinedName = mapping.combinedName;

            processedPapers.add(p1);
            processedPapers.add(p2);

            groupedSubjects.push({
                name: combinedName,
                isCombined: true,
                isOptional: allOptSubs.some(os => p1.includes(os) || os.includes(p1) || p2.includes(os) || os.includes(p2)),
                papers: [p1, p2].filter(p => currentSubjects.includes(p))
            });

            studentsArray.forEach(student => {
                const data1 = student.subjects[p1];
                const data2 = student.subjects[p2];

                if (data1 !== undefined || data2 !== undefined) {
                    const combinedData = {
                        written: (data1?.written || 0) + (data2?.written || 0),
                        mcq: (data1?.mcq || 0) + (data2?.mcq || 0),
                        practical: (data1?.practical || 0) + (data2?.practical || 0),
                        total: (data1?.total || 0) + (data2?.total || 0),
                        status: (data1?.status === 'ফেল' || data2?.status === 'ফেল') ? 'ফেল' : 'পাস'
                    };

                    const s1Config = state.subjectConfigs?.[p1] || { total: 100 };
                    const s2Config = state.subjectConfigs?.[p2] || { total: 100 };
                    const totalMax = (parseInt(s1Config.total) || 100) + (parseInt(s2Config.total) || 100);

                    const papersCount = [p1, p2].filter(p => student.subjects[p]).length || 1;
                    combinedData.avgMarks = combinedData.total / papersCount;

                    const pct = totalMax > 0 ? (combinedData.total / totalMax) * 100 : 0;
                    combinedData.grade = getLetterGrade(pct);
                    combinedData.gpa = getGradePoint(pct);

                    student.subjects[combinedName] = combinedData;
                }
            });
        } else {
            groupedSubjects.push({
                name: subj,
                isCombined: false,
                isOptional: allOptSubs.some(os => subj.includes(os) || os.includes(subj)),
                paper: subj
            });
            processedPapers.add(subj);
        }
    });

    return groupedSubjects;
}

/**
 * Render QR Codes for all generated marksheets and convert to Images for Print Reliability
 */
export async function renderMarksheetQRCodes(container) {
    const canvases = container.querySelectorAll('.ms-mr-qr-canvas');
    if (!canvases.length) return;

    for (const canvas of canvases) {
        try {
            const uid = canvas.dataset.uid;
            const exam = canvas.dataset.exam;
            const name = canvas.dataset.name;
            const liveLink = window.location.origin + window.location.pathname + '#student-results?uid=' + uid + '&exam=' + encodeURIComponent(exam);
            const qrData = `Student Marksheet Verification\nID: ${uid}\nName: ${name}\nExam: ${exam}\nLink: ${liveLink}`;

            // 1. Generate QR onto the hidden canvas with Ultra-High Resolution
            await QRCode.toCanvas(canvas, qrData, {
                width: 600, // Ultra-High Resolution for sharpest print
                margin: 0,
                color: { dark: '#000000', light: '#ffffff' }, // Pure black for max contrast
                errorCorrectionLevel: 'H' // Highest error correction for best print scanning
            });

            // 2. Convert Canvas to High-Quality Image
            const qrImageUrl = canvas.toDataURL("image/png", 1.0);

            // 3. Inject optimized image
            const wrapper = canvas.parentElement;
            if (wrapper) {
                const img = document.createElement('img');
                img.src = qrImageUrl;
                img.classList.add('ms-qr-printable-img');
                img.style.width = '100%'; // Make it fill the container
                img.style.maxWidth = '165px'; // Allow it to grow significantly larger
                img.style.height = 'auto';
                img.style.objectFit = 'contain';
                img.style.display = 'block';
                img.style.imageRendering = 'pixelated'; // Prevent blurring
                img.style.margin = '0 auto';

                // Clear and update
                wrapper.innerHTML = '';
                wrapper.appendChild(img);
            }


        } catch (err) {
            console.error('Marksheet QR generation/conversion failed:', err);
        }
    }
}

/**
 * Populate any select element with current available subjects
 */
async function populateSubjectSelect(selectElement) {
    if (!selectElement) return;

    const tryPopulate = async (retryCount = 0) => {
        const subjects = await getAllAvailableSubjects();

        if (subjects.length > 0) {
            let html = '<option value="">বিষয় নির্বাচন করুন</option>';
            subjects.forEach(sub => {
                html += `<option value="${sub}">${sub}</option>`;
            });
            selectElement.innerHTML = html;
            return true;
        }

        if (retryCount < 3) {
            selectElement.innerHTML = '<option value="">লোড হচ্ছে...</option>';
            setTimeout(() => tryPopulate(retryCount + 1), 1500);
            return false;
        } else {
            selectElement.innerHTML = '<option value="">কোনো বিষয় খুঁজে পাওয়া যায়নি</option>';
            return false;
        }
    };

    await tryPopulate();
}

/**
 * Add a new student-wise subject mapping
 */
async function addSubjectMapping() {
    const subject = document.getElementById('msMapSubject').value;
    const group = document.getElementById('msMapGroup').value;
    const rollsInput = document.getElementById('msMapRolls').value;

    if (!subject || !rollsInput) {
        showNotification('বিষয় এবং রোল নম্বর প্রদান করুন', 'error');
        return;
    }

    // Clean roll numbers
    const rolls = rollsInput.split(',')
        .map(r => r.trim())
        .filter(r => r !== '' && !isNaN(r))
        .map(r => parseInt(r));

    if (rolls.length === 0) {
        showNotification('সঠিক রোল নম্বর প্রদান করুন', 'error');
        return;
    }

    if (!marksheetSettings.subjectMapping) {
        marksheetSettings.subjectMapping = [];
    }

    // Add or update mapping
    const existingIdx = marksheetSettings.subjectMapping.findIndex(m => m.subject === subject && m.group === group);
    if (existingIdx > -1) {
        // Merge rolls, unique
        const combined = [...new Set([...marksheetSettings.subjectMapping[existingIdx].rolls, ...rolls])];
        marksheetSettings.subjectMapping[existingIdx].rolls = combined;
    } else {
        marksheetSettings.subjectMapping.push({
            subject,
            group,
            rolls
        });
    }

    const success = await saveMarksheetSettings(marksheetSettings);

    // Also sync to localStorage for resultEntryManager filter
    try {
        localStorage.setItem('pa_marksheet_settings', JSON.stringify(marksheetSettings));
    } catch (e) { }

    if (success) {
        showNotification('সাবজেক্ট ম্যাপিং সংরক্ষিত হয়েছে ✅', 'success');
        document.getElementById('msMapRolls').value = '';
        renderSubjectMappings();
    }
}

/**
 * Render the list of subject mappings
 */
function renderSubjectMappings() {
    const container = document.getElementById('msMappingList');
    if (!container) return;

    if (!marksheetSettings.subjectMapping || marksheetSettings.subjectMapping.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 20px; opacity: 0.5; font-size: 0.8rem;">কোনো ম্যাপিং নেই</div>';
        return;
    }

    let html = '';
    marksheetSettings.subjectMapping.forEach((m, idx) => {
        html += `
            <div class="ms-settings-item" style="border-left: 3px solid var(--primary-color, #3b82f6); margin-bottom: 8px; justify-content: space-between; align-items: start;">
                <div style="flex:1;">
                    <div style="font-weight: 800; font-size: 0.85rem; color: var(--text-color);">${m.subject}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
                        <span class="badge" style="background: rgba(var(--primary-rgb, 59, 130, 246), 0.1); color: var(--primary-color, #3b82f6); padding: 2px 6px;">${m.group}</span>
                    </div>
                    <div style="font-size: 0.75rem; margin-top: 4px; overflow-wrap: break-word; color: var(--text-color); opacity: 0.85;">
                        <strong>রোলসমূহ:</strong> ${m.rolls.join(', ')}
                    </div>
                </div>
                <div style="display: flex; gap: 4px; align-items: start;">
                    <button onclick="window.editSubjectMapping(${idx})" class="btn-clear" style="color: var(--primary-color, #3b82f6); padding: 4px; border:none; background:transparent;" title="এডিট করুন">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="window.removeSubjectMapping(${idx})" class="btn-clear" style="color: #ef4444; padding: 4px; border:none; background:transparent;" title="মুছে ফেলুন">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

/**
 * Remove a mapping entry
 */
window.removeSubjectMapping = (index) => {
    const mapping = marksheetSettings.subjectMapping[index];
    showConfirmModal(
        'আপনি কি নিশ্চিত যে এই ম্যাপিংটি মুছে ফেলতে চান?',
        async () => {
            marksheetSettings.subjectMapping.splice(index, 1);
            const success = await saveMarksheetSettings(marksheetSettings);

            // Sync to local
            try { localStorage.setItem('pa_marksheet_settings', JSON.stringify(marksheetSettings)); } catch (e) { }

            if (success) {
                showNotification('ম্যাপিং মুছে ফেলা হয়েছে ✅', 'success');
                renderSubjectMappings();
            }
        },
        `${mapping.subject}`,
        `গ্রুপ: ${mapping.group} | রোল সংখ্যা: ${mapping.rolls.length}টি`
    );
};

/**
 * Edit a mapping entry
 */
window.editSubjectMapping = (index) => {
    const mapping = marksheetSettings.subjectMapping[index];

    // Populate form fields
    const subjectEl = document.getElementById('msMapSubject');
    if (subjectEl) subjectEl.value = mapping.subject;

    const groupEl = document.getElementById('msMapGroup');
    if (groupEl) groupEl.value = mapping.group;

    const rollsEl = document.getElementById('msMapRolls');
    if (rollsEl) {
        rollsEl.value = mapping.rolls.join(', ');
        rollsEl.focus();
    }

    // Remove the current entry from the DOM list immediately for clean UX
    // It is deliberately NOT saved to DB until they hit Add Mapping.
    marksheetSettings.subjectMapping.splice(index, 1);
    renderSubjectMappings();
};

/**
 * Get all available subject names for mapping dropdown.
 * Uses the SAME proven pattern as marksheetRulesManager.js (lines 102-139).
 */
async function getAllAvailableSubjects() {
    const metaKeys = ['updatedAt', 'id', 'session', 'class', 'status', 'examId'];

    // 1. Primary: Class-Subject Mappings (Firestore or cached)
    let mappingSubjects = [];
    try {
        let classSubjectMappings = state.classSubjectMapping || {};
        if (Object.keys(classSubjectMappings).length === 0) {
            classSubjectMappings = await getClassSubjectMappings();
            state.classSubjectMapping = classSubjectMappings;
        }
        mappingSubjects = Object.entries(classSubjectMappings)
            .filter(([key]) => !metaKeys.includes(key))
            .flatMap(([, subs]) => Array.isArray(subs) ? subs : [])
            .filter(Boolean);
    } catch (e) {
        console.warn('getAllAvailableSubjects: mapping fetch failed', e);
    }

    // 2. Fallback: Subject Configs + Saved Exams
    const configSubjects = Object.keys(state.subjectConfigs || {}).filter(k => !metaKeys.includes(k));
    const examSubjects = (state.savedExams || []).map(e => e.subject).filter(Boolean);

    // 3. Combine, deduplicate, sort
    return [...new Set([...mappingSubjects, ...configSubjects, ...examSubjects])]
        .filter(s => s && typeof s === 'string' && s.length > 2)
        .sort((a, b) => a.localeCompare(b, 'bn'));
}


