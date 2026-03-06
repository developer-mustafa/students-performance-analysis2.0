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
import { state } from './state.js';
import { showNotification } from '../utils.js';
import { setLoading, showConfirmModal } from './uiManager.js';

const COLLECTION_NAME = 'teacher_assignments';

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
export async function getMyAssignments(uid) {
    const all = await getTeacherAssignments();
    return all.filter(a => a.uid === uid);
}

// Alias for compatibility with resultEntryManager.js
export const getTeacherAssignmentsByUid = getMyAssignments;

/**
 * Check if a teacher is authorized for a specific class/session/subject
 * @param {string} uid
 * @param {string} examClass
 * @param {string} examSession
 * @param {string} examSubject
 * @returns {Promise<boolean>}
 */
export async function isTeacherAuthorized(uid, examClass, examSession, examSubject) {
    if (state.isAdmin || state.isSuperAdmin) return true;
    const assignments = await getMyAssignments(uid);
    return assignments.some(a =>
        a.assignedClass === examClass &&
        a.assignedSession === examSession &&
        a.assignedSubjects && a.assignedSubjects.includes(examSubject)
    );
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
                const selectedTeacher = teacherSelect.options[teacherSelect.selectedIndex];
                if (!selectedTeacher || !selectedTeacher.value) {
                    showNotification('একজন টিচার নির্বাচন করুন', 'error');
                    return;
                }
                teacherData = {
                    uid: selectedTeacher.value,
                    email: selectedTeacher.dataset.email || '',
                    displayName: selectedTeacher.dataset.name || selectedTeacher.textContent,
                    phone: selectedTeacher.dataset.phone || ''
                };
            }

            const assignedClass = classSelect.value;
            const assignedSession = sessionSelect.value;

            if (!assignedClass || !assignedSession) {
                showNotification('শ্রেণি ও সেশন দিন', 'error');
                return;
            }

            // Get selected subjects
            const checkedBoxes = document.querySelectorAll('#taSubjectChecklist input[type="checkbox"]:checked');
            // We must filter out disabled ones if they are already assigned, OR we can just check all selected
            // But we need to ensure we don't allow assigning to someone else.
            const assignedSubjects = Array.from(checkedBoxes)
                .filter(cb => !cb.disabled) // Only consider newly checked ones
                .map(cb => cb.value);

            if (assignedSubjects.length === 0) {
                showNotification('কমপক্ষে একটি নতুন বিষয় নির্বাচন করুন', 'error');
                return;
            }

            // Cross-validation: Check if any of the requested subjects are already assigned
            // to ANY teacher for THIS class & session (excluding the current teacher if we want to update, 
            // but actually Firestore docId is uid_class_session so it overrides if same teacher.
            // If different teacher, we block it).
            const allAssignments = await getTeacherAssignments();
            const conflicts = [];

            assignedSubjects.forEach(subj => {
                const existing = allAssignments.find(a =>
                    a.assignedClass === assignedClass &&
                    a.assignedSession === assignedSession &&
                    a.assignedSubjects && a.assignedSubjects.includes(subj) &&
                    a.uid !== teacherData.uid
                );
                if (existing) {
                    conflicts.push(`${subj} বিষয়টিতে ইতিমধ্যে ${existing.displayName || existing.email} কে অ্যাসাইন করা হয়েছে।`);
                }
            });

            if (conflicts.length > 0) {
                showNotification(conflicts.join('\n'), 'error');
                return;
            }

            const success = await assignTeacher({
                ...teacherData,
                assignedClass,
                assignedSession,
                assignedSubjects
            });

            if (success) {
                await loadTeacherAssignmentData(); // Refresh page state
            }
        });
    }
}

/**
 * Load the Teacher Assignment Page Data
 */
export async function loadTeacherAssignmentData() {
    try {
        console.log("Loading Teacher Assignment Data...");

        // Wait briefly for the page router to unhide the page and render the DOM
        await new Promise(resolve => setTimeout(resolve, 150));

        const teacherSelect = document.getElementById('taTeacherSelect');
        const checklist = document.getElementById('taSubjectChecklist');
        const classSelect = document.getElementById('taClassSelect');

        if (!teacherSelect || !checklist || !classSelect) {
            console.error("DOM Error: One or more Teacher assignment DOM elements not found.", { teacherSelect, checklist, classSelect });
            return;
        }

        console.log("Fetching users for dropdown...");
        const users = await getAllUsers();
        console.log("Users fetched:", users.length, users);
        teacherSelect.innerHTML = '<option value="">টিচার নির্বাচন করুন</option><option value="new">+ নতুন টিচার যোগ করুন</option>';
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
                label.innerHTML = `<input type="checkbox" value="${subj}"> ${subj}`;
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
                    cb.parentElement.style.opacity = '1';
                });
                return;
            }

            const allAssignments = await getTeacherAssignments();

            document.querySelectorAll('#taSubjectChecklist input[type="checkbox"]').forEach(cb => {
                const subj = cb.value;
                let isAssignedToThisTeacher = false;
                let isAssignedToOtherTeacher = false;

                // Find if this subject is assigned in the given class & session
                allAssignments.forEach(a => {
                    if (a.assignedClass === selectedClass && a.assignedSession === selectedSession && a.assignedSubjects && a.assignedSubjects.includes(subj)) {
                        if (a.uid === selectedTeacher) {
                            isAssignedToThisTeacher = true;
                        } else {
                            isAssignedToOtherTeacher = true;
                        }
                    }
                });

                cb.checked = isAssignedToThisTeacher || isAssignedToOtherTeacher;
                cb.disabled = isAssignedToOtherTeacher; // Disabled if assigned to someone else

                if (isAssignedToOtherTeacher) {
                    cb.parentElement.style.opacity = '0.5';
                    cb.title = "এই বিষয়টি অন্য একজন শিক্ষককে অ্যাসাইন করা হয়েছে";
                } else {
                    cb.parentElement.style.opacity = '1';
                    cb.title = "";
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

            const confirmMsg = newState
                ? "সকল ইউজারের লগইন পারমিশন এনাবল করতে চান?"
                : "⚠️ সকল ইউজারের লগইন সম্পূর্ণ বন্ধ করতে চান?";

            showConfirmModal(
                confirmMsg,
                async () => {
                    const success = await setLoginPermission(newState);
                    if (success) {
                        updateToggleUI(newState, label, track, thumb);
                        showNotification(newState ? "লগইন এনাবল করা হয়েছে ✅" : "লগইন ডিসেবল করা হয়েছে ⛔");
                    } else {
                        toggle.checked = !newState;
                        showNotification("সেটিংস আপডেট করতে সমস্যা হয়েছে", "error");
                    }
                },
                "গ্লোবাল লগইন কন্ট্রোল",
                newState ? "সব টিচার লগইন করতে পারবেন।" : "সুপার অ্যাডমিন ছাড়া কেউ লগইন করতে পারবে না!"
            );

            track.onclick = () => {
                toggle.checked = !toggle.checked;
                toggle.dispatchEvent(new Event("change"));
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

    // Update teacher count badge
    const countBadge = document.getElementById('taTeacherCount');
    if (countBadge) {
        const uniqueTeachers = [...new Set(assignments.map(a => a.uid))].length;
        countBadge.textContent = uniqueTeachers + ' জন';
    }

    if (assignments.length === 0) {
        listEl.innerHTML = '<p style="opacity: 0.5;">কোনো অ্যাসাইনমেন্ট নেই</p>';
        return;
    }

    listEl.innerHTML = assignments.map((a, idx) => {
        const userDoc = allUsers.find(u => u.uid === a.uid);
        let passwordHtml = '';
        if (userDoc && userDoc.tempPassword && state.isSuperAdmin) {
            passwordHtml = `
                <div style="margin-top: 8px; padding: 6px 10px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef; display: inline-flex; align-items: center; gap: 10px; font-size: 0.85em;">
                    <span style="color: #6c757d;">পাসওয়ার্ড:</span>
                    <strong style="font-family: monospace; letter-spacing: 0.5px;">${userDoc.tempPassword}</strong>
                    <button type="button" class="ta-copy-btn" data-pass="${userDoc.tempPassword}" style="background: none; border: none; color: var(--primary); cursor: pointer; padding: 2px 5px;" title="পাসওয়ার্ড কপি করুন">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button type="button" class="ta-edit-pass-btn" data-uid="${a.uid}" data-email="${a.email}" data-old="${userDoc.tempPassword}" style="background: none; border: none; color: #ff9800; cursor: pointer; padding: 2px 5px;" title="পাসওয়ার্ড পরিবর্তন করুন">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            `;
        }

        // Subject edit checkboxes (hidden by default)
        const subjectCheckboxes = allSubjects.map(s => {
            const isChecked = (a.assignedSubjects || []).includes(s) ? 'checked' : '';
            return `<label style="display: inline-flex; align-items: center; gap: 4px; margin: 3px 6px 3px 0; font-size: 0.85em; cursor: pointer;">
                <input type="checkbox" value="${s}" ${isChecked} class="ta-card-subj-cb"> ${s}
            </label>`;
        }).join('');

        return `
            <div class="ta-assignment-card" data-card-idx="${idx}" data-doc-id="${a.docId}">
                <div class="ta-info" style="flex: 1;">
                    <span class="ta-name">${a.displayName || 'No Name'} (${a.email})</span>
                    <span class="ta-detail">${a.assignedClass} | ${a.assignedSession}</span>
                    <div class="ta-subjects" id="ta-subj-display-${idx}">
                        ${(a.assignedSubjects || []).map(s =>
            `<span class="ta-subject-tag">${s}</span>`
        ).join('')}
                    </div>
                    <div class="ta-subjects-edit" id="ta-subj-edit-${idx}" style="display: none; margin-top: 8px; padding: 10px; background: #f0f4ff; border-radius: 8px; border: 1px dashed #90caf9;">
                        <div style="display: flex; flex-wrap: wrap; gap: 2px;">${subjectCheckboxes}</div>
                        <div style="margin-top: 10px; display: flex; gap: 8px;">
                            <button type="button" class="ta-save-subj-btn dm-btn dm-save" data-idx="${idx}" data-doc-id="${a.docId}" data-uid="${a.uid}" data-email="${a.email || ''}" data-name="${a.displayName || ''}" data-class="${a.assignedClass}" data-session="${a.assignedSession}" style="padding: 4px 14px; font-size: 0.85em;">
                                <i class="fas fa-check"></i> আপডেট
                            </button>
                            <button type="button" class="ta-cancel-subj-btn" data-idx="${idx}" style="padding: 4px 14px; font-size: 0.85em; background: #eee; border: none; border-radius: 6px; cursor: pointer;">
                                বাতিল
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

    // Edit Password handlers
    listEl.querySelectorAll('.ta-edit-pass-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const newPass = prompt('নতুন পাসওয়ার্ড প্রদান করুন:');
            if (!newPass || newPass.trim() === '') return;

            const uid = btn.dataset.uid;
            const email = btn.dataset.email;
            const oldPass = btn.dataset.old;

            if (newPass.length < 6) {
                showNotification('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে', 'error');
                return;
            }

            if (confirm('আপনি কি নিশ্চিত যে এই শিক্ষকের পাসওয়ার্ড পরিবর্তন করতে চান?')) {
                setLoading(true, '#teacherAssignmentPage .ta-list-column');
                const result = await updateTeacherPassword(uid, email, oldPass, newPass.trim());
                setLoading(false, '#teacherAssignmentPage .ta-list-column');

                if (result.success) {
                    showNotification('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!');
                    await renderExistingAssignments();
                } else {
                    showNotification('পাসওয়ার্ড পরিবর্তন করতে সমস্যা হয়েছে', 'error');
                }
            }
        });
    });

    // Edit Subjects toggle handlers
    listEl.querySelectorAll('.ta-edit-subj-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.dataset.idx;
            const display = document.getElementById(`ta-subj-display-${idx}`);
            const edit = document.getElementById(`ta-subj-edit-${idx}`);
            if (display) display.style.display = 'none';
            if (edit) edit.style.display = 'block';
        });
    });

    // Cancel Subject Edit handlers
    listEl.querySelectorAll('.ta-cancel-subj-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.dataset.idx;
            const display = document.getElementById(`ta-subj-display-${idx}`);
            const edit = document.getElementById(`ta-subj-edit-${idx}`);
            if (display) display.style.display = 'flex';
            if (edit) edit.style.display = 'none';
        });
    });

    // Per-teacher login toggle handlers
    listEl.querySelectorAll('.ta-user-login-cb').forEach(cb => {
        const track = cb.closest('.ta-user-login-toggle').querySelector('.ta-utoggle-track');
        const thumb = track.querySelector('.ta-utoggle-thumb');
        const label = cb.closest('.ta-user-login-toggle').querySelector('.ta-ulogin-label');

        // Make track clickable
        track.addEventListener('click', (e) => {
            e.preventDefault();
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
        });

        cb.addEventListener('change', async () => {
            const uid = cb.dataset.uid;
            const name = cb.dataset.name;
            const loginEnabled = cb.checked;
            const disableLogin = !loginEnabled;

            const confirmMsg = disableLogin
                ? `${name} এর লগইন বন্ধ করতে চান?`
                : `${name} এর লগইন চালু করতে চান?`;

            showConfirmModal(
                confirmMsg,
                async () => {
                    const success = await setUserLoginDisabled(uid, disableLogin);
                    if (success) {
                        // Update UI
                        if (loginEnabled) {
                            track.style.background = '#4caf50';
                            thumb.style.left = '18px';
                            label.textContent = 'চালু';
                            label.style.color = '#4caf50';
                        } else {
                            track.style.background = '#d32f2f';
                            thumb.style.left = '2px';
                            label.textContent = 'বন্ধ';
                            label.style.color = '#d32f2f';
                        }
                        showNotification(loginEnabled ? `${name} এর লগইন চালু করা হয়েছে ✅` : `${name} এর লগইন বন্ধ করা হয়েছে ⛔`);
                    } else {
                        cb.checked = !cb.checked;
                        showNotification('সেটিংস পরিবর্তন করতে সমস্যা হয়েছে', 'error');
                    }
                },
                name,
                loginEnabled ? "টিচার এখন লগইন করতে পারবেন।" : "টিচার আর লগইন করতে পারবেন না।"
            );
        });
    });

    // Search filter for assignment list
    const searchInput = document.getElementById('taAssignSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            const cards = listEl.querySelectorAll('.ta-assignment-card');
            let visibleCount = 0;
            cards.forEach(card => {
                const name = (card.querySelector('.ta-name')?.textContent || '').toLowerCase();
                const detail = (card.querySelector('.ta-detail')?.textContent || '').toLowerCase();
                card.style.display = matches ? '' : 'none';
                if (matches) visibleCount++;
            });
        });
    }

    // Save updated Subjects handlers
    listEl.querySelectorAll('.ta-save-subj-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = btn.dataset.idx;
            const docId = btn.dataset.docId;
            const editSection = document.getElementById(`ta-subj-edit-${idx}`);
            const checkedBoxes = editSection.querySelectorAll('.ta-card-subj-cb:checked');
            const newSubjects = Array.from(checkedBoxes).map(cb => cb.value);

            if (newSubjects.length === 0) {
                showNotification('কমপক্ষে একটি বিষয় নির্বাচন করুন', 'error');
                return;
            }

            try {
                const docRef = doc(db, COLLECTION_NAME, docId);
                await setDoc(docRef, {
                    assignedSubjects: newSubjects,
                    updatedAt: serverTimestamp()
                }, { merge: true });

                showNotification('বিষয় সফলভাবে আপডেট করা হয়েছে! ✅');
                await renderExistingAssignments();
            } catch (error) {
                console.error('বিষয় আপডেট করতে সমস্যা:', error);
                showNotification('বিষয় আপডেট করতে সমস্যা হয়েছে', 'error');
            }
        });
    });
}
