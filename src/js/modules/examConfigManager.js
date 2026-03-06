/**
 * Exam Config Manager
 * Handles the Super Admin "Exam Configuration" page
 * @module examConfigManager
 */

import { addExamConfig, getExamConfigs, deleteExamConfig, updateExamConfig } from '../firestoreService.js';
import { showNotification } from '../utils.js';
import { showConfirmModal, elements } from './uiManager.js';
import { auth } from '../firebase.js';

let currentConfigs = [];

export async function initExamConfigManager() {
    const form = document.getElementById('addExamConfigForm');
    const filterClassSelect = document.getElementById('filterConfigClass');
    const filterSessionSelect = document.getElementById('filterConfigSession');

    if (form) {
        form.addEventListener('submit', handleAddConfig);
    }

    if (filterClassSelect) {
        filterClassSelect.addEventListener('change', () => {
            renderConfigTable(filterClassSelect.value, filterSessionSelect?.value || 'all');
        });
    }

    if (filterSessionSelect) {
        filterSessionSelect.addEventListener('change', () => {
            renderConfigTable(filterClassSelect?.value || 'all', filterSessionSelect.value);
        });
    }

    // Edit Form Submission
    if (elements.editConfigForm) {
        elements.editConfigForm.addEventListener('submit', handleUpdateConfig);
    }

    // Modal Close
    if (elements.closeEditConfigModal) {
        elements.closeEditConfigModal.addEventListener('click', () => {
            elements.editConfigModal?.classList.remove('active');
        });
    }

    // Background click close
    elements.editConfigModal?.addEventListener('click', (e) => {
        if (e.target === elements.editConfigModal) {
            elements.editConfigModal.classList.remove('active');
        }
    });
}

export async function loadExamConfigs() {
    const tbody = document.getElementById('examConfigTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">লোড হচ্ছে...</td></tr>';

    currentConfigs = await getExamConfigs();

    const filterClassSelect = document.getElementById('filterConfigClass');
    const filterSessionSelect = document.getElementById('filterConfigSession');
    renderConfigTable(filterClassSelect?.value || 'all', filterSessionSelect?.value || 'all');
}

function renderConfigTable(classFilter = 'all', sessionFilter = 'all') {
    const tbody = document.getElementById('examConfigTableBody');
    if (!tbody) return;

    let filtered = currentConfigs;
    if (classFilter !== 'all') {
        filtered = filtered.filter(c => c.class === classFilter);
    }
    if (sessionFilter !== 'all') {
        filtered = filtered.filter(c => c.session === sessionFilter);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #666;">কোনো পরীক্ষার নাম যোগ করা হয়নি</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(config => {
        const dateStr = config.examDate
            ? new Date(config.examDate).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
            : '<span style="color:#999;">উল্লেখ নেই</span>';

        return `
            <tr>
                <td>
                    <span class="badge" style="background:var(--primary); color:white; margin-right: 5px;">${config.class}</span>
                    <span class="badge" style="background:var(--secondary); color:white;">${config.session || 'N/A'}</span>
                </td>
                <td><strong>${config.examName}</strong></td>
                <td>${dateStr}</td>
                <td><small style="color:#666;"><i class="fas fa-user"></i> ${config.creatorName || 'Admin'}</small></td>
                <td style="text-align: right; display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="action-btn edit-config-btn" 
                        data-id="${config.docId}" 
                        data-name="${config.examName}" 
                        data-class="${config.class}"
                        data-session="${config.session || ''}"
                        data-date="${config.examDate || ''}"
                        title="সম্পাদনা করুন" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-config-btn" data-id="${config.docId}" data-name="${config.examName}" title="মুছুন" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach edit listeners
    tbody.querySelectorAll('.edit-config-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const { id, name, date } = btn.dataset;
            const cls = btn.dataset.class;
            const sess = btn.dataset.session;

            if (elements.editConfigDocId) elements.editConfigDocId.value = id;
            if (elements.editConfigExamName) elements.editConfigExamName.value = name;
            if (elements.editConfigClass) elements.editConfigClass.value = cls;
            if (elements.editConfigSession) elements.editConfigSession.value = sess;
            if (elements.editConfigExamDate) elements.editConfigExamDate.value = date;

            elements.editConfigModal?.classList.add('active');
        });
    });

    // Attach delete listeners
    tbody.querySelectorAll('.delete-config-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const docId = btn.dataset.id;
            const name = btn.dataset.name;
            showConfirmModal(`আপনি কি "${name}" মুছে ফেলতে চান?`, async () => {
                const success = await deleteExamConfig(docId);
                if (success) {
                    showNotification('সফলভাবে মুছে ফেলা হয়েছে');
                    await loadExamConfigs();
                } else {
                    showNotification('মুছতে সমস্যা হয়েছে', 'error');
                }
            });
        });
    });
}

async function handleAddConfig(e) {
    e.preventDefault();

    const classVal = document.getElementById('configClass').value;
    const sessionVal = document.getElementById('configSession').value;
    const nameVal = document.getElementById('configExamName').value.trim();
    const dateVal = document.getElementById('configExamDate').value; // YYYY-MM-DD

    if (!classVal || !sessionVal || !nameVal) {
        showNotification('ক্লাস, সেশন এবং পরীক্ষার নাম আবশ্যক!', 'warning');
        return;
    }

    // Check for duplicates in same class & session
    const isDuplicate = currentConfigs.some(c =>
        c.class === classVal &&
        c.session === sessionVal &&
        c.examName.toLowerCase() === nameVal.toLowerCase()
    );

    if (isDuplicate) {
        showNotification(`${classVal} এবং ${sessionVal} সেশনে ইতিমধ্যেই "${nameVal}" নামে একটি পরীক্ষা আছে!`, 'error');
        return;
    }

    const user = auth.currentUser;
    const configData = {
        class: classVal,
        session: sessionVal,
        examName: nameVal,
        examDate: dateVal || null,
        createdBy: user ? user.uid : null,
        creatorName: user ? user.displayName || user.email : 'Super Admin'
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> সেভ হচ্ছে...';
    submitBtn.disabled = true;

    const success = await addExamConfig(configData);

    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;

    if (success) {
        showNotification('নতুন পরীক্ষা সফলভাবে যোগ করা হয়েছে!', 'success');
        e.target.reset(); // Clear form
        await loadExamConfigs(); // Refresh list
    } else {
        showNotification('গ্লোবাল এক্সাম নাম সেভ করতে সমস্যা হয়েছে।', 'error');
    }
}

async function handleUpdateConfig(e) {
    e.preventDefault();

    const docId = elements.editConfigDocId.value;
    const classVal = elements.editConfigClass.value;
    const sessionVal = elements.editConfigSession.value;
    const nameVal = elements.editConfigExamName.value.trim();
    const dateVal = elements.editConfigExamDate.value;

    if (!docId || !classVal || !sessionVal || !nameVal) {
        showNotification('সকল তথ্য প্রদান করুন!', 'warning');
        return;
    }

    const configData = {
        class: classVal,
        session: sessionVal,
        examName: nameVal,
        examDate: dateVal || null
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> আপডেট হচ্ছে...';
    submitBtn.disabled = true;

    const success = await updateExamConfig(docId, configData);

    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;

    if (success) {
        showNotification('পরীক্ষার তথ্য সফলভাবে আপডেট করা হয়েছে!', 'success');
        elements.editConfigModal?.classList.remove('active');
        await loadExamConfigs(); // Refresh list
    } else {
        showNotification('এক্সাম কনফিগ আপডেট করতে সমস্যা হয়েছে।', 'error');
    }
}

/**
 * Populate a dropdown with configured exam names based on class and session selection
 * @param {HTMLElement} dropdown 
 * @param {string} className 
 * @param {string} session
 */
export async function populateExamNameDropdown(dropdown, className, session) {
    if (!dropdown) return;

    if (!className || !session) {
        dropdown.innerHTML = '<option value="">আগে শ্রেণি ও সেশন সিলেক্ট করুন</option>';
        dropdown.disabled = true;
        return;
    }

    try {
        const configs = await getExamConfigs(className, session);

        if (!configs || configs.length === 0) {
            dropdown.innerHTML = '<option value="">এই সেশনের জন্য কোনো এক্সাম কনফিগ করা নেই</option>';
            dropdown.disabled = true;
            return;
        }

        dropdown.disabled = false;
        dropdown.innerHTML = configs.map(cfg =>
            `<option value="${cfg.examName}">${cfg.examName}</option>`
        ).join('');
    } catch (error) {
        console.error('Error populating exam name dropdown:', error);
        dropdown.innerHTML = '<option value="">লোড করতে সমস্যা হয়েছে</option>';
        dropdown.disabled = true;
    }
}
