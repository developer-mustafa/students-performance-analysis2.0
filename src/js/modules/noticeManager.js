/**
 * Notice Manager Module
 * Handles notice board, news bulletin, and sidebar headline history.
 */

import { saveNotice, getNotices, deleteNotice, subscribeToNotices, subscribeToSettings, updateSettings } from '../firestoreService.js';
import { formatDateBengali, showNotification, convertToEnglishDigits } from '../utils.js';
import { navigateTo } from './pageRouter.js';

let state = {
    notices: [],
    currentPage: 1,
    perPage: 2,
    sidebarPage: 1,
    sidebarPerPage: 5,
    searchTerm: '',
    dateFilter: '',
    bulletinEnabled: true, // Default to true, will be updated from Firestore
    userRole: null,
    isAdmin: false,
    currentNoticeId: null, // Track currently viewed notice for comments
    isAuthenticating: false
};

let elements = {};

const bng = (num) => num?.toString().replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]) || '০';

/**
 * Initialize Notice Manager
 */
export async function initNoticeManager() {
    initDOMElements();
    setupEventListeners();
    
    updateBulletinVisibility();
    
    // Subscribe to global settings (bulletin visibility)
    subscribeToSettings((settings) => {
        if (settings && typeof settings.bulletinEnabled !== 'undefined') {
            state.bulletinEnabled = settings.bulletinEnabled;
            updateBulletinVisibility();
            
            // If toggle exists, update its checked state
            if (elements.bulletinToggle) {
                elements.bulletinToggle.checked = state.bulletinEnabled;
            }
        }
    });

    // Subscribe to real-time updates (This already provides initial data immediately)
    subscribeToNotices((notices) => {
        state.notices = notices;
        renderNotices();
        renderSidebarHistory();
        renderBulletin();
        updateBulletinVisibility();
    });
}

/**
 * Initialize DOM Elements
 */
function initDOMElements() {
    elements = {
        noticeContainer: document.getElementById('noticeContainer'),
        noticePagination: document.getElementById('noticePagination'),
        noticeSearchInput: document.getElementById('noticeSearchInput'),
        noticeSearchClear: document.getElementById('noticeSearchClear'),
        noticeDateFilter: document.getElementById('noticeDateFilter'),
        noticeDateClear: document.getElementById('noticeDateClear'),
        bulletinToggle: document.getElementById('bulletinToggle'),
        addNoticeBtn: document.getElementById('addNoticeBtn'),
        noticeModal: document.getElementById('noticeModal'),
        noticeForm: document.getElementById('noticeForm'),
        closeNoticeModalBtn: document.getElementById('closeNoticeModalBtn'),
        noticeDetailModal: document.getElementById('noticeDetailModal'),
        closeDetailModalBtn: document.getElementById('closeDetailModalBtn'),
        sidebarNoticeList: document.getElementById('sidebarNoticeList'),
        sidebarPagination: document.getElementById('sidebarPagination'),
        sidebarTotalCount: document.getElementById('sidebarTotalCount'),
        noticeScroller: document.getElementById('noticeScroller'),
        noticeBulletinWrapper: document.getElementById('noticeBulletinWrapper'),
        printNoticeBtn: document.getElementById('printNoticeBtn'),
        noticeCommentForm: document.getElementById('noticeCommentForm'),
        commentInput: document.getElementById('commentInput')
    };
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
    // Search
    elements.noticeSearchInput?.addEventListener('input', (e) => {
        state.searchTerm = e.target.value;
        state.currentPage = 1;
        renderNotices();
        if (elements.noticeSearchClear) {
            elements.noticeSearchClear.style.display = e.target.value ? 'flex' : 'none';
        }
    });

    // Date Filter
    elements.noticeDateFilter?.addEventListener('change', (e) => {
        state.dateFilter = e.target.value;
        state.currentPage = 1;
        renderNotices();
        if (elements.noticeDateClear) {
            elements.noticeDateClear.style.display = e.target.value ? 'flex' : 'none';
        }
    });

    // Clear buttons
    elements.noticeSearchClear?.addEventListener('click', () => {
        if (elements.noticeSearchInput) elements.noticeSearchInput.value = '';
        state.searchTerm = '';
        state.currentPage = 1;
        renderNotices();
        if (elements.noticeSearchClear) elements.noticeSearchClear.style.display = 'none';
    });

    elements.noticeDateClear?.addEventListener('click', () => {
        if (elements.noticeDateFilter) elements.noticeDateFilter.value = '';
        state.dateFilter = '';
        state.currentPage = 1;
        renderNotices();
        if (elements.noticeDateClear) elements.noticeDateClear.style.display = 'none';
    });

    // Bulletin Toggle (Global persistence via Firestore)
    elements.bulletinToggle?.addEventListener('change', async (e) => {
        const isEnabled = e.target.checked;
        state.bulletinEnabled = isEnabled;
        
        // Save to global settings
        const success = await updateSettings({ bulletinEnabled: isEnabled });
        if (success) {
            updateBulletinVisibility();
        } else {
            // Revert on failure
            e.target.checked = !isEnabled;
            state.bulletinEnabled = !isEnabled;
            showNotification('বুলেটিন স্ট্যাটাস পরিবর্তন করা সম্ভব হয়নি', 'error');
        }
    });

    // Pause on Hover Logic
    if (elements.noticeScroller) {
        elements.noticeScroller.addEventListener('mouseenter', () => {
            elements.noticeScroller.style.animationPlayState = 'paused';
        });
        elements.noticeScroller.addEventListener('mouseleave', () => {
            elements.noticeScroller.style.animationPlayState = 'running';
        });
    }

    // Bulletin Navigation
    if (elements.noticeBulletinWrapper) {
        elements.noticeBulletinWrapper.addEventListener('click', () => {
            navigateTo('notices');
        });
    }

    // Modal Control
    elements.addNoticeBtn?.addEventListener('click', () => {
        resetForm();
        if (elements.noticeModal) elements.noticeModal.classList.add('active');
    });

    const closeModals = () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    };

    // Support both ID specific and generic class based closing
    elements.closeNoticeModalBtn?.addEventListener('click', closeModals);
    elements.closeDetailModalBtn?.addEventListener('click', closeModals);
    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeModals));

    // Comment Submission
    elements.noticeCommentForm?.addEventListener('submit', handleCommentSubmit);

    // Click background to close
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) closeModals();
    });

    // Share logic
    document.querySelector('.notice-share-btn')?.addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            showNotification('নোটিশ লিঙ্ক কপি করা হয়েছে!');
        });
    });

    // Form Submission
    elements.noticeForm?.addEventListener('submit', handleNoticeSubmit);

    // Main Grid dynamic delegates
    elements.noticeContainer?.addEventListener('click', (e) => {
        const docId = e.target.closest('[data-id]')?.dataset.id;
        if (!docId) return;

        if (e.target.closest('.notice-read-more') || e.target.closest('.notice-title')) {
            const notice = state.notices.find(n => n.docId === docId);
            if (notice) showNoticeDetails(notice);
        }

        if (e.target.closest('.notice-delete-btn')) handleNoticeDelete(docId);
        if (e.target.closest('.notice-edit-btn')) {
            const notice = state.notices.find(n => n.docId === docId);
            if (notice) editNotice(notice);
        }
    });

    // Sidebar dynamic delegates
    elements.sidebarNoticeList?.addEventListener('click', (e) => {
        const item = e.target.closest('.sidebar-notice-item');
        if (item) {
            const docId = item.dataset.id;
            const notice = state.notices.find(n => n.docId === docId);
            if (notice) showNoticeDetails(notice);
        }
    });

    // Marquee dynamic delegates
    elements.noticeScroller?.addEventListener('click', (e) => {
        const item = e.target.closest('.notice-marquee-item');
        if (item) {
            const docId = item.dataset.id;
            const notice = state.notices.find(n => n.docId === docId);
            if (notice) showNoticeDetails(notice);
        }
    });

    // Print
    elements.printNoticeBtn?.addEventListener('click', () => {
        window.print();
    });
}

/**
 * Handle form submission
 */
async function handleNoticeSubmit(e) {
    e.preventDefault();
    
    const formData = {
        docId: document.getElementById('noticeForm').dataset.editingId || null,
        title: document.getElementById('noticeTitle').value,
        content: document.getElementById('noticeContent').value,
        author: document.getElementById('noticeAuthor').value,
        important: document.getElementById('noticeImportant').checked,
        views: 0,
        comments: []
    };

    const success = await saveNotice(formData);
    if (success) {
        showNotification(formData.docId ? 'নোটিশ আপডেট করা হয়েছে' : 'নতুন নোটিশ পোস্ট করা হয়েছে', 'success');
        elements.noticeModal?.classList.remove('active');
        resetForm();
    } else {
        showNotification('নোটিশটি সেভ করা যায়নি', 'error');
    }
}

/**
 * Render main notice cards
 */
function renderNotices() {
    if (!elements.noticeContainer) return;

    const filtered = state.notices.filter(n => {
        const matchesSearch = n.title.toLowerCase().includes(state.searchTerm.toLowerCase()) || 
                            n.content.toLowerCase().includes(state.searchTerm.toLowerCase());
        const matchesDate = !state.dateFilter || n.createdAt?.toDate?.().toISOString().split('T')[0] === state.dateFilter;
        return matchesSearch && matchesDate;
    });

    if (filtered.length === 0) {
        elements.noticeContainer.innerHTML = `
            <div class="notice-empty-state">
                <i class="fas fa-search"></i>
                <p>কোনো নোটিশ পাওয়া যায়নি</p>
            </div>
        `;
        if (elements.noticePagination) elements.noticePagination.innerHTML = '';
        return;
    }

    const ITEMS_PER_PAGE = 2;
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (state.currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(start, start + ITEMS_PER_PAGE);

    elements.noticeContainer.innerHTML = paginated.map((notice, idx) => {
        const date = notice.createdAt?.toDate ? notice.createdAt.toDate() : new Date();
        const formattedDate = formatDateBengali(date);
        const noticeNoBng = bng(filtered.length - (start + idx));

        return `
            <div class="notice-card group" data-id="${notice.docId}" style="animation: noticeCardIn 0.4s ease ${idx * 0.05}s backwards">
                <div class="notice-card-highlight"></div>
                <div class="notice-card-content">
                    <div class="notice-card-header">
                        <span class="notice-badge">
                             <i class="fas fa-hashtag"></i> নোটিশ নং: ${noticeNoBng}
                        </span>
                        
                        ${state.isAdmin ? `
                        <div class="notice-admin-actions">
                            <button class="notice-edit-btn" data-id="${notice.docId}"><i class="fas fa-edit"></i></button>
                            <button class="notice-delete-btn" data-id="${notice.docId}"><i class="fas fa-trash-alt"></i></button>
                        </div>
                        ` : ''}
                    </div>

                    <div class="notice-card-body">
                        <div class="notice-date">
                            <i class="far fa-calendar-alt"></i> ${formattedDate}
                        </div>
                        <h3 class="notice-title" data-title="${notice.title}">${notice.title}</h3>
                        <p class="notice-excerpt">${notice.content}</p>
                    </div>

                    <div class="notice-footer mt-auto">
                        <div class="notice-stats">
                            <div class="stat-item">
                                <i class="far fa-eye"></i> <span>${bng(notice.views || 0)}</span>
                            </div>
                            <div class="stat-item border-left">
                                <i class="far fa-comment-dots"></i> <span>${bng(notice.comments?.length || 0)}</span>
                            </div>
                        </div>
                        <button class="notice-read-more" data-id="${notice.docId}">
                             বিস্তারিত <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    renderGenericPagination(elements.noticePagination, totalPages, state.currentPage, (p) => {
        state.currentPage = p;
        renderNotices();
    });
}

/**
 * Render Sidebar Headline List
 */
function renderSidebarHistory() {
    if (!elements.sidebarNoticeList) return;

    const recentNotices = state.notices.slice(0, 15);
    const now = new Date();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;

    if (recentNotices.length === 0) {
        elements.sidebarNoticeList.innerHTML = '<li class="sidebar-empty">কোনো নোটিশ নেই</li>';
        return;
    }

    // Sidebar total count in Bengali
    if (elements.sidebarTotalCount) {
        const bngDigits = (num) => num.toString().replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
        elements.sidebarTotalCount.textContent = `${bngDigits(recentNotices.length)}টি`;
    }

    // Seamless loop items: render 15 + first 5 again
    const loopItems = [...recentNotices, ...recentNotices.slice(0, 5)];

    elements.sidebarNoticeList.innerHTML = `
        <div class="bulletin-scroll-container">
            ${loopItems.map((n, i) => {
                const dateObj = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
                const shortDate = formatDateBengali(dateObj);
                const isNew = (now - dateObj) < twoDaysInMs;
                const noticeNo = (state.notices.length - (i % recentNotices.length));

                return `
                    <div class="bulletin-item sidebar-notice-item" data-id="${n.docId}">
                        <div class="sidebar-item-number">
                            <div class="num-label">নং</div>
                            <div class="num-val">${bng(noticeNo)}</div>
                        </div>
                        <div class="sidebar-item-content">
                            <div class="sidebar-item-header">
                                <span class="sidebar-notice-title">${n.title}</span>
                                ${isNew ? '<span class="new-dot pulse"></span>' : ''}
                            </div>
                            <div class="sidebar-item-meta">
                                <span class="sidebar-notice-date"><i class="far fa-calendar-alt"></i> ${shortDate}</span>
                                <div class="sidebar-views">
                                    <i class="far fa-eye"></i> ${bng(n.views || 0)}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    if (elements.sidebarPagination) elements.sidebarPagination.innerHTML = '';
}

function renderGenericPagination(container, total, current, onPageChange) {
    if (!container) return;
    if (total <= 1) {
        container.innerHTML = '';
        return;
    }

    const prevDisabled = current <= 1;
    const nextDisabled = current >= total;

    container.innerHTML = `
        <div class="notice-pagination-nav">
            <button class="notice-page-nav-btn prev ${prevDisabled ? 'disabled' : ''}" ${prevDisabled ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i> <span>পূর্ববর্তী</span>
            </button>
            <span class="notice-page-indicator">${bng(current)} / ${bng(total)}</span>
            <button class="notice-page-nav-btn next ${nextDisabled ? 'disabled' : ''}" ${nextDisabled ? 'disabled' : ''}>
                <span>পরবর্তী</span> <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;

    const prevBtn = container.querySelector('.notice-page-nav-btn.prev');
    const nextBtn = container.querySelector('.notice-page-nav-btn.next');

    if (prevBtn && !prevDisabled) {
        prevBtn.addEventListener('click', () => onPageChange(current - 1));
    }
    if (nextBtn && !nextDisabled) {
        nextBtn.addEventListener('click', () => onPageChange(current + 1));
    }
}

function filterNotices() {
    let filtered = state.notices;
    if (state.searchTerm) {
        const query = state.searchTerm.toLowerCase();
        const engQuery = typeof convertToEnglishDigits === 'function' ? convertToEnglishDigits(query) : query;
        const queryIsNum = /^\d+$/.test(engQuery);

        filtered = filtered.filter((n, idx) => {
            const noticeNo = (state.notices.length - state.notices.indexOf(n)).toString();
            const textMatch = n.title.toLowerCase().includes(query) || 
                             n.content.toLowerCase().includes(query);
            const numMatch = queryIsNum && noticeNo === engQuery;
            return textMatch || numMatch;
        });
    }
    if (state.dateFilter) {
        filtered = filtered.filter(n => {
            const dateStr = n.createdAt?.toDate ? n.createdAt.toDate().toISOString().split('T')[0] : '';
            return dateStr === state.dateFilter;
        });
    }
    return filtered;
}

/**
 * Header Marquee Render
 * Format: নোটিশ নং-১০, ৫ এপ্রিল: হেডলাইন
 * Latest first, smooth right-to-left infinite scroll
 * Max 7 notices, each with unique badge color
 */
function renderBulletin() {
    if (!elements.noticeScroller) return;

    // Sort notices: latest first
    const sorted = [...state.notices].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
    });

    // Take only latest 7
    const latest7 = sorted.slice(0, 7);

    if (latest7.length === 0) {
        elements.noticeScroller.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">আপাতত কোনো নোটিশ নেই</span>';
        elements.noticeScroller.style.animation = 'none';
        return;
    }

    // 7 unique vivid badge colors
    const badgeColors = [
        'linear-gradient(135deg, #ef4444, #dc2626)', // Red
        'linear-gradient(135deg, #f59e0b, #d97706)', // Amber
        'linear-gradient(135deg, #10b981, #059669)', // Emerald
        'linear-gradient(135deg, #3b82f6, #2563eb)', // Blue
        'linear-gradient(135deg, #8b5cf6, #7c3aed)', // Violet
        'linear-gradient(135deg, #ec4899, #db2777)', // Pink
        'linear-gradient(135deg, #06b6d4, #0891b2)', // Cyan
    ];

    // Bengali month names
    const bnMonths = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];

    const totalNotices = state.notices.length;

    const items = latest7.map((n, idx) => {
        const date = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
        const day = bng(date.getDate());
        const month = bnMonths[date.getMonth()];
        // Notice number: totalNotices for latest, totalNotices-1 for second, etc.
        const noticeNo = bng(totalNotices - idx);
        const bgColor = badgeColors[idx % badgeColors.length];

        return `<a class="notice-marquee-item" data-id="${n.docId}" style="
            display: inline-flex; align-items: center; gap: 8px;
            white-space: nowrap; margin-right: 60px; cursor: pointer;
            font-size: 0.85rem; font-weight: 600; color: var(--text-color);
            text-decoration: none; transition: color 0.2s;
        ">
            <span style="
                background: ${bgColor};
                color: white; padding: 2px 10px; border-radius: 4px;
                font-size: 0.75rem; font-weight: 700; white-space: nowrap;
                box-shadow: 0 2px 4px rgba(0,0,0,0.15);
            ">নোটিশ নং-${noticeNo}</span>
            <span style="color: var(--text-muted); font-size: 0.8rem;">${day} ${month}:</span>
            <span style="font-weight: 700;">${n.title}</span>
        </a>`;
    }).join('');

    // Duplicate for seamless infinite loop
    elements.noticeScroller.innerHTML = items + items;

    // Calculate animation duration based on content width
    elements.noticeScroller.style.animation = 'none';
    requestAnimationFrame(() => {
        const scrollWidth = elements.noticeScroller.scrollWidth / 2;
        const speed = 45; // pixels per second (natural reading speed)
        const duration = Math.max(scrollWidth / speed, 20);
        elements.noticeScroller.style.animation = `noticeMarqueeSlide ${duration}s linear infinite`;
    });
}

function updateBulletinVisibility() {
    if (elements.noticeBulletinWrapper) {
        elements.noticeBulletinWrapper.style.display = state.bulletinEnabled ? 'flex' : 'none';
    }
    const statusText = document.getElementById('bulletinStatusText');
    if (statusText) {
        statusText.textContent = state.bulletinEnabled ? 'অন' : 'অফ';
        statusText.style.color = state.bulletinEnabled ? '#22c55e' : '#ef4444';
    }
}

export function updateNoticeAcl(isAdmin) {
    state.isAdmin = isAdmin;
    if (elements.addNoticeBtn) elements.addNoticeBtn.style.display = isAdmin ? 'block' : 'none';
    renderNotices();
}

/**
 * Show Notice Detail in Modal
 */
async function showNoticeDetails(notice) {
    state.currentNoticeId = notice.docId;
    const date = notice.createdAt?.toDate ? notice.createdAt.toDate() : new Date();
    const formattedDate = formatDateBengali(date);
    const noticeNo = (state.notices.length - state.notices.indexOf(notice));
    
    // UI Elements
    if (document.getElementById('noticeDetailTitle')) document.getElementById('noticeDetailTitle').textContent = notice.title;
    if (document.getElementById('noticeDetailAuthor')) document.getElementById('noticeDetailAuthor').textContent = notice.author || 'কর্তৃপক্ষ';
    if (document.getElementById('noticeDetailDate')) document.getElementById('noticeDetailDate').textContent = formattedDate;
    if (document.getElementById('noticeDetailText')) document.getElementById('noticeDetailText').textContent = notice.content;
    if (document.getElementById('noticeDetailNo')) document.getElementById('noticeDetailNo').textContent = bng(noticeNo);
    if (document.getElementById('noticeDetailViews')) document.getElementById('noticeDetailViews').textContent = bng(notice.views || 0);
    if (document.getElementById('noticeDetailCommentsCount')) document.getElementById('noticeDetailCommentsCount').textContent = bng(notice.comments?.length || 0);
    if (document.getElementById('commentListCount')) document.getElementById('commentListCount').textContent = bng(notice.comments?.length || 0);
    if (document.getElementById('noticeAuthorInitial')) document.getElementById('noticeAuthorInitial').textContent = (notice.author || 'M').charAt(0).toUpperCase();

    // Populate Print Only Header
    const printAuthor = document.getElementById('printNoticeDetailAuthor');
    const printDate = document.getElementById('printNoticeDetailDate');
    const printNo = document.getElementById('printNoticeDetailNo');
    const printTag = document.getElementById('printNoticeDetailTag');
    const printInst = document.getElementById('printInstitutionName');
    const printAddr = document.getElementById('printInstitutionAddr');

    if (printAuthor) printAuthor.textContent = notice.author || 'কর্তৃপক্ষ';
    if (printDate) printDate.textContent = formattedDate;
    if (printNo) printNo.textContent = bng(noticeNo);
    
    // Get Inst Info
    try {
        const { getMarksheetSettings } = await import('./marksheetManager.js');
        const msSettings = getMarksheetSettings() || {};
        if (printInst) printInst.textContent = msSettings.institutionName || 'শিক্ষার্থী পারফরম্যান্স এনালাইসিস';
        if (printAddr) printAddr.textContent = msSettings.institutionAddress || 'অটোমেটেড নোটিশ ম্যানেজমেন্ট সিস্টেম';
    } catch (e) {
        console.warn('Could not load marksheet settings for print header');
    }

    // Tag styling
    const tag = document.getElementById('noticeDetailTag');
    if (tag) {
        const tagName = notice.important ? 'জরুরি নোটিশ' : 'নোটিশ বোর্ড';
        tag.textContent = tagName;
        if (printTag) printTag.textContent = tagName;
        tag.className = notice.important ? 'bg-red-500 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg shadow-red-500/30' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-[10px] font-bold border border-indigo-500/20';
        if (printTag) printTag.className = notice.important ? 'bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-black mb-2 inline-block' : 'bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-black mb-2 inline-block';
    }

    // Comment Auth Logic
    const user = window.authManager?.state?.user;
    if (user) {
        document.getElementById('commentAuthPrompt')?.classList.add('hidden');
        document.getElementById('noticeCommentForm')?.classList.remove('hidden');
        if (document.getElementById('currentUserAvatar')) document.getElementById('currentUserAvatar').textContent = user.email.charAt(0).toUpperCase();
    } else {
        document.getElementById('commentAuthPrompt')?.classList.remove('hidden');
        document.getElementById('noticeCommentForm')?.classList.add('hidden');
    }

    renderComments(notice.comments || []);
    elements.noticeDetailModal?.classList.add('active');

    // Increment View Count (Optimized: Check session to avoid duplicate writes)
    const viewedKey = `viewed_notice_${notice.docId}`;
    if (!sessionStorage.getItem(viewedKey)) {
        incrementViewCount(notice.docId);
        sessionStorage.setItem(viewedKey, 'true');
    }
}

function renderComments(comments) {
    const list = document.getElementById('noticeCommentList');
    if (!list) return;

    if (comments.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-30 text-slate-400 grayscale">
                <i class="far fa-comments text-3xl mb-2"></i>
                <p class="text-xs font-black italic tracking-tight">এখনও কোনো মন্তব্য নেই। প্রথম মন্তব্যটি আপনার হোক!</p>
            </div>
        `;
        return;
    }

    list.innerHTML = comments.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(c => `
        <div class="flex gap-4 group">
            <div class="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-xs font-black shrink-0 border border-black/5 dark:border-white/5 uppercase">${(c.user || 'U').charAt(0)}</div>
            <div class="flex-1 bg-slate-50 dark:bg-slate-900/10 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 group-hover:border-indigo-500/20 transition-all">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-[11px] font-black text-slate-800 dark:text-slate-100 leading-none">${c.user}</span>
                    <span class="text-[9px] font-bold text-slate-400 leading-none">${c.date}</span>
                </div>
                <p class="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">${c.text}</p>
            </div>
        </div>
    `).join('');
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('commentInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !state.currentNoticeId) return;

    const userEmail = window.authManager?.state?.user?.email || 'Authenticated User';
    const bngDate = new Date().toLocaleDateString('bn-BD', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const comment = {
        user: userEmail,
        text: text,
        date: bngDate,
        createdAt: new Date()
    };

    const success = await addComment(state.currentNoticeId, comment);
    if (success) {
        input.value = '';
        showNotification('আপনার মন্তব্য পোস্ট করা হয়েছে', 'success');
        
        // Local state update for immediate feedback
        const notice = state.notices.find(n => n.docId === state.currentNoticeId);
        if (notice) {
            if (!notice.comments) notice.comments = [];
            notice.comments.unshift(comment);
            renderComments(notice.comments);
            if (document.getElementById('noticeDetailCommentsCount')) document.getElementById('noticeDetailCommentsCount').textContent = bng(notice.comments.length);
            if (document.getElementById('commentListCount')) document.getElementById('commentListCount').textContent = bng(notice.comments.length);
        }
    }
}

async function incrementViewCount(docId) {
    try {
        const { db } = await import('../firebase.js');
        const { doc, updateDoc, increment } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const docRef = doc(db, 'notices', docId);
        await updateDoc(docRef, { views: increment(1) });
    } catch (e) { console.error('View increment failed', e); }
}

async function addComment(docId, comment) {
    try {
        const { db } = await import('../firebase.js');
        const { doc, updateDoc, arrayUnion } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const docRef = doc(db, 'notices', docId);
        await updateDoc(docRef, { comments: arrayUnion(comment) });
        return true;
    } catch (e) {
        console.error('Comment failed', e);
        return false;
    }
}

async function handleNoticeDelete(docId) {
    if (!confirm('আপনি কি নিশ্চিত যে এই নোটিশটি মুছতে চান?')) return;
    const success = await deleteNotice(docId);
    if (success) showNotification('নোটিশ মুছে ফেলা হয়েছে', 'warning');
}

function editNotice(notice) {
    resetForm();
    if (document.getElementById('noticeModalTitle')) document.getElementById('noticeModalTitle').textContent = 'নোটিশ এডিট করুন';
    if (document.getElementById('noticeTitle')) document.getElementById('noticeTitle').value = notice.title;
    if (document.getElementById('noticeContent')) document.getElementById('noticeContent').value = notice.content;
    if (document.getElementById('noticeAuthor')) document.getElementById('noticeAuthor').value = notice.author;
    if (document.getElementById('noticeImportant')) document.getElementById('noticeImportant').checked = notice.important;
    if (elements.noticeForm) elements.noticeForm.dataset.editingId = notice.docId;
    elements.noticeModal?.classList.add('active');
}

function resetForm() {
    elements.noticeForm?.reset();
    if (elements.noticeForm) elements.noticeForm.dataset.editingId = '';
    if (document.getElementById('noticeModalTitle')) document.getElementById('noticeModalTitle').textContent = 'নতুন নোটিশ তৈরি করুন';
}
