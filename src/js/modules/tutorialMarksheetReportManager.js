/**
 * Tutorial Marksheet Report Manager
 * Generates the premium A4 landscape tutorial report card
 */

import { state } from './state.js';
import { getSavedExamsByType, getUnifiedStudents, getStudentLookupMap, generateStudentDocId } from '../firestoreService.js';
import { loadMarksheetSettings, getMarksheetSettings } from './marksheetManager.js';
import { loadMarksheetRules, currentMarksheetRules } from './marksheetRulesManager.js';
import { showNotification, convertToBengaliDigits, convertToEnglishDigits, normalizeText } from '../utils.js';
import { showLoading, hideLoading } from './uiManager.js';
import QRCode from 'qrcode';
import { getSubjectConfigs } from '../firestoreService.js';

let tutExamsData = [];
let tutStudentsData = [];
let tutSubjectsSet = new Set();
let tutConfigData = null;
let tutHiddenSubjects = new Set(); // Subjects to hide from view
let tutLastGenParams = null; // Store last generation params for re-render

export async function initTutorialMarksheetReport() {
    console.log("Initializing Tutorial Marksheet Report Module...");
    await populateTutMsDropdowns();
    
    // Bind controls
    const generateBtn = document.getElementById('tutMsGenerateBtn');
    const resetBtn = document.getElementById('tutMsResetBtn');
    const printBtn = document.getElementById('tutMsPrintBtn');
    const zoomSlider = document.getElementById('tutMsZoom');
    
    if (generateBtn) generateBtn.onclick = generateTutorialReport;
    if (resetBtn) resetBtn.onclick = resetTutorialReport;
    if (printBtn) printBtn.onclick = printTutorialReport;
    
    if (zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            const previewArea = document.getElementById('tutMsPreview');
            const zoomLevel = document.getElementById('tutMsZoomLevel');
            if (previewArea && zoomLevel) {
                const val = e.target.value;
                previewArea.style.transform = `scale(${val})`;
                zoomLevel.textContent = Math.round(val * 100) + '%';
            }
        });
    }
    
    // View Settings Panel
    const vsBtn = document.getElementById('tutMsViewSettingsBtn');
    const vsClose = document.getElementById('tutMsViewSettingsClose');
    const vsPanel = document.getElementById('tutMsViewSettings');
    const selectAll = document.getElementById('tutMsSelectAll');
    const deselectAll = document.getElementById('tutMsDeselectAll');
    const applyFilter = document.getElementById('tutMsApplyFilter');
    
    if (vsBtn) vsBtn.onclick = () => openViewSettings();
    if (vsClose) vsClose.onclick = () => closeViewSettings();
    if (selectAll) selectAll.onclick = () => { document.querySelectorAll('#tutMsSubjectList input').forEach(cb => cb.checked = true); };
    if (deselectAll) deselectAll.onclick = () => { document.querySelectorAll('#tutMsSubjectList input').forEach(cb => cb.checked = false); };
    if (applyFilter) applyFilter.onclick = () => applySubjectFilter();
}

async function populateTutMsDropdowns() {
    const classSelect = document.getElementById('tutMsClass');
    const sessionSelect = document.getElementById('tutMsSession');
    const examSelect = document.getElementById('tutMsExamName');
    const groupSelect = document.getElementById('tutMsGroup');
    const studentSelect = document.getElementById('tutMsStudent');
    
    if (!classSelect || !sessionSelect || !examSelect || !studentSelect || !groupSelect) return;
    
    // Fetch only tutorial exams
    tutExamsData = await getSavedExamsByType('tutorial');
    
    // Only populate if empty
    if (classSelect.options.length <= 1) {
        const classes = [...new Set(tutExamsData.map(e => e.class).filter(Boolean))].sort();
        classSelect.innerHTML = '<option value="">শ্রেণি নির্বাচন</option>';
        classes.forEach(c => classSelect.innerHTML += `<option value="${c}">${c}</option>`);
    }

    if (sessionSelect.options.length <= 1) {
        const sessions = [...new Set(tutExamsData.map(e => e.session).filter(Boolean))].sort().reverse();
        sessionSelect.innerHTML = '<option value="">সেশন নির্বাচন</option>';
        sessions.forEach(s => sessionSelect.innerHTML += `<option value="${s}">${s}</option>`);
    }
    
    const updateExams = () => {
        const c = classSelect.value;
        const s = sessionSelect.value;
        if (!c || !s) {
            examSelect.innerHTML = '<option value="">শ্রেণি ও সেশন নির্বাচন করুন</option>';
            return;
        }
        
        const filtered = tutExamsData.filter(e => e.class === c && e.session === s);
        const names = [...new Set(filtered.map(e => e.examName || e.name).filter(Boolean))].sort();
        
        examSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন</option>';
        if (names.length === 0) {
            examSelect.innerHTML += '<option value="">কোনো টিউটোরিয়াল পরীক্ষা নেই</option>';
        } else {
            names.forEach(n => examSelect.innerHTML += `<option value="${n}">${n}</option>`);
        }
        updateStudents();
    };
    
    const updateStudents = async () => {
        const c = classSelect.value;
        const s = sessionSelect.value;
        const g = groupSelect.value;
        const ex = examSelect.value;
        
        studentSelect.innerHTML = '<option value="all">সকল শিক্ষার্থী</option>';
        
        if (!c || !s || !ex) return;
        
        // Find students who participated in this specific tutorial exam
        const filteredExams = tutExamsData.filter(e => e.class === c && e.session === s && (e.name === ex || e.examName === ex));
        const studentsMap = new Map();
        
        filteredExams.forEach(exam => {
            if (exam.studentData) {
                exam.studentData.forEach(student => {
                    if (g !== 'all' && student.group !== g) return;
                    studentsMap.set(student.id, {
                        id: student.id,
                        name: student.name,
                        group: student.group
                    });
                });
            }
        });
        
        const lookupMap = await getStudentLookupMap();
        
        [...studentsMap.values()].sort((a,b) => parseInt(a.id) - parseInt(b.id)).forEach(student => {
            const studentKey = generateStudentDocId({
                id: student.id,
                group: student.group,
                class: c,
                session: s
            });
            const latest = lookupMap.get(studentKey);
            if (latest && String(latest.status) === 'false') return; // Skip inactive
            
            const name = latest ? (latest.name || student.name) : student.name;
            studentSelect.innerHTML += `<option value="${student.id}_${student.group}">${student.id} - ${name}</option>`;
        });
    };
    
    classSelect.onchange = updateExams;
    sessionSelect.onchange = updateExams;
    examSelect.onchange = updateStudents;
    groupSelect.onchange = updateStudents;
}

// --------------------------------------------------------------------------------------
// VIEW SETTINGS PANEL LOGIC
// --------------------------------------------------------------------------------------

function openViewSettings() {
    const panel = document.getElementById('tutMsViewSettings');
    let overlay = document.querySelector('.tr-vs-overlay');
    
    // Create overlay if not exists
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'tr-vs-overlay';
        overlay.onclick = closeViewSettings;
        document.body.appendChild(overlay);
    }
    
    // Populate subjects list based on current exam data
    const list = document.getElementById('tutMsSubjectList');
    list.innerHTML = '';
    
    if (tutSubjectsSet.size === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--tr-text-muted); font-size: 0.8rem;">প্রথমে রিপোর্ট তৈরি করুন</div>';
    } else {
        tutSubjectsSet.forEach(subj => {
            const isChecked = !tutHiddenSubjects.has(subj);
            list.innerHTML += `
                <div class="tr-vs-item">
                    <input type="checkbox" id="vs_sub_${subj}" value="${subj}" ${isChecked ? 'checked' : ''}>
                    <label for="vs_sub_${subj}">${subj}</label>
                </div>
            `;
        });
    }
    
    panel.style.display = 'flex';
    overlay.style.display = 'block';
}

function closeViewSettings() {
    const panel = document.getElementById('tutMsViewSettings');
    const overlay = document.querySelector('.tr-vs-overlay');
    if (panel) panel.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
}

function applySubjectFilter() {
    tutHiddenSubjects.clear();
    const checkboxes = document.querySelectorAll('#tutMsSubjectList input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (!cb.checked) {
            tutHiddenSubjects.add(cb.value);
        }
    });
    
    closeViewSettings();
    
    // Re-generate report if params exist
    if (tutLastGenParams) {
        generateReportContent(tutLastGenParams);
    }
}

function resetTutorialReport() {
    document.getElementById('tutMsPreviewWrapper').style.display = 'none';
    document.getElementById('tutMsEmptyState').style.display = 'flex';
    document.getElementById('tutMsPreview').innerHTML = '';
}

function printTutorialReport() {
    document.body.classList.add('tr-printing');
    
    // Small delay to let print CSS apply
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            document.body.classList.remove('tr-printing');
        }, 500);
    }, 100);
}

// --------------------------------------------------------------------------------------
// SVG CHART GENERATOR
// --------------------------------------------------------------------------------------
function generateSVGChart(months, scores, percentages) {
    // VERTICAL Bar Chart — Clean, no ghost bars for empty months
    const maxScore = Math.max(...scores.filter(s => s >= 0), 10);
    const xMax = Math.ceil(maxScore / 50) * 50 || 50;

    const width = 960;
    const height = 250;
    const padding = { top: 36, right: 52, bottom: 34, left: 44 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const numPoints = months.length;
    if (numPoints === 0) {
        return '<svg viewBox="0 0 ' + width + ' ' + height + '"><text x="50%" y="50%" text-anchor="middle" font-family="inherit" fill="#64748b">No data</text></svg>';
    }

    const spacing = chartW / numPoints;
    const barW = Math.min(48, spacing * 0.56);

    let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style="font-family:inherit;width:100%;height:100%;display:block;">';

    // Defs
    svg += '<defs>';
    svg += '<linearGradient id="trBarGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1e40af"/></linearGradient>';
    svg += '<filter id="trShadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="1" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.08"/></filter>';
    svg += '</defs>';

    // Y-axis grid lines & labels
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + chartH - (i / 5) * chartH;
        const val = Math.round((i / 5) * xMax);
        svg += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="1"' + (i > 0 ? ' stroke-dasharray="4,4"' : '') + '/>';
        svg += '<text x="' + (padding.left - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="#64748b" font-weight="700">' + val + '</text>';
    }

    // First pass: draw bars (only for months WITH data)
    const barTops = [];

    for (let idx = 0; idx < numPoints; idx++) {
        const cx = padding.left + (idx + 0.5) * spacing;
        const score = scores[idx];
        const bX = cx - barW / 2;

        if (score >= 0) {
            const bH = (score / xMax) * chartH;
            const bY = padding.top + chartH - bH;
            svg += '<rect x="' + bX + '" y="' + bY + '" width="' + barW + '" height="' + bH + '" fill="url(#trBarGrad)" rx="4" filter="url(#trShadow)"/>';

            // Score label INSIDE bar (white) or above
            if (bH > 22) {
                svg += '<text x="' + cx + '" y="' + (bY + 18) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">' + score + '</text>';
            } else {
                svg += '<text x="' + cx + '" y="' + (bY - 4) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#1e293b">' + score + '</text>';
            }

            barTops.push({ cx: cx, bY: bY, idx: idx, pct: percentages[idx] });
        } else {
            // NO ghost bar — just a clean "—" at baseline
            const baseY = padding.top + chartH;
            svg += '<text x="' + cx + '" y="' + (baseY - 6) + '" text-anchor="middle" font-size="11" fill="#cbd5e1" font-weight="600">—</text>';
            barTops.push(null);
        }
    }

    // Second pass: draw trend line connecting BAR TOPS
    let linePath = '';
    let prevPoint = null;

    for (let i = 0; i < barTops.length; i++) {
        const pt = barTops[i];
        if (pt === null) continue;

        // Connect with dashed line if there was a gap
        if (prevPoint !== null && prevPoint.idx !== i - 1) {
            svg += '<path d="M ' + prevPoint.cx + ' ' + prevPoint.bY + ' L ' + pt.cx + ' ' + pt.bY + '" fill="none" stroke="#f97316" stroke-width="2" stroke-dasharray="6,4" opacity="0.6"/>';
        }

        if (linePath === '') linePath += 'M ' + pt.cx + ' ' + pt.bY;
        else linePath += ' L ' + pt.cx + ' ' + pt.bY;

        prevPoint = pt;
    }

    // Draw the solid trend line
    if (linePath !== '') {
        svg += '<path d="' + linePath + '" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linejoin="round"/>';
    }

    // Third pass: draw dots at bar tops and percentage labels ABOVE dots
    for (let i = 0; i < barTops.length; i++) {
        const pt = barTops[i];
        if (pt === null) continue;

        // Dot at bar top
        svg += '<circle cx="' + pt.cx + '" cy="' + pt.bY + '" r="5" fill="#fff" stroke="#ef4444" stroke-width="2.5"/>';

        // Percentage label ABOVE the dot
        svg += '<text x="' + pt.cx + '" y="' + (pt.bY - 10) + '" text-anchor="middle" font-size="11" font-weight="800" fill="#059669">' + pt.pct.toFixed(1) + '%</text>';
    }

    // Month labels at bottom
    for (let idx = 0; idx < numPoints; idx++) {
        const month = months[idx];
        const cx = padding.left + (idx + 0.5) * spacing;
        const isActive = scores[idx] >= 0;
        const fillColor = isActive ? '#1e293b' : '#b0b8c4';
        const fWeight = isActive ? '800' : '500';
        const fSize = isActive ? '14' : '12';
        svg += '<text x="' + cx + '" y="' + (height - padding.bottom + 20) + '" text-anchor="middle" font-size="' + fSize + '" fill="' + fillColor + '" font-weight="' + fWeight + '">' + month + '</text>';
    }

    svg += '</svg>';

    // Info note
    let hasEmpty = false;
    for (let i = 0; i < scores.length; i++) { if (scores[i] < 0) { hasEmpty = true; break; } }
    let noteText = '';
    if (hasEmpty) {
        noteText = '<div style="text-align:center;font-size:0.55rem;color:#94a3b8;margin-top:2px;font-weight:500;"><i class="fas fa-info-circle" style="margin-right:3px;"></i>যে মাসে ডাটা ইনপুট না থাকায় চার্টে প্রদর্শিত হয়নি</div>';
    }

    return svg + noteText;
}

// --------------------------------------------------------------------------------------
// MAIN GENERATION
// --------------------------------------------------------------------------------------

export async function generateTutorialReport() {
    const c = document.getElementById('tutMsClass').value;
    const s = document.getElementById('tutMsSession').value;
    const ex = document.getElementById('tutMsExamName').value;
    const grp = document.getElementById('tutMsGroup').value;
    const stu = document.getElementById('tutMsStudent').value;
    
    if (!c || !s || !ex) {
        showNotification('শ্রেণি, সেশন এবং পরীক্ষা নির্বাচন করুন!', 'warning');
        return;
    }
    
    // Store params for re-rendering after filter
    tutLastGenParams = { c, s, ex, grp, stu };
    generateReportContent(tutLastGenParams);
}

async function generateReportContent(params) {
    const { c, s, ex, grp, stu } = params;
    
    showLoading('রিপোর্ট কার্ড তৈরি হচ্ছে...');
    
    try {
        await loadMarksheetSettings();
        await loadMarksheetRules();
        tutConfigData = getMarksheetSettings();
        
        // Fallback info if not set
        if(!tutConfigData.institutionName) tutConfigData.institutionName = 'আপনার শিক্ষাপ্রতিষ্ঠান';
        if(!tutConfigData.institutionAddress) tutConfigData.institutionAddress = 'ঠিকানা এখানে';
        
        const masterConfigs = await getSubjectConfigs() || {};
        const lookupMap = await getStudentLookupMap();
        
        // 1. Gather ALL tutorial exams for this class/session to build history
        const allTutExamsForClass = tutExamsData.filter(e => e.class === c && e.session === s).sort((a,b) => {
            let tA = 0, tB = 0;
            if (a.createdAt) tA = typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime());
            if (b.createdAt) tB = typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime());
            return tA - tB || 0;
        });
        
        // Extract up to last 12 unique months/exams for chart
        const uniqueExamsMap = new Map();
        allTutExamsForClass.forEach(e => {
            const eName = e.examName || e.name;
            if(!uniqueExamsMap.has(eName)) {
                // Determine a short month name. E.g. "জানুয়ারি ২০২৪"
                let shortName = eName;
                const match = eName.match(/(জানুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর) (\d{4}|২০\d{2})/);
                if(match) shortName = `${match[1]} ${match[2]}`;
                else if (eName.includes('টিউটোরিয়াল')) shortName = eName.replace('টিউটোরিয়াল', '').trim();
                
                uniqueExamsMap.set(eName, shortName);
            }
        });
        
        const historyExamsList = [...uniqueExamsMap.keys()]; // Keep all for chronological order
        const targetExamIndex = historyExamsList.indexOf(ex);
        const prevExamName = targetExamIndex > 0 ? historyExamsList[targetExamIndex - 1] : null;
        
        // Get target exam docs
        const targetExams = tutExamsData.filter(e => e.class === c && e.session === s && (e.name === ex || e.examName === ex));
        const prevExams = prevExamName ? tutExamsData.filter(e => e.class === c && e.session === s && (e.name === prevExamName || e.examName === prevExamName)) : [];
        
        // Aggregate students
        const studentAgg = new Map();
        
        const processExamList = (examList, isCurrent) => {
            examList.forEach(exam => {
                if(!exam.studentData) return;
                
                // For each subject, find max mark from configs
                let maxMark = 30; // default fallback
                let sConf = masterConfigs[exam.subject];
                if(sConf && sConf.tutorial && sConf.tutorial.total) maxMark = Number(sConf.tutorial.total);
                else if (sConf && sConf.total) maxMark = Number(sConf.total);
                
                exam.studentData.forEach(st => {
                    if (grp !== 'all' && st.group !== grp) return;
                    if (stu !== 'all' && `${st.id}_${st.group}` !== stu) return;
                    
                    const key = `${st.id}_${st.group}`;
                    if(!studentAgg.has(key)) {
                        studentAgg.set(key, {
                            id: st.id,
                            name: st.name,
                            group: st.group,
                            history: {},     // examName -> {totalMarks, maxMarks}
                            currentSubs: {}, // subjName -> mark
                            prevSubs: {},    // subjName -> mark
                            maxMarksMap: {}  // subjName -> maxMark
                        });
                    }
                    
                    const sData = studentAgg.get(key);
                    const mark = Number(st.total || 0);
                    
                    if (isCurrent) {
                        // Track all unique subjects found in current exam
                        tutSubjectsSet.add(exam.subject);
                        
                        // Apply filter: skip if subject is hidden via View Settings
                        if (!tutHiddenSubjects.has(exam.subject)) {
                            sData.currentSubs[exam.subject] = mark;
                            sData.maxMarksMap[exam.subject] = maxMark;
                        }
                    } else if (prevExams === examList) {
                        if (!tutHiddenSubjects.has(exam.subject)) {
                            sData.prevSubs[exam.subject] = mark;
                        }
                    }
                });
            });
        };
        
        // FIRST: Process target and previous exams to populate studentAgg
        processExamList(targetExams, true);
        if(prevExams.length > 0) processExamList(prevExams, false);
        
        // THEN: Process history (requires studentAgg to be populated)
        historyExamsList.forEach(hExamName => {
            const hExams = tutExamsData.filter(e => e.class === c && e.session === s && (e.name === hExamName || e.examName === hExamName));
            hExams.forEach(exam => {
                if(!exam.studentData) return;
                
                let maxMark = 30; // default fallback
                let sConf = masterConfigs[exam.subject];
                if(sConf && sConf.tutorial && sConf.tutorial.total) maxMark = Number(sConf.tutorial.total);
                else if (sConf && sConf.total) maxMark = Number(sConf.total);
                
                exam.studentData.forEach(st => {
                    const key = `${st.id}_${st.group}`;
                    if(studentAgg.has(key)) {
                        // Apply filter: skip if subject is hidden
                        if (!tutHiddenSubjects.has(exam.subject)) {
                            const sData = studentAgg.get(key);
                            if(!sData.history[hExamName]) sData.history[hExamName] = { marks: 0, max: 0 };
                            sData.history[hExamName].marks += Number(st.total || 0);
                            sData.history[hExamName].max += maxMark;
                        }
                    }
                });
            });
        });
        
        const finalStudents = [...studentAgg.values()].sort((a,b) => parseInt(a.id) - parseInt(b.id));
        
        if (finalStudents.length === 0) {
            hideLoading();
            showNotification('শিক্ষার্থীর কোনো ফলাফল পাওয়া যায়নি', 'warning');
            return;
        }
        
        // Render
        const previewWrapper = document.getElementById('tutMsPreviewWrapper');
        const emptyState = document.getElementById('tutMsEmptyState');
        const previewArea = document.getElementById('tutMsPreview');
        
        let htmlOut = '';
        
        for (const st of finalStudents) {
            htmlOut += await generateSingleCard(st, c, s, ex, prevExamName, historyExamsList, uniqueExamsMap);
        }
        
        previewArea.innerHTML = htmlOut;
        emptyState.style.display = 'none';
        previewWrapper.style.display = 'block';
        
        hideLoading();
    } catch(err) {
        console.error(err);
        hideLoading();
        showNotification('রিপোর্ট তৈরিতে সমস্যা হয়েছে', 'error');
    }
}

async function generateSingleCard(student, className, session, currentExamName, prevExamName, historyList, shortNameMap) {
    const rules = currentMarksheetRules[className] || currentMarksheetRules["All"] || {};
    
    // Sort subjects based on rules
    let subjectList = Object.keys(student.currentSubs);
    const gen = rules.generalSubjects || [];
    const grp = (rules.groupSubjects || {})[student.group] || [];
    const opt = (rules.optionalSubjects || {})[student.group] || [];
    
    // --- Hierarchical Subject Sorting (matching main Marksheet) ---
    subjectList.sort((a, b) => {
        const getScore = (sub) => {
            // 1. General Subjects (index-based priority from rules)
            const genIdx = gen.indexOf(sub);
            if (genIdx !== -1) return 1000 + genIdx;
            
            // 2. Group Subjects
            const grpIdx = grp.indexOf(sub);
            if (grpIdx !== -1) return 2000 + grpIdx;
            
            // 3. Optional Subjects (always at end)
            const optIdx = opt.indexOf(sub);
            if (optIdx !== -1) return 5000 + optIdx;
            
            // 4. Everything else
            return 3000;
        };
        
        const scoreA = getScore(a);
        const scoreB = getScore(b);
        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.localeCompare(b, 'bn');
    });
    // Remove hidden subjects
    subjectList = subjectList.filter(sub => !tutHiddenSubjects.has(sub));
    
    let totalCur = 0;
    let totalMax = 0;
    let totalPrev = 0;
    let totalPrevMax = 0;
    
    let tableRows = '';
    
    subjectList.forEach((sub, idx) => {
        const cMark = student.currentSubs[sub] || 0;
        const maxM = student.maxMarksMap[sub] || 30;
        const pMark = student.prevSubs[sub];
        
        totalCur += cMark;
        totalMax += maxM;
        
        const cPct = (cMark / maxM) * 100;
        let pText = '-';
        let pPctText = '-';
        let diffHtml = '<span class="tr-improve-same">-</span>';
        
        if (pMark !== undefined) {
            totalPrev += pMark;
            totalPrevMax += maxM;
            const pPct = (pMark / maxM) * 100;
            pText = convertToBengaliDigits(pMark);
            pPctText = pPct.toFixed(2) + '%';
            
            const diff = cMark - pMark;
            const diffPct = cPct - pPct;
            
            if (diff > 0) {
                diffHtml = `<span class="tr-improve-up">+${convertToBengaliDigits(diff)} <i class="fas fa-arrow-up" style="font-size:0.5rem;margin-left:4px;"></i> ${diffPct.toFixed(2)}%</span>`;
            } else if (diff < 0) {
                diffHtml = `<span class="tr-improve-down">${convertToBengaliDigits(diff)} <i class="fas fa-arrow-down" style="font-size:0.5rem;margin-left:4px;"></i> ${diffPct.toFixed(2)}%</span>`;
            } else {
                diffHtml = `<span class="tr-improve-same">অপরিবর্তিত</span>`;
            }
        }
        
        tableRows += `
            <tr>
                <td style="text-align:center;font-weight:800;color:var(--tr-text-muted);">${convertToBengaliDigits(idx + 1)}</td>
                <td>${sub}</td>
                <td>${convertToBengaliDigits(maxM)}</td>
                <td>${pText}</td>
                <td>${pPctText}</td>
                <td class="tr-col-current">${convertToBengaliDigits(cMark)}</td>
                <td class="tr-col-current">${cPct.toFixed(2)}%</td>
                <td>${diffHtml}</td>
            </tr>
        `;
    });
    
    const curTotalPct = totalMax > 0 ? (totalCur / totalMax) * 100 : 0;
    let prevTotalPct = totalPrevMax > 0 ? (totalPrev / totalPrevMax) * 100 : null;
    
    // Summary KPI values
    const avgScore = subjectList.length > 0 ? (totalCur / subjectList.length) : 0;
    const avgMax = subjectList.length > 0 ? (totalMax / subjectList.length) : 30;
    
    let diffTotalHtml = '<span class="tr-improve-same">-</span>';
    let diffTotalMark = 0;
    let diffTotalPct = 0;
    
    if(prevTotalPct !== null) {
        diffTotalMark = totalCur - totalPrev;
        diffTotalPct = curTotalPct - prevTotalPct;
        
        if (diffTotalMark > 0) {
            diffTotalHtml = `<span class="tr-improve-up" style="color:var(--tr-green);">+${convertToBengaliDigits(diffTotalMark)} <br><small style="font-size:0.55rem;">(+${diffTotalPct.toFixed(2)}%)</small></span>`;
        } else if (diffTotalMark < 0) {
            diffTotalHtml = `<span class="tr-improve-down" style="color:var(--tr-red);">${convertToBengaliDigits(diffTotalMark)} <br><small style="font-size:0.55rem;">(${diffTotalPct.toFixed(2)}%)</small></span>`;
        } else {
            diffTotalHtml = `<span class="tr-improve-same">অপরিবর্তিত</span>`;
        }
    }
    
    // Build Chart Data - Fixed 12 months
    let chartMonths = [];
    let chartScores = [];
    let chartPcts = [];
    
    const standardMonths = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
    
    const monthToHistoryMap = new Map();
    const unmappedExams = [];
    
    historyList.forEach(hn => {
        let matched = false;
        if (hn.match(/জানু/)) { monthToHistoryMap.set('জানুয়ারি', hn); matched = true; }
        else if (hn.match(/ফেব্রু/)) { monthToHistoryMap.set('ফেব্রুয়ারি', hn); matched = true; }
        else if (hn.match(/মার্চ/)) { monthToHistoryMap.set('মার্চ', hn); matched = true; }
        else if (hn.match(/এপ্রিল/)) { monthToHistoryMap.set('এপ্রিল', hn); matched = true; }
        else if (hn.match(/(^|\s)মে(\s|$)/)) { monthToHistoryMap.set('মে', hn); matched = true; }
        else if (hn.match(/জুন/)) { monthToHistoryMap.set('জুন', hn); matched = true; }
        else if (hn.match(/জুলাই/)) { monthToHistoryMap.set('জুলাই', hn); matched = true; }
        else if (hn.match(/আগস্ট|অগাস্ট/)) { monthToHistoryMap.set('আগস্ট', hn); matched = true; }
        else if (hn.match(/সেপ্টে/)) { monthToHistoryMap.set('সেপ্টেম্বর', hn); matched = true; }
        else if (hn.match(/অক্টো/)) { monthToHistoryMap.set('অক্টোবর', hn); matched = true; }
        else if (hn.match(/নভে/)) { monthToHistoryMap.set('নভেম্বর', hn); matched = true; }
        else if (hn.match(/ডিসে/)) { monthToHistoryMap.set('ডিসেম্বর', hn); matched = true; }
        
        if (!matched) unmappedExams.push(hn);
    });
    
    let unmappedIndex = 0;
    standardMonths.forEach(m => {
        if (!monthToHistoryMap.has(m) && unmappedIndex < unmappedExams.length) {
            monthToHistoryMap.set(m, unmappedExams[unmappedIndex]);
            unmappedIndex++;
        }
    });
    
    standardMonths.forEach(m => {
        chartMonths.push(m);
        const hn = monthToHistoryMap.get(m);
        if (hn && student.history[hn]) {
            const hData = student.history[hn];
            if (hData.max > 0) {
                chartScores.push(hData.marks);
                chartPcts.push((hData.marks / hData.max) * 100);
            } else {
                chartScores.push(-1);
                chartPcts.push(0);
            }
        } else {
            chartScores.push(-1);
            chartPcts.push(0);
        }
    });
    
    const chartSvg = generateSVGChart(chartMonths, chartScores, chartPcts);
    
    // Generate QR
    let qrDataUrl = '';
    try {
        qrDataUrl = await QRCode.toDataURL(`ID: ${student.id} | Name: ${student.name} | ${currentExamName} | Marks: ${totalCur}/${totalMax}`, { margin: 1, width: 80 });
    } catch(e){}

    const logoUrl = tutConfigData.logoUrl || '/edtechmataprologomain.png';
    const institutionName = tutConfigData.institutionName || 'আপনার শিক্ষাপ্রতিষ্ঠান';
    const address = tutConfigData.institutionAddress || 'EIIN: ------ | স্থাপিত: ----';
    
    return `
    <div class="tut-report-page">
        <!-- Header -->
        <div class="tr-header">
            <div class="tr-header-left">
                <img src="${logoUrl}" class="tr-college-logo" alt="Logo">
                <div class="tr-college-info">
                    <h1 class="tr-college-name">${institutionName}</h1>
                    <p class="tr-college-address">${address}</p>
                </div>
            </div>
            
            <div class="tr-header-center">
                <h2 class="tr-report-title">টিউটোরিয়াল একাডেমিক রিপোর্ট</h2>
                <div class="tr-month-badge">${currentExamName}</div>
            </div>
            
            <div class="tr-header-right">
                <div class="tr-student-info">
                    <div class="tr-student-info-item" style="grid-column: 1 / -1; margin-bottom: 2px;">
                        <span class="tr-icon"><i class="fas fa-user-graduate"></i></span>
                        <span class="tr-label">নাম:</span>
                        <span class="tr-value" style="font-size:0.7rem;">${student.name}</span>
                    </div>
                    <div class="tr-student-info-item">
                        <span class="tr-icon"><i class="fas fa-id-badge"></i></span>
                        <span class="tr-label">রোল:</span>
                        <span class="tr-value">${convertToBengaliDigits(student.id)}</span>
                    </div>
                    <div class="tr-student-info-item">
                        <span class="tr-icon"><i class="fas fa-layer-group"></i></span>
                        <span class="tr-label">শ্রেণি:</span>
                        <span class="tr-value">${className}</span>
                    </div>
                    <div class="tr-student-info-item">
                        <span class="tr-icon"><i class="fas fa-users"></i></span>
                        <span class="tr-label">গ্রুপ:</span>
                        <span class="tr-value">${student.group.replace(' গ্রুপ', '')}</span>
                    </div>
                    <div class="tr-student-info-item">
                        <span class="tr-icon"><i class="fas fa-fingerprint"></i></span>
                        <span class="tr-label">ID:</span>
                        <span class="tr-value">${student.id}</span>
                    </div>
                </div>
                ${qrDataUrl ? `<div class="tr-qr-code"><img src="${qrDataUrl}" alt="QR"></div>` : ''}
            </div>
        </div>
        
        <!-- KPIs -->
        <div class="tr-kpi-row">
            <div class="tr-kpi-card tr-kpi-card--primary">
                <div class="tr-kpi-icon tr-kpi-icon--primary"><i class="fas fa-file-alt"></i></div>
                <div class="tr-kpi-body">
                    <p class="tr-kpi-title">মোট নম্বর (বর্তমান)</p>
                    <h3 class="tr-kpi-value">${convertToBengaliDigits(totalCur)} <span style="font-size:0.6rem;color:#94a3b8;font-weight:600;">/ ${convertToBengaliDigits(totalMax)}</span></h3>
                    <p class="tr-kpi-sub">${curTotalPct.toFixed(2)}%</p>
                </div>
            </div>
            
            <div class="tr-kpi-card tr-kpi-card--amber">
                <div class="tr-kpi-icon tr-kpi-icon--amber"><i class="fas fa-chart-bar"></i></div>
                <div class="tr-kpi-body">
                    <p class="tr-kpi-title">গড় নম্বর (প্রতি বিষয়)</p>
                    <h3 class="tr-kpi-value">${convertToBengaliDigits(avgScore.toFixed(1))} <span style="font-size:0.6rem;color:#94a3b8;font-weight:600;">/ ${convertToBengaliDigits(Math.round(avgMax))}</span></h3>
                    <p class="tr-kpi-sub">${curTotalPct.toFixed(2)}%</p>
                </div>
            </div>
            
            <div class="tr-kpi-compare">
                <div class="tr-compare-inner">
                    <div class="tr-compare-side tr-compare-side--prev">
                        <p class="tr-compare-month">${shortNameMap.get(prevExamName) || 'গত মাস'}</p>
                        <h4 class="tr-compare-marks">${prevTotalPct !== null ? convertToBengaliDigits(totalPrev) : '-'} <span style="font-size:0.55rem;color:#64748b;">/ ${prevTotalPct !== null ? convertToBengaliDigits(totalPrevMax) : '-'}</span></h4>
                        <p class="tr-compare-pct">${prevTotalPct !== null ? prevTotalPct.toFixed(2)+'%' : '-'}</p>
                    </div>
                    <div class="tr-compare-arrow"><i class="fas fa-long-arrow-alt-right"></i></div>
                    <div class="tr-compare-side tr-compare-side--current">
                        <p class="tr-compare-month" style="color:var(--tr-green);">${shortNameMap.get(currentExamName) || 'বর্তমান মাস'}</p>
                        <h4 class="tr-compare-marks">${convertToBengaliDigits(totalCur)} <span style="font-size:0.55rem;color:#64748b;">/ ${convertToBengaliDigits(totalMax)}</span></h4>
                        <p class="tr-compare-pct" style="color:var(--tr-green);">${curTotalPct.toFixed(2)}%</p>
                    </div>
                </div>
            </div>
            
            <div class="tr-kpi-card tr-kpi-card--green" style="flex:0.8;">
                <div class="tr-kpi-body" style="text-align:center;">
                    <p class="tr-kpi-title" style="margin-bottom:4px;">উন্নতি / অবনতি</p>
                    ${diffTotalMark > 0 ? `<h3 class="tr-kpi-value" style="color:var(--tr-green);"><i class="fas fa-arrow-trend-up"></i> +${convertToBengaliDigits(diffTotalMark)}</h3><p class="tr-kpi-sub" style="color:var(--tr-green);">+${diffTotalPct.toFixed(2)}%</p>` : ''}
                    ${diffTotalMark < 0 ? `<h3 class="tr-kpi-value" style="color:var(--tr-red);"><i class="fas fa-arrow-trend-down"></i> ${convertToBengaliDigits(diffTotalMark)}</h3><p class="tr-kpi-sub" style="color:var(--tr-red);">${diffTotalPct.toFixed(2)}%</p>` : ''}
                    ${diffTotalMark === 0 ? `<h3 class="tr-kpi-value" style="color:var(--tr-text-muted);">-</h3><p class="tr-kpi-sub">অপরিবর্তিত</p>` : ''}
                </div>
            </div>
        </div>
        
        <!-- Main Content -->
        <div class="tr-main-content">
            <!-- Top: Chart (Full Width) -->
            <!-- Top: Chart (Full Width) -->
            <!-- Bottom: Chart -->
            <div class="tr-chart-section">
                <h4 class="tr-section-title"><i class="fas fa-chart-line"></i> ১২ মাসের টিউটোরিয়াল পারফরম্যান্স ট্রেন্ড</h4>
                <div class="tr-chart-legend">
                    <div class="tr-chart-legend-item">
                        <div class="tr-chart-legend-dot" style="background:#3b82f6;"></div> মোট প্রাপ্ত নম্বর
                    </div>
                    <div class="tr-chart-legend-item">
                        <div class="tr-chart-legend-dot" style="background:#16a34a; border-radius:50%;"></div> প্রাপ্ত শতাংশ (%)
                    </div>
                </div>
                <div class="tr-chart-container">
                    ${chartSvg}
                </div>
                
            </div>
            
            <!-- Bottom: Table (Full Width) -->
            <!-- Bottom: Table (Full Width) -->
            <!-- Top: Table -->
            <div class="tr-table-section">
                <h4 class="tr-section-title"><i class="fas fa-tasks"></i> বিষয়ভিত্তিক পারফরম্যান্স তুলনা</h4>
                <table class="tr-subject-table">
                    <thead>
                        <tr>
                            <th rowspan="2" style="text-align:center;width:28px;">ক্রম</th>
                            <th rowspan="2" style="text-align:left;">বিষয়</th>
                            <th rowspan="2">সর্বোচ্চ নম্বর</th>
                            <th colspan="2" class="tr-th-group">${shortNameMap.get(prevExamName) || 'গত মাস'}</th>
                            <th colspan="2" class="tr-th-group tr-col-current">${shortNameMap.get(currentExamName) || 'বর্তমান মাস'}</th>
                            <th rowspan="2">উন্নতি/অবনতি</th>
                        </tr>
                        <tr>
                            <th style="font-weight:700;font-size:0.62rem;">প্রাপ্ত নম্বর</th>
                            <th style="font-weight:700;font-size:0.62rem;">শতাংশ</th>
                            <th class="tr-col-current" style="font-weight:700;font-size:0.62rem;">প্রাপ্ত নম্বর</th>
                            <th class="tr-col-current" style="font-weight:700;font-size:0.62rem;">শতাংশ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td style="text-align:center;">-</td>
                            <td>মোট / গড়</td>
                            <td>${convertToBengaliDigits(totalMax)}</td>
                            <td>${prevTotalPct !== null ? convertToBengaliDigits(totalPrev) : '-'}</td>
                            <td>${prevTotalPct !== null ? '('+prevTotalPct.toFixed(2)+'%)' : '-'}</td>
                            <td class="tr-col-current">${convertToBengaliDigits(totalCur)}</td>
                            <td class="tr-col-current">(${curTotalPct.toFixed(2)}%)</td>
                            <td>${diffTotalHtml}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
        <!-- Footer -->
        <div class="tr-footer">
            <div class="tr-grade-legend">
                <span class="tr-grade-legend-title">গ্রেডিং স্কেল:</span>
                <span class="tr-grade-chip tr-grade-chip--aplus">A+ (80-100%)</span>
                <span class="tr-grade-chip tr-grade-chip--a">A (70-79%)</span>
                <span class="tr-grade-chip tr-grade-chip--aminus">A- (60-69%)</span>
                <span class="tr-grade-chip tr-grade-chip--b">B (50-59%)</span>
                <span class="tr-grade-chip tr-grade-chip--c">C (40-49%)</span>
                <span class="tr-grade-chip tr-grade-chip--d">D (33-39%)</span>
                <span class="tr-grade-chip tr-grade-chip--f">F (0-32%)</span>
            </div>
            <div class="tr-footer-center">
                <i class="fas fa-print"></i> রিপোর্ট জেনারেট: ${new Date().toLocaleDateString('bn-BD')}
            </div>
            <div class="tr-footer-right">
                <div class="tr-footer-brand">Powered by EdTech Automata Pro</div>
            </div>
        </div>
    </div>
    `;
}
