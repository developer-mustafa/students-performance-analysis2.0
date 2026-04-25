/**
 * Academic Settings Manager
 * Handles dynamic management of Classes, Sessions, Groups, and Sections
 */

import { getAcademicStructure, saveAcademicItem, deleteAcademicItem, getSettings, saveSettings } from '../firestoreService.js';
import { showNotification, normalizeSession } from '../utils.js';
import { state } from './state.js';
import { populateDynamicDropdowns } from './uiManager.js';

let academicSettingsListenersBound = false;

export async function initAcademicSettingsManager() {
    await loadAcademicStructure();
    await initDeveloperCreditSettings();
    setupEventListeners();
}

async function loadAcademicStructure() {
    const structure = await getAcademicStructure();

    // Group by type
    const grouped = {
        class: [],
        session: [],
        group: [],
        section: []
    };

    structure.forEach(item => {
        if (grouped[item.type]) {
            grouped[item.type].push(item);
        }
    });

    state.academicStructure = grouped;

    // Render lists
    renderAcademicList('class', grouped.class);
    renderAcademicList('session', grouped.session);
    renderAcademicList('group', grouped.group);
    renderAcademicList('section', grouped.section);

    // Update all dropdowns in the app
    populateDynamicDropdowns();
}

function renderAcademicList(type, items) {
    const listElement = document.getElementById(`${type}List`);
    if (!listElement) return;

    if (items.length === 0) {
        listElement.innerHTML = `<div style="opacity: 0.5; text-align: center; padding: 10px; font-size: 0.9rem;">কোনো ${getLabel(type)} নেই</div>`;
        return;
    }

    listElement.innerHTML = items.map(item => `
        <div class="academic-item">
            <span>${item.value}</span>
            <i class="fas fa-trash-alt delete-btn" data-id="${item.docId}" data-type="${type}"></i>
        </div>
    `).join('');

    // Add delete listeners
    listElement.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const docId = btn.dataset.id;
            const success = await deleteAcademicItem(docId);
            if (success) {
                showNotification('আইটেমটি মুছে ফেলা হয়েছে');
                await loadAcademicStructure();
            }
        });
    });
}

function setupEventListeners() {
    if (academicSettingsListenersBound) return;
    academicSettingsListenersBound = true;

    document.querySelectorAll('.academic-card').forEach(card => {
        const type = card.dataset.type;
        const input = card.querySelector('.academic-input');
        const btn = card.querySelector('.add-academic-btn');

        const addItem = async () => {
            let value = input.value.trim();
            if (!value) return;

            // Normalize session if type is session
            if (type === 'session') {
                value = normalizeSession(value);
            }

            // Check for duplicates
            const existing = state.academicStructure[type].some(item => item.value === value);
            if (existing) {
                showNotification('এই আইটেমটি আগেই যোগ করা হয়েছে', 'warning');
                return;
            }

            const success = await saveAcademicItem({ type, value, label: value });
            if (success) {
                input.value = '';
                showNotification('নতুন আইটেম যোগ করা হয়েছে');
                await loadAcademicStructure();
            }
        };

        if (btn) btn.addEventListener('click', addItem);
        if (input) input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addItem();
        });
    });
}

function getLabel(type) {
    const labels = {
        class: 'শ্রেণি',
        session: 'সেশন',
        group: 'গ্রুপ',
        section: 'শাখা'
    };
    return labels[type] || type;
}

// Developer Credit Management
async function initDeveloperCreditSettings() {
    const enabledInput = document.getElementById('devCreditEnabled');
    const textInput = document.getElementById('devCreditText');
    const nameInput = document.getElementById('devCreditName');
    const linkInput = document.getElementById('devCreditLink');
    const saveBtn = document.getElementById('saveDevCreditBtn');

    if (!enabledInput || !textInput || !nameInput || !linkInput || !saveBtn) return;

    // Load existing settings
    try {
        const settings = await getSettings();
        const devSettings = settings?.developerCredit;
        if (devSettings) {
            enabledInput.checked = devSettings.enabled !== false; // Default to true if not set
            textInput.value = devSettings.text || '';
            nameInput.value = devSettings.name || '';
            linkInput.value = devSettings.link || '';
        } else {
            // Default setup for a fresh installation
            enabledInput.checked = true;
            textInput.value = 'Developed By:';
            nameInput.value = '';
            linkInput.value = '';
        }
    } catch (e) {
        console.error("Error loading developer credit settings", e);
    }

    // Save settings
    saveBtn.onclick = async () => {
        const btnOriginalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> সেভ করা হচ্ছে...';
        saveBtn.disabled = true;

        const creditData = {
            enabled: enabledInput.checked,
            text: textInput.value.trim(),
            name: nameInput.value.trim(),
            link: linkInput.value.trim()
        };

        try {
            await saveSettings({ developerCredit: creditData });
            showNotification('ডেভেলপার ক্রেডিট সেটিংস সেভ হয়েছে ✅', 'success');
        } catch (e) {
            console.error("Error saving developer credit settings", e);
            showNotification('সেটিংস সেভ করতে সমস্যা হয়েছে', 'error');
        } finally {
            saveBtn.innerHTML = btnOriginalText;
            saveBtn.disabled = false;
        }
    };
}
