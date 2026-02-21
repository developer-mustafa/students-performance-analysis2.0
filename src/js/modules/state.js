/**
 * Application State and Constants
 */

export const state = {
    studentData: [],
    savedExams: [],
    subjectConfigs: {},
    classSubjectMapping: {},
    currentGroupFilter: 'all',
    currentGradeFilter: 'all',
    currentSearchTerm: '',
    currentView: 'chart',
    currentChartType: 'total',
    currentExamName: 'প্রি-টেস্ট পরীক্ষা-২০২৫',
    currentSubject: localStorage.getItem('currentSubject') || null,
    currentSortOrder: 'desc',
    isLoading: true,
    isInitialized: false,
    allowEmptyData: false,
    unsubscribe: null,
    isAdmin: false,
    isSuperAdmin: false,
    userRole: 'guest',
    isViewingSavedExam: false,
    currentAnalyzedStudent: null,
    currentAnalyzedHistory: [],

    // Inline search state
    inlineSearchStudent: null,
    inlineSearchHistory: [],
    inlineHistoryChartInstance: null,
    inlineSearchDebounce: null,
    inlinePrevStudent: null,
    inlineNextStudent: null,
    analyticsSaveTimeout: null,
    onDataUpdateUnsubscribe: null,
    onSettingsUnsubscribe: null,
    onSubjectConfigsUnsubscribe: null,
    onAuthUnsubscribe: null,
    analysisSearchDebounce: null,
    currentAnalysisNextStudent: null,
    editingSubjectKey: null,

    // Saved Exams Pagination
    savedExamsCurrentPage: 1,
    savedExamsPerPage: 4,
    savedExamsClassFilter: 'all',
    defaultExamId: null,
    currentExamSession: null,
    currentExamClass: null,
    currentSessionStudents: [], // Store all students for current session for navigation
    currentUser: null
};

export const DEFAULT_SUBJECT_CONFIG = {
    total: '100',
    written: '50',
    writtenPass: '17',
    mcq: '25',
    mcqPass: '8',
    practical: '25',
    practicalPass: '0',
    practicalOptional: false
};
