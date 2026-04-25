/**
 * Teacher Assignment Manager Module
 * Handles CRUD for teacher ↔ class/session/subject assignments
 * @module teacherAssignmentManager
 */

import { db, auth } from '../firebase.js';
import {
    collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { getAllUsers, createTeacherAccount, deleteTeacherFromFirestore, updateTeacherPassword, getLoginPermission, setLoginPermission, setUserLoginDisabled, getClassSubjectMappings } from '../firestoreService.js';
import html2canvas from 'html2canvas';
import { state } from './state.js';
import { showNotification } from '../utils.js';
import { setLoading, showConfirmModal } from './uiManager.js';

const COLLECTION_NAME = 'teacher_assignments';
let currentExportData = null; // Store current teacher data for high-res export

/**
 * Get all teacher assignments
 * @returns {Promise<Array>}
 */
export async function getTeacherAssignments() {
    try {
        const ref = collection(db, COLLECTION_NAME);
        const q = query(ref, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ docId: d.id, ...d.data() }));
    } catch (error) {
        console.error('টিচার অ্যাসাইনমেন্ট লোড করতে সমস্যা:', error);
        return [];
    }
}

/**
 * Assign a teacher to class/session/subjects
 * @param {Object} data - { uid, email, displayName, assignedClass, assignedSession, assignedSubjects }
 * @returns {Promise<boolean>}
 */
export async function assignTeacher(data) {
    if (!state.isSuperAdmin) {
        showNotification('শুধুমাত্র সুপার অ্যাডমিন টিচার অ্যাসাইন করতে পারবেন', 'error');
        return false;
    }
    try {
        const docId = `${data.uid}_${data.assignedClass}_${data.assignedSession}`.replace(/\s/g, '_');
        const docRef = doc(db, COLLECTION_NAME, docId);
        await setDoc(docRef, {
            ...data,
            assignedBy: auth.currentUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        // Also update user role to 'teacher' if not already admin/super_admin
        try {
            const { getDoc: gd } = await import('firebase/firestore');
            const userRef = doc(db, 'users', data.uid);
            const userSnap = await gd(userRef);
            if (userSnap.exists()) {
                const currentRole = userSnap.data().role;
                if (!['admin', 'super_admin'].includes(currentRole)) {
                    await setDoc(userRef, { role: 'teacher' }, { merge: true });
                    console.log(`Updated ${data.displayName}'s role to 'teacher'`);
                }
            }
        } catch (roleErr) {
            console.warn('Could not update teacher role:', roleErr);
        }

        showNotification('টিচার সফলভাবে অ্যাসাইন করা হয়েছে! ✅');
        return true;
    } catch (error) {
        console.error('টিচার অ্যাসাইন করতে সমস্যা:', error);
        showNotification('টিচার অ্যাসাইন করতে সমস্যা হয়েছে', 'error');
        return false;
    }
}

/**
 * Remove a teacher assignment
 * @param {string} docId
 * @returns {Promise<boolean>}
 */
export async function removeTeacherAssignment(docId) {
    if (!state.isSuperAdmin) return false;
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, docId));
        showNotification('অ্যাসাইনমেন্ট মুছে ফেলা হয়েছে');
        return true;
    } catch (error) {
        console.error('অ্যাসাইনমেন্ট মুছতে সমস্যা:', error);
        return false;
    }
}

/**
 * Get the current teacher's assignments
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export async function getTeacherAssignmentsByUid(uid) {
    const all = await getTeacherAssignments();
    return all.filter(a => a.uid === uid);
}

/**
 * Get the current teacher's assignments
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export async function getMyAssignments(uid) {
    return await getTeacherAssignmentsByUid(uid);
}

/**
 * Check if the teacher is assigned to a specific exam
 */
export async function isTeacherAssignedToExam(uid, examClass, examSession, examSubject) {
    if (state.isAdmin || state.isSuperAdmin) return true;
    const assignments = await getTeacherAssignmentsByUid(uid);
    return assignments.some(a =>
        a.assignedClass === examClass &&
        a.assignedSession === examSession &&
        a.assignedSubjects && a.assignedSubjects.includes(examSubject)
    );
}

/**
 * Check if a teacher has ANY authorization for a class/session/subject
 * Used as a more standard name in some modules
 */
export async function isTeacherAuthorized(uid, examClass, examSession, examSubject) {
    return await isTeacherAssignedToExam(uid, examClass, examSession, examSubject);
}

export function initTeacherAssignmentUI() {
    const saveBtn = document.getElementById('taSaveBtn');
    const deleteBtn = document.getElementById('taDeleteTeacherBtn');

    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const teacherSelect = document.getElementById('taTeacherSelect');
            const uid = teacherSelect.value;
            if (!uid || uid === 'new') return;

            const teacherName = teacherSelect.options[teacherSelect.selectedIndex].text;

            showConfirmModal(
                'আপনি কি নিশ্চিত যে এই শিক্ষক অ্যাকাউন্টটি মুছে ফেলতে চান?',
                async () => {
                    setLoading(true, '#teacherAssignmentPage .ta-form-column');
                    // Optional: delete their assignments to clean up DB
                    const assignments = await getTeacherAssignments();
                    for (const a of assignments) {
                        if (a.uid === uid) {
                            await removeTeacherAssignment(a.docId);
                        }
                    }
                    const success = await deleteTeacherFromFirestore(uid);
                    setLoading(false, '#teacherAssignmentPage .ta-form-column');

                    if (success) {
                        showNotification('শিক্ষক অ্যাকাউন্ট সফলভাবে মুছে ফেলা হয়েছে');
                        teacherSelect.value = '';
                        await loadTeacherAssignmentData();
                    } else {
                        showNotification('শিক্ষক মুছতে সমস্যা হয়েছে', 'error');
                    }
                },
                teacherName,
                'শিক্ষকের সব অ্যাসাইনমেন্টও মুছে যাবে। এটি স্থায়ীভাবে মুছে যাবে।'
            );
        });
    }

    // Modal listeners
    const modal = document.getElementById('teacherInfoCardModal');
    const closeBtn = document.getElementById('closeTeacherCardBtn');
    const downloadBtn = document.getElementById('downloadTeacherCardBtn');
    const exportWrapper = document.getElementById('teacherCardExportWrapper');

    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
    if (downloadBtn) {
        downloadBtn.onclick = async () => {
            if (!currentExportData || !exportWrapper) return;
            
            setLoading(true, '#teacherInfoCardModal .config-modal-content');
            try {
                // Render a fresh, fixed-width card into the export container
                const exportCardHtml = renderTeacherInfoCardHTML(currentExportData);
                exportWrapper.innerHTML = exportCardHtml;
                
                const cardEl = exportWrapper.querySelector('.tc-card');
                if (cardEl) {
                    cardEl.classList.add('tc-export-mode');
                    
                    // Force light-mode inline styles so dark mode doesn't cause blank/invisible content
                    cardEl.style.background = '#ffffff';
                    cardEl.style.color = '#1e293b';
                    cardEl.style.border = '1px solid #e2e8f0';
                    
                    // Force light-mode on all inner elements for consistent export
                    cardEl.querySelectorAll('.tc-name').forEach(el => { el.style.color = '#1e293b'; });
                    cardEl.querySelectorAll('.tc-info-value').forEach(el => { el.style.color = '#334155'; });
                    cardEl.querySelectorAll('.tc-info-label').forEach(el => { el.style.color = '#94a3b8'; });
                    cardEl.querySelectorAll('.tc-info-item').forEach(el => { el.style.background = 'rgba(0,0,0,0.02)'; });
                    cardEl.querySelectorAll('.tc-assignments-section').forEach(el => { el.style.background = 'rgba(67, 97, 238, 0.03)'; });
                    cardEl.querySelectorAll('.tc-assign-subjects').forEach(el => { el.style.color = '#334155'; });
                    cardEl.querySelectorAll('.tc-subjects-box').forEach(el => { 
                        el.style.borderColor = '#cbd5e1';
                        el.style.background = 'rgba(255, 255, 255, 0.5)';
                    });
                    cardEl.querySelectorAll('.tc-total-count-badge').forEach(el => {
                        el.style.background = '#f1f4ff';
                        el.style.borderColor = '#d1dbff';
                    });
                    cardEl.querySelectorAll('.tc-total-label').forEach(el => { el.style.color = '#64748b'; });
                    cardEl.querySelectorAll('.tc-dev-credit').forEach(el => { el.style.color = '#64748b'; });
                    cardEl.querySelectorAll('.tc-dev-name').forEach(el => { el.style.color = '#334155'; });
                    cardEl.querySelectorAll('.tc-footer-area').forEach(el => { el.style.background = '#ffffff'; });
                    cardEl.querySelectorAll('.tc-left-col').forEach(el => { el.style.borderRightColor = 'rgba(0,0,0,0.05)'; });
                    cardEl.querySelectorAll('.tc-avatar-wrapper').forEach(el => { 
                        el.style.background = '#ffffff';
                        el.style.borderColor = '#ffffff';
                    });
                }
                
                // Ensure images are loaded before capture
                const images = exportWrapper.querySelectorAll('img');
                await Promise.all(Array.from(images).map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
                }));

                // Allow layout to settle (fonts, flexbox recalc) before capture
                await new Promise(resolve => setTimeout(resolve, 300));

                const canvas = await html2canvas(cardEl || exportWrapper, {
                    useCORS: true,
                    scale: 2.5,
                    backgroundColor: '#ffffff',
                    width: 700,
                    windowWidth: 700,
                    logging: false,
                    allowTaint: true
                });

                const link = document.createElement('a');
                link.download = `teacher_card_${currentExportData.name.replace(/\s+/g, '_')}_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png', 1.0);
                link.click();
                
                exportWrapper.innerHTML = ''; // Clean up
                showNotification('প্রফেশনাল ল্যান্ডস্কেপ ইমেজ ডাউনলোড শুরু হয়েছে! ✅');
            } catch (err) {
                console.error('Download error:', err);
                showNotification('ডাউনলোড করতে সমস্যা হয়েছে', 'error');
            } finally {
                setLoading(false, '#teacherInfoCardModal .config-modal-content');
            }
        };
    }

    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    // Bulk Print listener
    const bulkPrintBtn = document.getElementById('taBulkPrintBtn');
    if (bulkPrintBtn) {
        bulkPrintBtn.onclick = () => printBulkTeacherCards();
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const teacherSelect = document.getElementById('taTeacherSelect');
            const classSelect = document.getElementById('taClassSelect');
            const sessionSelect = document.getElementById('taSessionSelect');

            // New account fields
            const nameInput = document.getElementById('taNewNameInput');
            const emailInput = document.getElementById('taNewEmailInput');
            const phoneInput = document.getElementById('taNewPhoneInput');
            const passInput = document.getElementById('taNewPassInput');

            const selectedTeacherValue = teacherSelect.value;
            let teacherData = {};

            if (selectedTeacherValue === 'new') {
                const name = nameInput.value.trim();
                const email = emailInput.value.trim();
                const phone = phoneInput.value.trim();
                const password = passInput.value.trim();

                if (!name || !email || !password) {
                    showNotification('নাম, ইমেইল ও পাসওয়ার্ড অবশ্যই দিতে হবে', 'error');
                    return;
                }

                setLoading(true, '#teacherAssignmentPage .ta-form-column');
                const result = await createTeacherAccount({ email, password, name, phone, role: 'teacher' });
                setLoading(false, '#teacherAssignmentPage .ta-form-column');

                if (result.success) {
                    teacherData = { uid: result.uid, email, displayName: name, phone };
                } else {
                    const msg = result.error === 'auth/email-already-in-use' ? 'এই ইমেইলটি ইতিপূর্বে ব্যবহৃত হয়েছে!' : 'অ্যাকাউন্ট তৈরি করতে সমস্যা হয়েছে';
                    showNotification(msg, 'error');
                    return;
                }
            } else {
                const opt = teacherSelect.options[teacherSelect.selectedIndex];
                teacherData = {
                    uid: selectedTeacherValue,
                    email: opt.dataset.email,
                    displayName: opt.dataset.name,
                    phone: opt.dataset.phone
                };
            }

            const assignedClass = classSelect.value;
            const assignedSession = sessionSelect.value;
            const assignedSubjects = Array.from(document.querySelectorAll('#taSubjectChecklist input[type="checkbox"]:checked'))
                .map(cb => cb.value);

            if (!teacherData.uid || !assignedClass || !assignedSession || assignedSubjects.length === 0) {
                showNotification('সকল তথ্য সঠিকভাবে পূরণ করুন', 'warning');
                return;
            }

            setLoading(true, '#teacherAssignmentPage .ta-form-column');
            const success = await assignTeacher({
                ...teacherData,
                assignedClass,
                assignedSession,
                assignedSubjects
            });
            setLoading(false, '#teacherAssignmentPage .ta-form-column');

            if (success) {
                // Reset form
                classSelect.value = '';
                document.querySelectorAll('#taSubjectChecklist input[type="checkbox"]').forEach(cb => cb.checked = false);
                await renderExistingAssignments();
            }
        });
    }

    // High-res professional card preview generator for individual cards
    window.addEventListener('click', async (e) => {
        const cardBtn = e.target.closest('.ta-id-card-btn');
        if (!cardBtn) return;
        
        const uid = cardBtn.dataset.uid;
        setLoading(true, '#teacherAssignmentPage');
        
        try {
            const allUsers = await getAllUsers();
            const user = allUsers.find(u => u.uid === uid) || {};
            const assignments = await getTeacherAssignments();
            const teacherAssignments = assignments.filter(a => a.uid === uid);
            
            const { getSettings } = await import('../firestoreService.js');
            const settings = await getSettings() || {};
            const adSettings = settings.admitCard || {};
            const instName = adSettings.instName || 'প্রতিষ্ঠানের নাম';
            const instAddress = adSettings.instAddress || 'প্রতিষ্ঠানের ঠিকানা';
            const logoUrl = adSettings.logoUrl || '';
            const developerCredit = settings.developerCredit || null;

            currentExportData = {
                uid: uid,
                name: user.displayName || 'Unnamed Teacher',
                phone: user.phone || 'N/A',
                email: user.email || 'N/A',
                password: user.tempPassword || '******',
                loginStatus: user.loginDisabled ? 'বন্ধ' : 'চালু',
                assignments: teacherAssignments,
                instName: instName,
                instAddress: instAddress,
                logoUrl: logoUrl,
                developerCredit: developerCredit
            };

            const container = document.getElementById('teacherCardPreview');
            if (!container) return;
            container.innerHTML = renderTeacherInfoCardHTML(currentExportData);
            document.getElementById('teacherInfoCardModal').classList.add('active');

            // Set up copy info for this specific teacher in the modal
            const copyBtn = document.getElementById('copyTeacherCardBtn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    let infoText = `--- শিক্ষক তথ্য ---\n`;
                    infoText += `নাম: ${user.displayName || 'No Name'}\n`;
                    infoText += `ফোন: ${user.phone || 'N/A'}\n`;
                    infoText += `ইমেইল: ${user.email}\n`;
                    if (user.tempPassword) infoText += `পাসওয়ার্ড: ${user.tempPassword}\n`;
                    infoText += `লগইন স্ট্যাটাস: ${user.loginDisabled ? 'বন্ধ ⛔' : 'চালু ✅'}\n\n`;
                    infoText += `অ্যাসাইনমেন্টসমূহ:\n`;
                    teacherAssignments.forEach(asg => {
                        infoText += `- ${asg.assignedClass} (${asg.assignedSession}): ${(asg.assignedSubjects || []).join(', ')}\n`;
                    });
                    
                    infoText += `\nলাইভ সফটওয়্যার লিংক: ${window.location.origin}\n`;

                    navigator.clipboard.writeText(infoText).then(() => {
                        showNotification('শিক্ষকের তথ্য কপি করা হয়েছে! ✅');
                    });
                };
            }
        } catch (err) {
            console.error('Modal load error:', err);
        } finally {
            setLoading(false, '#teacherAssignmentPage');
        }
    });

    // Copy everything listener
    window.addEventListener('click', async (e) => {
        const copyAllBtn = e.target.closest('.ta-copy-info-btn');
        if (!copyAllBtn) return;
        
        const uid = copyAllBtn.dataset.uid;
        const allUsers = await getAllUsers();
        const user = allUsers.find(u => u.uid === uid) || {};
        const assignments = await getTeacherAssignments();
        const teacherAssignments = assignments.filter(a => a.uid === uid);
        
        let infoText = `--- শিক্ষক তথ্য ---\n`;
        infoText += `নাম: ${user.displayName || 'No Name'}\n`;
        infoText += `ফোন: ${user.phone || 'N/A'}\n`;
        infoText += `ইমেইল: ${user.email}\n`;
        if (user.tempPassword) infoText += `পাসওয়ার্ড: ${user.tempPassword}\n`;
        infoText += `লগইন স্ট্যাটাস: ${user.loginDisabled ? 'বন্ধ ⛔' : 'চালু ✅'}\n\n`;
        infoText += `অ্যাসাইনমেন্টসমূহ:\n`;
        teacherAssignments.forEach(asg => {
            infoText += `- ${asg.assignedClass} (${asg.assignedSession}): ${(asg.assignedSubjects || []).join(', ')}\n`;
        });
        
        infoText += `\nলাইভ সফটওয়্যার লিংক: ${window.location.origin}\n`;

        navigator.clipboard.writeText(infoText).then(() => {
            showNotification('শিক্ষকের সকল তথ্য কপি করা হয়েছে! ✅');
        });
    });

    // Login Toggle listener for individual users
    window.addEventListener('click', async (e) => {
        const toggleTrack = e.target.closest('.ta-utoggle-track');
        if (!toggleTrack) return;

        const cb = toggleTrack.parentElement.querySelector('.ta-user-login-cb');
        const uid = cb.dataset.uid;
        const currentName = cb.dataset.name;
        const newState = !cb.checked;

        showConfirmModal(
            `${currentName}-এর জন্য লগইন ${newState ? 'এনাবল' : 'ডিসেবল'} করতে চান?`,
            async () => {
                const success = await setUserLoginDisabled(uid, !newState);
                if (success) {
                    cb.checked = newState;
                    const thumb = toggleTrack.querySelector('.ta-utoggle-thumb');
                    const label = toggleTrack.closest('.ta-user-login-toggle').querySelector('.ta-ulogin-label');
                    
                    if (newState) {
                        toggleTrack.style.background = "#4caf50";
                        thumb.style.left = "18px";
                        label.textContent = "চালু";
                        label.style.color = "#4caf50";
                    } else {
                        toggleTrack.style.background = "#d32f2f";
                        thumb.style.left = "2px";
                        label.textContent = "বন্ধ";
                        label.style.color = "#d32f2f";
                    }
                    showNotification(`লগইন ${newState ? 'চালু' : 'বন্ধ'} করা হয়েছে`);
                }
            },
            "ইউজার লগইন কন্ট্রোল"
        );
    });

    // Subject Edit Toggle
    window.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.ta-edit-subj-btn');
        if (!editBtn) return;
        const idx = editBtn.dataset.idx;
        const editDiv = document.getElementById(`ta-subj-edit-${idx}`);
        const displayDiv = document.getElementById(`ta-subj-display-${idx}`);
        
        if (editDiv.style.display === 'none') {
            editDiv.style.display = 'block';
            displayDiv.style.display = 'none';
        } else {
            editDiv.style.display = 'none';
            displayDiv.style.display = 'flex';
        }
    });

    // Cancel Subject Edit
    window.addEventListener('click', (e) => {
        const cancelBtn = e.target.closest('.ta-cancel-subj-btn');
        if (!cancelBtn) return;
        const idx = cancelBtn.dataset.idx;
        document.getElementById(`ta-subj-edit-${idx}`).style.display = 'none';
        document.getElementById(`ta-subj-display-${idx}`).style.display = 'flex';
    });

    // Save Subject Edit
    window.addEventListener('click', async (e) => {
        const saveBtn = e.target.closest('.ta-save-subj-btn');
        if (!saveBtn) return;
        
        const idx = saveBtn.dataset.idx;
        const docId = saveBtn.dataset.docId;
        const editDiv = document.getElementById(`ta-subj-edit-${idx}`);
        const selectedSubjects = Array.from(editDiv.querySelectorAll('.ta-card-subj-cb:checked:not(:disabled)'))
            .map(cb => cb.value);
            
        if (selectedSubjects.length === 0) {
            showNotification('কমপক্ষে একটি বিষয় নির্বাচন করুন', 'warning');
            return;
        }

        setLoading(true, '#teacherAssignmentPage');
        const success = await assignTeacher({
            uid: saveBtn.dataset.uid,
            email: saveBtn.dataset.email,
            displayName: saveBtn.dataset.name,
            assignedClass: saveBtn.dataset.class,
            assignedSession: saveBtn.dataset.session,
            assignedSubjects: selectedSubjects
        });
        setLoading(false, '#teacherAssignmentPage');

        if (success) {
            await renderExistingAssignments();
        }
    });

    // Password Update Handler
    window.addEventListener('click', async (e) => {
        const editPassBtn = e.target.closest('.ta-edit-pass-btn');
        if (!editPassBtn) return;

        const uid = editPassBtn.dataset.uid;
        const email = editPassBtn.dataset.email;
        const oldPass = editPassBtn.dataset.old;
        const newPass = prompt(`নতুন পাসওয়ার্ড প্রদান করুন (বর্তমান: ${oldPass}):`);

        if (newPass && newPass.trim() !== '' && newPass !== oldPass) {
            if (newPass.length < 6) {
                showNotification('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে', 'error');
                return;
            }
            setLoading(true, '#teacherAssignmentPage');
            const result = await updateTeacherPassword(uid, newPass);
            setLoading(false, '#teacherAssignmentPage');
            if (result && result.success) {
                showNotification('পাসওয়ার্ড আপডেট করা হয়েছে! ✅');
                await renderExistingAssignments();
            } else {
                const errMsg = result?.error === 'missing-credentials' ? 'এই টিচারের পূর্বের পাসওয়ার্ড পাওয়া যায়নি। অনুগ্রহ করে টিচার অ্যাকাউন্ট নতুন করে তৈরি করুন।' : 'পাসওয়ার্ড আপডেট করতে সমস্যা হয়েছে!';
                showNotification(errMsg, 'error');
            }
        }
    });
}

/**
 * Load and populate initial data
 */
export async function loadTeacherAssignmentData() {
    console.log("Loading teacher assignment data...");
    try {
        const teacherSelect = document.getElementById('taTeacherSelect');
        const classSelect = document.getElementById('taClassSelect');
        const checklist = document.getElementById('taSubjectChecklist');

        if (!teacherSelect || !classSelect || !checklist) {
            console.warn("One or more assignment UI elements missing.");
            return;
        }

        setLoading(true, '#teacherAssignmentPage .ta-form-column');
        const users = await getAllUsers();
        setLoading(false, '#teacherAssignmentPage .ta-form-column');

        teacherSelect.innerHTML = '<option value="">টিচার নির্বাচন করুন</option><option value="new">+ নতুন টিচার অ্যাকাউন্ট তৈরি করুন</option>';
        users.forEach(user => {
            if (user.role !== 'super_admin') {
                const opt = document.createElement('option');
                opt.value = user.uid;
                opt.textContent = `${user.displayName || 'No Name'} (${user.email})`;
                opt.dataset.email = user.email;
                opt.dataset.name = user.displayName || '';
                opt.dataset.phone = user.phone || '';
                teacherSelect.appendChild(opt);
            }
        });
        console.log("Teacher select dropdown populated.");

        // Toggle new teacher fields based on selection
        const newFields = document.getElementById('taNewTeacherFields');
        const deleteBtn = document.getElementById('taDeleteTeacherBtn');
        // Prevent duplicate listeners
        teacherSelect.onchange = () => {
            const val = teacherSelect.value;
            newFields.style.display = val === 'new' ? 'block' : 'none';
            if (val === 'new') {
                document.getElementById('taNewPassInput').value = Math.random().toString(36).slice(-8); // Auto-generate pass
            }
            if (deleteBtn) {
                if (val && val !== 'new' && state.isSuperAdmin) {
                    deleteBtn.style.display = 'block';
                } else {
                    deleteBtn.style.display = 'none';
                }
            }
        };
        // Trigger change to set correct initial state
        teacherSelect.dispatchEvent(new Event('change'));

        console.log("Fetching exams and class-subject mappings...");
        const { getSavedExams } = await import('../firestoreService.js');
        const exams = await getSavedExams();
        const classSubjectMappings = await getClassSubjectMappings();
        console.log("Exams fetched:", exams.length, "Mappings:", classSubjectMappings);

        // Merge classes from exams + class-subject mappings
        const classesFromExams = exams.map(e => e.class).filter(Boolean);
        const metaFields = new Set(['updatedAt', 'createdAt', 'id', '_id', 'updatedBy', 'createdBy']);
        const classesFromMappings = Object.keys(classSubjectMappings).filter(k => k && !metaFields.has(k));
        const classes = [...new Set([...classesFromExams, ...classesFromMappings])].sort();
        console.log("Classes derived (merged):", classes);

        classSelect.innerHTML = '<option value="">শ্রেণি নির্বাচন</option>';
        classes.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = cls;
            classSelect.appendChild(opt);
        });

        // --- Dynamic subject checklist based on selected class ---
        // This function rebuilds the subject checklist from the class-subject mapping
        // AND from existing exam subjects for the selected class
        function rebuildSubjectChecklist(selectedClass) {
            // Subjects from class-subject mapping
            let mappedSubjects = [];
            if (selectedClass && classSubjectMappings[selectedClass]) {
                const raw = classSubjectMappings[selectedClass];
                mappedSubjects = Array.isArray(raw) ? raw : (raw.subjects || []);
            }

            // Subjects from existing exams for this class
            const examSubjects = exams
                .filter(e => !selectedClass || e.class === selectedClass)
                .map(e => e.subject)
                .filter(Boolean);

            // Merge and deduplicate
            const allSubjects = [...new Set([...mappedSubjects, ...examSubjects])].sort();
            console.log(`Subjects for class "${selectedClass}":`, allSubjects);

            checklist.innerHTML = '';
            if (allSubjects.length === 0) {
                checklist.innerHTML = '<p style="opacity: 0.5; font-size: 0.9em; margin: 5px 0;">কোনো বিষয় পাওয়া যায়নি। ক্লাস-সাবজেক্ট ম্যাপিং সেটআপ করুন।</p>';
                return;
            }
            allSubjects.forEach(subj => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${subj}"> <span>${subj}</span>`;
                checklist.appendChild(label);
            });
        }

        // Initial population (no class selected = show all subjects)
        rebuildSubjectChecklist('');

        await renderExistingAssignments();

        // Implement logic to pre-check and disable already assigned subjects
        const sessionSelect = document.getElementById('taSessionSelect');

        async function updateCheckboxes() {
            const selectedTeacher = teacherSelect.value;
            const selectedClass = classSelect.value;
            const selectedSession = sessionSelect.value;

            // First rebuild the subject checklist for the selected class
            rebuildSubjectChecklist(selectedClass);

            if (!selectedClass || !selectedSession) {
                // If not enough info, just reset checkboxes to enabled & unchecked
                document.querySelectorAll('#taSubjectChecklist input[type="checkbox"]').forEach(cb => {
                    cb.checked = false;
                    cb.disabled = false;
                    cb.parentElement.classList.remove('ta-subj-disabled');
                });
                return;
            }

            const allAssignments = await getTeacherAssignments();

            document.querySelectorAll('#taSubjectChecklist label').forEach(label => {
                const cb = label.querySelector('input[type="checkbox"]');
                const span = label.querySelector('span');
                const subj = cb.value;
                let assignedTo = null; // Store user who has it

                // Find if this subject is assigned in the given class & session
                allAssignments.forEach(a => {
                    if (a.assignedClass === selectedClass && a.assignedSession === selectedSession && a.assignedSubjects && a.assignedSubjects.includes(subj)) {
                        assignedTo = a;
                    }
                });

                if (assignedTo) {
                    const isOwn = assignedTo.uid === selectedTeacher;
                    cb.checked = true;
                    
                    if (!isOwn) {
                        cb.disabled = true;
                        label.classList.add('ta-subj-disabled');
                        span.innerHTML = `<span class="ta-subj-conflict"><i class="fas fa-exclamation-circle"></i> ${subj} <span class="ta-subj-conflict-name">(${assignedTo.displayName || assignedTo.email})</span></span>`;
                        label.title = `${assignedTo.displayName || assignedTo.email} এই বিষয়টি পরিচালনা করছেন।`;
                    } else {
                        cb.disabled = false;
                        label.classList.remove('ta-subj-disabled');
                        span.textContent = subj;
                        label.title = "";
                    }
                } else {
                    cb.checked = false;
                    cb.disabled = false;
                    label.classList.remove('ta-subj-disabled');
                    span.textContent = subj;
                    label.title = "";
                }
            });
        }

        classSelect.addEventListener('change', updateCheckboxes);
        sessionSelect.addEventListener('change', updateCheckboxes);
        teacherSelect.addEventListener('change', updateCheckboxes);


        // --- Global Login Toggle (Super Admin Only) ---
        const loginToggleSection = document.getElementById("taLoginToggleSection");
        if (loginToggleSection && state.isSuperAdmin) {
            loginToggleSection.style.display = "block";
            const toggle = document.getElementById("taLoginToggle");
            const label = document.getElementById("loginToggleLabel");
            const track = document.getElementById("taLoginToggleTrack");
            const thumb = document.getElementById("taLoginToggleThumb");

            const isEnabled = await getLoginPermission();
            toggle.checked = isEnabled;
            updateToggleUI(isEnabled, label, track, thumb);

            track.onclick = () => {
                const newState = !toggle.checked;
                const confirmMsg = newState
                    ? "সকল ইউজারের লগইন পারমিশন এনাবল করতে চান?"
                    : "⚠️ সকল ইউজারের লগইন সম্পূর্ণ বন্ধ করতে চান?";

                showConfirmModal(
                    confirmMsg,
                    async () => {
                        const success = await setLoginPermission(newState);
                        if (success) {
                            toggle.checked = newState;
                            updateToggleUI(newState, label, track, thumb);
                            showNotification(newState ? "লগইন এনাবল করা হয়েছে ✅" : "লগইন ডিসেবল করা হয়েছে ⛔");
                        } else {
                            showNotification("সেটিংস আপডেট করতে সমস্যা হয়েছে", "error");
                        }
                    },
                    "গ্লোবাল লগইন কন্ট্রোল",
                    newState ? "সব টিচার লগইন করতে পারবেন।" : "সুপার অ্যাডমিন ছাড়া কেউ লগইন করতে পারবে না!"
                );
            };
        }
    } catch (err) {
        console.error("Error loading teacher assignment data:", err);
        showNotification("ডেটা লোড করতে সমস্যা হয়েছে: " + err.message, 'error');
    }
}

function updateToggleUI(isEnabled, label, track, thumb) {
    if (isEnabled) {
        label.textContent = "এনাবলড";
        label.style.color = "#4caf50";
        track.style.background = "#4caf50";
        thumb.style.left = "26px";
    } else {
        label.textContent = "ডিসেবলড";
        label.style.color = "#d32f2f";
        track.style.background = "#d32f2f";
        thumb.style.left = "2px";
    }
}

async function renderExistingAssignments() {
    const listEl = document.getElementById('taExistingList');
    let assignments = await getTeacherAssignments();
    const allUsers = await getAllUsers();

    // Non-super-admin users only see their own assignments
    if (!state.isSuperAdmin && state.currentUser) {
        assignments = assignments.filter(a => a.uid === state.currentUser.uid);
    }

    // Get all available subjects from exams AND class-subject mappings for the edit UI
    const { getSavedExams } = await import('../firestoreService.js');
    const exams = await getSavedExams();
    const classSubjectMappings = await getClassSubjectMappings();

    // Subjects from exams
    const examSubjects = exams.map(e => e.subject).filter(Boolean);
    // Subjects from mappings (flatten all classes)
    const mappingSubjects = Object.values(classSubjectMappings).flatMap(v => Array.isArray(v) ? v : (v.subjects || []));
    const allSubjects = [...new Set([...examSubjects, ...mappingSubjects])].sort();

    // Update statistics badges
    const totalAsgBadge = document.getElementById('taTotalAssignments');
    const uniqueTeacherBadge = document.getElementById('taUniqueTeachers');
    
    if (totalAsgBadge) {
        totalAsgBadge.textContent = `মোট এসাইনকৃত তালিকা: ${assignments.length}টি`;
    }
    if (uniqueTeacherBadge) {
        const uniqueTeachersCount = [...new Set(assignments.map(a => a.uid))].length;
        uniqueTeacherBadge.textContent = `মোট শিক্ষক দায়িত্বে আছেন: ${uniqueTeachersCount} জন`;
    }

    if (assignments.length === 0) {
        listEl.innerHTML = '<p style="opacity: 0.5;">কোনো অ্যাসাইনমেন্ট নেই</p>';
        return;
    }

    listEl.innerHTML = assignments.map((a, idx) => {
        const userDoc = allUsers.find(u => u.uid === a.uid);
        let passwordHtml = '';
        if (state.isSuperAdmin) {
            const currentPass = userDoc && userDoc.tempPassword ? userDoc.tempPassword : null;
            passwordHtml = `
                <div style="margin-top: 8px; padding: 6px 10px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef; display: inline-flex; align-items: center; gap: 10px; font-size: 0.85em; flex-wrap: wrap;">
                    <span style="color: #6c757d;">পাসওয়ার্ড:</span>
                    ${currentPass ? `
                        <code style="background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.95em; letter-spacing: 0.5px;">${currentPass}</code>
                        <button type="button" class="ta-copy-btn" data-pass="${currentPass}" style="background: none; border: none; color: var(--primary); cursor: pointer; padding: 2px 5px;" title="পাসওয়ার্ড কপি করুন">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button type="button" class="ta-edit-pass-btn" data-uid="${a.uid}" data-email="${a.email}" data-old="${currentPass}" style="background: none; border: none; color: #ff9800; cursor: pointer; padding: 2px 5px;" title="পাসওয়ার্ড পরিবর্তন করুন">
                            <i class="fas fa-key"></i>
                        </button>
                    ` : `
                        <strong style="color: #ff9800;">⚠️ সেট করা হয়নি (গুগল লগইন)</strong>
                    `}
                </div>
            `;
        }

        // Subject edit checkboxes (hidden by default)
        const subjectCheckboxes = allSubjects.map(s => {
            const currentAssignment = assignments.find(item => item.assignedClass === a.assignedClass && item.assignedSession === a.assignedSession && item.assignedSubjects.includes(s));
            
            let isChecked = (a.assignedSubjects || []).includes(s);
            let isDisabled = false;
            let conflictHtml = s;
            let labelClass = "";
            let title = "";

            if (currentAssignment) {
                if (currentAssignment.uid !== a.uid) {
                    isDisabled = true;
                    isChecked = true;
                    labelClass = "ta-subj-disabled";
                    conflictHtml = `<span class="ta-subj-conflict"><i class="fas fa-exclamation-circle"></i> ${s} <span class="ta-subj-conflict-name">(${currentAssignment.displayName || currentAssignment.email})</span></span>`;
                    title = `${currentAssignment.displayName || currentAssignment.email} এই বিষয়টি পরিচালনা করছেন।`;
                }
            }

            return `<label class="ta-card-subj-label ${labelClass}" title="${title}" style="display: inline-flex; align-items: center; gap: 4px; margin: 3px 6px 3px 0; font-size: 0.85em; cursor: pointer; padding: 2px 6px; border-radius: 4px;">
                <input type="checkbox" value="${s}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} class="ta-card-subj-cb"> 
                <span>${conflictHtml}</span>
            </label>`;
        }).join('');

        return `
            <div class="ta-assignment-card" data-card-idx="${idx}" data-doc-id="${a.docId}">
                <div class="ta-info" style="flex: 1;">
                    <span class="ta-name">${a.displayName || 'No Name'} (${a.email})</span>
                    <span class="ta-detail">${a.assignedClass} | ${a.assignedSession}</span>
                    <div class="ta-subjects" id="ta-subj-display-${idx}" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px;">
                        ${(a.assignedSubjects || []).map(s =>
            `<span class="ta-subject-tag">${s}</span>`
        ).join('')}
                    </div>
                    <div class="ta-subjects-edit" id="ta-subj-edit-${idx}" style="display: none; margin-top: 12px; padding: 15px; background: #f8faff; border-radius: 12px; border: 1px solid #dbeafe; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                        <div style="display: flex; flex-wrap: wrap; gap: 5px;">${subjectCheckboxes}</div>
                        <div style="margin-top: 15px; display: flex; gap: 10px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 12px;">
                            <button type="button" class="ta-save-subj-btn dm-btn dm-save" data-idx="${idx}" data-doc-id="${a.docId}" data-uid="${a.uid}" data-email="${a.email || ''}" data-name="${a.displayName || ''}" data-class="${a.assignedClass}" data-session="${a.assignedSession}" style="padding: 6px 20px; font-size: 0.85em; font-weight: 600;">
                                <i class="fas fa-check"></i> আপডেট
                            </button>
                            <button type="button" class="ta-cancel-subj-btn dm-btn dm-danger" data-idx="${idx}" style="padding: 6px 20px; font-size: 0.85em; font-weight: 600; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;">
                                <i class="fas fa-times"></i> বাতিল
                            </button>
                        </div>
                    </div>
                    ${passwordHtml}
                    ${state.isSuperAdmin ? `
                    <div class="ta-login-toggle" style="margin-top: 8px; padding: 6px 10px; background: var(--container-bg); border-radius: 6px; border: 1px solid var(--border-color); display: inline-flex; align-items: center; gap: 8px; font-size: 0.85em;">
                        <span style="color: var(--text-color);">লগইন:</span>
                        <label class="ta-user-login-toggle" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                            <div style="position: relative; width: 36px; height: 20px;">
                                <input type="checkbox" class="ta-user-login-cb" data-uid="${a.uid}" data-name="${a.displayName || a.email}"
                                    ${!(userDoc && userDoc.loginDisabled) ? 'checked' : ''}
                                    style="opacity: 0; width: 0; height: 0; position: absolute;">
                                <div class="ta-utoggle-track" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: ${!(userDoc && userDoc.loginDisabled) ? '#4caf50' : '#d32f2f'}; border-radius: 10px; transition: all 0.3s; cursor: pointer;">
                                    <div class="ta-utoggle-thumb" style="position: absolute; top: 2px; left: ${!(userDoc && userDoc.loginDisabled) ? '18px' : '2px'}; width: 16px; height: 16px; background: white; border-radius: 50%; transition: all 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
                                </div>
                            </div>
                            <span class="ta-ulogin-label" style="font-weight: 600; color: ${!(userDoc && userDoc.loginDisabled) ? '#4caf50' : '#d32f2f'}; font-size: 0.9em;">
                                ${!(userDoc && userDoc.loginDisabled) ? 'চালু' : 'বন্ধ'}
                            </span>
                        </label>
                    </div>
                    ` : ''}
                </div>
                    <div style="display: flex; flex-direction: column; gap: 6px; align-items: center;">
                    ${state.isSuperAdmin ? `
                    <button class="ta-copy-info-btn" data-uid="${a.uid}" title="শিক্ষকের সব তথ্য কপি করুন">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="ta-id-card-btn" data-uid="${a.uid}" title="শিক্ষক ইনফো কার্ড দেখুন">
                        <i class="fas fa-id-card"></i>
                    </button>
                    <button class="ta-edit-subj-btn" data-idx="${idx}" style="background: none; border: none; color: #1976d2; cursor: pointer; padding: 4px 6px; font-size: 1.1em;" title="বিষয় এডিট করুন">
                        <i class="fas fa-pen-square"></i>
                    </button>
                    <button class="ta-remove-btn" data-doc-id="${a.docId}" title="অ্যাসাইনমেন্ট মুছে ফেলুন" style="background: none; border: none; color: #d32f2f; cursor: pointer; padding: 4px 6px; font-size: 1.1em;">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Delete handlers
    listEl.querySelectorAll('.ta-remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const card = btn.closest('.ta-assignment-card');
            const teacherName = card.querySelector('.ta-name').textContent;
            const details = card.querySelector('.ta-detail').textContent;

            showConfirmModal(
                'এই অ্যাসাইনমেন্ট মুছে ফেলতে চান?',
                async () => {
                    await removeTeacherAssignment(btn.dataset.docId);
                    await renderExistingAssignments();
                },
                teacherName,
                `${details} - এটি স্থায়ীভাবে মুছে যাবে`
            );
        });
    });

    // Copy Password handlers
    listEl.querySelectorAll('.ta-copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pass = btn.dataset.pass;
            navigator.clipboard.writeText(pass).then(() => {
                showNotification('পাসওয়ার্ড কপি করা হয়েছে! ✅');
            });
        });
    });

}

/**
 * Render Teacher ID Card HTML
 */
function renderTeacherInfoCardHTML(data) {
    // Dynamic Unique Theme Generator based on UID
    const generateTheme = (uid) => {
        let hash = 0;
        const str = String(uid || 'default');
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Base Hue (0-360)
        const hue = Math.abs(hash) % 360;
        
        // Soft Professional Gradient Colors
        const start = `hsl(${hue}, 65%, 50%)`;
        const end = `hsl(${(hue + 25) % 360}, 65%, 45%)`;
        const accent = `hsl(${hue}, 75%, 40%)`;
        const light = `hsl(${hue}, 40%, 96%)`;
        
        return { start, end, accent, light };
    };

    const theme = generateTheme(data.uid);

    // Helper for session colors (Dynamic but distinct from main theme)
    const getSessionStyle = (session) => {
        let hash = 0;
        const str = String(session || 'default');
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const sHue = Math.abs(hash) % 360;
        return `background: hsl(${sHue}, 70%, 97%); color: hsl(${sHue}, 80%, 35%); border: 1px solid hsl(${sHue}, 60%, 85%);`;
    };

    const totalSubjectsCount = data.assignments.reduce((acc, asg) => acc + (asg.assignedSubjects || []).length, 0);

    const assignmentsHtml = data.assignments.map(asg => {
        const subjCount = (asg.assignedSubjects || []).length;
        return `
            <div class="tc-assign-row">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="tc-assign-class-badge" style="${getSessionStyle(asg.assignedSession)}">
                        ${asg.assignedClass} (${asg.assignedSession})
                    </span>
                    <span class="tc-row-count-badge">${subjCount}টি বিষয়</span>
                </div>
                <div class="tc-subjects-box">
                    <span class="tc-assign-subjects">${(asg.assignedSubjects || []).join(', ')}</span>
                </div>
            </div>
        `;
    }).join('');

    const logoHtml = data.logoUrl 
        ? `<img src="${data.logoUrl}" alt="Logo">` 
        : `<i class="fas fa-university"></i>`;

    const liveLink = window.location.origin;

    // Developer Credit Logic
    let devCreditHtml = '';
    const dev = data.developerCredit;
    if (dev) {
        if (typeof dev === 'string') {
            devCreditHtml = `
                <div class="tc-dev-credit">
                    ${dev}
                </div>
            `;
        } else if (dev.enabled !== false) {
            devCreditHtml = `
                <div class="tc-dev-credit">
                    ${dev.text || 'Developed By:'} <span class="tc-dev-name">${dev.name || 'Mustafa Rahman'}</span>
                </div>
            `;
        }
    } else {
        devCreditHtml = `
            <div class="tc-dev-credit">
                Developed by <span class="tc-dev-name">Mustafa Rahman</span>
            </div>
        `;
    }

    return `
        <div class="tc-card" id="tc-card-${data.uid}">
            <div class="tc-header" style="background: linear-gradient(135deg, ${theme.start}, ${theme.end});">
                <div class="tc-logo-section">
                    ${logoHtml}
                </div>
                <div class="tc-header-text">
                    <h2 class="tc-inst-name">${data.instName}</h2>
                    <p class="tc-inst-addr">${data.instAddress}</p>
                </div>
            </div>

            <div class="tc-body">
                <div class="tc-left-col">
                    <div class="tc-avatar-wrapper" style="border-color: ${theme.start};">
                        <div class="tc-avatar-placeholder" style="background: ${theme.light}; color: ${theme.accent};">
                            ${data.name.charAt(0)}
                        </div>
                    </div>
                    <div class="tc-info-summary">
                        <h3 class="tc-name">${data.name}</h3>
                        <p class="tc-status-badge ${data.loginStatus === 'চালু' ? 'active' : 'inactive'}">
                            লগইন ${data.loginStatus}
                        </p>
                    </div>
                    
                    <div class="tc-contact-list">
                        <div class="tc-info-item">
                            <span class="tc-info-label">ফোন</span>
                            <span class="tc-info-value">${data.phone}</span>
                        </div>
                        <div class="tc-info-item">
                            <span class="tc-info-label">ইমেইল</span>
                            <span class="tc-info-value">${data.email}</span>
                        </div>
                        <div class="tc-info-item">
                            <span class="tc-info-label">পাসওয়ার্ড</span>
                            <span class="tc-info-value" style="font-family: monospace;">${data.password}</span>
                        </div>
                    </div>
                </div>

                <div class="tc-right-col">
                    <div class="tc-assignments-section">
                        <div class="tc-section-header">
                            <span class="tc-section-title"><i class="fas fa-briefcase"></i> অ্যাসাইনমেন্টসমূহ</span>
                            <div class="tc-total-count-badge">
                                <span class="tc-total-label">মোট বিষয়</span>
                                <span class="tc-total-num">${totalSubjectsCount}</span>
                            </div>
                        </div>
                        
                        <div class="tc-assign-list-scroll">
                            ${assignmentsHtml || '<div style="opacity:0.5; font-style:italic; grid-column: 1/-1; text-align: center; padding: 20px;">কোনো অ্যাসাইনমেন্ট পাওয়া যায়নি</div>'}
                        </div>
                    </div>
                </div>
            </div>

            <div class="tc-footer-area">
                <div class="tc-live-link">
                    <i class="fas fa-globe"></i> সফটওয়্যার লিংক: ${liveLink}
                </div>
                ${devCreditHtml}
            </div>
        </div>
    `;
}

/**
 * Print Bulk Teacher Cards (3x2 grid on A4 Landscape)
 * Includes ALL unique teachers from the users list
 */
async function printBulkTeacherCards() {
    setLoading(true, '#teacherAssignmentPage');
    try {
        const allUsers = await getAllUsers();
        const { getSettings } = await import('../firestoreService.js');
        const settings = await getSettings() || {};
        const adSettings = settings.admitCard || {};
        const instName = adSettings.instName || 'প্রতিষ্ঠানের নাম';
        const instAddress = adSettings.instAddress || 'প্রতিষ্ঠানের ঠিকানা';
        const logoUrl = adSettings.logoUrl || '';
        const developerCredit = settings.developerCredit || null;

        // Get all assignments and group by teacher UID
        const assignments = await getTeacherAssignments();
        const assignmentsMap = new Map();
        assignments.forEach(asg => {
            if (!assignmentsMap.has(asg.uid)) {
                assignmentsMap.set(asg.uid, []);
            }
            assignmentsMap.get(asg.uid).push(asg);
        });

        // Collect ALL unique teachers: from assignments + from users list (non-super_admin)
        const allTeacherUids = new Set();
        assignments.forEach(asg => allTeacherUids.add(asg.uid));
        allUsers.forEach(user => {
            if (user.role !== 'super_admin') {
                allTeacherUids.add(user.uid);
            }
        });

        // Sort by name
        const teacherUids = Array.from(allTeacherUids).sort((a, b) => {
            const uA = allUsers.find(u => u.uid === a) || {};
            const uB = allUsers.find(u => u.uid === b) || {};
            return (uA.displayName || '').localeCompare(uB.displayName || '');
        });

        const bulkContainer = document.getElementById('bulkTeacherCardsContainer');
        bulkContainer.innerHTML = '';
        
        if (teacherUids.length === 0) {
            showNotification('কোনো শিক্ষক তথ্য পাওয়া যায়নি', 'warning');
            return;
        }

        // Create grid(s) for printing
        let currentPage;
        let currentGrid;
        
        teacherUids.forEach((uid, index) => {
            const user = allUsers.find(u => u.uid === uid) || {};
            const tAssignments = assignmentsMap.get(uid) || [];

            // Every 6 cards, create a new A4 page (2x3 grid)
            if (index % 6 === 0) {
                currentPage = document.createElement('div');
                currentPage.className = 'a4-landscape-page tc-print-page';
                
                currentGrid = document.createElement('div');
                currentGrid.className = 'tc-bulk-grid';
                currentPage.appendChild(currentGrid);
                
                const footer = document.createElement('div');
                footer.className = 'tc-print-footer';
                const pageNum = Math.floor(index / 6) + 1;
                const totalPages = Math.ceil(teacherUids.length / 6);
                
                let devText = '';
                if (developerCredit && typeof developerCredit === 'object') {
                    if (developerCredit.enabled !== false) {
                        devText = `${developerCredit.text || 'সফটওয়্যার নির্মাতা:'} ${developerCredit.name || ''}`;
                        if (developerCredit.link) devText += ` | ${developerCredit.link}`;
                    }
                }

                footer.innerHTML = `
                    <span style="font-weight: 700; color: #1e293b;">মুদ্রণে: ${instName}</span>
                    <span style="opacity:0.8; font-size: 0.9em; font-weight: 500;">${devText}</span>
                    <span style="font-weight: 700; color: #1e293b;">পৃষ্ঠা ${pageNum} / ${totalPages}</span>
                `;
                currentPage.appendChild(footer);
                bulkContainer.appendChild(currentPage);
            }

            const cardHtml = renderTeacherInfoCardHTML({
                uid: uid,
                name: user.displayName || 'শিক্ষকের নাম পাওয়া যায়নি',
                phone: user.phone || 'N/A',
                email: user.email || 'N/A',
                password: user.tempPassword || '******',
                loginStatus: user.loginDisabled ? 'বন্ধ' : 'চালু',
                assignments: tAssignments,
                instName: instName,
                instAddress: instAddress,
                logoUrl: logoUrl,
                developerCredit: developerCredit
            });

            const cardWrapper = document.createElement('div');
            cardWrapper.innerHTML = cardHtml;
            const finalCard = cardWrapper.firstElementChild;
            
            // Expert touch: force dimensions and styling for print quality
            if (finalCard) {
                finalCard.classList.add('tc-print-optimized');
                if (currentGrid) {
                    currentGrid.appendChild(finalCard);
                }
            }
        });

        // Add print mode class and trigger print
        document.body.classList.add('tc-print-mode');

        // Dynamically inject @page rule to avoid CSS conflicts with other print modes
        let tcPrintPageStyle = document.getElementById('tcPrintPageStyle');
        if (!tcPrintPageStyle) {
            tcPrintPageStyle = document.createElement('style');
            tcPrintPageStyle.id = 'tcPrintPageStyle';
            document.head.appendChild(tcPrintPageStyle);
        }
        tcPrintPageStyle.innerHTML = '@page { size: A4 landscape; margin: 0; }';

        window.onafterprint = () => {
            document.body.classList.remove('tc-print-mode');
            if (tcPrintPageStyle) tcPrintPageStyle.innerHTML = '';
        };

        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.body.classList.remove('tc-print-mode');
                if (tcPrintPageStyle) tcPrintPageStyle.innerHTML = '';
            }, 1000);
        }, 800);

    } catch (err) {
        console.error('Bulk print error:', err);
        showNotification('বাল্ক প্রিন্ট করতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false, '#teacherAssignmentPage');
    }
}
