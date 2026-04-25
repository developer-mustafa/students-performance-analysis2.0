/**
 * Student Results Manager Module
 * Public-facing page for students to search and view their marksheet using a unique ID.
 * @module studentResultsManager
 */

import {
    getSavedExams,
    getExamsByCriteria,
    getExamConfigs,
    getSettings,
    getStudentLookupMap,
    generateStudentDocId,
    getSubjectConfigs,
    getUnifiedStudents
} from '../firestoreService.js';
import { state } from './state.js';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { showNotification, convertToEnglishDigits, convertToBengaliDigits, normalizeText, sortStudentData } from '../utils.js';
import {
    renderSingleMarksheet,
    applyCombinedPaperLogic,
    loadMarksheetSettings,
    getMarksheetSettings,
    renderMarksheetQRCodes
} from './marksheetManager.js';
import { loadMarksheetRules, currentMarksheetRules } from './marksheetRulesManager.js';

// ==========================================
// Bengali → English Transliteration Map
// ==========================================
const BANGLA_TO_ENGLISH = {
    'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u',
    'ঋ': 'ri', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
    'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
    'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
    'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
    'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
    'প': 'p', 'ফ': 'ph', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
    'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's',
    'হ': 'h', 'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ৎ': 't',
    'ং': 'ng', 'ঃ': 'h', 'ঁ': 'n',
    // Matras (vowel signs)
    'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u',
    'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou',
    '্': '', // Hasanta (virama) — suppress inherent vowel
    // Numerals
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
};

let studentResultsManagerInitialized = false;
let studentResultsHashBound = false;

// Expose Direct Search to Window to avoid complex inline JS escaping issues
window.srDirectSearch = (uid) => {
    if (!uid) return;
    const searchInput = document.getElementById('srSearchInput');
    const searchBtn = document.getElementById('srSearchBtn');
    const searchTab = document.querySelector('.sr-tab-btn[data-tab="srSearchSection"]');

    if (searchInput) {
        searchInput.value = uid.trim();
        const inputEvent = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(inputEvent);
    }

    if (searchTab) searchTab.click();

    // Give UI time to switch and process
    setTimeout(() => {
        if (searchBtn) searchBtn.click();
    }, 150);
};

// Global Copy Feedback (Optional integration)
window.__srCopyFeedback = () => {
    if (typeof showNotification === 'function') {
        showNotification('ইউনিক আইডি কপি হয়েছে (Copied!)', 'success');
    }
};

/**
 * Transliterate Bengali text to English
 * @param {string} text - Bengali text
 * @returns {string} - Transliterated English text (lowercase, no spaces)
 */
export function transliterateBangla(text) {
    if (!text) return '';
    let result = '';
    const str = String(text);
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (BANGLA_TO_ENGLISH[char] !== undefined) {
            result += BANGLA_TO_ENGLISH[char];
        } else if (/[a-zA-Z0-9]/.test(char)) {
            result += char.toLowerCase();
        } else if (char === '-') {
            result += '-';
        }
        // Skip spaces, special characters, etc.
    }
    return result;
}

/**
 * Extract first N characters from a Bengali/mixed string
 * Counts only consonants and standalone vowels (not matras)
 */
export function extractBengaliChars(text, count, fromEnd = false) {
    if (!text) return '';
    const str = String(text).replace(/\s+/g, '');
    // Bengali matras (dependent vowels) — should be attached to previous consonant
    const matras = new Set(['া', 'ি', 'ী', 'ু', 'ূ', 'ৃ', 'ে', 'ৈ', 'ো', 'ৌ', '্']);

    // First collect "logical characters" (base + attached matras)
    const logicalChars = [];
    let current = '';
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (matras.has(ch)) {
            current += ch;
        } else {
            if (current) logicalChars.push(current);
            current = ch;
        }
    }
    if (current) logicalChars.push(current);

    if (fromEnd) {
        return logicalChars.slice(-count).join('');
    }
    return logicalChars.slice(0, count).join('');
}

/**
 * Generate a deterministic 6-character hex hash from a string
 */
export function generateShortHash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    let hex = (h1 >>> 0).toString(16).toUpperCase();
    return hex.padStart(8, '0').substring(0, 6);
}

/**
 * Generate a unique student ID for public result lookup
 * NEW Format: MMMC-[Year]-[GroupCode]-[Roll] (e.g., MMMC-2026-S-105)
 * 
 * @param {string} name - Student name
 * @param {string} cls - Class (used for legacy / hash)
 * @param {string} session - Session or Year
 * @param {string|number} roll - Roll number
 * @param {string} group - Group name
 * @returns {string} - Modern Unique ID string
 */
export function generateStudentUniqueId(name, cls, session, roll, group) {
    // 1. Prefix
    const prefix = "MMMC";

    // 2. Year: The year after the student's session (e.g., "2024-2025" -> 2026)
    // This typically represents the HSC exam year and ensures the ID is permanent.
    const sessionEng = convertToEnglishDigits(String(session || ''));
    const yearMatches = sessionEng.match(/\d{4}/g);
    const sessionLastYear = yearMatches ? parseInt(yearMatches.pop()) : new Date().getFullYear();
    const year = sessionLastYear + 1;

    // 3. Group Code
    const gOrignial = String(group || '').toLowerCase();
    const g = transliterateBangla(gOrignial).toLowerCase();

    let groupCode = 'G'; // General/Default
    if (g.includes('sci') || gOrignial.includes('বিজ্ঞা')) {
        groupCode = 'S';
    } else if (g.includes('com') || g.includes('bus') || gOrignial.includes('ব্যবসায়')) {
        groupCode = 'C';
    } else if (g.includes('art') || g.includes('hum') || gOrignial.includes('মানবি')) {
        groupCode = 'A';
    }

    // 4. Roll: Clean roll number (English digits only)
    const rollPart = convertToEnglishDigits(String(roll || '').trim()).replace(/\D/g, '');

    return `${prefix}-${year}-${groupCode}-${rollPart}`;
}

/**
 * LEGACY ID GENERATOR (Internal use for backward compatibility)
 * Format: [NAME]-R[ROLL]-[HASH]
 */
function generateLegacyStudentUniqueId(name, cls, session, roll, group) {
    const first3 = extractBengaliChars(name, 3, false);
    const namePrefix = transliterateBangla(first3).toUpperCase().padEnd(3, 'X').substring(0, 3);
    const rollPart = convertToEnglishDigits(String(roll || '').replace(/\s+/g, '')).padStart(2, '0');
    const rawString = `${name}|${cls}|${session}|${roll}|${group}`;
    const hash = generateShortHash(rawString);
    return `${namePrefix}-R${rollPart}-${hash}`;
}

/**
 * Search for a student by unique ID (or Roll Number with filters) across saved exams
 * @param {string} searchId - The unique ID or Roll Number to search for
 * @param {Object} filters - Optional filters: { class, session, examName }
 * @returns {Promise<Object|null>} - Student match with all related exam data
 */
async function searchByUniqueId(searchId, filters = {}) {
    const normalizedSearch = searchId.toUpperCase().replace(/\s+/g, '');
    const { class: selClass, session: selSession, examName } = filters;

    // Cost-Optimization: If Class & Session are provided, only fetch relevant exams
    // Otherwise, use allExams (which has localStorage/memory caching)
    const allExams = (selClass && selSession)
        ? await getExamsByCriteria(selClass, selSession)
        : await getSavedExams();

    // Filter exams first if filter options are provided
    let filteredExams = allExams;
    if (selClass) filteredExams = filteredExams.filter(e => e.class === selClass);
    if (selSession) filteredExams = filteredExams.filter(e => e.session === selSession);
    if (examName && examName !== 'all') filteredExams = filteredExams.filter(e => e.name === examName);

    // Use filteredExams for the main loop to ensure we only process relevant data
    const matches = new Map();
    filteredExams.forEach(exam => {
        if (!exam.studentData || !Array.isArray(exam.studentData)) return;

        exam.studentData.forEach(s => {
            const uid = generateStudentUniqueId(
                s.name,
                exam.class || s.class || '',
                exam.session || s.session || '',
                s.id,
                s.group || ''
            );

            const legacyUid = generateLegacyStudentUniqueId(
                s.name,
                exam.class || s.class || '',
                exam.session || s.session || '',
                s.id,
                s.group || ''
            );

            // Match logic:
            // 1. Exact Unique ID match (Check Modern then Legacy)
            // 2. Roll match (s.id) + Class + Session (If filters provided)
            let isMatch = (uid === normalizedSearch || legacyUid === normalizedSearch);

            if (!isMatch && selClass && selSession) {
                const roll = convertToEnglishDigits(String(s.id || '').trim());
                const searchRoll = convertToEnglishDigits(normalizedSearch);
                if (roll === searchRoll && (exam.class === selClass) && (exam.session === selSession)) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                const key = `${s.id}_${s.group || ''}_${exam.class}_${exam.session}`;
                if (!matches.has(key)) {
                    matches.set(key, {
                        id: s.id,
                        name: s.name,
                        group: s.group || '',
                        class: exam.class || s.class || '',
                        session: exam.session || s.session || '',
                        uniqueId: uid,
                        exams: []
                    });
                }
                matches.get(key).exams.push(exam);
            }
        });
    });

    if (matches.size === 0) return null;

    // Fetch latest student details for all matches
    const lookupMap = await getStudentLookupMap();
    const results = Array.from(matches.values());
    const finalResults = [];

    results.forEach(res => {
        const studentInfo = {
            id: res.id,
            group: res.group,
            class: res.class,
            session: res.session
        };
        const studentKey = generateStudentDocId(studentInfo);
        const latest = lookupMap.get(studentKey);

        if (latest) {
            // Check if student is disabled
            if (latest.status === false) {
                return; // Skip disabled student
            }

            // Override with latest data from management
            res.name = latest.name || res.name;
            res.fatherName = latest.fatherName || '';
            res.mobile = latest.mobile || '';
        }
        finalResults.push(res);
    });

    if (finalResults.length === 0) return null;

    // If an examName filter is set, we return the match that contains that exam
    // Otherwise we return the first match.
    return finalResults[0];
}

/**
 * Generate and display the marksheet for a found student
 */
async function displayStudentMarksheet(studentResult) {
    const previewArea = document.getElementById('srMarksheetPreview');
    if (!previewArea) return;

    previewArea.innerHTML = '<div class="sr-loading"><i class="fas fa-spinner fa-spin"></i> মার্কশীট তৈরি হচ্ছে...</div>';

    const { id, name, group, session } = studentResult;
    const cls = studentResult.class;
    const exams = studentResult.exams;

    await loadMarksheetSettings();

    // 1. Determine which exams are being looked at (Single or Combined)
    const searchExamName = document.getElementById('srSearchExam')?.value;
    const uniqueExamNames = [...new Set(exams.map(e => e.name).filter(Boolean))];

    let targetExamName = searchExamName === 'all' ? '__all__' : searchExamName;
    if (!targetExamName && uniqueExamNames.length === 1) targetExamName = uniqueExamNames[0];
    if (!targetExamName) targetExamName = '__all__';

    const examDisplayName = targetExamName === '__all__' ? 'সমন্বিত ফলাফল' : targetExamName;

    // 2. Fetch ALL exams in this session to calculate accurate ranks/stats
    const allExams = await getSavedExams();
    let relevantExams = allExams.filter(e => e.class === cls && e.session === session);
    if (targetExamName !== '__all__') {
        relevantExams = relevantExams.filter(e => e.name === targetExamName);
    }

    if (relevantExams.length === 0) {
        previewArea.innerHTML = '<div class="sr-error">তথ্য পাওয়া যায়নি।</div>';
        return;
    }

    // 3. Aggregate ALL students for this specific exam context
    const studentAggMap = new Map();
    const lookupMap = await getStudentLookupMap();
    const subjectsSet = new Set(relevantExams.map(e => e.subject).filter(Boolean));
    const subjects = [...subjectsSet];

    relevantExams.forEach(exam => {
        if (!exam.studentData) return;
        exam.studentData.forEach(s => {
            const sGroup = normalizeText(s.group || '');
            const sRoll = convertToEnglishDigits(String(s.id || '').trim().replace(/^0+/, '')) || '0';
            const key = `${sRoll}_${sGroup}`;

            if (!studentAggMap.has(key)) {
                const studentKey = generateStudentDocId({ id: s.id, group: sGroup, class: cls, session: session });
                const latest = lookupMap.get(studentKey);
                studentAggMap.set(key, {
                    id: s.id,
                    name: latest ? (latest.name || s.name) : s.name,
                    group: sGroup,
                    class: cls,
                    session: session,
                    status: latest ? (latest.status !== undefined ? latest.status : true) : true,
                    subjects: {}
                });
            }

            const subjKey = normalizeText(exam.subject).replace(/\s+/g, '') || exam.subject;
            const data = s;
            const existing = studentAggMap.get(key).subjects[subjKey];
            const hasMarks = (data.written !== null && data.written !== '' && data.written > 0) ||
                (data.mcq !== null && data.mcq !== '' && data.mcq > 0) ||
                (data.practical !== null && data.practical !== '' && data.practical > 0);

            if (!existing || hasMarks) {
                studentAggMap.get(key).subjects[subjKey] = {
                    written: data.written || 0,
                    mcq: data.mcq || 0,
                    practical: data.practical || 0,
                    total: data.total || 0,
                    grade: data.grade || '',
                    gpa: data.gpa || '',
                    status: data.status || ''
                };
            }
        });
    });

    const allStudents = [...studentAggMap.values()]
        .filter(s => String(s.status) !== 'false')
        .sort((a, b) => (parseInt(convertToEnglishDigits(String(a.id))) || 0) - (parseInt(convertToEnglishDigits(String(b.id))) || 0));

    // 4. Calculate Rules and Sorting (Matching marksheetManager)
    let allOptSubs = [];
    let rules = {};
    try {
        await loadMarksheetRules();
        rules = currentMarksheetRules[cls] || currentMarksheetRules["All"] || {};
        const generalSubjects = rules.generalSubjects || [];
        const optionalSubjectsObj = rules.optionalSubjects || {};
        const optKey = group !== 'all' ? group : Object.keys(optionalSubjectsObj)[0];
        allOptSubs = group !== 'all' ? (optionalSubjectsObj[optKey] || []) : Object.values(optionalSubjectsObj).flat();

        subjects.sort((a, b) => {
            const getScore = (sub) => {
                if (generalSubjects.includes(sub)) return 1000;
                if (allOptSubs.some(os => sub.includes(os) || os.includes(sub))) return 5000;
                return 3000;
            };
            return getScore(a) - getScore(b);
        });
    } catch (e) { console.warn("Rules load failed", e); }

    let displaySubjects = subjects;
    if (rules.mode === 'combined' && rules.combinedSubjects?.length > 0) {
        displaySubjects = applyCombinedPaperLogic(allStudents, subjects, rules, allOptSubs);
    }

    const subjectConfigs = await getSubjectConfigs();
    const highestMarks = {};
    allStudents.forEach(st => {
        Object.entries(st.subjects).forEach(([sk, sd]) => {
            const t = Number(sd.total) || 0;
            if (!highestMarks[sk] || t > highestMarks[sk]) highestMarks[sk] = t;
        });
    });

    // 5. Pass 1: Light Render Ranks for everyone (EXACT parity with master module)
    const allRendered = [];
    for (const st of allStudents) {
        const lightHtml = await renderSingleMarksheet(st, displaySubjects, examDisplayName, session, null, rules, allOptSubs, allExams, subjectConfigs, null, true, highestMarks);
        allRendered.push({ key: `${st.id}_${st.group}`, group: st.group, html: lightHtml, id: st.id, subjects: st.subjects });
    }

    const meritResults = allRendered.map(item => {
        const isPass = item.html.includes('ms-result-pass');
        const isAbsent = !Object.values(item.subjects).some(d => (d.written || 0) > 0 || (d.mcq || 0) > 0 || (d.practical || 0) > 0 || (d.total || 0) > 0);
        let gpa = 0;
        const gpaMatch = item.html.match(/ms-gpa-value">\s*([\d.]+)\s*<\/span>/);
        if (gpaMatch) gpa = parseFloat(gpaMatch[1]);
        let totalMarks = 0;
        const marksMatch = item.html.match(/মোট নম্বর<\/span>\s*<span class="ms-result-value">\s*(\d+)/);
        if (marksMatch) totalMarks = parseInt(marksMatch[1]);
        const failedCount = (!isPass && !isAbsent) ? (item.html.match(/ms-grade-fail/g) || []).length || 1 : 0;
        return { key: item.key, group: item.group, id: parseInt(convertToEnglishDigits(String(item.id))) || 0, isPass, gpa, totalMarks, failedCount, isAbsent };
    });

    meritResults.sort((a, b) => {
        if (a.isAbsent !== b.isAbsent) return a.isAbsent ? 1 : -1;
        if (a.isAbsent && b.isAbsent) return a.id - b.id;
        if (a.isPass !== b.isPass) return a.isPass ? -1 : 1;
        if (a.isPass && Math.abs(b.gpa - a.gpa) > 0.0001) return b.gpa - a.gpa;
        if (!a.isPass && a.failedCount !== b.failedCount) return a.failedCount - b.failedCount;
        if (Math.abs(b.totalMarks - a.totalMarks) > 0.01) return b.totalMarks - a.totalMarks;
        return a.id - b.id;
    });

    const exactRanksMap = new Map();
    const groupTally = new Map();
    meritResults.forEach((res, idx) => {
        if (!groupTally.has(res.group)) groupTally.set(res.group, 0);
        if (!res.isAbsent) groupTally.set(res.group, groupTally.get(res.group) + 1);
        const gIdx = res.isAbsent ? -1 : groupTally.get(res.group) - 1;
        const formatRank = (i) => i === -1 ? 'মেধাক্রম নেই' : (i === 0 ? '১ম' : i === 1 ? '২য়' : i === 2 ? '৩য়' : i === 3 ? '৪র্থ' : i === 4 ? '৫ম' : i === 5 ? '৬ষ্ঠ' : i === 6 ? '৭ম' : i === 7 ? '৮ম' : i === 8 ? '৯ম' : i === 9 ? '১০ম' : `${convertToBengaliDigits(i + 1)}তম`);
        exactRanksMap.set(res.key, { classRank: formatRank(res.isAbsent ? -1 : idx), groupRank: formatRank(gIdx) });
    });

    // 6. Statistics Calculation for Summary Table & Grade Distribution
    const groupStats = new Map();
    const gradeCounts = { 'A+': 0, 'A': 0, 'A-': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };

    meritResults.forEach(res => {
        const grp = res.group || 'অন্যান্য';
        if (!groupStats.has(grp)) groupStats.set(grp, { total: 0, examinees: 0, pass: 0, fail: 0 });
        const gs = groupStats.get(grp);
        gs.total++;

        if (res.isAbsent) return;

        gs.examinees++;
        if (res.isPass) {
            gs.pass++;
            // Extract grade for distribution
            const rankItem = allRendered.find(i => i.key === res.key);
            const gMatch = rankItem.html.match(/<span class="ms-result-label">গ্রেড<\/span>\s*<span class="ms-result-value">\s*(A\+|A|A-|B|C|D)\s*<\/span>/);
            if (gMatch && gradeCounts[gMatch[1]] !== undefined) gradeCounts[gMatch[1]]++;
        } else {
            gs.fail++;
            gradeCounts['F']++;
        }
    });

    // Compute grand totals for summary
    let gTotal = 0, gExaminees = 0, gPass = 0, gFail = 0;
    groupStats.forEach(gs => {
        gTotal += gs.total;
        gExaminees += gs.examinees;
        gPass += gs.pass;
        gFail += gs.fail;
    });

    const groupRowsHtml = [...groupStats.entries()].map(([g, gs]) => {
        const abs = gs.total - gs.examinees;
        const rate = gs.examinees > 0 ? ((gs.pass / gs.examinees) * 100).toFixed(1) : '0.0';
        return `<tr><td>${g}</td><td>${gs.total}</td><td>${gs.examinees}</td><td>${abs}</td><td class="ms-sumtbl-pass">${gs.pass}</td><td class="ms-sumtbl-fail">${gs.fail}</td><td class="ms-sumtbl-rate">${rate}%</td></tr>`;
    }).join('');

    const examSummaryHtml = `
        <div class="ms-exam-summary-section">
            <table class="ms-exam-summary-tbl">
                <caption>পরীক্ষার ফলাফল সামারি</caption>
                <thead><tr><th>বিভাগ</th><th>মোট</th><th>পরীক্ষার্থী</th><th>অনুপস্থিত</th><th>পাশ</th><th>ফেল</th><th>পাশের হার</th></tr></thead>
                <tbody>${groupRowsHtml}</tbody>
                <tfoot><tr><td>সর্বমোট</td><td>${gTotal}</td><td>${gExaminees}</td><td>${gTotal - gExaminees}</td><td class="ms-sumtbl-pass">${gPass}</td><td class="ms-sumtbl-fail">${gFail}</td><td class="ms-sumtbl-rate">${gExaminees > 0 ? ((gPass / gExaminees) * 100).toFixed(1) : '0.0'}%</td></tr></tfoot>
            </table>
        </div>`;

    // 7. Final Render for the matched student
    const targetKey = `${id}_${group}`;
    const targetAgg = studentAggMap.get(`${convertToEnglishDigits(String(id).trim().replace(/^0+/, '')) || '0'}_${normalizeText(group)}`);

    if (!targetAgg) {
        previewArea.innerHTML = '<div class="sr-error">দুঃখিত, শিক্ষার্থীর তথ্য পাওয়া যায়নি।</div>';
        return;
    }

    const ms = getMarksheetSettings();
    let finalHtml = await renderSingleMarksheet(targetAgg, displaySubjects, examDisplayName, session, null, rules, allOptSubs, allExams, subjectConfigs, null, false, highestMarks, exactRanksMap.get(targetKey), true);

    // Handle Summary Section (respecting settings)
    const showSum = ms.idSearchShowSummary !== false;
    if (showSum) {
        finalHtml = finalHtml.replace('<!--EXAM_SUMMARY_PLACEHOLDER-->', examSummaryHtml);
    } else {
        finalHtml = finalHtml.replace('<!--EXAM_SUMMARY_PLACEHOLDER-->', '');
    }

    // Inject Grading Scale Counts with Bengali Digits
    const toBnNumLocal = (n) => (n || 0).toLocaleString('bn-BD');
    finalHtml = finalHtml.replace('<!--GS_AP-->', toBnNumLocal(gradeCounts['A+']))
        .replace('<!--GS_A-->', toBnNumLocal(gradeCounts['A']))
        .replace('<!--GS_AM-->', toBnNumLocal(gradeCounts['A-']))
        .replace('<!--GS_B-->', toBnNumLocal(gradeCounts['B']))
        .replace('<!--GS_C-->', toBnNumLocal(gradeCounts['C']))
        .replace('<!--GS_D-->', toBnNumLocal(gradeCounts['D']))
        .replace('<!--GS_F-->', toBnNumLocal(gradeCounts['F']));

    previewArea.innerHTML = finalHtml;

    await renderMarksheetQRCodes(previewArea);

    // Zoom and notification
    const containerWidth = previewArea.clientWidth || window.innerWidth;
    const targetWidth = 840;
    if (containerWidth < targetWidth) {
        const initialScale = Math.max(0.3, (containerWidth - 30) / targetWidth);
        previewArea.style.setProperty('--ms-main-scale', initialScale);
        const zIn = document.getElementById('srZoom');
        const zLvl = document.getElementById('srZoomLevel');
        if (zIn) zIn.value = initialScale;
        if (zLvl) zLvl.innerText = Math.round(initialScale * 100) + '%';
    }
    const zoomHeader = document.getElementById('srPreviewHeader');
    if (zoomHeader) zoomHeader.style.display = 'flex';

    showNotification('মার্কশীট সফলভাবে তৈরি হয়েছে ✅');
}

/**
 * Generate HTML string for the Student ID card
 */
function getIdCardHTML(studentResult, isGenerator = false, devCredit = null) {
    const uid = studentResult.uniqueId;
    const group = studentResult.group || '';

    // Group-based color class
    let groupClass = 'sr-id-group-default';
    const gText = group.toLowerCase();

    let printHeaderColor = '#eff6ff'; // Ultra-soft Blue (blue-50)
    let printHeaderIconColor = '#3b82f6';
    let printHeaderTitleColor = '#1e40af';
    let printHeaderBorderColor = '#bfdbfe';

    if (gText.includes('বিজ্ঞা') || gText.includes('sci')) {
        groupClass = 'sr-id-group-science';
        printHeaderColor = '#fef2f2'; // Ultra-soft Red (red-50)
        printHeaderIconColor = '#ef4444';
        printHeaderTitleColor = '#991b1b';
        printHeaderBorderColor = '#fecaca';
    } else if (gText.includes('মানবি') || gText.includes('hum') || gText.includes('কলা')) {
        groupClass = 'sr-id-group-humanities';
        printHeaderColor = '#f0fdf4'; // Ultra-soft Green (green-50)
        printHeaderIconColor = '#22c55e';
        printHeaderTitleColor = '#166534';
        printHeaderBorderColor = '#bbf7d0';
    } else if (gText.includes('ব্যবসায়') || gText.includes('ব্যবসা') || gText.includes('bus') || gText.includes('comm')) {
        groupClass = 'sr-id-group-business';
        printHeaderColor = '#eff6ff'; // Ultra-soft Blue (blue-50)
        printHeaderIconColor = '#3b82f6';
        printHeaderTitleColor = '#1e40af';
        printHeaderBorderColor = '#bfdbfe';
    }

    // Unique ID for QR canvas target
    const qrCanvasId = `qr-${uid.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const qrPrintCanvasId = `qr-print-${uid.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    return `
        <div class="sr-id-card-wrapper no-print">
            <div class="sr-id-card-inner ${groupClass}">
                <div class="sr-id-card-header">
                    <div class="sr-id-icon"><i class="fas fa-id-badge"></i></div>
                    <div class="sr-id-card-title-group">
                        <div class="sr-id-card-title">শিক্ষার্থী আইডি কার্ড</div>
                        <div class="sr-id-card-subtitle">STUDENT IDENTIFICATION CARD</div>
                    </div>
                </div>
                
                <div class="sr-id-card-main">
                    <div class="sr-id-card-body-left">
                        <div class="sr-id-field">
                            <div class="sr-id-label">শিক্ষার্থীর নাম (Student Name)</div>
                            <div class="sr-id-value">${studentResult.name}</div>
                        </div>
                        <div class="sr-id-field-grid">
                            <div class="sr-id-field">
                                <div class="sr-id-label">রোল (Roll)</div>
                                <div class="sr-id-value">${studentResult.id}</div>
                            </div>
                            <div class="sr-id-field">
                                <div class="sr-id-label">শ্রেণি (Class)</div>
                                <div class="sr-id-value">${studentResult.class}</div>
                            </div>
                        </div>
                        <div class="sr-id-field-grid">
                            <div class="sr-id-field">
                                <div class="sr-id-label">বিভাগ (Group)</div>
                                <div class="sr-id-value">${group || 'সাধারণ'}</div>
                            </div>
                            <div class="sr-id-field">
                                <div class="sr-id-label">সেশন (Session)</div>
                                <div class="sr-id-value">${studentResult.session}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="sr-id-card-body-right">
                        <div class="sr-id-qr-container">
                            <canvas id="${qrCanvasId}" data-uid="${uid}" class="sr-id-qr-canvas"></canvas>
                            <div class="sr-id-qr-label">UID SCAN</div>
                        </div>
                    </div>
                </div>

                <div class="sr-id-uid-container">
                    <div class="sr-id-uid-box">
                        <span class="sr-id-uid-prefix">ID No.</span>
                        <span class="sr-id-uid-code">${uid}</span>
                    </div>
                    <div class="sr-id-actions">
                        <button class="sr-id-btn copy-btn" title="কপি করুন" onclick="navigator.clipboard.writeText('${uid}').then(() => window.__srCopyFeedback && window.__srCopyFeedback())">
                            <i class="fas fa-copy"></i>
                            <span>কপি</span>
                        </button>
                        <button class="sr-id-btn search-btn" title="সরাসরি মার্কশীট দেখুন" onclick="window.srDirectSearch('${uid}')">
                            <i class="fas fa-search"></i>
                            <span>ID দিয়ে ফলাফল সার্চ</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="print-only">
             <div class="sr-id-card-inner ${groupClass}">
                <div class="sr-id-card-header" style="-webkit-print-color-adjust: exact !important; background: ${printHeaderColor} !important; border-bottom: 2px solid ${printHeaderBorderColor} !important;">
                    <div class="sr-id-icon" style="-webkit-print-color-adjust: exact !important; background: ${printHeaderIconColor} !important;"><i class="fas fa-id-badge" style="color: white !important;"></i></div>
                    <div class="sr-id-card-title-group">
                        <div class="sr-id-card-title" style="color: ${printHeaderTitleColor} !important;">শিক্ষার্থী আইডি কার্ড</div>
                        <div class="sr-id-card-subtitle" style="color: ${printHeaderTitleColor} !important;">STUDENT IDENTIFICATION CARD</div>
                    </div>
                </div>
                <div class="sr-id-card-main">
                    <div class="sr-id-card-body-left">
                        <div class="sr-id-field">
                            <div class="sr-id-label">শিক্ষার্থীর নাম (Student Name)</div>
                            <div class="sr-id-value">${studentResult.name}</div>
                        </div>
                        <div class="sr-id-field-grid">
                            <div class="sr-id-field">
                                <div class="sr-id-label">রোল (Roll)</div>
                                <div class="sr-id-value">${studentResult.id}</div>
                            </div>
                            <div class="sr-id-field">
                                <div class="sr-id-label">শ্রেণি (Class)</div>
                                <div class="sr-id-value">${studentResult.class}</div>
                            </div>
                        </div>
                        <div class="sr-id-field-grid">
                            <div class="sr-id-field">
                                <div class="sr-id-label">বিভাগ (Group)</div>
                                <div class="sr-id-value">${group || 'সাধারণ'}</div>
                            </div>
                            <div class="sr-id-field">
                                <div class="sr-id-label">সেশন (Session)</div>
                                <div class="sr-id-value">${studentResult.session}</div>
                            </div>
                        </div>
                    </div>
                    <div class="sr-id-card-body-right">
                        <div class="sr-id-qr-container">
                            <canvas id="${qrPrintCanvasId}" data-uid="${uid}" class="sr-id-qr-canvas"></canvas>
                            <div class="sr-id-qr-label">UID SCAN</div>
                        </div>
                    </div>
                </div>
                <div class="sr-id-uid-container" style="height: auto; padding-bottom: 10px;">
                    <div class="sr-id-uid-box-print-centered" style="-webkit-print-color-adjust: exact !important; background: ${printHeaderColor} !important; border: 1.5px solid ${printHeaderBorderColor} !important;">
                        <span class="sr-id-uid-prefix" style="white-space: nowrap !important; font-weight: 600; font-size: 6.5pt; margin-right: 6px; color: ${printHeaderTitleColor} !important; opacity: 0.75;">ID No.</span>
                        <span class="sr-id-uid-code" style="white-space: nowrap !important; font-family: monospace, sans-serif; font-size: 9.5pt; font-weight: 800; letter-spacing: 0.5px; color: ${printHeaderTitleColor} !important;">${uid}</span>
                    </div>
                </div>
            </div>
        </div>
    `;

}

/**
 * Render QR codes on all matching canvases inside a container using client-side QRCode library.
 * This generates QR codes instantly without any external API call.
 */
async function renderQRCodesInContainer(container, studentResult, devCredit = null) {
    const uid = studentResult.uniqueId;
    const group = studentResult.group || '';

    let qrDevInfoString = '';
    if (devCredit && devCredit.name) {
        qrDevInfoString = `\nDeveloper: ${devCredit.name}`;
        if (devCredit.link) qrDevInfoString += `\nDev Link: ${devCredit.link}`;
    }

    const liveLink = window.location.origin + window.location.pathname;
    const qrData = `ID: ${uid}\nName: ${studentResult.name}\nRoll: ${studentResult.id}\nClass: ${studentResult.class}\nGroup: ${group || 'N/A'}\nSession: ${studentResult.session}\nলাইভ লিংক: ${liveLink}${qrDevInfoString}`;

    // IMPORTANT BUGFIX: Select only the canvases for the CURRENT UID
    const canvases = container.querySelectorAll(`.sr-id-qr-canvas[data-uid="${uid}"]`);
    for (const canvas of canvases) {
        try {
            await QRCode.toCanvas(canvas, qrData, {
                width: 150,
                margin: 1,
                color: { dark: '#1e293b', light: '#ffffff' },
                errorCorrectionLevel: 'M'
            });
            // Override CSS dimensions so canvas looks sharp
            canvas.style.width = '115px';
            canvas.style.height = '115px';
        } catch (err) {
            console.error('QR generation failed:', err);
        }
    }
}

/**
 * Render the student ID card with the unique ID
 */
async function renderIdCard(studentResult) {
    const container = document.getElementById('srIdCard');
    if (!container) return;

    container.innerHTML = getIdCardHTML(studentResult, false);
    container.style.display = 'block';

    // Generate QR code instantly
    await renderQRCodesInContainer(container, studentResult);

    // Copy feedback
    window.__srCopyFeedback = () => {
        showNotification('ইউনিক আইডি কপি করা হয়েছে! ✅');
    };
}

/**
 * Initialize Student Results Manager
 */
export async function initStudentResultsManager() {
    const searchBtn = document.getElementById('srSearchBtn');
    const searchInput = document.getElementById('srSearchInput');
    const clearBtn = document.getElementById('srClearBtn');

    if (studentResultsManagerInitialized) {
        return;
    }
    studentResultsManagerInitialized = true;

    if (searchBtn) {
        searchBtn.onclick = handleSearch;
    }

    if (searchInput) {
        // Show/Hide Clear button and update value
        searchInput.oninput = (e) => {
            e.target.value = e.target.value.toUpperCase();
            if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
        };

        searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') handleSearch();
        };
    }

    if (clearBtn) {
        clearBtn.onclick = () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            clearBtn.style.display = 'none';

            // Clear result areas
            const resultArea = document.getElementById('srResultArea');
            const notFoundMsg = document.getElementById('srNotFound');
            if (resultArea) resultArea.style.display = 'none';
            if (notFoundMsg) notFoundMsg.style.display = 'none';

            // Pulse effect
            clearBtn.classList.add('sr-reset-anim');
            setTimeout(() => clearBtn.classList.remove('sr-reset-anim'), 400);
        };
    }

    // --- QR Redirect Logic ---
    const checkQRParams = () => {
        const hash = window.location.hash || '';
        if (hash.includes('student-results?uid=')) {
            const paramsString = hash.split('?')[1];
            const params = new URLSearchParams(paramsString);
            const uid = params.get('uid');
            const exam = params.get('exam'); // Named exam in URL

            if (uid && searchInput) {
                searchInput.value = uid;
                if (clearBtn) clearBtn.style.display = 'flex';

                // Auto-select exam if present
                if (exam) {
                    const examDropdown = document.getElementById('srSearchExam');
                    if (examDropdown) {
                        // Check if option exists, otherwise we'll just search all
                        const options = Array.from(examDropdown.options);
                        const match = options.find(opt => opt.value === exam || opt.text === exam);
                        if (match) {
                            examDropdown.value = match.value;
                        }
                    }
                }

                // Trigger search immediately.
                setTimeout(handleSearch, 300);
            }
        }
    };


    checkQRParams();
    if (!studentResultsHashBound) {
        window.addEventListener('hashchange', checkQRParams);
        studentResultsHashBound = true;
    }

    // Generator Reset Btn
    const genResetBtn = document.getElementById('srGenResetBtn');
    if (genResetBtn) {
        genResetBtn.onclick = resetGeneratorSection;
    }

    // Zoom controls
    const zoomInput = document.getElementById('srZoom');
    const zoomLevel = document.getElementById('srZoomLevel');
    const previewArea = document.getElementById('srMarksheetPreview');

    if (zoomInput && zoomLevel && previewArea) {
        zoomInput.oninput = (e) => {
            const val = e.target.value;
            zoomLevel.innerText = Math.round(val * 100) + '%';
            previewArea.style.setProperty('--ms-main-scale', val);
        };
    }

    // ID Generator helper
    const genBtn = document.getElementById('srGenIdBtn');
    if (genBtn) {
        genBtn.onclick = handleGenerateId;
    }

    const downloadBtn = document.getElementById('srDownloadIdBtn');
    if (downloadBtn) {
        downloadBtn.onclick = handleDownloadIdCard;
    }

    // Toggle between search and generate modes
    const tabBtns = document.querySelectorAll('.sr-tab-btn');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.tab;
            document.querySelectorAll('.sr-tab-content').forEach(tc => {
                tc.style.display = tc.id === target ? 'block' : 'none';
            });
        };
    });

    // Bulk Print event
    const bpBtn = document.getElementById('srBulkPrintBtn');
    if (bpBtn) {
        bpBtn.onclick = handleBulkPrint;
    }

    // Always populate dropdowns once
    if (!window.__srDropdownsInit) {
        window.__srDropdownsInit = true;
        populateSrDropdowns();
    }
}

/**
 * Populate dynamic dropdowns for the ID generator
 */
async function populateSrDropdowns() {
    const classSelect = document.getElementById('srGenClass');
    const sessionSelect = document.getElementById('srGenSession');
    const groupSelect = document.getElementById('srGenGroup');
    const studentSelect = document.getElementById('srGenStudent');

    if (!classSelect || !sessionSelect) return;

    classSelect.innerHTML = '<option value="">লোড হচ্ছে...</option>';
    sessionSelect.innerHTML = '<option value="">লোড হচ্ছে...</option>';

    try {
        const allExams = await getSavedExams();

        // Extract unique values
        const classes = [...new Set(allExams.map(e => e.class).filter(Boolean))].sort();
        const sessions = [...new Set(allExams.map(e => e.session).filter(Boolean))].sort().reverse();
        const groups = [...new Set(allExams.map(e => e.group).filter(Boolean))].sort();

        classSelect.innerHTML = '<option value="">শ্রেণি নির্বাচন করুন</option>';
        classes.forEach(c => classSelect.innerHTML += `<option value="${c}">${c}</option>`);

        sessionSelect.innerHTML = '<option value="">সেশন নির্বাচন করুন</option>';
        sessions.forEach(s => sessionSelect.innerHTML += `<option value="${s}">${s}</option>`);

        groupSelect.innerHTML = '<option value="all">সকল গ্রুপ (বা নির্দিষ্ট নেই)</option>';
        groups.forEach(g => {
            if (g && g !== 'all') {
                groupSelect.innerHTML += `<option value="${g}">${g}</option>`;
            }
        });

        // Also populate Bulk Print Dropdowns if they exist
        const bpClassSelect = document.getElementById('srBpClass');
        const bpSessionSelect = document.getElementById('srBpSession');
        const bpGroupSelect = document.getElementById('srBpGroup');

        if (bpClassSelect) {
            bpClassSelect.innerHTML = '<option value="">ক্লাস</option>';
            classes.forEach(c => bpClassSelect.innerHTML += `<option value="${c}">${c}</option>`);
        }
        if (bpSessionSelect) {
            bpSessionSelect.innerHTML = '<option value="">সেশন</option>';
            sessions.forEach(s => bpSessionSelect.innerHTML += `<option value="${s}">${s}</option>`);
        }
        if (bpGroupSelect) {
            bpGroupSelect.innerHTML = '<option value="all">সকল গ্রুপ</option>';
            groups.forEach(g => {
                if (g && g !== 'all') bpGroupSelect.innerHTML += `<option value="${g}">${g}</option>`;
            });
        }

        // Also populate Search Tab Filters
        const searchClassSelect = document.getElementById('srSearchClass');
        const searchSessionSelect = document.getElementById('srSearchSession');
        const searchExamSelect = document.getElementById('srSearchExam');

        if (searchClassSelect) {
            searchClassSelect.innerHTML = '<option value="">সকল শ্রেণি (বা আইডি ব্যবহার করুন)</option>';
            classes.forEach(c => searchClassSelect.innerHTML += `<option value="${c}">${c}</option>`);
        }
        if (searchSessionSelect) {
            searchSessionSelect.innerHTML = '<option value="">সকল সেশন</option>';
            sessions.forEach(s => searchSessionSelect.innerHTML += `<option value="${s}">${s}</option>`);
        }

        const updateSearchExamDropdown = () => {
            if (!searchExamSelect) return;
            const selClass = searchClassSelect.value;
            const selSession = searchSessionSelect.value;

            if (!selClass || !selSession) {
                searchExamSelect.innerHTML = '<option value="">প্রথমে শ্রেণি ও সেশন নির্বাচন করুন</option>';
                searchExamSelect.disabled = true;
                return;
            }

            searchExamSelect.disabled = false;
            const examsForSelection = allExams.filter(e => e.class === selClass && e.session === selSession);
            const examNames = [...new Set(examsForSelection.map(e => e.name).filter(Boolean))].sort();

            searchExamSelect.innerHTML = '<option value="">সকল পরীক্ষা (সমন্বিত)</option>';
            examNames.forEach(name => {
                searchExamSelect.innerHTML += `<option value="${name}">${name}</option>`;
            });
        };

        if (searchClassSelect) searchClassSelect.onchange = updateSearchExamDropdown;
        if (searchSessionSelect) searchSessionSelect.onchange = updateSearchExamDropdown;
        updateSearchExamDropdown();

        // Function to update the student list
        const updateStudentDropdown = async () => {
            const selClass = classSelect.value;
            const selSession = sessionSelect.value;
            const selGroup = groupSelect.value;

            if (!selClass || !selSession) {
                studentSelect.innerHTML = '<option value="">প্রথমে শ্রেণি ও সেশন নির্বাচন করুন</option>';
                return;
            }

            studentSelect.innerHTML = '<option value="">খুঁজছে...</option>';

            const lookupMap = await getStudentLookupMap();

            const relevantExams = allExams.filter(e =>
                e.class === selClass &&
                e.session === selSession
            );

            const studentsMap = new Map();
            relevantExams.forEach(exam => {
                if (exam.studentData) {
                    exam.studentData.forEach(s => {
                        const stGroup = s.group || '';
                        if (selGroup && selGroup !== 'all' && stGroup !== selGroup) return;

                        const key = `${s.id}_${stGroup}`;
                        if (!studentsMap.has(key)) {
                            // Merge with latest info if available
                            const studentKey = generateStudentDocId({
                                id: s.id,
                                group: stGroup,
                                class: selClass,
                                session: selSession
                            });
                            const latest = lookupMap.get(studentKey);

                            const mergedStudent = {
                                ...s,
                                name: latest ? (latest.name || s.name) : s.name,
                                fatherName: latest ? (latest.fatherName || '') : '',
                                mobile: latest ? (latest.mobile || '') : ''
                            };

                            studentsMap.set(key, mergedStudent);
                        }
                    });
                }
            });

            const studentsList = Array.from(studentsMap.values());

            // Wait for dynamic import of utility functions for sorting
            // Use already-imported sortStudentData
            const sortedStudents = sortStudentData(studentsList, 'id', 'roll-asc');

            studentSelect.innerHTML = '<option value="">শিক্ষার্থী নির্বাচন করুন (রোল - নাম)</option>';

            if (sortedStudents.length === 0) {
                studentSelect.innerHTML = '<option value="">কোনো শিক্ষার্থী পাওয়া যায়নি</option>';
            } else {
                sortedStudents.forEach(s => {
                    const groupDisplay = s.group ? ` (${s.group})` : '';
                    studentSelect.innerHTML += `<option value="${s.id}" data-name="${s.name}" data-roll="${s.id}" data-group="${s.group || ''}">${s.id} - ${s.name}${groupDisplay}</option>`;
                });
            }
        };

        classSelect.onchange = updateStudentDropdown;
        sessionSelect.onchange = updateStudentDropdown;
        groupSelect.onchange = updateStudentDropdown;

    } catch (err) {
        console.error("Failed to populate ID generator dropdowns:", err);
        classSelect.innerHTML = '<option value="">ডেটা লোড করতে সমস্যা হয়েছে</option>';
        sessionSelect.innerHTML = '<option value="">ডেটা লোড করতে সমস্যা হয়েছে</option>';
    }
}

function showRestrictionMessage(previewArea, msg, searchBtn) {
    if (!previewArea) return;
    previewArea.innerHTML = `
        <div class="sr-restriction-msg" style="padding:30px 20px; text-align:center; background:linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border:1px solid #e2e8f0; border-radius:12px; box-shadow:0 10px 25px rgba(0,0,0,0.05); margin: 20px auto; max-width: 500px;">
            <div style="font-size:2.8rem; color:#f59e0b; margin-bottom:12px;"><i class="fas fa-lock"></i></div>
            <h3 style="color:#0f172a; font-weight:800; margin-bottom:8px; font-size:1.3rem;">ফলাফল স্থগিত রয়েছে</h3>
            <p style="color:#475569; line-height:1.6; font-size:0.95rem; margin:0;">${msg}</p>
        </div>
    `;
    if (searchBtn) {
        searchBtn.innerHTML = '<i class="fas fa-search"></i> <span>সার্চ</span>';
        searchBtn.disabled = false;
    }
}

function renderTimerCountDown(previewArea, deadlineDate, searchBtn) {
    if (!previewArea) return;
    previewArea.innerHTML = `
        <div class="sr-restriction-msg" style="padding:30px 20px; text-align:center; background:linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%); border:1px solid #bae6fd; border-radius:12px; box-shadow:0 10px 30px rgba(14,165,233,0.1); margin: 20px auto; max-width: 500px;">
            <div style="font-size:2.8rem; color:#0ea5e9; margin-bottom:12px; animation: pulse 1.5s infinite;"><i class="fas fa-hourglass-half"></i></div>
            <h3 style="color:#0f172a; font-weight:800; margin-bottom:8px; font-size:1.3rem;">আর মাত্র কয়েক মুহূর্ত...</h3>
            <p style="color:#475569; margin-bottom: 20px; font-size:0.95rem;">ধৈর্য ধরুন, ফলাফল এখনই উন্মুক্ত হতে যাচ্ছে!</p>
            <div id="srDynamicTimer" style="font-size:2.5rem; font-weight:900; color:#0369a1; font-variant-numeric: tabular-nums; letter-spacing:2px;">--:--</div>
        </div>
        <style>
            @keyframes pulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.8; }
                100% { transform: scale(1); opacity: 1; }
            }
        </style>
    `;

    if (searchBtn) {
        searchBtn.innerHTML = '<i class="fas fa-search"></i> <span>সার্চ</span>';
        searchBtn.disabled = false;
    }

    if (window.srTimerInterval) clearInterval(window.srTimerInterval);

    window.srTimerInterval = setInterval(() => {
        const now = new Date();
        const diffMs = deadlineDate - now;

        if (diffMs <= 0) {
            clearInterval(window.srTimerInterval);
            const timerEl = document.getElementById('srDynamicTimer');
            if (timerEl) timerEl.innerHTML = "উন্মুক্ত হচ্ছে...";

            // Automatically trigger search again
            const input = document.getElementById('srSearchInput');
            if (input && input.value) {
                setTimeout(() => window.srDirectSearch(input.value), 1000);
            }
            return;
        }

        const m = Math.floor(diffMs / 60000);
        const s = Math.floor((diffMs % 60000) / 1000);

        const mStr = new Intl.NumberFormat('bn-BD', { minimumIntegerDigits: 2 }).format(m);
        const sStr = new Intl.NumberFormat('bn-BD', { minimumIntegerDigits: 2 }).format(s);

        const timerEl = document.getElementById('srDynamicTimer');
        if (timerEl) timerEl.innerText = `${mStr}:${sStr}`;
        else clearInterval(window.srTimerInterval);
    }, 1000);
}

function checkResultPublicationAccess(previewArea, searchBtn) {
    const isSuperAdmin = state.currentUser?.role === 'super_admin';
    if (isSuperAdmin) return true; // Super admins bypass completely

    const ac = state.accessControl || {};

    // 1. Check Master Switch (Global Result Status)
    if (ac.globalResultDisabled === true) {
        showRestrictionMessage(previewArea, "দুঃখিত, ফলাফল তৈরী করা প্রক্রিয়াধীন বা এখনো ফলাফল ঘোষনা করা হয়নি। ধৈর্য ধরুন।", searchBtn);
        return false;
    }

    // 2. Check Scheduled Deadline (Only if Toggle is ON)
    if (ac.resultPublishEnabled === true && ac.resultPublishDeadline) {
        const deadlineDate = new Date(ac.resultPublishDeadline);
        const now = new Date();
        const diffMs = deadlineDate - now;

        if (diffMs > 0) {
            // Deadline is in the future
            if (diffMs <= 5 * 60 * 1000) {
                // Within 5 minutes, show dynamic countdown!
                renderTimerCountDown(previewArea, deadlineDate, searchBtn);
                return false;
            } else {
                // Beyond 5 minutes, show the formatted text message
                const days = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
                const day = days[deadlineDate.getDay()];

                let hours = deadlineDate.getHours();
                const minutes = deadlineDate.getMinutes();
                let ampmText = 'রাত';
                if (hours >= 6 && hours < 12) ampmText = 'সকাল';
                else if (hours >= 12 && hours < 15) ampmText = 'দুপুর';
                else if (hours >= 15 && hours < 18) ampmText = 'বিকাল';
                else if (hours >= 18 && hours < 20) ampmText = 'সন্ধ্যা';

                hours = hours % 12;
                hours = hours ? hours : 12;

                const hBn = new Intl.NumberFormat('bn-BD').format(hours);
                const mBn = new Intl.NumberFormat('bn-BD', { minimumIntegerDigits: 2 }).format(minutes);

                // Date logic
                const dayObj = deadlineDate.getDate();
                const monthNames = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
                const monthObj = monthNames[deadlineDate.getMonth()];
                const yearObj = deadlineDate.getFullYear();

                const dayBn = new Intl.NumberFormat('bn-BD').format(dayObj);
                const yearBn = new Intl.NumberFormat('bn-BD', { useGrouping: false }).format(yearObj);
                const dateStr = `${dayBn} ${monthObj} ${yearBn}`;

                const clsSel = document.getElementById('srSearchClass');
                const sessionSel = document.getElementById('srSearchSession');
                const examSel = document.getElementById('srSearchExam');

                const clsVal = clsSel?.value;
                const sessionVal = sessionSel?.value;
                const examVal = examSel?.value;

                let specificText = '';
                if (clsVal && sessionVal && examVal && examVal !== 'all') {
                    const clsLabel = clsSel.options[clsSel.selectedIndex].text;
                    const sessionLabel = sessionSel.options[sessionSel.selectedIndex].text;
                    const examLabel = examSel.options[examSel.selectedIndex].text;
                    specificText = `<div style="font-weight:700; color:#1e293b; margin-bottom:10px; font-size:1.1rem; background: #f1f5f9; display: inline-block; padding: 4px 15px; border-radius: 50px;">${clsLabel} (${sessionLabel}) — ${examLabel}</div><br>`;
                }

                const msg = `
                    ${specificText}
                    আপনার কাঙ্ক্ষিত ফলাফলটি এখনো প্রকাশ করা হয়নি।<br>
                    নির্ধারিত সময় সাপেক্ষে স্বয়ংক্রিয়ভাবে ফলাফল উন্মুক্ত করা হবে, অনুগ্রহ করে ধৈর্য ধরুন।
                    
                    <div style="margin-top: 20px; padding: 15px 20px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; display: inline-flex; flex-direction: column; gap: 12px; text-align: left; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); width: 100%; max-width: 380px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="min-width: 38px; height: 38px; border-radius: 50%; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 1.15rem;">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                            <div>
                                <div style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase;">প্রকাশের তারিখ</div>
                                <div style="font-size: 1rem; color: #0f172a; font-weight: 800;">${dateStr}</div>
                            </div>
                        </div>
                        <div style="width: 100%; height: 1px; background: #e2e8f0;"></div>
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="min-width: 38px; height: 38px; border-radius: 50%; background: #ede9fe; color: #7c3aed; display: flex; align-items: center; justify-content: center; font-size: 1.15rem;">
                                <i class="fas fa-clock"></i>
                            </div>
                            <div>
                                <div style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase;">প্রকাশের সময়</div>
                                <div style="font-size: 1rem; color: #0f172a; font-weight: 800;">${day} ${ampmText} ${hBn}:${mBn} টা</div>
                            </div>
                        </div>
                    </div>
                `;
                showRestrictionMessage(previewArea, msg, searchBtn);
                return false;
            }
        }
    }
    return true; // allowed
}

/**
 * Handle unique ID search
 */
async function handleSearch() {
    const searchInput = document.getElementById('srSearchInput');
    const searchId = searchInput?.value?.trim();

    const searchBtn = document.getElementById('srSearchBtn');

    if (searchBtn) {
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>সার্চিং...</span>';
        searchBtn.disabled = true;
    }

    if (!searchId) {
        showNotification('অনুগ্রহ করে ইউনিক আইডি লিখুন', 'error');
        if (searchBtn) {
            searchBtn.innerHTML = '<i class="fas fa-search"></i> <span>সার্চ</span>';
            searchBtn.disabled = false;
        }
        return;
    }

    // Show loading state
    const resultArea = document.getElementById('srResultArea');
    const notFoundMsg = document.getElementById('srNotFound');
    const idCard = document.getElementById('srIdCard');
    if (notFoundMsg) notFoundMsg.style.display = 'none';
    if (idCard) {
        idCard.style.display = 'none';
        idCard.innerHTML = ''; // Aggressively clear content to prevent stale cards showing
    }
    if (resultArea) resultArea.style.display = 'block';

    const previewArea = document.getElementById('srMarksheetPreview');

    // First: Check access control deadline guard before processing any result
    if (!checkResultPublicationAccess(previewArea, searchBtn)) {
        if (resultArea) resultArea.style.display = 'block';
        setTimeout(() => {
            if (previewArea) {
                previewArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 150);
        return; // Stopped by deadline check
    }

    if (previewArea) {
        previewArea.innerHTML = '<div class="sr-loading"><i class="fas fa-spinner fa-spin"></i> খুঁজছে...</div>';
    }

    try {
        const filters = {
            class: document.getElementById('srSearchClass')?.value || '',
            session: document.getElementById('srSearchSession')?.value || '',
            examName: document.getElementById('srSearchExam')?.value || ''
        };

        const result = await searchByUniqueId(searchId, filters);

        if (!result) {
            if (previewArea) previewArea.innerHTML = '';
            if (notFoundMsg) notFoundMsg.style.display = 'flex';
            if (resultArea) resultArea.style.display = 'none';
            const zoomHeader = document.getElementById('srPreviewHeader');
            if (zoomHeader) zoomHeader.style.display = 'none';

            // Fix: Reset button when not found
            if (searchBtn) {
                searchBtn.innerHTML = '<i class="fas fa-search"></i> <span>সার্চ</span>';
                searchBtn.disabled = false;
            }
            return;
        }

        // Generate marksheet
        await displayStudentMarksheet(result);

        // Remove loading state with a slight delay for smooth transition
        setTimeout(() => {
            if (searchBtn) {
                searchBtn.innerHTML = '<i class="fas fa-search"></i> <span>সার্চ</span>';
                searchBtn.disabled = false;
            }

            // Auto-scroll to marksheet
            const previewArea = document.getElementById('srMarksheetPreview');
            if (previewArea) {
                previewArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
    } catch (err) {
        console.error("Search error:", err);
        showNotification('সার্চ করার সময় একটি সমস্যা হয়েছে', 'error');
        if (searchBtn) {
            searchBtn.innerHTML = '<i class="fas fa-search"></i> <span>সার্চ</span>';
            searchBtn.disabled = false;
        }
    }
}

/**
 * Handle ID generation from student details
 */
async function handleGenerateId() {
    const classSelect = document.getElementById('srGenClass');
    const sessionSelect = document.getElementById('srGenSession');
    const studentSelect = document.getElementById('srGenStudent');

    const cls = classSelect?.value;
    const session = sessionSelect?.value;

    if (!cls || !session || !studentSelect || !studentSelect.value) {
        showNotification('অনুগ্রহ করে শিক্ষার্থী নির্বাচন করুন', 'error');
        return;
    }

    const selectedOption = studentSelect.options[studentSelect.selectedIndex];
    const name = selectedOption.dataset.name;
    const roll = selectedOption.dataset.roll;
    const group = selectedOption.dataset.group || '';

    const uid = generateStudentUniqueId(name, cls, session, roll, group);
    const resultBox = document.getElementById('srGenResult');
    const placeholder = document.getElementById('srGenResultPlaceholder');

    if (placeholder) placeholder.style.display = 'none';

    if (resultBox) {
        // Load developer credit settings once
        const settings = await getSettings();
        const developerCredit = settings?.developerCredit;

        const studentResult = {
            id: roll,
            name: name,
            class: cls,
            session: session,
            group: group,
            uniqueId: uid
        };

        resultBox.innerHTML = getIdCardHTML(studentResult, true, developerCredit);
        resultBox.style.display = 'block';

        // Generate QR code instantly
        await renderQRCodesInContainer(resultBox, studentResult, developerCredit);

        // Show the reset and download buttons
        const genResetBtn = document.getElementById('srGenResetBtn');
        const genDownloadBtn = document.getElementById('srDownloadIdBtn');
        if (genResetBtn) {
            genResetBtn.style.display = 'block';
        }
        if (genDownloadBtn) {
            genDownloadBtn.style.display = 'block';
        }

        const rightCol = document.querySelector('.sr-gen-result-box');
        if (rightCol) {
            rightCol.style.border = 'none';
            rightCol.style.background = 'transparent';
        }

        // Add copy feedback
        window.__srCopyFeedback = () => {
            showNotification('ইউনিক আইডি কপি করা হয়েছে! ✅');
        };
    }
}

/**
 * Clear search input and results with animation
 */
function clearSearchSection() {
    const searchInput = document.getElementById('srSearchInput');
    const resultArea = document.getElementById('srResultArea');
    const previewArea = document.getElementById('srMarksheetPreview');
    const notFoundMsg = document.getElementById('srNotFound');
    const zoomHeader = document.getElementById('srPreviewHeader');

    // Add CSS animated feedback
    const searchBox = document.querySelector('.sr-search-box');
    if (searchBox) {
        searchBox.classList.add('sr-reset-anim');
        setTimeout(() => searchBox.classList.remove('sr-reset-anim'), 400);
    }

    if (searchInput) searchInput.value = '';

    // Hide search results
    if (resultArea) resultArea.style.display = 'none';
    if (notFoundMsg) notFoundMsg.style.display = 'none';
    if (previewArea) previewArea.innerHTML = '';
    if (zoomHeader) zoomHeader.style.display = 'none';
}

/**
 * Reset Generator Form and Result Box
 */
function resetGeneratorSection() {
    const genClass = document.getElementById('srGenClass');
    const genSession = document.getElementById('srGenSession');
    const genGroup = document.getElementById('srGenGroup');
    const genStudent = document.getElementById('srGenStudent');

    if (genClass) genClass.value = '';
    if (genSession) genSession.value = '';
    if (genGroup) genGroup.value = 'all';
    if (genStudent) genStudent.innerHTML = '<option value="">প্রথমে শ্রেণি ও সেশন নির্বাচন করুন</option>';

    const resultBox = document.getElementById('srGenResult');
    if (resultBox) {
        resultBox.innerHTML = '';
        resultBox.style.display = 'none';
    }

    const genPlaceholder = document.getElementById('srGenResultPlaceholder');
    if (genPlaceholder) genPlaceholder.style.display = 'flex';

    const rightCol = document.querySelector('.sr-gen-result-box');
    if (rightCol) {
        rightCol.style.border = '';
        rightCol.style.background = '';
    }

    const genResetBtn = document.getElementById('srGenResetBtn');
    if (genResetBtn) genResetBtn.style.display = 'none';

    const genDownloadBtn = document.getElementById('srDownloadIdBtn');
    if (genDownloadBtn) genDownloadBtn.style.display = 'none';
}

/**
 * Download the generated ID card as a high-quality image
 */
async function handleDownloadIdCard() {
    const cardElement = document.querySelector('#srGenResult .sr-id-card-inner');
    if (!cardElement) {
        showNotification('ডাউনলোড করার মতো কোনো আইডি কার্ড খুঁজে পাওয়া যায়নি', 'error');
        return;
    }

    const btn = document.getElementById('srDownloadIdBtn');
    const originalText = btn.innerHTML;

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ডাউনলোড হচ্ছে...';
        btn.disabled = true;

        // Temporarily hide the action buttons inside the card (copy/search)
        const actions = cardElement.querySelector('.sr-id-actions');
        if (actions) actions.style.display = 'none';

        // Final high-fidelity capture
        const canvas = await html2canvas(cardElement, {
            scale: 3,
            useCORS: true,
            logging: false,
            backgroundColor: null,
            onclone: (clonedDoc) => {
                const clonedCard = clonedDoc.querySelector('.sr-id-card-inner');
                if (clonedCard) {
                    clonedCard.style.boxShadow = 'none';
                    clonedCard.style.border = '1.5px solid #e2e8f0';

                    // Stabilize UID bar and prevent vertical clipping
                    const uidBox = clonedCard.querySelector('.sr-id-uid-box');
                    const uidContainer = clonedCard.querySelector('.sr-id-uid-container');
                    if (uidBox && uidContainer) {
                        uidContainer.style.display = 'flex'; // Use flex for perfect centering
                        uidContainer.style.alignItems = 'center';
                        uidContainer.style.paddingTop = '15px'; // Extra top padding as requested
                        uidContainer.style.paddingBottom = '20px'; // Extra bottom buffer
                        uidContainer.style.overflow = 'visible';

                        uidBox.style.flex = '1';
                        uidBox.style.width = '100%';
                        uidBox.style.background = 'white';
                        uidBox.style.display = 'flex';
                        uidBox.style.alignItems = 'center';
                        uidBox.style.justifyContent = 'center';
                        uidBox.style.minHeight = '45px'; // Ensure sufficient height
                    }
                }
            }
        });

        // Restore actions
        if (actions) actions.style.display = '';

        // Extract metadata directly from the generator dropdown options (As requested)
        const classSelect = document.getElementById('srGenClass');
        const sessionSelect = document.getElementById('srGenSession');
        const studentSelect = document.getElementById('srGenStudent');

        const selectedStudent = studentSelect?.options[studentSelect.selectedIndex];
        const rawName = selectedStudent?.dataset.name || 'Student';
        const roll = selectedStudent?.dataset.roll || 'Roll';
        const clsValue = classSelect?.value || 'Class';

        // Strictly ASCII-only filename for maximum machine compatibility
        const engName = transliterateBangla(rawName).replace(/[^a-z0-9]/gi, '_').substring(0, 15);
        const engCls = transliterateBangla(clsValue).replace(/[^a-z0-9]/gi, '_');
        const finalFileName = `ID-Card_${engName}_Roll-${roll}_${engCls}.png`;

        // Capture! Using File-Object in Blob for absolute Chrome desktop naming fidelity
        canvas.toBlob((blob) => {
            if (!blob) {
                showNotification('ইমেজ তৈরি করতে ব্যর্থ হয়েছে', 'error');
                return;
            }

            // Creating a File object inside the Blob URL often forces Chrome to respect the name
            const file = new File([blob], finalFileName, { type: 'image/png' });
            const url = window.URL.createObjectURL(file);

            const link = document.createElement('a');
            link.style.display = 'none';
            link.href = url;
            link.download = finalFileName;

            document.body.appendChild(link);
            link.click();

            // Allow more time for the OS to finalize
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 1000);

            showNotification('আইডি কার্ড সফলভাবে ডাউনলোড হয়েছে! ✅');
        }, 'image/png', 1.0);
    } catch (err) {
        console.error('Download failed:', err);
        showNotification('ইমেজ ডাউনলোড করতে একটি সমস্যা হয়েছে', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/**
 * Handle Bulk Printing of ID Cards (Super Admin)
 */
async function handleBulkPrint() {
    const classSelect = document.getElementById('srBpClass');
    const sessionSelect = document.getElementById('srBpSession');
    const groupSelect = document.getElementById('srBpGroup');

    const selClass = classSelect?.value;
    const selSession = sessionSelect?.value;
    const selGroup = groupSelect?.value;

    if (!selClass || !selSession) {
        showNotification('বাল্ক প্রিন্ট করার জন্য শ্রেণি এবং সেশন নির্বাচন করা আবশ্যক', 'error');
        return;
    }

    const btn = document.getElementById('srBulkPrintBtn');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> প্রস্তুত হচ্ছে...';
    btn.disabled = true;

    try {
        const allExams = await getSavedExams();
        const relevantExams = allExams.filter(e => e.class === selClass && e.session === selSession);

        // Use already-imported getUnifiedStudents
        const registryStudents = await getUnifiedStudents();
        const lookupMap = new Map();
        registryStudents.forEach(s => {
            const key = `${s.id}_${s.group || ''}_${s.class || ''}_${s.session || ''}`;
            lookupMap.set(key, s);
        });

        const studentsMap = new Map();
        relevantExams.forEach(exam => {
            if (exam.studentData) {
                exam.studentData.forEach(s => {
                    const stGroup = s.group || '';
                    if (selGroup && selGroup !== 'all' && stGroup !== selGroup) return;

                    const key = `${s.id}_${stGroup}`;
                    if (!studentsMap.has(key)) {
                        // Check status from registry
                        const registryKey = `${s.id}_${stGroup}_${selClass}_${selSession}`;
                        const registryStudent = lookupMap.get(registryKey);
                        if (registryStudent && registryStudent.status === false) return;

                        studentsMap.set(key, s);
                    }
                });
            }
        });

        const studentsList = Array.from(studentsMap.values());
        if (studentsList.length === 0) {
            showNotification('কোনো শিক্ষার্থী পাওয়া যায়নি', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        // Use already-imported sortStudentData
        const sortedStudents = sortStudentData(studentsList, 'id', 'roll-asc');

        // Fetch settings for developer credit
        const settings = await getSettings();
        const developerCredit = settings?.developerCredit;
        let devCreditHtml = '';
        if (developerCredit && developerCredit.enabled !== false) {
            const text = developerCredit.text || '';
            const name = developerCredit.name || '';
            const link = developerCredit.link || '';
            devCreditHtml = `
                <div class="sr-bp-footer">
                    ${text} <a href="${link}" target="_blank" style="color:#000;text-decoration:none;font-weight:bold;">${name}</a>
                </div>
            `;
        }

        // Generate Print Output (8 cards per page to ensure maximum utility)
        let printHTML = '';
        const cardsPerPage = 8;

        for (let i = 0; i < sortedStudents.length; i += cardsPerPage) {
            const pageStudents = sortedStudents.slice(i, i + cardsPerPage);

            printHTML += `<div class="sr-bp-page">
                            <div class="sr-bp-grid-layout">`;

            pageStudents.forEach(s => {
                const uid = generateStudentUniqueId(s.name, selClass, selSession, s.id, s.group || '');
                const studentResult = {
                    id: s.id,
                    name: s.name,
                    class: selClass,
                    session: selSession,
                    group: s.group || '',
                    uniqueId: uid,
                    showSearchBtn: false
                };
                printHTML += `<div class="sr-bp-card-wrapper">${getIdCardHTML(studentResult, false, developerCredit)}</div>`;
            });

            printHTML += `  </div>
                            ${devCreditHtml}
                          </div>`;
        }

        // Create or get print container
        let printContainer = document.getElementById('srBulkPrintContainer');
        if (!printContainer) {
            printContainer = document.createElement('div');
            printContainer.id = 'srBulkPrintContainer';
            document.body.appendChild(printContainer);
        }

        printContainer.innerHTML = printHTML;

        // Generate QR codes for all bulk print cards instantly
        for (const s of sortedStudents) {
            const uid = generateStudentUniqueId(s.name, selClass, selSession, s.id, s.group || '');
            const studentResult = {
                id: s.id,
                name: s.name,
                class: selClass,
                session: selSession,
                group: s.group || '',
                uniqueId: uid
            };
            await renderQRCodesInContainer(printContainer, studentResult, developerCredit);
        }

        // Add a class to body to trigger print styles, then print
        document.body.classList.add('sr-bulk-printing-active');

        // Dynamically inject @page rule to avoid CSS conflicts with other print modes
        let printPageStyle = document.getElementById('srBulkPrintPageStyle');
        if (!printPageStyle) {
            printPageStyle = document.createElement('style');
            printPageStyle.id = 'srBulkPrintPageStyle';
            document.head.appendChild(printPageStyle);
        }
        printPageStyle.innerHTML = '@page { size: A4 portrait; margin: 5mm; }';

        setTimeout(() => {
            window.print();

            // Cleanup
            document.body.classList.remove('sr-bulk-printing-active');
            if (printPageStyle) printPageStyle.innerHTML = '';
            printContainer.innerHTML = '';

            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 800);

    } catch (err) {
        console.error('Bulk print error:', err);
        showNotification('বাল্ক প্রিন্ট তৈরি করতে সমস্যা হয়েছে', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
