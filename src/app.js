/**
 * Main Application Entry Point
 * শিক্ষার্থীদের পারফর্ম্যান্স ড্যাশবোর্ড
 * With Firebase Firestore Integration
 */

import './styles/main.css';
import html2canvas from 'html2canvas';
import {
    loadDataFromStorage,
    saveDataToStorage,
    getDefaultData,
    clearDataFromStorage,
    handleFileUpload,

    exportChartAsImage,
    exportStudentDataAsExcel, // Imported
    loadThemePreference,
    saveThemePreference,
    subscribeToDataUpdates,
    isFirestoreOnline,
    downloadDemoTemplate
} from './js/dataService.js';
import {
    filterStudentData,
    showNotification,
    calculateStatistics,
} from './js/utils.js';
import {
    createPerformanceChart,
    getCurrentChart,
    getChartTitle,
    createHistoryChart,
    downloadHighResChart,
} from './js/chartModule.js';
import {
    updateSettings,
    getSettings,
    subscribeToSettings,
} from './js/firestoreService.js';
import {
    renderStats,
    renderGroupStats,
    renderFailedStudents,
    renderTable,
    renderJSONPreview,
    toggleTheme,
    applyTheme,
} from './js/uiComponents.js';
import {
    saveAnalytics,
    saveExam,
    getSavedExams,
    deleteExam,
    updateExam,
    getStudentHistory,
    searchAnalyticsCandidates,
    bulkImportStudents,
    loginWithGoogle,
    logoutAdmin,
    subscribeToSubjectConfigs,
    saveSubjectConfig,
    deleteSubjectConfig,
    getSubjectConfigs,
    onAuthChange,
    syncUserRole, // Imported
    getAllUsers, // Imported
    updateUserRole,
    saveClassSubjectMapping, // Imported
    getClassSubjectMappings, // Imported
    subscribeToClassSubjectMappings // Imported
} from './js/firestoreService.js';

// Application State
const state = {
    studentData: [],
    savedExams: [],
    subjectConfigs: {},
    classSubjectMapping: {}, // New State for Class-Subject Mapping
    currentGroupFilter: 'all',
    currentGradeFilter: 'all',
    currentSearchTerm: '',
    currentView: 'chart',
    currentChartType: 'total',
    currentExamName: 'প্রি-টেস্ট পরীক্ষা-২০২৫', // Default exam name
    currentSubject: localStorage.getItem('currentSubject') || null,
    currentSortOrder: 'desc',
    isLoading: true,
    isInitialized: false, // Track if initial data is loaded
    allowEmptyData: false, // Flag for when user clears data explicitly
    unsubscribe: null, // For cleanup of Firestore listener
    isAdmin: false, // Admin login status
    isSuperAdmin: false, // Super Admin login status
    userRole: 'guest', // guest, user, admin, super_admin

    // Inline search state
    inlineSearchStudent: null,
    inlineSearchHistory: [],
    inlineHistoryChartInstance: null,
    inlineSearchDebounce: null,
    inlinePrevStudent: null,
    inlineNextStudent: null,
    analysisSearchDebounce: null,
    currentAnalysisNextStudent: null,
    editingSubjectKey: null, // Track which subject key is being edited

    // Saved Exams Pagination
    savedExamsCurrentPage: 1,
    savedExamsPerPage: 6,
    defaultExamId: null,
    currentUser: null
};

const DEFAULT_SUBJECT_CONFIG = {
    total: '100',
    written: '50',
    writtenPass: '17',
    mcq: '25',
    mcqPass: '8',
    practical: '25',
    practicalPass: '0',
    practicalOptional: false
};


// DOM Elements
const elements = {
    chartTypeSelect: null,
    sortOrderSelect: null,
    // exportBtn: null, // Removed
    reportDropdownBtn: null, // New
    reportDropdownMenu: null, // New
    downloadChartBtn: null, // New
    downloadExcelBtn: null, // New
    groupFilters: null,
    gradeFilters: null,
    searchInput: null,
    statsContainer: null,
    groupStatsContainer: null,
    failedStudentsContainer: null,
    chartCanvas: null,
    themeToggle: null,
    chartTitle: null,
    jsonFileInput: null,
    loadSampleDataBtn: null,
    clearDataBtn: null,
    jsonPreview: null,
    chartView: null,
    tableView: null,
    tableBody: null,
    viewButtons: null,
    syncStatus: null,
    loadingOverlay: null,
    // Exam Management UI
    saveAnalysisBtn: null,
    savedExamsList: null,
    saveExamModal: null,
    closeModalBtn: null,
    saveExamForm: null,
    // Analysis UI
    analysisView: null,
    analysisStudentId: null,
    analyzeBtn: null,
    historyChart: null,
    studentDetails: null,
    analysisType: null,
    analysisMaxMarks: null,
    analysisMaxMarks: null,
    analysisSearchResults: null,

    // Analysis State
    currentAnalysisStudent: null,
    currentHistory: [],
};

/**
 * Inject dynamic styles for default exam card
 */
function injectDefaultCardStyles() {
    if (document.getElementById('default-card-styles')) return;
    const style = document.createElement('style');
    style.id = 'default-card-styles';
    style.textContent = `
        @keyframes goldenPulse {
            0% { border-color: #ffd700; box-shadow: 0 0 10px rgba(255, 215, 0, 0.4); }
            50% { border-color: #ffaa00; box-shadow: 0 0 20px rgba(255, 215, 0, 0.7), inset 0 0 10px rgba(255, 215, 0, 0.1); }
            100% { border-color: #ffd700; box-shadow: 0 0 10px rgba(255, 215, 0, 0.4); }
        }
        @keyframes shimmer {
            0% { left: -150%; opacity: 0; }
            50% { opacity: 0.5; }
            100% { left: 150%; opacity: 0; }
        }
        .default-exam-card {
            border: 2px solid #ffd700 !important;
            animation: goldenPulse 2s infinite ease-in-out;
            position: relative;
            overflow: hidden !important;
            z-index: 5;
        }
        .default-exam-card::after {
            content: '';
            position: absolute;
            top: 0; left: -150%; width: 80%; height: 100%;
            background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.4), transparent);
            transform: skewX(-25deg);
            animation: shimmer 3s infinite ease-in-out;
            pointer-events: none;
            z-index: 2;
        }
        .default-exam-card > * { position: relative; z-index: 3; }
    `;
    document.head.appendChild(style);
}

/**
 * Initialize DOM element references
 */
function initElements() {
    injectDefaultCardStyles();
    elements.chartTypeSelect = document.getElementById('chartType');
    elements.sortOrderSelect = document.getElementById('sortOrder');
    // elements.exportBtn = document.getElementById('exportBtn'); // Removed
    elements.reportDropdownBtn = document.getElementById('reportDropdownBtn');
    elements.reportDropdownMenu = document.getElementById('reportDropdownMenu');
    elements.downloadChartBtn = document.getElementById('downloadChartBtn');
    elements.downloadExcelBtn = document.getElementById('downloadExcelBtn');

    elements.groupFilters = document.querySelectorAll('.group-btn');
    elements.gradeFilters = document.querySelectorAll('.grade-btn');
    elements.searchInput = document.getElementById('searchInput');
    elements.statsContainer = document.getElementById('statsContainer');
    elements.groupStatsContainer = document.getElementById('groupStatsContainer');
    elements.failedStudentsContainer = document.getElementById('failedStudentsContainer');
    elements.chartCanvas = document.getElementById('performanceChart');
    elements.themeToggle = document.getElementById('themeToggle');
    elements.chartTitle = document.getElementById('chartTitle');
    elements.jsonFileInput = document.getElementById('jsonFileInput');
    elements.downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
    // elements.loadSampleDataBtn = document.getElementById('loadSampleData'); // Removed
    // elements.clearDataBtn = document.getElementById('clearData'); // Removed

    // Exam Management UI
    elements.saveAnalysisBtn = document.getElementById('saveAnalysisBtn');
    elements.savedExamsList = document.getElementById('savedExamsList');
    elements.saveExamModal = document.getElementById('saveExamModal');
    elements.closeModalBtn = document.getElementById('closeModalBtn');
    elements.saveExamForm = document.getElementById('saveExamForm');
    elements.jsonPreview = document.getElementById('jsonPreview');
    elements.chartView = document.getElementById('chartView');
    elements.tableView = document.getElementById('tableView');
    elements.tableBody = document.getElementById('tableBody');
    elements.viewButtons = document.querySelectorAll('.view-btn[data-view]'); // Fix: Only select actual view toggles
    elements.syncStatus = document.getElementById('syncStatus');
    elements.loadingOverlay = document.getElementById('loadingOverlay');

    // Analysis UI
    elements.analysisView = document.getElementById('analysisView');
    elements.analysisStudentId = document.getElementById('analysisStudentId');
    elements.analyzeBtn = document.getElementById('analyzeBtn');
    elements.historyChart = document.getElementById('historyChart');
    elements.studentDetails = document.getElementById('studentDetails');
    elements.analysisType = document.getElementById('analysisType');
    elements.analysisMaxMarks = document.getElementById('analysisMaxMarks');
    elements.analysisMaxMarks = document.getElementById('analysisMaxMarks');
    elements.analysisSearchResults = document.getElementById('analysisSearchResults');
    elements.printBtn = document.getElementById('printBtn');
    elements.toolbarUserMgmtBtn = document.getElementById('toolbarUserMgmtBtn');

    // Inline Search UI
    elements.inlineSearchPanel = document.getElementById('inlineSearchPanel');
    elements.inlineSearchCandidates = document.getElementById('inlineSearchCandidates');
    elements.inlineHistorySection = document.getElementById('inlineHistorySection');
    elements.inlineStudentDetails = document.getElementById('inlineStudentDetails');
    elements.inlineHistoryChart = document.getElementById('inlineHistoryChart');
    elements.inlineAnalysisType = document.getElementById('inlineAnalysisType');
    elements.inlineAnalysisMaxMarks = document.getElementById('inlineAnalysisMaxMarks');
    elements.inlineAnalysisMaxMarks = document.getElementById('inlineAnalysisMaxMarks');
    elements.inlineDownloadBtn = document.getElementById('inlineDownloadBtn');

    // Global Download Button
    elements.downloadBtn = document.getElementById('downloadBtn');

    // Section Export Buttons
    elements.downloadFailedBtn = document.getElementById('downloadFailedBtn');
    elements.downloadGroupStatsBtn = document.getElementById('downloadGroupStatsBtn');

    // Admin UI
    elements.adminToggle = document.getElementById('adminToggle');
    elements.editExamModal = document.getElementById('editExamModal');
    elements.closeEditModal = document.getElementById('closeEditModal');
    elements.editExamForm = document.getElementById('editExamForm');
    elements.editExamDocId = document.getElementById('editExamDocId');
    elements.editExamName = document.getElementById('editExamName');
    elements.editSubjectName = document.getElementById('editSubjectName');
    elements.editExamClass = document.getElementById('editExamClass');
    elements.editExamSession = document.getElementById('editExamSession');
    elements.closeEditModal = document.getElementById('closeEditModal');

    // Class Subject Mapping UI
    elements.openClassMappingBtn = document.getElementById('openClassMappingBtn');
    elements.classSubjectMappingModal = document.getElementById('classSubjectMappingModal');
    elements.closeClassMappingBtn = document.getElementById('closeClassMappingBtn');
    elements.mappingClassSelect = document.getElementById('mappingClassSelect');
    elements.mappingSubjectInput = document.getElementById('mappingSubjectInput');
    elements.addMappingSubjectBtn = document.getElementById('addMappingSubjectBtn');
    elements.mappingSubjectsContainer = document.getElementById('mappingSubjectsContainer');
    elements.saveMappingBtn = document.getElementById('saveMappingBtn');
    elements.examClass = document.getElementById('examClass'); // Ensure referenced
    elements.examSubject = document.getElementById('examSubject'); // Ensure referenced

    // Confirm Modal
    elements.confirmModal = document.getElementById('confirmModal');
    elements.confirmCancelBtn = document.getElementById('confirmCancelBtn');
    elements.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    elements.confirmMessage = document.getElementById('confirmMessage');

    // Saved Exams Section (Collapsible)
    elements.savedExamsToggle = document.getElementById('savedExamsToggle');
    elements.savedExamsCollapse = document.getElementById('savedExamsCollapse');
    elements.savedExamsIcon = document.getElementById('savedExamsIcon');
    elements.savedExamsPagination = document.getElementById('savedExamsPagination');

    // Profile Modal
    elements.profileModal = document.getElementById('profileModal');
    elements.userName = document.getElementById('userName');
    elements.userEmail = document.getElementById('userEmail');
    elements.userPhoto = document.getElementById('userPhoto');
    elements.modalLogoutBtn = document.getElementById('modalLogoutBtn');
    elements.closeProfileBtn = document.getElementById('closeProfileBtn');
    elements.closeProfileIcon = document.getElementById('closeProfileIcon');

    // User Management Modal
    elements.userManagementModal = document.getElementById('userManagementModal');
    elements.closeUserManagementBtn = document.getElementById('closeUserManagementBtn');
    elements.userListBody = document.getElementById('userListBody');
}


/**
 * Show/hide loading overlay
 * @param {boolean} isLoading - Whether to show or hide the loader
 * @param {string|HTMLElement} targetSelector - Optional selector or element to show loader over. If null, shows global loader.
 */
function setLoading(isLoading, targetSelector = null) {
    // If no target provided, toggle global state and overlay
    if (!targetSelector) {
        state.isLoading = isLoading;
        if (elements.loadingOverlay) {
            if (isLoading) {
                elements.loadingOverlay.classList.remove('fade-out');
                elements.loadingOverlay.style.display = 'flex';
            } else {
                elements.loadingOverlay.classList.add('fade-out');
                setTimeout(() => {
                    if (elements.loadingOverlay.classList.contains('fade-out')) {
                        elements.loadingOverlay.style.display = 'none';
                        elements.loadingOverlay.classList.remove('fade-out');
                    }
                }, 500); // Match CSS animation duration
            }
        }
        return;
    }

    // Handle localized loading
    const target = typeof targetSelector === 'string'
        ? document.querySelector(targetSelector)
        : targetSelector;

    if (!target) return;

    if (isLoading) {
        // Create and append overlay
        // Ensure target is positioned relative so absolute overlay works
        if (getComputedStyle(target).position === 'static') {
            target.style.position = 'relative';
        }

        // Check if overlay already exists
        if (target.querySelector('.content-loading-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'content-loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner spinner-sm">
                <i class="fas fa-spinner fa-spin"></i>
                <span>লোড হচ্ছে...</span>
            </div>
        `;
        target.appendChild(overlay);
    } else {
        // Remove overlay with fade out
        const overlay = target.querySelector('.content-loading-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.remove();
                }
            }, 500);
        }
    }
}

/**
 * Update sync status indicator
 */
function updateSyncStatus(isOnline) {
    if (elements.syncStatus) {
        elements.syncStatus.innerHTML = isOnline
            ? '<i class="fas fa-cloud"></i> সিঙ্ক'
            : '<i class="fas fa-cloud-slash"></i> অফলাইন';
        elements.syncStatus.className = `sync-status ${isOnline ? 'online' : 'offline'}`;
    }
}

/**
 * Get filtered data based on current filters
 */
/**
 * Get Subject Config with Class/Session Fallback
 */
function getSubjectConfig(subject, className, session) {
    if (!subject) return DEFAULT_SUBJECT_CONFIG;

    // 1. Try Specific: Subject (Class - Session)
    if (className && session) {
        const sessionKey = `${subject} (${className} - ${session})`;
        if (state.subjectConfigs[sessionKey]) return state.subjectConfigs[sessionKey];
    }

    // 2. Try Class Specific: Subject (Class)
    if (className) {
        const classKey = `${subject} (${className})`;
        if (state.subjectConfigs[classKey]) return state.subjectConfigs[classKey];
    }

    // 3. Fallback: Generic Subject
    return state.subjectConfigs[subject] || DEFAULT_SUBJECT_CONFIG;
}

/**
 * Get filtered data based on current filters
 */
function getFilteredData() {
    let options = {};
    const subject = state.currentSubject;

    if (subject) {
        // Determine class and session from current data
        let currentClass = null;
        let currentSession = null;

        if (state.studentData.length > 0) {
            currentClass = state.studentData[0].class;
            currentSession = state.studentData[0].session;
        }

        const config = getSubjectConfig(subject, currentClass, currentSession);

        if (config) {
            options = {
                writtenPass: parseInt(config.writtenPass) || 17,
                mcqPass: parseInt(config.mcqPass) || 8,
                criteria: state.currentChartType // Pass current view criteria
            };
        }
    }

    return filterStudentData(state.studentData, {
        group: state.currentGroupFilter,
        searchTerm: state.currentSearchTerm,
        grade: state.currentGradeFilter,
    }, options);
}


/**
 * Update all views
 */
function updateViews() {
    if (state.isLoading) return;

    const filteredData = getFilteredData();

    // Calculate Pass Mark based on Config
    let passMark = 33;
    let writtenPass = 17;
    let mcqPass = 8;
    let totalPass = 33;

    const subject = state.currentSubject; // Use current subject

    if (subject) {
        let currentClass = null;
        let currentSession = null;

        if (state.studentData.length > 0) {
            currentClass = state.studentData[0].class;
            currentSession = state.studentData[0].session;
        }

        const config = getSubjectConfig(subject, currentClass, currentSession);
        if (config) {
            writtenPass = parseInt(config.writtenPass) || 17;
            mcqPass = parseInt(config.mcqPass) || 8;
            totalPass = Math.ceil((parseInt(config.total) || 100) * 0.33);

            if (state.currentChartType === 'total') {
                const total = parseInt(config.total) || 100;
                passMark = Math.ceil(total * 0.33);
            } else if (state.currentChartType === 'written') {
                passMark = writtenPass;
            } else if (state.currentChartType === 'mcq') {
                passMark = mcqPass;
            } else if (state.currentChartType === 'practical') {
                passMark = parseInt(config.practicalPass) || 0;
            }
        }
    }

    // Update stats
    renderStats(elements.statsContainer, filteredData, {
        writtenPass,
        mcqPass,
        totalPass
    });

    // Update group stats (always use full data)
    renderGroupStats(elements.groupStatsContainer, state.studentData);



    // Update failed students (Pass dynamic thresholds)
    renderFailedStudents(elements.failedStudentsContainer, filteredData, {
        writtenPass,
        mcqPass,
        totalPass
    });

    // Update chart title (Dynamic)
    elements.chartTitle.textContent = getChartTitle(state.currentChartType, state.currentExamName, state.currentSubject);

    // Update chart or table based on current view
    if (state.currentView === 'chart') {
        createPerformanceChart(elements.chartCanvas, filteredData, {
            chartType: state.currentChartType,
            sortOrder: state.currentSortOrder,
            subject: state.currentSubject,
            group: state.currentGroupFilter !== 'all' ? state.currentGroupFilter : null,
            grade: state.currentGradeFilter !== 'all' ? state.currentGradeFilter : null,
            examName: state.currentExamName,
            passMark: passMark, // Pass the calculated pass mark
            onBarClick: activateAnalysisView // Pass the callback
        });
    } else if (state.currentView === 'table') {
        renderTable(elements.tableBody, filteredData, {
            sortBy: state.currentChartType,
            sortOrder: state.currentSortOrder,
            onRowClick: activateAnalysisView, // Pass the callback
            writtenPass,
            mcqPass
        });
    }

    // Update JSON preview - Removed as per user request
    // renderJSONPreview(elements.jsonPreview, state.studentData);

    // Update sync status
    updateSyncStatus(isFirestoreOnline());

    // Save analytics to Firestore (async, don't wait)
    if (state.studentData.length > 0) {
        const stats = calculateStatistics(state.studentData);
        saveAnalytics(stats).catch(err => console.error('Analytics save error:', err));
    }
}

/**
 * Toggle between chart and table view
 */
function toggleView() {
    // Hide all
    elements.chartView.style.display = 'none';
    elements.tableView.style.display = 'none';
    if (elements.analysisView) elements.analysisView.style.display = 'none';

    // Show active
    if (state.currentView === 'chart') {
        elements.chartView.style.display = 'block';
    } else if (state.currentView === 'table') {
        elements.tableView.style.display = 'block';
    } else if (state.currentView === 'analysis') {
        if (elements.analysisView) elements.analysisView.style.display = 'block';
    }
    updateViews();
}

/**
 * Handle file upload
 */
async function onFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log('File selected:', file.name, file.type);
    setLoading(true);
    try {
        console.log('Starting file upload processing...');
        const uploadedData = await handleFileUpload(file);
        console.log('Upload processed, students count:', uploadedData.length);

        state.studentData = uploadedData;
        state.allowEmptyData = false; // Reset the flag
        console.log('State updated, saving to storage...');

        await saveDataToStorage(state.studentData);
        console.log('Saved to storage, updating views...');

        updateViews();
        console.log('Views updated');

        const fileType = file.name.endsWith('.json') ? 'JSON' : 'Excel';
        showNotification(`${fileType} ডেটা সফলভাবে আপলোড হয়েছে (${uploadedData.length} জন শিক্ষার্থী)`);
    } catch (error) {
        console.error('File upload error:', error);
        alert(error.message);
    } finally {
        setLoading(false);
    }

    // Reset file input
    event.target.value = '';
}

/**
 * Load sample data
 */
async function loadSampleData() {
    setLoading(true);
    state.allowEmptyData = false; // Reset empty data flag when loading new data
    try {
        state.studentData = getDefaultData();
        await saveDataToStorage(state.studentData);
        updateViews();
        showNotification('স্যাম্পল ডেটা লোড ও সিঙ্ক করা হয়েছে');
    } catch (error) {
        showNotification('ডেটা সেভ করতে সমস্যা হয়েছে');
        console.error(error);
    } finally {
        setLoading(false);
    }
}

/**
 * Clear all data
 */
async function clearData() {
    if (confirm('আপনি কি নিশ্চিত যে আপনি সমস্ত ডেটা মুছতে চান?')) {
        setLoading(true);
        state.allowEmptyData = true; // Allow empty data when user explicitly clears
        try {
            state.studentData = [];
            await clearDataFromStorage();
            updateViews();
            showNotification('সমস্ত ডেটা মুছে ফেলা হয়েছে');
        } catch (error) {
            showNotification('ডেটা মুছতে সমস্যা হয়েছে');
            console.error(error);
        } finally {
            setLoading(false);
        }
    }
}

/**
 * Handle real-time data updates from Firestore
 */
function onDataUpdate(students) {
    // If students array is empty and we haven't allowed empty data, skip update
    // This prevents the empty listener from overwriting initial sample data load
    if (students.length === 0 && !state.allowEmptyData && state.studentData.length > 0) {
        console.log('Skipping empty data update to preserve existing data');
        return;
    }

    // Only update if we have data, or if empty data is allowed (user cleared explicitly)
    if (students.length > 0 || state.allowEmptyData) {
        state.studentData = students;
        updateViews();
    }
    updateSyncStatus(true);
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
    console.log('Initializing event listeners...');

    // Chart type and sort order
    if (elements.chartTypeSelect) {
        elements.chartTypeSelect.addEventListener('change', (e) => {
            state.currentChartType = e.target.value;
            updateViews();
        });
    }

    // Update chart on option change
    if (elements.analysisType) {
        elements.analysisType.addEventListener('change', () => updateAnalysisChart());
    }
    if (elements.analysisMaxMarks) {
        elements.analysisMaxMarks.addEventListener('change', () => updateAnalysisChart());
    }

    // Real-time Analysis Search
    if (elements.analysisStudentId) {
        elements.analysisStudentId.addEventListener('input', (e) => {
            clearTimeout(state.analysisSearchDebounce);
            const query = e.target.value.trim();

            if (!query) {
                // Clear view if search is empty
                if (elements.analysisSearchResults) elements.analysisSearchResults.style.display = 'none';
                if (elements.studentDetails) elements.studentDetails.innerHTML = '';
                const reportContent = document.getElementById('analysisReportContent');
                if (reportContent) reportContent.style.display = 'none';

                if (state.historyChartInstance) {
                    state.historyChartInstance.destroy();
                    state.historyChartInstance = null;
                }
                return;
            }

            state.analysisSearchDebounce = setTimeout(() => {
                handleAnalysisSearch();
            }, 300);
        });
    }

    if (elements.sortOrderSelect) {
        elements.sortOrderSelect.addEventListener('change', (e) => {
            state.currentSortOrder = e.target.value;
            updateViews();
        });
    }

    // Reset All Filters Button
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            // Reset state
            state.currentGroupFilter = 'all';
            state.currentGradeFilter = 'all';
            state.currentSearchTerm = '';
            state.currentChartType = 'total';
            state.currentSortOrder = 'desc';

            // Reset UI elements
            if (elements.searchInput) elements.searchInput.value = '';
            if (elements.chartTypeSelect) elements.chartTypeSelect.value = 'total';
            if (elements.sortOrderSelect) elements.sortOrderSelect.value = 'desc';

            // Reset group filter active state
            document.querySelectorAll('.group-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.group === 'all');
            });

            // Reset grade filter active state
            document.querySelectorAll('.grade-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.grade === 'all');
            });

            updateViews();
            showNotification('সকল ফিল্টার রিসেট হয়েছে');
        });
    }

    // Export button - REPLACED WITH DROPDOWN LOGIC
    /*
    if (elements.exportBtn) {
        elements.exportBtn.addEventListener('click', () => {
            const chart = getCurrentChart();
            if (chart) {
                exportChartAsImage(elements.chartCanvas);
            }
        });
    }
    */

    // Report Dropdown Logic
    if (elements.reportDropdownBtn && elements.reportDropdownMenu) {
        // Toggle dropdown
        elements.reportDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.reportDropdownMenu.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        window.addEventListener('click', () => {
            if (elements.reportDropdownMenu.classList.contains('show')) {
                elements.reportDropdownMenu.classList.remove('show');
            }
        });
    }

    // Download Chart Action
    if (elements.downloadChartBtn) {
        elements.downloadChartBtn.addEventListener('click', () => {
            const chart = getCurrentChart();
            if (chart) {
                // Use new High Res download function
                downloadHighResChart('Performance_Chart_HighRes.png');
            } else {
                showNotification('চার্ট লোড হয়নি', 'error');
            }
        });
    }

    // Download Excel Action
    if (elements.downloadExcelBtn) {
        elements.downloadExcelBtn.addEventListener('click', () => {
            const filteredData = getFilteredData(); // Download filtered or All, let's use filtered for "Report" context or All? User usually expects what they see or all. Let's use filtered to be consistent with "Report".
            // Actually, "Data Management" usually implies all data. But since it's "Report Download", filtered view might be useful.
            // Let's stick to ALL data for "Data Management" section export to be safe/comprehensive, 
            // OR use filtered if users want specific reports.
            // The prompt "Report Download" suggests maybe the current report.
            // However, the previous behavior was just chart image.

            // Let's export ALL data for now as it makes more sense for "Data Management" tab.
            // Or maybe better: use `getFilteredData()` if we want to support downloading specific group reports.
            // Let's use `getFilteredData()` so it matches the visual report (Chart).

            const dataToExport = getFilteredData();
            if (dataToExport.length > 0) {
                exportStudentDataAsExcel(dataToExport, `Student_Performance_Report_${new Date().toLocaleDateString('bn-BD')}.xlsx`);
            } else {
                showNotification('এক্সপোর্ট করার মতো ডেটা নেই', 'error');
            }
        });
    }

    // Download Analysis Image Logic
    const downloadAnalysisBtn = document.getElementById('downloadAnalysisBtn');
    if (downloadAnalysisBtn) {
        downloadAnalysisBtn.addEventListener('click', downloadAnalysisReport);
    }

    // Theme toggle
    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', async () => {
            const isDark = toggleTheme(elements.themeToggle);
            await saveThemePreference(isDark ? 'dark' : 'light');

            // Force chart refresh by updating all views
            // This will destroy and recreate charts with new theme colors
            updateViews();

            // Also update analysis chart if visible
            if (state.currentView === 'analysis' && state.currentHistory && state.currentHistory.length > 0) {
                updateAnalysisChart();
            }

            // Update inline chart if visible
            if (elements.inlineSearchPanel && elements.inlineSearchPanel.style.display !== 'none' && state.inlineSearchHistory.length > 0) {
                updateInlineChart();
            }
        });
    }

    // Download Template
    if (elements.downloadTemplateBtn) {
        elements.downloadTemplateBtn.addEventListener('click', downloadDemoTemplate);
    }

    // File upload
    if (elements.jsonFileInput) {
        elements.jsonFileInput.addEventListener('change', onFileUpload);
    }

    // Load Sample Data & Clear Data buttons REMOVED from HTML
    // Keeping logic here commented out or removed if needed later
    /*
    if (elements.loadSampleDataBtn) {
        elements.loadSampleDataBtn.addEventListener('click', loadSampleData);
    }
    if (elements.clearDataBtn) {
        elements.clearDataBtn.addEventListener('click', clearData);
    }
    */

    // Search input — real-time filter + inline history search
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
            const raw = e.target.value;
            state.currentSearchTerm = raw.toLowerCase();
            updateViews();

            // Debounced inline search across saved exams
            clearTimeout(state.inlineSearchDebounce);
            const query = raw.trim();
            if (!query) {
                hideInlineSearch();
                return;
            }
            state.inlineSearchDebounce = setTimeout(() => {
                handleRealtimeSearch(query);
            }, 300);
        });
    }

    // Inline chart controls
    if (elements.inlineAnalysisType) {
        elements.inlineAnalysisType.addEventListener('change', updateInlineChart);
    }
    if (elements.inlineAnalysisMaxMarks) {
        elements.inlineAnalysisMaxMarks.addEventListener('change', updateInlineChart);
    }
    if (elements.inlineDownloadBtn) {
        elements.inlineDownloadBtn.addEventListener('click', downloadInlineReport);
    }

    // Group filters
    if (elements.groupFilters) {
        elements.groupFilters.forEach((btn) => {
            btn.addEventListener('click', function () {
                elements.groupFilters.forEach((b) => b.classList.remove('active'));
                this.classList.add('active');
                state.currentGroupFilter = this.getAttribute('data-group');
                updateViews();
            });
        });
    }

    // Grade filters
    if (elements.gradeFilters) {
        elements.gradeFilters.forEach((btn) => {
            btn.addEventListener('click', function () {
                elements.gradeFilters.forEach((b) => b.classList.remove('active'));
                this.classList.add('active');
                state.currentGradeFilter = this.getAttribute('data-grade');
                updateViews();
            });
        });
    }

    // Keyboard Navigation for Analysis View
    document.addEventListener('keydown', (e) => {
        if (state.currentView !== 'analysis') return;

        // Don't trigger if user is typing in an input or select
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        if (e.key === 'ArrowLeft' && state.currentAnalysisPrevStudent) {
            selectStudentForAnalysis(state.currentAnalysisPrevStudent);
        } else if (e.key === 'ArrowRight' && state.currentAnalysisNextStudent) {
            selectStudentForAnalysis(state.currentAnalysisNextStudent);
        }
    });

    // View toggle
    if (elements.viewButtons) {
        elements.viewButtons.forEach((btn) => {
            btn.addEventListener('click', function () {
                elements.viewButtons.forEach((b) => b.classList.remove('active'));
                this.classList.add('active');
                state.currentView = this.getAttribute('data-view');
                toggleView();
                toggleView();
            });
        });
        // Print Button
        if (elements.printBtn) {
            elements.printBtn.addEventListener('click', () => {
                window.print(); // Trigger browser print dialog
            });
        }

        // Download Button
        if (elements.downloadBtn) {
            elements.downloadBtn.addEventListener('click', async () => {
                if (state.currentView === 'chart') {
                    const filename = `${state.currentExamName}-${state.currentChartType}-Analysis.png`;
                    // Use native Chart.js high-res download for vector-like quality (no text blur)
                    downloadHighResChart(filename);
                } else if (state.currentView === 'table') {
                    if (elements.tableView) {
                        setLoading(true);
                        try {
                            const filename = `${state.currentExamName}-Table-Data.png`;
                            // Use html2canvas to capture the table view
                            const canvas = await html2canvas(elements.tableView, {
                                scale: 4, // Higher resolution
                                backgroundColor: '#ffffff',
                                useCORS: true,
                                logging: false,
                                windowWidth: elements.tableView.scrollWidth, // Capture full width
                                windowHeight: elements.tableView.scrollHeight, // Capture full height
                                onclone: (clonedDoc) => {
                                    const clonedTable = clonedDoc.getElementById('tableView');
                                    if (clonedTable) {
                                        clonedTable.classList.add('capturing-mode');
                                        clonedTable.style.overflow = 'visible'; // Ensure no scrollbars
                                        clonedTable.style.maxHeight = 'none';
                                    }
                                }
                            });

                            const link = document.createElement('a');
                            link.download = filename;
                            link.href = canvas.toDataURL('image/png');
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);

                            showNotification('টেবিল ডাউনলোড সম্পন্ন!');
                        } catch (error) {
                            console.error('Table download error:', error);
                            showNotification('ডাউনলোড করতে সমস্যা হয়েছে', 'error');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            });
        }

        // Failed Students Section Download
        if (elements.downloadFailedBtn) {
            elements.downloadFailedBtn.addEventListener('click', async () => {
                const container = document.getElementById('failedStudentsContainer').parentElement;
                if (!container) return;
                setLoading(true);
                try {
                    const canvas = await html2canvas(container, {
                        scale: 3,
                        backgroundColor: '#ffffff',
                        useCORS: true,
                        onclone: (clonedDoc) => {
                            const cloned = clonedDoc.querySelector('.failed-students');
                            if (cloned) cloned.classList.add('capturing-mode');
                        }
                    });
                    const link = document.createElement('a');
                    link.download = `Failed_Students_${state.currentExamName || 'Report'}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    showNotification('ফেল করা শিক্ষার্থীর তালিকা ডাউনলোড হয়েছে!');
                } catch (err) {
                    console.error(err);
                    showNotification('ডাউনলোড করতে সমস্যা হয়েছে', 'error');
                } finally {
                    setLoading(false);
                }
            });
        }

        // Group Statistics Section Download
        if (elements.downloadGroupStatsBtn) {
            elements.downloadGroupStatsBtn.addEventListener('click', async () => {
                const container = document.getElementById('groupStatsContainer').parentElement;
                if (!container) return;
                setLoading(true);
                try {
                    const canvas = await html2canvas(container, {
                        scale: 3,
                        backgroundColor: '#ffffff',
                        useCORS: true,
                        onclone: (clonedDoc) => {
                            const cards = clonedDoc.querySelectorAll('.card');
                            const cloned = Array.from(cards).find(c => c.contains(clonedDoc.getElementById('groupStatsContainer')));
                            if (cloned) cloned.classList.add('capturing-mode');
                        }
                    });
                    const link = document.createElement('a');
                    link.download = `Group_Statistics_${state.currentExamName || 'Report'}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    showNotification('গ্রুপ পরিসংখ্যান ডাউনলোড হয়েছে!');
                } catch (err) {
                    console.error(err);
                    showNotification('ডাউনলোড করতে সমস্যা হয়েছে', 'error');
                } finally {
                    setLoading(false);
                }
            });
        }

        // Resize handler
        window.addEventListener('resize', () => {
            if (state.currentView === 'chart') {
                updateViews();
            }
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (state.unsubscribe) {
                state.unsubscribe();
            }
        });

        // Keyboard arrow keys for inline search navigation
        document.addEventListener('keydown', (e) => {
            // Only when inline search panel is visible and no input is focused
            const activeTag = document.activeElement?.tagName?.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
            if (!elements.inlineSearchPanel || elements.inlineSearchPanel.style.display === 'none') return;

            if (e.key === 'ArrowLeft' && state.inlinePrevStudent) {
                e.preventDefault();
                showInlineHistory(state.inlinePrevStudent);
            } else if (e.key === 'ArrowRight' && state.inlineNextStudent) {
                e.preventDefault();
                showInlineHistory(state.inlineNextStudent);
            }
        });

        // Initialize Exam Management
        try {
            initExamManagement();
            console.log('Exam management initialized');
        } catch (e) {
            console.error('Error in initExamManagement:', e);
        }

        // Toolbar User Management Button Listener
        if (elements.toolbarUserMgmtBtn) {
            elements.toolbarUserMgmtBtn.addEventListener('click', () => {
                if (elements.userManagementModal) {
                    elements.userManagementModal.style.display = 'block';
                    fetchAndRenderUsers();
                }
            });
        }
    }
}

/**
 * Initialize application
 */
async function init() {

    // Initialize DOM elements
    initElements();

    // Setup User Management Listeners
    if (typeof setupUserManagementListeners === 'function') {
        setupUserManagementListeners();
    }

    // Show loading state
    setLoading(true);

    try {
        // Load theme preference (async now)
        const theme = await loadThemePreference();
        applyTheme(theme === 'dark', elements.themeToggle);

        // Load data from Firestore/storage
        const savedData = await loadDataFromStorage();
        if (savedData && savedData.length > 0) {
            state.studentData = savedData;
            // showNotification('ডেটা Firebase থেকে লোড করা হয়েছে');
        } else {
            state.studentData = [];
            // showNotification('কোনো ডেটা নেই');
        }

        // Subscribe to real-time updates
        state.unsubscribe = subscribeToDataUpdates(onDataUpdate);

        // Initialize event listeners
        initEventListeners();

        // Initialize Subject Configs
        initSubjectConfigs();
        initSubjectConfigUI();

        // Initial render
        updateViews();

    } catch (error) {
        console.error('অ্যাপ্লিকেশন শুরু করতে সমস্যা:', error);
        showNotification('অ্যাপ্লিকেশন শুরু করতে সমস্যা হয়েছে');

        // Fallback: try to load from localStorage
        const localData = localStorage.getItem('studentPerformanceData');
        if (localData) {
            state.studentData = JSON.parse(localData);
        } else {
            state.studentData = getDefaultData();
        }

        initEventListeners();
        updateViews();
    } finally {
        setLoading(false);
    }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ==========================================
// EXAM MANAGEMENT LOGIC
// ==========================================

/**
 * Open Save Exam Modal
 */
function openSaveModal() {
    console.log('Opening Save Modal...');
    const modal = document.getElementById('saveExamModal');
    if (modal) {
        modal.style.display = 'block';
        // Pre-fill exam name
        const date = new Date();
        const dateStr = date.toLocaleDateString('bn-BD');
        const nameInput = document.getElementById('examName');
        if (nameInput) {
            nameInput.value = `পরীক্ষা - ${dateStr}`;
        }
    } else {
        console.error('Save Modal not found!');
    }
}

// Expose to window for HTML onclick
// Expose to window for HTML onclick
window.openSaveModal = openSaveModal;

/**
 * Setup Realtime Search
 */
function setupRealtimeSearch() {
    if (!elements.searchInput) return;

    // Remove existing listener by cloning (keeps the clean slate approach intact)
    const newSearchInput = elements.searchInput.cloneNode(true);
    elements.searchInput.parentNode.replaceChild(newSearchInput, elements.searchInput);
    elements.searchInput = newSearchInput;

    elements.searchInput.addEventListener('input', (e) => {
        const raw = e.target.value;
        state.currentSearchTerm = raw.toLowerCase();
        updateViews();

        // Debounced inline search for Firestore
        clearTimeout(state.inlineSearchDebounce);
        const query = raw.trim();
        if (!query) {
            hideInlineSearch();
            return;
        }
        state.inlineSearchDebounce = setTimeout(() => {
            handleRealtimeSearch(query);
        }, 300);
    });
}

/**
 * Initialize Exam Management Event Listeners
 */
async function initExamManagement() { // Made async
    // We utilize window.openSaveModal now via HTML onclick for reliability
    // But keep listener as backup
    if (elements.saveAnalysisBtn) {
        elements.saveAnalysisBtn.addEventListener('click', openSaveModal);
    }

    if (elements.closeModalBtn) {
        elements.closeModalBtn.addEventListener('click', () => {
            elements.saveExamModal.style.display = 'none';
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === elements.saveExamModal) {
            elements.saveExamModal.style.display = 'none';
        }
        if (e.target === elements.editExamModal) {
            elements.editExamModal.style.display = 'none';
        }
        if (e.target === elements.confirmModal) {
            elements.confirmModal.style.display = 'none';
        }
    });

    if (elements.saveExamForm) {
        elements.saveExamForm.addEventListener('submit', handleSaveExam);
    }

    // ===== ADMIN AUTH =====
    // Listen for auth state changes
    // Listen for auth state changes
    onAuthChange(async (user) => {
        state.currentUser = user;

        if (user) {
            // Fetch Role
            const role = await syncUserRole(user);
            state.userRole = role;
            state.isAdmin = (role === 'admin' || role === 'super_admin');
            state.isSuperAdmin = (role === 'super_admin');
            console.log(`User logged in: ${user.email} (${role})`);

            // Show toolbar User Management if Super Admin
            if (elements.toolbarUserMgmtBtn) {
                elements.toolbarUserMgmtBtn.style.display = state.isSuperAdmin ? 'inline-flex' : 'none';
            }
        } else {
            state.userRole = 'guest';
            state.isAdmin = false;
            state.isSuperAdmin = false;

            // Hide toolbar User Management if logged out
            if (elements.toolbarUserMgmtBtn) {
                elements.toolbarUserMgmtBtn.style.display = 'none';
            }
        }

        const btn = elements.adminToggle;
        if (btn) {
            if (user) {
                btn.classList.add('logged-in');
                const roleLabel = state.isSuperAdmin ? ' (Super Admin)' : (state.isAdmin ? ' (Admin)' : '');
                btn.innerHTML = `<i class="fas fa-lock-open"></i> <span class="dm-btn-text">${user.displayName || 'User'}${roleLabel}</span>`;
                btn.title = 'প্রোফাইল/ড্যাশবোর্ড দেখতে ক্লিক করুন';

                // Update Profile Modal Content
                if (elements.userName) elements.userName.innerText = user.displayName || 'User';
                if (elements.userEmail) elements.userEmail.innerText = `${user.email} [${state.userRole.toUpperCase()}]`;
                if (elements.userPhoto) {
                    elements.userPhoto.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=random`;
                }
            } else {
                btn.classList.remove('logged-in');
                btn.innerHTML = '<i class="fab fa-google"></i> <span class="dm-btn-text">লগইন</span>';
                btn.title = 'গুগল দিয়ে লগইন';
            }
        }
        renderSavedExamsList();
    });

    // Admin toggle button — Google popup login / Open Profile Modal
    if (elements.adminToggle) {
        elements.adminToggle.addEventListener('click', async () => {
            if (state.currentUser) {
                // Open Profile Modal for any logged in user
                if (elements.profileModal) {
                    elements.profileModal.style.display = 'block';
                }
            } else {
                const result = await loginWithGoogle();
                if (result.success) {
                    showNotification(`স্বাগতম, ${result.user.displayName || 'ব্যবহারকারী'}! 🎉`);
                } else if (result.error !== 'auth/popup-closed-by-user') {
                    showNotification('লগইন ব্যর্থ! আবার চেষ্টা করুন।', 'error');
                }
            }
        });
    }

    // Modal Logout Button
    if (elements.modalLogoutBtn) {
        elements.modalLogoutBtn.addEventListener('click', async () => {
            if (elements.profileModal) elements.profileModal.style.display = 'none';
            await logoutAdmin();
            showNotification('লগআউট সফল!');
        });
    }

    // Close Profile Modal (X and Button)
    const closeProfile = () => {
        if (elements.profileModal) elements.profileModal.style.display = 'none';
    };

    if (elements.closeProfileBtn) {
        elements.closeProfileBtn.addEventListener('click', closeProfile);
    }
    if (elements.closeProfileIcon) {
        elements.closeProfileIcon.addEventListener('click', closeProfile);
    }

    // Close edit modal
    if (elements.closeEditModal) {
        elements.closeEditModal.addEventListener('click', () => {
            elements.editExamModal.style.display = 'none';
        });
    }

    // Edit form submit
    if (elements.editExamForm) {
        elements.editExamForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const docId = elements.editExamDocId.value;
            const name = elements.editExamName.value.trim();
            const subject = elements.editSubjectName.value.trim();
            const className = elements.editExamClass ? elements.editExamClass.value : null;
            const session = elements.editExamSession ? elements.editExamSession.value.trim() : null;

            if (!docId || !name || !subject) return;

            setLoading(true);
            try {
                const success = await updateExam(docId, {
                    name,
                    subject,
                    class: className,
                    session
                });
                if (success) {
                    showNotification('পরীক্ষার তথ্য আপডেট সফল!');
                    elements.editExamModal.style.display = 'none';
                    fetchAndRenderSavedExams();
                } else {
                    showNotification('আপডেট করতে সমস্যা হয়েছে', 'error');
                }
            } catch (error) {
                console.error('Edit exam error:', error);
                showNotification('ত্রুটি: ' + error.message, 'error');
            } finally {
                setLoading(false);
            }
        });
    }

    // Initial load of saved exams
    await fetchAndRenderSavedExams();

    // Subscribe to global settings (Default Exam)
    subscribeToSettings((settings) => {
        if (settings && settings.defaultExamId) {
            state.defaultExamId = settings.defaultExamId;
            renderSavedExamsList(); // Re-render to update highlights
        } else if (settings && !settings.defaultExamId) {
            state.defaultExamId = null; // Clear if default is removed
            renderSavedExamsList();
        }
    });

    // Check for default exam on startup
    const settings = await getSettings();
    if (settings && settings.defaultExamId) {
        state.defaultExamId = settings.defaultExamId;
        console.log('Found default exam ID:', state.defaultExamId);
    }

    checkAndLoadDefaultExam();

    setupRealtimeSearch();
    // Initialize Collapsible Section
    initCollapsibleSavedExams();
}

/**
 * Initialize Collapsible Saved Exams Logic
 */
function initCollapsibleSavedExams() {
    if (!elements.savedExamsToggle || !elements.savedExamsCollapse || !elements.savedExamsIcon) return;

    // Load initial state
    const isCollapsed = localStorage.getItem('savedExamsCollapsed') === 'true';
    if (isCollapsed) {
        elements.savedExamsCollapse.classList.add('collapsed');
        elements.savedExamsIcon.classList.add('rotate-180');
    }

    elements.savedExamsToggle.addEventListener('click', () => {
        const collapsing = elements.savedExamsCollapse.classList.toggle('collapsed');
        elements.savedExamsIcon.classList.toggle('rotate-180');

        // Save preference
        localStorage.setItem('savedExamsCollapsed', collapsing);
    });
}

/**
 * Handle Save Exam Form Submission
 */
async function handleSaveExam(e) {
    e.preventDefault();

    if (state.studentData.length === 0) {
        showNotification('সংরক্ষণ করার মতো কোনো ডেটা নেই!', 'error');
        return;
    }

    // Enforce Login
    if (!state.currentUser) {
        const confirmed = await showConfirm(
            'আপনি নিজের এক্সাম ডাটা সংরক্ষণ ও এনাইলাইসিস করতে হলে গুগল দিয়ে লগইন করুন।',
            { confirmText: '<i class="fab fa-google"></i> লগইন করুন', title: 'লগইন প্রয়োজন', confirmClass: 'btn-primary' }
        );
        if (confirmed) {
            const result = await loginWithGoogle();
            if (result.success) {
                showNotification(`স্বাগতম, ${result.user.displayName}! এবার সেভ করুন।`);
            }
        }
        return;
    }

    const name = document.getElementById('examName').value;
    const subject = document.getElementById('examSubject').value;
    const className = document.getElementById('examClass').value;
    const session = document.getElementById('examSession').value;

    setLoading(true);
    try {
        const stats = calculateStatistics(state.studentData);
        const examData = {
            name,
            subject,
            class: className,
            session,
            studentCount: state.studentData.length,
            studentData: state.studentData,
            stats,
            createdBy: state.currentUser.uid,
            creatorName: state.currentUser.displayName
        };

        const success = await saveExam(examData);
        if (success) {
            showNotification('পরীক্ষার ফলাফল সফলভাবে সংরক্ষণ করা হয়েছে!');
            elements.saveExamModal.style.display = 'none';
            elements.saveExamForm.reset();
            // Reset date to current year if needed, but placeholder is fine
            fetchAndRenderSavedExams(); // Refresh list
        } else {
            showNotification('সংরক্ষণ করতে সমস্যা হয়েছে', 'error');
        }
    } catch (error) {
        console.error('Exam save error:', error);
        showNotification('ত্রুটি: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
}

/**
 * Render Saved Exams List
 */
/**
 * Fetch and Render Saved Exams
 */
async function fetchAndRenderSavedExams() {
    if (!elements.savedExamsList) return;

    // Use localized loading
    setLoading(true, elements.savedExamsList);

    try {
        const exams = await getSavedExams();
        state.savedExams = exams;
        renderSavedExamsList();
    } catch (error) {
        console.error('Error fetching saved exams:', error);
        elements.savedExamsList.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 10px;">ডেটা লোড করতে সমস্যা হয়েছে।</div>';
    } finally {
        setLoading(false, elements.savedExamsList);
    }
}

/**
 * Render Saved Exams List
 */
function renderSavedExamsList() {
    if (!elements.savedExamsList) return;
    elements.savedExamsList.innerHTML = '';

    const exams = state.savedExams || [];
    if (exams.length === 0) {
        elements.savedExamsList.innerHTML = '<div style="text-align: center; color: var(--text-color); opacity: 0.6; padding: 10px; width: 100%;">কোন সংরক্ষিত ফলাফল পাওয়া যায়নি।</div>';
        if (elements.savedExamsPagination) elements.savedExamsPagination.innerHTML = '';
        return;
    }

    // Pagination Calculations
    const totalExams = exams.length;
    const totalPages = Math.ceil(totalExams / state.savedExamsPerPage);

    // Safety check for current page
    if (state.savedExamsCurrentPage > totalPages) state.savedExamsCurrentPage = totalPages;
    if (state.savedExamsCurrentPage < 1) state.savedExamsCurrentPage = 1;

    const startIndex = (state.savedExamsCurrentPage - 1) * state.savedExamsPerPage;
    const endIndex = startIndex + state.savedExamsPerPage;
    const currentExams = exams.slice(startIndex, endIndex);

    // Helper for subject styles
    const getSubjectStyle = (subject = '') => {
        subject = subject.toLowerCase();
        const style = {
            background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
            color: 'var(--text-color)',
            border: '1px solid var(--border-color)',
            iconColor: 'var(--primary)',
            shadow: 'var(--card-shadow)'
        };

        if (subject.includes('bangla') || subject.includes('বাংলা')) {
            style.background = 'linear-gradient(135deg, #ee5253 0%, #ff6b6b 100%)';
            style.color = '#fff';
            style.border = 'none';
            style.iconColor = '#fff';
            style.shadow = '0 4px 15px rgba(238, 82, 83, 0.4)';
        } else if (subject.includes('english') || subject.includes('ইংরেজি')) {
            style.background = 'linear-gradient(135deg, #4834d4 0%, #686de0 100%)';
            style.color = '#fff';
            style.border = 'none';
            style.iconColor = '#fff';
            style.shadow = '0 4px 15px rgba(104, 109, 224, 0.4)';
        } else if (subject.includes('ict') || subject.includes('তথ্য')) {
            style.background = 'linear-gradient(135deg, #0984e3 0%, #74b9ff 100%)';
            style.color = '#fff';
            style.border = 'none';
            style.iconColor = '#fff';
            style.shadow = '0 4px 15px rgba(9, 132, 227, 0.4)';
        } else if (subject.includes('math') || subject.includes('গণিত')) {
            style.background = 'linear-gradient(135deg, #00b894 0%, #55efc4 100%)';
            style.color = '#fff';
            style.border = 'none';
            style.iconColor = '#fff';
            style.shadow = '0 4px 15px rgba(0, 184, 148, 0.4)';
        } else if (subject.includes('physics') || subject.includes('পদার্থ')) {
            style.background = 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)';
            style.color = '#fff';
            style.border = 'none';
            style.iconColor = '#fff';
            style.shadow = '0 4px 15px rgba(108, 92, 231, 0.4)';
        } else if (subject.includes('chemistry') || subject.includes('রসায়ন')) {
            style.background = 'linear-gradient(135deg, #e17055 0%, #fab1a0 100%)';
            style.color = '#fff';
            style.border = 'none';
            style.iconColor = '#fff';
            style.shadow = '0 4px 15px rgba(225, 112, 85, 0.4)';
        } else if (subject.includes('biology') || subject.includes('জীব')) {
            style.background = 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)';
            style.color = '#fff';
            style.border = 'none';
            style.iconColor = '#fff';
            style.shadow = '0 4px 15px rgba(39, 174, 96, 0.4)';
        } else if (subject.includes('islam') || subject.includes('ইসলাম')) {
            style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
            style.color = '#fff';
            style.border = 'none';
            style.iconColor = '#fff';
            style.shadow = '0 4px 15px rgba(39, 174, 96, 0.4)';
        }

        return style;
    };

    // Helper for class badge color
    const getClassBadgeColor = (cls) => {
        if (!cls) return '#95a5a6'; // Gray
        if (cls == '6') return '#e67e22'; // Orange
        if (cls == '7') return '#27ae60'; // Green
        if (cls == '8') return '#2980b9'; // Blue
        if (cls == '9') return '#8e44ad'; // Purple
        if (cls == '10') return '#c0392b'; // Red
        if (cls == 'SSC') return '#d35400'; // Dark Orange
        if (cls == 'HSC') return '#16a085'; // Teal
        return '#34495e'; // Dark Blue
    };

    currentExams.forEach(exam => {
        const date = exam.createdAt?.toDate ? exam.createdAt.toDate().toLocaleDateString('bn-BD') : '';
        const theme = getSubjectStyle(exam.subject);
        const isDefault = state.defaultExamId === exam.docId;
        const classColor = getClassBadgeColor(exam.class);

        const card = document.createElement('div');
        card.className = 'exam-card';
        card.style.cssText = `
            border: ${theme.border};
            border-radius: 12px;
            padding: 10px 16px;
            background: ${theme.background};
            box-shadow: ${theme.shadow};
            color: ${theme.color};
            transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
            position: relative;
            overflow: hidden;
            min-height: 125px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        `;

        if (isDefault) {
            card.classList.add('default-exam-card');
        }

        const isGradient = theme.background.includes('gradient');

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; margin-bottom: 4px; position: relative; z-index: 1;">
                <div title="${exam.name}" style="font-weight: 700; font-size: 0.88em; word-break: break-word; line-height: 1.3;">
                    ${exam.name}
                </div>
                <!-- Class removed from here -->
            </div>
            
            <div style="margin-bottom: 8px; position: relative; z-index: 1;">
                 <span title="${exam.subject}" style="background: rgba(255,255,255,0.95); color: #2d3436; padding: 3px 10px; border-radius: 5px; font-weight: 700; font-size: 0.82em; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: inline-block; word-break: break-word; margin-top: 3px;">
                    ${exam.subject}
                 </span>
            </div>

            <div style="font-size: 0.75em; opacity: 0.85; margin-bottom: 5px; position: relative; z-index: 1;">
                <i class="far fa-calendar-alt"></i> ${date} &nbsp;|&nbsp; 
                <i class="fas fa-user-graduate"></i> ${exam.studentCount}
            </div>

            <div style="margin-bottom: 8px; position: relative; z-index: 1; display: flex; gap: 5px; flex-wrap: wrap;">
                ${exam.class ? `<span style="background: ${classColor}; color: white; padding: 2px 10px; border-radius: 12px; font-weight: 700; font-size: 0.75em; box-shadow: 0 1px 3px rgba(0,0,0,0.15);">${exam.class}</span>` : ''}
                ${exam.session ? `
                <span style="background: #2d3436; color: #f1c40f; padding: 2px 10px; border-radius: 12px; font-size: 0.75em; font-weight: bold; box-shadow: 0 1px 3px rgba(0,0,0,0.15); border: 1px solid #f1c40f;">
                    ${exam.session}
                </span>` : ''}
            </div>
            <div style="display: flex; gap: 6px; position: relative; z-index: 1;">
                <button class="load-exam-btn" style="flex: 1; background: rgba(255,255,255,0.25); color: inherit; border: 1px solid rgba(255,255,255,0.4); padding: 5px 8px; border-radius: 5px; cursor: pointer; backdrop-filter: blur(2px); font-weight: 500; font-size: 0.8em;">
                    <i class="fas fa-upload"></i> লোড
                </button>
                ${state.currentUser ? `
                <div style="display: flex; gap: 4px;">
                    <button class="edit-exam-btn" style="background: rgba(255,165,0,0.25); color: inherit; border: 1px solid rgba(255,165,0,0.4); padding: 5px 8px; border-radius: 5px; cursor: pointer; backdrop-filter: blur(2px); font-size: 0.8em;" title="সম্পাদনা">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-exam-btn" style="background: rgba(255,0,0,0.2); color: inherit; border: 1px solid rgba(255,0,0,0.3); padding: 5px 8px; border-radius: 5px; cursor: pointer; backdrop-filter: blur(2px); font-size: 0.8em;" title="মুছুন">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="set-default-exam-btn" style="background: ${isDefault ? 'var(--primary)' : 'rgba(0,128,0,0.2)'}; color: ${isDefault ? '#fff' : 'inherit'}; border: 1px solid ${isDefault ? 'var(--primary)' : 'rgba(0,128,0,0.3)'}; padding: 5px 8px; border-radius: 5px; cursor: pointer; backdrop-filter: blur(2px); font-size: 0.8em;" title="${isDefault ? 'ডিফল্ট সেট করা আছে' : 'ডিফল্ট সেট করুন'}">
                        <i class="fas fa-thumbtack"></i>
                    </button>
                </div>
                ` : `<span style="font-size: 0.7em; opacity: 0.6; align-self: center;">READ ONLY</span>`}
            </div>
        `;

        // Hover effect helper
        card.onmouseenter = () => {
            card.style.transform = 'translateY(-2px)';
            if (!isGradient && !isDefault) card.style.boxShadow = 'var(--shadow)';
        };
        card.onmouseleave = () => {
            card.style.transform = 'translateY(0)';
            if (!isGradient && !isDefault) card.style.boxShadow = theme.shadow;
        };

        // Load Event — stopPropagation prevents card-level bubbling
        card.querySelector('.load-exam-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleLoadExam(exam);
        });

        // RBAC Permissions
        const isCreator = (state.currentUser && exam.createdBy === state.currentUser.uid);
        const canEdit = state.isSuperAdmin || state.isAdmin || isCreator;
        const canDelete = state.isSuperAdmin || isCreator; // Admin requires Super Admin to delete others, or be creator
        const canSetDefault = state.isSuperAdmin;

        // Edit & Delete events
        if (state.currentUser) {
            const editBtn = card.querySelector('.edit-exam-btn');
            if (editBtn) {
                // Only show if permitted, else remove/hide
                if (canEdit) {
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleEditExam(exam);
                    });
                } else {
                    editBtn.style.display = 'none';
                }
            }

            const deleteBtn = card.querySelector('.delete-exam-btn');
            if (deleteBtn) {
                if (canDelete) {
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const confirmed = await showConfirm(`আপনি কি নিশ্চিত যে "${exam.name}" মুছে ফেলতে চান ? `);
                        if (confirmed) {
                            await deleteExam(exam.docId);
                            await fetchAndRenderSavedExams();
                        }
                    });
                } else {
                    deleteBtn.style.display = 'none';
                }
            }

            const setDefaultBtn = card.querySelector('.set-default-exam-btn');
            if (setDefaultBtn) {
                if (canSetDefault) {
                    setDefaultBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (isDefault) {
                            const confirmed = await showConfirm(`আপনি কি "${exam.name}" কে ডিফল্ট থেকে সরাতে চান ? `, { confirmText: '<i class="fas fa-times"></i> হ্যাঁ, সরান', title: 'ডিফল্ট সরান', confirmClass: 'btn-warning' });
                            if (confirmed) {
                                await updateSettings({ defaultExamId: null });
                                showNotification('ডিফল্ট পরীক্ষা সরানো হয়েছে!');
                            }
                        } else {
                            const confirmed = await showConfirm(`আপনি কি "${exam.name}" কে ডিফল্ট পরীক্ষা হিসেবে সেট করতে চান ? `, { confirmText: '<i class="fas fa-check"></i> হ্যাঁ, সেট করুন', title: 'ডিফল্ট সেট করুন', confirmClass: 'btn-success' });
                            if (confirmed) {
                                setLoading(true);
                                const success = await updateSettings({ defaultExamId: exam.docId });
                                if (success) {
                                    state.defaultExamId = exam.docId;
                                    showNotification('ডিফল্ট এক্সাম সেট করা হয়েছে এবং ডেটা লোড হচ্ছে... ⏳');
                                    renderSavedExamsList();
                                    await autoLoadExam(exam);
                                } else {
                                    setLoading(false);
                                    showNotification('ডিফল্ট সেট করতে সমস্যা হয়েছে', 'error');
                                }
                            }
                        }
                    });
                } else {
                    setDefaultBtn.style.display = 'none';
                }
            }
        }

        elements.savedExamsList.appendChild(card);
    });

    // Render Pagination
    renderSavedExamsPagination(totalPages);
}

/**
 * Render Saved Exams Pagination
 */
function renderSavedExamsPagination(totalPages) {
    if (!elements.savedExamsPagination) return;
    elements.savedExamsPagination.innerHTML = '';

    if (totalPages <= 1) return;

    // Previous Button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.disabled = state.savedExamsCurrentPage === 1;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.onclick = () => {
        state.savedExamsCurrentPage--;
        renderSavedExamsList();
    };
    elements.savedExamsPagination.appendChild(prevBtn);

    // Page Numbers
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination - btn ${state.savedExamsCurrentPage === i ? 'active' : ''}`;
        pageBtn.innerText = i;
        pageBtn.onclick = () => {
            state.savedExamsCurrentPage = i;
            renderSavedExamsList();
        };
        elements.savedExamsPagination.appendChild(pageBtn);
    }

    // Next Button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.disabled = state.savedExamsCurrentPage === totalPages;
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.onclick = () => {
        state.savedExamsCurrentPage++;
        renderSavedExamsList();
    };
    elements.savedExamsPagination.appendChild(nextBtn);
}

/**
 * Check and Load Default Exam
 */
async function checkAndLoadDefaultExam() {
    const settings = await getSettings();
    if (settings && settings.defaultExamId) {
        import('./js/firestoreService.js').then(async (module) => {
            const exams = await module.getSavedExams();
            const defaultExam = exams.find(e => e.docId === settings.defaultExamId);

            if (defaultExam) {
                console.log('Auto-loading default exam:', defaultExam.name);
                autoLoadExam(defaultExam);
            }
        });
    }
}

/**
 * Auto Load Exam (No Confirmation)
 */
async function autoLoadExam(exam) {
    if (!exam) return;

    // Normalize data to handle potential legacy structures
    const studentData = exam.studentData || exam.students;
    const examName = exam.name || exam.examName || state.currentExamName;
    const subject = exam.subject || state.currentSubject;

    if (!studentData || !Array.isArray(studentData)) {
        console.error('Auto load failed: Invalid student data', exam);
        showNotification('ডিফল্ট এক্সামের ডেটা সঠিক নয় বা পাওয়া যায়নি!', 'error');
        return;
    }

    setLoading(true);
    try {
        const success = await bulkImportStudents(studentData);
        if (success) {
            state.studentData = studentData;
            state.currentExamName = examName;
            state.currentSubject = subject;
            localStorage.setItem('currentSubject', subject);
            updateViews();
            showNotification(`ডিফল্ট: "${examName}" লোড হয়েছে`);
        } else {
            showNotification('ডিফল্ট ডেটা লোড করতে ব্যর্থ!', 'error');
        }
    } catch (error) {
        console.error('Auto load error:', error);
        showNotification('অটো লোড এরর: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
}

/**
 * Handle Load Exam
 */
async function handleLoadExam(exam) {
    const examName = exam.name || exam.examName || 'Exam';
    const confirmed = await showConfirm(
        `সতর্কতা: বর্তমান ডেটা "${examName}" এর ডেটা দ্বারা প্রতিস্থাপিত হবে। আপনি কি নিশ্চিত ? `,
        { confirmText: '<i class="fas fa-download"></i> হ্যাঁ, লোড করুন', title: 'ডেটা লোড করুন', confirmClass: 'btn-success' }
    );
    if (!confirmed) {
        return;
    }

    const studentData = exam.studentData || exam.students;
    const subject = exam.subject || 'Subject';

    if (!studentData || !Array.isArray(studentData)) {
        showNotification('এক্সামের ডেটা সঠিক পাওয়া যায়নি!', 'error');
        return;
    }

    setLoading(true);
    try {
        const success = await bulkImportStudents(studentData);
        if (success) {
            state.studentData = studentData;
            state.currentExamName = examName;
            state.currentSubject = subject;
            localStorage.setItem('currentSubject', subject);
            updateViews();
            showNotification(`"${examName}" ডেটা সফলভাবে লোড হয়েছে!`);

            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            showNotification('ডেটা লোড করতে সমস্যা হয়েছে', 'error');
        }
    } catch (error) {
        console.error('Load exam error:', error);
        showNotification('ত্রুটি: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
}

/**
 * Open Edit Exam Modal with pre-filled data
 */
function handleEditExam(exam) {
    if (elements.editExamDocId) elements.editExamDocId.value = exam.docId;
    if (elements.editExamName) elements.editExamName.value = exam.name || exam.examName || ''; // Try both properties

    // Class First
    const className = exam.class || '';
    if (elements.editExamClass) elements.editExamClass.value = className;

    // Populate Subject Dropdown based on Class
    if (elements.editSubjectName && className) {
        updateExamSubjectDropdown(className, elements.editSubjectName);
    }

    // Set Subject Value (Must be after population)
    if (elements.editSubjectName) elements.editSubjectName.value = exam.subject || '';

    if (elements.editExamSession) elements.editExamSession.value = exam.session || '';
    if (elements.editExamModal) elements.editExamModal.style.display = 'block';
}

/**
 * Custom Beautiful Confirm Dialog
 * @param {string} message - The message to display
 * @param {Object} [options] - Optional config
 * @param {string} [options.confirmText] - Custom confirm button text
 * @param {string} [options.title] - Custom modal title
 * @param {string} [options.confirmClass] - Custom CSS class for the confirm button
 */
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        if (!elements.confirmModal) return resolve(false);

        if (elements.confirmMessage) {
            elements.confirmMessage.innerText = message;
        }

        // Set dynamic title
        const titleEl = document.getElementById('confirmTitle');
        if (titleEl) {
            titleEl.innerText = options.title || 'নিশ্চিত করুন';
        }

        // Set dynamic confirm button text and style
        if (elements.confirmDeleteBtn) {
            elements.confirmDeleteBtn.innerHTML = options.confirmText || '<i class="fas fa-trash"></i> হ্যাঁ, মুছে ফেলুন';
            elements.confirmDeleteBtn.className = options.confirmClass || 'btn-danger';
        }

        elements.confirmModal.style.display = 'block';

        const handleConfirm = () => {
            elements.confirmModal.style.display = 'none';
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            elements.confirmModal.style.display = 'none';
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            elements.confirmDeleteBtn.removeEventListener('click', handleConfirm);
            elements.confirmCancelBtn.removeEventListener('click', handleCancel);
        };

        elements.confirmDeleteBtn.addEventListener('click', handleConfirm);
        elements.confirmCancelBtn.addEventListener('click', handleCancel);
    });
}

// ==========================================
// STUDENT ANALYSIS LOGIC
// ==========================================

/**
 * Handle Analysis Search
 */
async function handleAnalysisSearch() {
    const query = elements.analysisStudentId.value.trim();
    if (!query) {
        return;
    }

    // Hide previous results/charts
    if (elements.analysisSearchResults) elements.analysisSearchResults.style.display = 'block'; // Show container for loader
    const reportContent = document.getElementById('analysisReportContent');
    if (reportContent) reportContent.style.display = 'none';

    if (elements.studentDetails) elements.studentDetails.innerHTML = '';

    // Localized loading
    setLoading(true, elements.analysisSearchResults);

    // Clear chart
    if (state.historyChartInstance) {
        state.historyChartInstance.destroy();
        state.historyChartInstance = null;
    }

    try {
        const candidates = await searchAnalyticsCandidates(query);

        if (candidates.length === 0) {
            showNotification('কোনো শিক্ষার্থী পাওয়া যায়নি', 'warning');
            elements.analysisSearchResults.style.display = 'none';
        } else if (candidates.length === 1) {
            elements.analysisSearchResults.style.display = 'none';
            selectStudentForAnalysis(candidates[0]);
        } else {
            // Multiple candidates
            renderAnalysisCandidates(candidates);
        }
    } catch (error) {
        console.error('Search error:', error);
        showNotification('খুঁজতে সমস্যা হয়েছে', 'error');
        elements.analysisSearchResults.style.display = 'none';
    } finally {
        setLoading(false, elements.analysisSearchResults);
    }
}

/**
 * Render Search Candidates
 */
function renderAnalysisCandidates(candidates) {
    const container = elements.analysisSearchResults;
    if (!container) return;

    container.innerHTML = '';
    container.style.display = 'grid'; // Grid layout (handled by class, but display toggled here)
    // Actually, I should toggle the container visibility elsewhere, but setting display grid here overrides 'none'
    // Better to just set it to grid.

    candidates.forEach(student => {
        const div = document.createElement('div');
        div.className = 'candidate-card';
        // Removed inline styles to rely on CSS

        div.innerHTML = `
        <div style="font-weight: bold; color: var(--heading-color);">${student.name}</div>
            <div style="color: var(--text-color); opacity: 0.8; font-size: 0.9em;">
                রোল: ${student.id} | গ্রুপ: ${student.group}
            </div>
            <div style="font-size: 0.8em; color: var(--text-color); opacity: 0.6;">শ্রেণি: ${student.class}</div>
        `;

        // Hover handled by CSS
        div.addEventListener('click', () => {
            container.style.display = 'none'; // Hide results after selection
            selectStudentForAnalysis(student);
        });

        container.appendChild(div);
    });

    showNotification(`${candidates.length} জন শিক্ষার্থী পাওয়া গেছে, একজনকে সিলেক্ট করুন`);
}

/**
 * Select Student and Load History
 */
async function selectStudentForAnalysis(student) {
    state.currentAnalysisStudent = student;

    // Use studentDetails container for loading
    setLoading(true, elements.studentDetails);

    try {
        const history = await getStudentHistory(student.id, student.group);
        state.currentHistory = history;

        if (history.length === 0) {
            showNotification('এই শিক্ষার্থীর পরীক্ষার ইতিহাস পাওয়া যায়নি', 'warning');
        } else {
            // updateAnalysisChart(); // Moved inside renderAnalysisDetails to handle subject logic
            renderAnalysisDetails(student, history);

            // Show Report Content
            const reportContent = document.getElementById('analysisReportContent');
            if (reportContent) reportContent.style.display = 'block';

            // showNotification('ডেটা লোড হয়েছে'); // Removed as per user request to rely on spinner
        }
    } catch (error) {
        console.error(error);
        showNotification('ডেটা লোড করতে সমস্যা', 'error');
    } finally {
        setLoading(false, elements.studentDetails);
    }
}

/**
 * Switch to Analysis view and load a specific student
 */
function activateAnalysisView(student) {
    if (!student) return;

    // Switch state
    state.currentView = 'analysis';

    // Update tabs
    if (elements.viewButtons) {
        elements.viewButtons.forEach(btn => {
            if (btn.getAttribute('data-view') === 'analysis') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Toggle view visibility
    toggleView();

    // Load student data
    selectStudentForAnalysis(student);
}

/**
 * Update Chart based on controls
 */
/**
 * Update Chart based on controls
 */

// Add this to init() function later
function initSubjectConfigs() {
    // Only subscribe if user is logged in? Actually subject configs might be public if we want defaults? 
    // But usually configs are global settings. Let's assume public read for now or handled by security rules.
    subscribeToSubjectConfigs((configs) => {
        state.subjectConfigs = configs;

        // Always render config list if modal is open
        if (document.getElementById('subjectSettingsModal').style.display === 'flex') {
            renderSavedConfigsList();
        }

        // If analysis view is active, update specific chart
        if (state.currentView === 'analysis') {
            updateAnalysisChart();
        } else {
            // Otherwise update main dashboard
            updateViews();
        }
    });
}
// Trigger initSubjectConfigs in init()
// For now, let's inject the logic here or ensure it's called.
// Since I can't easily inject into init() without viewing it again, 
// I'll make updateAnalysisChart robust enough to default if config is missing, 
// and add the subscription to the bottom of the file or via a separate injection.

/**
 * Update Chart based on controls
 */
function updateAnalysisChart(subjectOverride = null) {
    if (!state.currentHistory || state.currentHistory.length === 0) return;

    const chartType = elements.analysisType ? elements.analysisType.value : 'total';
    // Default max marks from dropdown (user manual override)
    let maxMarks = elements.analysisMaxMarks ? parseInt(elements.analysisMaxMarks.value) : 100;
    let passMark = 33; // Default Total Pass

    // Determine Subject
    // Priority: Argument > Dropdown > LocalStorage > Default
    let subject = subjectOverride;
    if (!subject) {
        const dropdown = document.getElementById('analysisSubjectSelect');
        if (dropdown) subject = dropdown.value;
        else subject = localStorage.getItem('selectedAnalysisSubject');
    }

    // Determine Filtered History
    let filteredHistory = state.currentHistory;
    const sessionDropdown = document.getElementById('analysisSessionSelect');
    let selectedSession = sessionDropdown ? sessionDropdown.value : localStorage.getItem('selectedAnalysisSession');

    if (selectedSession && selectedSession !== 'all') {
        filteredHistory = filteredHistory.filter(h => h.session === selectedSession);
    }

    if (subject && subject !== 'all') {
        filteredHistory = filteredHistory.filter(h => h.subject === subject);

        // --- Subject Scaling Logic ---
        // 1. Check if we have a config for this specific subject
        const normalizedSubject = subject.trim();

        // Determine class and session context for config lookup
        let currentClass = state.currentAnalysisStudent ? state.currentAnalysisStudent.class : null;
        let currentSession = state.currentAnalysisStudent ? state.currentAnalysisStudent.session : null;

        // detailed history items usually have class, but let's rely on student current class or history tail
        if (filteredHistory && filteredHistory.length > 0) {
            const latest = filteredHistory[filteredHistory.length - 1];
            if (latest.class) currentClass = latest.class;
            if (latest.session) currentSession = latest.session;
        }

        // Use Saved Config OR Default
        const config = getSubjectConfig(normalizedSubject, currentClass, currentSession);

        // 2. Determine Max Marks & Pass Marks based on type and config
        if (config) {
            if (chartType === 'total') {
                maxMarks = parseInt(config.total) || 100;
                // Total Pass Mark isn't explicitly in config usually, but could be derived?
                // User didn't ask for Total Pass Config, but said "Total Marks 100".
                // Defaulting to 33% of Total or standard 33.
                passMark = Math.ceil(maxMarks * 0.33);
            }
            else if (chartType === 'written') {
                maxMarks = parseInt(config.written) || 50;
                passMark = parseInt(config.writtenPass) || 17;
            }
            else if (chartType === 'mcq') {
                maxMarks = parseInt(config.mcq) || 25;
                passMark = parseInt(config.mcqPass) || 8;
            }
            else if (chartType === 'practical') {
                maxMarks = parseInt(config.practical) || 25;
                passMark = parseInt(config.practicalPass) || 8; // Optional
            }

            // Sync Dropdown
            if (elements.analysisMaxMarks) {
                elements.analysisMaxMarks.value = maxMarks;
            }
        }
    }

    // Destroy previous
    if (state.historyChartInstance) {
        state.historyChartInstance.destroy();
        state.historyChartInstance = null;
    }

    const chart = createHistoryChart(elements.historyChart, filteredHistory, {
        chartType,
        maxMarks,
        passMark // Pass the calculated pass mark
    });
    state.historyChartInstance = chart;
}

/**
 * Render Student Details
 */
function renderAnalysisDetails(student, history) {
    const latest = history[history.length - 1];

    // Helper for Group Priority
    const getGroupPriority = (group) => {
        if (!group) return 99;
        const g = group.toLowerCase().trim();
        if (g.includes('বিজ্ঞান')) return 1;
        if (g.includes('ব্যবসা')) return 2;
        if (g.includes('মানবিক')) return 3;
        return 99;
    };

    // Get unique sessions
    const sessions = [...new Set(history.map(h => h.session))].filter(Boolean).sort();

    // Restore saved session or default to student's current session or latest found
    let selectedSession = localStorage.getItem('selectedAnalysisSession');
    if (!sessions.includes(selectedSession)) {
        selectedSession = student.session && sessions.includes(student.session) ? student.session : (sessions[sessions.length - 1] || '');
    }

    // Filter history by selected session to get relevant subjects
    // If "all" or specific session is selected
    let sessionFilteredHistory = history;
    if (selectedSession && selectedSession !== 'all') {
        sessionFilteredHistory = history.filter(h => h.session === selectedSession);
    }

    // Get unique subjects largely based on the *selected session* context
    const subjects = [...new Set(sessionFilteredHistory.map(h => h.subject))].filter(Boolean);

    // Restore saved subject from localStorage or default to first
    let selectedSubject = localStorage.getItem('selectedAnalysisSubject');
    if (!subjects.includes(selectedSubject) && subjects.length > 0) {
        selectedSubject = subjects[0];
    }

    // Navigation Logic: Sort by Group Priority then ID (Roll)
    const sortedStudents = [...state.studentData].sort((a, b) => {
        // 1. Group Sort
        const priorityA = getGroupPriority(a.group);
        const priorityB = getGroupPriority(b.group);

        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        // 2. Roll Sort (within same group)
        return (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
    });
    // Find index using strictly matching ID and Group to avoid duplicates across groups
    const currentIndex = sortedStudents.findIndex(s => s.id == student.id && s.group === student.group);
    const prevStudent = currentIndex > 0 ? sortedStudents[currentIndex - 1] : null;
    const nextStudent = currentIndex < sortedStudents.length - 1 ? sortedStudents[currentIndex + 1] : null;

    // Update global navigation state for keyboard shortcuts
    state.currentAnalysisPrevStudent = prevStudent;
    state.currentAnalysisNextStudent = nextStudent;

    // Determine group badge class
    let groupBadgeClass = 'badge-default';
    if (student.group.includes('বিজ্ঞান')) groupBadgeClass = 'badge-science';
    else if (student.group.includes('ব্যবসায়')) groupBadgeClass = 'badge-business';
    else if (student.group.includes('মানবিক')) groupBadgeClass = 'badge-humanities';

    elements.studentDetails.innerHTML = `
    <div class="analysis-details-card">
    <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 10px;">
        <div>
            <h3 style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                ${student.name}
                <span style="font-size: 0.8em; opacity: 0.8; font-weight: normal;">(রোল: ${student.id})</span>
            </h3>

            <div class="analysis-info-row">
                <span class="group-badge ${groupBadgeClass}">
                    ${student.group.includes('বিজ্ঞান') ? '<i class="fas fa-flask"></i>' :
            student.group.includes('ব্যবসায়') ? '<i class="fas fa-chart-line"></i>' :
                student.group.includes('মানবিক') ? '<i class="fas fa-palette"></i>' :
                    '<i class="fas fa-users"></i>'}
                    &nbsp;${student.group}
                </span>

                <div class="analysis-info-item">
                    <i class="fas fa-layer-group" style="color: var(--secondary);"></i>
                    <strong>শ্রেণি:</strong> ${student.class}
                </div>

                <div class="analysis-info-item">
                    <i class="fas fa-clipboard-list" style="color: var(--primary);"></i>
                    <strong>মোট পরীক্ষা:</strong> ${history.length}
                </div>
            </div>
        </div>
        <div style="text-align: right;">
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 5px; flex-wrap: wrap;">
                
                <!-- Session Select Dropdown -->
                <div class="session-select-wrapper" style="margin-right: 5px;">
                    <select id="analysisSessionSelect" class="form-select" style="padding: 4px 8px; font-size: 0.9em; border-radius: 4px;" title="সেশন নির্বাচন করুন">
                        <option value="all">সকল সেশন</option>
                        ${sessions.map(s => `<option value="${s}" ${s === selectedSession ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>

                <!-- Subject Select Dropdown -->
                <div class="subject-select-wrapper" style="margin-right: 5px;">
                    <select id="analysisSubjectSelect" class="form-select" style="padding: 4px 8px; font-size: 0.9em; border-radius: 4px;" title="বিষয় নির্বাচন করুন">
                        <option value="all">সকল বিষয়</option>
                        ${subjects.map(sub => `<option value="${sub}" ${sub === selectedSubject ? 'selected' : ''}>${sub}</option>`).join('')}
                    </select>
                </div>

                <button id="downloadAnalysisBtn" title="ফলাফল ইমেজ হিসেবে ডাউনলোড করুন" style="padding: 4px 10px; font-size: 0.85em; cursor: pointer; border: none; background: var(--primary); color: white; border-radius: 4px; display: flex; align-items: center; gap: 5px; transition: all 0.2s; margin-right: 5px;">
                    <i class="fas fa-file-image"></i> ফলাফল ডাউনলোড (Image)
                </button>
                ${prevStudent ? `
                            <button id="prevStudentBtn" class="nav-btn" title="পূর্ববর্তী শিক্ষার্থী (রোল: ${prevStudent.id})" style="padding: 4px 10px; font-size: 0.85em; cursor: pointer; border: 1px solid var(--border-color); background: var(--card-bg); border-radius: 4px; color: var(--text-color); display: flex; align-items: center; gap: 5px; transition: all 0.2s;">
                                <i class="fas fa-chevron-left"></i> ${prevStudent.id}
                            </button>
                        ` : ''}
                ${nextStudent ? `
                            <button id="nextStudentBtn" class="nav-btn" title="পরবর্তী শিক্ষার্থী (রোল: ${nextStudent.id})" style="padding: 4px 10px; font-size: 0.85em; cursor: pointer; border: 1px solid var(--border-color); background: var(--card-bg); border-radius: 4px; color: var(--text-color); display: flex; align-items: center; gap: 5px; transition: all 0.2s;">
                                ${nextStudent.id} <i class="fas fa-chevron-right"></i>
                            </button>
                        ` : ''}
                <div style="font-size: 0.9em; opacity: 0.8; margin-left: 8px; border-left: 1px solid var(--border-color); padding-left: 10px;">
                    সর্বশেষ: ${latest.examName}
                </div>
            </div>
        </div>
    </div>
        </div >
        `;

    // Attach Event Listeners
    const downloadBtn = document.getElementById('downloadAnalysisBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadAnalysisReport);
    }
    if (prevStudent) {
        document.getElementById('prevStudentBtn').addEventListener('click', () => selectStudentForAnalysis(prevStudent));
    }
    if (nextStudent) {
        document.getElementById('nextStudentBtn').addEventListener('click', () => selectStudentForAnalysis(nextStudent));
    }

    // Attach Session Change Listener
    const sessionSelect = document.getElementById('analysisSessionSelect');
    if (sessionSelect) {
        sessionSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            localStorage.setItem('selectedAnalysisSession', val);
            // Re-render details to update subjects list based on new session
            renderAnalysisDetails(student, history);
            // Note: renderAnalysisDetails calls updateAnalysisChart internally via its initial call logic logic or we might need to trigger it?
            // Actually renderAnalysisDetails reconstructs the DOM so we just need to call it.
            // But wait, renderAnalysisDetails re-renders the dropdowns, so we lose focus?
            // Better to just update chart OR re-render entire view. Re-rendering view is safer to sync subjects.
        });
    }

    // Attach Subject Change Listener
    const subjectSelect = document.getElementById('analysisSubjectSelect');
    if (subjectSelect) {
        subjectSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            localStorage.setItem('selectedAnalysisSubject', val);
            updateAnalysisChart(val);
        });
    }

    // Initial Chart Render with Selected Subject & Session
    updateAnalysisChart(selectedSubject);
}

/**
 * Download Analysis Report as Image
 */
async function downloadAnalysisReport() {
    const reportContent = document.getElementById('analysisReportContent');
    if (!reportContent) return;

    setLoading(true);
    try {
        // Get current theme colors
        const style = getComputedStyle(document.body);
        const bgColor = style.getPropertyValue('--bg-color').trim() || '#ffffff';
        const textColor = style.getPropertyValue('--text-color').trim() || '#000000';

        const canvas = await html2canvas(reportContent, {
            scale: 3, // Increased quality (High DPI)
            useCORS: true,
            backgroundColor: '#ffffff', // Force white background for clean exports
            ignoreElements: (element) => element.id === 'downloadAnalysisBtn',
            logging: false,
            onclone: (clonedDoc) => {
                const clonedReport = clonedDoc.getElementById('analysisReportContent');
                if (clonedReport) {
                    clonedReport.classList.add('capturing-mode');
                    // Force white background for report captures to ensure contrast
                    clonedReport.style.backgroundColor = '#ffffff';
                }
            }
        });

        const image = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = image;
        link.download = `Analysis_${state.currentAnalysisStudent?.id || 'Report'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('রিপোর্ট ইমেজ ডাউনলোড সম্পন্ন! 📸');
    } catch (error) {
        console.error('Download error:', error);
        showNotification('ডাউনলোড করতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false);
    }
}

// ==========================================
// INLINE REAL-TIME SEARCH LOGIC
// ==========================================

/**
 * Handle real-time search from toolbar input
 */
async function handleRealtimeSearch(query) {
    if (elements.inlineSearchPanel) elements.inlineSearchPanel.style.display = 'block';

    // Localized loading for search panel
    setLoading(true, elements.inlineSearchCandidates);

    try {
        const candidates = await searchAnalyticsCandidates(query);

        if (candidates.length === 0) {
            // Show "No results found" instead of hiding
            if (elements.inlineSearchCandidates) {
                elements.inlineSearchCandidates.style.display = 'block';
                elements.inlineSearchCandidates.innerHTML = `<div class="inline-search-loading" style="color: var(--text-color); opacity: 0.7;">কোনো ফলাফল পাওয়া যায়নি: "<strong>${query}</strong>"</div>`;
            }
            if (elements.inlineHistorySection) elements.inlineHistorySection.style.display = 'none';
            return;
        }

        // Show panel
        if (elements.inlineSearchPanel) {
            elements.inlineSearchPanel.style.display = 'block';
        }

        if (candidates.length === 1) {
            // Single match → auto-select
            if (elements.inlineSearchCandidates) elements.inlineSearchCandidates.style.display = 'none';
            showInlineHistory(candidates[0]);
        } else {
            // Multiple matches → show candidate cards
            if (elements.inlineHistorySection) elements.inlineHistorySection.style.display = 'none';
            renderInlineCandidates(candidates);
        }
    } catch (error) {
        console.error('Inline search error:', error);
    } finally {
        setLoading(false, elements.inlineSearchCandidates);
    }
}

/**
 * Render candidate cards in the inline panel
 */
function renderInlineCandidates(candidates) {
    const container = elements.inlineSearchCandidates;
    if (!container) return;

    container.innerHTML = '';
    container.style.display = 'grid';

    candidates.forEach(student => {
        const card = document.createElement('div');
        card.className = 'inline-candidate-card';
        card.innerHTML = `
    <div class="ic-name">${student.name}</div>
            <div class="ic-info">রোল: ${student.id} | গ্রুপ: ${student.group}</div>
            <div class="ic-class">শ্রেণি: ${student.class || '—'}</div>
        `;
        card.addEventListener('click', () => {
            container.style.display = 'none';
            showInlineHistory(student);
        });
        container.appendChild(card);
    });
}

/**
 * Load and display student history in the inline panel
 */
async function showInlineHistory(student) {
    state.inlineSearchStudent = student;

    // Blur search input so keyboard arrow keys work for navigation
    if (elements.searchInput) elements.searchInput.blur();

    if (elements.inlineHistorySection) elements.inlineHistorySection.style.display = 'block';

    // Show loading
    if (elements.inlineStudentDetails) {
        elements.inlineStudentDetails.innerHTML = `<div class="inline-search-loading"><i class="fas fa-spinner fa-spin"></i> লোড হচ্ছে...</div>`;
    }

    try {
        const history = await getStudentHistory(student.id, student.group);

        // Inline Search also needs full history to allow session switching
        state.inlineSearchHistory = history;

        if (state.inlineSearchHistory.length === 0) {
            if (elements.inlineStudentDetails) {
                elements.inlineStudentDetails.innerHTML = `
    <div class="analysis-details-card">
                        <h3>${student.name} (রোল: ${student.id})</h3>
                        <p>গ্রুপ: ${student.group}</p>
                        <p style="color: #e74c3c; margin-top: 8px;">কোনো পরীক্ষার ইতিহাস পাওয়া যায়নি</p>
                    </div >
        `;
            }
            return;
        }

        // Get unique sessions
        const sessions = [...new Set(history.map(h => h.session))].filter(Boolean).sort();

        // Restore saved session
        let selectedSession = localStorage.getItem('selectedAnalysisSession');
        if (!sessions.includes(selectedSession)) {
            selectedSession = student.session && sessions.includes(student.session) ? student.session : (sessions[sessions.length - 1] || '');
        }

        // Filter history by selected session
        let sessionFilteredHistory = history;
        if (selectedSession && selectedSession !== 'all') {
            sessionFilteredHistory = history.filter(h => h.session === selectedSession);
        }

        // Get unique subjects
        const subjects = [...new Set(sessionFilteredHistory.map(h => h.subject))].filter(Boolean);

        // Restore saved subject from localStorage or default to first
        let selectedSubject = localStorage.getItem('selectedAnalysisSubject');
        if (!subjects.includes(selectedSubject) && subjects.length > 0) {
            selectedSubject = subjects[0];
        }

        // Render details
        const latest = history[history.length - 1];

        // Navigation: sort by group priority then roll (group sequence: বিজ্ঞান → ব্যবসায় → মানবিক)
        const getGroupPriority = (group) => {
            if (!group) return 99;
            const g = group.toLowerCase().trim();
            if (g.includes('বিজ্ঞান')) return 1;
            if (g.includes('ব্যবসা')) return 2;
            if (g.includes('মানবিক')) return 3;
            return 99;
        };
        const sortedStudents = [...state.studentData].sort((a, b) => {
            const pA = getGroupPriority(a.group);
            const pB = getGroupPriority(b.group);
            if (pA !== pB) return pA - pB;
            return (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
        });
        const currentIdx = sortedStudents.findIndex(s => s.id == student.id && s.group === student.group);
        const prevStudent = currentIdx > 0 ? sortedStudents[currentIdx - 1] : null;
        const nextStudent = currentIdx < sortedStudents.length - 1 ? sortedStudents[currentIdx + 1] : null;

        if (elements.inlineStudentDetails) {
            // Group badge color helper
            const getGroupBadge = (group) => {
                if (!group) return `<span class="group-badge group-badge-default">${group || '—'}</span>`;
                const g = group.toLowerCase().trim();
                if (g.includes('বিজ্ঞান')) return `<span class="group-badge group-badge-science"><i class="fas fa-flask"></i> ${group}</span>`;
                if (g.includes('ব্যবসা')) return `<span class="group-badge group-badge-business"><i class="fas fa-book"></i> ${group}</span>`;
                if (g.includes('মানবিক')) return `<span class="group-badge group-badge-arts"><i class="fas fa-palette"></i> ${group}</span>`;
                return `<span class="group-badge group-badge-default">${group}</span>`;
            };

            elements.inlineStudentDetails.innerHTML = `
    <div class="analysis-details-card">
        <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 8px;">
            <div>
                <h3>${student.name} (রোল: ${student.id})</h3>
                <p style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">${getGroupBadge(student.group)} <strong>শ্রেণি:</strong> ${student.class || '—'}</p>
                <p><strong>মোট পরীক্ষা:</strong> ${history.length}</p>
            </div>
            <div style="text-align: right;">
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 5px; flex-wrap: wrap;">
                    ${prevStudent ? `
                                    <button id="inlinePrevBtn" class="inline-nav-btn" title="পূর্ববর্তী রোল: ${prevStudent.id} (${prevStudent.name})">
                                        <i class="fas fa-chevron-left"></i> ${prevStudent.id}
                                    </button>
                                ` : ''}
                    ${nextStudent ? `
                                    <button id="inlineNextBtn" class="inline-nav-btn" title="পরবর্তী রোল: ${nextStudent.id} (${nextStudent.name})">
                                        ${nextStudent.id} <i class="fas fa-chevron-right"></i>
                                    </button>
                                ` : ''}
                    <div style="font-size: 0.85em; opacity: 0.7; border-left: 1px solid var(--border-color); padding-left: 10px;">সর্বশেষ: ${latest.examName}</div>
                    
                     <!-- Session Select Dropdown -->
                    <div class="session-select-wrapper" style="margin-left: 10px;">
                        <select id="inlineSessionSelect" class="form-select" style="padding: 2px 6px; font-size: 0.85em; border-radius: 4px;">
                            <option value="all">সকল সেশন</option>
                            ${sessions.map(s => `<option value="${s}" ${s === selectedSession ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>

                     <!-- Subject Select Dropdown -->
                    <div class="subject-select-wrapper" style="margin-left: 5px;">
                        <select id="inlineSubjectSelect" class="form-select" style="padding: 2px 6px; font-size: 0.85em; border-radius: 4px;">
                            <option value="all">সকল বিষয়</option>
                            ${subjects.map(sub => `<option value="${sub}" ${sub === selectedSubject ? 'selected' : ''}>${sub}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        </div>
                </div >
    `;

            // Store nav state for keyboard shortcuts
            state.inlinePrevStudent = prevStudent;
            state.inlineNextStudent = nextStudent;

            // Attach navigation event listeners
            if (prevStudent) {
                document.getElementById('inlinePrevBtn').addEventListener('click', () => showInlineHistory(prevStudent));
            }
            if (nextStudent) {
                document.getElementById('inlineNextBtn').addEventListener('click', () => showInlineHistory(nextStudent));
            }

            // Attach Session Change Listener
            const sessionSelect = document.getElementById('inlineSessionSelect');
            if (sessionSelect) {
                sessionSelect.addEventListener('change', (e) => {
                    const val = e.target.value;
                    localStorage.setItem('selectedAnalysisSession', val);
                    showInlineHistory(student); // Re-render to update subjects
                });
            }

            // Attach Subject Change Listener
            const subjectSelect = document.getElementById('inlineSubjectSelect');
            if (subjectSelect) {
                subjectSelect.addEventListener('change', (e) => {
                    const val = e.target.value;
                    localStorage.setItem('selectedAnalysisSubject', val);
                    updateInlineChart(val);
                });
            }
        }

        // Render chart
        updateInlineChart(selectedSubject);

    } catch (error) {
        console.error('Inline history error:', error);
        if (elements.inlineStudentDetails) {
            elements.inlineStudentDetails.innerHTML = `
    <div class="analysis-details-card">
        <p style="color: #e74c3c;">ডেটা লোড করতে সমস্যা হয়েছে</p>
                </div >
    `;
        }
    }
}

/**
 * Hide inline search panel and reset state
 */
function hideInlineSearch() {
    if (elements.inlineSearchPanel) elements.inlineSearchPanel.style.display = 'none';
    if (elements.inlineSearchCandidates) {
        elements.inlineSearchCandidates.style.display = 'none';
        elements.inlineSearchCandidates.innerHTML = '';
    }
    if (elements.inlineHistorySection) elements.inlineHistorySection.style.display = 'none';
    if (elements.inlineStudentDetails) elements.inlineStudentDetails.innerHTML = '';

    // Destroy chart
    if (state.inlineHistoryChartInstance) {
        state.inlineHistoryChartInstance.destroy();
        state.inlineHistoryChartInstance = null;
    }
    state.inlineSearchStudent = null;
    state.inlineSearchHistory = [];
    state.inlinePrevStudent = null;
    state.inlineNextStudent = null;
}

/**
 * Update inline history chart based on controls
 */
/**
 * Update inline history chart based on controls and selected subject
 */
function updateInlineChart(subject = null) {
    if (!state.inlineSearchHistory || state.inlineSearchHistory.length === 0) return;

    const chartType = elements.inlineAnalysisType ? elements.inlineAnalysisType.value : 'total';
    const maxMarks = elements.inlineAnalysisMaxMarks ? parseInt(elements.inlineAnalysisMaxMarks.value) : 100;

    // If no subject passed, try to get from dropdown or localStorage
    if (!subject) {
        const dropdown = document.getElementById('inlineSubjectSelect');
        if (dropdown) subject = dropdown.value;
        else subject = localStorage.getItem('selectedAnalysisSubject');
    }

    // Get selected session
    const sessionDropdown = document.getElementById('inlineSessionSelect');
    let selectedSession = sessionDropdown ? sessionDropdown.value : localStorage.getItem('selectedAnalysisSession');

    // Filter history based on selected session and subject
    let filteredHistory = state.inlineSearchHistory;

    // Filter by Session
    if (selectedSession && selectedSession !== 'all') {
        filteredHistory = filteredHistory.filter(h => h.session === selectedSession);
    }

    // Filter by Subject
    if (subject && subject !== 'all') {
        filteredHistory = filteredHistory.filter(h => h.subject === subject);
    }

    // Destroy previous
    if (state.inlineHistoryChartInstance) {
        state.inlineHistoryChartInstance.destroy();
        state.inlineHistoryChartInstance = null;
    }

    const chart = createHistoryChart(elements.inlineHistoryChart, filteredHistory, {
        chartType,
        maxMarks
    });
    state.inlineHistoryChartInstance = chart;
}

/**
 * Download inline report as image
 */
async function downloadInlineReport() {
    const reportContent = document.getElementById('inlineReportContent');
    if (!reportContent) return;

    setLoading(true);
    try {
        const style = getComputedStyle(document.body);
        const bgColor = style.getPropertyValue('--bg-color').trim() || '#ffffff';
        const textColor = style.getPropertyValue('--text-color').trim() || '#000000';

        const canvas = await html2canvas(reportContent, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#ffffff',
            ignoreElements: (el) => el.id === 'inlineDownloadBtn',
            logging: false,
            onclone: (clonedDoc) => {
                const cloned = clonedDoc.getElementById('inlineReportContent');
                if (cloned) {
                    cloned.classList.add('capturing-mode');
                    cloned.style.backgroundColor = '#ffffff';
                }
            }
        });

        const image = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = image;
        link.download = `Inline_Analysis_${state.inlineSearchStudent?.id || 'Report'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('রিপোর্ট ডাউনলোড সম্পন্ন! 📸');
    } catch (error) {
        console.error('Inline download error:', error);
        showNotification('ডাউনলোড করতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false);
    }
}

// ==========================================
// USER MANAGEMENT LOGIC
// ==========================================

/**
 * Load User Management Panel
 */
async function loadUserManagementPanel() {
    if (!state.isSuperAdmin) return;

    // User management is now mainly handled via the toolbar button for better UX.
    // If we still want to keep the profile modal entry as a backup, we can, 
    // but the user requested better placement. 
    // This function can now just open the modal.

    // Direct open call
    if (elements.userManagementModal) {
        elements.userManagementModal.style.display = 'block';
        fetchAndRenderUsers();
    }
}

async function fetchAndRenderUsers() {
    setLoading(true);
    const users = await getAllUsers();
    renderUserTable(users);
    setLoading(false);
}

function renderUserTable(users) {
    if (!elements.userListBody) return;
    elements.userListBody.innerHTML = '';

    // Sort: Super Admin -> Admin -> User
    const roleOrder = { 'super_admin': 0, 'admin': 1, 'user': 2, 'guest': 3 };
    users.sort((a, b) => (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3));

    users.forEach(user => {
        const tr = document.createElement('tr');

        const isMe = (state.currentUser && user.uid === state.currentUser.uid);
        const roleLabel = (user.role || 'guest').toUpperCase().replace('_', ' ');
        const date = user.lastLogin && user.lastLogin.toDate ? user.lastLogin.toDate().toLocaleDateString() : '-';

        let actionBtn = '';
        if (!isMe && user.role !== 'super_admin') {
            if (user.role === 'admin') {
                actionBtn = `<button class="action-btn btn-demote" data-uid="${user.uid}" data-role="user" data-name="${user.displayName || 'User'}">Demote to User</button>`;
            } else {
                actionBtn = `<button class="action-btn btn-promote" data-uid="${user.uid}" data-role="admin" data-name="${user.displayName || 'User'}">Make Admin</button>`;
            }
        } else if (isMe) {
            actionBtn = '<span style="font-size:0.8em; color:gray;">(You)</span>';
        } else if (user.role === 'super_admin') {
            actionBtn = '<span style="font-size:0.8em; color:gray;">(Super Admin)</span>';
        }

        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${user.photoURL || 'https://ui-avatars.com/api/?background=random'}" style="width: 32px; height: 32px; border-radius: 50%;">
                    <div>
                        <div style="font-weight: 600; font-size: 0.9em;">${user.displayName || 'No Name'}</div>
                        <div style="font-size: 0.75em; opacity: 0.7;">Last Login: ${date}</div>
                    </div>
                </div>
            </td>
            <td style="font-size: 0.9em;">${user.email}</td>
            <td><span class="role-badge role-${user.role || 'guest'}">${roleLabel}</span></td>
            <td style="text-align: right;">${actionBtn}</td>
        `;
        elements.userListBody.appendChild(tr);
    });
}

// User Action Handler
async function handleUserAction(uid, newRole, name) {
    const actionText = newRole === 'admin' ? 'অ্যাডমিন বানাতে' : 'সাধারণ ইউজার বানাতে';
    const confirmed = await showConfirm(`আপনি কি নিশ্চিত যে "${name}"-কে ${actionText} চান?`, {
        confirmText: 'হ্যাঁ, পরিবর্তন করুন',
        confirmClass: newRole === 'admin' ? 'btn-promote' : 'btn-demote'
    });

    if (confirmed) {
        setLoading(true);
        const success = await updateUserRole(uid, newRole);
        if (success) {
            showNotification('রোল পরিবর্তন সফল!');
            fetchAndRenderUsers();
        } else {
            showNotification('রোল পরিবর্তন ব্যর্থ!', 'error');
        }
        setLoading(false);
    }
}

// Setup User Management Listeners
function setupUserManagementListeners() {
    if (elements.closeUserManagementBtn) {
        elements.closeUserManagementBtn.addEventListener('click', () => {
            elements.userManagementModal.style.display = 'none';
        });
    }

    if (elements.userListBody) {
        elements.userListBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('action-btn')) {
                const uid = e.target.getAttribute('data-uid');
                const role = e.target.getAttribute('data-role');
                const name = e.target.getAttribute('data-name');
                handleUserAction(uid, role, name);
            }
        });
    }
}

// ==========================================
// SUBJECT CONFIGURATION UI LOGIC
// ==========================================

// Default Protected Subjects (Cannot be deleted)
// Default Protected Subjects (Cannot be deleted)
const PROTECTED_SUBJECTS = [];

// Default Configuration Strategy (Moved to state at top)
// const DEFAULT_SUBJECT_CONFIG = { ... };

// Default Configuration Strategy (Moved to state at top)
// const DEFAULT_SUBJECT_CONFIG = { ... };

/**
 * Initialize Subject Configuration UI (Modern)
 */
function initSubjectConfigUI() {
    // FORCE DARK MODE STYLES (JS Injection to bypass CSS issues)
    const styleId = 'subject-config-dark-mode-fix';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            body.dark-mode #subjectSettingsModal .landscape-modal,
            body.dark-mode .landscape-modal { background-color: #1e1e1e !important; border: 1px solid #333 !important; color: #e0e0e0 !important; }
            body.dark-mode #subjectSettingsModal .modal-header,
            body.dark-mode .modal-header { background-color: #1e1e1e !important; border-bottom: 1px solid #333 !important; }
            body.dark-mode #subjectSettingsModal .modal-header h2,
            body.dark-mode .modal-header h2 { color: #fff !important; }
            body.dark-mode #subjectSettingsModal .close,
            body.dark-mode .close { color: #fff !important; }
            body.dark-mode #subjectSettingsModal .config-sidebar, 
            body.dark-mode .config-sidebar { background-color: #252525 !important; border-right: 1px solid #333 !important; }
            body.dark-mode #subjectSettingsModal .sidebar-header,
            body.dark-mode .sidebar-header { background-color: #252525 !important; }
            body.dark-mode #subjectSettingsModal .sidebar-header h4,
            body.dark-mode .sidebar-header h4 { color: #fff !important; }
            body.dark-mode #subjectSettingsModal .sidebar-footer,
            body.dark-mode .sidebar-footer { background-color: #252525 !important; border-top: 1px solid #333 !important; }
            body.dark-mode #subjectSettingsModal .config-list-container .config-item,
            body.dark-mode .config-list-container .config-item { color: #aaa !important; }
            body.dark-mode #subjectSettingsModal .config-list-container .config-item:hover,
            body.dark-mode .config-list-container .config-item:hover { background-color: #333 !important; color: #fff !important; }
            body.dark-mode #subjectSettingsModal .config-list-container .config-item.active,
            body.dark-mode .config-list-container .config-item.active { background-color: rgba(67, 97, 238, 0.2) !important; color: #fff !important; border: 1px solid #4361ee !important; }
            body.dark-mode #subjectSettingsModal .config-main, 
            body.dark-mode .config-main { background-color: #1e1e1e !important; }
            body.dark-mode #subjectSettingsModal .form-header h3,
            body.dark-mode .form-header h3 { color: #fff !important; }
            body.dark-mode #subjectSettingsModal .form-header p,
            body.dark-mode .form-header p { color: #bbb !important; }
            body.dark-mode #subjectSettingsModal .mark-group,
            body.dark-mode .mark-group { background-color: #2d2d2d !important; border: 1px solid #444 !important; }
            body.dark-mode #subjectSettingsModal .mark-group label, 
            body.dark-mode .mark-group label { color: #8cb4ff !important; }
            body.dark-mode #subjectSettingsModal .input-row input,
            body.dark-mode .input-row input { background-color: #121212 !important; color: #fff !important; border: 1px solid #444 !important; }
            body.dark-mode #subjectSettingsModal .total-group,
            body.dark-mode .total-group { background-color: rgba(67, 97, 238, 0.1) !important; border: 1px solid rgba(67, 97, 238, 0.3) !important; }
            body.dark-mode #subjectSettingsModal .total-group input,
            body.dark-mode .total-group input { background-color: #121212 !important; color: #fff !important; border: 1px solid #444 !important; }
            body.dark-mode #subjectSettingsModal .form-actions,
            body.dark-mode .form-actions { background-color: #1e1e1e !important; border-top: 1px solid #333 !important; }
        `;
        document.head.appendChild(style);
    }

    const subjectSettingsBtn = document.getElementById('subjectSettingsBtn');
    const modal = document.getElementById('subjectSettingsModal');
    const closeBtn = document.getElementById('closeSubjectSettingsBtn');
    const saveBtn = document.getElementById('saveSubjectConfigBtn');
    const deleteBtn = document.getElementById('deleteSubjectBtn');
    const addNewBtn = document.getElementById('addNewSubjectBtn');
    const searchInput = document.getElementById('subjectSearch');
    const subjectNameInput = document.getElementById('configSubjectName');
    const formTitle = document.getElementById('formTitle');

    // Config Inputs
    const inputs = {
        total: document.getElementById('configTotalMax'),
        written: document.getElementById('configWrittenMax'),
        writtenPass: document.getElementById('configWrittenPass'),
        mcq: document.getElementById('configMcqMax'),
        mcqPass: document.getElementById('configMcqPass'),
        practical: document.getElementById('configPracticalMax'),
        practicalPass: document.getElementById('configPracticalPass'),
        practicalOptional: document.getElementById('configPracticalOptional')
    };

    const totalPreview = document.getElementById('calcTotalPreview');

    // Helper: Auto Calculate Total
    const calculateTotal = () => {
        const w = parseInt(inputs.written.value) || 0;
        const m = parseInt(inputs.mcq.value) || 0;
        const p = parseInt(inputs.practical.value) || 0;
        const total = w + m + p;
        if (totalPreview) totalPreview.innerText = `গণনা: ${total}`;
        return total;
    };

    // Attach listeners for auto-calculation
    ['written', 'mcq', 'practical'].forEach(key => {
        if (inputs[key]) inputs[key].addEventListener('input', calculateTotal);
    });

    // Reset Form
    const resetForm = () => {
        subjectNameInput.value = '';
        subjectNameInput.disabled = false;
        formTitle.innerText = 'নতুন কনফিগারেশন';
        deleteBtn.style.display = 'none'; // Hide delete for new

        Object.values(inputs).forEach(input => {
            if (input.type === 'checkbox') input.checked = false;
            else input.value = '';
        });
        if (totalPreview) totalPreview.innerText = 'গণনা: 0';

        // Deselect list items
        document.querySelectorAll('.config-item').forEach(el => el.classList.remove('active'));
        state.editingSubjectKey = null; // Reset editing key
    };

    // Expose globally for other functions
    window.resetSubjectConfigForm = resetForm;

    if (subjectSettingsBtn && modal) {
        subjectSettingsBtn.addEventListener('click', () => {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden'; // Lock Body Scroll
            resetForm();
            renderSavedConfigsList();
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.style.overflow = ''; // Unlock Body Scroll
        });
    }

    if (addNewBtn) {
        addNewBtn.addEventListener('click', resetForm);
    }

    // Search Filter
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderSavedConfigsList(e.target.value);
        });
    }

    // Close on click outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = ''; // Unlock Body Scroll
        }
    });

    // Save Config
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const subject = subjectNameInput.value.trim();
            if (!subject) {
                showNotification('বিষয়ের নাম লিখুন!', 'warning');
                return;
            }

            const calcTotal = calculateTotal();
            const setTotal = parseInt(inputs.total.value) || 100;

            if (calcTotal > 100) {
                showNotification('সর্বমোট মার্ক ১০০ এর বেশি হতে পারে না!', 'error');
                return;
            }

            const config = {
                total: setTotal.toString(),
                written: inputs.written.value.trim() || '0',
                writtenPass: inputs.writtenPass.value.trim() || '0',
                mcq: inputs.mcq.value.trim() || '0',
                mcqPass: inputs.mcqPass.value.trim() || '0',
                practical: inputs.practical.value.trim() || '0',
                practicalPass: inputs.practicalPass.value.trim() || '0',
                practicalOptional: inputs.practicalOptional.checked
            };

            setLoading(true);
            try {
                const success = await saveSubjectConfig(subject, config);
                if (success) {
                    // Smart Migration: If editing a different key (e.g. "English (HSC)" -> "English"), delete the old one
                    if (state.editingSubjectKey && state.editingSubjectKey !== subject) {
                        console.log(`Migrating config: ${state.editingSubjectKey} -> ${subject}`);
                        await deleteSubjectConfig(state.editingSubjectKey);
                    }

                    showNotification(`${subject} কনফিগারেশন সেভ হয়েছে!`);
                    resetForm(); // Reset form and key
                    renderSavedConfigsList(searchInput ? searchInput.value : '');
                } else {
                    showNotification('সেভ করতে সমস্যা হয়েছে', 'error');
                }
            } catch (error) {
                console.error(error);
                showNotification('ত্রুটি: ' + error.message, 'error');
            } finally {
                setLoading(false);
            }
        });
    }

    // Delete Config
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const subject = subjectNameInput.value.trim();
            if (!subject) return;

            // Protection Check
            if (PROTECTED_SUBJECTS.includes(subject)) {
                showNotification(`'${subject}' একটি সংরক্ষিত বিষয়। এটি ডিলিট করা যাবে না।`, 'warning');
                return;
            }

            if (!confirm(`আপনি কি নিশ্চিত যে '${subject}' এর কনফিগারেশন ডিলিট করতে চান?`)) {
                return;
            }

            setLoading(true);
            try {
                const success = await deleteSubjectConfig(subject);
                if (success) {
                    showNotification(`${subject} কনফিগারেশন ডিলিট হয়েছে।`);
                    // Reset to Default or Remove
                    // If subject exists in exam data, it will reappear as Auto-detected (Default)
                    resetForm();
                    renderSavedConfigsList(searchInput ? searchInput.value : '');
                } else {
                    showNotification('ডিলিট করতে সমস্যা হয়েছে', 'error');
                }
            } catch (error) {
                console.error(error);
                showNotification('ত্রুটি: ' + error.message, 'error');
            } finally {
                setLoading(false);
            }
        });
    }
}

/**
 * Render Saved Configs List (Modern)
 * merges saved configs with auto-discovered subjects from studentData
 */
function renderSavedConfigsList(filterText = '') {
    const container = document.getElementById('savedConfigsList');
    const countBadge = document.getElementById('subjectCount');
    if (!container) return;

    // 1. Get Saved Subjects
    const savedSubjects = Object.keys(state.subjectConfigs).filter(key => key !== 'updatedAt');

    // 2. Discover Subjects from current Exam Data
    const discoveredSubjects = new Set();
    if (state.studentData && state.studentData.length > 0) {
        state.studentData.forEach(s => {
            if (s.subject) {
                // Generate key with Class only (Ignore Session)
                let key = s.subject;
                if (s.class) {
                    key = `${s.subject} (${s.class})`;
                }
                discoveredSubjects.add(key);
            }
        });
    }

    // 3. Discover Subjects from Saved Exams
    const savedExamsSubjects = new Set();
    if (state.savedExams && state.savedExams.length > 0) {
        state.savedExams.forEach(exam => {
            if (exam.subject) {
                // Generate key with Class only (Ignore Session)
                let key = exam.subject;
                if (exam.class) {
                    key = `${exam.subject} (${exam.class})`;
                }
                savedExamsSubjects.add(key);
            }
        });
    }

    // 4. Merge Unique
    // Note: savedSubjects already contains keys. If migrated, they might be just "Bangla".
    // If new, they will be "Bangla (10)".
    const allSubjects = new Set([...savedSubjects, ...discoveredSubjects, ...savedExamsSubjects]);
    let sortedSubjects = Array.from(allSubjects).sort();

    if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        sortedSubjects = sortedSubjects.filter(sub => sub.toLowerCase().includes(lowerFilter));
    }

    if (countBadge) countBadge.innerText = sortedSubjects.length;

    if (sortedSubjects.length === 0) {
        container.innerHTML = '<div style="opacity: 0.6; padding: 15px; text-align: center; font-size: 0.9em;">কোনো বিষয় পাওয়া যায়নি।</div>';
        return;
    }

    container.innerHTML = '';

    sortedSubjects.forEach(sub => {
        // Determine Config: Saved > Default
        const isSaved = state.subjectConfigs.hasOwnProperty(sub);
        const config = isSaved ? state.subjectConfigs[sub] : DEFAULT_SUBJECT_CONFIG;

        // Allowed to delete ANY saved config (Revert to default)
        const canDelete = isSaved;

        // Parse Key for Display
        // Key Format: "Subject (Class - Session)" or "Subject (Class)" or "Subject"
        let displayName = sub;
        let displayMeta = '';

        const match = sub.match(/^(.*?)\s*\((.*?)\)$/);
        if (match) {
            displayName = match[1];
            displayMeta = match[2];
        }

        const item = document.createElement('div');
        item.className = 'config-item fade-in';
        item.style.cssText = `
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 10px; 
            border-bottom: 1px solid var(--border-color);
            background: ${isSaved ? 'var(--bg-secondary)' : 'transparent'};
        `;

        item.innerHTML = `
            <div style="flex: 1; cursor: pointer;">
                <div style="font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    ${displayName}
                    ${displayMeta ? `<span style="background: var(--primary); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7em; font-weight: normal;">${displayMeta}</span>` : ''}
                    ${!isSaved ? '<i class="fas fa-magic" style="font-size: 0.8em; color: var(--info);" title="স্বয়ংক্রিয়ভাবে শনাক্ত করা হয়েছে (ডিফল্ট)"></i>' : ''}
                </div>
                <div style="font-size: 0.8em; opacity: 0.7; margin-top: 4px;">
                    Total: ${config.total} | Wr: ${config.written} (${config.writtenPass || '-'}) | MCQ: ${config.mcq} (${config.mcqPass || '-'})
                </div>
            </div>
            ${canDelete ? `
            <button class="btn-icon delete-config-btn" data-subject="${sub}" title="কনফিগারেশন ডিলিট করুন (ডিফল্টে ফিরুন)">
                <i class="fas fa-trash-alt" style="color: var(--danger);"></i>
            </button>
            ` : ''}
        `;

        // Item Click Handler (Select/Edit)
        item.addEventListener('click', () => {
            // Highlight
            document.querySelectorAll('.config-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            // Populate Form
            // Smart Populate: Strip " (Class)" tag for the input
            let cleanName = sub;
            const nameMatch = sub.match(/^(.*?)\s*\(/);
            if (nameMatch) {
                cleanName = nameMatch[1];
            }

            document.getElementById('formTitle').innerText = `${cleanName} এডিট করছেন`;
            const nameInput = document.getElementById('configSubjectName');
            nameInput.value = cleanName;

            // Set Tracking Key
            state.editingSubjectKey = sub;

            const getVal = (id, val) => document.getElementById(id).value = val || '';

            getVal('configTotalMax', config.total);
            getVal('configWrittenMax', config.written);
            getVal('configWrittenPass', config.writtenPass);
            getVal('configMcqMax', config.mcq);
            getVal('configMcqPass', config.mcqPass);
            getVal('configPracticalMax', config.practical);
            getVal('configPracticalPass', config.practicalPass);
            document.getElementById('configPracticalOptional').checked = config.practicalOptional || false;

            // Trigger Calc
            const total = (parseInt(config.written) || 0) + (parseInt(config.mcq) || 0) + (parseInt(config.practical) || 0);
            const totalPreview = document.getElementById('calcTotalPreview');
            if (totalPreview) totalPreview.innerText = `গণনা: ${total}`;

            // Show/Hide Delete Button
            const deleteBtn = document.getElementById('deleteSubjectBtn');
            if (deleteBtn) {
                if (PROTECTED_SUBJECTS.includes(sub)) {
                    deleteBtn.style.display = 'none';
                } else if (!isSaved) {
                    deleteBtn.style.display = 'none';
                } else {
                    deleteBtn.style.display = 'inline-block';
                    deleteBtn.innerText = 'ডিলিট করুন';
                    deleteBtn.className = 'btn-danger-outline';
                }
            }
        });

        // Attach Event Listener for Delete Button
        const delBtn = item.querySelector('.delete-config-btn');
        if (delBtn) {
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent selecting the item

                // Protection Check
                if (PROTECTED_SUBJECTS.includes(sub)) {
                    showNotification(`'${sub}' একটি সংরক্ষিত বিষয়। এটি ডিলিট করা যাবে না।`, 'warning');
                    return;
                }

                if (!confirm(`আপনি কি নিশ্চিত যে '${sub}' এর কনফিগারেশন ডিলিট করতে চান?`)) {
                    return;
                }

                setLoading(true);
                try {
                    const success = await deleteSubjectConfig(sub);
                    if (success) {
                        showNotification(`${sub} কনফিগারেশন ডিলিট হয়েছে।`);
                        if (window.resetSubjectConfigForm) window.resetSubjectConfigForm();
                        renderSavedConfigsList(searchInput ? searchInput.value : '');
                    } else {
                        showNotification('ডিলিট করতে সমস্যা হয়েছে', 'error');
                    }
                } catch (error) {
                    console.error(error);
                    showNotification('ত্রুটি: ' + error.message, 'error');
                } finally {
                    setLoading(false);
                }
            });
        }

        container.appendChild(item);

    });
}

/**
 * Initialize Class-Subject Mapping UI
 */
function initClassSubjectMappingUI() {
    if (!elements.openClassMappingBtn) return;

    // Open Modal
    elements.openClassMappingBtn.addEventListener('click', () => {
        elements.classSubjectMappingModal.style.display = 'block';
        loadMappingForClass(elements.mappingClassSelect.value); // Load initially selected
    });

    // Close Modal
    elements.closeClassMappingBtn.addEventListener('click', () => {
        elements.classSubjectMappingModal.style.display = 'none';
        state.currentMappingSubjects = []; // Reset temp state
    });

    // Class Select Change (in Mapping Modal)
    elements.mappingClassSelect.addEventListener('change', (e) => {
        loadMappingForClass(e.target.value);
    });

    // Add Subject Button
    elements.addMappingSubjectBtn.addEventListener('click', () => {
        const inputVal = elements.mappingSubjectInput.value;
        if (!inputVal) return;

        // Support Comma Separated Values
        const subjects = inputVal.split(',').map(s => s.trim()).filter(s => s.length > 0);

        subjects.forEach(subject => {
            addSubjectToMappingUI(subject);
        });

        elements.mappingSubjectInput.value = '';
    });

    // Save Mapping Button
    elements.saveMappingBtn.addEventListener('click', async () => {
        const className = elements.mappingClassSelect.value;
        // Get all tags
        const subjects = Array.from(elements.mappingSubjectsContainer.children).map(tag => tag.dataset.subject);

        setLoading(true);
        const success = await saveClassSubjectMapping(className, subjects);
        setLoading(false);

        if (success) {
            showNotification(`ক্লাস ${className} এর বিষয়গুলো সেভ হয়েছে!`);
            elements.classSubjectMappingModal.style.display = 'none';
        } else {
            showNotification('সেভ করতে সমস্যা হয়েছে', 'error');
        }
    });

    // --- Save Exam Modal Logic ---
    if (elements.examClass) {
        elements.examClass.addEventListener('change', (e) => {
            updateExamSubjectDropdown(e.target.value, elements.examSubject);
        });
    }

    // --- Edit Exam Modal Logic ---
    if (elements.editExamClass) {
        elements.editExamClass.addEventListener('change', (e) => {
            updateExamSubjectDropdown(e.target.value, elements.editSubjectName);
        });
    }
}

let tempMappingSubjects = []; // Temp storage for UI

function loadMappingForClass(className) {
    elements.mappingSubjectsContainer.innerHTML = '';
    tempMappingSubjects = [];

    const subjects = state.classSubjectMapping[className] || [];
    subjects.forEach(sub => addSubjectToMappingUI(sub));
}

function addSubjectToMappingUI(subject) {
    // Check dupe
    if (tempMappingSubjects.includes(subject)) return;

    const tag = document.createElement('div');
    tag.className = 'subject-tag';
    // Styles moved to main.css
    tag.dataset.subject = subject;
    tag.innerHTML = `
        <span>${subject}</span>
        <i class="fas fa-times" style="cursor: pointer; color: #ef4444;"></i>
    `;

    tag.querySelector('.fa-times').addEventListener('click', () => {
        tag.remove();
        tempMappingSubjects = tempMappingSubjects.filter(s => s !== subject);
    });

    elements.mappingSubjectsContainer.appendChild(tag);
    tempMappingSubjects.push(subject);
}

function updateExamSubjectDropdown(className, dropdownElement) {
    dropdownElement.innerHTML = '';

    if (!className) {
        dropdownElement.disabled = true;
        const opt = document.createElement('option');
        opt.innerText = 'আগে শ্রেণি সিলেক্ট করুন';
        dropdownElement.appendChild(opt);
        return;
    }

    const subjects = state.classSubjectMapping[className] || [];

    if (subjects.length === 0) {
        dropdownElement.disabled = false;
        const opt = document.createElement('option');
        opt.value = "";
        opt.innerText = "কোন বিষয় পাওয়া যায়নি (ম্যাপিং চেক করুন)";
        dropdownElement.appendChild(opt);
        // Maybe allow custom input if no mapping? 
        // For now strict as requested "Dynamic Subject Mapping"
    } else {
        dropdownElement.disabled = false;
        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.innerText = "বিষয় সিলেক্ট করুন";
        dropdownElement.appendChild(defaultOpt);

        subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.innerText = sub;
            dropdownElement.appendChild(opt);
        });
    }
}

// ==========================================
// APP INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Inject Styles
    injectDefaultCardStyles();
    initSubjectConfigUI(); // Inject Dark Mode Styles

    // 1. Initialize UI Elements
    initElements();
    setupUserManagementListeners();
    initClassSubjectMappingUI();

    // 2. Load Theme
    // 2. Load Theme
    const savedTheme = await loadThemePreference();
    if (savedTheme) {
        applyTheme(savedTheme === 'dark', elements.themeToggle);
        if (elements.themeToggle) {
            elements.themeToggle.checked = savedTheme === 'dark';
            if (elements.themeToggle.nextElementSibling) {
                elements.themeToggle.nextElementSibling.innerHTML = savedTheme === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
            }
        }
    }

    // 3. Load Mappings
    subscribeToClassSubjectMappings((mappings) => {
        state.classSubjectMapping = mappings;
    });

    // 4. Check Auth Status & Initialize Data
    onAuthChange(async (user) => {
        if (user) {
            state.currentUser = user;
            state.isAdmin = false;
            state.isSuperAdmin = false;

            // Sync Role
            const role = await syncUserRole(user);
            state.userRole = role;
            state.isAdmin = ['admin', 'super_admin'].includes(role);
            state.isSuperAdmin = role === 'super_admin';

            // Show UI based on role
            if (state.isAdmin) {
                document.body.classList.add('is-admin');
                if (elements.saveExamModal) elements.saveExamModal.classList.add('admin-mode');
            } else {
                document.body.classList.remove('is-admin');
            }

            // Load Data
            await loadDataFromStorage();
            showNotification(`স্বাগতম, ${user.displayName || 'User'}!`);
        } else {
            console.log('User Logged Out');
            state.currentUser = null;
            state.isAdmin = false;
            state.isSuperAdmin = false;
            state.userRole = 'guest';
            document.body.classList.remove('is-admin');

            // Still load public data?
            await loadDataFromStorage();
        }
    });
});



