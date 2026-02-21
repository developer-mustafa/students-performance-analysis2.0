/**
 * UI Management Module
 */

import { state } from './state.js';
import { toggleTheme, applyTheme } from '../uiComponents.js';

export const elements = {
    chartTypeSelect: null,
    sortOrderSelect: null,
    reportDropdownBtn: null,
    reportDropdownMenu: null,
    downloadChartBtn: null,
    downloadExcelBtn: null,
    groupFilters: null,
    gradeFilters: null,
    searchInput: null,
    globalSearchResults: null,
    statsContainer: null,
    groupStatsContainer: null,
    failedStudentsContainer: null,
    chartCanvas: null,
    themeToggle: null,
    chartTitle: null,
    failedHeaderMeta: null,
    groupStatsHeaderMeta: null,
    jsonFileInput: null,
    downloadTemplateBtn: null,
    saveAnalysisBtn: null,
    savedExamsList: null,
    saveExamModal: null,
    closeModalBtn: null,
    saveExamForm: null,
    jsonPreview: null,
    chartView: null,
    tableView: null,
    tableBody: null,
    viewButtons: null,
    syncStatus: null,
    loadingOverlay: null,
    analysisView: null,
    analysisStudentId: null,
    analyzeBtn: null,
    historyChart: null,
    studentDetails: null,
    analysisType: null,
    analysisMaxMarks: null,
    analysisSearchResults: null,
    printBtn: null,
    prevRollBtn: null,
    nextRollBtn: null,
    prevRollNum: null,
    currentRollNum: null,
    nextRollNum: null,
    analysisSessionSelect: null,
    analysisSubjectSelect: null,
    downloadAnalysisImage: null,
    latestExamLabel: null,
    toolbarUserMgmtBtn: null,
    inlineSearchPanel: null,
    inlineSearchCandidates: null,
    inlineHistorySection: null,
    inlineStudentDetails: null,
    inlineHistoryChart: null,
    inlineAnalysisType: null,
    inlineAnalysisMaxMarks: null,
    inlineDownloadBtn: null,
    downloadBtn: null,
    downloadFailedBtn: null,
    downloadGroupStatsBtn: null,
    adminToggle: null,
    editExamModal: null,
    closeEditModal: null,
    editExamForm: null,
    editExamDocId: null,
    editExamName: null,
    editSubjectName: null,
    editExamClass: null,
    editExamSession: null,
    openClassMappingBtn: null,
    classSubjectMappingModal: null,
    closeClassMappingBtn: null,
    mappingClassSelect: null,
    mappingSubjectInput: null,
    addMappingSubjectBtn: null,
    mappingSubjectsContainer: null,
    saveMappingBtn: null,
    examClass: null,
    examSubject: null,
    confirmModal: null,
    confirmCancelBtn: null,
    confirmDeleteBtn: null,
    confirmMessage: null,
    savedExamsToggle: null,
    savedExamsCollapse: null,
    savedExamsIcon: null,
    savedExamsPagination: null,
    savedExamsClassFilters: null,
    savedExamsCount: null,
    chartSectionToggle: null,
    chartSectionCollapse: null,
    chartSectionIcon: null,
    profileModal: null,
    userName: null,
    userEmail: null,
    userPhoto: null,
    modalLogoutBtn: null,
    closeProfileBtn: null,
    closeProfileIcon: null,
    userManagementModal: null,
    closeUserManagementBtn: null,
    userListBody: null,
    subjectSettingsBtn: null,
    subjectSettingsModal: null,
    closeSubjectSettingsBtn: null,
    subjectSearch: null,
    savedConfigsList: null,
    addNewSubjectBtn: null,
    configSubjectName: null,
    configWrittenMax: null,
    configWrittenPass: null,
    configMcqMax: null,
    configMcqPass: null,
    configPracticalMax: null,
    configPracticalPass: null,
    configPracticalOptional: null,
    configTotalMax: null,
    calcTotalPreview: null,
    deleteSubjectBtn: null,
    saveSubjectConfigBtn: null,
    subjectCount: null,
    resetFiltersBtn: null
};

export function updateProfileUI(user, isAdmin, isSuperAdmin, role) {
    const btn = elements.adminToggle;
    if (btn) {
        if (user) {
            btn.classList.add('logged-in');
            const roleLabel = isSuperAdmin ? ' (Super Admin)' : (isAdmin ? ' (Admin)' : '');
            btn.innerHTML = `<i class="fas fa-lock-open"></i> <span class="dm-btn-text">${user.displayName || 'User'}${roleLabel}</span>`;
            if (elements.userName) elements.userName.innerText = user.displayName || 'User';
            if (elements.userEmail) elements.userEmail.innerText = `${user.email} [${role.toUpperCase()}]`;
            if (elements.userPhoto) {
                elements.userPhoto.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=random`;
            }
        } else {
            btn.classList.remove('logged-in');
            btn.innerHTML = '<i class="fab fa-google"></i> <span class="dm-btn-text">লগইন</span>';
        }
    }

    if (elements.toolbarUserMgmtBtn) {
        elements.toolbarUserMgmtBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';
    }

    if (isAdmin) {
        document.body.classList.add('is-admin');
        if (elements.saveExamModal) elements.saveExamModal.classList.add('admin-mode');
    } else {
        document.body.classList.remove('is-admin');
        if (elements.saveExamModal) elements.saveExamModal.classList.remove('admin-mode');
    }
}

export function initDOMReferences() {
    elements.chartTypeSelect = document.getElementById('chartType');
    elements.sortOrderSelect = document.getElementById('sortOrder');
    elements.reportDropdownBtn = document.getElementById('reportDropdownBtn');
    elements.reportDropdownMenu = document.getElementById('reportDropdownMenu');
    elements.downloadChartBtn = document.getElementById('downloadChartBtn');
    elements.downloadExcelBtn = document.getElementById('downloadExcelBtn');
    elements.groupFilters = document.querySelectorAll('.group-btn');
    elements.gradeFilters = document.querySelectorAll('.grade-btn');
    elements.searchInput = document.getElementById('searchInput');
    elements.globalSearchResults = document.getElementById('globalSearchResults');
    elements.statsContainer = document.getElementById('statsContainer');
    elements.groupStatsContainer = document.getElementById('groupStatsContainer');
    elements.failedStudentsContainer = document.getElementById('failedStudentsContainer');
    elements.chartCanvas = document.getElementById('performanceChart');
    elements.themeToggle = document.getElementById('themeToggle');
    elements.chartTitle = document.getElementById('chartTitle');
    elements.failedHeaderMeta = document.getElementById('failedHeaderMeta');
    elements.groupStatsHeaderMeta = document.getElementById('groupStatsHeaderMeta');
    elements.jsonFileInput = document.getElementById('jsonFileInput');
    elements.downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
    elements.saveAnalysisBtn = document.getElementById('saveAnalysisBtn');
    elements.savedExamsList = document.getElementById('savedExamsList');
    elements.saveExamModal = document.getElementById('saveExamModal');
    elements.closeModalBtn = document.getElementById('closeModalBtn');
    elements.saveExamForm = document.getElementById('saveExamForm');
    elements.jsonPreview = document.getElementById('jsonPreview');
    elements.chartView = document.getElementById('chartView');
    elements.tableView = document.getElementById('tableView');
    elements.tableBody = document.getElementById('tableBody');
    elements.viewButtons = document.querySelectorAll('.view-btn[data-view]');
    elements.syncStatus = document.getElementById('syncStatus');
    elements.loadingOverlay = document.getElementById('loadingOverlay');
    elements.profileModal = document.getElementById('profileModal');
    elements.userName = document.getElementById('userName');
    elements.userEmail = document.getElementById('userEmail');
    elements.userPhoto = document.getElementById('userPhoto');
    elements.adminToggle = document.getElementById('adminToggle');
    elements.toolbarUserMgmtBtn = document.getElementById('toolbarUserMgmtBtn');
    elements.modalLogoutBtn = document.getElementById('modalLogoutBtn');
    elements.closeProfileBtn = document.getElementById('closeProfileBtn');
    elements.closeProfileIcon = document.getElementById('closeProfileIcon');

    // Analysis View Elements
    elements.analysisView = document.getElementById('analysisView');
    elements.analysisStudentId = document.getElementById('analysisStudentId');
    elements.analyzeBtn = document.getElementById('analyzeBtn');
    elements.historyChart = document.getElementById('historyChart');
    elements.studentDetails = document.getElementById('studentDetails');
    elements.analysisType = document.getElementById('analysisType');
    elements.analysisMaxMarks = document.getElementById('analysisMaxMarks');
    elements.analysisSearchResults = document.getElementById('analysisSearchResults');
    elements.printBtn = document.getElementById('printBtn');
    elements.prevRollBtn = document.getElementById('prevRollBtn');
    elements.nextRollBtn = document.getElementById('nextRollBtn');
    elements.prevRollNum = document.getElementById('prevRollNum');
    elements.currentRollNum = document.getElementById('currentRollNum');
    elements.nextRollNum = document.getElementById('nextRollNum');
    elements.analysisSessionSelect = document.getElementById('analysisSessionSelect');
    elements.analysisSubjectSelect = document.getElementById('analysisSubjectSelect');
    elements.downloadAnalysisImage = document.getElementById('downloadAnalysisImage');
    elements.latestExamLabel = document.getElementById('latestExamLabel');

    // Inline Search Elements
    elements.inlineSearchPanel = document.getElementById('inlineSearchPanel');
    elements.inlineSearchCandidates = document.getElementById('inlineSearchCandidates');
    elements.inlineHistorySection = document.getElementById('inlineHistorySection');
    elements.inlineStudentDetails = document.getElementById('inlineStudentDetails');
    elements.inlineHistoryChart = document.getElementById('inlineHistoryChart');
    elements.inlineAnalysisType = document.getElementById('inlineAnalysisType');
    elements.inlineAnalysisMaxMarks = document.getElementById('inlineAnalysisMaxMarks');
    elements.inlineDownloadBtn = document.getElementById('inlineDownloadBtn');

    // Download Buttons
    elements.downloadBtn = document.getElementById('downloadBtn');
    elements.downloadFailedBtn = document.getElementById('downloadFailedBtn');
    elements.downloadGroupStatsBtn = document.getElementById('downloadGroupStatsBtn');

    // Modal & Forms
    elements.editExamModal = document.getElementById('editExamModal');
    elements.closeEditModal = document.getElementById('closeEditModal');
    elements.editExamForm = document.getElementById('editExamForm');
    elements.editExamDocId = document.getElementById('editExamDocId');
    elements.editExamName = document.getElementById('editExamName');
    elements.editSubjectName = document.getElementById('editSubjectName');
    elements.editExamClass = document.getElementById('editExamClass');
    elements.editExamSession = document.getElementById('editExamSession');

    // Class Mapping
    elements.openClassMappingBtn = document.getElementById('openClassMappingBtn');
    elements.classSubjectMappingModal = document.getElementById('classSubjectMappingModal');
    elements.closeClassMappingBtn = document.getElementById('closeClassMappingBtn');
    elements.mappingClassSelect = document.getElementById('mappingClassSelect');
    elements.mappingSubjectInput = document.getElementById('mappingSubjectInput');
    elements.addMappingSubjectBtn = document.getElementById('addMappingSubjectBtn');
    elements.mappingSubjectsContainer = document.getElementById('mappingSubjectsContainer');
    elements.saveMappingBtn = document.getElementById('saveMappingBtn');

    // Exam Creation
    elements.examClass = document.getElementById('examClass');
    elements.examSubject = document.getElementById('examSubject');

    // Confirmation Modal
    elements.confirmModal = document.getElementById('confirmModal');
    elements.confirmCancelBtn = document.getElementById('confirmCancelBtn');
    elements.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    elements.confirmMessage = document.getElementById('confirmMessage');

    // Saved Exams Section
    elements.savedExamsToggle = document.getElementById('savedExamsToggle');
    elements.savedExamsCollapse = document.getElementById('savedExamsCollapse');
    elements.savedExamsIcon = document.getElementById('savedExamsIcon');
    elements.savedExamsPagination = document.getElementById('savedExamsPagination');
    elements.savedExamsClassFilters = document.getElementById('savedExamsClassFilters');
    elements.savedExamsCount = document.getElementById('savedExamsCount');

    // Chart Section Collapse
    elements.chartSectionToggle = document.getElementById('chartSectionToggle');
    elements.chartSectionCollapse = document.getElementById('chartSectionCollapse');
    elements.chartSectionIcon = document.getElementById('chartSectionIcon');

    // User Management
    elements.userManagementModal = document.getElementById('userManagementModal');
    elements.closeUserManagementBtn = document.getElementById('closeUserManagementBtn');
    elements.userListBody = document.getElementById('userListBody');
    elements.subjectSettingsBtn = document.getElementById('subjectSettingsBtn');
    elements.subjectSettingsModal = document.getElementById('subjectSettingsModal');
    elements.closeSubjectSettingsBtn = document.getElementById('closeSubjectSettingsBtn');
    elements.subjectSearch = document.getElementById('subjectSearch');
    elements.savedConfigsList = document.getElementById('savedConfigsList');
    elements.addNewSubjectBtn = document.getElementById('addNewSubjectBtn');
    elements.configSubjectName = document.getElementById('configSubjectName');
    elements.configWrittenMax = document.getElementById('configWrittenMax');
    elements.configWrittenPass = document.getElementById('configWrittenPass');
    elements.configMcqMax = document.getElementById('configMcqMax');
    elements.configMcqPass = document.getElementById('configMcqPass');
    elements.configPracticalMax = document.getElementById('configPracticalMax');
    elements.configPracticalPass = document.getElementById('configPracticalPass');
    elements.configPracticalOptional = document.getElementById('configPracticalOptional');
    elements.configTotalMax = document.getElementById('configTotalMax');
    elements.calcTotalPreview = document.getElementById('calcTotalPreview');
    elements.deleteSubjectBtn = document.getElementById('deleteSubjectBtn');
    elements.saveSubjectConfigBtn = document.getElementById('saveSubjectConfigBtn');
    elements.subjectCount = document.getElementById('subjectCount');
    elements.resetFiltersBtn = document.getElementById('resetFiltersBtn');
}

export function setLoading(isLoading, targetSelector = null) {
    if (!targetSelector) {
        state.isLoading = isLoading;
        if (elements.loadingOverlay) {
            if (isLoading) {
                elements.loadingOverlay.classList.remove('fade-out');
                elements.loadingOverlay.style.display = 'flex';
            } else {
                elements.loadingOverlay.classList.add('fade-out');
                setTimeout(() => {
                    elements.loadingOverlay.style.display = 'none';
                    elements.loadingOverlay.classList.remove('fade-out');
                }, 500);
            }
        }
        return;
    }

    const target = typeof targetSelector === 'string' ? document.querySelector(targetSelector) : targetSelector;
    if (!target) return;

    if (isLoading) {
        if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
        if (target.querySelector('.content-loading-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'content-loading-overlay';
        overlay.innerHTML = '<div class="loading-spinner spinner-sm"><i class="fas fa-spinner fa-spin"></i><span>লোড হচ্ছে...</span></div>';
        target.appendChild(overlay);
    } else {
        const overlay = target.querySelector('.content-loading-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 500);
        }
    }
}

export function updateSyncStatus(isOnline) {
    if (elements.syncStatus) {
        elements.syncStatus.innerHTML = isOnline
            ? '<i class="fas fa-cloud"></i> সিঙ্ক'
            : '<i class="fas fa-cloud-slash"></i> অফলাইন';
        elements.syncStatus.className = `sync-status ${isOnline ? 'online' : 'offline'}`;
    }
}
