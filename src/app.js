/**
 * Main Application Entry Point
 * Refactored into ES Modules for reliability and maintainability
 */

import './styles/main.css';

// Core Modules
import { state, DEFAULT_SUBJECT_CONFIG } from './js/modules/state.js';
import { elements, initDOMReferences, setLoading, updateSyncStatus, updateProfileUI, showConfirmModal } from './js/modules/uiManager.js';
import { setupAuthListener, handleLogin, handleLogout, handleEmailLogin, handleAccessRequest } from './js/modules/authManager.js';
import {
    initializeData,
    onFileUpload,
    loadSampleData,
    triggerAnalyticsSave,
    fetchExams,
    deleteExam,
    updateExamDetails,
    handleSaveExam,
    handleHistorySearch,
    handleCandidateSearch,
    exportToExcel,
    saveSubjectMapping,
    updateAppSettings
} from './js/modules/dataManager.js';
import { initializeMainChart, handleChartDownload, initializeHistoryChart } from './js/modules/chartManager.js';

// Utilities & Services
import { showNotification, filterStudentData, sortStudentData, calculateStatistics, convertToEnglishDigits, formatDateBengali, normalizeText, determineStatus, calculateGrade } from './js/utils.js';
import { FAILING_THRESHOLD } from './js/constants.js';
import {
    applyTheme,
    renderStats, renderGroupStats, renderFailedStudents, printFailedStudents, printAllStudents, renderTable, toggleTheme,
    renderSavedExamsList, renderStudentHistory, renderCandidateResults
} from './js/uiComponents.js';
import {
    subscribeToDataUpdates, isFirestoreOnline, downloadDemoTemplate, saveDataToStorage,
    loadThemePreference, saveThemePreference, captureElementAsImage
} from './js/dataService.js';
import { getChartTitle } from './js/chartModule.js';
import { getSavedExams, subscribeToSettings, getSettings, subscribeToSubjectConfigs, getSubjectConfigs } from './js/firestoreService.js';

import { handleUserManagement } from './js/modules/userMgmtManager.js';
import { initSubjectConfigManager } from './js/modules/subjectConfigManager.js';
import { initClassMappingManager, populateSubjectDropdown } from './js/modules/classMappingManager.js';

// New Feature Modules
import { initPageRouter, updateNavVisibility } from './js/modules/pageRouter.js';
import { initTeacherAssignmentUI, loadTeacherAssignmentData } from './js/modules/teacherAssignmentManager.js';
import { initAccessRequestUI, loadAccessRequests, initAccessRequestNotifications } from './js/modules/accessRequestManager.js';
import { initStudentManager, loadStudents } from './js/modules/studentManager.js';
import { initResultEntryManager, populateREDropdowns } from './js/modules/resultEntryManager.js';
import { initMarksheetManager, populateMSDropdowns, subscribeToMarksheetSettings } from './js/modules/marksheetManager.js';
import { initMarksheetRulesManager, populateMarksheetSettingsDropdowns } from './js/modules/marksheetRulesManager.js';
import { initExamConfigManager, loadExamConfigs, populateExamNameDropdown } from './js/modules/examConfigManager.js';
import { initAcademicSettingsManager } from './js/modules/academicSettingsManager.js';
import { initAdmitCardManager, populateACDropdowns } from './js/modules/admitCardManager.js';
import { initRoutineManager } from './js/modules/routineManager.js';
import AccessControlManager from './js/modules/accessControlManager.js';
import { initStudentResultsManager } from './js/modules/studentResultsManager.js';

/**
 * Recalculate student grades/statuses using CURRENT subject config.
 * Called when loading exam data from Firestore to fix stale old values.
 */
function recalculateStudentData(studentData, subjectName) {
    if (!studentData || studentData.length === 0) return studentData;

    let subjectConfig = state.subjectConfigs?.[subjectName] || {};
    if (!subjectConfig || Object.keys(subjectConfig).length === 0) {
        // Fuzzy match
        const normalizedName = normalizeText(subjectName);
        const matchedKey = Object.keys(state.subjectConfigs || {})
            .find(key => key !== 'updatedAt' && normalizeText(key) === normalizedName);
        subjectConfig = matchedKey ? state.subjectConfigs[matchedKey] : {};
    }

    const cfgVal = (v) => {
        if (v === null || v === undefined || v === '' || isNaN(Number(v))) return 0;
        return Number(v);
    };

    const writtenPass = cfgVal(subjectConfig.writtenPass);
    const mcqPass = cfgVal(subjectConfig.mcqPass);
    const practicalPass = cfgVal(subjectConfig.practicalPass);

    // Build options for determineStatus
    const statusOptions = {
        writtenPass: (subjectConfig.writtenPass !== undefined && subjectConfig.writtenPass !== '') ? Number(subjectConfig.writtenPass) : FAILING_THRESHOLD.written,
        mcqPass: (subjectConfig.mcqPass !== undefined && subjectConfig.mcqPass !== '') ? Number(subjectConfig.mcqPass) : FAILING_THRESHOLD.mcq,
        practicalPass: (subjectConfig.practicalPass !== undefined && subjectConfig.practicalPass !== '') ? Number(subjectConfig.practicalPass) : 0,
    };

    studentData.forEach(s => {
        const written = (s.written !== null && s.written !== '' && s.written !== undefined) ? Number(s.written) : 0;
        const mcq = (s.mcq !== null && s.mcq !== '' && s.mcq !== undefined) ? Number(s.mcq) : 0;
        const practical = (s.practical !== null && s.practical !== '' && s.practical !== undefined) ? Number(s.practical) : 0;
        const total = written + mcq + practical;

        // Recalculate using current formula
        s.total = total;
        s.grade = calculateGrade(total).grade;
        s.status = determineStatus(s, statusOptions);
    });

    return studentData;
}

async function init() {
    // Prevent multiple initializations from HMR if already initialized
    if (state.isInitialized && state.onDataUpdateUnsubscribe) {
        console.log('App already initialized, skipping init...');
        return;
    }

    initDOMReferences();
    setLoading(true);

    try {
        // Cleanup existing listeners if any (safety for HMR)
        if (state.onDataUpdateUnsubscribe) state.onDataUpdateUnsubscribe();
        if (state.onSettingsUnsubscribe) state.onSettingsUnsubscribe();
        if (state.onSubjectConfigsUnsubscribe) state.onSubjectConfigsUnsubscribe();
        if (state.onAuthUnsubscribe) state.onAuthUnsubscribe();
        if (state.onAccessReqUnsubscribe) state.onAccessReqUnsubscribe();
        if (state.onMarksheetSettingsUnsubscribe) state.onMarksheetSettingsUnsubscribe();

        const theme = await loadThemePreference();
        applyTheme(theme === 'dark', elements.themeToggle);

        // Fetch settings and exams first to know the default
        const [settings, exams] = await Promise.all([getSettings(), fetchExams()]);

        // Wait for profile UI to finish role sync
        await setupAuthListener();

        // Initialize super-admin only notifications
        if (state.isSuperAdmin) {
            state.onAccessReqUnsubscribe = initAccessRequestNotifications();
        }

        // Initialize Academic Settings (Dynamic Structure)
        await initAcademicSettingsManager();
        if (settings) state.defaultExamId = settings.defaultExamId;

        // Load subject configs FIRST (needed for recalculation on exam load)
        state.subjectConfigs = await getSubjectConfigs() || {};

        let defaultLoaded = false;
        // 1. Check for manually loaded exam (Overrides default)
        const loadedExamId = localStorage.getItem('loadedExamId');
        if (loadedExamId) {
            const loadedExam = exams.find(e => e.docId === loadedExamId);
            if (loadedExam) {
                state.studentData = recalculateStudentData(loadedExam.studentData || [], loadedExam.subject);
                state.currentExamName = loadedExam.name;
                state.currentSubject = loadedExam.subject;
                state.currentExamSession = loadedExam.session;
                state.currentExamClass = loadedExam.class;
                state.isViewingSavedExam = true;
                defaultLoaded = true;
            }
        }

        // 2. Fallback to system default if no manual load exists
        if (!defaultLoaded && state.defaultExamId) {
            const defaultExam = exams.find(e => e.docId === state.defaultExamId);
            if (defaultExam) {
                state.studentData = recalculateStudentData(defaultExam.studentData || [], defaultExam.subject);
                state.currentExamName = defaultExam.name;
                state.currentSubject = defaultExam.subject;
                state.currentExamSession = defaultExam.session;
                state.currentExamClass = defaultExam.class;
                state.isViewingSavedExam = true;
                defaultLoaded = true;
            }
        }

        if (!defaultLoaded) {
            await initializeData();
        } else {
            state.isInitialized = true;
        }

        state.onAuthUnsubscribe = setupAuthListener({
            renderUI: (user) => {
                updateProfileUI(user, state.isAdmin, state.isSuperAdmin, state.userRole);
                updateNavVisibility();
                updateViews();
                renderSavedExams();
                
                // Refresh dynamic dropdowns if active on those pages
                const currentHash = window.location.hash.replace('#', '') || 'dashboard';
                if (currentHash === 'result-entry') populateREDropdowns();
                if (currentHash === 'marksheet') populateMSDropdowns();
            }
        });

        initEventListeners();

        // Real-time Data Sync
        state.onDataUpdateUnsubscribe = subscribeToDataUpdates((data) => {
            if (state.isViewingSavedExam || state.isImporting) return;
            state.studentData = data;
            updateViews();
        });

        // Settings Sync
        state.onSettingsUnsubscribe = subscribeToSettings(settings => {
            if (settings && settings.defaultExamId !== state.defaultExamId) {
                state.defaultExamId = settings.defaultExamId;

                // Load pinning exam data as if clicking "View"
                if (state.defaultExamId) {
                    const pinnedExam = state.savedExams.find(e => e.docId === state.defaultExamId);
                    if (pinnedExam) {
                        state.studentData = recalculateStudentData(pinnedExam.studentData || [], pinnedExam.subject);
                        state.currentExamName = pinnedExam.name;
                        state.currentSubject = pinnedExam.subject;
                        state.currentExamSession = pinnedExam.session;
                        state.currentExamClass = pinnedExam.class;
                        state.isViewingSavedExam = true;
                    }
                }

                updateViews();
                renderSavedExams();
            }
        });

        // Subject Configs Sync
        state.onSubjectConfigsUnsubscribe = subscribeToSubjectConfigs(configs => {
            state.subjectConfigs = configs;
            updateViews();
        });

        // Marksheet Settings Sync (College Name, Address, Logo)
        state.onMarksheetSettingsUnsubscribe = await subscribeToMarksheetSettings((msData) => {
            console.log('Marksheet settings updated, refreshing dashboard header...');
            updateViews();
        });

        initSubjectConfigManager();
        initClassMappingManager();

        // Initialize new feature modules
        initPageRouter(async (pageId) => {
            // Lazy-load page data on navigation
            if (pageId === 'teacher-assignment') await loadTeacherAssignmentData();
            if (pageId === 'students') await loadStudents();
            if (pageId === 'result-entry') await populateREDropdowns();
            if (pageId === 'marksheet') await populateMSDropdowns();
            if (pageId === 'exam-config') await loadExamConfigs();
            if (pageId === 'marksheet-settings') await populateMarksheetSettingsDropdowns();
            if (pageId === 'admit-card') await populateACDropdowns();
            if (pageId === 'access-requests') await loadAccessRequests();
        });
        initTeacherAssignmentUI();

        initStudentManager();
        initResultEntryManager();
        initMarksheetManager();
        initMarksheetRulesManager();
        initExamConfigManager();
        initAdmitCardManager();
        initRoutineManager();
        initAccessRequestUI();
        initAccessRequestNotifications();
        AccessControlManager.init();
        initStudentResultsManager();

        // Listen for exam data updates from Result Entry
        window.addEventListener('examDataUpdated', async () => {
            console.log('[App] Exam data updated — refreshing exam cards...');
            await fetchExams();
            renderSavedExams();

            // If the currently loaded exam was updated, refresh dashboard views too
            const loadedExamId = localStorage.getItem('loadedExamId');
            if (loadedExamId) {
                const updatedExam = state.savedExams.find(e => e.docId === loadedExamId);
                if (updatedExam) {
                    state.studentData = updatedExam.studentData || [];
                    updateViews();
                }
            }
        });

        updateViews();
        renderSavedExams();
    } catch (error) {
        console.error('Init failed:', error);
        showNotification('অ্যাপ্লিকেশন শুরু করতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false);
    }
}

function updateViews() {
    if (state.isLoading) return;

    let subjectConfig = state.subjectConfigs[state.currentSubject]; // Exact match first
    if (!subjectConfig) {
        // Fuzzy match using centralized normalizeText
        const normalizedCurrent = normalizeText(state.currentSubject);
        const matchedKey = Object.keys(state.subjectConfigs)
            .find(key => key !== 'updatedAt' && normalizeText(key) === normalizedCurrent);
        subjectConfig = matchedKey ? state.subjectConfigs[matchedKey] : {};
    }

    const subjectOptions = {
        writtenPass: (subjectConfig.writtenPass !== undefined && subjectConfig.writtenPass !== '') ? Number(subjectConfig.writtenPass) : FAILING_THRESHOLD.written,
        mcqPass: (subjectConfig.mcqPass !== undefined && subjectConfig.mcqPass !== '') ? Number(subjectConfig.mcqPass) : FAILING_THRESHOLD.mcq,
        practicalPass: (subjectConfig.practicalPass !== undefined && subjectConfig.practicalPass !== '') ? Number(subjectConfig.practicalPass) : 0,
        totalPass: (subjectConfig.total !== undefined && subjectConfig.total !== '') ? Number(subjectConfig.total) * 0.33 : FAILING_THRESHOLD.total,
        criteria: state.currentChartType
    };


    const filteredData = filterStudentData(state.studentData, {
        group: state.currentGroupFilter,
        grade: state.currentGradeFilter,
        status: state.currentStatusFilter,
        searchTerm: state.currentSearchTerm,
        subject: state.currentSubject
    }, subjectOptions);

    renderStats(elements.statsContainer, filteredData, subjectOptions);
    renderGroupStats(elements.groupStatsContainer, state.studentData, {
        ...subjectOptions,
        metaElement: elements.groupStatsHeaderMeta,
        examName: state.currentExamName,
        subjectName: state.currentSubject
    });
    renderFailedStudents(elements.failedStudentsContainer, filteredData, {
        ...subjectOptions,
        metaElement: elements.failedHeaderMeta,
        paginationContainer: elements.failedStudentsPagination,
        examName: state.currentExamName,
        subjectName: state.currentSubject,
        currentPage: state.failedStudentsCurrentPage,
        perPage: state.failedStudentsPerPage,
        searchTerm: state.failedSearchTerm,
        onPageChange: (page) => {
            state.failedStudentsCurrentPage = page;
            updateViews();
            elements.failedStudentsContainer.scrollIntoView({ behavior: 'smooth' });
        }
    });

    elements.chartTitle.innerHTML = getChartTitle(state.currentChartType, state.currentExamName, state.currentSubject);

    // Toggle view visibility
    if (elements.chartView) elements.chartView.style.display = state.currentView === 'chart' ? 'block' : 'none';
    if (elements.tableView) elements.tableView.style.display = state.currentView === 'table' ? 'block' : 'none';
    if (elements.analysisView) elements.analysisView.style.display = state.currentView === 'analysis' ? 'block' : 'none';

    if (state.currentView === 'chart') {
        // Determine correct pass mark based on chart type
        let chartPassMark;
        switch (state.currentChartType) {
            case 'written':
                chartPassMark = subjectOptions.writtenPass;
                break;
            case 'mcq':
                chartPassMark = subjectOptions.mcqPass;
                break;
            case 'total':
                chartPassMark = subjectOptions.totalPass;
                break;
            default:
                chartPassMark = 0; // practical or others - no fail threshold
        }

        initializeMainChart(elements.chartCanvas, filteredData, {
            chartType: state.currentChartType,
            sortOrder: state.currentSortOrder,
            examName: state.currentExamName,
            subject: state.currentSubject,
            passMark: chartPassMark,
            writtenPass: subjectOptions.writtenPass,
            mcqPass: subjectOptions.mcqPass,
            onBarClick: (student) => transitionToAnalysis(student)
        });
    } else if (state.currentView === 'table') {
        renderTable(elements.tableBody, filteredData, {
            ...subjectOptions,
            sortOrder: state.currentSortOrder,
            onRowClick: (student) => transitionToAnalysis(student)
        });
    }

    updateSyncStatus(isFirestoreOnline());
}

function renderSavedExams() {
    renderSavedExamsList(elements.savedExamsList, state.savedExams, {
        currentPage: state.savedExamsCurrentPage,
        perPage: state.savedExamsPerPage,
        currentExamId: state.defaultExamId,
        defaultExamId: state.defaultExamId,
        classFilter: state.savedExamsClassFilter,
        sessionFilter: state.savedExamsSessionFilter,
        paginationContainer: elements.savedExamsPagination,
        subjectConfigs: state.subjectConfigs,
        onPageChange: (page) => {
            state.savedExamsCurrentPage = page;
            renderSavedExams();
        },
        onFilterChange: (cls) => {
            state.savedExamsClassFilter = cls;
            state.savedExamsCurrentPage = 1;
            renderSavedExams();
        },
        onSessionFilterChange: (session) => {
            state.savedExamsSessionFilter = session;
            state.savedExamsCurrentPage = 1;
            renderSavedExams();
        },
        onSetDefault: async (exam) => {
            const success = await updateAppSettings({ defaultExamId: exam.docId });
            if (success) {
                showNotification(exam.docId ? `"${exam.name}" ডিফল্ট হিসেবে সেট করা হয়েছে` : 'ডিফল্ট এক্সাম রিমুভ করা হয়েছে');
            }
        },
        onLoad: (exam) => {
            const isLoaded = localStorage.getItem('loadedExamId') === exam.docId;
            const title = document.getElementById('loadExamConfirmTitle');
            const desc = document.getElementById('loadExamConfirmDesc');
            const btnText = document.getElementById('loadExamConfirmBtnText');

            if (isLoaded) {
                if (title) title.textContent = 'এক্সাম লোড বাতিল (আন-লোড) করবেন?';
                if (desc) desc.textContent = 'আপনার লোড করা এক্সাম নিষ্ক্রিয় করা হবে এবং সুপার অ্যাডমিন থেকে নির্ধারিত এক্সাম তথ্য লোড হবে।';
                if (btnText) btnText.textContent = 'হ্যাঁ, আন-লোড করুন';
            } else {
                if (title) title.textContent = 'এক্সাম তথ্য লোড করুন';
                if (desc) desc.textContent = 'আপনি কি এই এক্সামের তথ্যগুলো ড্যাশবোর্ডে লোড করতে চান?';
                if (btnText) btnText.textContent = 'হ্যাঁ, লোড করুন';
            }

            // Show confirmation modal with exam name
            if (elements.loadExamConfirmName) {
                elements.loadExamConfirmName.textContent = `"${exam.name}"`;
            }
            elements.loadExamConfirmModal?.classList.add('active');
            state._pendingLoadExam = exam;
            state._isUnloadAction = isLoaded;
            // Wait for user confirmation
        },
        onEdit: async (exam) => {
            elements.editExamDocId.value = exam.docId;

            // Set class and session first so populate can use them
            elements.editExamClass.value = exam.class || '';
            elements.editExamSession.value = exam.session || '';

            // Populate exam names based on class & session
            await populateExamNameDropdown(elements.editExamName, exam.class, exam.session);
            elements.editExamName.value = exam.name;

            // Populate subjects based on class
            populateSubjectDropdown(elements.editSubjectName, exam.class, exam.subject);

            elements.editExamModal.classList.add('active');
        },
        onDelete: async (exam) => {
            showConfirmModal(
                'আপনি কি নিশ্চিত যে আপনি এই পরীক্ষাটি মুষতে চান?',
                async () => {
                    const success = await deleteExam(exam.docId);
                    if (success) {
                        await fetchExams();
                        renderSavedExams();
                    }
                },
                `${exam.name || 'অজ্ঞাত পরীক্ষা'} (${exam.subject || ''})`,
                `ক্লাস: ${exam.class || ''} | সেশন: ${exam.session || ''} - এটি স্থায়ীভাবে মুছে যাবে`
            );
        }
    });
}

function initEventListeners() {
    // Theme
    elements.themeToggle?.addEventListener('click', async () => {
        const isDark = toggleTheme(elements.themeToggle);
        await saveThemePreference(isDark ? 'dark' : 'light');
        updateViews();
    });

    // Filters
    elements.groupFilters?.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.groupFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentGroupFilter = btn.dataset.group;
            state.failedStudentsCurrentPage = 1; // Reset page
            updateViews();
        });
    });

    elements.gradeFilters?.forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedValue = btn.dataset.grade;

            // Logic for different button types
            if (selectedValue === 'all') {
                state.currentStatusFilter = 'all';
                state.currentGradeFilter = 'all';
            }
            else if (selectedValue === 'total-pass') {
                state.currentStatusFilter = 'pass';
                state.currentGradeFilter = 'all';
            }
            else if (selectedValue === 'total-fail') {
                state.currentStatusFilter = 'fail';
                state.currentGradeFilter = 'all';
            }
            else if (selectedValue === 'absent') {
                state.currentStatusFilter = 'absent';
                state.currentGradeFilter = 'all';
            }
            else {
                // Individual grade clicks (A+, A, B, etc. or F)
                state.currentGradeFilter = selectedValue;
                // Auto-set status category
                if (selectedValue === 'F') {
                    state.currentStatusFilter = 'fail';
                } else {
                    state.currentStatusFilter = 'pass';
                }
            }

            // Update UI Highlighting
            elements.gradeFilters.forEach(b => {
                const val = b.dataset.grade;
                b.classList.remove('active');

                // Highlight logic
                if (val === 'all' && state.currentStatusFilter === 'all') {
                    b.classList.add('active');
                } else if (val === 'total-pass' && state.currentStatusFilter === 'pass') {
                    b.classList.add('active');
                } else if (val === 'total-fail' && state.currentStatusFilter === 'fail') {
                    b.classList.add('active');
                } else if (val === 'absent' && state.currentStatusFilter === 'absent') {
                    b.classList.add('active');
                } else if (val === state.currentGradeFilter && state.currentGradeFilter !== 'all') {
                    b.classList.add('active');
                }
            });

            state.failedStudentsCurrentPage = 1; // Reset page
            updateViews();
        });
    });

    // Search
    elements.searchInput?.addEventListener('input', async (e) => {
        const query = e.target.value.toLowerCase();
        state.currentSearchTerm = query;
        updateViews();

        // Predictive Search Logic
        if (query.length >= 1) {
            const candidates = await handleCandidateSearch(query, state.currentExamSession, state.currentExamClass);
            if (candidates.length > 0) {
                elements.globalSearchResults.style.display = 'grid';
                renderCandidateResults(elements.globalSearchResults, candidates, (student) => {
                    transitionToAnalysis(student);
                    elements.globalSearchResults.style.display = 'none';
                });
            } else {
                elements.globalSearchResults.style.display = 'none';
            }
        } else {
            elements.globalSearchResults.style.display = 'none';
        }
    });

    // Failed Students Search
    elements.failedSearchInput?.addEventListener('input', (e) => {
        state.failedSearchTerm = e.target.value;
        state.failedStudentsCurrentPage = 1; // Reset to page 1 on search
        updateViews();
    });

    // Close global search results on click outside
    document.addEventListener('click', (e) => {
        if (!elements.searchInput?.contains(e.target) && !elements.globalSearchResults?.contains(e.target)) {
            if (elements.globalSearchResults) elements.globalSearchResults.style.display = 'none';
        }
    });

    // Chart Type Dropdown
    elements.chartTypeSelect?.addEventListener('change', (e) => {
        state.currentChartType = e.target.value;
        updateViews();
    });

    // Sort Order Dropdown
    elements.sortOrderSelect?.addEventListener('change', (e) => {
        state.currentSortOrder = e.target.value;
        updateViews();
    });

    // Reset Filters
    elements.resetFiltersBtn?.addEventListener('click', () => {
        // Reset all filter states
        state.currentGroupFilter = 'all';
        state.currentStatusFilter = 'all';
        state.currentGradeFilter = 'all';
        state.currentSearchTerm = '';
        state.currentChartType = 'total';
        state.currentSortOrder = 'desc';

        // Reset UI elements
        elements.groupFilters?.forEach(b => b.classList.remove('active'));
        document.querySelector('.group-btn[data-group="all"]')?.classList.add('active');
        elements.gradeFilters?.forEach(b => b.classList.remove('active'));
        document.querySelector('.grade-btn[data-grade="all"]')?.classList.add('active');
        if (elements.searchInput) elements.searchInput.value = '';
        if (elements.chartTypeSelect) elements.chartTypeSelect.value = 'total';
        if (elements.sortOrderSelect) elements.sortOrderSelect.value = 'desc';

        // View Transition Logic
        if (state.currentView === 'analysis') {
            state.currentView = 'chart';
            elements.viewButtons?.forEach(btn => {
                if (btn.dataset.view === 'chart') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        // Reset Chart Section Collapse
        if (elements.chartSectionCollapse) elements.chartSectionCollapse.style.display = 'block';
        if (elements.chartSectionIcon) elements.chartSectionIcon.style.transform = 'rotate(0deg)';

        updateViews();
    });

    // File Upload
    elements.jsonFileInput?.addEventListener('change', (e) => onFileUpload(e, () => updateViews()));
    elements.downloadTemplateBtn?.addEventListener('click', downloadDemoTemplate);

    // View Switching
    elements.viewButtons?.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.viewButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentView = btn.dataset.view;
            updateViews();
        });
    });

    // Dropdowns
    elements.reportDropdownBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.reportDropdownMenu?.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        elements.reportDropdownMenu?.classList.remove('show');
        if (e.target?.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });

    // Developer Contact Modal
    elements.contactDevBtn?.addEventListener('click', () => {
        if (elements.contactModal) elements.contactModal.classList.add('active');
    });

    elements.closeContactModal?.addEventListener('click', () => {
        if (elements.contactModal) elements.contactModal.classList.remove('active');
    });

    // Downloads
    elements.downloadChartBtn?.addEventListener('click', () => handleChartDownload(`${state.currentExamName} - ${state.currentSubject}.png`));
    elements.downloadExcelBtn?.addEventListener('click', () => {
        const filename = `${state.currentSubject}_${state.currentExamClass}_${state.currentExamName}(${state.currentExamSession}).xlsx`;
        exportToExcel(state.studentData, filename, state.currentSubject);
    });

    // Toolbar Downloads & Print
    elements.downloadBtn?.addEventListener('click', () => {
        if (state.currentView === 'chart') {
            handleChartDownload(`${state.currentExamName} - ${state.currentSubject}.png`);
        } else if (state.currentView === 'table') {
            const tableContainer = document.getElementById('tableView');
            if (tableContainer) {
                captureElementAsImage(tableContainer, `ফলাফল - টেবিল - ${state.currentExamName}.png`);
            }
        } else if (state.currentView === 'analysis') {
            const analysisReport = document.getElementById('analysisReportContent');
            if (analysisReport) {
                captureElementAsImage(analysisReport, `শিক্ষার্থী - এনালাইসিস - ${state.currentAnalyzedStudent?.name || 'রিপোর্ট'}.png`);
            }
        }
    });
    elements.printBtn?.addEventListener('click', () => {
        let subjectConfig = state.subjectConfigs[state.currentSubject];
        if (!subjectConfig) {
            const normalizedCurrent = normalizeText(state.currentSubject);
            const matchedKey = Object.keys(state.subjectConfigs)
                .find(key => key !== 'updatedAt' && normalizeText(key) === normalizedCurrent);
            subjectConfig = matchedKey ? state.subjectConfigs[matchedKey] : {};
        }
        const subjectOptions = {
            writtenPass: (subjectConfig.writtenPass !== undefined && subjectConfig.writtenPass !== '') ? Number(subjectConfig.writtenPass) : FAILING_THRESHOLD.written,
            mcqPass: (subjectConfig.mcqPass !== undefined && subjectConfig.mcqPass !== '') ? Number(subjectConfig.mcqPass) : FAILING_THRESHOLD.mcq,
            practicalPass: (subjectConfig.practicalPass !== undefined && subjectConfig.practicalPass !== '') ? Number(subjectConfig.practicalPass) : 0,
            totalPass: (subjectConfig.total !== undefined && subjectConfig.total !== '') ? Number(subjectConfig.total) * 0.33 : FAILING_THRESHOLD.total,
        };
        printAllStudents(filterStudentData(state.studentData, {
            group: state.currentGroupFilter,
            grade: state.currentGradeFilter,
            status: state.currentStatusFilter,
            searchTerm: state.currentSearchTerm,
            subject: state.currentSubject
        }, subjectOptions), {
            ...subjectOptions,
            examName: state.currentExamName,
            subjectName: state.currentSubject,
            groupFilter: state.currentGroupFilter,
            gradeFilter: state.currentGradeFilter,
            sortBy: state.currentChartType,
            sortOrder: state.currentSortOrder,
            statusFilter: state.currentStatusFilter,
            searchTerm: state.currentSearchTerm,
            fullData: state.studentData // Added full data for stats
        });
    });
    elements.downloadFailedBtn?.addEventListener('click', () => {
        const section = document.querySelector('.card.failed-students');
        if (section) {
            captureElementAsImage(section, `failed - students - ${state.currentExamName}.png`);
        }
    });

    // Print Failed Students
    document.getElementById('printFailedBtn')?.addEventListener('click', () => {
        let subjectConfig = state.subjectConfigs[state.currentSubject];
        if (!subjectConfig) {
            const normalizedCurrent = normalizeText(state.currentSubject);
            const matchedKey = Object.keys(state.subjectConfigs)
                .find(key => key !== 'updatedAt' && normalizeText(key) === normalizedCurrent);
            subjectConfig = matchedKey ? state.subjectConfigs[matchedKey] : {};
        }
        const subjectOptions = {
            writtenPass: (subjectConfig.writtenPass !== undefined && subjectConfig.writtenPass !== '') ? Number(subjectConfig.writtenPass) : FAILING_THRESHOLD.written,
            mcqPass: (subjectConfig.mcqPass !== undefined && subjectConfig.mcqPass !== '') ? Number(subjectConfig.mcqPass) : FAILING_THRESHOLD.mcq,
            practicalPass: (subjectConfig.practicalPass !== undefined && subjectConfig.practicalPass !== '') ? Number(subjectConfig.practicalPass) : 0,
            totalPass: (subjectConfig.total !== undefined && subjectConfig.total !== '') ? Number(subjectConfig.total) * 0.33 : FAILING_THRESHOLD.total,
        };
        printFailedStudents(filterStudentData(state.studentData, {
            group: state.currentGroupFilter,
            grade: state.currentGradeFilter,
            status: state.currentStatusFilter,
            searchTerm: state.currentSearchTerm,
            subject: state.currentSubject
        }, subjectOptions), {
            ...subjectOptions,
            examName: state.currentExamName,
            subjectName: state.currentSubject,
            groupFilter: state.currentGroupFilter,
            gradeFilter: state.currentGradeFilter,
            statusFilter: state.currentStatusFilter,
            searchTerm: state.currentSearchTerm,
            fullData: state.studentData // Added full data for stats
        });
    });

    // Group Toggle Filters for Failed Students
    const toggleContainer = document.getElementById('failedGroupToggles');
    if (toggleContainer) {
        toggleContainer.querySelectorAll('.group-toggle-chip input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const chip = cb.closest('.group-toggle-chip');
                if (cb.checked) {
                    chip.classList.add('active');
                } else {
                    chip.classList.remove('active');
                }
                // Get all active groups
                const activeGroups = [...toggleContainer.querySelectorAll('.group-toggle-chip.active')]
                    .map(c => c.dataset.group);
                // Show/hide cards
                const cards = document.querySelectorAll('#failedStudentsContainer .refined-readable-card');
                cards.forEach(card => {
                    if (activeGroups.includes(card.dataset.group)) {
                        card.classList.remove('group-hidden');
                    } else {
                        card.classList.add('group-hidden');
                    }
                });
            });
        });
    }

    elements.downloadGroupStatsBtn?.addEventListener('click', () => captureElementAsImage(elements.groupStatsContainer, `group - stats - ${state.currentExamName}.png`));

    // Inline Analysis Download
    elements.inlineDownloadBtn?.addEventListener('click', () => {
        const report = document.getElementById('analysisReportContent');
        if (report) captureElementAsImage(report, `student - analysis - ${elements.analysisStudentId.value}.png`);
    });

    // Auth
    elements.adminToggle?.addEventListener('click', () => {
        if (state.currentUser) {
            elements.profileModal.classList.add('active');
        } else {
            elements.loginModal.classList.add('active');
        }
    });

    // ── Mobile Hamburger Menu ──
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
    const mobileMenuDrawer = document.getElementById('mobileMenuDrawer');
    const mobileMenuClose = document.getElementById('mobileMenuClose');

    function openMobileMenu() {
        mobileMenuOverlay?.classList.add('active');
        mobileMenuDrawer?.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileMenu() {
        mobileMenuOverlay?.classList.remove('active');
        mobileMenuDrawer?.classList.remove('active');
        document.body.style.overflow = '';
    }

    mobileMenuToggle?.addEventListener('click', openMobileMenu);
    mobileMenuClose?.addEventListener('click', closeMobileMenu);
    mobileMenuOverlay?.addEventListener('click', closeMobileMenu);

    // Drawer items trigger their corresponding toolbar button
    document.querySelectorAll('.mobile-drawer-item[data-trigger]').forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.dataset.trigger;
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                // Special handling for file input — open native file dialog
                if (targetEl.tagName === 'INPUT' && targetEl.type === 'file') {
                    targetEl.click();
                } else {
                    targetEl.click();
                }
            }
            closeMobileMenu();
        });
    });

    // Login Modal Logic
    elements.closeLoginModal?.addEventListener('click', () => elements.loginModal.classList.remove('active'));

    elements.loginTabs?.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.loginTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const target = tab.dataset.tab;
            document.getElementById('googleLoginSection').classList.toggle('active', target === 'google');
            document.getElementById('emailLoginSection').classList.toggle('active', target === 'email');
        });
    });

    elements.googleLoginBtn?.addEventListener('click', async () => {
        const user = await handleLogin();
        if (user) elements.loginModal.classList.remove('active');
    });

    elements.emailLoginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        const user = await handleEmailLogin(email, pass);
        if (user) {
            elements.loginModal.classList.remove('active');
            e.target.reset();
        }
    });

    elements.openRequestAccessBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        elements.loginModal.classList.remove('active');
        elements.requestAccessModal.classList.add('active');
    });

    // Request Access Modal
    elements.closeRequestAccessModal?.addEventListener('click', () => elements.requestAccessModal.classList.remove('active'));

    elements.requestAccessForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('reqName').value,
            phone: document.getElementById('reqPhone').value,
            email: document.getElementById('reqEmail').value,
            reason: document.getElementById('reqReason').value
        };
        const success = await handleAccessRequest(data);
        if (success) {
            elements.requestAccessModal.classList.remove('active');
            e.target.reset();

            // Show large custom toast with instructions
            const toast = document.createElement('div');
            toast.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 99999; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px 35px; border-radius: 16px; max-width: 420px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.5); text-align: center; animation: fadeInUp 0.4s ease; border: 1px solid rgba(255,255,255,0.1);';
            toast.innerHTML = `
                <div style="font-size: 3rem; margin-bottom: 12px;">✅</div>
                <h3 style="margin: 0 0 10px 0; font-size: 1.2rem; color: #4caf50;">অনুরোধ সফলভাবে পাঠানো হয়েছে!</h3>
                <p style="margin: 0 0 12px 0; font-size: 0.9rem; line-height: 1.6; color: #ccc;">
                    আপনার ইমেইল অনুযায়ী সুপার অ্যাডমিন ম্যানুয়ালি একাউন্ট তৈরি করে দিবেন।
                </p>
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 12px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.05);">
                    <p style="margin: 0; font-size: 0.95rem; color: #ffd54f;">
                        <i class="fas fa-phone-alt"></i> দ্রুত পেতে কল দিন:
                    </p>
                    <a href="tel:01840643946" style="font-size: 1.4rem; font-weight: 700; color: #4caf50; text-decoration: none; display: block; margin-top: 8px;">
                        📞 01840-643946
                    </a>
                </div>
                <button id="closeLargeToast" style="background: var(--primary); color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600; width: 100%; transition: opacity 0.2s;">
                    বন্ধ করুন
                </button>
            `;

            const backdrop = document.createElement('div');
            backdrop.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 99998;';

            const removeToast = () => {
                toast.style.opacity = '0';
                toast.style.transform = 'translate(-50%, -40%)';
                toast.style.transition = 'all 0.3s ease';
                backdrop.style.opacity = '0';
                backdrop.style.transition = 'opacity 0.3s ease';
                setTimeout(() => {
                    toast.remove();
                    backdrop.remove();
                }, 300);
            };

            backdrop.onclick = removeToast;
            document.body.appendChild(backdrop);
            document.body.appendChild(toast);
            document.getElementById('closeLargeToast').onclick = removeToast;

            // Auto remove after 20 seconds
            setTimeout(removeToast, 20000);
        }
    });

    elements.modalLogoutBtn?.addEventListener('click', async () => {
        await handleLogout();
        elements.profileModal.classList.remove('active');
        updateProfileUI(null, false, false, 'guest');
    });

    elements.closeContactModalBtn?.addEventListener('click', () => elements.contactModal.classList.remove('active'));
    elements.closeProfileIcon?.addEventListener('click', () => elements.profileModal.classList.remove('active'));

    // Analysis View Navigation
    elements.prevRollBtn?.addEventListener('click', () => navigateRoll(-1));
    elements.nextRollBtn?.addEventListener('click', () => navigateRoll(1));

    document.addEventListener('keydown', (e) => {
        if (state.currentView !== 'analysis') return;

        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Prevent default browser scroll or dropdown navigation if we handle it
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }

        if (e.key === 'ArrowLeft') {
            if (elements.prevRollBtn && !elements.prevRollBtn.disabled) {
                elements.prevRollBtn.classList.add('active');
                setTimeout(() => elements.prevRollBtn.classList.remove('active'), 200);
            }
            navigateRoll(-1);
        }
        if (e.key === 'ArrowRight') {
            if (elements.nextRollBtn && !elements.nextRollBtn.disabled) {
                elements.nextRollBtn.classList.add('active');
                setTimeout(() => elements.nextRollBtn.classList.remove('active'), 200);
            }
            navigateRoll(1);
        }
    });

    function navigateRoll(direction) {
        if (!state.currentAnalyzedStudent || !state.currentSessionStudents.length) return;

        const currentRoll = String(state.currentAnalyzedStudent.id);
        const currentGroup = state.currentAnalyzedStudent.group;
        const list = state.currentSessionStudents;

        let currentIndex = list.findIndex(s =>
            String(s.id) === currentRoll && s.group === currentGroup
        );

        if (currentIndex === -1) return;

        let nextIndex = currentIndex + direction;

        // Infinite Loop Logic
        if (nextIndex >= list.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = list.length - 1;

        const nextStudent = list[nextIndex];

        // Show notification if group changes or cycle restarts
        if (nextStudent.group !== currentGroup || (direction === 1 && nextIndex === 0) || (direction === -1 && nextIndex === list.length - 1)) {
            showNotification(`পুনরায় পরবর্তী কাঙ্খিত(${nextStudent.group}) গ্রুপ থেকে দেখানো হচ্ছে`, 'info');
        }

        elements.analysisStudentId.value = nextStudent.id;
        
        // Preserve completely ALL UI states for the next view
        const currentOptions = {
            preserveExamSelect: elements.analysisExamSelect?.value,
            preserveSubjectSelect: elements.analysisSubjectSelect?.value,
            preserveSessionSelect: elements.analysisSessionSelect?.value,
            preserveAllSubjects: elements.analysisSubjectSelect?.value === 'all'
        };
        
        handleAnalysis(nextStudent, currentOptions);
    }

    // Analysis View
    elements.analysisStudentId?.addEventListener('input', (e) => {
        const query = e.target.value;
        clearTimeout(state.inlineSearchDebounce);
        state.inlineSearchDebounce = setTimeout(async () => {
            if (query.length < 1) {
                elements.analysisSearchResults.style.display = 'none';
                return;
            }
            const candidates = await handleCandidateSearch(query, state.currentExamSession, state.currentExamClass);
            renderCandidateResults(elements.analysisSearchResults, candidates, (student) => {
                elements.analysisStudentId.value = student.id;
                handleAnalysis(student);
            });
        }, 300);
    });

    elements.analyzeBtn?.addEventListener('click', () => {
        const studentId = elements.analysisStudentId.value;
        if (studentId) {
            // If there's multiple matches for this ID, search again or use first
            handleCandidateSearch(studentId, state.currentExamSession, state.currentExamClass).then(candidates => {
                if (candidates.length === 1) {
                    handleAnalysis(candidates[0]);
                } else {
                    renderCandidateResults(elements.analysisSearchResults, candidates, (student) => {
                        elements.analysisStudentId.value = student.id;
                        handleAnalysis(student);
                    });
                }
            });
        }
    });

    elements.analysisStudentId?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const studentId = e.target.value;
            if (studentId) {
                handleCandidateSearch(studentId, state.currentExamSession, state.currentExamClass).then(candidates => {
                    if (candidates.length === 1) {
                        handleAnalysis(candidates[0]);
                    } else {
                        renderCandidateResults(elements.analysisSearchResults, candidates, (student) => {
                            elements.analysisStudentId.value = student.id;
                            handleAnalysis(student);
                        });
                    }
                    elements.analysisSearchResults.style.display = 'none';
                });
            }
        }
    });

    elements.analysisType?.addEventListener('change', () => {
        syncAnalysisMaxMarks();
        refreshAnalysisChart();
    });
    elements.analysisMaxMarks?.addEventListener('change', refreshAnalysisChart);
    elements.analysisSessionSelect?.addEventListener('change', () => {
        populateAnalysisSubjectDropdown();
        syncAnalysisMaxMarks();
        refreshAnalysisChart();
    });
    elements.analysisSubjectSelect?.addEventListener('change', () => {
        const selectedExamId = elements.analysisExamSelect?.value;
        if (selectedExamId && selectedExamId !== 'all') {
            const exam = state.savedExams.find(e => e.docId === selectedExamId);
            const selectedSub = elements.analysisSubjectSelect.value;
            // If user picks a subject different from the specific exam's subject, reset exam to all
            if (exam && exam.subject !== selectedSub && selectedSub !== 'all') {
                elements.analysisExamSelect.value = 'all';
            }
        }
        updateAnalysisHeaderContext('subject');
        syncAnalysisMaxMarks();
        refreshAnalysisChart();
    });
    elements.analysisExamSelect?.addEventListener('change', () => {
        updateAnalysisHeaderContext('exam');
        syncAnalysisMaxMarks();
        refreshAnalysisChart();
    });

    elements.downloadAnalysisImage?.addEventListener('click', () => {
        const target = document.getElementById('analysisReportContent');
        if (target) {
            captureElementAsImage(target, `ফলাফল - বিশ্লেষণ - ${state.currentAnalyzedStudent?.name || 'শিক্ষার্থী'}.png`);
        }
    });



    // Save Exam
    elements.saveAnalysisBtn?.addEventListener('click', () => {
        if (!state.isAdmin && state.userRole !== 'teacher') {
            showNotification('শুধুমাত্র শিক্ষকরা এই ফিচারটি ব্যবহার করতে পারবেন', 'warning');
            return;
        }

        // Reset dropdown
        if (elements.examClass) elements.examClass.value = '';
        if (elements.examSubject) {
            elements.examSubject.innerHTML = '<option value="">আগে শ্রেণি সিলেক্ট করুন</option>';
            elements.examSubject.disabled = true;
        }

        if (elements.examName) {
            elements.examName.innerHTML = '<option value="">আগে শ্রেণি সিলেক্ট করুন</option>';
            elements.examName.disabled = true;
        }

        elements.saveExamModal.classList.add('active');
    });

    elements.saveExamForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const examData = {
            name: document.getElementById('examName').value,
            subject: document.getElementById('examSubject').value,
            class: document.getElementById('examClass').value,
            session: document.getElementById('examSession').value,
            date: formatDateBengali(new Date())
        };
        const success = await handleSaveExam(examData);
        if (success) {
            elements.saveExamModal.classList.remove('active');
            await fetchExams();
            renderSavedExams();
        }
    });

    // Edit Exam
    elements.editExamForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const docId = elements.editExamDocId.value;
        const updates = {
            name: elements.editExamName.value,
            class: elements.editExamClass.value,
            session: elements.editExamSession.value,
            date: formatDateBengali(new Date())
        };
        const success = await updateExamDetails(docId, updates);
        if (success) {
            elements.editExamModal.classList.remove('active');
            await fetchExams();
            renderSavedExams();
        }
    });

    elements.closeModalBtn?.addEventListener('click', () => elements.saveExamModal.classList.remove('active'));
    elements.closeEditModalBtn?.addEventListener('click', () => elements.editExamModal.classList.remove('active'));

    // Modal Class & Session Selection Listeners
    elements.examClass?.addEventListener('change', () => {
        const classVal = elements.examClass.value;
        const sessionVal = elements.examSession?.value || '';
        populateSubjectDropdown(elements.examSubject, classVal);
        populateExamNameDropdown(elements.examName, classVal, sessionVal);
    });

    elements.examSession?.addEventListener('change', () => {
        const classVal = elements.examClass?.value || '';
        const sessionVal = elements.examSession.value;
        populateExamNameDropdown(elements.examName, classVal, sessionVal);
    });

    elements.editExamClass?.addEventListener('change', () => {
        const classVal = elements.editExamClass.value;
        const sessionVal = elements.editExamSession?.value || '';
        populateSubjectDropdown(elements.editSubjectName, classVal);
        populateExamNameDropdown(elements.editExamName, classVal, sessionVal);
    });

    elements.editExamSession?.addEventListener('change', () => {
        const classVal = elements.editExamClass?.value || '';
        const sessionVal = elements.editExamSession.value;
        populateExamNameDropdown(elements.editExamName, classVal, sessionVal);
    });

    // Class Mapping
    elements.openClassMappingBtn?.addEventListener('click', () => {
        elements.classSubjectMappingModal.classList.add('active');
    });

    elements.closeClassMappingBtn?.addEventListener('click', () => {
        elements.classSubjectMappingModal.classList.remove('active');
    });

    // User Management
    elements.toolbarUserMgmtBtn?.addEventListener('click', () => {
        handleUserManagement();
        elements.userManagementModal.classList.add('active');
    });

    elements.closeUserManagementBtn?.addEventListener('click', () => {
        elements.userManagementModal.classList.remove('active');
    });

    // Subject Settings (inside User Management)
    elements.subjectSettingsBtn?.addEventListener('click', () => {
        elements.subjectSettingsModal.classList.add('active');
    });

    // Saved Exams Section Toggle - ONLY via eye button
    const toggleExamsBtn = document.getElementById('toggleExamsViewBtn');
    if (toggleExamsBtn) {
        toggleExamsBtn.addEventListener('click', (e) => {
            const isCollapsed = elements.savedExamsCollapse.style.display === 'none';
            elements.savedExamsCollapse.style.display = isCollapsed ? 'block' : 'none';

            // Update Eye icon and outer button class
            if (elements.savedExamsIcon) {
                elements.savedExamsIcon.className = isCollapsed ? 'fas fa-eye' : 'fas fa-eye-slash';
            }
            
            toggleExamsBtn.classList.toggle('active', isCollapsed);
            toggleExamsBtn.classList.toggle('inactive', !isCollapsed);
        });
    }

    elements.chartSectionToggle?.addEventListener('click', () => {
        const isCollapsed = elements.chartSectionCollapse.style.display === 'none';
        elements.chartSectionCollapse.style.display = isCollapsed ? 'block' : 'none';

        // Rotate icon: 0deg (up) when expanded, 180deg (down) when collapsed
        if (elements.chartSectionIcon) {
            elements.chartSectionIcon.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    });

    // Ensure it starts visible but properly styled
    if (elements.savedExamsCollapse) {
        elements.savedExamsCollapse.style.display = 'block';
    }
    if (elements.chartSectionCollapse) {
        elements.chartSectionCollapse.style.display = 'block';
    }

    // --- Exam Load Confirmation Modal ---
    elements.loadExamConfirmBtn?.addEventListener('click', () => {
        const exam = state._pendingLoadExam;
        const isUnload = state._isUnloadAction;

        if (isUnload) {
            localStorage.removeItem('loadedExamId');
            localStorage.removeItem('currentSubject');
            showNotification('সফলভাবে বাতিল করা হয়েছে। ডিফল্ট ডেটা লোড হচ্ছে...', 'info');
            elements.loadExamConfirmModal?.classList.remove('active');
            setTimeout(() => location.reload(), 1000);
            return;
        }

        if (exam) {
            state.studentData = recalculateStudentData(exam.studentData || [], exam.subject);
            state.currentExamName = exam.name;
            state.currentSubject = exam.subject;
            state.currentExamSession = exam.session;
            state.currentExamClass = exam.class;
            state.isViewingSavedExam = true;

            // Save to localStorage for persistence
            localStorage.setItem('loadedExamId', exam.docId || '');
            localStorage.setItem('currentSubject', exam.subject || '');

            updateViews();
            renderSavedExams();
            showNotification(`"${exam.name}" সফলভাবে লোড হয়েছে`, 'success');
            state._pendingLoadExam = null;
        }
        elements.loadExamConfirmModal?.classList.remove('active');
    });

    elements.loadExamCancelBtn?.addEventListener('click', () => {
        state._pendingLoadExam = null;
        elements.loadExamConfirmModal?.classList.remove('active');
    });

    // Close on background click
    elements.loadExamConfirmModal?.addEventListener('click', (e) => {
        if (e.target === elements.loadExamConfirmModal) {
            state._pendingLoadExam = null;
            elements.loadExamConfirmModal.classList.remove('active');
        }
    });
}

function populateComparisonDropdowns(history, student, options = {}) {
    if (!elements.analysisSessionSelect || !elements.analysisSubjectSelect || !elements.analysisExamSelect) return;

    // 1. Sessions (Extract from student history)
    let sessions = [...new Set(history.map(h => h.session || 'N/A'))].filter(Boolean);

    elements.analysisSessionSelect.innerHTML = '<option value="all">সকল সেশন</option>' +
        sessions.map(s => `<option value="${s}">${s}</option>`).join('');

    const targetSession = options.preserveSessionSelect || state.currentExamSession || student?.session;
    if (targetSession && Array.from(elements.analysisSessionSelect.options).some(o => o.value === targetSession)) {
        elements.analysisSessionSelect.value = targetSession;
    }

    // 2. Exams for the Student's Class & Session (Dynamic Exam Options)
    const studentClass = student?.class || state.currentExamClass;
    const studentSession = elements.analysisSessionSelect.value !== 'all' ? elements.analysisSessionSelect.value : (state.currentExamSession || student?.session);

    const relevantExams = state.savedExams.filter(e => {
        let match = true;
        if (studentClass && studentClass !== 'all') {
            match = match && String(e.class || '').toLowerCase() === String(studentClass).toLowerCase();
        }
        if (studentSession && studentSession !== 'all') {
            match = match && String(e.session || '').toLowerCase() === String(studentSession).toLowerCase();
        }
        return match;
    });

    elements.analysisExamSelect.innerHTML = '<option value="all">সকল পরীক্ষা (ক্রমানুসারে)</option>' +
        relevantExams.map(e => `<option value="${e.docId}">${e.name} (${e.subject})</option>`).join('');

    // Pre-select current exam if it matches OR preserve the explicitly requested exam
    if (options.preserveExamSelect) {
        if (options.preserveExamSelect !== 'all' && !Array.from(elements.analysisExamSelect.options).some(o => o.value === options.preserveExamSelect)) {
            const missingExam = state.savedExams.find(e => e.docId === options.preserveExamSelect);
            if (missingExam) {
                elements.analysisExamSelect.add(new Option(`${missingExam.name} (${missingExam.subject})`, missingExam.docId));
            }
        }
        elements.analysisExamSelect.value = options.preserveExamSelect;
    } else {
        const currentExam = state.savedExams.find(e => e.name === state.currentExamName && e.subject === state.currentSubject);
        if (currentExam && Array.from(elements.analysisExamSelect.options).some(o => o.value === currentExam.docId)) {
            elements.analysisExamSelect.value = currentExam.docId;
        } else {
            elements.analysisExamSelect.value = 'all';
        }
    }

    // 3. Subjects
    populateAnalysisSubjectDropdown();

    if (options.preserveSubjectSelect) {
        if (!Array.from(elements.analysisSubjectSelect.options).some(o => o.value === options.preserveSubjectSelect) && options.preserveSubjectSelect !== 'all') {
            elements.analysisSubjectSelect.add(new Option(options.preserveSubjectSelect, options.preserveSubjectSelect));
        }
        elements.analysisSubjectSelect.value = options.preserveSubjectSelect;
    } else {
        const targetSubject = state.currentSubject || student?.subject;
        if (targetSubject && !options.preserveAllSubjects) {
            const optionsArr = Array.from(elements.analysisSubjectSelect.options);
            if (optionsArr.some(opt => opt.value === targetSubject)) {
                elements.analysisSubjectSelect.value = targetSubject;
            }
        } else if (options.preserveAllSubjects) {
            elements.analysisSubjectSelect.value = 'all';
        }
    }

    // Initialize context info text WITHOUT triggering the 'exam' reset logic
    updateAnalysisHeaderContext('init', options);
}

function populateAnalysisSubjectDropdown() {
    if (!elements.analysisSubjectSelect) return;
    const history = state.currentAnalyzedHistory || [];
    const selectedSession = elements.analysisSessionSelect?.value;

    let filteredHistory = history;
    if (selectedSession && selectedSession !== 'all') {
        filteredHistory = history.filter(h => String(h.session || 'N/A') === selectedSession);
    }

    const subjects = [...new Set(filteredHistory.map(h => h.subject))].filter(Boolean);
    elements.analysisSubjectSelect.innerHTML = '<option value="all">সকল বিষয়</option>' +
        subjects.map(s => `<option value="${s}">${s}</option>`).join('');
}

/**
 * Update the dynamic context text in the analysis header (red box area)
 * and synchronize dropdowns if needed.
 */
function updateAnalysisHeaderContext(triggerSource = 'exam', options = {}) {
    if (!elements.analysisContextInfo || !elements.analysisExamSelect || !elements.analysisSubjectSelect) return;

    const selectedExamId = elements.analysisExamSelect.value;
    const selectedSubject = elements.analysisSubjectSelect.value;

    if (selectedExamId === 'all') {
        // If the change came from Exam dropdown, reset subject to 'all' as requested
        if (triggerSource === 'exam') {
            elements.analysisSubjectSelect.value = 'all';
        }

        const currentSub = elements.analysisSubjectSelect.value;
        if (currentSub === 'all') {
            elements.analysisContextInfo.innerHTML = `
                <span class="context-label">অনুসন্ধান:</span>
                <span class="context-value">সকল পরীক্ষা (ক্রমানুসারে)</span>
            `;
        } else {
            elements.analysisContextInfo.innerHTML = `
                <span class="context-label">অনুসন্ধান:</span>
                <span class="context-value">ঐতিহাসিক ফলাফল</span>
                <span class="context-divider">|</span>
                <span class="context-label">বিষয়:</span>
                <span class="context-value">${currentSub}</span>
            `;
        }
    } else {
        // Option 2: Specific Exam
        const exam = state.savedExams.find(e => e.docId === selectedExamId);
        if (exam) {
            // Auto-select subject for this exam (unless already matching or preserving All)
            if (triggerSource === 'exam' && !options.preserveAllSubjects) {
                elements.analysisSubjectSelect.value = exam.subject || 'all';
            }

            elements.analysisContextInfo.innerHTML = `
                <span class="context-label">পরীক্ষা:</span>
                <span class="context-value">${exam.name}</span>
                <span class="context-divider">|</span>
                <span class="context-label">বিষয়:</span>
                <span class="context-value">${exam.subject}</span>
            `;
        }
    }
}

function syncAnalysisMaxMarks() {
    if (!elements.analysisMaxMarks || !elements.analysisType) return;

    const subject = elements.analysisSubjectSelect?.value;
    const type = elements.analysisType.value;
    let maxMarks = 100;

    // 1. Determine Max Marks from Config or Defaults
    if (subject && subject !== 'all') {
        const config = state.subjectConfigs[subject];
        if (config) {
            maxMarks = config[type] || DEFAULT_SUBJECT_CONFIG[type] || 100;
        } else {
            maxMarks = DEFAULT_SUBJECT_CONFIG[type] || 100;
        }
    } else {
        maxMarks = DEFAULT_SUBJECT_CONFIG[type] || 100;
    }

    // 2. Ensure value is integer
    maxMarks = parseInt(maxMarks);

    // 3. Update dropdown UI
    let exists = false;
    for (const option of elements.analysisMaxMarks.options) {
        if (parseInt(option.value) === maxMarks) {
            exists = true;
            break;
        }
    }

    if (!exists) {
        const newOption = new Option(`মার্কস: ${maxMarks}`, maxMarks);
        elements.analysisMaxMarks.add(newOption);
    }

    elements.analysisMaxMarks.value = maxMarks;
}

function transitionToAnalysis(student) {
    if (!student) return;

    // 1. Switch to analysis view
    state.currentView = 'analysis';

    // 2. Update view buttons UI
    elements.viewButtons?.forEach(btn => {
        if (btn.dataset.view === 'analysis') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 3. Perform analysis
    const currentOptions = {
        preserveExamSelect: elements.analysisExamSelect?.value,
        preserveSubjectSelect: elements.analysisSubjectSelect?.value,
        preserveSessionSelect: elements.analysisSessionSelect?.value
    };
    handleAnalysis(student, currentOptions);

    // 4. Update UI - clear search results
    if (elements.globalSearchResults) elements.globalSearchResults.style.display = 'none';
    if (elements.analysisSearchResults) elements.analysisSearchResults.style.display = 'none';
    if (elements.searchInput) elements.searchInput.value = '';

    // 5. Update main views visibility
    updateViews();

    // 6. Scroll to analysis section immediately
    setTimeout(() => {
        const analysisSection = document.getElementById('analysisView') || document.querySelector('.analysis-view');
        if (analysisSection) {
            analysisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, 100);
}

function refreshAnalysisChart() {
    const history = state.currentAnalyzedHistory || [];
    const sessionFilter = elements.analysisSessionSelect?.value;
    const subjectFilter = elements.analysisSubjectSelect?.value;
    const examFilter = elements.analysisExamSelect?.value;

    const chartType = elements.analysisType?.value || 'total';
    const reportContent = document.getElementById('analysisReportContent');

    // Case 1: Specific Exam Selected -> Show All Subjects for that Exam
    if (examFilter && examFilter !== 'all') {
        const selectedExam = state.savedExams.find(e => e.docId === examFilter);
        if (selectedExam && selectedExam.studentData) {
            const studentId = state.currentAnalyzedStudent?.id;
            const studentGroup = state.currentAnalyzedStudent?.group;

            // Find this student in exams with the same Name, respecting the subject filter
            const examEntries = state.savedExams.filter(e =>
                e.name === selectedExam.name &&
                (subjectFilter === 'all' || e.subject === subjectFilter)
            )
                .map(e => {
                    const studentRecord = e.studentData.find(s => String(s.id) === String(studentId) && s.group === studentGroup);
                    return studentRecord ? { ...studentRecord, examName: e.name, subject: e.subject } : null;
                }).filter(Boolean);

            if (examEntries.length > 0) {
                if (reportContent) reportContent.style.display = 'block';

                // For "All Subjects" view, we use the subject name as labels instead of exam names
                const chartData = examEntries.map(e => ({
                    examName: e.subject, // Swap label to subject
                    subject: e.subject,
                    [chartType]: e[chartType],
                    grade: e.grade
                }));

                setTimeout(() => {
                    initializeHistoryChart(elements.historyChart, chartData, {
                        chartType: chartType,
                        maxMarks: elements.analysisMaxMarks?.value || 100,
                        passMark: (elements.analysisMaxMarks?.value || 100) * 0.33
                    });
                }, 50);
                return;
            }
        }
    }

    // Case 2: "All Exams" Selected -> Show Historical Progress (existing logic)
    let filteredHistory = history;
    if (sessionFilter && sessionFilter !== 'all') {
        filteredHistory = filteredHistory.filter(h => (h.session || 'N/A') === sessionFilter);
    }
    if (subjectFilter && subjectFilter !== 'all') {
        filteredHistory = filteredHistory.filter(h => h.subject === subjectFilter);
    }

    // Get pass mark from config
    let passMark = (elements.analysisMaxMarks?.value || 100) * 0.33;
    const currentSub = state.currentAnalyzedStudent?.subject || state.currentSubject;
    const config = state.subjectConfigs[currentSub] || {};

    if (chartType === 'total' && config.total) passMark = Number(config.total) * 0.33;
    else if (chartType === 'written' && config.writtenPass) passMark = Number(config.writtenPass);
    else if (chartType === 'mcq' && config.mcqPass) passMark = Number(config.mcqPass);
    else if (chartType === 'practical' && config.practicalPass) passMark = Number(config.practicalPass);

    if (filteredHistory.length > 0) {
        if (reportContent) reportContent.style.display = 'block';

        setTimeout(() => {
            initializeHistoryChart(elements.historyChart, filteredHistory, {
                chartType: chartType,
                maxMarks: elements.analysisMaxMarks?.value || 100,
                passMark: passMark
            });
        }, 50);
    }
}

async function handleAnalysis(student, options = {}) {
    setLoading(true, '#analysisView');
    try {
        // Find full student info from all loaded data if missing context
        if (!student.class || !student.session || !student.subject) {
            const allExams = state.savedExams;
            for (const exam of allExams) {
                const found = exam.studentData?.find(s => String(s.id) === String(student.id) && s.group === student.group);
                if (found) {
                    student.class = student.class || found.class || exam.class;
                    student.session = student.session || found.session || exam.session;
                    student.subject = student.subject || found.subject || exam.subject;
                    // If we found them in the currently active exam, that's the best context
                    if (exam.name === state.currentExamName) break;
                }
            }
        }

        // Fallbacks
        if (!student.subject) student.subject = state.currentSubject;
        if (!student.class) student.class = state.currentExamClass;
        if (!student.session) student.session = state.currentExamSession;

        // Fetch session-wide students for navigation if needed
        if (student.session && (!state.currentSessionStudents.length || state.currentSessionStudents[0].session !== student.session)) {
            const allInSession = await handleCandidateSearch('', student.session);
            // Sort by Group Priority (Science -> Business -> Humanities) and then ID
            state.currentSessionStudents = sortStudentData(allInSession, 'id', 'roll-asc');
        }

        state.currentAnalyzedStudent = student;

        const history = await handleHistorySearch(student.id, student.group);
        state.currentAnalyzedHistory = history;

        renderStudentHistory(elements.studentDetails, history, student);

        // Refresh the reference as it's now dynamically recreated inside studentDetails for alignment
        elements.analysisContextInfo = document.getElementById('analysisContextInfo');

        // Update Nav Roll Labels
        updateNavRolls(student);

        // Populate Session/Subject Dropdowns with student context for auto-selection
        populateComparisonDropdowns(history, student, options);

        // Sync max marks for the initial view
        syncAnalysisMaxMarks();

        // Update Chart
        if (history.length > 0) {
            refreshAnalysisChart();
        }
        
        // Scroll into view smoothly after a short delay to allow rendering
        setTimeout(() => {
            const reportContent = document.getElementById('analysisReportContent');
            if (reportContent) {
                // Determine a slight offset calculation by using getBoundingClientRect
                const topPos = reportContent.getBoundingClientRect().top + window.scrollY - 80;
                window.scrollTo({
                    top: topPos,
                    behavior: 'smooth'
                });
            }
        }, 100);
    } catch (error) {
        console.error('Analysis error:', error);
    } finally {
        setLoading(false, '#analysisView');
    }
}

function updateNavRolls(student) {
    if (!state.currentSessionStudents || !state.currentSessionStudents.length) return;

    const currentIndex = state.currentSessionStudents.findIndex(s =>
        String(s.id) === String(student.id) && s.group === student.group
    );

    // Update current roll display
    if (elements.currentRollNum) {
        elements.currentRollNum.textContent = student.id;
        const container = elements.currentRollNum.parentElement;
        if (container) {
            container.classList.remove('nav-roll-update');
            void container.offsetWidth; // Force reflow
            container.classList.add('nav-roll-update');
        }
    }

    if (elements.prevRollBtn) {
        const prev = state.currentSessionStudents[currentIndex - 1];
        elements.prevRollBtn.disabled = !prev;
        if (elements.prevRollNum) elements.prevRollNum.textContent = prev ? prev.id : '';
    }

    if (elements.nextRollBtn) {
        const next = state.currentSessionStudents[currentIndex + 1];
        elements.nextRollBtn.disabled = !next;
        if (elements.nextRollNum) elements.nextRollNum.textContent = next ? next.id : '';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
