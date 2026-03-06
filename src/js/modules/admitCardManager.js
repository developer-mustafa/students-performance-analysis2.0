import { getSavedExams, getExamConfigs, getSettings } from '../firestoreService.js';
import { state } from './state.js';
import { showNotification, convertToEnglishDigits } from '../utils.js';

let acClassSelect, acSessionSelect, acExamNameSelect, acLayoutSelect;
let acGenerateBtn, spGenerateBtn, acResetBtn, acPrintAllBtn;
let admitCardPreview, acPreviewWrapper, acEmptyStateMsg, acMainZoomInput, acMainZoomLevelTxt;

export function initAdmitCardManager() {
    acClassSelect = document.getElementById('acClass');
    acSessionSelect = document.getElementById('acSession');
    acExamNameSelect = document.getElementById('acExamName');
    acLayoutSelect = document.getElementById('acLayout');

    acGenerateBtn = document.getElementById('acGenerateBtn');
    spGenerateBtn = document.getElementById('spGenerateBtn');
    acResetBtn = document.getElementById('acResetBtn');
    acPrintAllBtn = document.getElementById('acPrintAllBtn');

    admitCardPreview = document.getElementById('admitCardPreview');
    acPreviewWrapper = document.getElementById('acPreviewWrapper');
    acEmptyStateMsg = document.getElementById('acEmptyStateMsg');
    acMainZoomInput = document.getElementById('acMainZoom');
    acMainZoomLevelTxt = document.getElementById('acMainZoomLevel');

    if (acGenerateBtn) {
        acGenerateBtn.addEventListener('click', () => generateCards('admit'));
    }

    if (spGenerateBtn) {
        spGenerateBtn.addEventListener('click', () => generateCards('seat'));
    }

    if (acResetBtn) {
        acResetBtn.addEventListener('click', () => {
            admitCardPreview.innerHTML = '';
            acPreviewWrapper.style.display = 'none';
            acEmptyStateMsg.style.display = 'flex';
            acPrintAllBtn.style.display = 'none';
        });
    }

    if (acPrintAllBtn) {
        acPrintAllBtn.addEventListener('click', () => {
            document.body.classList.add('ac-printing');
            window.print();
            setTimeout(() => {
                document.body.classList.remove('ac-printing');
            }, 500);
        });
    }

    if (acMainZoomInput) {
        acMainZoomInput.addEventListener('input', (e) => {
            const scale = parseFloat(e.target.value);
            admitCardPreview.style.setProperty('--ac-main-scale', scale);
            if (acMainZoomLevelTxt) {
                acMainZoomLevelTxt.textContent = Math.round(scale * 100) + '%';
            }
        });
    }
}

export async function populateACDropdowns() {
    const exams = await getSavedExams();
    const settings = await getSettings() || {};

    const classes = [...new Set(exams.map(e => e.class).filter(Boolean))].sort();
    const sessions = [...new Set(exams.map(e => e.session).filter(Boolean))].sort().reverse();

    if (acClassSelect) {
        acClassSelect.innerHTML = '<option value="">শ্রেণি নির্বাচন</option>';
        classes.forEach(c => acClassSelect.innerHTML += `<option value="${c}">${c}</option>`);
    }

    if (acSessionSelect) {
        acSessionSelect.innerHTML = '<option value="">সেশন নির্বাচন</option>';
        sessions.forEach(s => acSessionSelect.innerHTML += `<option value="${s}">${s}</option>`);
    }

    const updateExamNames = async () => {
        const selClass = acClassSelect?.value;
        const selSession = acSessionSelect?.value;

        if (acExamNameSelect) {
            if (!selClass || !selSession) {
                acExamNameSelect.innerHTML = '<option value="">শ্রেণি ও সেশন নির্বাচন</option>';
                return;
            }
            acExamNameSelect.innerHTML = '<option value="">লোড হচ্ছে...</option>';
            const configs = await getExamConfigs(selClass, selSession);
            const examNames = configs.map(c => c.examName);

            acExamNameSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন</option>';
            if (examNames.length > 0) {
                examNames.forEach(n => acExamNameSelect.innerHTML += `<option value="${n}">${n}</option>`);
            } else {
                acExamNameSelect.innerHTML = '<option value="">কোনো পরীক্ষা তৈরি করা নেই</option>';
            }
        }
    };

    if (acClassSelect) acClassSelect.addEventListener('change', updateExamNames);
    if (acSessionSelect) acSessionSelect.addEventListener('change', updateExamNames);
}

async function generateCards(type) {
    const cls = acClassSelect?.value;
    const session = acSessionSelect?.value;
    const examName = acExamNameSelect?.value;
    const layoutSize = parseInt(acLayoutSelect?.value || '6', 10);

    if (!cls || !session || !examName) {
        showNotification('শ্রেণি, সেশন এবং পরীক্ষা নির্বাচন করুন', 'error');
        return;
    }

    const allExams = await getSavedExams();
    const relevantExams = allExams.filter(e => e.class === cls && e.session === session && e.name === examName);

    if (relevantExams.length === 0) {
        showNotification('নির্বাচিত তথ্য অনুযায়ী কোনো শিক্ষার্থী পাওয়া যায়নি', 'error');
        return;
    }

    const subjectsSet = new Set(relevantExams.map(e => e.subject).filter(Boolean));
    const subjects = [...subjectsSet];

    // Build unique student list
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
                        session: session
                    });
                }
            });
        }
    });

    let studentsArray = [...studentAgg.values()].sort((a, b) => {
        return (parseInt(convertToEnglishDigits(String(a.id))) || 0) - (parseInt(convertToEnglishDigits(String(b.id))) || 0);
    });

    if (studentsArray.length === 0) {
        showNotification('শিক্ষার্থী পাওয়া যায়নি', 'error');
        return;
    }

    // Settings (Optional: can fetch actual settings if needed)
    const institutionName = 'প্রতিষ্ঠান এর নাম'; // Default or fetch from settings

    // Chunking logic based on layoutSize
    let pagesHTML = '';
    for (let i = 0; i < studentsArray.length; i += layoutSize) {
        const chunk = studentsArray.slice(i, i + layoutSize);
        let cardsHTML = '';

        if (type === 'admit') {
            cardsHTML = chunk.map(student => renderAdmitCard(student, subjects, examName, institutionName)).join('');
        } else {
            cardsHTML = chunk.map(student => renderSeatPlan(student, examName, institutionName)).join('');
        }

        pagesHTML += `
            <div class="ac-page ac-layout-${layoutSize}">
                ${cardsHTML}
            </div>
        `;
    }

    admitCardPreview.innerHTML = pagesHTML;
    admitCardPreview.classList.remove('seat-plan-mode');
    if (type === 'seat') admitCardPreview.classList.add('seat-plan-mode');

    acPreviewWrapper.style.display = 'block';
    acEmptyStateMsg.style.display = 'none';
    if (acPrintAllBtn) acPrintAllBtn.style.display = 'inline-flex';

    showNotification(`${studentsArray.length} জন শিক্ষার্থীর ${type === 'admit' ? 'এডমিট কার্ড' : 'সীট প্ল্যান'} তৈরি হয়েছে ✅`);
}

function renderAdmitCard(student, subjects, examName, instName) {
    const subjectsList = subjects.length > 0 ? `<div class="ac-subjects"><b>বিষয়সমূহ:</b> ${subjects.join(', ')}</div>` : '';

    return `
        <div class="ac-card">
            <div class="ac-header">
                <h3>${instName}</h3>
                <div class="ac-title">প্রবেশপত্র</div>
                <div class="ac-exam-name">${examName} - ${student.session}</div>
            </div>
            <div class="ac-body">
                <div class="ac-photo-box">ছবি</div>
                <table class="ac-info-table">
                    <tr><th>শিক্ষার্থীর নাম</th><td>: ${student.name}</td></tr>
                    <tr><th>রোল নম্বর</th><td>: ${student.id}</td></tr>
                    <tr><th>শ্রেণি</th><td>: ${student.class}</td></tr>
                    <tr><th>বিভাগ/গ্রুপ</th><td>: ${student.group || 'প্রযোজ্য নয়'}</td></tr>
                </table>
                ${subjectsList}
            </div>
            <div class="ac-footer">
                <div class="ac-sig">শ্রেণি শিক্ষক</div>
                <div class="ac-sig">অধ্যক্ষ / পরীক্ষা নিয়ন্ত্রক</div>
            </div>
        </div>
    `;
}

function renderSeatPlan(student, examName, instName) {
    return `
        <div class="sp-card">
            <div class="sp-header">${instName}</div>
            <div class="sp-exam">${examName} - ${student.session}</div>
            <table class="sp-table">
                <tr><th>নাম</th><td>: ${student.name}</td></tr>
                <tr><th>রোল</th><td>: <b>${student.id}</b></td></tr>
                <tr><th>শ্রেণি</th><td>: ${student.class}</td></tr>
                <tr><th>গ্রুপ</th><td>: ${student.group || '-'}</td></tr>
            </table>
        </div>
    `;
}
