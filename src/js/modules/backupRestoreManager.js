/**
 * Backup & Restore Manager
 * Production-grade backup/restore system for EdTech Automata Pro
 * @module backupRestoreManager
 */

import { state } from './state.js';
import { showNotification } from '../utils.js';
import { APP_VERSION } from '../version.js';
import { populateDynamicDropdowns } from './uiManager.js';

// ==========================================
// CONSTANTS
// ==========================================
const BATCH_LIMIT = 450; // Safety margin below Firestore's 500
const PAGE_SIZE = 500;

const BACKUP_COLLECTIONS = {
    // Single-doc settings (stored under 'settings' collection)
    SETTINGS_DOCS: ['global', 'subject_configs', 'marksheet_config', 'class_subject_mappings'],
    // Multi-doc collections
    MULTI_COLLECTIONS: [
        'exams', 'students', 'examConfigs', 'tutorialExamConfigs',
        'academicStructure', 'teacher_assignments', 'accessControl',
        'notices', 'users'
    ]
};

// ==========================================
// FIRESTORE HELPERS (Lazy-loaded)
// ==========================================
async function getFS() {
    const { db } = await import('../firebase.js');
    const fs = await import('firebase/firestore');
    return { db, ...fs };
}

/**
 * Fetch all documents from a collection using pagination
 */
async function fetchCollectionPaginated(collectionName) {
    const { db, collection, query, getDocs, orderBy, limit, startAfter } = await getFS();
    const results = [];
    let lastDoc = null;
    let hasMore = true;

    while (hasMore) {
        let q;
        const colRef = collection(db, collectionName);
        if (lastDoc) {
            q = query(colRef, limit(PAGE_SIZE), startAfter(lastDoc));
        } else {
            q = query(colRef, limit(PAGE_SIZE));
        }

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            hasMore = false;
            break;
        }

        snapshot.forEach(docSnap => {
            results.push({ _docId: docSnap.id, ...docSnap.data() });
        });

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMore = snapshot.size === PAGE_SIZE;
    }

    return results;
}

/**
 * Fetch single settings documents
 */
async function fetchSettingsDocs() {
    const { db, doc, getDoc } = await getFS();
    const settings = {};

    for (const docName of BACKUP_COLLECTIONS.SETTINGS_DOCS) {
        try {
            const snap = await getDoc(doc(db, 'settings', docName));
            if (snap.exists()) {
                settings[docName] = snap.data();
            }
        } catch (e) {
            console.warn(`Settings doc "${docName}" fetch failed:`, e);
        }
    }
    return settings;
}

// ==========================================
// BACKUP ENGINE
// ==========================================

/**
 * Create a full or selective backup
 * @param {Object} options - { type: 'full'|'selective', collections: [], filters: {} }
 * @param {Function} onProgress - Progress callback (percent, message)
 */
export async function createBackup(options = {}, onProgress = () => {}) {
    if (state.userRole !== 'super_admin') {
        showNotification('শুধুমাত্র সুপার এডমিন ব্যাকআপ নিতে পারেন', 'error');
        return null;
    }

    const { type = 'full', collections = [], filters = {} } = options;
    const backupData = { meta: {}, data: {} };
    const targetCollections = type === 'full'
        ? BACKUP_COLLECTIONS.MULTI_COLLECTIONS
        : collections;

    let totalDocs = 0;
    let processed = 0;
    const totalSteps = targetCollections.length + 1; // +1 for settings

    try {
        // 1. Fetch settings
        onProgress(5, 'সেটিংস ডেটা ফেচ করা হচ্ছে...');
        backupData.data.settings = await fetchSettingsDocs();
        processed++;

        // 2. Fetch each collection
        for (const colName of targetCollections) {
            const pct = Math.round((processed / totalSteps) * 90) + 5;
            onProgress(pct, `"${colName}" কালেকশন ফেচ হচ্ছে...`);

            let docs = await fetchCollectionPaginated(colName);

            // Apply filters for selective backup
            if (filters.session) {
                if (['exams', 'examConfigs', 'tutorialExamConfigs'].includes(colName)) {
                    docs = docs.filter(d => d.session === filters.session);
                }
            }
            if (filters.className) {
                if (['exams', 'students', 'examConfigs', 'tutorialExamConfigs'].includes(colName)) {
                    docs = docs.filter(d => d.class === filters.className);
                }
            }

            backupData.data[colName] = docs;
            totalDocs += docs.length;
            processed++;
        }

        // 3. Build metadata
        backupData.meta = {
            appName: 'EdTech Automata Pro',
            appVersion: APP_VERSION,
            backupDate: new Date().toISOString(),
            backupType: type,
            createdBy: state.currentUser?.uid || 'unknown',
            creatorName: state.currentUser?.displayName || 'Unknown',
            collections: Object.keys(backupData.data),
            totalDocuments: totalDocs,
            filters: Object.keys(filters).length > 0 ? filters : null
        };

        onProgress(100, 'ব্যাকআপ প্রস্তুত!');
        return backupData;

    } catch (error) {
        console.error('Backup failed:', error);
        showNotification('ব্যাকআপ তৈরি করতে সমস্যা হয়েছে: ' + error.message, 'error');
        return null;
    }
}

/**
 * Download backup data as JSON file
 */
export function downloadBackupFile(backupData) {
    if (!backupData) return;
    const json = JSON.stringify(backupData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `EdTechPro_Backup_${backupData.meta.backupType}_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('ব্যাকআপ ফাইল ডাউনলোড হচ্ছে!', 'success');
}

// ==========================================
// RESTORE ENGINE
// ==========================================

/**
 * Parse and validate an uploaded backup file
 */
export async function parseBackupFile(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.name.endsWith('.json')) {
            reject(new Error('অবৈধ ফাইল। শুধুমাত্র .json ফাইল গ্রহণযোগ্য।'));
            return;
        }
        if (file.size > 100 * 1024 * 1024) { // 100MB limit
            reject(new Error('ফাইল সাইজ ১০০ MB এর বেশি হতে পারবে না।'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const validation = validateBackupSchema(data);
                if (!validation.valid) {
                    reject(new Error(validation.error));
                    return;
                }
                resolve(data);
            } catch (err) {
                reject(new Error('JSON পার্স করতে সমস্যা। ফাইলটি ক্ষতিগ্রস্ত হতে পারে।'));
            }
        };
        reader.onerror = () => reject(new Error('ফাইল পড়তে সমস্যা হয়েছে।'));
        reader.readAsText(file);
    });
}

/**
 * Validate backup JSON schema
 */
function validateBackupSchema(data) {
    if (!data || typeof data !== 'object') {
        return { valid: false, error: 'অবৈধ JSON স্ট্রাকচার।' };
    }
    if (!data.meta || !data.data) {
        return { valid: false, error: 'meta বা data সেকশন পাওয়া যায়নি।' };
    }
    if (!data.meta.appName || !data.meta.backupDate) {
        return { valid: false, error: 'ব্যাকআপ মেটাডেটা অসম্পূর্ণ।' };
    }
    if (data.meta.appName !== 'EdTech Automata Pro') {
        return { valid: false, error: 'এই ব্যাকআপ ফাইলটি EdTech Automata Pro এর নয়।' };
    }
    return { valid: true };
}

/**
 * Generate a preview summary of backup data
 */
export function getBackupPreview(backupData) {
    const preview = {
        meta: backupData.meta,
        collections: {}
    };
    for (const [key, value] of Object.entries(backupData.data)) {
        if (Array.isArray(value)) {
            preview.collections[key] = { count: value.length };
        } else if (typeof value === 'object') {
            preview.collections[key] = { count: Object.keys(value).length, type: 'settings' };
        }
    }
    return preview;
}

/**
 * Execute restore with chunked batch writes
 * @param {Object} backupData - Parsed backup JSON
 * @param {Object} options - { mode: 'full'|'partial', selectedCollections: [] }
 * @param {Function} onProgress - Progress callback (percent, message)
 */
export async function executeRestore(backupData, options = {}, onProgress = () => {}) {
    if (state.userRole !== 'super_admin') {
        showNotification('শুধুমাত্র সুপার এডমিন রিস্টোর করতে পারেন', 'error');
        return { success: false, error: 'Unauthorized' };
    }

    // CRITICAL SAFETY REQUIREMENT: Auto-rollback backup before restore
    onProgress(2, 'নিরাপত্তার জন্য অটো-রোলব্যাক ব্যাকআপ তৈরি হচ্ছে...');
    try {
        const rollbackBackup = await createBackup({ type: 'full' }, () => {}); // silent progress
        if (rollbackBackup) {
            // Save it to a staging location or download it automatically
            downloadBackupFile(rollbackBackup);
            showNotification('রোলব্যাক ব্যাকআপ সেভ করা হয়েছে', 'success');
        }
    } catch (e) {
        console.warn('Rollback backup failed, proceeding with caution', e);
    }

    const { db, doc, setDoc, writeBatch } = await getFS();
    const { mode = 'full', selectedCollections = [] } = options;
    const results = { success: true, restored: {}, errors: [] };

    try {
        // 1. Restore settings docs
        if (backupData.data.settings && (mode === 'full' || selectedCollections.includes('settings'))) {
            onProgress(5, 'সেটিংস রিস্টোর হচ্ছে...');
            for (const [docName, docData] of Object.entries(backupData.data.settings)) {
                try {
                    await setDoc(doc(db, 'settings', docName), docData, { merge: true });
                    results.restored[`settings/${docName}`] = 1;
                } catch (err) {
                    results.errors.push(`settings/${docName}: ${err.message}`);
                }
            }
        }

        // 2. Restore multi-doc collections
        const collectionsToRestore = mode === 'full'
            ? BACKUP_COLLECTIONS.MULTI_COLLECTIONS.filter(c => backupData.data[c])
            : selectedCollections.filter(c => c !== 'settings' && backupData.data[c]);

        const totalCollections = collectionsToRestore.length;
        let colIndex = 0;

        for (const colName of collectionsToRestore) {
            const docs = backupData.data[colName];
            if (!Array.isArray(docs) || docs.length === 0) {
                colIndex++;
                continue;
            }

            const basePct = 10 + Math.round((colIndex / totalCollections) * 85);
            onProgress(basePct, `"${colName}" রিস্টোর হচ্ছে (${docs.length} ডকুমেন্ট)...`);

            // Chunk into batches of BATCH_LIMIT
            const chunks = [];
            for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
                chunks.push(docs.slice(i, i + BATCH_LIMIT));
            }

            let restoredCount = 0;
            for (let ci = 0; ci < chunks.length; ci++) {
                const chunk = chunks[ci];
                const batch = writeBatch(db);

                for (const docData of chunk) {
                    const docId = docData._docId;
                    if (!docId) {
                        results.errors.push(`${colName}: ডকুমেন্ট ID পাওয়া যায়নি`);
                        continue;
                    }
                    // Remove internal _docId before writing
                    const cleanData = { ...docData };
                    delete cleanData._docId;
                    batch.set(doc(db, colName, docId), cleanData, { merge: true });
                }

                try {
                    await batch.commit();
                    restoredCount += chunk.length;
                } catch (err) {
                    results.errors.push(`${colName} batch ${ci + 1}: ${err.message}`);
                    results.success = false;
                }

                // UI responsiveness delay
                await new Promise(r => setTimeout(r, 50));

                // Update sub-progress
                const subPct = basePct + Math.round(((ci + 1) / chunks.length) * (85 / totalCollections));
                onProgress(Math.min(subPct, 95), `"${colName}" — ${restoredCount}/${docs.length} ডকুমেন্ট`);
            }

            results.restored[colName] = restoredCount;
            colIndex++;
        }

        // 3. Log this restore
        await saveBackupLog({
            type: 'restore',
            mode,
            backupDate: backupData.meta.backupDate,
            restored: results.restored,
            errors: results.errors.length,
            timestamp: new Date().toISOString(),
            performedBy: state.currentUser?.uid
        });

        onProgress(100, results.success ? 'রিস্টোর সম্পন্ন!' : 'রিস্টোর আংশিক সম্পন্ন (কিছু ত্রুটি)');
        return results;

    } catch (error) {
        console.error('Restore failed:', error);
        return { success: false, error: error.message, restored: results.restored, errors: results.errors };
    }
}

// ==========================================
// BACKUP HISTORY
// ==========================================

async function saveBackupLog(logData) {
    try {
        const { db, collection, addDoc } = await getFS();
        await addDoc(collection(db, 'backup_logs'), logData);
    } catch (e) {
        console.warn('Backup log save failed:', e);
    }
}

export async function loadBackupHistory() {
    try {
        const { db, collection, query, getDocs, orderBy, limit } = await getFS();
        const q = query(collection(db, 'backup_logs'), orderBy('timestamp', 'desc'), limit(20));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('Backup history load failed:', e);
        return [];
    }
}

// ==========================================
// UI CONTROLLER
// ==========================================

export function initBackupRestoreManager() {
    // --- BACKUP ---
    const backupFullBtn = document.getElementById('brBackupFullBtn');
    const backupSelectiveBtn = document.getElementById('brBackupSelectiveBtn');
    const backupProgress = document.getElementById('brBackupProgress');
    const backupProgressBar = document.getElementById('brBackupProgressBar');
    const backupProgressText = document.getElementById('brBackupProgressText');

    // --- RESTORE ---
    const restoreFileInput = document.getElementById('brRestoreFileInput');
    const restoreUploadBtn = document.getElementById('brRestoreUploadBtn');
    const restorePreview = document.getElementById('brRestorePreview');
    const restoreConfirmBtn = document.getElementById('brRestoreConfirmBtn');
    const restoreCancelBtn = document.getElementById('brRestoreCancelBtn');
    const restoreProgress = document.getElementById('brRestoreProgress');
    const restoreProgressBar = document.getElementById('brRestoreProgressBar');
    const restoreProgressText = document.getElementById('brRestoreProgressText');

    // --- FILTER SELECTS ---
    const filterSession = document.getElementById('brFilterSession');
    const filterClass = document.getElementById('brFilterClass');

    // ------------------------------------------
    // GOOGLE DRIVE INTEGRATION
    // ------------------------------------------
    const connectDriveBtn = document.getElementById('brConnectDriveBtn');
    const driveStatus = document.getElementById('brDriveStatus');
    const autoBackupRadios = document.querySelectorAll('input[name="brAutoBackup"]');
    let pendingRestoreData = null;

    // Check initial drive connection status
    async function checkDriveStatus() {
        try {
            const { db, doc, getDoc } = await getFS();
            const docSnap = await getDoc(doc(db, 'settings', 'gdriveIntegration'));
            if (docSnap.exists() && docSnap.data().refreshToken) {
                if (driveStatus) {
                    driveStatus.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
                    driveStatus.style.color = '#10b981';
                }
                const currentSchedule = docSnap.data().schedule || 'off';
                autoBackupRadios.forEach(r => {
                    if (r.value === currentSchedule) r.checked = true;
                });
            }
        } catch (e) {
            console.error('Failed to get drive status', e);
        }
    }
    checkDriveStatus();

    if (connectDriveBtn) {
        connectDriveBtn.addEventListener('click', () => {
            if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                showNotification('Google API এখনো লোড হয়নি। দয়া করে একটু পর আবার চেষ্টা করুন।', 'warning');
                return;
            }

            const client = google.accounts.oauth2.initCodeClient({
                client_id: import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/drive.file',
                ux_mode: 'popup',
                callback: async (response) => {
                    if (response.code) {
                        try {
                            showNotification('গুগল ড্রাইভ কানেক্ট করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...', 'info');
                            const { getFunctions, httpsCallable } = await import('firebase/functions');
                            const { app } = await import('../firebase.js');
                            
                            const functions = getFunctions(app);
                            const exchangeCode = httpsCallable(functions, 'exchangeGoogleAuthCode');
                            
                            const result = await exchangeCode({ code: response.code });
                            if (result.data.success) {
                                showNotification('গুগল ড্রাইভ সফলভাবে কানেক্ট হয়েছে! ✅', 'success');
                                if (driveStatus) {
                                    driveStatus.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
                                    driveStatus.style.color = '#10b981';
                                }
                            }
                        } catch (err) {
                            console.error('Google Drive Connect Error:', err);
                            showNotification('কানেক্ট করতে সমস্যা হয়েছে। ফাংশন ডিপ্লয়মেন্ট চেক করুন।', 'error');
                        }
                    }
                },
            });
            client.requestCode();
        });
    }

    autoBackupRadios.forEach(radio => {
        radio.addEventListener('change', async (e) => {
            try {
                const { db, doc, setDoc } = await getFS();
                await setDoc(doc(db, 'settings', 'gdriveIntegration'), {
                    schedule: e.target.value,
                    enabled: e.target.value !== 'off'
                }, { merge: true });
                showNotification(`অটো-ব্যাকআপ শিডিউল আপডেট করা হয়েছে: ${e.target.value}`, 'success');
            } catch (err) {
                showNotification('শিডিউল সেভ করতে সমস্যা হয়েছে।', 'error');
            }
        });
    });

    // Populate filter dropdowns globally
    populateDynamicDropdowns();

    function updateProgress(container, bar, text, pct, msg) {
        if (container) container.style.display = 'block';
        if (bar) bar.style.width = pct + '%';
        if (text) text.textContent = msg;
    }

    // Full Backup
    if (backupFullBtn) {
        backupFullBtn.addEventListener('click', async () => {
            backupFullBtn.disabled = true;
            const data = await createBackup({ type: 'full' }, (pct, msg) => {
                updateProgress(backupProgress, backupProgressBar, backupProgressText, pct, msg);
            });
            if (data) {
                downloadBackupFile(data);
                await saveBackupLog({
                    type: 'backup', mode: 'full',
                    totalDocuments: data.meta.totalDocuments,
                    timestamp: new Date().toISOString(),
                    performedBy: state.currentUser?.uid
                });
                loadAndRenderHistory();
            }
            backupFullBtn.disabled = false;
        });
    }

    // Selective Backup
    if (backupSelectiveBtn) {
        backupSelectiveBtn.addEventListener('click', async () => {
            backupSelectiveBtn.disabled = true;
            const filters = {};
            if (filterSession?.value) filters.session = filterSession.value;
            if (filterClass?.value) filters.className = filterClass.value;

            // Explicitly define which collections should be included in a selective backup
            const selectiveCollections = ['exams', 'students', 'examConfigs', 'tutorialExamConfigs'];

            const data = await createBackup({ type: 'selective', collections: selectiveCollections, filters }, (pct, msg) => {
                updateProgress(backupProgress, backupProgressBar, backupProgressText, pct, msg);
            });
            if (data) downloadBackupFile(data);
            backupSelectiveBtn.disabled = false;
        });
    }

    // Restore Upload
    if (restoreUploadBtn) {
        restoreUploadBtn.addEventListener('click', () => restoreFileInput?.click());
    }
    if (restoreFileInput) {
        restoreFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                pendingRestoreData = await parseBackupFile(file);
                renderRestorePreview(pendingRestoreData, restorePreview);
                if (restoreConfirmBtn) restoreConfirmBtn.style.display = 'inline-flex';
                if (restoreCancelBtn) restoreCancelBtn.style.display = 'inline-flex';
            } catch (err) {
                showNotification(err.message, 'error');
                pendingRestoreData = null;
            }
            restoreFileInput.value = '';
        });
    }

    // Restore Confirm
    if (restoreConfirmBtn) {
        restoreConfirmBtn.addEventListener('click', async () => {
            if (!pendingRestoreData) return;
            if (!confirm('⚠️ আপনি কি নিশ্চিত যে আপনি এই ব্যাকআপ রিস্টোর করতে চান?\n\nএটি বিদ্যমান ডেটার সাথে মার্জ হবে।')) return;
            if (!confirm('🔴 চূড়ান্ত নিশ্চিতকরণ: রিস্টোর শুরু করতে OK চাপুন।')) return;

            restoreConfirmBtn.disabled = true;
            const result = await executeRestore(pendingRestoreData, { mode: 'full' }, (pct, msg) => {
                updateProgress(restoreProgress, restoreProgressBar, restoreProgressText, pct, msg);
            });

            if (result.success) {
                showNotification('রিস্টোর সফলভাবে সম্পন্ন হয়েছে! ✅', 'success');
            } else {
                showNotification(`রিস্টোর আংশিক সম্পন্ন। ${result.errors.length} টি ত্রুটি।`, 'warning');
            }

            pendingRestoreData = null;
            if (restorePreview) restorePreview.innerHTML = '';
            restoreConfirmBtn.style.display = 'none';
            restoreConfirmBtn.disabled = false;
            if (restoreCancelBtn) restoreCancelBtn.style.display = 'none';
            loadAndRenderHistory();
        });
    }

    // Restore Cancel
    if (restoreCancelBtn) {
        restoreCancelBtn.addEventListener('click', () => {
            pendingRestoreData = null;
            if (restorePreview) restorePreview.innerHTML = '';
            restoreConfirmBtn.style.display = 'none';
            restoreCancelBtn.style.display = 'none';
        });
    }

    // Initial history load
    loadAndRenderHistory();
}

function renderRestorePreview(data, container) {
    if (!container) return;
    const preview = getBackupPreview(data);
    const collectionRows = Object.entries(preview.collections)
        .map(([name, info]) => `<tr><td>${name}</td><td>${info.count}</td><td>${info.type || 'documents'}</td></tr>`)
        .join('');

    container.innerHTML = `
        <div class="br-preview-card">
            <h4><i class="fas fa-file-alt"></i> ব্যাকআপ প্রিভিউ</h4>
            <div class="br-preview-meta">
                <p><strong>তারিখ:</strong> ${new Date(preview.meta.backupDate).toLocaleString('bn-BD')}</p>
                <p><strong>ভার্সন:</strong> ${preview.meta.appVersion}</p>
                <p><strong>ধরণ:</strong> ${preview.meta.backupType === 'full' ? 'সম্পূর্ণ' : 'নির্বাচিত'}</p>
                <p><strong>তৈরি করেছেন:</strong> ${preview.meta.creatorName}</p>
                <p><strong>মোট ডকুমেন্ট:</strong> ${preview.meta.totalDocuments}</p>
            </div>
            <table class="br-preview-table">
                <thead><tr><th>কালেকশন</th><th>সংখ্যা</th><th>ধরণ</th></tr></thead>
                <tbody>${collectionRows}</tbody>
            </table>
        </div>
    `;
}

async function loadAndRenderHistory() {
    const container = document.getElementById('brHistoryList');
    if (!container) return;
    const history = await loadBackupHistory();
    if (history.length === 0) {
        container.innerHTML = '<p class="text-muted">কোনো ব্যাকআপ ইতিহাস নেই।</p>';
        return;
    }
    container.innerHTML = history.map(h => `
        <div class="br-history-item">
            <div class="br-history-icon ${h.type === 'backup' ? 'backup' : 'restore'}">
                <i class="fas ${h.type === 'backup' ? 'fa-download' : 'fa-upload'}"></i>
            </div>
            <div class="br-history-info">
                <strong>${h.type === 'backup' ? 'ব্যাকআপ' : 'রিস্টোর'} — ${h.mode === 'full' ? 'সম্পূর্ণ' : 'নির্বাচিত'}</strong>
                <small>${new Date(h.timestamp).toLocaleString('bn-BD')}</small>
            </div>
        </div>
    `).join('');
}
