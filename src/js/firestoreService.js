/**
 * Firestore Service Module
 * Handles all Firestore database operations for the student performance dashboard
 * @module firestoreService
 */

import { db, auth, firebaseConfig } from './firebase.js';
import { convertToEnglishDigits, normalizeText } from './utils.js';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    onSnapshot,
    query,
    where,
    orderBy,
    serverTimestamp,
    limit,
    deleteField
} from 'firebase/firestore';

// Collection names
export const COLLECTIONS = {
    students: 'students',
    exams: 'exams',
    analytics: 'analytics',

    settings: 'settings',
    users: 'users',
    access_requests: 'access_requests',
    teacher_assignments: 'teacher_assignments',
    examConfigs: 'examConfigs',
    academicStructure: 'academicStructure',
    accessControl: 'accessControl'
};

// Memory cache for expensive read operations
const _cache = {
    exams: null,
    examsExpiry: 0,
    accessRequests: null,
    accessRequestsExpiry: 0,
    CACHE_DURATION: 10 * 60 * 1000 // 10 minutes cache
};

// ==========================================
// STUDENTS COLLECTION OPERATIONS
// ==========================================

/**
 * Get all students from Firestore
 * @returns {Promise<Array>} - Array of student documents
 */
export async function getAllStudents() {
    try {
        const studentsRef = collection(db, COLLECTIONS.students);
        const q = query(studentsRef, orderBy('id', 'asc'));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({
            docId: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('শিক্ষার্থীদের ডেটা লোড করতে সমস্যা:', error);
        return [];
    }
}

/**
 * Get unified list of students from both 'students' collection and existing exams
 * @returns {Promise<Array>} Unified student list
 */
export async function getUnifiedStudents() {
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

    // 2. Discover students from all saved exams
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
                    const existing = studentMap.get(key);
                    if (exam.docId && !existing._examDocIds.includes(exam.docId)) {
                        existing._examDocIds.push(exam.docId);
                    }
                } else {
                    studentMap.set(key, {
                        ...studentDataForId,
                        name: s.name,
                        _examDocIds: exam.docId ? [exam.docId] : [],
                        _isFromExamOnly: true
                    });
                }
            });
        }
    });

    return Array.from(studentMap.values());
}

/**
 * Get a single student by document ID
 * @param {string} docId - Firestore document ID
 * @returns {Promise<Object|null>} - Student data or null
 */
export async function getStudent(docId) {
    try {
        const docRef = doc(db, COLLECTIONS.students, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { docId: docSnap.id, ...docSnap.data() };
        }
        return null;
    } catch (error) {
        console.error('শিক্ষার্থীর ডেটা লোড করতে সমস্যা:', error);
        return null;
    }
}

/**
 * Generate a consistent, unique, and searchable student document ID
 * Preserves Bengali characters while removing symbols/spaces
 * @param {Object} student - Student data {id, group, class, session}
 * @returns {string} - Generated ID
 */
export function generateStudentDocId(student) {
    const sId = convertToEnglishDigits(String(student.id || '').trim());
    const sGrp = normalizeText(student.group || '');
    const sCls = normalizeText(student.class || '');
    const sSess = convertToEnglishDigits(String(student.session || '').trim());

    // Remove only special characters, preserve alphanumeric and Bengali Unicode range
    const clean = (str) => str.replace(/[^\w\d\u0980-\u09FF]/g, '_');

    return `STUDENT_${clean(sId)}_${clean(sGrp)}_${clean(sCls)}_${clean(sSess)}`.toUpperCase();
}

/**
 * Add a new student
 * @param {Object} studentData - Student data object
 * @returns {Promise<string|null>} - New document ID or null
 */
export async function addStudent(studentData) {
    try {
        const docId = generateStudentDocId(studentData);

        const docRef = doc(db, COLLECTIONS.students, docId);
        await setDoc(docRef, {
            ...studentData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            docId: docId // Store ID in document too
        });
        return docId;
    } catch (error) {
        console.error('শিক্ষার্থী যোগ করতে সমস্যা:', error);
        return null;
    }
}

/**
 * Update a student
 * @param {string} docId - Document ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>} - Success status
 */
export async function updateStudent(docId, updates) {
    try {
        const docRef = doc(db, COLLECTIONS.students, docId);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp(),
        });
        return true;
    } catch (error) {
        console.error('শিক্ষার্থীর ডেটা আপডেট করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Delete a student
 * @param {string} docId - Document ID
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteStudent(docId) {
    try {
        const docRef = doc(db, COLLECTIONS.students, docId);
        await deleteDoc(docRef);
        return true;
    } catch (error) {
        console.error('শিক্ষার্থী মুছতে সমস্যা:', error);
        return false;
    }
}

/**
 * Bulk import students (replaces all existing data)
 * Uses chunked batches to handle Firestore's 500 operation limit per batch
 * @param {Array} studentsArray - Array of student objects
 * @returns {Promise<boolean>} - Success status
 */
export async function bulkImportStudents(studentsArray) {
    const BATCH_SIZE = 400; // Firestore batch limit is 500

    try {
        console.log(`Starting bulk import of ${studentsArray.length} students...`);

        // Add/Update students in batches (Upsert Strategy)
        for (let i = 0; i < studentsArray.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = studentsArray.slice(i, i + BATCH_SIZE);

            for (const student of chunk) {
                const docId = generateStudentDocId(student);

                const newDocRef = doc(db, COLLECTIONS.students, docId);
                batch.set(newDocRef, {
                    ...student,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    docId: docId
                });
            }

            await batch.commit();
            console.log(`Added batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, studentsArray.length)}/${studentsArray.length})`);
        }

        console.log('Bulk import completed successfully!');
        return true;
    } catch (error) {
        console.error('বাল্ক ইম্পোর্ট করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Delete all students
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteAllStudents() {
    const BATCH_SIZE = 400;
    try {
        const students = await getAllStudents();
        if (students.length === 0) return true;

        console.log(`Deleting ${students.length} students in batches...`);

        for (let i = 0; i < students.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = students.slice(i, i + BATCH_SIZE);

            for (const student of chunk) {
                const docRef = doc(db, COLLECTIONS.students, student.docId);
                batch.delete(docRef);
            }

            await batch.commit();
            console.log(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        }

        return true;
    } catch (error) {
        console.error('সব শিক্ষার্থী মুছতে সমস্যা:', error);
        return false;
    }
}

/**
 * Delete filtered students (Bulk Delete)
 * @param {string} classVal - Class name
 * @param {string} sessionVal - Session name
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteFilteredStudents(classVal, sessionVal) {
    try {
        const students = await getAllStudents();
        const batch = writeBatch(db);
        let count = 0;

        const normClass = classVal === 'all' ? 'all' : normalizeText(classVal);
        const normSession = sessionVal === 'all' ? 'all' : convertToEnglishDigits(String(sessionVal || '').trim());

        students.forEach(student => {
            const sCls = normalizeText(student.class || '');
            const sSess = convertToEnglishDigits(String(student.session || '').trim());

            const classMatch = (normClass === 'all' || sCls === normClass);
            const sessionMatch = (normSession === 'all' || sSess === normSession);

            if (classMatch && sessionMatch) {
                const docRef = doc(db, COLLECTIONS.students, student.docId);
                batch.delete(docRef);
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
        }
        return true;
    } catch (error) {
        console.error('ফিল্টার করা শিক্ষার্থী মুছতে সমস্যা:', error);
        return false;
    }
}

/**
 * Subscribe to real-time student updates
 * @param {Function} callback - Callback function receiving updated data
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToStudents(callback) {
    const studentsRef = collection(db, COLLECTIONS.students);
    const q = query(studentsRef, orderBy('id', 'asc'));

    return onSnapshot(q, (snapshot) => {
        const students = snapshot.docs.map(doc => ({
            docId: doc.id,
            ...doc.data()
        }));
        callback(students);
    }, (error) => {
        console.error('রিয়েল-টাইম সিঙ্ক সমস্যা:', error);
    });
}

// ==========================================
// EXAMS COLLECTION OPERATIONS
// ==========================================

/**
 * Get all exams
 * @returns {Promise<Array>} - Array of exam documents
 */
export async function getAllExams() {
    try {
        const examsRef = collection(db, COLLECTIONS.exams);
        const snapshot = await getDocs(examsRef);

        return snapshot.docs.map(doc => ({
            docId: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('পরীক্ষার ডেটা লোড করতে সমস্যা:', error);
        return [];
    }
}

/**
 * Save current analysis as an exam record
 * @param {Object} examData - Exam data including name, subject, date, students, stats
 * @returns {Promise<boolean>} - Success status
 */
export async function saveExam(examData) {
    try {
        // Create a unique ID based on exam name and subject
        // Sanitize to be safe for Firestore ID (replace non-alphanumeric with _)
        const safeName = (examData.name || 'exam').trim().replace(/[\/\s\.]/g, '_');
        const safeSubject = (examData.subject || 'subject').trim().replace(/[\/\s\.]/g, '_');
        const docId = `${safeName}_${safeSubject}`;
        const docRef = doc(db, COLLECTIONS.exams, docId);
        await setDoc(docRef, {
            ...examData,
            createdAt: serverTimestamp(),
            // Store the ID explicitly too
            id: docId,
            // Creator Metadata (if available in examData, otherwise null)
            createdBy: examData.createdBy || null,
            creatorName: examData.creatorName || null
        });

        console.log('Exam saved with ID:', docId);
        // Invalidate both memory and persistent caches
        _cache.exams = null;
        localStorage.removeItem('ems_cache_persistent');
        return true;
    } catch (error) {
        console.error('পরীক্ষা সেভ করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Get all saved exams (with memory and persistent caching to optimize reads)
 * @returns {Promise<Array>} - Array of exam documents ordered by date
 */
export async function getSavedExams() {
    const now = Date.now();
    const CACHE_KEY = 'ems_cache_persistent';
    const PERSISTENT_DURATION = 30 * 60 * 1000; // 30 minutes

    // 1. Try Memory Cache (Fastest)
    if (_cache.exams && now < _cache.examsExpiry) {
        console.log('Returning memory-cached exams (Ultra Fast)');
        return _cache.exams;
    }

    // 2. Try LocalStorage Cache (Persistence across refreshes)
    try {
        const localData = localStorage.getItem(CACHE_KEY);
        if (localData) {
            const parsed = JSON.parse(localData);
            if (now - parsed.timestamp < PERSISTENT_DURATION) {
                console.log('Returning persistent-cached exams (Disk Cache)');
                _cache.exams = parsed.data;
                _cache.examsExpiry = now + _cache.CACHE_DURATION;
                return parsed.data;
            }
        }
    } catch (e) {
        console.warn('LocalStorage cache read failed:', e);
    }

    // 3. Fetch from Firestore (Fallback)
    try {
        console.log('Fetching fresh exams from Firestore (Cache expired or empty)');
        const examsRef = collection(db, COLLECTIONS.exams);
        const q = query(examsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        const exams = snapshot.docs.map(doc => ({
            docId: doc.id,
            ...doc.data()
        }));

        // Update Memory Cache
        _cache.exams = exams;
        _cache.examsExpiry = now + _cache.CACHE_DURATION;

        // Update LocalStorage Cache
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                data: exams,
                timestamp: now
            }));
        } catch (e) {
            console.warn('LocalStorage cache write failed:', e);
        }

        return exams;
    } catch (error) {
        console.error('পরীক্ষার তালিকা লোড করতে সমস্যা:', error);
        return [];
    }
}

/**
 * Get exams matching specific criteria (Class, Session)
 * Optimized for Public Search page to reduce read costs
 * @param {string} cls - Class filter
 * @param {string} session - Session filter
 * @returns {Promise<Array>} - Filtered exam documents
 */
export async function getExamsByCriteria(cls, session) {
    if (!cls && !session) return getSavedExams();

    try {
        console.log(`Fetching filtered exams for Class: ${cls}, Session: ${session} (Cost Optimization)`);
        const examsRef = collection(db, COLLECTIONS.exams);
        
        let q = query(examsRef);
        if (cls) q = query(q, where('class', '==', cls));
        if (session) q = query(q, where('session', '==', session));
        q = query(q, orderBy('createdAt', 'desc'));

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            docId: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('ফিল্টার করা পরীক্ষার তালিকা লোড করতে সমস্যা:', error);
        // Fallback to local cache if query fails (e.g. index not yet built)
        return getSavedExams();
    }
}

/**
 * Delete a saved exam
 * @param {string} docId - Document ID
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteExam(docId) {
    try {
        await deleteDoc(doc(db, COLLECTIONS.exams, docId));
        // Invalidate both memory and persistent caches
        _cache.exams = null;
        localStorage.removeItem('ems_cache_persistent');
        return true;
    } catch (error) {
        console.error('পরীক্ষা মুছতে সমস্যা:', error);
        return false;
    }
}

/**
 * Update a saved exam
 * @param {string} docId - Document ID
 * @param {Object} updates - Fields to update (name, subject, etc.)
 * @returns {Promise<boolean>} - Success status
 */
export async function updateExam(docId, updates) {
    try {
        const docRef = doc(db, COLLECTIONS.exams, docId);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp(),
        });
        // Invalidate both memory and persistent caches
        _cache.exams = null;
        localStorage.removeItem('ems_cache_persistent');
        return true;
    } catch (error) {
        console.error('পরীক্ষা আপডেট করতে সমস্যা:', error);
        return false;
    }
}

// ==========================================
// ANALYTICS COLLECTION OPERATIONS
// ==========================================

/**
 * Save analytics data
 * @param {Object} analyticsData - Analytics data object
 * @returns {Promise<boolean>} - Success status
 */
export async function saveAnalytics(analyticsData) {
    try {
        const docRef = doc(db, COLLECTIONS.analytics, 'latest');
        await setDoc(docRef, {
            ...analyticsData,
            lastUpdated: serverTimestamp(),
        });
        return true;
    } catch (error) {
        console.error('বিশ্লেষণ ডেটা সেভ করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Get latest analytics
 * @returns {Promise<Object|null>} - Analytics data or null
 */
export async function getAnalytics() {
    try {
        const docRef = doc(db, COLLECTIONS.analytics, 'latest');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error('বিশ্লেষণ ডেটা লোড করতে সমস্যা:', error);
        return null;
    }
}

// ==========================================
// SETTINGS COLLECTION OPERATIONS
// ==========================================

/**
 * Get app settings
 * @returns {Promise<Object>} - Settings object
 */
export async function getSettings() {
    try {
        const docRef = doc(db, COLLECTIONS.settings, 'config');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data();
        }
        return { theme: 'light', currentExam: null };
    } catch (error) {
        console.error('সেটিংস লোড করতে সমস্যা:', error);
        return { theme: 'light', currentExam: null };
    }
}

/**
 * Update app settings (Alias for saveSettings)
 * @param {Object} settings - Settings to update
 * @returns {Promise<boolean>} - Success status
 */
export async function updateSettings(settings) {
    try {
        const docRef = doc(db, COLLECTIONS.settings, 'config');
        await setDoc(docRef, {
            ...settings,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        return true;
    } catch (error) {
        console.error('সেটিংস আপডেট করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Save settings (Alias for updateSettings used by admitCardManager)
 * @param {Object} settings - Settings to update
 * @returns {Promise<boolean>} - Success status
 */
export async function saveSettings(settings) {
    return updateSettings(settings);
}

/**
 * Subscribe to settings changes
 * @param {Function} callback - Callback for settings updates
 * @returns {Function} - Unsubscribe function
 */
/**
 * Subscribe to settings changes
 * @param {Function} callback - Callback for settings updates
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToSettings(callback) {
    const docRef = doc(db, COLLECTIONS.settings, 'config');

    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data());
        } else {
            callback({ theme: 'light', currentExam: null });
        }
    }, (error) => {
        console.error('সেটিংস সিঙ্ক সমস্যা:', error);
    });
}

/**
 * Get subject configurations
 * @returns {Promise<Object>} - Map of subject configs
 */


/**
 * Get student history across all exams
 * @param {string|number} studentId - Student Roll/ID
 * @param {string} [studentGroup] - Optional student group to filter by
 * @returns {Promise<Array>} - Array of exam results for this student
 */
export async function getStudentHistory(studentId, studentGroup) {
    try {
        const exams = await getSavedExams();
        const history = [];

        exams.forEach(exam => {
            if (exam.studentData && Array.isArray(exam.studentData)) {
                // Find student in this exam
                const student = exam.studentData.find(s => {
                    const idMatch = s.id == studentId;
                    // If group is provided, check it (normalize case/spaces)
                    if (studentGroup && idMatch) {
                        return s.group === studentGroup;
                    }
                    return idMatch;
                });

                if (student) {
                    history.push({
                        examName: exam.name,
                        subject: exam.subject,
                        session: exam.session || 'N/A',
                        class: exam.class || 'N/A',
                        date: exam.createdAt, // Timestamp
                        ...student
                    });
                }
            }
        });

        // Sort by date ascending
        return history.sort((a, b) => {
            const dateA = a.date?.toDate ? a.date.toDate() : new Date(0);
            const dateB = b.date?.toDate ? b.date.toDate() : new Date(0);
            return dateA - dateB;
        });

    } catch (error) {
        console.error('শিক্ষার্থীর ইতিহাস লোড করতে সমস্যা:', error);

        return [];
    }
}



/**
 * Search for students across all exams for analysis
 * @param {string} query - Search query (Name or ID)
 * @returns {Promise<Array>} - Array of unique student candidates {id, name, group, class}
 */
export async function searchAnalyticsCandidates(query, sessionFilter, classFilter) {
    const hasQuery = query && query.trim().length > 0;
    if (!hasQuery && !sessionFilter && !classFilter) return [];

    try {
        const exams = await getSavedExams();
        const candidates = new Map(); // Use Map to dedup by "ID_Group"

        // Normalize filters if provided
        const normSession = sessionFilter ? String(sessionFilter).trim().toLowerCase() : null;
        const normClass = classFilter ? String(classFilter).trim().toLowerCase() : null;

        if (!hasQuery && (normSession || normClass)) {
            // Fetch ALL students matching the provided filters
            exams.forEach(exam => {
                const examSession = exam.session ? String(exam.session).trim().toLowerCase() : '';
                const examClass = exam.class ? String(exam.class).trim().toLowerCase() : '';

                let filterMatch = true;
                if (normSession && examSession !== normSession) filterMatch = false;
                if (normClass && examClass !== normClass) filterMatch = false;

                if (filterMatch && exam.studentData && Array.isArray(exam.studentData)) {
                    exam.studentData.forEach(s => {
                        const uniqueKey = `${s.id}_${s.group}`;
                        if (!candidates.has(uniqueKey)) {
                            candidates.set(uniqueKey, {
                                id: s.id,
                                name: s.name,
                                group: s.group,
                                class: s.class,
                                session: s.session
                            });
                        }
                    });
                }
            });
            return Array.from(candidates.values());
        }

        // Normalize query: Convert Bengali to English digits
        const normalizedQuery = convertToEnglishDigits(query.trim());
        const lowerQuery = query.toLowerCase();

        // Determine if search is by Roll (Numeric) or Name (Text)
        const isRollSearch = /^\d+$/.test(normalizedQuery);

        exams.forEach(exam => {
            if (exam.studentData && Array.isArray(exam.studentData)) {
                exam.studentData.forEach(s => {
                    let match = false;

                    if (isRollSearch) {
                        if (String(s.id) === normalizedQuery) {
                            match = true;
                        }
                    } else {
                        if (s.name && s.name.toLowerCase().includes(lowerQuery)) {
                            match = true;
                        }
                    }

                    // Enforce filters if provided
                    if (match) {
                        if (normSession) {
                            const studentSession = s.session ? String(s.session).trim().toLowerCase() : '';
                            if (studentSession !== normSession) match = false;
                        }
                        if (match && normClass) {
                            const studentClass = s.class ? String(s.class).trim().toLowerCase() : '';
                            if (studentClass !== normClass) match = false;
                        }
                    }

                    if (match) {
                        const uniqueKey = `${s.id}_${s.group}`;
                        if (!candidates.has(uniqueKey)) {
                            candidates.set(uniqueKey, {
                                id: s.id,
                                name: s.name,
                                group: s.group,
                                class: s.class,
                                session: s.session
                            });
                        }
                    }
                });
            }
        });

        return Array.from(candidates.values());
    } catch (error) {
        console.error('শিক্ষার্থী খুঁজতে সমস্যা:', error);
        return [];
    }
}

// ==========================================
// AUTH OPERATIONS
// ==========================================

/**
 * Login admin with Google popup
 * @returns {Promise<Object>} - User object or error
 */
export async function loginWithGoogle() {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const role = await syncUserRole(result.user);
        const userWithRole = { ...result.user, role };
        return { success: true, user: userWithRole };
    } catch (error) {
        console.error('গুগল লগইন ত্রুটি:', error);
        return { success: false, error: error.code };
    }
}

/**
 * Login with Email and Password
 * @param {string} email 
 * @param {string} password 
 */
export async function loginWithEmail(email, password) {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const role = await syncUserRole(result.user);
        const userWithRole = { ...result.user, role };
        return { success: true, user: userWithRole };
    } catch (error) {
        console.error('ইমেইল লগইন ত্রুটি:', error);
        return { success: false, error: error.code };
    }
}

/**
 * Create a new teacher account (Super Admin only)
 * @param {Object} userData - { email, password, name, phone, role }
 */
export async function createTeacherAccount(userData) {
    let secondaryApp;
    try {
        // Initialize a secondary app so we don't log out the admin
        secondaryApp = initializeApp(firebaseConfig, "SecondaryApp_" + Date.now());
        const secondaryAuth = getAuth(secondaryApp);

        // Create user in secondary Auth
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, userData.email, userData.password);
        const user = userCredential.user;

        // Update profile
        await updateProfile(user, { displayName: userData.name });

        // Sign out to absolutely ensure no session lingers
        await signOut(secondaryAuth);

        // Delete the secondary app
        await deleteApp(secondaryApp);

        // Create user doc in Firestore
        const userRef = doc(db, COLLECTIONS.users, user.uid);
        await setDoc(userRef, {
            uid: user.uid,
            email: userData.email,
            displayName: userData.name,
            phone: userData.phone || '',
            role: userData.role || 'teacher',
            tempPassword: userData.password, // Store for admin reference
            createdAt: serverTimestamp(),
            lastLogin: null
        });

        // Add to teacher_assignments if provided (though handled in teacherAssignmentManager)
        return { success: true, uid: user.uid };
    } catch (error) {
        console.error('শিক্ষক অ্যাকাউন্ট তৈরি করতে সমস্যা:', error);
        // Ensure app gets deleted even if error occurs
        if (secondaryApp) {
            try { await deleteApp(secondaryApp); } catch (e) { }
        }
        return { success: false, error: error.code };
    }
}
/**
 * Update a teacher's password (Super Admin only)
 * @param {string} uid - User ID
 * @param {string} email - User Email
 * @param {string} currentPassword - Current Password stored in Firestore
 * @param {string} newPassword - New Password
 */
export async function updateTeacherPassword(uid, email, currentPassword, newPassword) {
    let secondaryApp;
    try {
        secondaryApp = initializeApp(firebaseConfig, "SecondaryApp_" + Date.now());
        const secondaryAuth = getAuth(secondaryApp);

        // Sign in as the user in the secondary app
        const userCredential = await signInWithEmailAndPassword(secondaryAuth, email, currentPassword);

        // Use the proper auth updatePassword method
        const { updatePassword } = await import('firebase/auth');
        await updatePassword(userCredential.user, newPassword);

        // Sign out and cleanup
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);

        // Update Firestore document
        const userRef = doc(db, COLLECTIONS.users, uid);
        await updateDoc(userRef, {
            tempPassword: newPassword,
            updatedAt: serverTimestamp()
        });

        return { success: true };
    } catch (error) {
        console.error('পাসওয়ার্ড আপডেট করতে সমস্যা:', error);
        if (secondaryApp) {
            try { await deleteApp(secondaryApp); } catch (e) { }
        }
        return { success: false, error: error.code };
    }
}

/**
 * Submit an access request
 */
export async function submitAccessRequest(data) {
    try {
        const ref = collection(db, COLLECTIONS.access_requests);
        await addDoc(ref, {
            ...data,
            status: 'pending',
            createdAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('এক্সেস রিকোয়েস্ট পাঠাতে সমস্যা:', error);
        return false;
    }
}


/**
 * Get all access requests (Super Admin only)
 * @returns {Promise<Array>}
 */
export async function getAccessRequests() {
    const now = Date.now();
    if (_cache.accessRequests && now < _cache.accessRequestsExpiry) {
        console.log('[Firestore] Returning cached access requests (Read Optimization Active)');
        return _cache.accessRequests;
    }

    console.log('[Firestore] Fetching fresh access requests from Firestore');
    try {
        const ref = collection(db, COLLECTIONS.access_requests);
        const snapshot = await getDocs(ref);
        let data = snapshot.docs.map(d => ({ docId: d.id, ...d.data() }));
        
        // Manual sort to handle missing createdAt gracefully
        data.sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
        });
        
        // Cache result
        _cache.accessRequests = data;
        _cache.accessRequestsExpiry = now + _cache.CACHE_DURATION;
        
        return data;
    } catch (error) {
        console.error('Error loading access requests:', error);
        return _cache.accessRequests || []; // Fallback to stale cache if any
    }
}

/**
 * Update access request status
 */
export async function updateAccessRequestStatus(docId, status, role) {
    try {
        const reqRef = doc(db, COLLECTIONS.access_requests, docId);
        await updateDoc(reqRef, {
            status,
            reviewedAt: serverTimestamp(),
            reviewedBy: auth.currentUser?.uid || 'unknown',
            assignedRole: role || null
        });
        // Clear cache to ensure fresh data on next load
        _cache.accessRequests = null;
        return true;
    } catch (error) {
        console.error('Error updating access request:', error);
        return false;
    }
}

/**
 * Delete an access request
 */
export async function deleteAccessRequest(docId) {
    try {
        await deleteDoc(doc(db, COLLECTIONS.access_requests, docId));
        // Clear cache
        _cache.accessRequests = null;
        return true;
    } catch (error) {
        console.error('Error deleting access request:', error);
        return false;
    }
}

/**
 * Subscribe to pending access requests count (Super Admin only)
 * @param {Function} callback - Called with the count of pending requests
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToPendingAccessRequests(callback) {
    try {
        const ref = collection(db, COLLECTIONS.access_requests);
        const q = query(ref, where('status', '==', 'pending'));
        return onSnapshot(q, (snapshot) => {
            callback(snapshot.size);
        }, (error) => {
            console.error('Error subscribing to access requests:', error);
        });
    } catch (error) {
        console.error('Error setting up access request subscription:', error);
        return () => { };
    }
}


/**
 * Logout admin
 * @returns {Promise<boolean>}
 */
// ==========================================
// USER MANAGEMENT OPERATIONS
// ==========================================

/**
 * Sync user role with Firestore (Create if new, Get if exists)
 * First ever user becomes 'super_admin'
 */
export async function syncUserRole(user) {
    if (!user) return null;
    try {
        const userRef = doc(db, COLLECTIONS.users, user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            // Update last login
            await updateDoc(userRef, { lastLogin: serverTimestamp() });
            let role = userSnap.data().role;

            // Auto-detect teacher role: if user role is 'user' but has teacher_assignments, upgrade to 'teacher'
            if (role === 'user') {
                try {
                    const taRef = collection(db, COLLECTIONS.teacher_assignments);
                    const taSnapshot = await getDocs(taRef);
                    const hasAssignment = taSnapshot.docs.some(d => d.data().uid === user.uid);
                    if (hasAssignment) {
                        role = 'teacher';
                        await updateDoc(userRef, { role: 'teacher' });
                        console.log(`Auto-upgraded ${user.email} role to 'teacher' (has assignments)`);
                    }
                } catch (taErr) {
                    console.warn('Could not check teacher assignments:', taErr);
                }
            }

            return role;
        }

        // Check if this is the first user (by checking if collection is empty)
        const usersRef = collection(db, COLLECTIONS.users);
        const q = query(usersRef, limit(1));
        const snapshot = await getDocs(q);

        const role = snapshot.empty ? 'super_admin' : 'user';

        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: role,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp()
        });

        return role;
    } catch (error) {
        console.error('Error syncing user role:', error);
        return 'user'; // Default fallback
    }
}

/**
 * Get all users (Super Admin only)
 */
export async function getAllUsers() {
    try {
        const usersRef = collection(db, COLLECTIONS.users);
        const q = query(usersRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error('Error fetching users:', error);
        return [];
    }
}

/**
 * Update user role (Super Admin only)
 */
export async function updateUserRole(uid, newRole) {
    try {
        const userRef = doc(db, COLLECTIONS.users, uid);
        await updateDoc(userRef, { role: newRole });
        return true;
    } catch (error) {
        console.error('Error updating role:', error);
        return false;
    }
}

/**
 * Logout admin
 * @returns {Promise<boolean>}
 */
export async function logoutAdmin() {
    try {
        await signOut(auth);
        return true;
    } catch (error) {
        console.error('লগআউট ত্রুটি:', error);
        return false;
    }
}

/**
 * Delete teacher document from Firestore (Soft delete / Deactivation)
 * @param {string} uid - User ID
 * @returns {Promise<boolean>}
 */
export async function deleteTeacherFromFirestore(uid) {
    try {
        const userRef = doc(db, COLLECTIONS.users, uid);
        await deleteDoc(userRef);
        return true;
    } catch (error) {
        console.error('টিচার ডিলিট করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Get global login permission status
 * @returns {Promise<boolean>} - true if login is enabled, false if disabled
 */
export async function getLoginPermission() {
    try {
        const settingsRef = doc(db, 'settings', 'global');
        const snap = await getDoc(settingsRef);
        if (snap.exists() && snap.data().loginEnabled === false) {
            return false;
        }
        return true; // Default: login enabled
    } catch (error) {
        console.error('লগইন পারমিশন চেক করতে সমস্যা:', error);
        return true; // Default: allow login on error
    }
}

/**
 * Set global login permission (Super Admin only)
 * @param {boolean} enabled - true to enable, false to disable
 * @returns {Promise<boolean>}
 */
export async function setLoginPermission(enabled) {
    try {
        const settingsRef = doc(db, 'settings', 'global');
        await setDoc(settingsRef, {
            loginEnabled: enabled,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid || 'unknown'
        }, { merge: true });
        return true;
    } catch (error) {
        console.error('লগইন পারমিশন সেট করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Enable/disable login for a specific user
 * @param {string} uid - User UID
 * @param {boolean} disabled - true to disable login, false to enable
 * @returns {Promise<boolean>}
 */
export async function setUserLoginDisabled(uid, disabled) {
    try {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, {
            loginDisabled: disabled,
            loginStatusUpdatedAt: serverTimestamp(),
            loginStatusUpdatedBy: auth.currentUser?.uid || 'unknown'
        }, { merge: true });
        return true;
    } catch (error) {
        console.error('ইউজার লগইন স্ট্যাটাস সেট করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Check if a specific user's login is disabled
 * @param {string} uid - User UID
 * @returns {Promise<boolean>} - true if login is disabled
 */
export async function getUserLoginStatus(uid) {
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (snap.exists() && snap.data().loginDisabled === true) {
            return true; // login IS disabled
        }
        return false; // login is allowed
    } catch (error) {
        console.error('ইউজার লগইন স্ট্যাটাস চেক করতে সমস্যা:', error);
        return false; // default: allow
    }
}

/**
 * Subscribe to global login permission status
 * @param {Function} callback 
 * @returns {Function} unsubscribe
 */
export function subscribeToGlobalLogin(callback) {
    const settingsRef = doc(db, 'settings', 'global');
    return onSnapshot(settingsRef, (snap) => {
        if (snap.exists() && snap.data().loginEnabled === false) {
            callback(false);
        } else {
            callback(true);
        }
    }, (error) => {
        console.error('গ্লোবাল লগইন সিঙ্ক সমস্যা:', error);
    });
}

/**
 * Subscribe to a specific user's login status
 * @param {string} uid 
 * @param {Function} callback 
 * @returns {Function} unsubscribe
 */
export function subscribeToUserLoginStatus(uid, callback) {
    if (!uid) return () => {};
    const userRef = doc(db, 'users', uid);
    return onSnapshot(userRef, (snap) => {
        if (snap.exists() && snap.data().loginDisabled === true) {
            callback(true); // IS disabled
        } else {
            callback(false); // is NOT disabled
        }
    }, (error) => {
        console.error('ইউজার লগইন স্ট্যাটাস সিঙ্ক সমস্যা:', error);
    });
}

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Receives user object or null
 * @returns {Function} - Unsubscribe function
 */
export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

/**
 * Save Subject Configuration
 * @param {string} subject - Subject Name
 * @param {Object} config - Configuration object
 * @returns {Promise<boolean>}
 */
export async function saveSubjectConfig(subject, config) {
    if (!auth.currentUser) return false;
    try {
        const settingsRef = doc(db, 'settings', 'subject_configs');
        await setDoc(settingsRef, {
            [subject]: config,
            updatedAt: new Date()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error('সাবজেক্ট কনফিগ সেভ করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Delete Subject Configuration
 * @param {string} subject - Subject Name
 * @returns {Promise<boolean>}
 */
export async function deleteSubjectConfig(subject) {
    if (!auth.currentUser) return false;
    try {
        const settingsRef = doc(db, 'settings', 'subject_configs');
        await updateDoc(settingsRef, {
            [subject]: deleteField()
        });
        return true;
    } catch (error) {
        console.error('সাবজেক্ট কনফিগ ডিলিট করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Get Subject Configurations
 * @returns {Promise<Object>}
 */
export async function getSubjectConfigs() {
    try {
        const settingsRef = doc(db, 'settings', 'subject_configs');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return {};
    } catch (error) {
        console.error('সাবজেক্ট কনফিগ লোড করতে সমস্যা:', error);
        return {};
    }
}

/**
 * Subscribe to Subject Configurations
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
export function subscribeToSubjectConfigs(callback) {
    const settingsRef = doc(db, 'settings', 'subject_configs');
    return onSnapshot(settingsRef, (doc) => {
        if (doc.exists()) {
            callback(doc.data());
        } else {
            callback({});
        }
    });
}

/**
 * Save Class-Subject Mapping
 * @param {string} className - Class Name (e.g., '10', 'SSC')
 * @param {Array<string>} subjects - List of subjects
 * @returns {Promise<boolean>}
 */
export async function saveClassSubjectMapping(className, subjects) {
    if (!auth.currentUser) return false;
    try {
        const settingsRef = doc(db, 'settings', 'class_subject_mappings');
        await setDoc(settingsRef, {
            [className]: subjects,
            updatedAt: new Date()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error('ক্লাস-সাবজেক্ট ম্যাপিং সেভ করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Get Class-Subject Mappings
 * @returns {Promise<Object>}
 */
export async function getClassSubjectMappings() {
    try {
        const settingsRef = doc(db, 'settings', 'class_subject_mappings');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return {};
    } catch (error) {
        console.error('ক্লাস-সাবজেক্ট ম্যাপিং লোড করতে সমস্যা:', error);
        return {};
    }
}

/**
 * Subscribe to Class-Subject Mappings
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
export function subscribeToClassSubjectMappings(callback) {
    const settingsRef = doc(db, 'settings', 'class_subject_mappings');
    return onSnapshot(settingsRef, (doc) => {
        if (doc.exists()) {
            callback(doc.data());
        } else {
            callback({});
        }
    });
}

// ==========================================
// EXAM CONFIGS OPERATIONS (Global Exam Management)
// ==========================================

/**
 * Add a new Exam Configuration
 * @param {Object} configData - { class, examName, examDate, createdBy, creatorName }
 * @returns {Promise<boolean>}
 */
export async function addExamConfig(configData) {
    try {
        const docRef = doc(collection(db, COLLECTIONS.examConfigs));
        await setDoc(docRef, {
            ...configData,
            createdAt: serverTimestamp(),
            docId: docRef.id
        });
        return true;
    } catch (error) {
        console.error('এক্সাম কনফিগ যোগ করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Get Exam Configurations (Optionally filtered by class and session)
 * @param {string} [className] - Optional class name to filter
 * @param {string} [session] - Optional session to filter
 * @returns {Promise<Array>}
 */
export async function getExamConfigs(className = null, session = null) {
    try {
        const configsRef = collection(db, COLLECTIONS.examConfigs);
        let q = query(configsRef);

        const conditions = [];
        if (className && className !== 'all') {
            conditions.push(where('class', '==', className));
        }
        if (session && session !== 'all') {
            conditions.push(where('session', '==', session));
        }

        if (conditions.length > 0) {
            q = query(configsRef, ...conditions);
        }

        const snapshot = await getDocs(q);
        const configs = snapshot.docs.map(doc => ({
            docId: doc.id,
            ...doc.data()
        }));

        // Sort descending locally by createdAt
        return configs.sort((a, b) => {
            const timeA = a.createdAt?.toMillis() || 0;
            const timeB = b.createdAt?.toMillis() || 0;
            return timeB - timeA;
        });
    } catch (error) {
        console.error('এক্সাম কনফিগ লোড করতে সমস্যা:', error);
        return [];
    }
}

/**
 * Delete an Exam Configuration
 * @param {string} docId 
 * @returns {Promise<boolean>}
 */
export async function deleteExamConfig(docId) {
    try {
        const docRef = doc(db, COLLECTIONS.examConfigs, docId);
        await deleteDoc(docRef);
        return true;
    } catch (error) {
        console.error('এক্সাম কনফিগ মুছতে সমস্যা:', error);
        return false;
    }
}

/**
 * Update an existing Exam Configuration
 * @param {string} docId 
 * @param {Object} data 
 * @returns {Promise<boolean>}
 */
export async function updateExamConfig(docId, data) {
    try {
        const docRef = doc(db, COLLECTIONS.examConfigs, docId);
        await setDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error('এক্সাম কনফিগ আপডেট করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Get all academic structure items
 * @returns {Promise<Array>}
 */
export async function getAcademicStructure() {
    try {
        const q = query(collection(db, COLLECTIONS.academicStructure), orderBy('createdAt', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('একাডেমিক স্ট্রাকচার লোড করতে সমস্যা:', error);
        return [];
    }
}

/**
 * Save an academic structure item
 * @param {Object} item - { type: 'class'|'session'|'section'|'group', value: string, label: string }
 * @returns {Promise<boolean>}
 */
export async function saveAcademicItem(item) {
    try {
        const collectionRef = collection(db, COLLECTIONS.academicStructure);
        const docRef = doc(collectionRef);
        await setDoc(docRef, {
            ...item,
            docId: docRef.id,
            createdAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('একাডেমিক আইটেম সেভ করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Delete an academic structure item
 * @param {string} docId 
 * @returns {Promise<boolean>}
 */
export async function deleteAcademicItem(docId) {
    try {
        await deleteDoc(doc(db, COLLECTIONS.academicStructure, docId));
        return true;
    } catch (error) {
        console.error('একাডেমিক আইটেম মুছতে সমস্যা:', error);
        return false;
    }
}

// ==========================================
// ACCESS CONTROL OPERATIONS
// ==========================================

/**
 * Get access control settings
 * @returns {Promise<Object>}
 */
export async function getAccessControlSettings() {
    try {
        const docRef = doc(db, COLLECTIONS.settings, 'access_control');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error('এক্সেস কন্ট্রোল সেটিংস লোড করতে সমস্যা:', error);
        return null;
    }
}

/**
 * Update access control settings
 * @param {Object} settings 
 * @returns {Promise<boolean>}
 */
export async function updateAccessControlSettings(settings) {
    try {
        const docRef = doc(db, COLLECTIONS.settings, 'access_control');
        await setDoc(docRef, {
            ...settings,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error('এক্সেস কন্ট্রোল সেটিংস আপডেট করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Subscribe to access control settings
 * @param {Function} callback 
 * @returns {Function} unsubscribe
 */
export function subscribeToAccessControl(callback) {
    const docRef = doc(db, COLLECTIONS.settings, 'access_control');
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data());
        } else {
            callback(null);
        }
    });
}
