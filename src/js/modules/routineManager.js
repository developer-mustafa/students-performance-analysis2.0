import { db } from '../firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { state } from './state.js';
import { showNotification } from '../utils.js';
import { getClassSubjectMappings, getSettings, getExamConfigs } from '../firestoreService.js';
import { loadMarksheetRules } from './marksheetRulesManager.js';

const SETTINGS_COLLECTION = 'settings';
const ROUTINES_DOC_ID = 'admit_card_routines';

export let routinesData = {}; // Cache for all routines
let currentRoutineKey = '';

export function getRoutinesData() {
    return routinesData;
}

// UI Elements
let routineModal, closeRoutineBtn, addRowBtn, saveBtn, printAllBtn, printGroupBtn;
let rtClassSelect, rtSessionSelect, rtExamNameSelect, rtGroupSelect, routineTableBody;

const DAYS_BN = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

const GROUP_TRANSLATIONS = {
    'science': ['বিজ্ঞান', 'science', 'sci', 'sc.'],
    'humanities': ['মানবিক', 'humanities', 'arts', 'hum', 'arts group'],
    'business': ['ব্যবসায়', 'ব্যবসায়', 'ব্যবসায় শিক্ষা', 'ব্যবসায় শিক্ষা', 'business', 'commerce', 'com', 'bus'],
    'arts': ['মানবিক', 'arts', 'humanities']
};

export async function initRoutineManager() {
    routineModal = document.getElementById('acRoutineModal');
    closeRoutineBtn = document.getElementById('closeAcRoutineBtn');
    addRowBtn = document.getElementById('addRoutineRowBtn');
    saveBtn = document.getElementById('saveRoutineBtn');
    printAllBtn = document.getElementById('printAllGroupRoutineBtn');
    printGroupBtn = document.getElementById('printGroupBasedRoutineBtn');

    rtClassSelect = document.getElementById('rtClass');
    rtSessionSelect = document.getElementById('rtSession');
    rtExamNameSelect = document.getElementById('rtExamName');
    rtGroupSelect = document.getElementById('rtGroup');
    routineTableBody = document.getElementById('routineTableBody');

    // Global Event Listener for opening the modal (will be called from admitCardManager)
    document.getElementById('acRoutineBtn').addEventListener('click', openRoutineModal);

    closeRoutineBtn.addEventListener('click', () => routineModal.classList.remove('active'));
    addRowBtn.addEventListener('click', () => addRoutineRow());
    saveBtn.addEventListener('click', saveCurrentRoutine);
    
    if (printAllBtn) printAllBtn.addEventListener('click', () => printRoutine('all'));
    if (printGroupBtn) printGroupBtn.addEventListener('click', () => printRoutine('group'));

    // Filter Listeners
    [rtClassSelect, rtSessionSelect, rtExamNameSelect, rtGroupSelect].forEach(sel => {
        sel.addEventListener('change', async () => {
            updateRoutineKey();
            await loadRoutineForSelection();
        });
    });

    // Special listener for rtClass and rtSession to update Exam Name dropdown
    rtClassSelect.addEventListener('change', populateExamDropdown);
    rtSessionSelect.addEventListener('change', populateExamDropdown);

    // Initial load from Firestore
    await fetchRoutines();
}

export async function fetchRoutines() {
    try {
        const docRef = doc(db, SETTINGS_COLLECTION, ROUTINES_DOC_ID);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            routinesData = docSnap.data();
        } else {
            routinesData = {};
        }
    } catch (error) {
        console.error("Error fetching routines:", error);
    }
}

async function openRoutineModal() {
    routineModal.classList.add('active');
    populateRoutineDropdowns();
    await populateExamDropdown();
}

export function populateRoutineDropdowns() {
    // Populate Class, Session, Group using state or dynamic attributes
    // This is similar to populateACDropdowns in admitCardManager
    
    // Use attributes if they exist
    const classes = state.academicStructure?.class || [];
    const sessions = state.academicStructure?.session || [];
    const groups = state.academicStructure?.group || [];

    rtClassSelect.innerHTML = classes.map(c => `<option value="${c.value}">${c.value}</option>`).join('');
    rtSessionSelect.innerHTML = sessions.map(s => `<option value="${s.value}">${s.value}</option>`).join('');
    rtGroupSelect.innerHTML = '<option value="all">সকল গ্রুপ</option>' + 
        groups.map(g => `<option value="${g.value}">${g.value}</option>`).join('');

    // Pre-sync with main Admit Card selections if possible
    const mainClass = document.getElementById('acClass').value;
    const mainSession = document.getElementById('acSession').value;
    const mainGroup = document.getElementById('acGroup').value;

    if (mainClass) rtClassSelect.value = mainClass;
    if (mainSession) rtSessionSelect.value = mainSession;
    if (mainGroup) rtGroupSelect.value = mainGroup;

    populateExamDropdown();
}

async function populateExamDropdown() {
    try {
        const cls = rtClassSelect.value;
        const session = rtSessionSelect.value;
        
        // Fetch all configured exams from Master Config instead of just saved results
        let configs = await getExamConfigs(cls, session);
        let relevantExams = [...new Set(configs.map(e => e.examName))].filter(Boolean);

        if (relevantExams.length === 0) {
            rtExamNameSelect.innerHTML = '<option value="">প্রথমে এক্সাম কনফিগারেশন করুন</option>';
        } else {
            rtExamNameSelect.innerHTML = relevantExams.map(name => `<option value="${name}">${name}</option>`).join('');
            
            // Pre-sync with main Admit Card exam if exists
            const mainExam = document.getElementById('acExamName')?.value;
            if (mainExam && relevantExams.includes(mainExam)) {
                rtExamNameSelect.value = mainExam;
            }
        }

        updateRoutineKey();
        loadRoutineForSelection();
    } catch (error) {
        console.error("Error populating exam dropdown:", error);
    }
}

function updateRoutineKey() {
    const cls = (rtClassSelect.value || '').trim();
    const session = (rtSessionSelect.value || '').trim();
    const exam = (rtExamNameSelect.value || '').trim();
    const groupNorm = normalizeGroupName(rtGroupSelect.value);
    currentRoutineKey = `${cls}_${session}_${exam}_${groupNorm}`;
}

async function loadRoutineForSelection() {
    routineTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i>লোড হচ্ছে...</td></tr>';
    const routine = routinesData[currentRoutineKey];
    
    // Clear the loading message
    routineTableBody.innerHTML = '';
    
    if (routine && routine.rows) {
        for (const rowData of routine.rows) {
            await addRoutineRow(rowData);
        }
    } else {
        // Add 3 empty rows by default if no data, sequentially
        for (let i = 0; i < 3; i++) {
            await addRoutineRow();
        }
    }
}

async function getSubjectsForCurrentClass() {
    const cls = rtClassSelect.value;
    const group = rtGroupSelect.value;
    
    let subjectGroups = {
        general: [],
        groupBased: [],
        optional: []
    };
    
    try {
        // 1. Load Marksheet Rules
        const allRules = await loadMarksheetRules();
        const rules = allRules[cls] || allRules['All'] || {};
        
        subjectGroups.general = rules.generalSubjects || [];
        const groupSubsMapping = rules.groupSubjects || {};
        const optionalSubsMapping = rules.optionalSubjects || {};

        if (group === 'all') {
            // Include everything from all groups
            Object.values(groupSubsMapping).forEach(subs => subjectGroups.groupBased.push(...subs));
            Object.values(optionalSubsMapping).forEach(subs => subjectGroups.optional.push(...subs));
        } else {
            // Specific Group Filtering:
            // Match the selected group key in the mappings
            // We search case-insensitively and with common translations
            const matchGroup = (mapping) => {
                const keys = Object.keys(mapping);
                const gValue = group.trim().toLowerCase();
                
                // 1. Exact or include match
                let foundKey = keys.find(k => k.trim().toLowerCase() === gValue) || 
                               keys.find(k => gValue.includes(k.toLowerCase()) || k.toLowerCase().includes(gValue));
                
                // 2. Common Bangladeshi Group Translations Mapping
                if (!foundKey) {
                    for (const [eng, bns] of Object.entries(GROUP_TRANSLATIONS)) {
                        if (bns.some(b => gValue.includes(b)) || gValue.includes(eng)) {
                            foundKey = keys.find(k => {
                                const kLow = k.toLowerCase();
                                return kLow.includes(eng) || bns.some(b => kLow.includes(b));
                            });
                            if (foundKey) break;
                        }
                    }
                }
                
                return foundKey ? mapping[foundKey] : [];
            };

            subjectGroups.groupBased = matchGroup(groupSubsMapping);
            subjectGroups.optional = matchGroup(optionalSubsMapping);
            
            // Also check for "General" or "সকলের জন্য" optional subjects
            const generalOptKey = Object.keys(optionalSubsMapping).find(k => k.toLowerCase().includes('general') || k.includes('সাধারণ'));
            if (generalOptKey && group !== generalOptKey) {
                const generalOpts = optionalSubsMapping[generalOptKey];
                subjectGroups.optional = [...new Set([...subjectGroups.optional, ...generalOpts])];
            }
        }
    } catch (e) {
        console.error("Error fetching rules for subjects:", e);
    }

    // Sort function for Bengali
    const bnSort = (a, b) => a.localeCompare(b, 'bn');

    // Remove duplicates and sort within each category
    subjectGroups.general = [...new Set(subjectGroups.general.filter(Boolean))].sort(bnSort);
    subjectGroups.groupBased = [...new Set(subjectGroups.groupBased.filter(Boolean))].sort(bnSort);
    subjectGroups.optional = [...new Set(subjectGroups.optional.filter(Boolean))].sort(bnSort);
    
    return subjectGroups;
}

// Helper for external modules to normalize group names for routine matching
export function normalizeGroupName(groupName) {
    if (!groupName) return 'all';
    const gn = groupName.trim().toLowerCase();
    if (gn === 'all' || gn === 'সকল গ্রুপ') return 'all';
    
    for (const [standard, variants] of Object.entries(GROUP_TRANSLATIONS)) {
        if (variants.includes(gn) || variants.some(v => gn.includes(v))) return standard;
    }
    return gn;
}

async function addRoutineRow(data = null) {
    const row = document.createElement('tr');
    
    // Auto-increment: get last seq and add 1
    let nextSeq = 1;
    const existingSeqs = Array.from(routineTableBody.querySelectorAll('.rt-seq'))
        .map(input => parseInt(input.value) || 0);
    if (existingSeqs.length > 0) {
        nextSeq = Math.max(...existingSeqs) + 1;
    }
    const currentSeq = data ? data.seq : nextSeq;
    
    const subjectData = await getSubjectsForCurrentClass();
    
    let subOptions = '<option value="">সিলেক্ট করুন</option>';
    
    if (subjectData.general.length > 0) {
        subOptions += `<optgroup label="সাধারণ বিষয় (General Subjects)">`;
        subOptions += subjectData.general.map(s => `<option value="${s}" ${data && data.subject === s ? 'selected' : ''}>${s}</option>`).join('');
        subOptions += `</optgroup>`;
    }
    
    if (subjectData.groupBased.length > 0) {
        subOptions += `<optgroup label="গ্রুপ ভিত্তিক বিষয় (Group Subjects)">`;
        subOptions += subjectData.groupBased.map(s => `<option value="${s}" ${data && data.subject === s ? 'selected' : ''}>${s}</option>`).join('');
        subOptions += `</optgroup>`;
    }
    
    if (subjectData.optional.length > 0) {
        subOptions += `<optgroup label="ঐচ্ছিক বিষয় (Optional Subjects)">`;
        subOptions += subjectData.optional.map(s => `<option value="${s}" ${data && data.subject === s ? 'selected' : ''}>${s}</option>`).join('');
        subOptions += `</optgroup>`;
    }

    row.innerHTML = `
        <td><input type="text" class="form-control rt-seq" value="${currentSeq}" style="text-align:center;"></td>
        <td><input type="date" class="form-control rt-date" value="${data ? data.date : ''}"></td>
        <td><input type="text" class="form-control rt-day" value="${data ? data.day : ''}" readonly style="background:#f8f9fa;"></td>
        <td>
            <select class="form-control rt-subject">
                ${subOptions}
            </select>
        </td>
        <td><input type="text" class="form-control rt-time" value="${data ? data.time : '১০:০০ AM'}" placeholder="e.g. 10:00 AM"></td>
        <td><button class="btn-danger rt-delete-btn" style="padding: 5px 10px;"><i class="fas fa-trash"></i></button></td>
    `;

    // Date change listener for auto-day
    const dateInput = row.querySelector('.rt-date');
    const dayInput = row.querySelector('.rt-day');
    dateInput.addEventListener('change', () => {
        const date = new Date(dateInput.value);
        if (!isNaN(date.getTime())) {
            dayInput.value = DAYS_BN[date.getDay()];
        } else {
            dayInput.value = '';
        }
    });

    // Subject change listener to prevent duplicates dynamically
    const subjectSelect = row.querySelector('.rt-subject');
    subjectSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        if (!selectedValue) return;

        // Count how many times this subject is selected in the table
        const allSubjectSelects = routineTableBody.querySelectorAll('.rt-subject');
        let count = 0;
        allSubjectSelects.forEach(select => {
            if (select.value === selectedValue) count++;
        });

        if (count > 1) {
            showNotification('এই বিষয়টি ইতিমধ্যে রুটিনে যুক্ত করা হয়েছে!', 'warning');
            e.target.value = ''; // Reset the selection
            
            // Highlight the select briefly to show the error
            e.target.style.border = '2px solid var(--danger)';
            setTimeout(() => e.target.style.border = '', 2000);
        }
    });

    // Delete row
    row.querySelector('.rt-delete-btn').addEventListener('click', () => {
        row.remove();
        resequenceRows();
    });

    routineTableBody.appendChild(row);
}

function resequenceRows() {
    const rows = routineTableBody.querySelectorAll('tr');
    rows.forEach((row, i) => {
        row.querySelector('.rt-seq').value = i + 1;
    });
}

async function saveCurrentRoutine() {
    updateRoutineKey();
    if (!rtExamNameSelect.value) {
        showNotification('সঠিক তথ্য (শ্রেণি, সেশন, পরীক্ষা) নিশ্চিত করুন', 'warning');
        return;
    }

    const rows = [];
    const tableRows = routineTableBody.querySelectorAll('tr');
    
    if (tableRows.length === 0) {
        showNotification('রুটিনে কোনো তথ্য নেই', 'warning');
        return;
    }

    let hasDuplicates = false;
    const seenSubjects = new Set();

    tableRows.forEach(tr => {
        const seq = tr.querySelector('.rt-seq').value;
        const date = tr.querySelector('.rt-date').value;
        const day = tr.querySelector('.rt-day').value;
        const subjectSelect = tr.querySelector('.rt-subject');
        const subject = subjectSelect.value;
        const time = tr.querySelector('.rt-time').value;
        
        if (subject) {
            if (seenSubjects.has(subject)) {
                hasDuplicates = true;
                subjectSelect.style.border = '2px solid var(--danger)';
                setTimeout(() => subjectSelect.style.border = '', 3000);
            } else {
                seenSubjects.add(subject);
            }
        }

        if (date || subject) {
            rows.push({ seq, date, day, subject, time });
        }
    });

    if (hasDuplicates) {
        showNotification('রুটিনে একই বিষয় একাধিকবার যুক্ত করা হয়েছে! দয়া করে সংশোধন করুন।', 'error');
        return;
    }

    if (rows.length === 0) {
        showNotification('কমপক্ষে একটি বিয়য় ও তারিখ দিন', 'warning');
        return;
    }

    try {
        routinesData[currentRoutineKey] = { 
            rows: rows.sort((a,b) => Number(a.seq) - Number(b.seq)), 
            updatedAt: new Date().toISOString() 
        };
        const docRef = doc(db, SETTINGS_COLLECTION, ROUTINES_DOC_ID);
        await setDoc(docRef, routinesData, { merge: true });
        showNotification('রুটিন সফলভাবে সেভ করা হয়েছে', 'success');
    } catch (e) {
        console.error("Save error:", e);
        showNotification('সেভ করতে সমস্যা হয়েছে: ' + e.message, 'error');
    }
}

async function printRoutine(mode = 'group') {
    const cls = rtClassSelect.value;
    const session = rtSessionSelect.value;
    const examName = rtExamNameSelect.value;
    
    if (!examName) {
        showNotification('প্রথমে পরীক্ষা নির্বাচন করুন', 'warning');
        return;
    }

    // Collection of routines to print
    const routinesToPrint = [];

    if (mode === 'all') {
        const groups = ['science', 'business', 'humanities'];
        for (const g of groups) {
            const key = `${cls}_${session}_${examName}_${g}`;
            const routine = routinesData[key];
            if (routine && routine.rows && routine.rows.length > 0) {
                // Get display name for group
                let displayGroup = g === 'science' ? 'বিজ্ঞান' : (g === 'business' ? 'ব্যবসায় শিক্ষা' : 'মানবিক');
                routinesToPrint.push({
                    groupName: displayGroup,
                    rows: routine.rows.sort((a, b) => Number(a.seq) - Number(b.seq))
                });
            }
        }
    } else {
        const currentKey = `${cls}_${session}_${examName}_${normalizeGroupName(rtGroupSelect.value)}`;
        const routine = routinesData[currentKey];
        if (!routine || !routine.rows || routine.rows.length === 0) {
            showNotification('এই গ্রুপের জন্য কোনো রুটিন পাওয়া যায়নি', 'warning');
            return;
        }
        routinesToPrint.push({
            groupName: rtGroupSelect.options[rtGroupSelect.selectedIndex].text,
            rows: routine.rows.sort((a, b) => Number(a.seq) - Number(b.seq))
        });
    }

    if (routinesToPrint.length === 0) {
        showNotification('প্রিন্ট করার মতো কোনো তথ্য পাওয়া যায়নি', 'warning');
        return;
    }

    // Get dynamic header info from Admit Card Configuration
    const appSettings = await getSettings() || {};
    const acConfig = appSettings.admitCard || {};
    
    const instName = acConfig.instName || appSettings.institutionName || 'শিক্ষা প্রতিষ্ঠান';
    const instAddress = acConfig.instAddress || appSettings.institutionAddress || '';
    const logoUrl = acConfig.logoUrl || appSettings.logoUrl || '';
    const watermarkUrl = acConfig.watermarkUrl || '';

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Routine Print - ${instName}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap');
                
                * { box-sizing: border-box; }
                body { 
                    font-family: 'Hind Siliguri', sans-serif; 
                    padding: 0; 
                    margin: 0;
                    color: #2c3e50; 
                    background: #f0f2f5;
                }
                
                .print-page {
                    width: 210mm;
                    min-height: 297mm;
                    padding: 15mm;
                    margin: 10mm auto;
                    background: white;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    position: relative;
                }

                /* Watermark */
                ${watermarkUrl ? `
                .watermark {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-30deg);
                    width: 400px;
                    height: 400px;
                    opacity: 0.04;
                    pointer-events: none;
                    z-index: 0;
                    background: url('${watermarkUrl}') no-repeat center center;
                    background-size: contain;
                }
                ` : ''}

                .content-wrapper {
                    position: relative;
                    z-index: 1;
                }

                .header { 
                    text-align: center; 
                    border-bottom: 2px double #2c3e50; 
                    padding-bottom: 12px; 
                    margin-bottom: 20px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    gap: 20px; 
                }
                
                .logo { 
                    width: 70px; 
                    height: 70px; 
                    object-fit: contain; 
                }
                
                .header-text h1 { 
                    margin: 0; 
                    font-size: 24px; 
                    color: #1a237e; 
                    font-weight: 700;
                }
                
                .header-text p { 
                    margin: 3px 0 0 0; 
                    font-size: 13px; 
                    color: #555; 
                }
                
                .routine-section {
                    margin-bottom: 40px;
                    page-break-inside: avoid;
                }

                .exam-title-card { 
                    text-align: center; 
                    margin-bottom: 15px; 
                    background: #f8f9fa;
                    padding: 10px;
                    border-radius: 6px;
                    border-left: 5px solid #1a237e;
                }
                
                .exam-title-card h2 { 
                    margin: 0; 
                    font-size: 18px; 
                    color: #c62828; 
                }
                
                .exam-title-card p { 
                    margin: 5px 0 0 0; 
                    font-weight: 600; 
                    font-size: 15px; 
                }
                
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    background: white;
                }
                
                th, td { 
                    border: 1px solid #2c3e50; 
                    padding: 10px 8px; 
                    text-align: center; 
                    font-size: 14px; 
                }
                
                th { 
                    background-color: #f1f4f9; 
                    color: #1a237e;
                    font-weight: 700; 
                }
                
                .subject-cell { 
                    text-align: left; 
                    padding-left: 15px; 
                }

                .footer { 
                    margin-top: 50px; 
                    display: flex; 
                    justify-content: space-between; 
                    padding: 0 10px;
                }
                
                .sig-box { 
                    border-top: 1.5px solid #2c3e50; 
                    width: 160px; 
                    text-align: center; 
                    padding-top: 5px; 
                    font-size: 14px; 
                    font-weight: 600; 
                }

                .print-info {
                    position: fixed;
                    bottom: 5mm;
                    left: 15mm;
                    font-size: 9px;
                    color: #999;
                }
                
                @media print {
                    body { background: none; }
                    .print-page { 
                        margin: 0; 
                        box-shadow: none; 
                        width: 100%;
                        min-height: auto;
                        padding: 10mm;
                    }
                    @page {
                        size: A4;
                        margin: 10mm;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-page">
                ${watermarkUrl ? `<div class="watermark"></div>` : ''}
                
                <div class="header">
                    ${logoUrl ? `<img src="${logoUrl}" class="logo">` : ''}
                    <div class="header-text">
                        <h1>${instName}</h1>
                        <p>${instAddress}</p>
                    </div>
                </div>

                <div class="content-wrapper">
                    ${routinesToPrint.map(routine => `
                        <div class="routine-section">
                            <div class="exam-title-card">
                                <h2>${examName} এর সময়সূচী</h2>
                                <p>শ্রেণি: ${cls} | সেশন: ${session} | গ্রুপ: ${routine.groupName}</p>
                            </div>
                            
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width: 8%;">নং</th>
                                        <th style="width: 22%;">তারিখ</th>
                                        <th style="width: 15%;">বার</th>
                                        <th>বিষয়</th>
                                        <th style="width: 18%;">সময়</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${routine.rows.map(r => `
                                        <tr>
                                            <td style="font-weight:bold;">${convertToBengaliDigits(r.seq)}</td>
                                            <td>${formatDateBengali(r.date)}</td>
                                            <td>${r.day}</td>
                                            <td class="subject-cell">${r.subject}</td>
                                            <td>${r.time || ''}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `).join('')}
                    
                    <div class="footer">
                        <div class="sig-box">পরীক্ষা নিয়ন্ত্রক</div>
                        <div class="sig-box">প্রধান শিক্ষক</div>
                    </div>
                </div>

                <div class="print-info" style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px; line-height: 1.4;">
                    <div style="font-weight: 500;">প্রিন্টের তারিখ: ${new Date().toLocaleString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                    ${appSettings.developerCredit?.enabled !== false ? `
                    <div style="opacity: 0.9; font-size: 0.85em;">
                        ${appSettings.developerCredit?.text || 'সফটওয়্যার নির্মাতা:'} 
                        <strong style="color: #1a237e;">${appSettings.developerCredit?.name || ''}</strong> 
                        ${appSettings.developerCredit?.link ? ` | <span style="font-size: 0.9em;">${appSettings.developerCredit.link}</span>` : ''}
                    </div>` : ''}
                </div>
            </div>

            <script>
                function formatDateBengali(dateStr) {
                    if(!dateStr) return '';
                    const date = new Date(dateStr);
                    const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
                    const enDigits = ['0','1','2','3','4','5','6','7','8','9'];
                    const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
                    const d = date.getDate().toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
                    const m = months[date.getMonth()];
                    const y = date.getFullYear().toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
                    return d + ' ' + m + ', ' + y;
                }
                
                window.onload = () => {
                    setTimeout(() => {
                        window.print();
                    }, 500);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Utility to convert numbers to Bengali digits
 */
function convertToBengaliDigits(num) {
    const enDigits = ['0','1','2','3','4','5','6','7','8','9'];
    const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    return num.toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
}

function formatDateBengali(dateStr) {
    if(!dateStr) return '';
    const date = new Date(dateStr);
    const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
    const enDigits = ['0','1','2','3','4','5','6','7','8','9'];
    const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    
    const d = date.getDate().toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
    const m = months[date.getMonth()];
    const y = date.getFullYear().toString().split('').map(c => bnDigits[enDigits.indexOf(c)] || c).join('');
    
    return d + ' ' + m + ', ' + y;
}
