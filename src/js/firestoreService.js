/**
 * Firestore Service Module
 * Handles all Firestore database operations for the student performance dashboard
 * @module firestoreService
 */

import { db, auth } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
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
    orderBy,
    serverTimestamp,
} from 'firebase/firestore';

// Collection names
const COLLECTIONS = {
    students: 'students',
    exams: 'exams',
    analytics: 'analytics',
    settings: 'settings',
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
 * Add a new student
 * @param {Object} studentData - Student data object
 * @returns {Promise<string|null>} - New document ID or null
 */
export async function addStudent(studentData) {
    try {
        // Generate deterministic ID
        const safeId = String(studentData.id || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
        const safeGroup = String(studentData.group || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
        const safeClass = String(studentData.class || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
        const safeSession = String(studentData.session || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
        const docId = `STUDENT_${safeId}_${safeGroup}_${safeClass}_${safeSession}`.toUpperCase();

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
    const BATCH_SIZE = 400; // Firestore batch limit is 500, use 400 for safety

    try {
        console.log(`Starting bulk import of ${studentsArray.length} students...`);

        // First, delete all existing students in batches
        const existingStudents = await getAllStudents();
        console.log(`Deleting ${existingStudents.length} existing students...`);

        // Delete in batches
        for (let i = 0; i < existingStudents.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = existingStudents.slice(i, i + BATCH_SIZE);

            for (const student of chunk) {
                const docRef = doc(db, COLLECTIONS.students, student.docId);
                batch.delete(docRef);
            }

            await batch.commit();
            console.log(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        }

        // Add new students in batches
        console.log(`Adding ${studentsArray.length} new students in batches...`);

        for (let i = 0; i < studentsArray.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = studentsArray.slice(i, i + BATCH_SIZE);

            for (const student of chunk) {
                // Generate deterministic ID
                const safeId = String(student.id || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
                const safeGroup = String(student.group || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
                const safeClass = String(student.class || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
                const safeSession = String(student.session || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
                // Use a consistent prefix to ensure ID validity and uniqueness scope
                const docId = `STUDENT_${safeId}_${safeGroup}_${safeClass}_${safeSession}`.toUpperCase();

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
    try {
        const batch = writeBatch(db);
        const students = await getAllStudents();

        for (const student of students) {
            const docRef = doc(db, COLLECTIONS.students, student.docId);
            batch.delete(docRef);
        }

        await batch.commit();
        return true;
    } catch (error) {
        console.error('সব শিক্ষার্থী মুছতে সমস্যা:', error);
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
            id: docId
        });

        console.log('Exam saved with ID:', docId);
        return true;
    } catch (error) {
        console.error('পরীক্ষা সেভ করতে সমস্যা:', error);
        return false;
    }
}

/**
 * Get all saved exams
 * @returns {Promise<Array>} - Array of exam documents ordered by date
 */
export async function getSavedExams() {
    try {
        const examsRef = collection(db, COLLECTIONS.exams);
        const q = query(examsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({
            docId: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('পরীক্ষার তালিকা লোড করতে সমস্যা:', error);
        return [];
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
 * Update app settings
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
 * Convert Bengali digits to English
 */
function convertToEnglishDigits(str) {
    const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    const en = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return str.replace(/[০-৯]/g, (c) => en[bn.indexOf(c)]);
}

/**
 * Search for students across all exams for analysis
 * @param {string} query - Search query (Name or ID)
 * @returns {Promise<Array>} - Array of unique student candidates {id, name, group, class}
 */
export async function searchAnalyticsCandidates(query) {
    if (!query) return [];

    try {
        const exams = await getSavedExams();
        const candidates = new Map(); // Use Map to dedup by "ID_Group"

        // Normalize query: Convert Bengali to English digits
        const normalizedQuery = convertToEnglishDigits(query.trim());
        const lowerQuery = query.toLowerCase();

        // Determine if search is by Roll (Numeric) or Name (Text)
        // If normalizedQuery is a valid number, treat as Roll Search (Exact Match)
        const isRollSearch = /^\d+$/.test(normalizedQuery);

        exams.forEach(exam => {
            if (exam.studentData && Array.isArray(exam.studentData)) {
                exam.studentData.forEach(s => {
                    let match = false;

                    if (isRollSearch) {
                        // EXACT MATCH for Roll
                        if (String(s.id) === normalizedQuery) {
                            match = true;
                        }
                    } else {
                        // Fuzzy search for Name
                        if (s.name && s.name.toLowerCase().includes(lowerQuery)) {
                            match = true;
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
        return { success: true, user: result.user };
    } catch (error) {
        console.error('গুগল লগইন ত্রুটি:', error);
        return { success: false, error: error.code };
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
 * Subscribe to auth state changes
 * @param {Function} callback - Receives user object or null
 * @returns {Function} - Unsubscribe function
 */
export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}
