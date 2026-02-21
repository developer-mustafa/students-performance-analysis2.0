/**
 * Main Application Entry Point
 * Refactored into ES Modules for reliability and maintainability
 */

import './styles/main.css';

// Core Modules
import { state, DEFAULT_SUBJECT_CONFIG } from './js/modules/state.js';
import { elements, initDOMReferences, setLoading, updateSyncStatus, updateProfileUI } from './js/modules/uiManager.js';
import { setupAuthListener, handleLogin, handleLogout } from './js/modules/authManager.js';
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
import { showNotification, filterStudentData, sortStudentData, calculateStatistics, convertToEnglishDigits, formatDateBengali } from './js/utils.js';
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
import { getSavedExams, subscribeToSettings, getSettings, subscribeToSubjectConfigs } from './js/firestoreService.js';

import { handleUserManagement } from './js/modules/userMgmtManager.js';
import { initSubjectConfigManager } from './js/modules/subjectConfigManager.js';
import { initClassMappingManager, populateSubjectDropdown } from './js/modules/classMappingManager.js';

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

        const theme = await loadThemePreference();
        applyTheme(theme === 'dark', elements.themeToggle);

        // Fetch settings and exams first to know the default
        const [settings, exams] = await Promise.all([getSettings(), fetchExams()]);
        if (settings) state.defaultExamId = settings.defaultExamId;

        let defaultLoaded = false;
        // 1. Check for manually loaded exam (Overrides default)
        const loadedExamId = localStorage.getItem('loadedExamId');
        if (loadedExamId) {
            const loadedExam = exams.find(e => e.docId === loadedExamId);
            if (loadedExam) {
                state.studentData = loadedExam.studentData || [];
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
                state.studentData = defaultExam.studentData || [];
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
                updateViews();
                renderSavedExams();
            }
        });

        initEventListeners();

        // Real-time Data Sync
        state.onDataUpdateUnsubscribe = subscribeToDataUpdates((data) => {
            if (state.isViewingSavedExam) return;
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
                        state.studentData = pinnedExam.studentData || [];
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

        initSubjectConfigManager();
        initClassMappingManager();

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

    // Build subject-specific options from current subject's config
    // Normalized lookup to handle Bengali character variants (ি↔ী, ু↔ূ, etc.)
    const normalizeBn = (str) => str ? str.replace(/ী/g, 'ি').replace(/ূ/g, 'ু').replace(/ৈ/g, 'ে').replace(/ৌ/g, 'ো').toLowerCase().trim() : '';

    let subjectConfig = state.subjectConfigs[state.currentSubject]; // Exact match first
    if (!subjectConfig) {
        // Fuzzy match: normalize both sides
        const normalizedCurrent = normalizeBn(state.currentSubject);
        const matchedKey = Object.keys(state.subjectConfigs)
            .find(key => key !== 'updatedAt' && normalizeBn(key) === normalizedCurrent);
        subjectConfig = matchedKey ? state.subjectConfigs[matchedKey] : {};
    }

    const subjectOptions = {
        writtenPass: Number(subjectConfig.writtenPass) || FAILING_THRESHOLD.written,
        mcqPass: Number(subjectConfig.mcqPass) || FAILING_THRESHOLD.mcq,
        totalPass: Number(subjectConfig.total) * 0.33 || FAILING_THRESHOLD.total,
        criteria: state.currentChartType
    };


    const filteredData = filterStudentData(state.studentData, {
        group: state.currentGroupFilter,
        grade: state.currentGradeFilter,
        searchTerm: state.currentSearchTerm
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
        examName: state.currentExamName,
        subjectName: state.currentSubject
    });

    elements.chartTitle.textContent = getChartTitle(state.currentChartType, state.currentExamName, state.currentSubject);

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
        onEdit: (exam) => {
            elements.editExamDocId.value = exam.docId;
            elements.editExamName.value = exam.name;

            // Populate subjects based on class
            populateSubjectDropdown(elements.editSubjectName, exam.class, exam.subject);

            elements.editExamClass.value = exam.class || '';
            elements.editExamSession.value = exam.session || '';
            elements.editExamModal.classList.add('active');
        },
        onDelete: async (exam) => {
            if (confirm('আপনি কি নিশ্চিত যে আপনি এই পরীক্ষাটি মুছতে চান?')) {
                const success = await deleteExam(exam.docId);
                if (success) {
                    await fetchExams();
                    renderSavedExams();
                }
            }
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
            updateViews();
        });
    });

    elements.gradeFilters?.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.gradeFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentGradeFilter = btn.dataset.grade;
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
    elements.downloadExcelBtn?.addEventListener('click', () => exportToExcel(state.studentData, `${state.currentExamName}.xlsx`, state.currentSubject));

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
        const normalizeBn = (str) => str ? str.replace(/ী/g, 'ি').replace(/ূ/g, 'ু').replace(/ৈ/g, 'ে').replace(/ৌ/g, 'ো').toLowerCase().trim() : '';
        let subjectConfig = state.subjectConfigs[state.currentSubject];
        if (!subjectConfig) {
            const normalizedCurrent = normalizeBn(state.currentSubject);
            const matchedKey = Object.keys(state.subjectConfigs)
                .find(key => key !== 'updatedAt' && normalizeBn(key) === normalizedCurrent);
            subjectConfig = matchedKey ? state.subjectConfigs[matchedKey] : {};
        }
        const subjectOptions = {
            writtenPass: Number(subjectConfig.writtenPass) || FAILING_THRESHOLD.written,
            mcqPass: Number(subjectConfig.mcqPass) || FAILING_THRESHOLD.mcq,
            totalPass: Number(subjectConfig.total) * 0.33 || FAILING_THRESHOLD.total,
        };
        printAllStudents(filterStudentData(state.studentData, {
            group: state.currentGroupFilter,
            grade: state.currentGradeFilter,
            searchTerm: state.currentSearchTerm
        }, subjectOptions), {
            ...subjectOptions,
            examName: state.currentExamName,
            subjectName: state.currentSubject,
            groupFilter: state.currentGroupFilter,
            gradeFilter: state.currentGradeFilter,
            sortBy: state.currentChartType,
            sortOrder: state.currentSortOrder
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
        const normalizeBn = (str) => str ? str.replace(/ী/g, 'ি').replace(/ূ/g, 'ু').replace(/ৈ/g, 'ে').replace(/ৌ/g, 'ো').toLowerCase().trim() : '';
        let subjectConfig = state.subjectConfigs[state.currentSubject];
        if (!subjectConfig) {
            const normalizedCurrent = normalizeBn(state.currentSubject);
            const matchedKey = Object.keys(state.subjectConfigs)
                .find(key => key !== 'updatedAt' && normalizeBn(key) === normalizedCurrent);
            subjectConfig = matchedKey ? state.subjectConfigs[matchedKey] : {};
        }
        const subjectOptions = {
            writtenPass: Number(subjectConfig.writtenPass) || FAILING_THRESHOLD.written,
            mcqPass: Number(subjectConfig.mcqPass) || FAILING_THRESHOLD.mcq,
            totalPass: Number(subjectConfig.total) * 0.33 || FAILING_THRESHOLD.total,
        };
        printFailedStudents(filterStudentData(state.studentData, {
            group: state.currentGroupFilter,
            grade: state.currentGradeFilter,
            searchTerm: state.currentSearchTerm
        }, subjectOptions), {
            ...subjectOptions,
            examName: state.currentExamName,
            subjectName: state.currentSubject
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
    elements.adminToggle?.addEventListener('click', async () => {
        if (state.currentUser) {
            elements.profileModal.classList.add('active');
        } else {
            await handleLogin();
        }
    });

    elements.modalLogoutBtn?.addEventListener('click', async () => {
        await handleLogout();
        elements.profileModal.classList.remove('active');
        updateProfileUI(null, false, false, 'guest');
    });

    elements.closeProfileBtn?.addEventListener('click', () => elements.profileModal.classList.remove('active'));
    elements.closeProfileIcon?.addEventListener('click', () => elements.profileModal.classList.remove('active'));

    // Analysis View Navigation
    elements.prevRollBtn?.addEventListener('click', () => navigateRoll(-1));
    elements.nextRollBtn?.addEventListener('click', () => navigateRoll(1));

    document.addEventListener('keydown', (e) => {
        if (state.currentView !== 'analysis') return;

        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
        handleAnalysis(nextStudent);
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
        if (!state.isAdmin) {
            showNotification('শুধুমাত্র অ্যাডমিনরা এই ফিচারটি ব্যবহার করতে পারবেন', 'warning');
            return;
        }

        // Reset dropdown
        if (elements.examClass) elements.examClass.value = '';
        if (elements.examSubject) {
            elements.examSubject.innerHTML = '<option value="">আগে শ্রেণি সিলেক্ট করুন</option>';
            elements.examSubject.disabled = true;
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
    elements.closeEditModal?.addEventListener('click', () => elements.editExamModal.classList.remove('active'));

    // Modal Class Selection Listeners
    elements.examClass?.addEventListener('change', (e) => {
        populateSubjectDropdown(elements.examSubject, e.target.value);
    });

    elements.editExamClass?.addEventListener('change', (e) => {
        populateSubjectDropdown(elements.editSubjectName, e.target.value);
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

    // Saved Exams Section Toggle
    elements.savedExamsToggle?.addEventListener('click', () => {
        const isCollapsed = elements.savedExamsCollapse.style.display === 'none';
        elements.savedExamsCollapse.style.display = isCollapsed ? 'block' : 'none';

        // Rotate icon
        if (elements.savedExamsIcon) {
            elements.savedExamsIcon.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    });

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
            state.studentData = exam.studentData || [];
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

function populateComparisonDropdowns(history, student) {
    if (!elements.analysisSessionSelect || !elements.analysisSubjectSelect || !elements.analysisExamSelect) return;

    // 1. Sessions (Strictly limited to student's current session)
    let sessions = [...new Set(history.map(h => h.session || 'N/A'))].filter(Boolean);

    if (student && student.session) {
        sessions = sessions.filter(s => s.toLowerCase() === student.session.toLowerCase());
    }

    elements.analysisSessionSelect.innerHTML = '<option value="all">সকল সেশন</option>' +
        sessions.map(s => `<option value="${s}">${s}</option>`).join('');

    if (student && student.session) {
        elements.analysisSessionSelect.value = student.session;
    }

    // 2. Exams for the Student's Class & Session (Dynamic Exam Options)
    const studentClass = student?.class || state.currentExamClass;
    const studentSession = student?.session || state.currentExamSession;

    const relevantExams = state.savedExams.filter(e => {
        let match = true;
        if (studentClass) {
            match = match && (e.class || '').toLowerCase() === studentClass.toLowerCase();
        }
        if (studentSession) {
            match = match && (e.session || '').toLowerCase() === studentSession.toLowerCase();
        }
        return match;
    });

    elements.analysisExamSelect.innerHTML = '<option value="all">সকল পরীক্ষা (ক্রমানুসারে)</option>' +
        relevantExams.map(e => `<option value="${e.docId}">${e.name} (${e.subject})</option>`).join('');

    // Pre-select current exam if it matches
    const currentExam = state.savedExams.find(e => e.name === state.currentExamName && e.subject === state.currentSubject);
    if (currentExam) {
        elements.analysisExamSelect.value = currentExam.docId;
    } else {
        elements.analysisExamSelect.value = 'all';
    }

    // 3. Subjects
    populateAnalysisSubjectDropdown();

    const targetSubject = student?.subject || state.currentSubject;
    if (targetSubject) {
        const options = Array.from(elements.analysisSubjectSelect.options);
        const hasSubject = options.some(opt => opt.value === targetSubject);
        if (hasSubject) {
            elements.analysisSubjectSelect.value = targetSubject;
        }
    }

    // Initialize context info text
    updateAnalysisHeaderContext();
}

function populateAnalysisSubjectDropdown() {
    if (!elements.analysisSubjectSelect) return;
    const history = state.currentAnalyzedHistory || [];
    const selectedSession = elements.analysisSessionSelect?.value;

    let filteredHistory = history;
    if (selectedSession && selectedSession !== 'all') {
        filteredHistory = history.filter(h => (h.session || 'N/A') === selectedSession);
    }

    const subjects = [...new Set(filteredHistory.map(h => h.subject))].filter(Boolean);
    elements.analysisSubjectSelect.innerHTML = '<option value="all">সকল বিষয়</option>' +
        subjects.map(s => `<option value="${s}">${s}</option>`).join('');
}

/**
 * Update the dynamic context text in the analysis header (red box area)
 * and synchronize dropdowns if needed.
 */
function updateAnalysisHeaderContext(triggerSource = 'exam') {
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
            // Auto-select subject for this exam (unless already matching)
            if (triggerSource === 'exam') {
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
    handleAnalysis(student);

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

async function handleAnalysis(student) {
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
        populateComparisonDropdowns(history, student);

        // Sync max marks for the initial view
        syncAnalysisMaxMarks();

        // Update Chart
        if (history.length > 0) {
            refreshAnalysisChart();
        }
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
