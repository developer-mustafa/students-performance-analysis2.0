/**
 * Marksheet Manager Module
 * Generates professional Bangladeshi HSC-style marksheets 
 * @module marksheetManager
 */

import { getSavedExams } from '../firestoreService.js';
import { state } from './state.js';
import { showNotification, convertToEnglishDigits } from '../utils.js';

let marksheetSettings = {
    institutionName: '',
    institutionAddress: '',
    headerLine1: 'পরীক্ষার ফলাফল পত্র',
    headerLine2: '',
    watermarkUrl: '',
    watermarkOpacity: 0.1,
    signatureLabels: ['শ্রেণি শিক্ষক', 'পরীক্ষা কমিটি', 'অধ্যক্ষ']
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

    const updateExamNames = () => {
        const selClass = classSelect?.value;
        const selSession = sessionSelect?.value;
        const filtered = exams.filter(e =>
            (!selClass || e.class === selClass) &&
            (!selSession || e.session === selSession)
        );
        const examNames = [...new Set(filtered.map(e => e.name).filter(Boolean))];
        const examSelect = document.getElementById('msExamName');
        if (examSelect) {
            examSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন</option>';
            if (examNames.length > 0) {
                examSelect.innerHTML += '<option value="__all__">সব পরীক্ষা (Combined)</option>';
            }
            examNames.forEach(n => examSelect.innerHTML += `<option value="${n}">${n}</option>`);
        }
        updateStudentDropdown(filtered);
    };

    const updateStudentDropdown = (filteredExams) => {
        const studentMap = new Map();
        filteredExams.forEach(exam => {
            if (exam.studentData) {
                exam.studentData.forEach(s => {
                    const key = `${s.id}_${s.group}`;
                    if (!studentMap.has(key)) {
                        studentMap.set(key, { id: s.id, name: s.name, group: s.group });
                    }
                });
            }
        });
        const studentSelect = document.getElementById('msStudent');
        if (studentSelect) {
            studentSelect.innerHTML = '<option value="all">সকল শিক্ষার্থী</option>';
            [...studentMap.values()].sort((a, b) => {
                return (parseInt(convertToEnglishDigits(String(a.id))) || 0) - (parseInt(convertToEnglishDigits(String(b.id))) || 0);
            }).forEach(s => {
                studentSelect.innerHTML += `<option value="${s.id}_${s.group}">${s.id} - ${s.name}</option>`;
            });
        }
    };

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

    const subjectsSet = new Set(relevantExams.map(e => e.subject).filter(Boolean));
    const subjects = [...subjectsSet];

    // Build student aggregation
    const studentAgg = new Map();
    relevantExams.forEach(exam => {
        if (exam.studentData) {
            exam.studentData.forEach(s => {
                const key = `${s.id}_${s.group || ''}`;
                if (!studentAgg.has(key)) {
                    studentAgg.set(key, {
                        id: s.id,
                        name: s.name,
                        group: s.group || '',
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

    const previewArea = document.getElementById('marksheetPreview');
    previewArea.innerHTML = studentsArray.map(student =>
        renderSingleMarksheet(student, subjects, examDisplayName)
    ).join('');

    // Show bulk print button
    const bulkBtn = document.getElementById('msPrintAllBtn');
    if (bulkBtn) bulkBtn.style.display = 'inline-flex';

    showNotification(`${studentsArray.length} জন শিক্ষার্থীর মার্কশীট তৈরি হয়েছে ✅`);
}

/**
 * Render a single student's marksheet (Bangladeshi HSC professional style)
 */
function renderSingleMarksheet(student, subjects, examDisplayName) {
    const ms = marksheetSettings;

    // Calculate per-subject grades and grand totals
    let grandTotal = 0;
    let maxGrand = 0;
    let allPassed = true;
    let totalGradePointSum = 0;

    const subjectRows = subjects.map((subj, idx) => {
        const data = student.subjects[subj] || {};
        const total = data.total || 0;
        const config = state.subjectConfigs?.[subj] || { total: 100 };
        const maxTotal = parseInt(config.total) || 100;
        grandTotal += total;
        maxGrand += maxTotal;

        const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
        const grade = getLetterGrade(pct);
        const gp = getGradePoint(pct);
        totalGradePointSum += gp;

        if (grade === 'F' || data.status === 'ফেল' || data.status === 'fail') allPassed = false;

        return `
            <tr>
                <td class="ms-td-sl">${idx + 1}</td>
                <td class="ms-td-subject">${subj}</td>
                <td class="ms-td-num">${maxTotal}</td>
                <td class="ms-td-num">${data.written || '-'}</td>
                <td class="ms-td-num">${data.mcq || '-'}</td>
                <td class="ms-td-num">${data.practical || '-'}</td>
                <td class="ms-td-num ms-td-total">${total}</td>
                <td class="ms-td-grade ${grade === 'F' ? 'ms-grade-fail' : ''}">${grade}</td>
                <td class="ms-td-gp">${gp.toFixed(2)}</td>
            </tr>`;
    }).join('');

    const overallPct = maxGrand > 0 ? (grandTotal / maxGrand) * 100 : 0;
    const overallGrade = getLetterGrade(overallPct);
    const avgGPA = subjects.length > 0 ? (totalGradePointSum / subjects.length).toFixed(2) : '0.00';
    const resultText = allPassed ? 'পাস' : 'অকৃতকার্য';
    const resultClass = allPassed ? 'ms-result-pass' : 'ms-result-fail';

    const signatureHtml = (ms.signatureLabels || ['শ্রেণি শিক্ষক', 'পরীক্ষা কমিটি', 'অধ্যক্ষ']).map(label =>
        `<div class="ms-sig-block">
            <div class="ms-sig-line"></div>
            <span>${label}</span>
        </div>`
    ).join('');

    const watermarkHtml = ms.watermarkUrl ?
        `<div class="ms-watermark-bg" style="background-image: url('${ms.watermarkUrl}'); opacity: ${ms.watermarkOpacity || 0.1};"></div>` : '';

    const todayDate = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });

    return `
        <div class="ms-page">
            ${watermarkHtml}
            
            <!-- Decorative Border -->
            <div class="ms-border-frame">
                
                <!-- Header Section -->
                <div class="ms-header-section">
                    <div class="ms-emblem">
                        <i class="fas fa-graduation-cap"></i>
                    </div>
                    <h1 class="ms-inst-name">${ms.institutionName || 'প্রতিষ্ঠানের নাম'}</h1>
                    ${ms.institutionAddress ? `<p class="ms-inst-address">${ms.institutionAddress}</p>` : ''}
                    <div class="ms-title-divider"></div>
                    <h2 class="ms-title-main">${ms.headerLine1 || 'পরীক্ষার ফলাফল পত্র'}</h2>
                    ${ms.headerLine2 ? `<p class="ms-title-sub">${ms.headerLine2}</p>` : ''}
                    <p class="ms-exam-name-display">${examDisplayName}</p>
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
                            <td class="ms-td-gp">${avgGPA}</td>
                        </tr>
                    </tfoot>
                </table>

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

                <!-- Signatures -->
                <div class="ms-signatures-section">
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

    if (settingsBtn) {
        settingsBtn.addEventListener('click', async () => {
            await loadMarksheetSettings();
            const el = (id) => document.getElementById(id);
            if (el('msInstitutionName')) el('msInstitutionName').value = marksheetSettings.institutionName || '';
            if (el('msInstitutionAddress')) el('msInstitutionAddress').value = marksheetSettings.institutionAddress || '';
            if (el('msHeaderLine1')) el('msHeaderLine1').value = marksheetSettings.headerLine1 || '';
            if (el('msHeaderLine2')) el('msHeaderLine2').value = marksheetSettings.headerLine2 || '';
            if (el('msSignatureLabels')) el('msSignatureLabels').value = (marksheetSettings.signatureLabels || []).join(', ');
            if (opacitySlider) {
                opacitySlider.value = (marksheetSettings.watermarkOpacity || 0.1) * 100;
                if (opacityVal) opacityVal.textContent = opacitySlider.value;
            }
            if (marksheetSettings.watermarkUrl) {
                const preview = document.getElementById('msWatermarkPreview');
                if (preview) preview.innerHTML = `<img src="${marksheetSettings.watermarkUrl}" style="max-width:80px; opacity:0.3; border-radius:6px;">`;
            }
            if (modal) modal.classList.add('active');
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
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const sigLabels = document.getElementById('msSignatureLabels').value
                .split(',').map(s => s.trim()).filter(Boolean);

            await saveMarksheetSettings({
                institutionName: document.getElementById('msInstitutionName').value.trim(),
                institutionAddress: document.getElementById('msInstitutionAddress').value.trim(),
                headerLine1: document.getElementById('msHeaderLine1').value.trim(),
                headerLine2: document.getElementById('msHeaderLine2').value.trim(),
                watermarkUrl: marksheetSettings.watermarkUrl || '',
                watermarkOpacity: parseInt(document.getElementById('msWatermarkOpacity').value) / 100,
                signatureLabels: sigLabels.length > 0 ? sigLabels : ['শ্রেণি শিক্ষক', 'পরীক্ষা কমিটি', 'অধ্যক্ষ']
            });

            if (modal) modal.classList.remove('active');
        });
    }
}

/**
 * Bulk Print - opens print dialog with only marksheets
 */
function bulkPrint() {
    document.body.classList.add('ms-printing');
    window.print();
    // Remove class after print dialog closes
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('ms-printing');
    }, { once: true });
    // Fallback for browsers that don't fire afterprint
    setTimeout(() => {
        document.body.classList.remove('ms-printing');
    }, 3000);
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

    initMarksheetSettingsModal();
    await populateMSDropdowns();
}
