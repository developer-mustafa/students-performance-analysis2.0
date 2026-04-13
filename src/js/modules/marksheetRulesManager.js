import { db } from '../firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { showNotification } from '../utils.js';
import { state } from './state.js';
import { getClassSubjectMappings } from '../firestoreService.js';
import { showConfirmModal } from './uiManager.js';

const SETTINGS_COLLECTION = 'settings';
const RULES_DOC_ID = 'marksheet_rules';

export let currentMarksheetRules = {}; // Structured as { "HSC": { mode, combinedSubjects, optionalSubjects }, "All": { ... } }

let selectedClass = localStorage.getItem('msSetSelectedClass') || 'All';

// UI Elements (initialized in init)
let modeSelect, genList, groupSubList, optList, combList;

export async function loadMarksheetRules() {
    try {
        const docRef = doc(db, SETTINGS_COLLECTION, RULES_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentMarksheetRules = docSnap.data();
        } else {
            // Document doesn't exist, initialize
            currentMarksheetRules = {
                "All": { mode: 'single', combinedSubjects: [], optionalSubjects: {} }
            };
            await saveMarksheetRules(currentMarksheetRules);
        }
        return currentMarksheetRules;
    } catch (error) {
        console.error("Error loading marksheet rules:", error);
        return currentMarksheetRules;
    }
}

export async function saveMarksheetRules(rulesObj) {
    try {
        const docRef = doc(db, SETTINGS_COLLECTION, RULES_DOC_ID);
        await setDoc(docRef, rulesObj, { merge: true });
        currentMarksheetRules = { ...currentMarksheetRules, ...rulesObj };
        return true;
    } catch (error) {
        throw error;
    }
}


// 1. Populate Dynamic Dropdowns (fetches mapping directly from Firestore)
export const populateMarksheetSettingsDropdowns = async (targetCls = null) => {
    const classSelect = document.getElementById('msSetClass');
    const paper1Select = document.getElementById('msSetCombPaper1');
    const paper2Select = document.getElementById('msSetCombPaper2');
    const optSubjectSelect = document.getElementById('msSetOptSubject');
    const genSubjectSelect = document.getElementById('msSetGenSubject');
    const groupSubSubjectSelect = document.getElementById('msSetGroupSubSubject');

    if (!classSelect) return;

    // 1. Populate Classes (always refresh from academic structure)
    const classes = state.academicStructure?.class || [];
    const currentClassVal = classSelect.value;
    const classOptions = [`<option value="All">সকল ক্লাস (All Classes)</option>`];
    classes.forEach(c => {
        classOptions.push(`<option value="${c.value}">${c.value}</option>`);
    });
    classSelect.innerHTML = classOptions.join('');
    // Restore or set class selection
    const classToRestore = targetCls || selectedClass || currentClassVal;
    if (classToRestore && [...classSelect.options].some(o => o.value === classToRestore)) {
        classSelect.value = classToRestore;
        selectedClass = classToRestore;
        localStorage.setItem('msSetSelectedClass', classToRestore);
    }

    // 1.5. Populate Group Dropdowns (Dynamic from academic structure)
    const groups = state.academicStructure?.group || [];
    const groupSubGroupSelect = document.getElementById('msSetGroupSubGroup');
    const optGroupSelect = document.getElementById('msSetOptGroup');
    const groupOptions = [`<option value="">গ্রুপ নির্বাচন করুন</option>`];
    groups.forEach(g => {
        groupOptions.push(`<option value="${g.value}">${g.value}</option>`);
    });
    const groupHtml = groupOptions.join('');
    if (groupSubGroupSelect) {
        const currentVal = groupSubGroupSelect.value;
        groupSubGroupSelect.innerHTML = groupHtml;
        if (currentVal) groupSubGroupSelect.value = currentVal;
    }
    if (optGroupSelect) {
        const currentVal = optGroupSelect.value;
        const optGroupHtml = [...groupOptions];
        if (!groups.some(g => g.value === 'General')) {
            optGroupHtml.push('<option value="General">সাধারণ (General)</option>');
        }
        optGroupSelect.innerHTML = optGroupHtml.join('');
        if (currentVal) optGroupSelect.value = currentVal;
    }

    // 2. Fetch class-subject mappings directly from Firestore
    let classSubjectMappings = {};
    try {
        classSubjectMappings = await getClassSubjectMappings();
        // Also sync to state for other modules
        state.classSubjectMapping = classSubjectMappings;
    } catch (e) {
        console.error('Failed to load class subject mappings:', e);
        classSubjectMappings = state.classSubjectMapping || {};
    }

    // 3. Filter mapping subjects based on selected class
    // Remove metadata keys like 'updatedAt'
    const metaKeys = ['updatedAt'];
    let mappingSubjects = [];

    const activeCls = targetCls || (classSelect ? classSelect.value : 'All');

    if (activeCls === 'All') {
        // Show ALL subjects from ALL classes
        mappingSubjects = Object.entries(classSubjectMappings)
            .filter(([key]) => !metaKeys.includes(key))
            .flatMap(([, subs]) => Array.isArray(subs) ? subs : [])
            .filter(Boolean);
    } else {
        // Show subjects for the specific selected class
        const classSubs = classSubjectMappings[activeCls];
        mappingSubjects = Array.isArray(classSubs) ? classSubs : [];
    }

    // 4. Also include subjects from configs & exams as fallback
    const configSubjects = Object.keys(state.subjectConfigs || {}).filter(k => k !== 'updatedAt');
    const examSubjects = (state.savedExams || []).map(e => e.subject).filter(Boolean);

    // Combine unique subjects
    const allUniqueSubjects = [...new Set([...mappingSubjects, ...configSubjects, ...examSubjects])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'bn'));

    const subOptions = [`<option value="">সিলেক্ট করুন</option>`];
    allUniqueSubjects.forEach(s => {
        subOptions.push(`<option value="${s}">${s}</option>`);
    });

    const subHtml = subOptions.join('');
    [paper1Select, paper2Select, optSubjectSelect, genSubjectSelect, groupSubSubjectSelect].forEach(sel => {
        if (sel) {
            const currentVal = sel.value;
            sel.innerHTML = subHtml;
            if (currentVal && allUniqueSubjects.includes(currentVal)) {
                sel.value = currentVal;
            }
        }
    });

    // Populate Alternative Subject Dropdowns + Student Core Subject Mapping Dropdown
    ['msSetAltSubject1', 'msSetAltSubject2', 'msMapSubject'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
            const currentVal = sel.value;
            const subHtml = [`<option value="">বিষয় নির্বাচন করুন</option>`];
            allUniqueSubjects.forEach(s => subHtml.push(`<option value="${s}">${s}</option>`));
            sel.innerHTML = subHtml.join('');
            if (currentVal && allUniqueSubjects.includes(currentVal)) {
                sel.value = currentVal;
            }
        }
    });
};

// Helper to get current class rules
const getClassRules = (cls) => {
    if (!currentMarksheetRules[cls]) {
        currentMarksheetRules[cls] = {
            mode: 'single',
            combinedSubjects: [],
            optionalSubjects: {},
            generalSubjects: [],
            groupSubjects: {},
            alternativePairs: []
        };
    }
    // Ensure all properties exist for backward compatibility
    if (!currentMarksheetRules[cls].generalSubjects) currentMarksheetRules[cls].generalSubjects = [];
    if (!currentMarksheetRules[cls].groupSubjects) currentMarksheetRules[cls].groupSubjects = {};
    if (!currentMarksheetRules[cls].optionalSubjects) currentMarksheetRules[cls].optionalSubjects = {};
    if (!currentMarksheetRules[cls].combinedSubjects) currentMarksheetRules[cls].combinedSubjects = [];
    if (!currentMarksheetRules[cls].alternativePairs) currentMarksheetRules[cls].alternativePairs = [];

    return currentMarksheetRules[cls];
};

export const refreshMarksheetRulesUI = () => {
    const classSelect = document.getElementById('msSetClass');
    if (classSelect) {
        selectedClass = classSelect.value || localStorage.getItem('msSetSelectedClass') || 'All';
        localStorage.setItem('msSetSelectedClass', selectedClass);
    }

    const rules = getClassRules(selectedClass);

    // Update Mode Select
    if (modeSelect) {
        modeSelect.value = rules.mode || 'single';
    }

    // Render Lists
    renderGeneralList(genList, rules.generalSubjects);
    renderGroupSubList(groupSubList, rules.groupSubjects);
    renderOptionalList(optList, rules.optionalSubjects);
    renderCombinedList(combList, rules.combinedSubjects);
    renderAlternativeList(document.getElementById('msSetAltList'), rules.alternativePairs);
};

export async function initMarksheetRulesManager() {
    await loadMarksheetRules();
    // populateMarksheetSettingsDropdowns will be called via refresh in init below


    // UI Elements Selection
    const classSelect = document.getElementById('msSetClass');
    modeSelect = document.getElementById('msSetMode');
    const modeSaveBtn = document.getElementById('msSetModeSaveBtn');

    // Lists
    genList = document.getElementById('msSetGenList');
    groupSubList = document.getElementById('msSetGroupSubList');
    optList = document.getElementById('msSetOptList');
    combList = document.getElementById('msSetCombList');

    // General Subjects
    const genSubjectSelect = document.getElementById('msSetGenSubject');
    const genAddBtn = document.getElementById('msSetGenAddBtn');

    // Group Subjects
    const groupSubGroupSelect = document.getElementById('msSetGroupSubGroup');
    const groupSubSubjectSelect = document.getElementById('msSetGroupSubSubject');
    const groupSubAddBtn = document.getElementById('msSetGroupSubAddBtn');

    // Optional Subjects
    const optGroupSelect = document.getElementById('msSetOptGroup');
    const optSubjectSelect = document.getElementById('msSetOptSubject');
    const optAddBtn = document.getElementById('msSetOptAddBtn');

    // Combined Paper
    const paper1Select = document.getElementById('msSetCombPaper1');
    const paper2Select = document.getElementById('msSetCombPaper2');
    const combinedNameInput = document.getElementById('msSetCombCombinedName');
    const combAddBtn = document.getElementById('msSetCombAddBtn');

    if (!classSelect || !modeSelect) return;

    // populateMarksheetSettingsDropdowns already called above
    await populateMarksheetSettingsDropdowns();

    // Initialize UI
    refreshMarksheetRulesUI();

    // Class Switch
    classSelect.addEventListener('change', async () => {
        const targetCls = classSelect.value;
        await populateMarksheetSettingsDropdowns(targetCls);
        refreshMarksheetRulesUI();
    });

    // Mode Toggle
    modeSaveBtn.addEventListener('click', async () => {
        try {
            const rules = getClassRules(selectedClass);
            rules.mode = modeSelect.value;
            await saveMarksheetRules({ [selectedClass]: rules });
            // Ensure UI stays on current class and mode
            refreshMarksheetRulesUI();
            showNotification(`${selectedClass} এর মোড সেভ করা হয়েছে`, 'success');
        } catch (e) {
            showNotification('সংরক্ষণে সমস্যা হয়েছে', 'error');
        }
    });

    // Add General Subject
    genAddBtn.addEventListener('click', async () => {
        const sub = genSubjectSelect.value;
        if (!sub) return showNotification('বিষয় নির্বাচন করুন', 'warning');

        const rules = getClassRules(selectedClass);
        if (!rules.generalSubjects.includes(sub)) {
            rules.generalSubjects.push(sub);
            await saveMarksheetRules({ [selectedClass]: rules });
            renderGeneralList(genList, rules.generalSubjects);
            showNotification('সাধারণ বিষয় যোগ করা হয়েছে');
        } else {
            showNotification('এই বিষয় আগে যোগ করা হয়েছে', 'warning');
        }
    });

    // Add Group Subject
    groupSubAddBtn.addEventListener('click', async () => {
        const group = groupSubGroupSelect.value;
        const sub = groupSubSubjectSelect.value;
        if (!group || !sub) return showNotification('গ্রুপ এবং বিষয় নির্বাচন করুন', 'warning');

        const rules = getClassRules(selectedClass);
        if (!rules.groupSubjects[group]) rules.groupSubjects[group] = [];

        if (!rules.groupSubjects[group].includes(sub)) {
            rules.groupSubjects[group].push(sub);
            await saveMarksheetRules({ [selectedClass]: rules });
            renderGroupSubList(groupSubList, rules.groupSubjects);
            showNotification('গ্রুপ ভিত্তিক বিষয় যোগ করা হয়েছে');
        } else {
            showNotification('এই বিষয় আগে যোগ করা হয়েছে', 'warning');
        }
    });

    // Add Optional Subject
    optAddBtn.addEventListener('click', async () => {
        const group = optGroupSelect.value;
        const sub = optSubjectSelect.value;
        if (!group || !sub) return showNotification('গ্রুপ এবং বিষয় নির্বাচন করুন', 'warning');

        const rules = getClassRules(selectedClass);
        if (!rules.optionalSubjects[group]) rules.optionalSubjects[group] = [];

        if (!rules.optionalSubjects[group].includes(sub)) {
            rules.optionalSubjects[group].push(sub);
            await saveMarksheetRules({ [selectedClass]: rules });
            renderOptionalList(optList, rules.optionalSubjects);
            showNotification('ঐচ্ছিক বিষয় যোগ করা হয়েছে');
        } else {
            showNotification('এই বিষয় আগে যোগ করা হয়েছে', 'warning');
        }
    });

    // Add Combined Mapping
    combAddBtn.addEventListener('click', async () => {
        const p1 = paper1Select.value;
        const p2 = paper2Select.value;
        const comb = combinedNameInput.value.trim();

        if (!p1 || !p2 || !comb) return showNotification('সবগুলো ঘর পূরণ করুন', 'warning');

        const rules = getClassRules(selectedClass);
        rules.combinedSubjects.push({ paper1: p1, paper2: p2, combinedName: comb });
        await saveMarksheetRules({ [selectedClass]: rules });
        renderCombinedList(combList, rules.combinedSubjects);
        combinedNameInput.value = '';
        showNotification('উভয় পত্র ম্যাপিং যোগ করা হয়েছে');
    });

    // Delegated Delete Handlers
    genList.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.delete-gen-btn');
        if (delBtn) {
            const index = delBtn.dataset.index;
            const rules = getClassRules(selectedClass);
            const subjectName = rules.generalSubjects[index];
            
            showConfirmModal(
                `আপনি কি নিশ্চিতভাবে এই বিষয়টি মুছে ফেলতে চান?`,
                async () => {
                    rules.generalSubjects.splice(index, 1);
                    await saveMarksheetRules({ [selectedClass]: rules });
                    renderGeneralList(genList, rules.generalSubjects);
                    showNotification('বিষয়টি মুছে ফেলা হয়েছে', 'success');
                },
                subjectName,
                'সাধারণ বিষয় (General Subject)'
            );
        }
    });

    groupSubList.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.delete-group-sub-btn');
        if (delBtn) {
            const index = delBtn.dataset.index;
            const group = delBtn.dataset.group;
            const rules = getClassRules(selectedClass);
            const subjectName = rules.groupSubjects[group][index];

            showConfirmModal(
                `আপনি কি নিশ্চিতভাবে এই বিষয়টিকে গ্রুপ থেকে মুছে ফেলতে চান?`,
                async () => {
                    rules.groupSubjects[group].splice(index, 1);
                    await saveMarksheetRules({ [selectedClass]: rules });
                    renderGroupSubList(groupSubList, rules.groupSubjects);
                    showNotification('গ্রুপ বিষয় মুছে ফেলা হয়েছে', 'success');
                },
                subjectName,
                `${group} গ্রুপ ভিত্তিক বিষয়`
            );
        }
    });

    optList.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.delete-opt-btn');
        if (delBtn) {
            const index = delBtn.dataset.index;
            const group = delBtn.dataset.group;
            const rules = getClassRules(selectedClass);
            const subjectName = rules.optionalSubjects[group][index];

            showConfirmModal(
                `আপনি কি নিশ্চিতভাবে এই ঐচ্ছিক বিষয়টি মুছে ফেলতে চান?`,
                async () => {
                    rules.optionalSubjects[group].splice(index, 1);
                    await saveMarksheetRules({ [selectedClass]: rules });
                    renderOptionalList(optList, rules.optionalSubjects);
                    showNotification('ঐচ্ছিক বিষয় মুছে ফেলা হয়েছে', 'success');
                },
                subjectName,
                `${group} এর ঐচ্ছিক বিষয়`
            );
        }
    });

    combList.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.delete-comb-btn');
        if (delBtn) {
            const index = delBtn.dataset.index;
            const rules = getClassRules(selectedClass);
            const mapping = rules.combinedSubjects[index];

            showConfirmModal(
                `আপনি কি নিশ্চিতভাবে এই সাবজেক্ট ম্যাপিংটি মুছে ফেলতে চান?`,
                async () => {
                    rules.combinedSubjects.splice(index, 1);
                    await saveMarksheetRules({ [selectedClass]: rules });
                    renderCombinedList(combList, rules.combinedSubjects);
                    showNotification('ম্যাপিং মুছে ফেলা হয়েছে', 'success');
                },
                mapping.combinedName,
                `${mapping.paper1} + ${mapping.paper2}`
            );
        }
    });

    // Add Alternative Pair
    const altAddBtn = document.getElementById('msSetAltAddBtn');
    const altSub1 = document.getElementById('msSetAltSubject1');
    const altSub2 = document.getElementById('msSetAltSubject2');
    const altListCont = document.getElementById('msSetAltList');

    if (altAddBtn) {
        altAddBtn.addEventListener('click', async () => {
            const s1 = altSub1.value;
            const s2 = altSub2.value;

            if (!s1 || !s2) return showNotification('উভয় বিষয় নির্বাচন করুন', 'warning');
            if (s1 === s2) return showNotification('একই বিষয় দুবার হতে পারে না', 'warning');

            const rules = getClassRules(selectedClass);
            const exists = rules.alternativePairs.some(p => (p.sub1 === s1 && p.sub2 === s2) || (p.sub1 === s2 && p.sub2 === s1));

            if (!exists) {
                rules.alternativePairs.push({ sub1: s1, sub2: s2 });
                await saveMarksheetRules({ [selectedClass]: rules });
                renderAlternativeList(altListCont, rules.alternativePairs);
                showNotification('বিকল্প বিষয় জোড়া যোগ করা হয়েছে');
            } else {
                showNotification('এই জোড়া আগে যোগ করা হয়েছে', 'warning');
            }
        });
    }

    if (altListCont) {
        altListCont.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.delete-alt-btn');
            if (delBtn) {
                const index = delBtn.dataset.index;
                const rules = getClassRules(selectedClass);
                const pair = rules.alternativePairs[index];

                showConfirmModal(
                    `আপনি কি নিশ্চিতভাবে এই বিকল্প জোড়াটি মুছে ফেলতে চান?`,
                    async () => {
                        rules.alternativePairs.splice(index, 1);
                        await saveMarksheetRules({ [selectedClass]: rules });
                        renderAlternativeList(altListCont, rules.alternativePairs);
                        showNotification('জোড়াটি মুছে ফেলা হয়েছে', 'success');
                    },
                    `${pair.sub1} ↔ ${pair.sub2}`,
                    'বিকল্প বিষয় জোড়া'
                );
            }
        });
    }
}

function renderGeneralList(container, list) {
    if (!container) return;
    if (!list || list.length === 0) return container.innerHTML = '<p style="color: #888; text-align: center;">কোনো বিষয় নেই</p>';
    container.innerHTML = list.map((s, i) => `
        <div class="ms-settings-item">
            <span>${s}</span>
            <button class="btn-danger delete-gen-btn" data-index="${i}" style="padding: 2px 8px;"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

function renderGroupSubList(container, groups) {
    if (!container) return;
    const entries = Object.entries(groups || {}).filter(([k, v]) => v && v.length > 0);
    if (entries.length === 0) return container.innerHTML = '<p style="color: #888; text-align: center;">কোনো বিষয় নেই</p>';

    container.innerHTML = entries.map(([group, subjects]) => `
        <div class="ms-settings-group-wrapper">
            <div class="ms-settings-group-header ms-text-secondary">${group}</div>
            ${subjects.map((s, i) => `
                <div class="ms-settings-item">
                    <span class="ms-settings-item-text">${s}</span>
                    <button class="btn-danger delete-group-sub-btn" data-group="${group}" data-index="${i}" style="padding: 2px 8px;"><i class="fas fa-times"></i></button>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderOptionalList(container, groups) {
    if (!container) return;
    const entries = Object.entries(groups || {}).filter(([k, v]) => v && v.length > 0);
    if (entries.length === 0) return container.innerHTML = '<p style="color: #888; text-align: center;">কোনো বিষয় নেই</p>';

    container.innerHTML = entries.map(([group, subjects]) => `
        <div class="ms-settings-group-wrapper">
            <div class="ms-settings-group-header ms-text-warning">${group}</div>
            ${subjects.map((s, i) => `
                <div class="ms-settings-item">
                    <span class="ms-settings-item-text">${s}</span>
                    <button class="btn-danger delete-opt-btn" data-group="${group}" data-index="${i}" style="padding: 2px 8px;"><i class="fas fa-times"></i></button>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderCombinedList(container, combinedSubjects) {
    if (!container) return;
    const subjects = combinedSubjects || [];
    if (subjects.length === 0) return container.innerHTML = '<p style="color: #888; text-align: center;">কোনো ম্যাপিং নেই</p>';

    container.innerHTML = subjects.map((rule, idx) => `
        <div class="ms-settings-item ms-settings-mapping-item">
            <div class="ms-settings-mapping-info">
                <strong class="ms-text-primary">${rule.combinedName}</strong>
                <div class="ms-settings-mapping-subtext">${rule.paper1} + ${rule.paper2}</div>
            </div>
            <button class="btn-danger delete-comb-btn" data-index="${idx}" style="padding: 5px 10px;"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
}

function renderAlternativeList(container, list) {
    if (!container) return;
    if (!list || list.length === 0) return container.innerHTML = '<p style="color: #888; text-align: center;">কোনো জোড়া নেই</p>';

    container.innerHTML = list.map((p, i) => `
        <div class="ms-settings-item" style="border-left: 3px solid #9c27b0;">
            <div style="flex: 1;">
                <div style="font-size: 0.85rem; font-weight: bold;">${p.sub1}</div>
                <div style="font-size: 0.7rem; color: #777;">বিকল্প: ${p.sub2}</div>
            </div>
            <button class="btn-danger delete-alt-btn" data-index="${i}" style="padding: 2px 8px;"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}
