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
    generateStudentDocId 
} from '../firestoreService.js';
import { state } from './state.js';
import { showNotification, convertToEnglishDigits } from '../utils.js';
import { compressImage } from '../imageUtils.js';
import QRCode from 'qrcode';
import { generateStudentUniqueId } from './studentResultsManager.js';
import { loadMarksheetRules, currentMarksheetRules } from './marksheetRulesManager.js';

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
            if (callback) callback(marksheetSettings);
        }
    });
}

/**
 * Save marksheet settings to Firestore
 */
async function saveMarksheetSettings(settings) {
    try {
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('../firebase.js');
        const docRef = doc(db, 'settings', 'marksheet_config');
        await setDoc(docRef, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
        Object.assign(marksheetSettings, settings);
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

/**
 * Generate marksheets
 */
async function generateMarksheets() {
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

    // Build student aggregation
    const studentAgg = new Map();
    relevantExams.forEach(exam => {
        if (exam.studentData) {
            exam.studentData.forEach(s => {
                const sGroup = s.group || '';

                // Group filtering
                if (selectedGroup !== 'all' && sGroup !== selectedGroup) {
                    return;
                }

                // Individual student filtering
                const key = `${s.id}_${sGroup}`;
                if (studentSelection !== 'all' && studentSelection !== key) {
                    return;
                }

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
                        subjects: {}
                    });
                }
                studentAgg.get(key).subjects[exam.subject] = {
                    written: s.written || 0,
                    mcq: s.mcq || 0,
                    practical: s.practical || 0,
                    total: s.total || 0,
                    grade: s.grade || '',
                    gpa: s.gpa || '',
                    status: s.status || ''
                };
            });
        }
    });

    let studentsArray = [...studentAgg.values()].sort((a, b) => {
        // Primary sort: Group Alphabetically
        const groupA = a.group.toLowerCase();
        const groupB = b.group.toLowerCase();
        if (groupA < groupB) return -1;
        if (groupA > groupB) return 1;

        // Secondary sort: Roll number
        return (parseInt(convertToEnglishDigits(String(a.id))) || 0) - (parseInt(convertToEnglishDigits(String(b.id))) || 0);
    });

    if (studentSelection !== 'all') {
        studentsArray = studentsArray.filter(s => `${s.id}_${s.group}` === studentSelection);
    }

    if (studentsArray.length === 0) {
        showNotification('শিক্ষার্থী পাওয়া যায়নি', 'error');
        return;
    }

    // Load developer credit settings before rendering
    const globalSettings = await getSettings();
    state.developerCredit = globalSettings?.developerCredit || null;

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
    let marksheetsHtml = '';
    const subjectConfigs = await getExamConfigs() || {};
    
    for (const student of studentsArray) {
        marksheetsHtml += await renderSingleMarksheet(student, displaySubjects, examDisplayName, session, null, rules, allOptSubs, allExams, subjectConfigs);
    }
    previewArea.innerHTML = marksheetsHtml;

    // Render QRs after HTML is set
    setTimeout(async () => {
        await renderMarksheetQRCodes(previewArea);
    }, 100);

    // Load developer credit settings before rendering
    state.developerCredit = await getSettings('developerCredit');

    // Show bulk print button
    const bulkBtn = document.getElementById('msPrintAllBtn');
    if (bulkBtn) bulkBtn.style.display = 'inline-flex';

    showNotification(`${studentsArray.length} জন শিক্ষার্থীর মার্কশীট তৈরি হয়েছে ✅`);

    // ... (rest of the function)

    // Show main zoom header
    const mainHeader = document.getElementById('msMainPreviewHeader');
    if (mainHeader) {
        mainHeader.style.display = 'flex';
        // Auto-fit check for mobile
        if (window.innerWidth <= 768) {
            const zoomInput = document.getElementById('msMainZoom');
            const zoomLevelValue = document.getElementById('msMainZoomLevel');
            const initialScale = window.innerWidth <= 480 ? 0.35 : 0.45;
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
 * Calculate merit rank for a student across all relevant exams
 */
async function getStudentExamsHistory(student, allExams, cls, session, rules, subjectConfigs) {
    const studentHistory = [];
    if (!allExams || !Array.isArray(allExams)) return [];

    let examSessions = [...new Set(allExams.filter(e => e.class === cls && e.session === session).map(e => e.name))];
    
    // Filter by manual settings if any configured
    if (marksheetSettings.historyExams && marksheetSettings.historyExams.length > 0) {
        examSessions = examSessions.filter(name => marksheetSettings.historyExams.includes(name));
    }
    
    for (const examName of examSessions) {
        const sessionExams = allExams.filter(e => e.class === cls && e.session === session && e.name === examName);
        const subjects = [...new Set(sessionExams.map(e => e.subject).filter(Boolean))];
        
        const studentsInSession = new Map();
        sessionExams.forEach(ex => {
            if (!ex.studentData) return;
            ex.studentData.forEach(s => {
                const key = `${s.id}_${s.group || ''}`;
                if (!studentsInSession.has(key)) {
                    studentsInSession.set(key, { id: s.id, name: s.name, group: s.group || '', subjects: {} });
                }
                studentsInSession.get(key).subjects[ex.subject] = s;
            });
        });

        const results = [];
        studentsInSession.forEach(st => {
            let totalMarks = 0;
            let totalGPA = 0;
            let compulsoryGPA = 0;
            let compulsoryCount = 0;
            let optionalBonus = 0;
            let allPassed = true;
            let visibleCount = 0;

            subjects.forEach(subj => {
                const data = st.subjects[subj];
                if (!data) return;
                
                const sTotal = data.total || 0;
                totalMarks += sTotal;
                
                const config = subjectConfigs?.[subj] || { total: 100 };
                const maxTotal = parseInt(config.total) || 100;
                const pct = maxTotal > 0 ? (sTotal / maxTotal) * 100 : 0;
                
                const grade = getLetterGrade(pct);
                const gp = getGradePoint(pct);
                
                let isFail = grade === 'F';
                if (data.written !== undefined && config.writtenPass !== undefined && data.written < config.writtenPass) isFail = true;
                if (data.mcq !== undefined && config.mcqPass !== undefined && data.mcq < config.mcqPass) isFail = true;
                if (data.practical !== undefined && config.practicalPass !== undefined && data.practical < config.practicalPass) isFail = true;

                const studentGroup = st.group || '';
                const optKey = Object.keys(rules?.optionalSubjects || {}).find(k => k.toLowerCase().includes(studentGroup.toLowerCase()) || studentGroup.toLowerCase().includes(k.toLowerCase())) || studentGroup;
                const optSubs = (rules?.optionalSubjects?.[optKey] || []).map(os => String(os).trim().toLowerCase());
                const isOptional = optSubs.some(os => subj.toLowerCase().includes(os) || os.includes(subj.toLowerCase()));

                if (isOptional) {
                    if (!isFail && gp > 2.00) optionalBonus = Math.max(optionalBonus, gp - 2.00);
                } else {
                    compulsoryGPA += gp;
                    compulsoryCount++;
                    if (isFail) allPassed = false;
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

            results.push({
                key: `${st.id}_${st.group || ''}`,
                gpa: allPassed ? finalGPA : -1,
                total: totalMarks,
                allPassed: allPassed,
                displayGPA: finalGPA.toFixed(2)
            });
        });

        results.sort((a, b) => {
            if (a.allPassed && !b.allPassed) return -1;
            if (!a.allPassed && b.allPassed) return 1;
            if (a.allPassed) {
                if (b.gpa !== a.gpa) return b.gpa - a.gpa;
                return b.total - a.total;
            }
            return b.total - a.total;
        });

        const studentRankIdx = results.findIndex(r => r.key === `${student.id}_${student.group || ''}`);
        if (studentRankIdx !== -1) {
            studentHistory.push({
                name: examName,
                gpa: results[studentRankIdx].allPassed ? results[studentRankIdx].displayGPA : results[studentRankIdx].displayGPA + ' (F)',
                rank: studentRankIdx + 1
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


export async function renderSingleMarksheet(student, subjects, examDisplayName, selectedSession, customSettings = null, rules = null, allOptSubs = [], allExams = [], subjectConfigs = {}) {

    const history = await getStudentExamsHistory(student, allExams, student.class, selectedSession, rules, subjectConfigs);
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

            // If it's only in the optional list (and not general/group)
            // Show only if student has marks in this subject or its papers
            if (isOpt && !isGeneral && !isGroup) {
                const checkMarks = (name) => {
                    const data = student.subjects[name];
                    return data && (data.total > 0 || data.written > 0 || data.mcq > 0 || data.practical > 0);
                };

                const papers = isObj ? (subjObj.papers || []) : [subjName];
                const studentHasMarks = checkMarks(subjName) || papers.some(p => checkMarks(p));

                if (!studentHasMarks) return false;
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
            const combinedData = student.subjects[subjName] || {};

            return papers.map((paperName, pIdx) => {
                const data = student.subjects[paperName] || {};
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
                        const pData = student.subjects[p] || {};
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
            const data = student.subjects[subj] || {};
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
                if (grade === 'F') allPassed = false;
            }

            if (data.status === 'ফেল' || data.status === 'fail') {
                if (!isCombinedMode || !isOptional) allPassed = false;
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
        avgGPA = finalGP.toFixed(2);
    } else {
        avgGPA = visibleSubjects.length > 0 ? (totalGradePointSum / visibleSubjects.length).toFixed(2) : '0.00';
    }

    const overallGrade = allPassed ? getGradeFromGP(parseFloat(avgGPA)) : 'F';

    // ... (rest of the function for grand gpa if needed)

    // Footer and other parts...

    const headerRow = isCombinedMode ? `
        <tr>
            <th class="ms-th-sl">ক্রঃ</th>
            <th class="ms-th-subject">বিষয়ের নাম</th>
            <th class="ms-th-subject">পত্র সমূহ</th>
            <th class="ms-th-num">পূর্ণমান</th>
            <th class="ms-th-num">CQ</th>
            <th class="ms-th-num">MCQ</th>
            <th class="ms-th-num">ব্যবহারিক </th>
            <th class="ms-th-num">প্রাপ্ত নম্বর</th>
            <th class="ms-th-num">গড়</th>
            <th class="ms-th-grade">গ্রেড</th>
            <th class="ms-th-gp">GPA</th>
        </tr>` : `
        <tr>
            <th class="ms-th-sl">ক্রঃ</th>
            <th class="ms-th-subject">বিষয়ের নাম</th>
            <th class="ms-th-num">পূর্ণমান</th>
            <th class="ms-th-num">লিখিত</th>
            <th class="ms-th-num">MCQ</th>
            <th class="ms-th-num">ব্যবহারিক</th>
            <th class="ms-th-num">প্রাপ্ত নম্বর</th>
            <th class="ms-th-grade">গ্রেড</th>
            <th class="ms-th-gp">GPA</th>
        </tr>`;

    // Final result text should use pass/fail logic
    const resultText = allPassed ? 'পাস' : 'অকৃতকার্য';
    const resultClass = allPassed ? 'ms-result-pass' : 'ms-result-fail';

    const signaturesToRender = ms.signatures || (ms.signatureLabels || ['শ্রেণি শিক্ষক', 'পরীক্ষা কমিটি', 'অধ্যক্ষ']).map(l => ({ label: l, url: '' }));

    const signatureHtml = signaturesToRender.map(sig =>
        `<div class="ms-sig-block">
            ${sig.url ? `<img src="${sig.url}" class="ms-sig-img" alt="Signature">` : ''}
            <div class="ms-sig-line"></div>
            <span>${sig.label}</span>
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

        let content = `<span>${text} <strong>${name}</strong></span>`;
        if (link) {
            content += `<br><a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:2px;">${link}</a>`;
        }

        return `<div class="${className}">${content.trim()}</div>`;
    }

    return `
        <div class="ms-page font-${ms.fontSize || 'medium'} theme-${ms.theme || 'classic'} border-${ms.borderStyle || 'double'} typography-${ms.typography || 'default'} density-${ms.rowDensity || 'normal'}" id="ms_page_${student.id}_${student.group}" style="--ms-primary: ${ms.primaryColor || '#4361ee'};">
            
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
                    
                    <div class="ms-header-pill">
                        <div class="ms-pill-left">${ms.headerLine1 || 'পরীক্ষার ফলাফল পত্র'}</div>
                        <div class="ms-pill-right">${examDisplayName} (${selectedSession})</div>
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

                <!-- Grade Scale Reference -->
                <div class="ms-grade-scale">
                    <div class="ms-grade-scale-wrapper">
                        <span class="ms-gs-title">গ্রেডিং স্কেলঃ</span>
                        <div class="ms-grade-badges">
                            <span class="ms-gs-item gs-ap"><strong>A+</strong> (৮০-১০০) ৫.০০</span>
                            <span class="ms-gs-item gs-a"><strong>A</strong> (৭০-৭৯) ৪.০০</span>
                            <span class="ms-gs-item gs-am"><strong>A-</strong> (৬০-৬৯) ৩.৫০</span>
                            <span class="ms-gs-item gs-b"><strong>B</strong> (৫০-৫৯) ৩.০০</span>
                            <span class="ms-gs-item gs-c"><strong>C</strong> (৪০-৪৯) ২.০০</span>
                            <span class="ms-gs-item gs-d"><strong>D</strong> (৩৩-৩৯) ১.০০</span>
                            <span class="ms-gs-item gs-f"><strong>F</strong> (০-৩২) ০.০০</span>
                        </div>
                    </div>
                </div>

                <!-- Extra Sections: History, Comments, QR -->
                <div class="ms-extra-grid">
                    <div class="ms-extra-box ms-history-column">
                        <span class="ms-extra-title">সকল পরীক্ষার ফলাফল হিস্টোরী</span>
                        <table class="ms-history-table">
                            <thead>
                                <tr>
                                    <th style="width:50%">পরীক্ষার নাম</th>
                                    <th>GPA</th>
                                    <th>মেধাক্রম</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${history.length > 0 ? history.map(h => `
                                    <tr>
                                        <td>${h.name}</td>
                                        <td>${h.gpa}</td>
                                        <td style="text-align:center;">${h.rank}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="3" style="text-align:center; opacity:0.5; padding: 10px 0;">হিস্টোরি নেই</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="ms-extra-box ms-comments-box">
                        <span class="ms-extra-title">মন্তব্য:</span>
                        <div class="ms-comment-lines">
                            <div class="ms-dot-line"></div>
                            <div class="ms-dot-line"></div>
                            <div class="ms-dot-line"></div>
                        </div>
                    </div>
                    
                    <div class="ms-extra-box ms-qr-column">
                        <div class="ms-qr-canvas-wrapper">
                            <canvas class="ms-mr-qr-canvas" data-uid="${uid}" data-exam="${examDisplayName}" data-name="${student.name}"></canvas>
                        </div>
                        <div class="ms-qr-uid">ID No. ${uid}</div>
                    </div>
                </div>


                <!-- Signatures -->
                <div class="ms-flex-spacer"></div>
                <div class="ms-signatures-section">
                    ${signatureHtml}
                </div>

                <!-- Footer -->
                <div class="ms-footer">
                    <span>জেনারেটেড  তারিখ: ${todayDate}</span>
                    <span>এটি কম্পিউটার জেনারেটেড ফলাফল পত্র</span>
                </div>
                ${getDeveloperCreditHtml('ms-dev-credit')}
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
 * Bulk Print - Opens an isolated print window with all marksheets
 */
function bulkPrint() {
    const previewArea = document.getElementById('marksheetPreview');
    if (!previewArea) return;

    const allPages = previewArea.querySelectorAll('.ms-page');
    if (allPages.length === 0) {
        showNotification('প্রিন্ট করার জন্য কোনো মার্কশীট নেই', 'error');
        return;
    }

    const marksheetHtmlArray = Array.from(allPages).map(p => p.outerHTML);
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

    const printAllBtn = document.getElementById('msPrintAllBtn');
    if (printAllBtn) {
        printAllBtn.addEventListener('click', bulkPrint);
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

                if (data1 || data2) {
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
 * Render QR Codes for all generated marksheets
 */
async function renderMarksheetQRCodes(container) {
    const canvases = container.querySelectorAll('.ms-mr-qr-canvas');
    if (!canvases.length) return;

    for (const canvas of canvases) {
        try {
            const uid = canvas.dataset.uid;
            const exam = canvas.dataset.exam;
            const name = canvas.dataset.name;
            const liveLink = window.location.origin + window.location.pathname + '#student-results?uid=' + uid + '&exam=' + encodeURIComponent(exam);
            const qrData = `Student Marksheet Verification\nID: ${uid}\nName: ${name}\nExam: ${exam}\nLink: ${liveLink}`;

            await QRCode.toCanvas(canvas, qrData, {
                width: 200, // Higher resolution for better scanning
                margin: 0,
                color: { dark: '#1e293b', light: '#ffffff' },
                errorCorrectionLevel: 'M'
            });
            canvas.style.width = '130px';
            canvas.style.height = '130px';

        } catch (err) {
            console.error('Marksheet QR generation failed:', err);
        }
    }
}

