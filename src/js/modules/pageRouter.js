/**
 * Page Router Module
 * Handles hash-based navigation between Dashboard, Students, Result Entry, and Marksheet pages
 * @module pageRouter
 */

import { state } from './state.js';
import { loadTeacherAssignmentData } from './teacherAssignmentManager.js';
import { loadAccessRequests, initAccessRequestUI } from './accessRequestManager.js';

const NEW_PAGE_IDS = {
    'teacher-assignment': 'teacherAssignmentPage',
    'students': 'studentsPage',
    'result-entry': 'resultEntryPage',
    'marksheet': 'marksheetPage',
    'access-requests': 'accessRequestsPage'
};

// IDs/selectors of all dashboard-only sections to hide on other pages
const DASHBOARD_ONLY_SELECTORS = [
    '#dashboardPage',
    '#inlineSearchPanel'
];

let onPageChangeCallback = null;
let currentPage = 'dashboard';

/**
 * Navigate to a specific page
 * @param {string} pageId - One of: dashboard, students, result-entry, marksheet
 */
export function navigateTo(pageId) {
    currentPage = pageId;

    // Hide ALL new pages first
    Object.values(NEW_PAGE_IDS).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (pageId === 'dashboard') {
        // Show all dashboard sections
        DASHBOARD_ONLY_SELECTORS.forEach(sel => {
            const el = sel.startsWith('#') ? document.getElementById(sel.slice(1)) : document.querySelector(sel);
            if (el) el.classList.remove('page-hidden');
        });
    } else {
        // Hide all dashboard sections
        DASHBOARD_ONLY_SELECTORS.forEach(sel => {
            const el = sel.startsWith('#') ? document.getElementById(sel.slice(1)) : document.querySelector(sel);
            if (el) el.classList.add('page-hidden');
        });

        // Show selected page
        const targetId = NEW_PAGE_IDS[pageId];
        if (targetId) {
            const target = document.getElementById(targetId);
            if (target) target.style.display = 'block';
        }
    }

    // Update nav tab active state
    document.querySelectorAll('.page-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === pageId);
    });

    // Update hash
    if (window.location.hash !== `#${pageId}`) {
        history.replaceState(null, '', `#${pageId}`);
    }

    // Scroll to top
    window.scrollTo(0, 0);

    // Load page-specific data
    if (pageId === 'teacher-assignment') {
        loadTeacherAssignmentData();
    } else if (pageId === 'access-requests') {
        initAccessRequestUI();
        loadAccessRequests();
    }

    // Callback for lazy-loading page content
    if (onPageChangeCallback) {
        onPageChangeCallback(pageId);
    }
}

/**
 * Initialize the page router
 * @param {Function} callback - Called when page changes with (pageId)
 */
export function initPageRouter(callback) {
    onPageChangeCallback = callback;

    // Inject the CSS rule for page-hidden (bulletproof)
    if (!document.getElementById('pageRouterStyles')) {
        const style = document.createElement('style');
        style.id = 'pageRouterStyles';
        style.textContent = `.page-hidden { display: none !important; }`;
        document.head.appendChild(style);
    }

    // Nav tab click handlers
    document.querySelectorAll('.page-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.page) {
                navigateTo(btn.dataset.page);
            }
        });
    });

    // Listen for hash changes (back/forward navigation, direct URL entry)
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        const validPages = ['dashboard', 'teacher-assignment', 'students', 'result-entry', 'marksheet', 'access-requests'];
        if (validPages.includes(hash)) {
            navigateTo(hash);
        }
    });

    // Show nav tabs for logged-in users
    updateNavVisibility();

    // Handle initial hash
    const currentHash = window.location.hash.replace('#', '') || 'dashboard';
    const initialPages = ['dashboard', 'teacher-assignment', 'students', 'result-entry', 'marksheet', 'access-requests'];
    if (initialPages.includes(currentHash) && currentHash !== 'dashboard') {
        navigateTo(currentHash);
    }
}

/**
 * Show/hide nav tabs based on user role
 */
export function updateNavVisibility() {
    const navTabs = document.getElementById('pageNavTabs');
    if (!navTabs) return;

    const role = state.userRole;
    const isAuthorized = ['super_admin', 'admin', 'teacher'].includes(role);
    navTabs.style.display = isAuthorized ? 'flex' : 'none';

    // Role-based individual tab visibility
    document.querySelectorAll('.page-nav-btn').forEach(btn => {
        const page = btn.dataset.page;
        if (!page) return; // Skip buttons without data-page (like teacher assignment)

        let visible = true;

        if (role === 'admin') {
            // Admins cannot see Dashboard or Student Management
            if (page === 'dashboard' || page === 'students') visible = false;
        } else if (role === 'teacher') {
            // Teachers can see everything except Student Management (if needed)
            if (page === 'students') visible = false;
        }

        btn.style.display = visible ? 'inline-flex' : 'none';
    });

    // Handle initial navigation if on a restricted page
    const currentHash = window.location.hash.replace('#', '') || 'dashboard';
    if (role === 'admin' && (currentHash === 'dashboard' || currentHash === 'students')) {
        navigateTo('result-entry');
    } else if (role === 'teacher' && currentHash === 'students') {
        navigateTo('dashboard');
    }

    // Role-based element visibility via classes (Bulletproof)
    // For non-page elements: use page-hidden class
    // For page containers: do NOT touch display here — let navigateTo() handle it
    document.querySelectorAll('.super-admin-only').forEach(el => {
        const isPageContainer = el.id && Object.values(NEW_PAGE_IDS).includes(el.id);
        if (isPageContainer) {
            // Always hide page containers here; navigateTo() will show the correct one
            el.style.display = 'none';
        } else if (role !== 'super_admin') {
            el.classList.add('page-hidden');
        } else {
            el.classList.remove('page-hidden');
        }
    });

    document.querySelectorAll('.admin-only').forEach(el => {
        const isPageContainer = el.id && Object.values(NEW_PAGE_IDS).includes(el.id);
        if (isPageContainer) {
            el.style.display = 'none';
        } else if (role !== 'admin' && role !== 'super_admin') {
            el.classList.add('page-hidden');
        } else {
            el.classList.remove('page-hidden');
        }
    });
}
