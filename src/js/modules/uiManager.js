/**
 * UI Management Module
 */

import { state } from './state.js';
import { toggleTheme, applyTheme } from '../uiComponents.js';

export const elements = {
    chartTypeSelect: null,
    sortOrderSelect: null,
    downloadExcelBtn: null,
    appVersionBadge: null,
    headerVersionNumber: null,
    footerVersionNumber: null,
    footerDevCredit: null,
    footerDevContact: null,
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
    installAppBtn: null,
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
    
    // Analysis & Search Panels
    analysisView: null,
    analysisStudentId: null,
    analyzeBtn: null,
    historyChart: null,
    studentDetails: null,
    analysisType: null,
    analysisMaxMarks: null,
    analysisSearchResults: null,
    analysisSessionSelect: null,
    analysisSubjectSelect: null,
    analysisExamSelect: null,
    analysisContextInfo: null,
    downloadAnalysisImage: null,
    inlineSearchPanel: null,
    inlineSearchCandidates: null,
    inlineHistorySection: null,
    inlineStudentDetails: null,
    inlineHistoryChart: null,
    inlineAnalysisType: null,
    inlineAnalysisMaxMarks: null,
    inlineDownloadBtn: null,
    
    statSuperAdminCount: null,
    statAdminCount: null,
    statUserCount: null,
    userListBody: null,
    userMgmtSearch: null,
    usersPage: null,
    mobileAdminToggle: null,
    
    // Dashboard Controls
    printBtn: null,
    downloadBtn: null,
    prevRollBtn: null,
    nextRollBtn: null,
    currentRollNum: null,
    prevRollNum: null,
    nextRollNum: null,

    // Notice Board Elements
    noticeBoardContainer: null
};

export function updateProfileUI(user, isAdmin, isSuperAdmin, role) {
    const btn = elements.adminToggle;
    if (btn) {
        if (user) {
            btn.classList.add('logged-in');
            const roleLabel = isSuperAdmin ? ' (Super Admin)' : (isAdmin ? ' (Admin)' : '');
            const btnHtml = `<i class="fas fa-lock-open"></i> <span class="dm-btn-text">${user.displayName || 'User'}${roleLabel}</span>`;
            btn.innerHTML = btnHtml;
            if (elements.mobileAdminToggle) {
                elements.mobileAdminToggle.classList.add('logged-in');
                elements.mobileAdminToggle.innerHTML = `<i class="fas fa-user-circle"></i> <span>${user.displayName || 'User'}</span>`;
            }
            if (elements.userName) elements.userName.innerText = user.displayName || 'User';
            if (elements.userEmail) elements.userEmail.innerText = `${user.email} [${role.toUpperCase()}]`;
            if (elements.userPhoto) {
                elements.userPhoto.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=random`;
            }
        } else {
            btn.classList.remove('logged-in');
            btn.innerHTML = '<i class="fab fa-google"></i> <span class="dm-btn-text">লগইন</span>';
            if (elements.mobileAdminToggle) {
                elements.mobileAdminToggle.classList.remove('logged-in');
                elements.mobileAdminToggle.innerHTML = '<i class="fab fa-google"></i> <span>লগইন</span>';
            }
        }
    }



    if (isAdmin) {
        document.body.classList.add('is-admin');
        if (elements.saveExamModal) elements.saveExamModal.classList.add('admin-mode');
    } else {
        document.body.classList.remove('is-admin');
        if (elements.saveExamModal) elements.saveExamModal.classList.remove('admin-mode');
    }

    if (isSuperAdmin) {
        document.body.classList.add('is-super-admin');
    } else {
        document.body.classList.remove('is-super-admin');
    }

    if (role === 'teacher') {
        document.body.classList.add('is-teacher');
    } else {
        document.body.classList.remove('is-teacher');
    }
}

export function initDOMReferences() {
    elements.chartTypeSelect = document.getElementById('chartType');
    elements.sortOrderSelect = document.getElementById('sortOrder');
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
    elements.failedStudentsPagination = document.getElementById('failedStudentsPagination');
    elements.failedSearchInput = document.getElementById('failedSearchInput');
    elements.groupStatsHeaderMeta = document.getElementById('groupStatsHeaderMeta');
    elements.jsonFileInput = document.getElementById('jsonFileInput');
    elements.appVersionBadge = document.getElementById('appVersionBadge');
    elements.headerVersionNumber = document.getElementById('headerVersionNumber');
    elements.footerVersionNumber = document.getElementById('footerVersionNumber');
    elements.footerDevCredit = document.getElementById('footerDevCredit');
    elements.footerDevContact = document.getElementById('footerDevContact');
    elements.installAppBtn = document.getElementById('installAppBtn');
    elements.saveAnalysisBtn = document.getElementById('saveAnalysisBtn');
    elements.savedExamsList = document.getElementById('savedExamsList');
    elements.saveExamModal = document.getElementById('saveExamModal');
    elements.closeModalBtn = document.getElementById('closeModalBtn');
    elements.saveExamForm = document.getElementById('saveExamForm');

    // New Edit Exam Modal References
    elements.editExamModal = document.getElementById('editExamModal');
    elements.editExamForm = document.getElementById('editExamForm');
    elements.editExamDocId = document.getElementById('editExamDocId');
    elements.editExamClass = document.getElementById('editExamClass');
    elements.editExamSession = document.getElementById('editExamSession');
    elements.editExamName = document.getElementById('editExamName');
    elements.editSubjectName = document.getElementById('editSubjectName');
    elements.closeEditModalBtn = document.getElementById('closeEditModalBtn');
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
    elements.mobileAdminToggle = document.getElementById('mobileAdminToggle');
    elements.usersPage = document.getElementById('usersPage');
    elements.modalLogoutBtn = document.getElementById('modalLogoutBtn');
    elements.closeProfileBtn = document.getElementById('closeProfileBtn');
    elements.closeProfileIcon = document.getElementById('closeProfileIcon');

    // Restore Analysis & Search References
    elements.analysisView = document.getElementById('analysisView');
    elements.analysisStudentId = document.getElementById('analysisStudentId');
    elements.analyzeBtn = document.getElementById('analyzeBtn');
    elements.historyChart = document.getElementById('historyChart');
    elements.studentDetails = document.getElementById('studentDetails');
    elements.analysisType = document.getElementById('analysisType');
    elements.analysisMaxMarks = document.getElementById('analysisMaxMarks');
    elements.analysisSearchResults = document.getElementById('analysisSearchResults');
    elements.analysisSessionSelect = document.getElementById('analysisSessionSelect');
    elements.analysisSubjectSelect = document.getElementById('analysisSubjectSelect');
    elements.analysisExamSelect = document.getElementById('analysisExamSelect');
    elements.analysisContextInfo = document.getElementById('analysisContextInfo');
    elements.downloadAnalysisImage = document.getElementById('downloadAnalysisImage');
    
    elements.inlineSearchPanel = document.getElementById('inlineSearchPanel');
    elements.inlineSearchCandidates = document.getElementById('inlineSearchCandidates');
    elements.inlineHistorySection = document.getElementById('inlineHistorySection');
    elements.inlineStudentDetails = document.getElementById('inlineStudentDetails');
    elements.inlineHistoryChart = document.getElementById('inlineHistoryChart');
    elements.inlineAnalysisType = document.getElementById('inlineAnalysisType');
    elements.inlineAnalysisMaxMarks = document.getElementById('inlineAnalysisMaxMarks');
    elements.inlineDownloadBtn = document.getElementById('inlineDownloadBtn');

    // Restore Dashboard Control References
    elements.printBtn = document.getElementById('printBtn');
    elements.downloadBtn = document.getElementById('downloadBtn');
    elements.prevRollBtn = document.getElementById('prevRollBtn');
    elements.nextRollBtn = document.getElementById('nextRollBtn');
    elements.currentRollNum = document.getElementById('currentRollNum');
    elements.prevRollNum = document.getElementById('prevRollNum');
    elements.nextRollNum = document.getElementById('nextRollNum');

    elements.latestExamLabel = document.getElementById('latestExamLabel');

    // Login & Access Modals
    elements.loginModal = document.getElementById('loginModal');
    elements.closeLoginModal = document.getElementById('closeLoginModal');
    elements.googleLoginBtn = document.getElementById('googleLoginBtn');
    elements.emailLoginForm = document.getElementById('emailLoginForm');
    elements.loginTabs = document.querySelectorAll('.login-tab');
    elements.openRequestAccessBtn = document.getElementById('openRequestAccessBtn');
    elements.requestAccessModal = document.getElementById('requestAccessModal');
    elements.closeRequestAccessModal = document.getElementById('closeRequestAccessModal');
    elements.requestAccessForm = document.getElementById('requestAccessForm');

    // Download Buttons
    elements.downloadFailedBtn = document.getElementById('downloadFailedBtn');
    elements.downloadGroupStatsBtn = document.getElementById('downloadGroupStatsBtn');

    // Modal & Forms
    elements.editConfigModal = document.getElementById('editConfigModal');
    elements.closeEditConfigModal = document.getElementById('closeEditConfigModal');
    elements.editConfigForm = document.getElementById('editConfigForm');
    elements.editConfigDocId = document.getElementById('editConfigDocId');
    elements.editConfigExamName = document.getElementById('editConfigExamName');
    elements.editConfigClass = document.getElementById('editConfigClass');
    elements.editConfigSession = document.getElementById('editConfigSession');
    elements.editConfigExamDate = document.getElementById('editConfigExamDate');

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
    elements.examSession = document.getElementById('examSession');
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
    elements.usersPage = document.getElementById('usersPage');
    elements.userListBody = document.getElementById('userListBody');
    elements.userMgmtSearch = document.getElementById('userMgmtSearch');
    elements.statSuperAdminCount = document.getElementById('statSuperAdminCount');
    elements.statAdminCount = document.getElementById('statAdminCount');
    elements.statUserCount = document.getElementById('statUserCount');
    
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
    elements.modeMainExamsBtn = document.getElementById('modeMainExamsBtn');
    elements.modeTutorialExamsBtn = document.getElementById('modeTutorialExamsBtn');
    elements.deleteSubjectBtn = document.getElementById('deleteSubjectBtn');
    elements.saveSubjectConfigBtn = document.getElementById('saveSubjectConfigBtn');
    elements.subjectCount = document.getElementById('subjectCount');
    elements.resetFiltersBtn = document.getElementById('resetFiltersBtn');
    elements.contactDevBtn = document.getElementById('contactDevBtn');
    elements.contactModal = document.getElementById('contactModal');
    elements.closeContactModal = document.getElementById('closeContactModal');
    elements.loadExamConfirmModal = document.getElementById('loadExamConfirmModal');
    elements.loadExamConfirmName = document.getElementById('loadExamConfirmName');
    elements.loadExamConfirmBtn = document.getElementById('loadExamConfirmBtn');
    elements.loadExamCancelBtn = document.getElementById('loadExamCancelBtn');
    elements.closeContactModalBtn = document.getElementById('closeContactModalBtn');
    elements.formTitle = document.getElementById('formTitle');
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

/**
 * Show global loading overlay with a message and real-time animated progress
 * @param {string} title - Main title
 * @param {string} subtitle - Secondary status text
 * @param {number} percent - Current progress (0-100)
 */
export function showLoading(title = 'লোড হচ্ছে...', subtitle = '', percent = 0) {
    setLoading(true);
    
    const titleEl = document.querySelector('#loadingOverlay .loading-title');
    const subtitleEl = document.getElementById('loadingSubtitle');
    const barEl = document.getElementById('loadingProgressBar');
    const barContainer = document.querySelector('.loading-progress-wrapper');
    const percentEl = document.getElementById('loadingProgressPercent');

    if (titleEl) titleEl.innerText = title;
    if (subtitleEl) subtitleEl.innerText = subtitle;
    
    // Only show progress bar if percent is explicitly provided and > 0
    if (barContainer && percent > 0) {
        barContainer.style.display = 'flex';
        if (barEl) barEl.style.width = `${percent}%`;
        
        if (percentEl) {
            const { convertToBengaliDigits } = Object.assign({}, { 
                convertToBengaliDigits: (n) => String(n).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]) 
            });
            percentEl.innerText = `${convertToBengaliDigits(Math.round(percent))}%`;
        }
    } else if (barContainer) {
        barContainer.style.display = 'none';
    }
}

/**
 * Show compact/slim background progress bar
 */
export function showCompactProgress(text = 'প্রসেসিং...', percent = 0) {
    const compactProgress = document.getElementById('msCompactProgress');
    const compactBar = document.getElementById('msCompactProgressBar');
    const compactInfo = document.getElementById('msCompactInfo');
    const compactText = document.getElementById('msCompactInfoText');

    if (compactProgress) compactProgress.style.display = 'block';
    if (compactInfo) compactInfo.style.display = 'flex';
    if (compactBar) compactBar.style.width = `${percent}%`;
    if (compactText) compactText.innerText = text;
}

/**
 * Hide compact progress
 */
export function hideCompactProgress() {
    const compactProgress = document.getElementById('msCompactProgress');
    const compactInfo = document.getElementById('msCompactInfo');
    
    if (compactProgress) compactProgress.style.display = 'none';
    if (compactInfo) compactInfo.style.display = 'none';
}

/**
 * Hide global loading overlay and reset progress
 */
export function hideLoading() {
    setLoading(false);
    // Reset after a small delay to not see it jump back during fade-out
    setTimeout(() => {
        const barEl = document.getElementById('loadingProgressBar');
        if (barEl) barEl.style.width = '0%';
    }, 500);
}

export function updateSyncStatus(isOnline) {
    if (elements.syncStatus) {
        elements.syncStatus.innerHTML = isOnline
            ? '<i class="fas fa-cloud"></i> সিঙ্ক'
            : '<i class="fas fa-cloud-slash"></i> অফলাইন';
        elements.syncStatus.className = `sync-status ${isOnline ? 'online' : 'offline'}`;
    }
}

/**
 * Show confirmation modal with custom message and callback
 * @param {string} message - Message to display
 * @param {Function} onConfirm - Callback on confirm
 * @param {string} itemName - Name of the item being deleted
 * @param {string} contextInfo - Where/what is being deleted
 * @param {Object} options - Optional UI overrides (title, icon, btnText, btnClass)
 */
export function showConfirmModal(message, onConfirm, itemName = '', contextInfo = 'এটি ডাটাবেস থেকে স্থায়ীভাবে মুছে যাবে', options = {}) {
    if (!elements.confirmModal || !elements.confirmMessage || !elements.confirmDeleteBtn) return;

    elements.confirmMessage.textContent = message;

    // Default configuration (Delete Mode)
    const config = {
        title: 'মুছে ফেলতে চান?',
        icon: 'fa-trash-alt',
        iconColor: '#ff4d4f', // Red by default
        btnText: 'হ্যাঁ, মুছে ফেলুন',
        btnClass: 'btn-danger-confirm',
        ...options
    };

    // Update Modal Title & Icon
    const modalTitle = document.getElementById('confirmTitle');
    const modalIconContainer = document.querySelector('.confirm-modal-icon');
    
    if (modalTitle) modalTitle.textContent = config.title;
    if (modalIconContainer) {
        modalIconContainer.innerHTML = `<i class="fas ${config.icon}"></i>`;
        modalIconContainer.style.color = config.iconColor;
        modalIconContainer.style.backgroundColor = `${config.iconColor}15`; // 15% opacity background
    }

    // Update confirm button properties
    elements.confirmDeleteBtn.textContent = config.btnText;
    elements.confirmDeleteBtn.className = config.btnClass; // E.g., 'btn-danger-confirm' or 'btn-success-confirm'

    // Update new informative elements
    const itemNameEl = document.getElementById('confirmItemName');
    const contextInfoEl = document.getElementById('confirmContextInfo');

    if (itemNameEl) itemNameEl.textContent = itemName;
    if (contextInfoEl) contextInfoEl.textContent = contextInfo;

    elements.confirmModal.classList.add('active');

    // Clean up previous listeners & clone buttons to avoid listener accumulation
    const newDeleteBtn = elements.confirmDeleteBtn.cloneNode(true);
    elements.confirmDeleteBtn.parentNode.replaceChild(newDeleteBtn, elements.confirmDeleteBtn);
    elements.confirmDeleteBtn = newDeleteBtn;

    const newCancelBtn = elements.confirmCancelBtn.cloneNode(true);
    elements.confirmCancelBtn.parentNode.replaceChild(newCancelBtn, elements.confirmCancelBtn);
    elements.confirmCancelBtn = newCancelBtn;

    elements.confirmDeleteBtn.addEventListener('click', async () => {
        elements.confirmModal.classList.remove('active');
        await onConfirm();
    });

    elements.confirmCancelBtn.addEventListener('click', () => {
        elements.confirmModal.classList.remove('active');
    });
}
/**
 * Populate all dynamic dropdowns across the app
 */
export function populateDynamicDropdowns() {
    const types = ['class', 'session', 'group', 'section'];

    types.forEach(type => {
        const items = state.academicStructure[type] || [];
        const selects = document.querySelectorAll(`select[data-dynamic="${type}"]`);

        selects.forEach(select => {
            const currentValue = select.value;
            const hasAllOption = select.querySelector('option[value="all"]');
            const placeholder = select.getAttribute('data-placeholder') || getPlaceholder(type);

            let html = `<option value="">${placeholder}</option>`;
            if (hasAllOption) {
                html += '<option value="all">সবগুলো</option>';
            }

            items.forEach(item => {
                html += `<option value="${item.value}">${item.value}</option>`;
            });

            select.innerHTML = html;

            // Restore value if it still exists in the new list
            if (currentValue && items.some(i => i.value === currentValue)) {
                select.value = currentValue;
            } else if (currentValue === 'all' && hasAllOption) {
                select.value = 'all';
            }
        });
    });
}

function getPlaceholder(type) {
    const placeholders = {
        class: 'শ্রেণি নির্বাচন',
        session: 'সেশন নির্বাচন',
        group: 'গ্রুপ নির্বাচন',
        section: 'শাখা নির্বাচন'
    };
    return placeholders[type] || 'নির্বাচন করুন';
}
