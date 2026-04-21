import { 
    getSavedExams, 
    getExamConfigs, 
    getSettings, 
    saveSettings,
    getStudentLookupMap,
    generateStudentDocId
} from '../firestoreService.js';
import { state } from './state.js';
import { APP_VERSION } from '../version.js';
import { showNotification, convertToEnglishDigits, convertToBengaliDigits } from '../utils.js';
import { getRoutinesData, normalizeGroupName, fetchRoutines } from './routineManager.js';
import { showLoading, hideLoading } from './uiManager.js';
import { compressImage } from '../imageUtils.js';

let acClassSelect, acSessionSelect, acExamNameSelect, acGroupSelect, acLayoutSelect, acOrientationSelect;
let spClassSelect, spSessionSelect, spExamNameSelect, spGroupSelect, spLayoutSelect, spOrientationSelect;
let acGenerateBtn, spGenerateBtn, acResetBtn, spResetBtn, acPrintAllBtn, spPrintAllBtn, acSettingsBtn;
let admitCardPreview, acPreviewWrapper, acEmptyStateMsg, acMainZoomInput, acMainZoomLevelTxt;

// Settings Modal Elements
let acSettingsModal, closeAcSettingsBtn, acSaveSettingsBtn;
let acInstNameInput, acInstAddressInput;
let acLogoUpload, acWatermarkUpload, acClearLogoBtn, acClearWatermarkBtn;
let acBaseFontSizeSelect, acTitleFontSizeSelect, acTableFontSizeSelect, acThemeSelect;
let acShowRoutine;

let acCurrentSettings = {
    logoUrl: '',
    watermarkUrl: '',
    signatures: [],
    showRoutine: true
};

export function initAdmitCardManager() {
    acClassSelect = document.getElementById('acClass');
    acSessionSelect = document.getElementById('acSession');
    acExamNameSelect = document.getElementById('acExamName');
    acGroupSelect = document.getElementById('acGroup');
    acLayoutSelect = document.getElementById('acLayout');
    acOrientationSelect = document.getElementById('acOrientation');

    spClassSelect = document.getElementById('spClass');
    spSessionSelect = document.getElementById('spSession');
    spExamNameSelect = document.getElementById('spExamName');
    spGroupSelect = document.getElementById('spGroup');
    spLayoutSelect = document.getElementById('spLayout');
    spOrientationSelect = document.getElementById('spOrientation');

    // Helper to sync selects bidirectionally
    const setupSync = (elemA, elemB, eventType = 'change') => {
        if (!elemA || !elemB) return;
        elemA.addEventListener(eventType, () => {
            if (elemB.value !== elemA.value) {
                elemB.value = elemA.value;
                elemB.dispatchEvent(new Event('change'));
            }
        });
        elemB.addEventListener(eventType, () => {
            if (elemA.value !== elemB.value) {
                elemA.value = elemB.value;
                elemA.dispatchEvent(new Event('change'));
            }
        });
    };

    // Bidirectional sync for all filters
    setupSync(acClassSelect, spClassSelect);
    setupSync(acSessionSelect, spSessionSelect);
    // Exam name and Group are updated via change events, handled by the setupSync above
    setupSync(acExamNameSelect, spExamNameSelect);
    setupSync(acGroupSelect, spGroupSelect);
    setupSync(acLayoutSelect, spLayoutSelect);
    setupSync(acOrientationSelect, spOrientationSelect);

    acGenerateBtn = document.getElementById('acGenerateBtn');
    spGenerateBtn = document.getElementById('spGenerateBtn');
    acResetBtn = document.getElementById('acResetBtn');
    spResetBtn = document.getElementById('spResetBtn');
    acPrintAllBtn = document.getElementById('acPrintAllBtn');
    spPrintAllBtn = document.getElementById('spPrintAllBtn');
    acSettingsBtn = document.getElementById('acSettingsBtn');

    admitCardPreview = document.getElementById('admitCardPreview');
    acPreviewWrapper = document.getElementById('acPreviewWrapper');
    acEmptyStateMsg = document.getElementById('acEmptyStateMsg');
    acMainZoomInput = document.getElementById('acMainZoom');
    acMainZoomLevelTxt = document.getElementById('acMainZoomLevel');

    // Settings
    acSettingsModal = document.getElementById('acSettingsModal');
    closeAcSettingsBtn = document.getElementById('closeAcSettingsBtn');
    acSaveSettingsBtn = document.getElementById('acSaveSettingsBtn');
    acInstNameInput = document.getElementById('acInstName');
    acInstAddressInput = document.getElementById('acInstAddress');
    acLogoUpload = document.getElementById('acLogoUpload');
    acWatermarkUpload = document.getElementById('acWatermarkUpload');
    acClearLogoBtn = document.getElementById('acClearLogoBtn');
    acClearWatermarkBtn = document.getElementById('acClearWatermarkBtn');
    acBaseFontSizeSelect = document.getElementById('acBaseFontSize');
    acTitleFontSizeSelect = document.getElementById('acTitleFontSize');
    acTableFontSizeSelect = document.getElementById('acTableFontSize');
    acThemeSelect = document.getElementById('acTheme');
    acShowRoutine = document.getElementById('acShowRoutine');

    // Settings Modal Tab Switching Logic
    const acMenuItems = document.querySelectorAll('#acSettingsModal .config-menu-item');
    const acTabContents = document.querySelectorAll('#acSettingsModal .config-tab-content');

    acMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            acMenuItems.forEach(m => m.classList.remove('active'));
            acTabContents.forEach(c => c.classList.remove('active'));
            item.classList.add('active');
            const tabId = item.getAttribute('data-tab');
            const targetTab = document.getElementById(tabId);
            if (targetTab) targetTab.classList.add('active');
        });
    });

    // Main Page Tab Switching Logic
    const acTabPills = document.querySelectorAll('.ac-tab-pill');
    const acTabPanels = document.querySelectorAll('.ac-tab-panel');

    acTabPills.forEach(pill => {
        pill.addEventListener('click', () => {
            acTabPills.forEach(p => p.classList.remove('active'));
            acTabPanels.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            const targetId = pill.getAttribute('data-target');
            document.getElementById(targetId)?.classList.add('active');
        });
    });
    if (acGenerateBtn) {
        acGenerateBtn.addEventListener('click', () => generateCards('admit'));
    }

    if (spGenerateBtn) {
        spGenerateBtn.addEventListener('click', () => generateCards('seat'));
    }

    const performReset = () => {
        admitCardPreview.innerHTML = '';
        acPreviewWrapper.style.display = 'none';
        acEmptyStateMsg.style.display = 'flex';
        if (acPrintAllBtn) acPrintAllBtn.style.display = 'none';
        if (spPrintAllBtn) spPrintAllBtn.style.display = 'none';
    };

    if (acResetBtn) {
        acResetBtn.addEventListener('click', performReset);
    }
    if (spResetBtn) {
        spResetBtn.addEventListener('click', performReset);
    }

    if (acPrintAllBtn) {
        acPrintAllBtn.addEventListener('click', () => {
            const orientationSelect = document.getElementById('acOrientation');
            const orientation = orientationSelect ? orientationSelect.value : 'portrait';

            // Dynamically inject @page style for reliable printing orientation
            let printStyle = document.getElementById('acPrintStyle');
            if (!printStyle) {
                printStyle = document.createElement('style');
                printStyle.id = 'acPrintStyle';
                document.head.appendChild(printStyle);
            }
            printStyle.innerHTML = `@page { size: A4 ${orientation}; margin: 0; }`;

            document.body.classList.add('ac-printing');
            document.body.classList.add(`ac-print-${orientation}`);

            window.print();

            setTimeout(() => {
                document.body.classList.remove('ac-printing');
                document.body.classList.remove(`ac-print-${orientation}`);
            }, 500);
        });
    }

    if (spPrintAllBtn) {
        spPrintAllBtn.addEventListener('click', () => {
            const orientationSelect = document.getElementById('spOrientation');
            const orientation = orientationSelect ? orientationSelect.value : 'landscape';

            let printStyle = document.getElementById('acPrintStyle');
            if (!printStyle) {
                printStyle = document.createElement('style');
                printStyle.id = 'acPrintStyle';
                document.head.appendChild(printStyle);
            }
            printStyle.innerHTML = `@page { size: A4 ${orientation}; margin: 0; }`;

            document.body.classList.add('ac-printing');
            document.body.classList.add(`ac-print-${orientation}`);

            window.print();

            setTimeout(() => {
                document.body.classList.remove('ac-printing');
                document.body.classList.remove(`ac-print-${orientation}`);
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

    if (acSettingsBtn) {
        acSettingsBtn.addEventListener('click', openSettingsModal);
    }
    if (closeAcSettingsBtn) {
        closeAcSettingsBtn.addEventListener('click', () => acSettingsModal.classList.remove('active'));
    }

    // File Upload Handlers
    if (acLogoUpload) {
        acLogoUpload.addEventListener('change', (e) => handleImageUpload(e, 'logoUrl', 'acLogoPreview'));
    }
    if (acWatermarkUpload) {
        acWatermarkUpload.addEventListener('change', (e) => handleImageUpload(e, 'watermarkUrl', 'acWatermarkPreview'));
    }

    // Clear Image Handlers
    if (acClearLogoBtn) {
        acClearLogoBtn.addEventListener('click', () => clearImage('logoUrl', 'acLogoPreview', acLogoUpload));
    }
    if (acClearWatermarkBtn) {
        acClearWatermarkBtn.addEventListener('click', () => clearImage('watermarkUrl', 'acWatermarkPreview', acWatermarkUpload));
    }
    const acSettingsForm = document.getElementById('acSettingsForm');
    if (acSettingsForm) {
        acSettingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveACSettings();
        });
    }

    // Add Signature Slot Button
    const addSlotBtn = document.getElementById('acAddSignatureSlotBtn');
    if (addSlotBtn) {
        addSlotBtn.addEventListener('click', () => {
            if (!acCurrentSettings.signatures) acCurrentSettings.signatures = [];
            acCurrentSettings.signatures.push({ label: '', url: '' });
            renderAcSignatureSlots();
            updateACLivePreview();
        });
    }

    // Live Preview Listeners
    const settingsInputs = [
        acInstNameInput, acInstAddressInput,
        acBaseFontSizeSelect, acTitleFontSizeSelect, acTableFontSizeSelect, acThemeSelect,
        acShowRoutine
    ];
    settingsInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', updateACLivePreview);
            input.addEventListener('change', updateACLivePreview);
        }
    });

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === acSettingsModal) {
            acSettingsModal.classList.remove('active');
        }
    });
}

/**
 * Auto-scales institution names to fit on a single line
 */
function fitTitleScaling() {
    const selectors = ['.ac-header-text h3', '.sp-inst-name'];
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            let fontSize = parseFloat(window.getComputedStyle(el).fontSize);
            const container = el.parentElement;
            if (!container) return;

            // Reset font size to initial to re-evaluate
            el.style.fontSize = ''; // Clear any previous scaling
            fontSize = parseFloat(window.getComputedStyle(el).fontSize); // Get original computed size

            // Reduce font size until it fits (max 40 iterations to prevent infinite loop)
            let iterations = 0;
            while (el.scrollWidth > el.clientWidth && fontSize > 8 && iterations < 40) {
                fontSize -= 0.5;
                el.style.fontSize = fontSize + 'px';
                iterations++;
            }
        });
    });
}

async function openSettingsModal() {
    const settings = await getSettings() || {};
    const acConfig = settings.admitCard || {};

    if (acInstNameInput) acInstNameInput.value = acConfig.instName || '';
    if (acInstAddressInput) acInstAddressInput.value = acConfig.instAddress || '';

    if (acBaseFontSizeSelect) acBaseFontSizeSelect.value = acConfig.baseFontSize || '14px';
    if (acTitleFontSizeSelect) acTitleFontSizeSelect.value = acConfig.titleFontSize || '22px';
    if (acTableFontSizeSelect) acTableFontSizeSelect.value = acConfig.tableFontSize || '13px';
    if (acThemeSelect) acThemeSelect.value = acConfig.theme || 'modern';
    if (acShowRoutine) acShowRoutine.checked = acConfig.showRoutine !== false; // handle both true and undefined as true

    acCurrentSettings.logoUrl = acConfig.logoUrl || '';
    acCurrentSettings.watermarkUrl = acConfig.watermarkUrl || '';
    acCurrentSettings.signatures = acConfig.signatures || [
        { label: 'শ্রেণি শিক্ষক', url: '' },
        { label: 'অধ্যক্ষ / পরীক্ষা নিয়ন্ত্রক', url: '' }
    ];

    updateImagePreview('acLogoPreview', acCurrentSettings.logoUrl);
    updateImagePreview('acWatermarkPreview', acCurrentSettings.watermarkUrl);
    renderAcSignatureSlots();

    if (acSettingsModal) {
        acSettingsModal.classList.add('active');
        updateACLivePreview();
    }
}

function handleImageUpload(e, settingKey, previewId) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            let base64 = ev.target.result;
            // Compress image to keep Firestore document size small
            try {
                base64 = await compressImage(base64, 800, 800, 0.7);
            } catch (err) {
                console.warn("Compression failed, using original", err);
            }
            acCurrentSettings[settingKey] = base64;
            updateImagePreview(previewId, base64);
            updateACLivePreview();
        };
        reader.readAsDataURL(file);
    }
}

function clearImage(settingKey, previewId, inputElement) {
    acCurrentSettings[settingKey] = '';
    if (inputElement) inputElement.value = '';
    updateImagePreview(previewId, '');
    updateACLivePreview();
}

function updateImagePreview(previewId, url) {
    const preview = document.getElementById(previewId);
    if (!preview) return;

    if (url) {
        preview.innerHTML = `<img src="${url}" style="max-height: 80px; max-width: 100%; border-radius: 4px;">`;
    } else {
        preview.innerHTML = '<span style="opacity: 0.5;">কোনো ছবি নেই</span>';
    }
}

function renderAcSignatureSlots() {
    const container = document.getElementById('acSignatureSlotsContainer');
    if (!container) return;

    if (!acCurrentSettings.signatures || acCurrentSettings.signatures.length === 0) {
        acCurrentSettings.signatures = [
            { label: 'শ্রেণি শিক্ষক', url: '' },
            { label: 'অধ্যক্ষ / পরীক্ষা নিয়ন্ত্রক', url: '' }
        ];
    }

    container.innerHTML = acCurrentSettings.signatures.map((sig, index) => `
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
            acCurrentSettings.signatures[index].label = e.target.value;
            updateACLivePreview();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    let url = ev.target.result;
                    // Compress signature image
                    try {
                        url = await compressImage(url, 500, 300, 0.7);
                    } catch (err) {
                        console.warn("Signature compression failed", err);
                    }
                    card.dataset.url = url;
                    acCurrentSettings.signatures[index].url = url;
                    card.querySelector('.sig-preview-thumb').innerHTML = `<img src="${url}" alt="Signature">`;
                    updateACLivePreview();
                };
                reader.readAsDataURL(file);
            }
        });

        removeBtn.addEventListener('click', () => {
            acCurrentSettings.signatures.splice(index, 1);
            renderAcSignatureSlots();
            updateACLivePreview();
        });
    });
}

function updateACLivePreview() {
    const acPreviewContainer = document.getElementById('acSettingsLivePreview');
    const spPreviewContainer = document.getElementById('spSettingsLivePreview');
    if (!acPreviewContainer || !spPreviewContainer) return;

    const configPack = {
        institutionName: acInstNameInput?.value.trim() || 'প্রতিষ্ঠানের নাম',
        institutionAddress: acInstAddressInput?.value.trim() || 'স্থাপিত: ১৯১১ | ইআইআইএন: ১০৪৩৪৫',
        logoUrl: acCurrentSettings.logoUrl,
        watermarkUrl: acCurrentSettings.watermarkUrl,
        baseFontSize: acBaseFontSizeSelect?.value || '14px',
        titleFontSize: acTitleFontSizeSelect?.value || '22px',
        tableFontSize: acTableFontSizeSelect?.value || '13px',
        theme: acThemeSelect?.value || 'modern',
        signatures: acCurrentSettings.signatures || [],
        showRoutine: acShowRoutine ? acShowRoutine.checked : true
    };

    const mockStudent = {
        id: '১০১',
        name: 'শিক্ষার্থীর নাম',
        class: '৯ম',
        session: '২০২৪-২০২৫',
        group: 'বিজ্ঞান'
    };

    const mockSubjects = ['বাংলা', 'ইংরেজি', 'গণিত', 'পদার্থবিজ্ঞান', 'রসায়ন'];
    const mockExamName = 'অর্ধবার্ষিক পরীক্ষা';

    const acHtml = renderAdmitCard(mockStudent, mockSubjects, mockExamName, configPack);
    const spHtml = renderSeatPlan(mockStudent, mockExamName, configPack);

    const styleBlock = `
        --ac-watermark-url: url('${configPack.watermarkUrl}'); 
        --ac-base-font-size: ${configPack.baseFontSize}; 
        --ac-title-font-size: ${configPack.titleFontSize}; 
        --ac-table-font-size: ${configPack.tableFontSize};
    `;

    acPreviewContainer.innerHTML = `
        <div class="ac-page ac-theme-${configPack.theme}" style="${styleBlock} min-height: auto; width: 100%; border: none; box-shadow: none; padding: 15px; display: block;">
            ${acHtml}
        </div>
    `;

    spPreviewContainer.innerHTML = `
        <div class="ac-page ac-theme-${configPack.theme} seat-plan-mode" style="${styleBlock} min-height: auto; width: 100%; border: none; box-shadow: none; padding: 15px; display: block;">
            ${spHtml}
        </div>
    `;

    // Auto-scale titles in preview
    setTimeout(fitTitleScaling, 10);
}

async function saveACSettings() {
    // Re-gather signatures from DOM to ensure they are current
    const sigCards = document.querySelectorAll('#acSignatureSlotsContainer .sig-slot-card');
    const signatures = [];
    sigCards.forEach(card => {
        const label = card.querySelector('.sig-label-input').value.trim();
        const url = card.dataset.url || '';
        if (label) {
            signatures.push({ label, url });
        }
    });
    acCurrentSettings.signatures = signatures;

    const btn = acSaveSettingsBtn;
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> সেভ হচ্ছে...';
    btn.disabled = true;

    try {
        // Get all settings once and extract developer credit
        const settings = await getSettings() || {};
        // state.developerCredit = settings.developerCredit || null; // This line was removed as per instruction

        const newSettings = {
            ...settings,
            admitCard: {
                instName: acInstNameInput?.value.trim() || '',
                instAddress: acInstAddressInput?.value.trim() || '',
                logoUrl: acCurrentSettings.logoUrl,
                watermarkUrl: acCurrentSettings.watermarkUrl,
                baseFontSize: acBaseFontSizeSelect?.value || '14px',
                titleFontSize: acTitleFontSizeSelect?.value || '22px',
                tableFontSize: acTableFontSizeSelect?.value || '13px',
                theme: acThemeSelect?.value || 'modern',
                signatures: acCurrentSettings.signatures || [],
                showRoutine: acShowRoutine ? acShowRoutine.checked : true
            }
        };

        const success = await saveSettings(newSettings);
        if (success) {
            showNotification('এডমিট কার্ডের সেটিংস সংরক্ষণ করা হয়েছে ✅');
            acSettingsModal.classList.remove('active');
            // Optional: Re-generate cards if already showing
            if (acPreviewWrapper.style.display === 'block') {
                const isSeat = admitCardPreview.classList.contains('seat-plan-mode');
                generateCards(isSeat ? 'seat' : 'admit');
            }
            // Trigger auto-scaling for titles after settings are saved and potentially cards regenerated
            setTimeout(fitTitleScaling, 50);
        } else {
            showNotification('সেটিংস সেভ করতে ব্যর্থ হয়েছে', 'error');
        }
    } catch (err) {
        console.error("Error saving admit card settings:", err);
        showNotification('সার্ভার এরর', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

export async function populateACDropdowns() {
    const exams = await getSavedExams();
    const settings = await getSettings() || {};

    const classes = [...new Set(exams.map(e => e.class).filter(Boolean))].sort();
    const sessions = [...new Set(exams.map(e => e.session).filter(Boolean))].sort().reverse();

    const populateSelect = (selectElem, optionsHTML) => {
        if (selectElem) selectElem.innerHTML = optionsHTML;
    };

    let classOptions = '<option value="">শ্রেণি নির্বাচন</option>';
    classes.forEach(c => classOptions += `<option value="${c}">${c}</option>`);
    populateSelect(acClassSelect, classOptions);
    populateSelect(spClassSelect, classOptions);

    let sessionOptions = '<option value="">সেশন নির্বাচন</option>';
    sessions.forEach(s => sessionOptions += `<option value="${s}">${s}</option>`);
    populateSelect(acSessionSelect, sessionOptions);
    populateSelect(spSessionSelect, sessionOptions);

    const updateExamNames = async (sourcePrefix) => {
        const clsSelect = sourcePrefix === 'ac' ? acClassSelect : spClassSelect;
        const sessSelect = sourcePrefix === 'ac' ? acSessionSelect : spSessionSelect;
        const examSelect = sourcePrefix === 'ac' ? acExamNameSelect : spExamNameSelect;
        const grpSelect = sourcePrefix === 'ac' ? acGroupSelect : spGroupSelect;
        
        const selClass = clsSelect?.value;
        const selSession = sessSelect?.value;

        if (examSelect) {
            if (!selClass || !selSession) {
                examSelect.innerHTML = '<option value="">শ্রেণি ও সেশন নির্বাচন</option>';
                if (grpSelect) grpSelect.innerHTML = '<option value="all">সকল গ্রুপ</option>';
                return;
            }
            examSelect.innerHTML = '<option value="">লোড হচ্ছে...</option>';
            const configs = await getExamConfigs(selClass, selSession);
            const examNames = configs.map(c => c.examName);

            examSelect.innerHTML = '<option value="">পরীক্ষা নির্বাচন</option>';
            if (examNames.length > 0) {
                examNames.forEach(n => examSelect.innerHTML += `<option value="${n}">${n}</option>`);
            } else {
                examSelect.innerHTML = '<option value="">কোনো পরীক্ষা তৈরি করা নেই</option>';
            }

            // Auto Update Groups when Class/Session changes
            updateGroupDropdown(sourcePrefix);
        }
    };

    const updateGroupDropdown = async (sourcePrefix) => {
        const clsSelect = sourcePrefix === 'ac' ? acClassSelect : spClassSelect;
        const sessSelect = sourcePrefix === 'ac' ? acSessionSelect : spSessionSelect;
        const grpSelect = sourcePrefix === 'ac' ? acGroupSelect : spGroupSelect;

        const selClass = clsSelect?.value;
        const selSession = sessSelect?.value;

        if (grpSelect) {
            grpSelect.innerHTML = '<option value="all">সকল গ্রুপ</option>';
            if (selClass && selSession) {
                const filteredExams = exams.filter(e => e.class === selClass && e.session === selSession);
                const groups = new Set();
                filteredExams.forEach(exam => {
                    if (exam.studentData) {
                        exam.studentData.forEach(s => {
                            if (s.group) groups.add(s.group);
                        });
                    }
                });

                const sortedGroups = [...groups].sort();
                sortedGroups.forEach(g => {
                    grpSelect.innerHTML += `<option value="${g}">${g}</option>`;
                });
            }
        }
    }

    if (acClassSelect) acClassSelect.addEventListener('change', () => updateExamNames('ac'));
    if (acSessionSelect) acSessionSelect.addEventListener('change', () => updateExamNames('ac'));
    if (acExamNameSelect) acExamNameSelect.addEventListener('change', () => updateGroupDropdown('ac'));

    if (spClassSelect) spClassSelect.addEventListener('change', () => updateExamNames('sp'));
    if (spSessionSelect) spSessionSelect.addEventListener('change', () => updateExamNames('sp'));
    if (spExamNameSelect) spExamNameSelect.addEventListener('change', () => updateGroupDropdown('sp'));
    // When Exam Name changes, update groups specifically for that exam if needed (Optional, currently global for class/session)
    if (acExamNameSelect) acExamNameSelect.addEventListener('change', updateGroupDropdown);
}

async function generateCards(type) {
    const isAdmit = type === 'admit';
    const cls = isAdmit ? acClassSelect?.value : spClassSelect?.value;
    const session = isAdmit ? acSessionSelect?.value : spSessionSelect?.value;
    const examName = isAdmit ? acExamNameSelect?.value : spExamNameSelect?.value;
    const selectedGroup = isAdmit ? (acGroupSelect?.value || 'all') : (spGroupSelect?.value || 'all');
    
    // Layout and orientation
    const layoutSize = isAdmit ? parseInt(acLayoutSelect?.value || '2', 10) : parseInt(spLayoutSelect?.value || '2', 10);
    const orientationSelect = isAdmit ? acOrientationSelect : spOrientationSelect;
    const pageOrientation = orientationSelect ? orientationSelect.value : (isAdmit ? 'landscape' : 'portrait');

    if (!cls || !session || !examName) {
        showNotification('শ্রেণি, সেশন এবং পরীক্ষা নির্বাচন করুন', 'error');
        return;
    }

    showLoading('শিক্ষার্থী তালিকা যাচাই করা হচ্ছে...', 'অপেক্ষা করুন...', 5);

    // Refresh routine data to ensure latest and handles normalization fixes
    await fetchRoutines();

    const allExams = await getSavedExams();
    let relevantExams = allExams.filter(e => e.class === cls && e.session === session && e.name === examName);

    // If no exams found for this specific exam name, fall back to ANY exam in this class/session to get the student list
    if (relevantExams.length === 0) {
        relevantExams = allExams.filter(e => e.class === cls && e.session === session);
    }

    if (relevantExams.length === 0) {
        // Only show notification if NO exams exist for this class/session at all
        showNotification('নির্বাচিত শ্রেণি ও সেশনে কোনো তথ্য পাওয়া যায়নি', 'warning');
        return;
    }

    const subjectsSet = new Set(relevantExams.map(e => e.subject).filter(Boolean));
    const subjects = [...subjectsSet].sort(); // Optional sorting

    const lookupMap = await getStudentLookupMap();

    // Build unique student list
    const studentAgg = new Map();

    relevantExams.forEach(exam => {
        if (exam.studentData) {
            exam.studentData.forEach(s => {
                const sGroup = s.group || '';
                // Filter by group if a specific group is selected
                if (selectedGroup !== 'all' && sGroup !== selectedGroup) {
                    return;
                }

                const key = `${s.id}_${sGroup}`;
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
                        status: latest ? (latest.status !== undefined ? latest.status : true) : true
                    });
                }
            });
        }
    });

    let studentsArray = [...studentAgg.values()]
        .filter(s => String(s.status) !== 'false')
        .sort((a, b) => {
        // Primary sort: Group Alphabetically
        const groupA = a.group.toLowerCase();
        const groupB = b.group.toLowerCase();
        if (groupA < groupB) return -1;
        if (groupA > groupB) return 1;

        // Secondary sort: Roll number
        return (parseInt(convertToEnglishDigits(String(a.id))) || 0) - (parseInt(convertToEnglishDigits(String(b.id))) || 0);
    });

    if (studentsArray.length === 0) {
        showNotification('শিক্ষার্থী পাওয়া যায়নি (হয়তো এই গ্রুপে কেউ নেই)', 'error');
        return;
    }

    // Fetch Settings
    const settings = await getSettings() || {};
    state.developerCredit = settings.developerCredit || null;

    const acConfig = settings.admitCard || {};
    
    // Dynamic Layout Switching: 
    // - If routine is OFF, default to 4 per page if currently 2
    // - If routine is ON, default to 2 per page if currently 4
    let effectiveLayoutSize = layoutSize;
    if (type === 'seat') {
        effectiveLayoutSize = 2; // Always 2x2 for seat plan = 4 per page
    } else if (acConfig.showRoutine === false && effectiveLayoutSize === 2) {
        effectiveLayoutSize = 4;
        if (acLayoutSelect) acLayoutSelect.value = "4";
    } else if (acConfig.showRoutine !== false && effectiveLayoutSize === 4) {
        effectiveLayoutSize = 2;
        if (acLayoutSelect) acLayoutSelect.value = "2";
    }

    const institutionName = acConfig.instName || 'প্রতিষ্ঠান এর নাম';
    const institutionAddress = acConfig.instAddress || '';
    const logoUrl = acConfig.logoUrl || '';
    const watermarkUrl = acConfig.watermarkUrl || '';

    const baseFontSize = acConfig.baseFontSize || '14px';
    const titleFontSize = acConfig.titleFontSize || '22px';
    const tableFontSize = acConfig.tableFontSize || '13px';
    const theme = acConfig.theme || 'modern';

    // Pass configuration pack to render functions
    const configPack = { 
        institutionName, 
        institutionAddress, 
        logoUrl, 
        watermarkUrl, 
        baseFontSize, 
        titleFontSize, 
        tableFontSize, 
        theme,
        signatures: acConfig.signatures || [],
        showRoutine: acConfig.showRoutine !== false
    };

    // Chunking logic based on effectiveLayoutSize
    const cardsPerPage = type === 'admit' ? effectiveLayoutSize : effectiveLayoutSize * 2;
    const totalPages = Math.ceil(studentsArray.length / cardsPerPage);
    
    // Helper to generate HTML for all pages
    const generatePagesHTML = async (orientation) => {
        let pagesHTML = '';
        
        // Dynamic Row Count Logic to prevent stretching on partially filled pages
        const getColumnCount = (layout, orient) => {
            if (orient === 'landscape') {
                if (layout === 1) return 1;
                if (layout === 2) return 2;
                if (layout === 4) return 2;
                if (layout === 6) return 3;
                if (layout === 8) return 4;
                if (layout === 10) return 5;
                if (layout === 12) return 4;
                return 2;
            } else {
                if (layout === 12) return 3;
                if (layout === 1 || layout === 2) return 1;
                return 2;
            }
        };

        const cols = getColumnCount(effectiveLayoutSize, orientation);
        const totalCardsPerPage = type === 'admit' ? effectiveLayoutSize : effectiveLayoutSize * 2;
        const rowCount = Math.ceil(totalCardsPerPage / cols);

        admitCardPreview.innerHTML = ''; // Clear previous
        
        let hasRevealedUI = false;
        let generatedCardsCount = 0;

        for (let i = 0; i < totalPages; i++) {
            // Update Progress: Starts from 20% to 100%
            const percent = 20 + Math.round((i / totalPages) * 80);
            if (!hasRevealedUI) {
                showLoading(`${isAdmit ? 'এডমিট কার্ড' : 'সীট প্ল্যান'} তৈরি হচ্ছে...`, `${studentsArray.length} জনের মধ্যে ${(i * cardsPerPage)} জন সম্পন্ন`, percent);
            } else {
                // If UI is already revealed, update a compact progress or standard notification (optional, silent is better to prevent blinking)
                // But keep DOM updating progressive:
            }

            const slice = studentsArray.slice(i * cardsPerPage, (i + 1) * cardsPerPage);
            generatedCardsCount += slice.length;

            const cardsHtml = slice.map(student => {
                if (type === 'admit') return renderAdmitCard(student, subjects, examName, configPack);
                return renderSeatPlan(student, examName, configPack);
            }).join('');

            const pageHtml = `
                <div class="ac-page ac-layout-${effectiveLayoutSize} ac-theme-${configPack.theme} ac-page-${orientation} ${type === 'seat' ? 'ac-page-seat' : ''}" 
                     style="--ac-watermark-url: url('${configPack.watermarkUrl}');
                            --ac-base-font-size: ${configPack.baseFontSize};
                            --ac-title-font-size: ${configPack.titleFontSize};
                            --ac-table-font-size: ${configPack.tableFontSize};
                            --ac-rows: ${rowCount};">
                    ${cardsHtml}
                </div>`.trim();
                
            admitCardPreview.insertAdjacentHTML('beforeend', pageHtml);

            if (generatedCardsCount >= 5 && !hasRevealedUI) {
                hideLoading();
                admitCardPreview.classList.remove('seat-plan-mode');
                if (type === 'seat') admitCardPreview.classList.add('seat-plan-mode');
                
                acPreviewWrapper.style.display = 'block';
                acEmptyStateMsg.style.display = 'none';
                if (type === 'admit') {
                    if (acPrintAllBtn) acPrintAllBtn.style.display = 'inline-flex';
                    if (spPrintAllBtn) spPrintAllBtn.style.display = 'none';
                } else {
                    if (spPrintAllBtn) spPrintAllBtn.style.display = 'inline-flex';
                    if (acPrintAllBtn) acPrintAllBtn.style.display = 'none';
                }
                
                setTimeout(fitTitleScaling, 50);
                hasRevealedUI = true;
            }

            // Yield to UI thread every page to keep it buttery smooth
            await new Promise(r => setTimeout(r, 20));
        }

        if (!hasRevealedUI) {
            // Fallback for < 5 students
            hideLoading();
            admitCardPreview.classList.remove('seat-plan-mode');
            if (type === 'seat') admitCardPreview.classList.add('seat-plan-mode');
            
            acPreviewWrapper.style.display = 'block';
            acEmptyStateMsg.style.display = 'none';
            if (type === 'admit') {
                if (acPrintAllBtn) acPrintAllBtn.style.display = 'inline-flex';
                if (spPrintAllBtn) spPrintAllBtn.style.display = 'none';
            } else {
                if (spPrintAllBtn) spPrintAllBtn.style.display = 'inline-flex';
                if (acPrintAllBtn) acPrintAllBtn.style.display = 'none';
            }
            setTimeout(fitTitleScaling, 50);
        }
    };

    // Trigger chunked generation
    await generatePagesHTML(pageOrientation);

    showNotification(`${studentsArray.length} জন শিক্ষার্থীর ${type === 'admit' ? 'এডমিট কার্ড' : 'সীট প্ল্যান'} তৈরি হয়েছে ✅`);
}

function getDeveloperCreditHtml(className) {
    if (!state.developerCredit || state.developerCredit.enabled === false) return '';
    const text = state.developerCredit.text || '';
    const name = state.developerCredit.name || '';
    const link = state.developerCredit.link || '';
    
    if (!text && !name) return '';
    
    let content = `<span>${text} <strong>${name}</strong></span> <span style="opacity: 0.6; font-size: 0.85em; margin-left: 4px;">| এডটেক অটোমেটা প্রো- v${APP_VERSION}</span>`;
    if (link) {
        content += `<br><a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:2px;">${link}</a>`;
    }
    
    return `<div class="${className}">${content.trim()}</div>`;
}

function renderAdmitCard(student, subjects, examName, config) {
    const routineData = getRoutinesData();
    const cleanExamName = (examName || '').trim();
    const studentGroupRaw = (student.group || 'all').trim();
    const studentGroupNorm = normalizeGroupName(studentGroupRaw);
    const studentClass = (student.class || '').trim();
    const studentSession = (student.session || '').trim();
    
    // Attempt specific normalized, then specific raw, then all normalized (only if group is 'all')
    const keySpecificNorm = `${studentClass}_${studentSession}_${cleanExamName}_${studentGroupNorm}`;
    const keySpecificRaw = `${studentClass}_${studentSession}_${cleanExamName}_${studentGroupRaw}`;
    const keyAll = `${studentClass}_${studentSession}_${cleanExamName}_all`;
    
    // Robust lookup: try with exact group keys first
    // Only fall back to 'all' key when student group IS 'all' (i.e., no specific group filtering)
    let routineRows = routineData[keySpecificNorm] || routineData[keySpecificRaw] || [];
    
    // Only use keyAll if student group is 'all' or no group-specific routine was found AND keyAll is the only option
    if (routineRows.length === 0 && (studentGroupNorm === 'all')) {
        routineRows = routineData[keyAll] || [];
    }

    // Second level fallback: Fuzzy matching for exam name (group-aware)
    if (routineRows.length === 0) {
        const allKeys = Object.keys(routineData);
        // Better fuzzy logic: matches class, session, group exactly; matches exam partially
        const fuzzyKey = allKeys.find(k => {
            const parts = k.split('_');
            if (parts.length < 4) return false;
            
            const kGrp = parts.pop();
            const kExam = parts.slice(2).join('_'); // handle case where exam name itself had underscores (though unlikely)
            const kSess = parts[1];
            const kCls = parts[0];

            // For specific groups, only match the same group (not 'all')
            const groupMatches = studentGroupNorm === 'all' 
                ? (kGrp === studentGroupNorm || kGrp === studentGroupRaw || kGrp === 'all')
                : (kGrp === studentGroupNorm || kGrp === studentGroupRaw);
            const examMatches = cleanExamName === kExam || cleanExamName.includes(kExam) || kExam.includes(cleanExamName);
            
            return kCls === studentClass && kSess === studentSession && groupMatches && examMatches;
        });
        if (fuzzyKey) routineRows = routineData[fuzzyKey] || [];
        if (routineRows.rows) routineRows = routineRows.rows; // Handle older structure if wrapped in {rows:[]}
    } else if (routineRows.rows) {
        routineRows = routineRows.rows; // Handle wrapped structure
    }
    
    let subjectsList = '';
    
    // Check if routine should be shown based on toggle
    if (config.showRoutine !== false) {
        if (routineRows && routineRows.length > 0) {
            // Render Routine Table if found
            subjectsList = `
                <div class="ac-routine-box">
                    <div class="ac-section-title">পরীক্ষার সময়সূচী (Exam Routine)</div>
                    <table class="ac-routine-table">
                        <thead>
                            <tr>
                                <th style="width: 8%;">নং</th>
                                <th style="width: 20%;">তারিখ</th>
                                <th style="width: 15%;">বার</th>
                                <th style="width: 37%;">বিষয়</th>
                                <th style="width: 20%;">সময়</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${routineRows.map((row, idx) => {
                                let formattedDate = row.date || '';
                                if (formattedDate.includes('-')) {
                                    const [y, m, d] = formattedDate.split('-');
                                    formattedDate = `${d}/${m}/${y}`;
                                }
                                const seq = row.seq || (idx + 1);
                                return `
                                <tr>
                                    <td style="text-align:center;">${convertToBengaliDigits(seq)}</td>
                                    <td>${convertToBengaliDigits(formattedDate)}</td>
                                    <td style="text-align:center;">${row.day || ''}</td>
                                    <td>${row.subject || ''}</td>
                                    <td style="text-align:center;">${convertToBengaliDigits(row.time || '')}</td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>`;
        } else {
            // Updated Fallback: Show professional message if routine is ON but not found
            subjectsList = `
                <div class="ac-routine-box ac-no-routine" style="padding: 15px; text-align: center; border: 1px dashed var(--ac-primary-color); border-radius: 8px; margin: 10px 0;">
                    <p style="margin: 0; color: #64748b; font-style: italic;">এক্সাম রুটিন সেট করা নেই</p>
                </div>`;
        }
    }

    // Determine group-specific theme class
    let groupClass = 'ac-grp-default';
    if (studentGroupNorm === 'science' || studentGroupRaw.includes('বিজ্ঞান')) {
        groupClass = 'ac-grp-science';
    } else if (studentGroupNorm === 'business' || studentGroupRaw.includes('ব্যবসায়')) {
        groupClass = 'ac-grp-business';
    } else if (studentGroupNorm === 'humanities' || studentGroupRaw.includes('মানবিক')) {
        groupClass = 'ac-grp-humanities';
    }

    // Logo block
    const logoHtml = config.logoUrl ? `<img src="${config.logoUrl}" class="ac-logo" alt="Logo">` : '';
    const addressHtml = config.institutionAddress ? `<div class="ac-address">${config.institutionAddress}</div>` : '';

    // Determine if routine is present for specific styling
    const hasRoutine = config.showRoutine !== false && routineRows && routineRows.length > 0;

    return `
        <div class="ac-card ${groupClass} ${config.watermarkUrl ? 'ac-has-watermark' : ''} ${hasRoutine ? 'ac-with-routine' : ''}">
            <div class="ac-card-inner">
                <div class="ac-header">
                    <div class="ac-logo-container">${logoHtml}</div>
                    <div class="ac-header-text">
                        <h3>${config.institutionName}</h3>
                        ${addressHtml}
                    </div>
                </div>
                
                <div class="ac-pill-header-container">
                    <div class="ac-pill-header">
                        <div class="ac-pill-left">প্রবেশপত্র</div>
                        <div class="ac-pill-right">${examName} - ${student.session}</div>
                    </div>
                </div>
                
                <div class="ac-body">
                    <div class="ac-info-section">
                        <table class="ac-info-table">
                            <tr><th>শিক্ষার্থীর নাম</th><td>: <strong>${student.name}</strong></td></tr>
                            <tr><th>রোল নম্বর</th><td>: <strong>${student.id}</strong></td></tr>
                            <tr><th>শ্রেণি</th><td>: ${student.class}</td></tr>
                            <tr class="ac-highlight-grp-row"><th>বিভাগ/গ্রুপ</th><td>: <span class="ac-grp-highlight">${student.group || 'প্রযোজ্য নয়'}</span></td></tr>
                        </table>
                    </div>
                    <div class="ac-photo-section">
                        <div class="ac-photo-box">
                            <span>পাসপোর্ট<br>সাইজ ছবি</span>
                        </div>
                    </div>
                </div>

                ${subjectsList}
                
                <div class="ac-footer">
                    ${(config.signatures && config.signatures.length > 0 ? config.signatures : [
                        { label: 'শ্রেণি শিক্ষক', url: '' },
                        { label: 'অধ্যক্ষ / পরীক্ষা নিয়ন্ত্রক', url: '' }
                    ]).map(sig => `
                        <div class="ac-sig-block">
                            ${sig.url ? `<img src="${sig.url}" class="ac-sig-img" alt="Signature">` : '<div class="ac-sig-space"></div>'}
                            <div class="ac-sig-label">${sig.label}</div>
                        </div>
                    `).join('')}
                </div>
                ${getDeveloperCreditHtml('ac-dev-credit')}
            </div>
        </div>
    `;
}

function renderSeatPlan(student, examName, config) {
    const studentGroupRaw = (student.group || 'all').trim();
    const studentGroupNorm = normalizeGroupName(studentGroupRaw);

    // Determine group-specific theme class
    let groupClass = 'ac-grp-default';
    if (studentGroupNorm === 'science' || studentGroupRaw.includes('বিজ্ঞান')) {
        groupClass = 'ac-grp-science';
    } else if (studentGroupNorm === 'business' || studentGroupRaw.includes('ব্যবসায়')) {
        groupClass = 'ac-grp-business';
    } else if (studentGroupNorm === 'humanities' || studentGroupRaw.includes('মানবিক')) {
        groupClass = 'ac-grp-humanities';
    }

    // Determine group-specific background prefix
    let bgPrefix = '';
    if (groupClass === 'ac-grp-science') bgPrefix = 'S-';
    else if (groupClass === 'ac-grp-business') bgPrefix = 'B-';
    else if (groupClass === 'ac-grp-humanities') bgPrefix = 'A-';
    else bgPrefix = 'R-';

    const logoHtml = config.logoUrl ? `<img src="${config.logoUrl}" class="ac-logo" alt="Logo">` : '';

    return `
        <div class="sp-card ${groupClass} ${config.watermarkUrl ? 'sp-has-watermark' : ''}">
            <div class="sp-card-inner">
                <div class="ac-header">
                    <div class="ac-logo-container">${logoHtml}</div>
                    <div class="ac-header-text">
                        <h3>${config.institutionName}</h3>
                    </div>
                </div>
                
                <div class="ac-pill-header-container">
                    <div class="ac-pill-header">
                        <div class="ac-pill-left">পরীক্ষার সিট</div>
                        <div class="ac-pill-right">${examName}</div>
                    </div>
                </div>
                
                <div class="sp-body">
                    <table class="sp-table">
                        <tr><th>নাম</th><td>: <strong>${student.name}</strong></td></tr>
                        <tr><th>রোল</th><td class="sp-highlight-roll">: <strong>${student.id}</strong></td></tr>
                        <tr><th>শ্রেণি</th><td>: ${student.class}</td></tr>
                        <tr><th>গ্রুপ</th><td>: <span class="ac-grp-highlight">${student.group || 'প্রযোজ্য নয়'}</span></td></tr>
                    </table>
                    <div class="sp-watermark-roll">${bgPrefix}${student.id}</div>
                </div>
                ${getDeveloperCreditHtml('sp-dev-credit')}
            </div>
        </div>
    `;
}
