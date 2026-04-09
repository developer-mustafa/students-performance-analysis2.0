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
    generateStudentDocId 
} from '../firestoreService.js';
import { state } from './state.js';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { showNotification, convertToEnglishDigits } from '../utils.js';
import {
    renderSingleMarksheet,
    applyCombinedPaperLogic,
    loadMarksheetSettings,
    getMarksheetSettings
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
 * Format: [First3_NameChars_English]-R[Roll]-[6_Digit_Hash] (e.g., MOH-R05-A7B2C9)
 * 
 * @param {string} name - Student name
 * @param {string} cls - Class
 * @param {string} session - Session
 * @param {string|number} roll - Roll number
 * @param {string} group - Group name
 * @returns {string} - Professional Unique ID string
 */
export function generateStudentUniqueId(name, cls, session, roll, group) {
    const first3 = extractBengaliChars(name, 3, false);
    const namePrefix = transliterateBangla(first3).toUpperCase().padEnd(3, 'X').substring(0, 3);

    const rollPart = convertToEnglishDigits(String(roll || '').replace(/\s+/g, '')).padStart(2, '0');

    // Hash the exact inputs
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

            // Match logic:
            // 1. Exact Unique ID match (Always highest priority)
            // 2. Roll match (s.id) + Class + Session (If filters provided)
            let isMatch = (uid === normalizedSearch);
            
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
            // Override with latest data from management
            res.name = latest.name || res.name;
            // Add other fields if needed for UI (Father's Name etc. if added to public search later)
            res.fatherName = latest.fatherName || '';
            res.mobile = latest.mobile || '';
            
            // Re-generate Unique ID if name changed (to keep it deterministic if generated on the fly)
            // But wait, the Unique ID in the search is what the user entered. 
            // If the name changed, the NEW Unique ID might be different. 
            // This is a tricky part. If user searches by OLD UID, we should still find them but show NEW name.
        }
    });

    // If an examName filter is set, we return the match that contains that exam
    // Otherwise we return the first match.
    return results[0];
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
    const ms = getMarksheetSettings();

    // Filter exams if a specific one was sought
    let activeExams = exams;
    const searchExamName = document.getElementById('srSearchExam')?.value;
    if (searchExamName && searchExamName !== 'all') {
        activeExams = exams.filter(e => e.name === searchExamName);
    }

    // Collect all subjects ONLY from active exams
    const subjectsSet = new Set(activeExams.map(e => e.subject).filter(Boolean));
    let subjects = [...subjectsSet];

    // Build student data aggregation (same logic as marksheetManager)
    const studentAgg = {
        id, name, group,
        class: cls,
        session,
        subjects: {}
    };

    activeExams.forEach(exam => {
        if (exam.studentData) {
            const s = exam.studentData.find(st => String(st.id) === String(id) && (st.group || '') === group);
            if (s) {
                studentAgg.subjects[exam.subject] = {
                    written: s.written || 0,
                    mcq: s.mcq || 0,
                    practical: s.practical || 0,
                    total: s.total || 0,
                    grade: s.grade || '',
                    gpa: s.gpa || '',
                    status: s.status || ''
                };
            }
        }
    });

    // Load marksheet rules for sorting
    let allOptSubs = [];
    let rules = {};
    try {
        await loadMarksheetRules();
        rules = currentMarksheetRules[cls] || currentMarksheetRules["All"] || {};

        const generalSubjects = rules.generalSubjects || [];
        const allGroupSubs = group !== 'all'
            ? ((rules.groupSubjects || {})[group] || [])
            : Object.values(rules.groupSubjects || {}).flat();
        const optionalSubjects = (rules.optionalSubjects || {})[group] || [];
        allOptSubs = group !== 'all'
            ? optionalSubjects
            : Object.values(rules.optionalSubjects || {}).flat();

        subjects.sort((a, b) => {
            const getScore = (sub) => {
                const genIdx = generalSubjects.indexOf(sub);
                if (genIdx !== -1) return 1000 + genIdx;
                if (allGroupSubs.some(gs => sub.includes(gs) || gs.includes(sub))) return 2000;
                const isOptional = allOptSubs.some(os => sub.includes(os) || os.includes(sub));
                if (isOptional) return 5000;
                return 3000;
            };
            return getScore(a) - getScore(b);
        });
    } catch (err) {
        console.warn("Subject sorting failed:", err);
    }

    // Apply combined paper logic if needed
    let displaySubjects = subjects;
    try {
        if (rules.mode === 'combined' && rules.combinedSubjects?.length > 0) {
            displaySubjects = applyCombinedPaperLogic([studentAgg], subjects, rules, allOptSubs);
        }
    } catch (err) {
        console.error("Combined paper logic failed:", err);
    }

    // Load settings for developer credit
    const globalSettings = await getSettings();
    state.developerCredit = globalSettings?.developerCredit || null;

    // Correctly determine the Display Name
    let examDisplayName = 'পরীক্ষা';
    const uniqueExamNames = [...new Set(activeExams.map(e => e.name).filter(Boolean))];

    if (searchExamName && searchExamName !== 'all') {
        // If user specifically picked an exam, use that name
        examDisplayName = searchExamName;
    } else if (uniqueExamNames.length > 1) {
        // Only show "Combined" if there are multiple different exam sessions
        examDisplayName = 'সমন্বিত ফলাফল';
    } else if (uniqueExamNames.length === 1) {
        // Only one type of exam found
        examDisplayName = uniqueExamNames[0];
    }

    const html = renderSingleMarksheet(studentAgg, displaySubjects, examDisplayName, session, null, rules, allOptSubs);

    previewArea.innerHTML = html;

    // Robust Auto-fit zoom for mobile devices
    const containerWidth = previewArea.clientWidth || window.innerWidth;
    const targetWidth = 840; // A4 Standard context width
    if (containerWidth < targetWidth) {
        const initialScale = Math.max(0.3, (containerWidth - 30) / targetWidth);
        previewArea.style.setProperty('--ms-main-scale', initialScale);

        const zoomInput = document.getElementById('srZoom');
        const zoomLevel = document.getElementById('srZoomLevel');
        if (zoomInput) zoomInput.value = initialScale;
        if (zoomLevel) zoomLevel.innerText = Math.round(initialScale * 100) + '%';
    }

    // Show zoom controls
    const zoomHeader = document.getElementById('srPreviewHeader');
    if (zoomHeader) zoomHeader.style.display = 'flex';

    showNotification('মার্কশীট সফলভাবে তৈরি হয়েছে ✅');
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

    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }

    if (searchInput) {
        // Show/Hide Clear button and update value
        searchInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
            if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
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
        });
    }

    // --- QR Redirect Logic ---
    const checkQRParams = () => {
        const hash = window.location.hash || '';
        if (hash.includes('student-results?uid=')) {
            const paramsString = hash.split('?')[1];
            const params = new URLSearchParams(paramsString);
            const uid = params.get('uid');
            const exam = params.get('exam');
            
            if (uid && searchInput) {
                searchInput.value = uid;
                if (clearBtn) clearBtn.style.display = 'flex';
                
                // If exam info is present, we could potentially auto-select or highlight it. 
                // For now, let's trigger search immediately.
                setTimeout(handleSearch, 300);
            }
        }
    };

    checkQRParams();
    window.addEventListener('hashchange', checkQRParams);

    // Generator Reset Btn
    const genResetBtn = document.getElementById('srGenResetBtn');
    if (genResetBtn) {
        genResetBtn.addEventListener('click', resetGeneratorSection);
    }

    // Zoom controls
    const zoomInput = document.getElementById('srZoom');
    const zoomLevel = document.getElementById('srZoomLevel');
    const previewArea = document.getElementById('srMarksheetPreview');

    if (zoomInput && zoomLevel && previewArea) {
        zoomInput.addEventListener('input', (e) => {
            const val = e.target.value;
            zoomLevel.innerText = Math.round(val * 100) + '%';
            previewArea.style.setProperty('--ms-main-scale', val);
        });
    }

    // ID Generator helper
    const genBtn = document.getElementById('srGenIdBtn');
    if (genBtn) {
        genBtn.addEventListener('click', handleGenerateId);
    }

    const downloadBtn = document.getElementById('srDownloadIdBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', handleDownloadIdCard);
    }

    // Toggle between search and generate modes
    const tabBtns = document.querySelectorAll('.sr-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.tab;
            document.querySelectorAll('.sr-tab-content').forEach(tc => {
                tc.style.display = tc.id === target ? 'block' : 'none';
            });
        });
    });

    // Bulk Print event
    const bpBtn = document.getElementById('srBulkPrintBtn');
    if (bpBtn) {
        bpBtn.addEventListener('click', handleBulkPrint);
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

        if (searchClassSelect) searchClassSelect.addEventListener('change', updateSearchExamDropdown);
        if (searchSessionSelect) searchSessionSelect.addEventListener('change', updateSearchExamDropdown);
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
            const { sortStudentData } = await import('../utils.js');
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

        classSelect.addEventListener('change', updateStudentDropdown);
        sessionSelect.addEventListener('change', updateStudentDropdown);
        groupSelect.addEventListener('change', updateStudentDropdown);

    } catch (err) {
        console.error("Failed to populate ID generator dropdowns:", err);
        classSelect.innerHTML = '<option value="">ডেটা লোড করতে সমস্যা হয়েছে</option>';
        sessionSelect.innerHTML = '<option value="">ডেটা লোড করতে সমস্যা হয়েছে</option>';
    }
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

        const studentsMap = new Map();
        relevantExams.forEach(exam => {
            if (exam.studentData) {
                exam.studentData.forEach(s => {
                    const stGroup = s.group || '';
                    if (selGroup && selGroup !== 'all' && stGroup !== selGroup) return;

                    const key = `${s.id}_${stGroup}`;
                    if (!studentsMap.has(key)) {
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

        const { sortStudentData } = await import('../utils.js');
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
