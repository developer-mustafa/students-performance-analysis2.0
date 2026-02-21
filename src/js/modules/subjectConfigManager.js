/**
 * Subject Configuration Module
 */

import {
    saveSubjectConfig,
    deleteSubjectConfig,
    subscribeToSubjectConfigs
} from '../firestoreService.js';
import { elements } from './uiManager.js';
import { showNotification } from '../utils.js';
import { state, DEFAULT_SUBJECT_CONFIG } from './state.js';

let allConfigs = {};

/**
 * Initialize Subject Configuration Manager
 */
export function initSubjectConfigManager() {
    if (!elements.subjectSettingsModal) return;

    // Listeners for inputs to calculate total
    const markInputs = [
        elements.configWrittenMax,
        elements.configMcqMax,
        elements.configPracticalMax
    ];

    markInputs.forEach(input => {
        input?.addEventListener('input', calculateLiveTotal);
    });

    // Save Button
    elements.saveSubjectConfigBtn?.addEventListener('click', handleSaveConfig);

    // Add New Button
    elements.addNewSubjectBtn?.addEventListener('click', () => {
        resetConfigForm();
        elements.formTitle.innerText = 'নতুন কনফিগারেশন';
    });

    // Delete Button
    elements.deleteSubjectBtn?.addEventListener('click', handleDeleteConfig);

    // Search
    elements.subjectSearch?.addEventListener('input', (e) => {
        renderConfigList(allConfigs, e.target.value);
    });

    // Close Button
    elements.closeSubjectSettingsBtn?.addEventListener('click', () => {
        elements.subjectSettingsModal.style.display = 'none';
    });

    // Real-time subscription
    subscribeToSubjectConfigs((configs) => {
        allConfigs = configs || {};
        state.subjectConfigs = allConfigs;
        renderConfigList(allConfigs);
    });
}

function calculateLiveTotal() {
    const written = parseInt(elements.configWrittenMax?.value) || 0;
    const mcq = parseInt(elements.configMcqMax?.value) || 0;
    const practical = parseInt(elements.configPracticalMax?.value) || 0;
    const total = written + mcq + practical;

    if (elements.configTotalMax) elements.configTotalMax.value = total;
    if (elements.calcTotalPreview) elements.calcTotalPreview.innerText = `গণনা: ${total}`;
}

function renderConfigList(configs, searchTerm = '') {
    if (!elements.savedConfigsList) return;

    // Get all unique subjects from all sources to ensure sync
    const configSubjects = Object.keys(configs).filter(key => key !== 'updatedAt');
    const examSubjects = [...new Set(state.savedExams.map(e => e.subject))];
    const mappingSubjects = [...new Set(Object.values(state.classSubjectMapping || {}).flat())];

    // Merge and filter
    const allUniqueSubjects = [...new Set([...configSubjects, ...examSubjects, ...mappingSubjects])]
        .filter(s => s && s.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => a.localeCompare(b, 'bn'));

    if (allUniqueSubjects.length === 0) {
        elements.savedConfigsList.innerHTML = '<div style="padding: 10px; color: #999; font-size: 0.8em; text-align: center;">কোনো বিষয় খুঁজে পাওয়া যায়নি</div>';
        if (elements.subjectCount) elements.subjectCount.innerText = '০';
        return;
    }

    // Update count badge with Bengali digits
    if (elements.subjectCount) {
        const count = allUniqueSubjects.length;
        const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        const countStr = count.toString().split('').map(d => bengaliDigits[parseInt(d)]).join('');
        elements.subjectCount.innerText = countStr;
    }

    elements.savedConfigsList.innerHTML = allUniqueSubjects.map(key => {
        const hasConfig = configs[key] ? true : false;
        const isActive = state.editingSubjectKey === key;

        return `
            <div class="config-item ${isActive ? 'active' : ''} ${hasConfig ? 'has-config' : 'no-config'}" data-subject="${key}">
                <div class="config-item-info">
                    <strong>${key}</strong>
                    <span>${hasConfig ? `${configs[key].total} মার্কস` : '<span style="color: var(--warning)">কনফিগার করা নেই</span>'}</span>
                </div>
                <i class="fas ${hasConfig ? 'fa-check-circle' : 'fa-exclamation-circle'}" 
                   style="color: ${hasConfig ? '#27ae60' : '#f59e0b'}; opacity: ${hasConfig ? '0.8' : '0.5'}"></i>
            </div>
        `;
    }).join('');

    // Attach click listeners to items
    elements.savedConfigsList.querySelectorAll('.config-item').forEach(item => {
        item.addEventListener('click', () => {
            const subject = item.dataset.subject;
            const config = configs[subject] || DEFAULT_SUBJECT_CONFIG;
            loadConfigIntoForm(subject, config);
        });
    });
}

function loadConfigIntoForm(subject, config) {
    state.editingSubjectKey = subject;

    // UI Updates
    elements.configSubjectName.value = subject;
    elements.configWrittenMax.value = config.written || '';
    elements.configWrittenPass.value = config.writtenPass || '';
    elements.configMcqMax.value = config.mcq || '';
    elements.configMcqPass.value = config.mcqPass || '';
    elements.configPracticalMax.value = config.practical || '';
    elements.configPracticalPass.value = config.practicalPass || '';
    elements.configPracticalOptional.checked = !!config.practicalOptional;
    elements.configTotalMax.value = config.total || '';

    elements.deleteSubjectBtn.style.display = 'block';
    elements.formTitle.innerText = `এডিট: ${subject}`;

    // Highlight active item in list
    renderConfigList(allConfigs, elements.subjectSearch?.value);
    calculateLiveTotal();
}

function resetConfigForm() {
    state.editingSubjectKey = null;
    elements.configSubjectName.value = '';
    elements.configWrittenMax.value = DEFAULT_SUBJECT_CONFIG.written;
    elements.configWrittenPass.value = DEFAULT_SUBJECT_CONFIG.writtenPass;
    elements.configMcqMax.value = DEFAULT_SUBJECT_CONFIG.mcq;
    elements.configMcqPass.value = DEFAULT_SUBJECT_CONFIG.mcqPass;
    elements.configPracticalMax.value = DEFAULT_SUBJECT_CONFIG.practical;
    elements.configPracticalPass.value = DEFAULT_SUBJECT_CONFIG.practicalPass;
    elements.configPracticalOptional.checked = DEFAULT_SUBJECT_CONFIG.practicalOptional;
    elements.configTotalMax.value = DEFAULT_SUBJECT_CONFIG.total;

    elements.deleteSubjectBtn.style.display = 'none';
    calculateLiveTotal();
}

async function handleSaveConfig() {
    const subject = elements.configSubjectName.value.trim();
    if (!subject) {
        showNotification('বিষয়ের নাম দিতে হবে', 'warning');
        return;
    }

    const config = {
        total: elements.configTotalMax.value,
        written: elements.configWrittenMax.value,
        writtenPass: elements.configWrittenPass.value,
        mcq: elements.configMcqMax.value,
        mcqPass: elements.configMcqPass.value,
        practical: elements.configPracticalMax.value,
        practicalPass: elements.configPracticalPass.value,
        practicalOptional: elements.configPracticalOptional.checked
    };

    const success = await saveSubjectConfig(subject, config);
    if (success) {
        showNotification(`${subject} কনফিগারেশন সেভ করা হয়েছে`);
        resetConfigForm();
    } else {
        showNotification('সেভ করতে সমস্যা হয়েছে', 'error');
    }
}

async function handleDeleteConfig() {
    const subject = state.editingSubjectKey;
    if (!subject) return;

    const confirmed = confirm(`আপনি কি নিশ্চিত যে আপনি '${subject}' কনফিগারেশন মুছে ফেলতে চান?`);
    if (!confirmed) return;

    const success = await deleteSubjectConfig(subject);
    if (success) {
        showNotification(`${subject} কনফিগারেশন মুছে ফেলা হয়েছে`);
        resetConfigForm();
    } else {
        showNotification('ডিলিট করতে সমস্যা হয়েছে', 'error');
    }
}
