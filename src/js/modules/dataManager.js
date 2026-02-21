/**
 * Data Management Module
 */

import { state } from './state.js';
import {
    loadDataFromStorage,
    saveDataToStorage,
    clearDataFromStorage,
    handleFileUpload,
    getDefaultData
} from '../dataService.js';
import { calculateStatistics, showNotification } from '../utils.js';
import {
    saveExam as firestoreSaveExam,
    getSavedExams,
    saveAnalytics,
    deleteExam as firestoreDeleteExam,
    updateExam as firestoreUpdateExam,
    getStudentHistory,
    searchAnalyticsCandidates,
    saveSubjectConfig as firestoreSaveSubjectConfig,
    deleteSubjectConfig as firestoreDeleteSubjectConfig,
    getSubjectConfigs,
    saveClassSubjectMapping as firestoreSaveClassSubjectMapping,
    getSettings,
    updateSettings as firestoreUpdateSettings
} from '../firestoreService.js';
import { exportStudentDataAsExcel } from '../dataService.js';
import { setLoading } from './uiManager.js';

// ... (previous functions involve initializeData, updateStudentData, clearAllData, onFileUpload, loadSampleData, triggerAnalyticsSave, handleSaveExam, fetchExams)

export async function deleteExam(docId) {
    setLoading(true);
    try {
        const success = await firestoreDeleteExam(docId);
        if (success) {
            showNotification('পরীক্ষাটি সফলভাবে মুছে ফেলা হয়েছে');
            return true;
        }
    } catch (error) {
        console.error('Exam delete error:', error);
        showNotification('মুছে ফেলতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false);
    }
    return false;
}

export async function updateExamDetails(docId, updates) {
    setLoading(true);
    try {
        const success = await firestoreUpdateExam(docId, updates);
        if (success) {
            showNotification('পরীক্ষার তথ্য আপডেট করা হয়েছে');
            return true;
        }
    } catch (error) {
        console.error('Exam update error:', error);
        showNotification('আপডেট করতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false);
    }
    return false;
}

export async function handleHistorySearch(studentId, group) {
    try {
        return await getStudentHistory(studentId, group);
    } catch (error) {
        console.error('History fetch error:', error);
        return [];
    }
}

export async function handleCandidateSearch(query, session) {
    try {
        return await searchAnalyticsCandidates(query, session);
    } catch (error) {
        console.error('Candidate search error:', error);
        return [];
    }
}

export async function exportToExcel(data, filename, subject = '') {
    try {
        exportStudentDataAsExcel(data, filename, subject);
        showNotification('Excel ফাইল ডাউনলোড শুরু হয়েছে');
    } catch (error) {
        console.error('Excel export error:', error);
        showNotification('Excel এক্সপোর্ট করতে সমস্যা হয়েছে', 'error');
    }
}


export async function saveSubjectMapping(className, subjects) {
    try {
        const success = await firestoreSaveClassSubjectMapping(className, subjects);
        if (success) {
            showNotification('ক্লাস-সাবজেক্ট ম্যাপিং সংরক্ষিত হয়েছে');
            return true;
        }
    } catch (error) {
        console.error('Mapping save error:', error);
        showNotification('ম্যাপিং সেভ করতে সমস্যা হয়েছে', 'error');
    }
    return false;
}
export async function initializeData(callbacks = {}) {
    setLoading(true);
    state.allowEmptyData = false;
    try {
        const savedData = await loadDataFromStorage();
        if (savedData && savedData.length > 0) {
            state.studentData = savedData;
        }
        state.isInitialized = true;
        if (callbacks.onComplete) callbacks.onComplete(state.studentData);
    } catch (error) {
        console.error('Data initialization error:', error);
        showNotification('ডেটা লোড করতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false);
    }
}

export async function updateStudentData(newData) {
    state.studentData = newData;
    await saveDataToStorage(state.studentData);
}

export async function clearAllData() {
    state.studentData = [];
    await clearDataFromStorage();
}

export async function onFileUpload(event, callback) {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
        const uploadedData = await handleFileUpload(file);
        state.studentData = uploadedData;
        state.allowEmptyData = false;
        await saveDataToStorage(state.studentData);

        triggerAnalyticsSave();
        if (callback) callback(uploadedData);

        const fileType = file.name.endsWith('.json') ? 'JSON' : 'Excel';
        showNotification(`${fileType} ডেটা সফলভাবে আপলোড হয়েছে (${uploadedData.length} জন শিক্ষার্থী)`);
    } catch (error) {
        console.error('File upload error:', error);
        showNotification(error.message, 'error');
    } finally {
        setLoading(false);
        event.target.value = '';
    }
}

export async function loadSampleData(callback) {
    setLoading(true);
    state.allowEmptyData = false;
    try {
        state.studentData = getDefaultData();
        await saveDataToStorage(state.studentData);
        triggerAnalyticsSave();
        if (callback) callback(state.studentData);
        showNotification('স্যাম্পল ডেটা লোড ও সিঙ্ক করা হয়েছে');
    } catch (error) {
        showNotification('ডেটা সেভ করতে সমস্যা হয়েছে', 'error');
        console.error(error);
    } finally {
        setLoading(false);
    }
}

export function triggerAnalyticsSave() {
    clearTimeout(state.analyticsSaveTimeout);
    state.analyticsSaveTimeout = setTimeout(async () => {
        if (state.studentData && state.studentData.length > 0) {
            try {
                const stats = calculateStatistics(state.studentData);
                await saveAnalytics(stats);
                console.log('Analytics synced to Firestore');
            } catch (error) {
                console.error('Analytics sync error:', error);
            }
        }
    }, 2000); // 2 second debounce
}

export async function handleSaveExam(examData) {
    if (state.studentData.length === 0) {
        showNotification('সংরক্ষণ করার মতো কোনো ডেটা নেই!', 'error');
        return false;
    }

    setLoading(true);
    try {
        // Get subject-specific configuration for accurate stats
        const subjectConfig = state.subjectConfigs[examData.subject] || {};
        const statsOptions = {
            writtenPass: Number(subjectConfig.writtenPass) || undefined,
            mcqPass: Number(subjectConfig.mcqPass) || undefined,
            totalPass: Number(subjectConfig.total) * 0.33 || 33 // Default 33% if not specified
        };

        const stats = calculateStatistics(state.studentData, statsOptions);
        const fullExamData = {
            ...examData,
            studentCount: state.studentData.length,
            studentData: state.studentData,
            stats,
            createdBy: state.currentUser?.uid,
            creatorName: state.currentUser?.displayName
        };

        const success = await firestoreSaveExam(fullExamData);
        if (success) {
            showNotification('পরীক্ষার ফলাফল সফলভাবে সংরক্ষণ করা হয়েছে!');
            return true;
        }
    } catch (error) {
        console.error('Exam save error:', error);
        showNotification('ত্রুটি: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
    return false;
}

export async function fetchExams() {
    try {
        const exams = await getSavedExams();
        state.savedExams = exams;
        return exams;
    } catch (error) {
        console.error('Error fetching exams:', error);
        return [];
    }
}
export async function updateAppSettings(settings) {
    try {
        return await firestoreUpdateSettings(settings);
    } catch (error) {
        console.error('Settings update error:', error);
        return false;
    }
}
