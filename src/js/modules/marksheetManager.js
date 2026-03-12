/**
 * Marksheet Manager Module
 * Generates professional Bangladeshi HSC-style marksheets 
 * @module marksheetManager
 */

import { getSavedExams, getExamConfigs } from '../firestoreService.js';
import { state } from './state.js';
import { currentMarksheetRules } from './marksheetRulesManager.js';
import { showNotification, convertToEnglishDigits, determineStatus, normalizeText } from '../utils.js';

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
    signatures: [
        { label: 'শ্রেণি শিক্ষক', url: '' },
        { label: 'পরীক্ষা কমিটি', url: '' },
        { label: 'অধ্যক্ষ', url: '' }
    ]
};

/**
 * Load marksheet settings from Firestore
 */
async function loadMarksheetSettings() {
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
    const exams = await getSavedExams(true);

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
                exam.studentData.forEach(s => {
                    const sGroup = s.group || '';
                    if (msGroup !== 'all' && sGroup !== msGroup) return;

                    const key = `${s.id}_${sGroup}`;
                    if (!studentMap.has(key)) {
                        studentMap.set(key, { id: s.id, name: s.name, group: sGroup });
                    }
                });
            }
        });
        const studentSelect = document.getElementById('msStudent');
        if (studentSelect) {
            studentSelect.innerHTML = '<option value="all">সকল শিক্ষার্থী</option>';
            [...studentMap.values()].sort((a, b) => {
                const groupA = a.group.toLowerCase();
                const groupB = b.group.toLowerCase();
                if (groupA < groupB) return -1;
                if (groupA > groupB) return 1;

                return (parseInt(convertToEnglishDigits(String(a.id))) || 0) - (parseInt(convertToEnglishDigits(String(b.id))) || 0);
            }).forEach(s => {
                studentSelect.innerHTML += `<option value="${s.id}_${s.group}">${s.id} - ${s.name}</option>`;
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

    // Ensure latest rules are loaded from database before generation
    const { loadMarksheetRules } = await import('./marksheetRulesManager.js');
    await loadMarksheetRules();

    // Ensure latest subject configs are available
    const { getSubjectConfigs } = await import('../firestoreService.js');
    state.subjectConfigs = await getSubjectConfigs();

    const allExams = await getSavedExams(true);
    let relevantExams = allExams.filter(e => e.class === cls && e.session === session);

    if (examName && examName !== '__all__') {
        relevantExams = relevantExams.filter(e => e.name === examName);
    }

    if (relevantExams.length === 0) {
        showNotification('নির্বাচিত তথ্য অনুযায়ী কোনো পরীক্ষা পাওয়া যায়নি', 'error');
        return;
    }

    const subjectsSet = new Set(relevantExams.map(e => e.subject).filter(Boolean));
    const subjects = [...subjectsSet];

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
                    studentAgg.set(key, {
                        id: s.id,
                        name: s.name,
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

    const examDisplayName = examName === '__all__' ? 'সমন্বিত ফলাফল' : (examName || 'পরীক্ষা');
    const modeOverride = document.getElementById('msPrintMode')?.value || 'default';

    const previewArea = document.getElementById('marksheetPreview');
    previewArea.innerHTML = studentsArray.map(student =>
        renderSingleMarksheet(student, subjects, examDisplayName, session, null, modeOverride)
    ).join('');

    // Show bulk print button
    const bulkBtn = document.getElementById('msPrintAllBtn');
    if (bulkBtn) bulkBtn.style.display = 'inline-flex';

    showNotification(`${studentsArray.length} জন শিক্ষার্থীর মার্কশীট তৈরি হয়েছে ✅`);

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
}

/**
 * Render a single student's marksheet (Bangladeshi HSC professional style)
 */
function renderSingleMarksheet(student, subjects, examDisplayName, selectedSession, customSettings = null, modeOverride = null) {
    const ms = customSettings || marksheetSettings;
    const allRules = currentMarksheetRules || {};
    const studentClass = student.class || 'HSC';

    // Get Global Rules and Class-Specific Rules
    const globalRules = allRules['All'] || { mode: 'single', combinedSubjects: [], optionalSubjects: {} };
    const classRules = allRules[studentClass] || { mode: 'single', combinedSubjects: [], optionalSubjects: {} };

    // Merge Rules: Class-specific takes precedence
    let baseMode = globalRules.mode || 'single';
    if (allRules[studentClass] && allRules[studentClass].mode) {
        baseMode = allRules[studentClass].mode;
    }

    if (modeOverride && modeOverride !== 'default') {
        baseMode = modeOverride;
    }

    const rules = {
        mode: baseMode,
        combinedSubjects: [...(globalRules.combinedSubjects || [])],
        optionalSubjects: JSON.parse(JSON.stringify(globalRules.optionalSubjects || {})),
        generalSubjects: [...(globalRules.generalSubjects || [])],
        groupSubjects: JSON.parse(JSON.stringify(globalRules.groupSubjects || {}))
    };

    // Merge Combined Subjects (avoid duplicates by combinedName)
    if (classRules.combinedSubjects && classRules.combinedSubjects.length > 0) {
        classRules.combinedSubjects.forEach(c => {
            const existingIdx = rules.combinedSubjects.findIndex(r => r.combinedName === c.combinedName);
            if (existingIdx > -1) {
                rules.combinedSubjects[existingIdx] = c;
            } else {
                rules.combinedSubjects.push(c);
            }
        });
    }

    // Merge General Subjects (unique list)
    if (classRules.generalSubjects && classRules.generalSubjects.length > 0) {
        rules.generalSubjects = [...new Set([...rules.generalSubjects, ...classRules.generalSubjects])];
    }

    // Merge Group Subjects (by group)
    if (classRules.groupSubjects) {
        for (const [group, subs] of Object.entries(classRules.groupSubjects)) {
            if (!rules.groupSubjects[group]) rules.groupSubjects[group] = [];
            rules.groupSubjects[group] = [...new Set([...rules.groupSubjects[group], ...subs])];
        }
    }

    // Merge Optional Subjects (by group)
    if (classRules.optionalSubjects) {
        for (const [group, subs] of Object.entries(classRules.optionalSubjects)) {
            if (!rules.optionalSubjects[group]) rules.optionalSubjects[group] = [];
            rules.optionalSubjects[group] = [...new Set([...rules.optionalSubjects[group], ...subs])];
        }
    }

    // Identify student context
    const studentGroup = student.group || '';

    // Helper to find matching keys handling both English and Bengali variants
    const findGroupKey = (rulesObj, targetGroup) => {
        // Remove trailing "group", "groups", "গ্রুপ", "শাখা" words and normalize Spaces
        const cleanGroup = (str) => normalizeText(str).replace(/\b(group|groups|গ্রুপ|শাখা)\b/g, '').trim();

        const normTarget = cleanGroup(targetGroup);
        return Object.keys(rulesObj).find(k => {
            const normK = cleanGroup(k);

            // Direct Match after cleaning
            if (normK === normTarget) return true;

            // Science variations
            if ((normTarget.includes('বিজ্ঞান') || normTarget.includes('science')) &&
                (normK.includes('বিজ্ঞান') || normK.includes('science'))) {
                return true;
            }
            // Humanities variations (including arts)
            const isHumanities = (s) => s.includes('মানবিক') || s.includes('humanities') || s.includes('arts') || s.includes('আর্টস');
            if (isHumanities(normTarget) && isHumanities(normK)) {
                return true;
            }
            // Business variations
            if ((normTarget.includes('ব্যবসায়') || normTarget.includes('business')) &&
                (normK.includes('ব্যবসায়') || normK.includes('business'))) {
                return true;
            }

            return false;
        });
    };

    const groupKeyGroupSubs = findGroupKey(rules.groupSubjects, studentGroup) || studentGroup;
    const groupKeyOptSubs = findGroupKey(rules.optionalSubjects, studentGroup) || studentGroup;

    const myGroupSubs = rules.groupSubjects[groupKeyGroupSubs] || [];
    const myOptSubs = rules.optionalSubjects[groupKeyOptSubs] || [];

    // Filter input subjects based on mapping (if mapping exists)
    const hasMapping = rules.generalSubjects.length > 0 || Object.keys(rules.groupSubjects).length > 0 || Object.keys(rules.optionalSubjects).length > 0;

    let filteredSubjects = subjects;
    if (hasMapping) {
        filteredSubjects = subjects.filter(s =>
            rules.generalSubjects.includes(s) ||
            myGroupSubs.includes(s) ||
            myOptSubs.includes(s) ||
            (student.subjects[s] && (
                Number(student.subjects[s].total) > 0 ||
                (student.subjects[s].written !== undefined && student.subjects[s].written !== '')
            ))
        );
    }

    // Determine which subjects are the student's optional subjects
    let optionalSubNames = [];
    filteredSubjects.forEach(s => {
        if (myOptSubs.includes(s)) {
            optionalSubNames.push(s);
        }
    });

    // Handle specific Combined papers mismatch (e.g. if myOptSubs has "উচ্চতর গণিত ১ম ও ২য় পত্র" but student subjects are separate papers or combined)
    // We do a robust check taking the 'normalizeText' strategy into account against the filtered subjects.

    // Additional mapping logic: check if the subject matches any optional subject config ignoring last paper tags.
    const normalizedOptSubs = myOptSubs.map(s => normalizeText(s));
    filteredSubjects.forEach(s => {
        const normS = normalizeText(s);
        if (!optionalSubNames.includes(s) && normalizedOptSubs.some(opt => opt.includes(normS) || normS.includes(opt))) {
            optionalSubNames.push(s);
        }
    });

    console.log('--- DEBUG INFO ---');
    console.log('Student:', student.name, 'Group:', studentGroup);
    console.log('Group Key Resolved For Opt Subs:', groupKeyOptSubs);
    console.log('My Group Subs:', myGroupSubs);
    console.log('My Opt Subs:', myOptSubs);
    console.log('Optional Sub Names:', optionalSubNames);

    // Use filtered subjects for processing
    const subjectsToProcess = filteredSubjects;

    // Prepare processed subjects list (handle Combined Mode)
    let processedSubjects = [];
    if (rules.mode === 'combined' && rules.combinedSubjects.length > 0) {
        const handledPapers = new Set();

        rules.combinedSubjects.forEach(comb => {
            const p1 = subjectsToProcess.find(s => s === comb.paper1);
            const p2 = subjectsToProcess.find(s => s === comb.paper2);

            if (p1 && p2) {
                const d1 = student.subjects[p1] || {};
                const d2 = student.subjects[p2] || {};
                const c1 = getSubjectConfig(p1);
                const c2 = getSubjectConfig(p2);
                const options1 = {
                    writtenPass: (c1.writtenPass !== undefined && c1.writtenPass !== '') ? Number(c1.writtenPass) : (c1.isFallback ? undefined : 0),
                    mcqPass: (c1.mcqPass !== undefined && c1.mcqPass !== '') ? Number(c1.mcqPass) : (c1.isFallback ? undefined : 0),
                    practicalPass: (c1.practicalPass !== undefined && c1.practicalPass !== '') ? Number(c1.practicalPass) : 0
                };
                const options2 = {
                    writtenPass: (c2.writtenPass !== undefined && c2.writtenPass !== '') ? Number(c2.writtenPass) : (c2.isFallback ? undefined : 0),
                    mcqPass: (c2.mcqPass !== undefined && c2.mcqPass !== '') ? Number(c2.mcqPass) : (c2.isFallback ? undefined : 0),
                    practicalPass: (c2.practicalPass !== undefined && c2.practicalPass !== '') ? Number(c2.practicalPass) : 0
                };

                const s1 = determineStatus(d1, options1);
                const s2 = determineStatus(d2, options2);

                // Average marks
                const combinedData = {
                    written: ((parseFloat(d1.written) || 0) + (parseFloat(d2.written) || 0)) / 2,
                    mcq: ((parseFloat(d1.mcq) || 0) + (parseFloat(d2.mcq) || 0)) / 2,
                    practical: ((parseFloat(d1.practical) || 0) + (parseFloat(d2.practical) || 0)) / 2,
                    total: ((parseFloat(d1.total) || 0) + (parseFloat(d2.total) || 0)) / 2,
                    status: (s1 === 'ফেল' || s2 === 'ফেল' || s1 === 'অনুপস্থিত' || s2 === 'অনুপস্থিত') ? 'fail' : 'pass'
                };

                const maxTotal = (Number(c1.total || 100) + Number(c2.total || 100)) / 2;

                const isOpt = optionalSubNames.includes(p1) || optionalSubNames.includes(p2);
                let priority = 4;
                if (isOpt) priority = 3;
                else if (myGroupSubs.includes(p1) || myGroupSubs.includes(p2)) priority = 2;
                else if (rules.generalSubjects.includes(p1) || rules.generalSubjects.includes(p2)) priority = 1;

                processedSubjects.push({
                    name: comb.combinedName,
                    data: combinedData,
                    maxTotal: maxTotal,
                    options: {
                        writtenPass: (options1.writtenPass + options2.writtenPass) / 2,
                        mcqPass: (options1.mcqPass + options2.mcqPass) / 2,
                        practicalPass: (options1.practicalPass + options2.practicalPass) / 2
                    },
                    isCombined: true,
                    isOptional: isOpt,
                    _typePriority: priority,
                    _baseName: comb.combinedName
                });
                console.log('Combined Subject Processed:', comb.combinedName, 'isOptional:', optionalSubNames.includes(p1) || optionalSubNames.includes(p2));

                handledPapers.add(p1);
                handledPapers.add(p2);
            }
        });

        // Add remaining subjects
        subjectsToProcess.forEach(s => {
            if (!handledPapers.has(s)) {
                const data = student.subjects[s] || {};
                const config = getSubjectConfig(s);
                const options = {
                    writtenPass: (config.writtenPass !== undefined && config.writtenPass !== '') ? Number(config.writtenPass) : (config.isFallback ? undefined : 0),
                    mcqPass: (config.mcqPass !== undefined && config.mcqPass !== '') ? Number(config.mcqPass) : (config.isFallback ? undefined : 0),
                    practicalPass: (config.practicalPass !== undefined && config.practicalPass !== '') ? Number(config.practicalPass) : 0
                };
                const isOpt = optionalSubNames.includes(s);
                let priority = 4;
                if (isOpt) priority = 3;
                else if (myGroupSubs.includes(s)) priority = 2;
                else if (rules.generalSubjects.includes(s)) priority = 1;

                processedSubjects.push({
                    name: s,
                    data: data,
                    maxTotal: parseInt(config.total) || 100,
                    options: options,
                    isCombined: false,
                    isOptional: isOpt,
                    _typePriority: priority,
                    _baseName: s.replace(/১ম পত্র|২য় পত্র|১ম ও ২য় পত্র|1st paper|2nd paper|1st \& 2nd paper/gi, '').trim()
                });
            }
        });
    } else {
        processedSubjects = subjectsToProcess.map(s => {
            const data = student.subjects[s] || {};
            const config = getSubjectConfig(s);

            const options = {
                writtenPass: (config.writtenPass !== undefined && config.writtenPass !== '') ? Number(config.writtenPass) : (config.isFallback ? undefined : 0),
                mcqPass: (config.mcqPass !== undefined && config.mcqPass !== '') ? Number(config.mcqPass) : (config.isFallback ? undefined : 0),
                practicalPass: (config.practicalPass !== undefined && config.practicalPass !== '') ? Number(config.practicalPass) : 0
            };
            const dynamicStatus = determineStatus(data, options);

            const isOpt = optionalSubNames.includes(s);
            let priority = 4;
            if (isOpt) priority = 3;
            else if (myGroupSubs.includes(s)) priority = 2;
            else if (rules.generalSubjects.includes(s)) priority = 1;

            return {
                name: s,
                data: { ...data, status: dynamicStatus },
                maxTotal: parseInt(config.total) || 100,
                options: options,
                isCombined: false,
                isOptional: isOpt,
                _typePriority: priority,
                _baseName: s.replace(/১ম পত্র|২য় পত্র|১ম ও ২য় পত্র|1st paper|2nd paper|1st \& 2nd paper/gi, '').trim()
            };
        });
    }

    // Sort processed subjects based on Subject Type and Name
    // 1: Core/General, 2: Group, 3: Optional, 4: Other
    processedSubjects.sort((a, b) => {
        if (a._typePriority !== b._typePriority) {
            return a._typePriority - b._typePriority;
        }

        // If same priority, sort by Base Name to keep 1st and 2nd papers together
        if (a._baseName !== b._baseName) {
            return a._baseName.localeCompare(b._baseName, 'bn');
        }

        // If exact same base name, sort by original name (naturally handles "১ম" vs "২য়")
        return a.name.localeCompare(b.name, 'bn');
    });

    // Calculate per-subject grades and grand totals
    let grandTotal = 0;
    let maxGrand = 0;
    let allPassed = true;
    let coreGPASum = 0;
    let coreSubjectCount = 0;
    let optionalGP = 0;

    const subjectRows = processedSubjects.map((item, idx) => {
        const subj = item.name;
        const data = item.data;
        const total = data.total || 0;
        const maxTotal = item.maxTotal;

        grandTotal += total;
        maxGrand += maxTotal;

        const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
        let grade = getLetterGrade(pct);
        let gp = getGradePoint(pct);

        // GPA Logic: Identify Optional Subject
        const isOptional = item.isOptional;

        console.log('Subject Row:', subj, 'Total:', total, 'Grade:', grade, 'Status:', data.status, 'Is Optional:', isOptional);

        // Individual Pass Consistency: Force F if status indicates failure or absence
        const isFailed = (grade === 'F' || data.status === 'ফেল' || data.status === 'fail' || data.status === 'অনুপস্থিত');

        if (isFailed) {
            grade = 'F';
            gp = 0;
            // Optional Subject Logic Choice:
            // In Combined Mode: failing optional does NOT fail the whole exam
            // In Single Mode: failing optional DOES fail the exam (treated as mandatory)
            if (!isOptional || rules.mode !== 'combined') {
                allPassed = false;
            }
        }

        if (isOptional) {
            optionalGP = gp;
        } else {
            // Core subject (including ICT): include in average
            coreGPASum += gp;
            coreSubjectCount++;
        }

        const opts = item.options || {};
        const isWrittenFail = (data.written !== undefined && data.written !== '' && opts.writtenPass > 0 && parseFloat(data.written) < opts.writtenPass);
        const isMcqFail = (data.mcq !== undefined && data.mcq !== '' && opts.mcqPass > 0 && parseFloat(data.mcq) < opts.mcqPass);
        const isPracticalFail = (data.practical !== undefined && data.practical !== '' && opts.practicalPass > 0 && parseFloat(data.practical) < opts.practicalPass);

        const failStyle = 'font-weight: bold; color: #dc2626;';

        return `
            <tr>
                <td class="ms-td-sl">${idx + 1}</td>
                <td class="ms-td-subject">${subj} ${isOptional ? '<span style="font-size: 0.7em; color: var(--secondary);"> (Optional)</span>' : ''}</td>
                <td class="ms-td-num">${maxTotal}</td>
                <td class="ms-td-num ${isWrittenFail ? 'ms-mark-fail' : ''}" style="${isWrittenFail ? failStyle : ''}">${data.written || data.written === 0 ? data.written : '-'}</td>
                <td class="ms-td-num ${isMcqFail ? 'ms-mark-fail' : ''}" style="${isMcqFail ? failStyle : ''}">${data.mcq || data.mcq === 0 ? data.mcq : '-'}</td>
                <td class="ms-td-num ${isPracticalFail ? 'ms-mark-fail' : ''}" style="${isPracticalFail ? failStyle : ''}">${data.practical || data.practical === 0 ? data.practical : '-'}</td>
                <td class="ms-td-num ms-td-total" style="${isFailed ? failStyle : ''}">${total}</td>
                <td class="ms-td-grade ${grade === 'F' ? 'ms-grade-fail' : ''}" style="${grade === 'F' ? failStyle : ''}">${grade}</td>
                <td class="ms-td-gp" style="${gp === 0 ? failStyle : ''}">${gp.toFixed(2)}</td>
            </tr>`;
    }).join('');

    // Final GPA Calculation
    // Base GPA = Core Sum / Core Count
    let baseGPA = coreSubjectCount > 0 ? (coreGPASum / coreSubjectCount) : 0;
    let finalGPA = baseGPA;
    let optionalBonus = 0;

    // Optional Subject Bonus (ONLY in Combined Mode)
    if (rules.mode === 'combined') {
        if (optionalGP >= 5) {
            optionalBonus = 0.50;
        } else if (optionalGP > 2) {
            optionalBonus = (optionalGP - 2) / coreSubjectCount;
        }
    }

    finalGPA += optionalBonus;

    // Force Fail if any subject is F
    if (!allPassed) {
        baseGPA = 0;
        finalGPA = 0;
    }

    if (finalGPA > 5.0) finalGPA = 5.0;
    if (baseGPA > 5.0) baseGPA = 5.0;

    const displayGPA = finalGPA.toFixed(2);
    const overallGrade = getLetterGrade((finalGPA / 5) * 100);

    // Decide what text to show for the GPA area based on mode
    let gpaDisplayHtml = '';
    if (rules.mode === 'combined' && optionalGP > 0) {
        gpaDisplayHtml = `
            <div style="font-size: 0.7em; margin-bottom: 2px;">Without Optional GPA:<br/>${baseGPA.toFixed(2)}</div>
            <div style="font-size: 0.9em;">With Optional GPA:<br/><strong>${displayGPA}</strong></div>
        `;
    } else {
        gpaDisplayHtml = `<strong>${displayGPA}</strong>`;
    }

    // Dynamic Comments GPA

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
        `<img class="ms-watermark-bg" src="${ms.watermarkUrl}" style="opacity: ${ms.watermarkOpacity || 0.1};">` : '';

    const todayDate = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });

    return `
        <div class="ms-page font-${ms.fontSize || 'medium'} theme-${ms.theme || 'classic'} border-${ms.borderStyle || 'double'} typography-${ms.typography || 'default'} density-${ms.rowDensity || 'normal'}" 
             id="ms_page_${student.id}_${student.group}" 
             data-student-id="${student.id}"
             data-student-name="${student.name}"
             data-student-group="${student.group || ''}"
             data-student-class="${student.class || ''}"
             data-student-session="${selectedSession || ''}"
             data-exam-name="${examDisplayName || ''}"
             style="--ms-primary: ${ms.primaryColor || '#4361ee'}; --ms-watermark-opacity: ${ms.watermarkOpacity || 0.1}; display: flex; flex-direction: column;">
            ${watermarkHtml}
            
            <div class="ms-actions-float no-print">
                <button class="ms-btn-action ms-btn-print-single" onclick="window.printSingleMarksheet('ms_page_${student.id}_${student.group}')">
                    <i class="fas fa-print"></i> প্রিন্ট
                </button>
            </div>

            <!-- Decorative Border -->
            <div class="ms-border-frame" style="display: flex; flex-direction: column; flex-grow: 1;">
                
                <!-- Main Content Wrapper to push footer down -->
                <div style="flex-grow: 1;">
                
                <!-- Header Section -->
                <div class="ms-header-section" style="padding-top: 5px;">
                    <div class="ms-emblem" style="margin-bottom: 5px;">
                        <i class="fas fa-graduation-cap"></i>
                    </div>
                    <h1 class="ms-inst-name" style="margin-bottom: 2px;">${ms.institutionName || 'প্রতিষ্ঠানের নাম'}</h1>
                    ${ms.institutionAddress ? `<p class="ms-inst-address" style="margin-top: 2px;">${ms.institutionAddress}</p>` : ''}
                    <div class="ms-title-divider" style="margin: 8px auto;"></div>
                    
                    <!-- Royal Badge Container -->
                    <div style="display: flex; justify-content: center; align-items: center; margin: 10px auto 20px auto; width: max-content; 
                                border: 2px solid #b8860b; border-radius: 8px; 
                                background: linear-gradient(180deg, rgba(255,250,230,0.8) 0%, rgba(255,255,255,1) 100%);
                                padding: 10px 25px; box-shadow: 0 4px 6px rgba(184, 134, 11, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.8);">
                                
                        <!-- Left side: Marksheet Title -->
                        <h2 class="ms-title-main" style="margin: 0; font-size: 1.35em; font-weight: 800; color: var(--text-main); letter-spacing: 0.5px; border: none !important; padding: 0 15px 0 0;">
                            ${ms.headerLine1 || 'পরীক্ষার ফলাফল মার্কশীট'}
                        </h2>
                        
                        <!-- Right side: Dynamic Exam Name highlighted in Blue -->
                        <p class="ms-exam-name-display" style="margin: 0; font-size: 1.35em; font-weight: 800; color: #1d4ed8; letter-spacing: 0.5px; text-shadow: 0px 1px 1px rgba(29, 78, 216, 0.1); border: none !important; padding: 0 0 0 15px;">
                            ${examDisplayName}
                        </p>
                    </div>
                </div>

                <!-- Student Info Section -->
                <div class="ms-student-section" style="margin-bottom: 12px; font-size: 0.95em;">
                    
                    <!-- Top Row: Roll and Name -->
                    <div style="display: flex; gap: 20px; font-size: 1.1em; font-weight: 600; margin-bottom: 8px;">
                        <div>
                            রোল: <span style="color: var(--primary);">${student.id}</span>
                        </div>
                        <div>
                            নাম: <span style="color: var(--primary);">${student.name}</span>
                        </div>
                    </div>
                    
                    <!-- Bottom Row: Class, Group, Session, GPA -->
                    <div style="display: flex; flex-direction: row; flex-wrap: nowrap; justify-content: space-between; align-items: center; border-top: 2px solid var(--border); border-bottom: 2px solid var(--border); padding: 8px 0; margin-top: 5px;">
                        
                        <div style="display: flex; gap: 8px; align-items: center;">
                             <span style="color: var(--text-secondary); font-weight: 500;">শ্রেণি:</span> 
                             <span style="font-weight: 600; color: var(--text-main);">${student.class}</span>
                        </div>

                        <div style="display: flex; gap: 8px; align-items: center;">
                             <span style="color: var(--text-secondary); font-weight: 500;">বিভাগ:</span> 
                             <span style="font-weight: 600; color: var(--text-main);">${student.group || '-'}</span>
                        </div>

                        <div style="display: flex; gap: 8px; align-items: center;">
                             <span style="color: var(--text-secondary); font-weight: 500;">শিক্ষাবর্ষ:</span> 
                             <span style="font-weight: 600; color: var(--text-main);">${student.session}</span>
                        </div>

                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${rules.mode === 'combined' && optionalGP > 0
            ? `<span style="color: var(--text-secondary); font-weight: 500; font-size: 0.8em; line-height: 1.1;">Without<br/>Optional GPA:</span> 
                                   <span style="font-weight: 600; margin-right: 10px;">${baseGPA.toFixed(2)}</span>
                                   <span style="color: var(--text-secondary); font-weight: 500; font-size: 0.8em; line-height: 1.1;">With<br/>Optional GPA:</span> 
                                   <span style="color: var(--primary); font-weight: 700; font-size: 1.1em;">${displayGPA}</span>`
            : `<span style="color: var(--text-secondary); font-weight: 500;">GPA:</span> 
                                   <span style="color: var(--primary); font-weight: 700; font-size: 1.1em;">${displayGPA}</span>`
        }
                        </div>

                    </div>
                </div>

                <!-- Marks Table -->
                <table class="ms-table">
                    <thead>
                        <tr>
                            <th class="ms-th-sl">ক্রঃ</th>
                            <th class="ms-th-subject">বিষয়ের নাম</th>
                            <th class="ms-th-num">পূর্ণমান</th>
                            <th class="ms-th-num">লিখিত</th>
                            <th class="ms-th-num">MCQ</th>
                            <th class="ms-th-num">ব্যবহারিক</th>
                            <th class="ms-th-num">প্রাপ্ত নম্বর</th>
                            <th class="ms-th-grade">গ্রেড</th>
                            <th class="ms-th-gp">GP</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${subjectRows}
                    </tbody>
                    <tfoot>
                        <tr class="ms-row-total">
                            <td colspan="2" class="ms-td-total-label">সর্বমোট</td>
                            <td class="ms-td-num">${maxGrand}</td>
                            <td colspan="3"></td>
                            <td class="ms-td-num ms-td-total">${grandTotal}</td>
                            <td class="ms-td-grade">${overallGrade}</td>
                            <td class="ms-td-gp">${displayGPA}</td>
                        </tr>
                    </tfoot>
                </table>

                <!-- Result Summary -->
                <div class="ms-result-section">
                    <div class="ms-result-box" style="padding: 5px 10px;">
                        <span class="ms-result-value ms-gpa-value" style="font-size: 1em; line-height: 1.2;">
                            ${gpaDisplayHtml}
                        </span>
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
                    <p class="ms-grade-scale-title">গ্রেডিং স্কেল</p>
                    <div class="ms-grade-scale-grid">
                        <span>A+ (৮০-১০০) = ৫.০০</span>
                        <span>A (৭০-৭৯) = ৪.০০</span>
                        <span>A- (৬০-৬৯) = ৩.৫০</span>
                        <span>B (৫০-৫৯) = ৩.০০</span>
                        <span>C (৪০-৪৯) = ২.০০</span>
                        <span>D (৩৩-৩৯) = ১.০০</span>
                        <span>F (০-৩২) = ০.০০</span>
                    </div>
                </div>
                
                </div> <!-- END Flexible Main Content Area -->

                <!-- Signatures pinned at bottom -->
                <div class="ms-signatures-section" style="margin-top: auto; padding-top: 15px;">
                    ${signatureHtml}
                </div>

                <!-- Footer -->
                <div class="ms-footer">
                    <span>প্রকাশের তারিখ: ${todayDate}</span>
                    <span>এটি কম্পিউটার জেনারেটেড ফলাফল পত্র</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Robust Subject Configuration Lookup
 * Uses normalization to handle character variants
 */
function getSubjectConfig(subjectName) {
    if (!subjectName) return { total: 100, isFallback: true };
    const configs = state.subjectConfigs || {};

    // Quick match
    if (configs[subjectName]) return { ...configs[subjectName], isFallback: false };

    // Fuzzy/Normalized match
    const normalizedTarget = normalizeText(subjectName);
    const matchedKey = Object.keys(configs).find(key =>
        key !== 'updatedAt' && normalizeText(key) === normalizedTarget
    );

    if (matchedKey) return { ...configs[matchedKey], isFallback: false };
    return { total: 100, isFallback: true };
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

function getGradePoint(pct) {
    if (pct >= 80) return 5.00;
    if (pct >= 70) return 4.00;
    if (pct >= 60) return 3.50;
    if (pct >= 50) return 3.00;
    if (pct >= 40) return 2.00;
    if (pct >= 33) return 1.00;
    return 0.00;
}

/**
 * Update Live Preview in Marksheet Settings Modal
 */
function updateSettingsLivePreview() {
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

    const html = renderSingleMarksheet(mockStudent, currentSettings, '২০২৫-২০২৬', 'অর্ধ-বার্ষিক পরীক্ষা ২০২৬');
    previewContainer.innerHTML = html;

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
    const updateSettingsLivePreview = () => {
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
        const html = renderSingleMarksheet(MOCK_PREVIEW_STUDENT, mockSubjects, 'অর্ধ-বার্ষিক পরীক্ষা ২০২৬', '২০২৫-২০২৬', currentSettings);

        // Use a wrapper to keep the scale separate from the content
        previewContainer.innerHTML = html;

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
                reader.onload = (ev) => {
                    marksheetSettings.watermarkUrl = ev.target.result;
                    const preview = document.getElementById('msWatermarkPreview');
                    if (preview) preview.innerHTML = `<img src="${ev.target.result}" style="max-width:80px; opacity:0.3; border-radius:6px;">`;
                    updateSettingsLivePreview(); // Update preview after upload
                };
                reader.readAsDataURL(file);
            }
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
                reader.onload = (ev) => {
                    const url = ev.target.result;
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
 * Print a single marksheet
 */
window.printSingleMarksheet = function (containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    // Save current title and construct new title for PDF filename
    const originalTitle = document.title;
    const id = el.dataset.studentId || '';
    const name = el.dataset.studentName || '';
    const group = el.dataset.studentGroup || '';
    const cls = el.dataset.studentClass || '';
    const session = el.dataset.studentSession || '';
    const exam = el.dataset.examName || '';
    
    // Format: Roll_Group_Name(Class-Session)_ExamName
    document.title = `${id}_${group}_${name}(${cls}-${session})_${exam}`;

    // Trigger printing classes
    document.body.classList.add('ms-printing-single');
    el.classList.add('ms-single-active');

    window.print();

    // Restoration
    const restore = () => {
        document.title = originalTitle;
        document.body.classList.remove('ms-printing-single');
        el.classList.remove('ms-single-active');
        window.removeEventListener('afterprint', restore);
    };

    window.addEventListener('afterprint', restore);
    // Switch back after 3s just in case
    setTimeout(restore, 3000);
};

/**
 * Bulk Print - opens print dialog with only marksheets
 */
function bulkPrint() {
    const originalTitle = document.title;
    
    const cls = document.getElementById('msClass')?.value || '';
    const session = document.getElementById('msSession')?.value || '';
    const group = document.getElementById('msGroup')?.value || '';
    const exam = document.getElementById('msExamName')?.value || 'Combined';
    
    // Construct bulk name: ক্লাস_সেশন_বিভাগ_পরীক্ষার নাম
    const groupText = group === 'all' ? 'AllGroups' : group;
    const examText = exam === '__all__' ? 'Combined' : exam;
    
    document.title = `${cls}_${session}_${groupText}_${examText}`;

    document.body.classList.add('ms-printing');

    window.print();

    // Remove class after print dialog closes
    const restoreBulk = () => {
        document.title = originalTitle;
        document.body.classList.remove('ms-printing');
        window.removeEventListener('afterprint', restoreBulk);
    };

    window.addEventListener('afterprint', restoreBulk, { once: true });
    // Fallback for browsers that don't fire afterprint
    setTimeout(restoreBulk, 3000);
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

    // Listen for data updates to refresh dropdowns
    window.addEventListener('examDataUpdated', async () => {
        const pageId = document.querySelector('.nav-item.active')?.dataset.page;
        if (pageId === 'marksheet') {
            await populateMSDropdowns();
        }
    });

    await populateMSDropdowns();
}
