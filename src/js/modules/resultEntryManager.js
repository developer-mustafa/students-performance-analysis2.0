/**
 * Result Entry Manager Module
 * Handles individual and bulk mark entry for exams.
 * Supports creating new exams on the fly and local storage caching.
 * @module resultEntryManager
 */

import { getSavedExams, updateExam, saveExam, getAllStudents, getUnifiedStudents, getExamConfigs } from '../firestoreService.js';
import { state } from './state.js';
import { showNotification, convertToEnglishDigits, calculateStatistics, normalizeText, normalizeSession } from '../utils.js';
import { isTeacherAuthorized, getTeacherAssignmentsByUid } from './teacherAssignmentManager.js';
import { loadMarksheetRules } from './marksheetRulesManager.js';
import { normalizeGroupName } from './routineManager.js';

let currentExamDoc = null;
let originalStudentData = null; // For discard
let hasUnsavedChanges = false;
let isNewExam = false; // Flag: are we creating a new exam?

// ==========================================
// LOCAL STORAGE DRAFT HELPERS
// ==========================================

function getDraftKey(cls, session, subject, examName) {
    return `draft_re_${cls}_${session}_${subject}_${examName}`.replace(/\s+/g, '_');
}

function saveDraft(cls, session, subject, examName, studentData) {
    try {
        const key = getDraftKey(cls, session, subject, examName);
        localStorage.setItem(key, JSON.stringify({
            savedAt: Date.now(),
            cls, session, subject, examName,
            studentData
        }));
        console.log('[Draft] Saved to localStorage:', key);
    } catch (e) {
        console.warn('[Draft] Could not save draft:', e);
    }
}

function loadDraft(cls, session, subject, examName) {
    try {
        const key = getDraftKey(cls, session, subject, examName);
        const raw = localStorage.getItem(key);
        if (raw) {
            const parsed = JSON.parse(raw);
            // Discard drafts older than 24 hours
            if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(key);
                return null;
            }
            console.log('[Draft] Restored from localStorage:', key);
            return parsed.studentData;
        }
    } catch (e) {
        console.warn('[Draft] Could not load draft:', e);
    }
    return null;
}

function clearDraft(cls, session, subject, examName) {
    try {
        const key = getDraftKey(cls, session, subject, examName);
        localStorage.removeItem(key);
        console.log('[Draft] Cleared:', key);
    } catch (e) { /* ignore */ }
}


// ==========================================
// DROPDOWN POPULATION
// ==========================================

/**
 * Populate cascading dropdowns from saved exams & teacher assignments
 */
export async function populateREDropdowns() {
    const exams = await getSavedExams();

    // Handle Teacher Restrictions
    let assignedExams = exams;
    let teacherAssignments = [];
    if (state.userRole === 'teacher' && state.currentUser) {
        teacherAssignments = await getTeacherAssignmentsByUid(state.currentUser.uid);
        console.log('Teacher UID:', state.currentUser.uid);
        console.log('Teacher assignments:', JSON.stringify(teacherAssignments));

        if (teacherAssignments.length > 0) {
            assignedExams = exams.filter(e => {
                return teacherAssignments.some(a =>
                    a.assignedClass === e.class &&
                    a.assignedSession === e.session &&
                    (a.assignedSubjects || []).includes(e.subject)
                );
            });
        }
    }

    // --- Build unique classes and sessions ---
    let classes = [];
    let sessions = [];

    if (state.userRole === 'teacher' && !state.isAdmin && !state.isSuperAdmin) {
        // Teachers: only see assigned Class/Session
        classes = [...new Set(teacherAssignments.map(a => a.assignedClass).filter(Boolean))].sort();
        sessions = [...new Set(teacherAssignments.map(a => a.assignedSession).filter(Boolean))].sort().reverse();
    } else {
        // Admins/Super Admins: See everything from exams or academic structure
        const classesFromExams = exams.map(e => e.class).filter(Boolean);
        const classesFromStructure = (state.academicStructure?.class || []).map(c => c.value).filter(Boolean);
        classes = [...new Set([...classesFromExams, ...classesFromStructure])].sort();

        const sessionsFromExams = exams.map(e => e.session).filter(Boolean);
        const sessionsFromStructure = (state.academicStructure?.session || []).map(s => s.value).filter(Boolean);
        sessions = [...new Set([...sessionsFromExams, ...sessionsFromStructure])].sort().reverse();
    }

    const classSelect = document.getElementById('reClass');
    const sessionSelect = document.getElementById('reSession');
    const groupSelect = document.getElementById('reGroup');
    const subjectSelect = document.getElementById('reSubject');

    // Hide Group filter for teachers
    if (groupSelect) {
        // Target .selector-group (from index.html) or .dm-input-group (generic)
        const groupContainer = groupSelect.closest('.selector-group') || groupSelect.closest('.dm-input-group') || groupSelect.parentElement;
        const isTeacherOnly = state.userRole === 'teacher' && !state.isAdmin && !state.isSuperAdmin;
        
        if (isTeacherOnly) {
            if (groupContainer) {
                groupContainer.style.display = 'none';
                // Also ensure the value is 'all' if hidden
                groupSelect.value = 'all';
            }
        } else {
            if (groupContainer) groupContainer.style.display = 'block';
            const groups = state.academicStructure?.group || [];
            groupSelect.innerHTML = '<option value="all">সকল গ্রুপ</option>' +
                groups.map(g => `<option value="${g.value}">${g.value}</option>`).join('');
        }
    }

    if (classSelect) {
        classSelect.innerHTML = (classes.length === 1) ? '' : '<option value="">শ্রেণি নির্বাচন</option>';
        classes.forEach(cls => {
            classSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        });
        if (classes.length === 1) classSelect.value = classes[0];
    }

    if (sessionSelect) {
        sessionSelect.innerHTML = (sessions.length === 1) ? '' : '<option value="">সেশন নির্বাচন</option>';
        sessions.forEach(s => {
            sessionSelect.innerHTML += `<option value="${s}">${s}</option>`;
        });
        if (sessions.length === 1) sessionSelect.value = sessions[0];
    }

    // Subject and exam dropdowns update based on class/session/group selection
    const updateSubjectAndExam = async () => {
        const selClass = classSelect?.value;
        const selSession = sessionSelect?.value;
        const selGroup = groupSelect?.value || 'all';

        if (!selClass || !selSession) return;

        // --- Improved Subject Logic (Matching Routine Manager) ---
        let subjectGroups = await getREGroupSubjects(selClass, selGroup);

        // Teacher Restriction: Only show assigned subjects
        if (state.userRole === 'teacher' && !state.isAdmin && !state.isSuperAdmin) {
            const assignedForThisClass = teacherAssignments
                .filter(a => a.assignedClass === selClass && a.assignedSession === selSession)
                .flatMap(a => a.assignedSubjects || []);
            const assignedSet = new Set(assignedForThisClass);

            subjectGroups.general = subjectGroups.general.filter(s => assignedSet.has(s));
            subjectGroups.groupBased = subjectGroups.groupBased.filter(s => assignedSet.has(s));
            subjectGroups.optional = subjectGroups.optional.filter(s => assignedSet.has(s));
        }

        const exams = await getSavedExams();

        // Function to check submission status and return tick icon
        const getTick = (subjectName) => {
            const relevantExams = exams.filter(e =>
                e.class === selClass &&
                e.session === selSession &&
                e.subject === subjectName
            );

            if (relevantExams.length === 0) return '';

            // Check if all students in the class/session have marks for this subject
            const isFullySubmitted = relevantExams.every(e => {
                const data = e.studentData || [];
                return data.length > 0 && data.every(s =>
                    (s.written !== null && s.written !== '') ||
                    (s.mcq !== null && s.mcq !== '') ||
                    (s.practical !== null && s.practical !== '')
                );
            });

            if (isFullySubmitted) return ' [✔]'; // Will be contextually understood as green/complete
            
            // Check if ANY data exists
            const hasAnyData = relevantExams.some(e =>
                (e.studentData || []).some(s =>
                    (s.written !== null && s.written !== '') ||
                    (s.mcq !== null && s.mcq !== '') ||
                    (s.practical !== null && s.practical !== '')
                )
            );

            if (hasAnyData) return ' [✔]'; // Will be contextually understood as yellow/partial
            return '';
        };

        if (subjectSelect) {
            let subOptions = '<option value="">বিষয় নির্বাচন</option>';

            const renderSubGroup = (label, subs) => {
                if (!subs || subs.length === 0) return '';
                let html = `<optgroup label="${label}">`;
                subs.forEach(s => {
                    const relevantExams = exams.filter(e => e.class === selClass && e.session === selSession && e.subject === s);
                    const isFull = isSubjectFullySubmitted(exams, selClass, selSession, s);
                    const hasData = relevantExamsHasSubjectData(exams, selClass, selSession, s);
                    
                    let tick = '';
                    let color = '';
                    if (isFull) {
                        tick = ' [✔]';
                        color = 'green';
                    } else if (hasData) {
                        tick = ' [✔]';
                        color = '#b45309'; // Dark yellow/Amber
                    }
                    
                    html += `<option value="${s}" style="color: ${color}">${s}${tick}</option>`;
                });
                html += `</optgroup>`;
                return html;
            };

            subOptions += renderSubGroup('সাধারণ বিষয় (General Subjects)', subjectGroups.general);
            subOptions += renderSubGroup('গ্রুপ ভিত্তিক বিষয় (Group Subjects)', subjectGroups.groupBased);
            subOptions += renderSubGroup('ঐচ্ছিক বিষয় (Optional Subjects)', subjectGroups.optional);

            subjectSelect.innerHTML = subOptions;
        }

        // --- Exam Names from Global Exam Configs ---
        const updateExamList = async () => {
            const examSelect = document.getElementById('reExam');
            if (!examSelect) return;

            if (!selClass || !selSession) {
                examSelect.innerHTML = '<option value="">শ্রেণি ও সেশন নির্বাচন করুন</option>';
                return;
            }

            examSelect.innerHTML = '<option value="">লোড হচ্ছে...</option>';
            const configs = await getExamConfigs(selClass, selSession);
            const examNames = configs.map(c => c.examName);

            if (examNames.length === 0) {
                examSelect.innerHTML = '<option value="">কোনো পরীক্ষা তৈরি করা নেই</option>';
            } else {
                examSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন করুন</option>';
                examNames.forEach(name => {
                    examSelect.innerHTML += `<option value="${name}">${name}</option>`;
                });
            }
        };

        updateExamList();
    };

    if (classSelect) classSelect.addEventListener('change', updateSubjectAndExam);
    if (sessionSelect) sessionSelect.addEventListener('change', updateSubjectAndExam);
    if (groupSelect) groupSelect.addEventListener('change', updateSubjectAndExam);

    // Auto-trigger cascading dropdowns if class/session are pre-selected
    if (classSelect?.value || sessionSelect?.value) {
        updateSubjectAndExam();
    }
}

/**
 * Helper to check if a subject has ANY data saved
 */
function relevantExamsHasSubjectData(exams, cls, session, subject) {
    return exams.some(e =>
        e.class === cls &&
        e.session === session &&
        e.subject === subject &&
        (e.studentData || []).some(s => (s.written !== null && s.written !== '') || (s.mcq !== null && s.mcq !== '') || (s.practical !== null && s.practical !== ''))
    );
}

/**
 * Helper to check if a subject is FULLY submitted (all students have marks)
 */
function isSubjectFullySubmitted(exams, cls, session, subject) {
    const relevant = exams.filter(e => e.class === cls && e.session === session && e.subject === subject);
    if (relevant.length === 0) return false;
    return relevant.every(e => {
        const data = e.studentData || [];
        return data.length > 0 && data.every(s =>
            (s.written !== null && s.written !== '') ||
            (s.mcq !== null && s.mcq !== '') ||
            (s.practical !== null && s.practical !== '')
        );
    });
}

/**
 * Get categorized subjects for a class and group (Matching routineManager logic)
 */
async function getREGroupSubjects(cls, group) {
    let subjectGroups = { general: [], groupBased: [], optional: [] };
    try {
        const allRules = await loadMarksheetRules();
        const rules = allRules[cls] || allRules['All'] || {};
        subjectGroups.general = rules.generalSubjects || [];
        const groupSubsMapping = rules.groupSubjects || {};
        const optionalSubsMapping = rules.optionalSubjects || {};

        if (group === 'all') {
            Object.values(groupSubsMapping).forEach(subs => subjectGroups.groupBased.push(...subs));
            Object.values(optionalSubsMapping).forEach(subs => subjectGroups.optional.push(...subs));
        } else {
            const matchGroup = (mapping) => {
                const keys = Object.keys(mapping);
                const gValue = group.trim().toLowerCase();
                
                // 1. Exact match (case-insensitive)
                let foundKey = keys.find(k => k.trim().toLowerCase() === gValue);
                if (foundKey) return mapping[foundKey];

                // 2. Partial/Sub-string match
                foundKey = keys.find(k => gValue.includes(k.toLowerCase()) || k.toLowerCase().includes(gValue));
                if (foundKey) return mapping[foundKey];

                // 3. Translation/Variation match
                const GROUP_TRANSLATIONS = {
                    'science': ['বিজ্ঞান', 'science', 'sci', 'sc.'],
                    'humanities': ['মানবিক', 'humanities', 'arts', 'hum', 'arts group'],
                    'business': ['ব্যবসায়', 'ব্যবসায়', 'ব্যবসা', 'ব্যবসায় শিক্ষা', 'ব্যবসায় শিক্ষা', 'business', 'commerce', 'com', 'bus'],
                    'arts': ['মানবিক', 'arts', 'humanities']
                };

                for (const [eng, bns] of Object.entries(GROUP_TRANSLATIONS)) {
                    if (bns.some(b => gValue.includes(b)) || gValue.includes(eng)) {
                        foundKey = keys.find(k => {
                            const kLow = k.toLowerCase();
                            return kLow.includes(eng) || bns.some(b => kLow.includes(b));
                        });
                        if (foundKey) return mapping[foundKey];
                    }
                }
                return [];
            };
            subjectGroups.groupBased = matchGroup(groupSubsMapping);
            subjectGroups.optional = matchGroup(optionalSubsMapping);
            const generalOptKey = Object.keys(optionalSubsMapping).find(k => k.toLowerCase().includes('general') || k.includes('সাধারণ'));
            if (generalOptKey && group !== generalOptKey) {
                subjectGroups.optional = [...new Set([...subjectGroups.optional, ...(optionalSubsMapping[generalOptKey] || [])])];
            }
        }
    } catch (e) {
        console.error("Error fetching rules for subjects:", e);
    }
    const bnSort = (a, b) => a.localeCompare(b, 'bn');
    subjectGroups.general = [...new Set(subjectGroups.general.filter(Boolean))].sort(bnSort);
    subjectGroups.groupBased = [...new Set(subjectGroups.groupBased.filter(Boolean))].sort(bnSort);
    subjectGroups.optional = [...new Set(subjectGroups.optional.filter(Boolean))].sort(bnSort);
    return subjectGroups;
}


// ==========================================
// LOAD EXAM FOR ENTRY
// ==========================================

/**
 * Load exam data into the result entry table.
 * If the exam does not exist, create a new one from the students collection.
 */
async function loadExamForEntry() {
    const cls = document.getElementById('reClass')?.value;
    const session = document.getElementById('reSession')?.value;
    const group = document.getElementById('reGroup')?.value || 'all';
    const subject = document.getElementById('reSubject')?.value;
    const examName = document.getElementById('reExam')?.value?.trim();

    if (!cls || !session || !subject || !examName) {
        showNotification('সব ফিল্ড পূরণ করুন', 'error');
        return;
    }
    
    // Authorization check for teachers
    if (state.userRole === 'teacher' && !state.isAdmin && !state.isSuperAdmin) {
        const uid = state.currentUser?.uid;
        const authorized = await isTeacherAuthorized(uid, cls, session, subject);
        if (!authorized) {
            showNotification('আপনার এই বিষয়ে মার্কস এন্ট্রি করার অনুমতি নেই', 'error');
            return;
        }
    }

    const normCls = normalizeText(cls);
    const normSession = normalizeSession(session);
    const normGroup = group !== 'all' ? normalizeText(group) : 'all';

    const exams = await getSavedExams();
    let exam = exams.find(e => {
        const eCls = normalizeText(e.class || '');
        const eSess = normalizeSession(e.session || '');
        const eGroup = normalizeText(e.group || '');
        
        const classMatch = eCls === normCls;
        const sessionMatch = eSess === normSession;
        const groupMatch = normGroup === 'all' || eGroup === normGroup || 
                          (eGroup.includes(normGroup)) || (normGroup.includes(eGroup));

        return classMatch && sessionMatch && 
               e.subject === subject &&
               e.name === examName &&
               groupMatch;
    });

    if (exam) {
        // --- EXISTING EXAM ---
        isNewExam = false;
        currentExamDoc = exam;

        // Recalculate all statuses using current subject config
        recalculateStudentStatuses(currentExamDoc.studentData || [], exam.subject);

        // --- AUTOMATIC SORTING ---
        sortStudentsByGroupAndRoll(currentExamDoc.studentData || []);

        originalStudentData = JSON.parse(JSON.stringify(currentExamDoc.studentData || []));
        hasUnsavedChanges = false;

        showExamInfo(exam, (currentExamDoc.studentData || []).length);
        const config = getSubjectConfig(exam.subject);
        renderRETable(currentExamDoc.studentData || [], config);
    } else {
        // --- NEW EXAM: Fetch students for this class/session ---
        isNewExam = true;
        showNotification(`"${examName}" পরীক্ষা পাওয়া যায়নি। নতুন পরীক্ষা হিসেবে শিক্ষার্থীদের তালিকা লোড হচ্ছে...`, 'info');

        // Use getUnifiedStudents instead of getAllStudents to discover students from all exams & collection
        const allStudents = await getUnifiedStudents();
        const normCls = normalizeText(cls);
        const normSession = normalizeSession(session);
        const normGroup = group !== 'all' ? normalizeText(group) : 'all';

        const filteredStudents = allStudents.filter(s => {
            const sCls = normalizeText(s.class || '');
            const sSess = normalizeSession(s.session || '');
            const sGroup = normalizeText(s.group || '');

            const classMatch = sCls === normCls;
            const sessionMatch = sSess === normSession;
            
            // Check for group match: exact find or keywords
            const groupMatch = normGroup === 'all' || sGroup === normGroup || 
                             (sGroup.includes(normGroup)) || (normGroup.includes(sGroup));

            return classMatch && sessionMatch && groupMatch;
        });

        if (filteredStudents.length === 0) {
            showNotification(`${cls} শ্রেণি, ${session} সেশনে কোনো শিক্ষার্থী পাওয়া যায়নি। আগে শিক্ষার্থী যোগ করুন।`, 'warning');
            return;
        }

        // Build empty student data for this exam
        let studentData = filteredStudents.map(s => ({
            id: s.id,
            name: s.name || '',
            group: s.group || '',
            class: s.class || cls,
            session: s.session || session,
            written: null,
            mcq: null,
            practical: null,
            total: 0,
            grade: '',
            status: 'অনুপস্থিত'
        }));

        // Check if there's a draft in local storage
        const draft = loadDraft(cls, session, subject, examName);
        if (draft && draft.length > 0) {
            // Merge draft marks into student data — use unique key, not just roll ID
            studentData = studentData.map(s => {
                const key = `${s.id}_${(s.class || '').replace(/\s+/g, '_')}_${(s.name || '').replace(/\s+/g, '_')}_${(s.group || '').replace(/\s+/g, '_')}_${(s.session || '').replace(/\s+/g, '_')}`;
                const draftStudent = draft.find(d => {
                    const dKey = `${d.id}_${(d.class || '').replace(/\s+/g, '_')}_${(d.name || '').replace(/\s+/g, '_')}_${(d.group || '').replace(/\s+/g, '_')}_${(d.session || '').replace(/\s+/g, '_')}`;
                    return dKey === key;
                });
                return draftStudent ? { ...s, ...draftStudent } : s;
            });
            showNotification('পূর্বে সংরক্ষিত ড্রাফট পুনরায় লোড করা হয়েছে', 'info');
        }

        // Create a virtual exam doc for in-memory manipulation
        currentExamDoc = {
            name: examName,
            subject: subject,
            class: cls,
            session: session,
            studentData: studentData,
            studentCount: studentData.length,
            date: new Date().toLocaleDateString('bn-BD')
        };

        // --- AUTOMATIC SORTING ---
        sortStudentsByGroupAndRoll(currentExamDoc.studentData);

        originalStudentData = JSON.parse(JSON.stringify(currentExamDoc.studentData));
        hasUnsavedChanges = false;

        showExamInfo(currentExamDoc, currentExamDoc.studentData.length, true);
        const config = getSubjectConfig(subject);
        renderRETable(currentExamDoc.studentData, config);
    }

    // Show table, hide empty state
    document.getElementById('resultEntryTableWrapper').style.display = 'block';
    document.getElementById('reEmptyState').style.display = 'none';
    document.getElementById('reUnsavedBanner').style.display = 'none';
}

/**
 * Show exam info bar
 */
function showExamInfo(exam, count, isNew = false) {
    const infoEl = document.getElementById('reExamInfo');
    if (infoEl) {
        infoEl.innerHTML = `
            ${isNew ? '<span style="background: rgba(234, 179, 8, 0.15); color: #b45309; padding: 2px 10px; border-radius: 6px; font-weight: 700; font-size: 0.85em;"><i class="fas fa-plus-circle"></i> নতুন পরীক্ষা</span>' : ''}
            <span><i class="fas fa-book"></i> ${exam.subject}</span>
            <span><i class="fas fa-file-alt"></i> ${exam.name}</span>
            <span><i class="fas fa-school"></i> ${exam.class} | ${exam.session}</span>
            <span><i class="fas fa-users"></i> ${count} জন শিক্ষার্থী</span>
        `;
    }
}

/**
 * Get subject config helper
 */
function getSubjectConfig(subjectName) {
    const found = state.subjectConfigs?.[subjectName];
    if (found) {
        console.log(`[RE Config] ✅ Found config for "${subjectName}":`, JSON.stringify(found));
        return found;
    }
    console.warn(`[RE Config] ⚠️ No config found for "${subjectName}". Available keys:`, Object.keys(state.subjectConfigs || {}));
    return {
        total: 100, written: 100, writtenPass: 33, mcq: 0, mcqPass: 0, practical: 0, practicalPass: 0
    };
}

/**
 * Safe config number parser: handles "", null, undefined, NaN → 0
 */
function cfgNum(val) {
    if (val === '' || val === null || val === undefined) return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
}

/**
 * Sort students by group priority and then by roll number
 * @param {Array} studentData - Array of student mark objects
 */
function sortStudentsByGroupAndRoll(studentData) {
    if (!studentData || !Array.isArray(studentData)) return;

    const groupPriority = {
        'science': 1, 'বিজ্ঞান': 1,
        'business': 2, 'ব্যবসায়': 2, 'ব্যবসায়': 2, 'commerce': 2, 'ব্যবসায় শিক্ষা': 2,
        'humanities': 3, 'মানবিক': 3, 'arts': 3,
        'general': 4, 'সাধারণ': 4
    };

    const getGroupScore = (g) => {
        if (!g) return 99;
        const norm = g.trim().toLowerCase();
        for (const [key, score] of Object.entries(groupPriority)) {
            if (norm.includes(key)) return score;
        }
        return 90;
    };

    studentData.sort((a, b) => {
        const scoreA = getGroupScore(a.group);
        const scoreB = getGroupScore(b.group);
        if (scoreA !== scoreB) return scoreA - scoreB;
        
        const rollA = parseInt(convertToEnglishDigits(String(a.id))) || 0;
        const rollB = parseInt(convertToEnglishDigits(String(b.id))) || 0;
        if (rollA !== rollB) return rollA - rollB;
        
        return (a.name || '').localeCompare(b.name || '', 'bn');
    });
}

/**
 * Recalculate grade/status for ALL students based on current subject config.
 * Called when loading an exam to fix stale saved statuses.
 */
function recalculateStudentStatuses(studentData, subjectName) {
    const config = getSubjectConfig(subjectName);
    const writtenPass = cfgNum(config.writtenPass);
    const mcqPass = cfgNum(config.mcqPass);
    const practicalPass = cfgNum(config.practicalPass);

    studentData.forEach(s => {
        const written = cfgNum(s.written);
        const mcq = cfgNum(s.mcq);
        const practical = cfgNum(s.practical);
        const total = written + mcq + practical;

        const allBlank = (s.written === null || s.written === '' || s.written === undefined) &&
            (s.mcq === null || s.mcq === '' || s.mcq === undefined) &&
            (s.practical === null || s.practical === '' || s.practical === undefined);

        let status = 'পাস';
        if (allBlank) {
            status = 'অনুপস্থিত';
        } else {
            let failed = false;
            if (writtenPass > 0 && s.written !== null && s.written !== '' && s.written !== undefined && written < writtenPass) failed = true;
            if (mcqPass > 0 && s.mcq !== null && s.mcq !== '' && s.mcq !== undefined && mcq < mcqPass) failed = true;
            if (practicalPass > 0 && s.practical !== null && s.practical !== '' && s.practical !== undefined && practical < practicalPass) failed = true;
            if (failed) status = 'ফেল';
        }

        s.total = total;
        s.grade = calculateGrade(total);
        s.status = status;
    });

    return studentData;
}


// ==========================================
// RENDER TABLE
// ==========================================

/**
 * Render the result entry table
 */
function renderRETable(students, config) {
    const tbody = document.getElementById('reTableBody');
    if (!tbody) return;

    // Apply strict sorting before rendering
    const sorted = [...students];
    sortStudentsByGroupAndRoll(sorted);

    tbody.innerHTML = sorted.map((s, i) => {
        const written = s.written != null ? s.written : '';
        const mcq = s.mcq != null ? s.mcq : '';
        const practical = s.practical != null ? s.practical : '';
        const total = s.total != null ? s.total : '';
        const grade = s.grade || '';
        const status = s.status || '';
        const isFail = status === 'ফেল' || status === 'fail';
        const isAbsent = status === 'অনুপস্থিত' || status === 'absent';

        const writtenMax = cfgNum(config.written) || 50;
        const mcqMax = cfgNum(config.mcq);
        const practicalMax = cfgNum(config.practical);

        // Group Highlighting Class
        let groupClass = '';
        const normGroup = (s.group || '').toLowerCase();
        if (normGroup.includes('বিজ্ঞান') || normGroup.includes('science')) groupClass = 're-row-science';
        else if (normGroup.includes('ব্যবসায়') || normGroup.includes('ব্যবসায়') || normGroup.includes('business') || normGroup.includes('commerce')) groupClass = 're-row-business';
        else if (normGroup.includes('মানবিক') || normGroup.includes('humanities') || normGroup.includes('arts')) groupClass = 're-row-humanities';

        // Generate a unique key: roll + class + name + group + session
        const uniqueKey = `${s.id}_${(s.class || '').replace(/\s+/g, '_')}_${(s.name || '').replace(/\s+/g, '_')}_${(s.group || '').replace(/\s+/g, '_')}_${(s.session || '').replace(/\s+/g, '_')}`;

        return `
            <tr data-student-key="${uniqueKey}" class="${groupClass} ${isFail ? 'row-fail' : ''} ${isAbsent ? 'row-absent' : ''}">
                <td><strong>${s.id}</strong></td>
                <td>${s.name || '-'}</td>
                <td>${s.group || '-'}</td>
                <td>
                    <input type="number" class="re-mark-input" data-field="written"
                        value="${written}" min="0" max="${writtenMax}" step="0.5"
                        placeholder="${writtenMax > 0 ? '/' + writtenMax : '-'}"
                        ${writtenMax === 0 ? 'disabled' : ''}>
                </td>
                <td>
                    <input type="number" class="re-mark-input" data-field="mcq"
                        value="${mcqMax === 0 ? '' : mcq}" min="0" max="${mcqMax}" step="0.5"
                        placeholder="${mcqMax > 0 ? '/' + mcqMax : '-'}"
                        ${mcqMax === 0 ? 'disabled' : ''}>
                </td>
                <td>
                    <input type="number" class="re-mark-input" data-field="practical"
                        value="${practicalMax === 0 ? '' : practical}" min="0" max="${practicalMax}" step="0.5"
                        placeholder="${practicalMax > 0 ? '/' + practicalMax : '-'}"
                        ${practicalMax === 0 ? 'disabled' : ''}>
                </td>
                <td class="total-cell">${total}</td>
                <td><span class="grade-badge">${grade}</span></td>
                <td><span class="status-badge ${isFail ? 'fail' : isAbsent ? 'absent' : 'pass'}">${status || 'পাস'}</span></td>
            </tr>
        `;
    }).join('');

    // Mark input change handlers with max enforcement
    tbody.querySelectorAll('.re-mark-input').forEach(input => {
        input.addEventListener('input', () => {
            // --- MAX ENFORCEMENT: clamp value to max ---
            const max = parseFloat(input.getAttribute('max'));
            if (max > 0 && input.value !== '' && parseFloat(input.value) > max) {
                input.value = max;
                input.classList.add('mark-over');
                setTimeout(() => input.classList.remove('mark-over'), 400);
            }
            onMarkChanged(input);
        });

        // Apply initial highlight based on current values
        applyInputHighlight(input);
    });
}

/**
 * Apply real-time visual highlight to a single mark input
 */
function applyInputHighlight(input) {
    if (!input || input.disabled) return;

    const config = getSubjectConfig(currentExamDoc?.subject);
    const field = input.dataset.field;
    const value = parseFloat(input.value);
    const hasValue = input.value !== '' && !isNaN(value);

    let passmark = 0;
    if (field === 'written') passmark = cfgNum(config.writtenPass);
    else if (field === 'mcq') passmark = cfgNum(config.mcqPass);
    else if (field === 'practical') passmark = cfgNum(config.practicalPass);

    // Clear all states first
    input.classList.remove('mark-fail', 'mark-pass', 'mark-over');

    if (!hasValue) return; // No value = no highlight

    if (passmark > 0) {
        // Has a pass threshold — red or green
        if (value < passmark) {
            input.classList.add('mark-fail');
        } else {
            input.classList.add('mark-pass');
        }
    } else if (hasValue) {
        // No pass threshold but has a value — subtle green
        input.classList.add('mark-pass');
    }
}


// ==========================================
// MARK CHANGE HANDLER
// ==========================================

/**
 * Handle mark input change
 */
function onMarkChanged(input) {
    hasUnsavedChanges = true;
    document.getElementById('reUnsavedBanner').style.display = 'flex';

    const row = input.closest('tr');
    const studentKey = row.dataset.studentKey;

    // Get all marks in this row
    const writtenInput = row.querySelector('[data-field="written"]');
    const mcqInput = row.querySelector('[data-field="mcq"]');
    const practicalInput = row.querySelector('[data-field="practical"]');

    const written = parseFloat(writtenInput?.value) || 0;
    const mcq = parseFloat(mcqInput?.value) || 0;
    const practical = parseFloat(practicalInput?.value) || 0;
    const total = written + mcq + practical;

    // Calculate grade based on total vs config total
    const config = getSubjectConfig(currentExamDoc?.subject);
    const grade = calculateGrade(total);

    // --- Subject Configuration Priority System ---
    // Use cfgNum() to safely parse config values (handles "", null, undefined, NaN)
    const writtenPass = cfgNum(config.writtenPass);
    const mcqPass = cfgNum(config.mcqPass);
    const practicalPass = cfgNum(config.practicalPass);
    const writtenMax = cfgNum(config.written);
    const mcqMax = cfgNum(config.mcq);
    const practicalMax = cfgNum(config.practical);

    // Determine pass/fail:
    // Rule 1: ALL blank = অনুপস্থিত
    // Rule 2: Only check pass for components where (passmark > 0) AND (user entered a value)
    let status = 'পাস';
    const writtenHasValue = writtenInput?.value !== '' && writtenInput?.value != null && !writtenInput?.disabled;
    const mcqHasValue = mcqInput?.value !== '' && mcqInput?.value != null && !mcqInput?.disabled;
    const practicalHasValue = practicalInput?.value !== '' && practicalInput?.value != null && !practicalInput?.disabled;
    const allAbsent = !writtenHasValue && !mcqHasValue && !practicalHasValue;

    if (allAbsent) {
        status = 'অনুপস্থিত';
    } else {
        let failed = false;
        // Check Written: only if pass mark > 0 AND user entered a written value
        if (writtenPass > 0 && writtenHasValue && written < writtenPass) {
            failed = true;
        }
        // Check MCQ: only if pass mark > 0 AND user entered a mcq value
        if (mcqPass > 0 && mcqHasValue && mcq < mcqPass) {
            failed = true;
        }
        // Check Practical: only if pass mark > 0 AND user entered a practical value
        if (practicalPass > 0 && practicalHasValue && practical < practicalPass) {
            failed = true;
        }
        if (failed) status = 'ফেল';

        // DEBUG LOG — remove after fix is confirmed
        console.log(`[RE PassFail] Student=${studentKey} | W=${written}(pass=${writtenPass},has=${writtenHasValue}) | M=${mcq}(pass=${mcqPass},has=${mcqHasValue}) | P=${practical}(pass=${practicalPass},has=${practicalHasValue}) | Result=${status}`);
    }

    // Update display
    const totalCell = row.querySelector('.total-cell');
    if (totalCell) totalCell.textContent = total;

    const gradeBadge = row.querySelector('.grade-badge');
    if (gradeBadge) gradeBadge.textContent = grade;

    const statusBadge = row.querySelector('.status-badge');
    if (statusBadge) {
        statusBadge.textContent = status;
        statusBadge.className = `status-badge ${status === 'ফেল' ? 'fail' : status === 'অনুপস্থিত' ? 'absent' : 'pass'}`;
    }

    // Highlight inputs — real-time red/green based on config pass marks
    [writtenInput, mcqInput, practicalInput].forEach(inp => applyInputHighlight(inp));

    // Update in memory — find by unique key (roll + class + name + group + session)
    if (currentExamDoc?.studentData) {
        const student = currentExamDoc.studentData.find(s => {
            const key = `${s.id}_${(s.class || '').replace(/\s+/g, '_')}_${(s.name || '').replace(/\s+/g, '_')}_${(s.group || '').replace(/\s+/g, '_')}_${(s.session || '').replace(/\s+/g, '_')}`;
            return key === studentKey;
        });
        if (student) {
            student.written = writtenInput?.value !== '' ? written : null;
            student.mcq = mcqInput?.value !== '' ? mcq : null;
            student.practical = practicalInput?.value !== '' ? practical : null;
            student.total = total;
            student.grade = grade;
            student.status = status;
        }
    }

    row.classList.toggle('row-fail', status === 'ফেল');
    row.classList.toggle('row-absent', status === 'অনুপস্থিত');

    // --- AUTO-SAVE DRAFT TO LOCAL STORAGE ---
    if (currentExamDoc) {
        saveDraft(
            currentExamDoc.class,
            currentExamDoc.session,
            currentExamDoc.subject,
            currentExamDoc.name,
            currentExamDoc.studentData
        );
    }
}


// ==========================================
// SAVE / DISCARD
// ==========================================

/**
 * Save modified marks to Firestore
 */
async function saveMarks() {
    if (!currentExamDoc) return;

    // Authorization check for teachers
    if (state.userRole === 'teacher' && !state.isAdmin && !state.isSuperAdmin) {
        const uid = state.currentUser?.uid;
        const authorized = await isTeacherAuthorized(
            uid,
            currentExamDoc.class,
            currentExamDoc.session,
            currentExamDoc.subject
        );
        if (!authorized) {
            showNotification('আপনার এই বিষয়ে মার্কস সেভ করার অনুমতি নেই', 'error');
            return;
        }
    }

    try {
        if (isNewExam) {
            // --- CREATE NEW EXAM ---
            const examData = {
                name: currentExamDoc.name,
                subject: currentExamDoc.subject,
                class: currentExamDoc.class,
                session: currentExamDoc.session,
                group: document.getElementById('reGroup')?.value || 'all',
                date: new Date().toLocaleDateString('bn-BD'),
                studentData: currentExamDoc.studentData,
                studentCount: currentExamDoc.studentData.length,
                createdBy: state.currentUser?.uid || null,
                creatorName: state.currentUser?.displayName || state.currentUser?.email || null
            };

            const success = await saveExam(examData);
            if (success) {
                showNotification('নতুন পরীক্ষা সফলভাবে তৈরি ও সংরক্ষণ হয়েছে! ✅');
                isNewExam = false;
                hasUnsavedChanges = false;
                document.getElementById('reUnsavedBanner').style.display = 'none';
                originalStudentData = JSON.parse(JSON.stringify(currentExamDoc.studentData));

                // Clear draft
                clearDraft(currentExamDoc.class, currentExamDoc.session, currentExamDoc.subject, currentExamDoc.name);

                // Refresh the exam in memory to get the docId
                const freshExams = await getSavedExams();
                const newDoc = freshExams.find(e =>
                    e.name === currentExamDoc.name &&
                    e.subject === currentExamDoc.subject &&
                    e.class === currentExamDoc.class &&
                    e.session === currentExamDoc.session
                );
                if (newDoc) {
                    currentExamDoc = newDoc;
                }

                // Update info bar
                showExamInfo(currentExamDoc, currentExamDoc.studentData.length, false);

                // Notify dashboard to refresh exam cards
                window.dispatchEvent(new CustomEvent('examDataUpdated'));
            } else {
                showNotification('পরীক্ষা তৈরি করতে সমস্যা হয়েছে', 'error');
            }
        } else {
            // Recalculate stats before saving
            const config = getSubjectConfig(currentExamDoc.subject);
            const statsOptions = {
                writtenPass: (config.writtenPass !== undefined && config.writtenPass !== '') ? Number(config.writtenPass) : undefined,
                mcqPass: (config.mcqPass !== undefined && config.mcqPass !== '') ? Number(config.mcqPass) : undefined,
                practicalPass: (config.practicalPass !== undefined && config.practicalPass !== '') ? Number(config.practicalPass) : 0,
            };
            const stats = calculateStatistics(currentExamDoc.studentData, statsOptions);

            const success = await updateExam(currentExamDoc.docId, {
                studentData: currentExamDoc.studentData,
                studentCount: currentExamDoc.studentData.length,
                stats: stats
            });

            if (success) {
                showNotification('মার্কস সফলভাবে সংরক্ষণ হয়েছে! ✅');
                hasUnsavedChanges = false;
                document.getElementById('reUnsavedBanner').style.display = 'none';
                originalStudentData = JSON.parse(JSON.stringify(currentExamDoc.studentData));

                // Clear draft
                clearDraft(currentExamDoc.class, currentExamDoc.session, currentExamDoc.subject, currentExamDoc.name);

                // Notify dashboard to refresh exam cards
                window.dispatchEvent(new CustomEvent('examDataUpdated'));
            } else {
                showNotification('মার্কস সংরক্ষণ করতে সমস্যা হয়েছে', 'error');
            }
        }
    } catch (error) {
        console.error('Save marks error:', error);
        showNotification('মার্কস সংরক্ষণ করতে সমস্যা হয়েছে', 'error');
    }
}

/**
 * Discard changes, restore original data
 */
function discardChanges() {
    if (!currentExamDoc || !originalStudentData) return;
    currentExamDoc.studentData = JSON.parse(JSON.stringify(originalStudentData));
    hasUnsavedChanges = false;
    document.getElementById('reUnsavedBanner').style.display = 'none';

    const config = getSubjectConfig(currentExamDoc.subject);
    renderRETable(currentExamDoc.studentData, config);
    showNotification('পরিবর্তন বাতিল করা হয়েছে');

    // Clear draft on discard
    clearDraft(currentExamDoc.class, currentExamDoc.session, currentExamDoc.subject, currentExamDoc.name);
}


// ==========================================
// GRADE CALCULATOR
// ==========================================

/**
 * Calculate grade from total marks — Bangladesh HSC Standard
 * Always based on raw marks (out of 100 scale)
 * @param {number} total - Total obtained marks
 */
function calculateGrade(total) {
    if (total >= 80) return 'A+';
    if (total >= 70) return 'A';
    if (total >= 60) return 'A-';
    if (total >= 50) return 'B';
    if (total >= 40) return 'C';
    if (total >= 33) return 'D';
    return 'F';
}


// ==========================================
// INITIALIZATION
// ==========================================

/**
 * Initialize Result Entry Manager
 */
export async function initResultEntryManager() {
    // Load button
    const loadBtn = document.getElementById('reLoadBtn');
    if (loadBtn) {
        loadBtn.addEventListener('click', loadExamForEntry);
    }

    // Save button
    const saveBtn = document.getElementById('reSaveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveMarks);
    }

    // Discard button
    const discardBtn = document.getElementById('reDiscardBtn');
    if (discardBtn) {
        discardBtn.addEventListener('click', discardChanges);
    }

    await populateREDropdowns();
}
