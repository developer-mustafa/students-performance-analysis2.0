/**
 * Student Manager Module
 * Handles the Student Management page: listing, searching, adding, editing, deleting students
 * @module studentManager
 */

import { getSavedExams, generateStudentDocId, deleteStudent, deleteFilteredStudents } from '../firestoreService.js';
import { state } from './state.js';
import { showNotification, convertToEnglishDigits, normalizeText } from '../utils.js';
import { showConfirmModal } from './uiManager.js';

let allStudentsFromExams = [];
let filteredStudents = [];
let currentPage = 1;
const PER_PAGE = 20;

/**
 * Collect unique students from all saved exams
 * @returns {Array} Unique student list
 */
async function collectStudents() {
    const { getAllStudents, getSavedExams } = await import('../firestoreService.js');

    // 1. Get explicit students from 'students' collection
    const explicitStudents = await getAllStudents();
    const studentMap = new Map();

    explicitStudents.forEach(s => {
        const key = generateStudentDocId(s);

        studentMap.set(key, {
            docId: s.docId,
            id: s.id,
            name: s.name,
            group: s.group || '',
            class: s.class || '',
            session: s.session || '',
            _examDocIds: []
        });
    });

    // 2. Enrich students with records from all saved exams
    const exams = await getSavedExams();
    exams.forEach(exam => {
        if (exam.studentData && Array.isArray(exam.studentData)) {
            exam.studentData.forEach(s => {
                const studentDataForId = {
                    id: s.id,
                    group: s.group,
                    class: exam.class || s.class,
                    session: exam.session || s.session
                };
                const key = generateStudentDocId(studentDataForId);

                if (studentMap.has(key)) {
                    // Update existing record if it came from the buffer (buffer records usually have more fields or are primary)
                    const existing = studentMap.get(key);
                    if (!existing._examDocIds.includes(exam.docId)) {
                        existing._examDocIds.push(exam.docId);
                    }
                } else {
                    // Add new student discovered from an exam record
                    studentMap.set(key, {
                        ...studentDataForId,
                        name: s.name,
                        _examDocIds: [exam.docId],
                        _isFromExamOnly: true // Flag to indicate this student isn't in the main buffer
                    });
                }
            });
        }
    });

    return Array.from(studentMap.values()).sort((a, b) => {
        const idA = parseInt(convertToEnglishDigits(String(a.id))) || 0;
        const idB = parseInt(convertToEnglishDigits(String(b.id))) || 0;
        return idA - idB;
    });
}

/**
 * Populate filter dropdowns from available data
 */
function populateFilters() {
    const classSet = new Set();
    const sessionSet = new Set();

    allStudentsFromExams.forEach(s => {
        if (s.class) classSet.add(s.class);
        if (s.session) sessionSet.add(s.session);
    });

    const classSelect = document.getElementById('studentFilterClass');
    const sessionSelect = document.getElementById('studentFilterSession');

    if (classSelect) {
        const currentVal = classSelect.value;
        classSelect.innerHTML = '<option value="all">সব ক্লাস</option>';
        [...classSet].sort().forEach(cls => {
            classSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        });
        classSelect.value = currentVal || 'all';
    }

    if (sessionSelect) {
        const currentVal = sessionSelect.value;
        sessionSelect.innerHTML = '<option value="all">সব সেশন</option>';
        [...sessionSet].sort().reverse().forEach(sess => {
            sessionSelect.innerHTML += `<option value="${sess}">${sess}</option>`;
        });
        sessionSelect.value = currentVal || 'all';
    }
}

/**
 * Apply filters and search
 */
function applyFilters() {
    const classFilter = document.getElementById('studentFilterClass')?.value || 'all';
    const sessionFilter = document.getElementById('studentFilterSession')?.value || 'all';
    const groupFilter = document.getElementById('studentFilterGroup')?.value || 'all';
    const searchTerm = (document.getElementById('studentSearchInput')?.value || '').trim().toLowerCase();

    filteredStudents = allStudentsFromExams.filter(s => {
        if (classFilter !== 'all' && s.class !== classFilter) return false;
        if (sessionFilter !== 'all' && s.session !== sessionFilter) return false;
        if (groupFilter !== 'all' && s.group !== groupFilter) return false;
        if (searchTerm) {
            const normalizedSearch = convertToEnglishDigits(searchTerm);
            const isNumeric = /^\d+$/.test(normalizedSearch);

            if (isNumeric) {
                // Exact match for Roll
                const studentIdNorm = convertToEnglishDigits(String(s.id));
                if (studentIdNorm !== normalizedSearch) return false;
            } else {
                // Partial match for Name
                const nameMatch = s.name && s.name.toLowerCase().includes(searchTerm);
                if (!nameMatch) return false;
            }
        }
        return true;
    });

    currentPage = 1;
    renderStudentTable();
}

/**
 * Render the student table with pagination
 */
function renderStudentTable() {
    const tbody = document.getElementById('studentTableBody');
    const countEl = document.getElementById('studentListCount');
    const paginationEl = document.getElementById('studentPagination');
    if (!tbody) return;

    const totalPages = Math.ceil(filteredStudents.length / PER_PAGE);
    const start = (currentPage - 1) * PER_PAGE;
    const pageStudents = filteredStudents.slice(start, start + PER_PAGE);

    // Count
    if (countEl) {
        countEl.textContent = `মোট ${filteredStudents.length} জন শিক্ষার্থী`;
    }

    if (pageStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">কোনো শিক্ষার্থী পাওয়া যায়নি</td></tr>';
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }

    tbody.innerHTML = pageStudents.map((s, i) => `
        <tr>
            <td>${start + i + 1}</td>
            <td><strong>${s.id}</strong></td>
            <td>${s.name}</td>
            <td><span class="badge">${s.group || '-'}</span></td>
            <td>${s.class || '-'}</td>
            <td>${s.session || '-'}</td>
            <td class="admin-only">
                <div class="action-btn-group">
                    <button class="action-btn edit-student-btn" data-index="${start + i}" title="এডিট">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-student-btn" data-index="${start + i}" title="মুছুন">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    // Edit handlers
    tbody.querySelectorAll('.edit-student-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            const student = filteredStudents[idx];
            if (student) {
                openEditStudentModal(student);
            }
        });
    });

    // Delete individual student
    tbody.querySelectorAll('.delete-student-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            const student = filteredStudents[idx];
            if (!student || !student.docId) {
                showNotification('এই শিক্ষার্থীর কোনো প্রোফাইল নেই। এটি শুধুমাত্র এক্সাম রেকর্ড থেকে পাওয়া তথ্য।', 'warning');
                return;
            }

            showConfirmModal(`আপনি কি নিশ্চিত যে আপনি "${student.name}" কে মুছতে চান? এটি স্থায়ীভাবে ডিলিট হয়ে যাবে।`, async () => {
                const success = await deleteStudent(student.docId);
                if (success) {
                    showNotification('শিক্ষার্থী সফলভাবে মোছা হয়েছে');
                    await loadStudents();
                } else {
                    showNotification('মুছতে সমস্যা হয়েছে', 'error');
                }
            });
        });
    });

    // Pagination
    if (paginationEl && totalPages > 1) {
        paginationEl.innerHTML = renderPagination(currentPage, totalPages);
        paginationEl.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                if (page && page !== currentPage) {
                    currentPage = page;
                    renderStudentTable();
                }
            });
        });
    } else if (paginationEl) {
        paginationEl.innerHTML = '';
    }
}

/**
 * Simple pagination renderer
 */
function renderPagination(current, total) {
    let html = '';
    if (current > 1) {
        html += `<button class="pagination-btn" data-page="${current - 1}"><i class="fas fa-chevron-left"></i></button>`;
    }
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || Math.abs(i - current) <= 2) {
            html += `<button class="pagination-btn ${i === current ? 'active' : ''}" data-page="${i}">${i}</button>`;
        } else if (Math.abs(i - current) === 3) {
            html += `<span class="pagination-dots">...</span>`;
        }
    }
    if (current < total) {
        html += `<button class="pagination-btn" data-page="${current + 1}"><i class="fas fa-chevron-right"></i></button>`;
    }
    return html;
}

/**
 * Open Add Student Modal
 */
export function openAddStudentModal() {
    const modal = document.getElementById('addStudentModal');
    const title = document.getElementById('addStudentModalTitle');
    const form = document.getElementById('addStudentForm');
    if (!modal) return;

    if (title) title.innerHTML = '<i class="fas fa-user-plus"></i> নতুন শিক্ষার্থী যোগ করুন';
    if (form) form.reset();
    document.getElementById('editStudentDocId').value = '';

    modal.classList.add('active');
}

/**
 * Open Edit Student Modal
 */
function openEditStudentModal(student) {
    const modal = document.getElementById('addStudentModal');
    const title = document.getElementById('addStudentModalTitle');
    if (!modal) return;

    if (title) title.innerHTML = '<i class="fas fa-user-edit"></i> শিক্ষার্থী সম্পাদনা';
    document.getElementById('studentFormName').value = student.name || '';
    document.getElementById('studentFormRoll').value = student.id || '';
    // Case-insensitive class matching (e.g. "hsc" should match option "HSC")
    const classSelect = document.getElementById('studentFormClass');
    const classVal = (student.class || '').trim();
    const matchedOption = Array.from(classSelect.options).find(
        opt => opt.value.toLowerCase() === classVal.toLowerCase()
    );
    classSelect.value = matchedOption ? matchedOption.value : classVal;
    document.getElementById('studentFormGroup').value = student.group || '';
    document.getElementById('studentFormSession').value = student.session || '';
    document.getElementById('editStudentDocId').value = student.docId || '';

    modal.classList.add('active');
}

/**
 * Initialize Student Manager
 */
export async function initStudentManager() {
    // Filter change handlers
    ['studentFilterClass', 'studentFilterSession', 'studentFilterGroup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyFilters);
    });

    // Search handler
    const searchInput = document.getElementById('studentSearchInput');
    if (searchInput) {
        let debounce;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(applyFilters, 300);
        });
    }

    // Add student button
    const addBtn = document.getElementById('addStudentBtn');
    if (addBtn) {
        addBtn.addEventListener('click', openAddStudentModal);
    }

    // Bulk Delete Action
    const bulkDeleteBtn = document.getElementById('bulkDeleteStudentsBtn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', async () => {
            const classVal = document.getElementById('studentFilterClass').value;
            const sessionVal = document.getElementById('studentFilterSession').value;

            if (classVal === 'all' && sessionVal === 'all') {
                showNotification('বাল্ক ডিলিট করতে একটি নির্দিষ্ট ক্লাস বা সেশন সিলেক্ট করুন।', 'warning');
                return;
            }

            const targetLabel = `${classVal !== 'all' ? classVal : ''} ${sessionVal !== 'all' ? sessionVal : ''}`.trim();

            showConfirmModal(`আপনি কি ${targetLabel} এর সকল শিক্ষার্থী তথ্য মুছতে চান? এটি স্থায়ীভাবে ডিলিট হয়ে যাবে।`, async () => {
                const { deleteFilteredStudents } = await import('../firestoreService.js');
                const success = await deleteFilteredStudents(classVal, sessionVal);
                if (success) {
                    showNotification('বাল্ক ডিলিট সফল হয়েছে');
                    await loadStudents();
                } else {
                    showNotification('বাল্ক ডিলিট করতে সমস্যা হয়েছে', 'error');
                }
            });
        });
    }

    // Close modal
    const closeBtn = document.getElementById('closeAddStudentModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('addStudentModal').classList.remove('active');
        });
    }

    // Form submit
    const form = document.getElementById('addStudentForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('studentFormName').value.trim();
            const rollRaw = document.getElementById('studentFormRoll').value.trim();
            const roll = convertToEnglishDigits(rollRaw); // Normalize to English digits
            const cls = document.getElementById('studentFormClass').value;
            const group = document.getElementById('studentFormGroup').value;
            const session = document.getElementById('studentFormSession').value; // Now a Select
            const existingDocId = document.getElementById('editStudentDocId').value;

            if (!name || !roll) {
                showNotification('নাম ও রোল আবশ্যক', 'error');
                return;
            }

            const { addStudent, updateStudent } = await import('../firestoreService.js');
            let success = false;

            if (existingDocId) {
                // Update mode
                success = await updateStudent(existingDocId, {
                    id: roll,
                    name,
                    class: cls,
                    group,
                    session
                });
            } else {
                // Add mode
                const newDocId = await addStudent({
                    id: roll,
                    name,
                    class: cls,
                    group,
                    session
                });
                success = !!newDocId;
            }

            if (success) {
                showNotification(existingDocId ? 'শিক্ষার্থীর তথ্য আপডেট করা হয়েছে! ✅' : 'শিক্ষার্থী সফলভাবে যোগ করা হয়েছে! ✅');
                document.getElementById('addStudentModal').classList.remove('active');
                await loadStudents();
            } else {
                showNotification(existingDocId ? 'আপডেট করতে সমস্যা হয়েছে' : 'শিক্ষার্থী যোগ করতে সমস্যা হয়েছে', 'error');
            }
        });
    }
}

/**
 * Load and display students on the page
 */
export async function loadStudents() {
    allStudentsFromExams = await collectStudents();
    populateFilters();
    applyFilters();
}
