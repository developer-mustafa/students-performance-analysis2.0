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
    renderStats, renderGroupStats, renderFailedStudents, renderTable, toggleTheme,
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
        if (state.defaultExamId) {
            const defaultExam = exams.find(e => e.docId === state.defaultExamId);
            if (defaultExam) {
                state.studentData = defaultExam.studentData || [];
                state.currentExamName = defaultExam.name;
                state.currentSubject = defaultExam.subject;
                state.currentExamSession = defaultExam.session;
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
        metaElement: elements.groupStatsHeaderMeta
    });
    renderFailedStudents(elements.failedStudentsContainer, filteredData, {
        ...subjectOptions,
        metaElement: elements.failedHeaderMeta
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
            state.studentData = exam.studentData || [];
            state.currentSubject = exam.subject;
            state.currentExamSession = exam.session;
            state.isViewingSavedExam = true;
            updateViews();
            showNotification(`${exam.name} লোড হয়েছে`);
        },
        onEdit: (exam) => {
            elements.editExamDocId.value = exam.docId;
            elements.editExamName.value = exam.name;

            // Populate subjects based on class
            populateSubjectDropdown(elements.editSubjectName, exam.class, exam.subject);

            elements.editExamClass.value = exam.class || '';
            elements.editExamSession.value = exam.session || '';
            elements.editExamModal.style.display = 'block';
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
            const candidates = await handleCandidateSearch(query);
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

    document.addEventListener('click', () => {
        elements.reportDropdownMenu?.classList.remove('show');
    });

    // Downloads
    elements.downloadChartBtn?.addEventListener('click', () => handleChartDownload(`${state.currentExamName}-${state.currentSubject}.png`));
    elements.downloadExcelBtn?.addEventListener('click', () => exportToExcel(state.studentData, `${state.currentExamName}.xlsx`, state.currentSubject));

    // Toolbar Downloads & Print
    elements.downloadBtn?.addEventListener('click', () => {
        if (state.currentView === 'chart') {
            handleChartDownload(`${state.currentExamName}-${state.currentSubject}.png`);
        } else if (state.currentView === 'table') {
            const tableContainer = document.getElementById('tableView');
            if (tableContainer) {
                captureElementAsImage(tableContainer, `ফলাফল-টেবিল-${state.currentExamName}.png`);
            }
        } else if (state.currentView === 'analysis') {
            const analysisReport = document.getElementById('analysisReportContent');
            if (analysisReport) {
                captureElementAsImage(analysisReport, `শিক্ষার্থী-এনালাইসিস-${state.currentAnalyzedStudent?.name || 'রিপোর্ট'}.png`);
            }
        }
    });
    elements.printBtn?.addEventListener('click', () => window.print());
    elements.downloadFailedBtn?.addEventListener('click', () => captureElementAsImage(elements.failedStudentsContainer, `failed-students-${state.currentExamName}.png`));
    elements.downloadGroupStatsBtn?.addEventListener('click', () => captureElementAsImage(elements.groupStatsContainer, `group-stats-${state.currentExamName}.png`));

    // Inline Analysis Download
    elements.inlineDownloadBtn?.addEventListener('click', () => {
        const report = document.getElementById('analysisReportContent');
        if (report) captureElementAsImage(report, `student-analysis-${elements.analysisStudentId.value}.png`);
    });

    // Auth
    elements.adminToggle?.addEventListener('click', async () => {
        if (state.currentUser) {
            elements.profileModal.style.display = 'block';
        } else {
            await handleLogin();
        }
    });

    elements.modalLogoutBtn?.addEventListener('click', async () => {
        await handleLogout();
        elements.profileModal.style.display = 'none';
        updateProfileUI(null, false, false, 'guest');
    });

    elements.closeProfileBtn?.addEventListener('click', () => elements.profileModal.style.display = 'none');
    elements.closeProfileIcon?.addEventListener('click', () => elements.profileModal.style.display = 'none');

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
            showNotification(`পুনরায় পরবর্তী কাঙ্খিত (${nextStudent.group}) গ্রুপ থেকে দেখানো হচ্ছে`, 'info');
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
            const candidates = await handleCandidateSearch(query, state.currentExamSession);
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
            handleCandidateSearch(studentId, state.currentExamSession).then(candidates => {
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
                handleCandidateSearch(studentId, state.currentExamSession).then(candidates => {
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
        syncAnalysisMaxMarks();
        refreshAnalysisChart();
    });

    elements.downloadAnalysisImage?.addEventListener('click', () => {
        const target = document.getElementById('analysisReportContent');
        if (target) {
            captureElementAsImage(target, `ফলাফল-বিশ্লেষণ-${state.currentAnalyzedStudent?.name || 'শিক্ষার্থী'}.png`);
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

        elements.saveExamModal.style.display = 'block';
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
            elements.saveExamModal.style.display = 'none';
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
            elements.editExamModal.style.display = 'none';
            await fetchExams();
            renderSavedExams();
        }
    });

    elements.closeModalBtn?.addEventListener('click', () => elements.saveExamModal.style.display = 'none');
    elements.closeEditModal?.addEventListener('click', () => elements.editExamModal.style.display = 'none');

    // Modal Class Selection Listeners
    elements.examClass?.addEventListener('change', (e) => {
        populateSubjectDropdown(elements.examSubject, e.target.value);
    });

    elements.editExamClass?.addEventListener('change', (e) => {
        populateSubjectDropdown(elements.editSubjectName, e.target.value);
    });

    // Class Mapping
    elements.openClassMappingBtn?.addEventListener('click', () => {
        elements.classSubjectMappingModal.style.display = 'block';
    });

    elements.closeClassMappingBtn?.addEventListener('click', () => {
        elements.classSubjectMappingModal.style.display = 'none';
    });

    // User Management
    elements.toolbarUserMgmtBtn?.addEventListener('click', () => {
        handleUserManagement();
        elements.userManagementModal.style.display = 'block';
    });

    elements.closeUserManagementBtn?.addEventListener('click', () => {
        elements.userManagementModal.style.display = 'none';
    });

    // Subject Settings (inside User Management)
    elements.subjectSettingsBtn?.addEventListener('click', () => {
        elements.subjectSettingsModal.style.display = 'block';
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

    // Ensure it starts visible but properly styled
    if (elements.savedExamsCollapse) {
        elements.savedExamsCollapse.style.display = 'block';
    }
}

function populateComparisonDropdowns(history, student) {
    if (!elements.analysisSessionSelect || !elements.analysisSubjectSelect) return;

    // Get unique sessions
    const sessions = [...new Set(history.map(h => h.session || 'N/A'))].filter(Boolean);
    elements.analysisSessionSelect.innerHTML = '<option value="all">সকল সেশন</option>' +
        sessions.map(s => `<option value="${s}">${s}</option>`).join('');

    // Auto-select student's session if available
    if (student && student.session) {
        elements.analysisSessionSelect.value = student.session;
    }

    // Populate subject dropdown (initially all)
    populateAnalysisSubjectDropdown();

    // Auto-select current app subject if it exists in the history
    if (state.currentSubject) {
        // Check if subject exists in the newly populated dropdown
        const options = Array.from(elements.analysisSubjectSelect.options);
        const hasSubject = options.some(opt => opt.value === state.currentSubject);
        if (hasSubject) {
            elements.analysisSubjectSelect.value = state.currentSubject;
        }
    }
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
}

function refreshAnalysisChart() {
    const history = state.currentAnalyzedHistory || [];
    const sessionFilter = elements.analysisSessionSelect?.value;
    const subjectFilter = elements.analysisSubjectSelect?.value;

    let filteredHistory = history;
    if (sessionFilter && sessionFilter !== 'all') {
        filteredHistory = filteredHistory.filter(h => (h.session || 'N/A') === sessionFilter);
    }
    if (subjectFilter && subjectFilter !== 'all') {
        filteredHistory = filteredHistory.filter(h => h.subject === subjectFilter);
    }

    const reportContent = document.getElementById('analysisReportContent');
    if (filteredHistory.length > 0) {
        // SHOW CONTENT FIRST so canvas has dimensions
        if (reportContent) reportContent.style.display = 'block';

        setTimeout(() => {
            initializeHistoryChart(elements.historyChart, filteredHistory, {
                chartType: elements.analysisType?.value || 'total',
                maxMarks: elements.analysisMaxMarks?.value || 100,
                // Pass mark is also derived from config if needed, default to 33%
                passMark: (elements.analysisMaxMarks?.value || 100) * 0.33
            });
        }, 50);
    }
}

async function handleAnalysis(student) {
    setLoading(true, '#analysisView');
    try {
        // Enforce subject if missing (from current app state)
        if (!student.subject) student.subject = state.currentSubject;
        if (!student.class) {
            // Find student in current data to get more info
            const fullStudent = state.studentData.find(s => String(s.id) === String(student.id) && s.group === student.group);
            if (fullStudent) {
                student.class = fullStudent.class;
                student.session = fullStudent.session;
            }
        }

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

        // Update Nav Roll Labels
        updateNavRolls(student);

        // Populate Session/Subject Dropdowns with student context for auto-selection
        populateComparisonDropdowns(history, student);

        // Sync max marks for the initial view
        syncAnalysisMaxMarks();

        // Update Latest Exam Label
        if (history.length > 0) {
            const latest = history[history.length - 1]; // Sorted by date asc
            if (elements.latestExamLabel) elements.latestExamLabel.textContent = latest.examName || 'N/A';
            refreshAnalysisChart();
        } else {
            if (elements.latestExamLabel) elements.latestExamLabel.textContent = 'N/A';
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
