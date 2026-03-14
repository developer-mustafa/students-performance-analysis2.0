/**
 * Access Request Manager Module
 * Handles viewing and managing access requests (Super Admin only)
 * with sliding card carousel UI
 * @module accessRequestManager
 */

import { getAccessRequests, updateAccessRequestStatus, deleteAccessRequest, subscribeToPendingAccessRequests } from '../firestoreService.js';
import { state } from './state.js';
import { showNotification, convertToBengaliDigits } from '../utils.js';
import { showConfirmModal } from './uiManager.js';

let _pendingRequestsUnsubscribe = null;
let _currentSlideIndex = 0;
let _totalSlides = 0;
let _keyboardListenerAttached = false;

/**
 * Initialize real-time notifications for pending access requests
 */
export function initAccessRequestNotifications() {
    if (!state.isSuperAdmin) return;

    // Cleanup existing listener if any
    if (_pendingRequestsUnsubscribe) _pendingRequestsUnsubscribe();

    const badge = document.getElementById('navAccessReqBadge');
    if (!badge) return;

    _pendingRequestsUnsubscribe = subscribeToPendingAccessRequests((count) => {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });

    return _pendingRequestsUnsubscribe;
}

/**
 * Navigate to a specific slide
 */
function goToSlide(index) {
    if (index < 0 || index >= _totalSlides) return;

    _currentSlideIndex = index;

    const track = document.querySelector('#arList .ar-slider-track');
    if (track) {
        track.style.transform = `translateX(-${index * 100}%)`;
    }

    // Update dots
    document.querySelectorAll('#arSliderNav .ar-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });

    // Update counter
    const counter = document.querySelector('#arSliderNav .ar-slide-counter');
    if (counter) {
        counter.textContent = `${index + 1} / ${_totalSlides}`;
    }

    // Update button states
    const prevBtn = document.querySelector('#arSliderNav .ar-slider-btn.ar-prev');
    const nextBtn = document.querySelector('#arSliderNav .ar-slider-btn.ar-next');
    if (prevBtn) prevBtn.classList.toggle('disabled', index === 0);
    if (nextBtn) nextBtn.classList.toggle('disabled', index === _totalSlides - 1);

    // Add entrance animation to current slide
    const slides = document.querySelectorAll('#arList .ar-slide');
    slides.forEach(s => s.classList.remove('ar-slide-enter'));
    if (slides[index]) {
        slides[index].classList.add('ar-slide-enter');
    }
}

/**
 * Build the slider navigation HTML
 */
function buildSliderNav(totalSlides) {
    let dotsHtml = '';
    for (let i = 0; i < totalSlides; i++) {
        dotsHtml += `<button class="ar-dot ${i === 0 ? 'active' : ''}" data-index="${i}" title="কার্ড ${i + 1}"></button>`;
    }

    return `
        <div class="ar-bottom-nav" style="
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            padding: 14px 0 6px;
            border-top: 1px solid var(--border-color, #eee);
            margin-top: 10px;
        ">
            <button class="ar-slider-btn ar-prev disabled" title="আগের কার্ড" style="
                width: 40px; height: 40px;
                border-radius: 50%;
                border: 1.5px solid var(--border-color, #ddd);
                background: var(--card-bg, #fff);
                color: var(--text-color, #333);
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; font-size: 0.85rem;
                transition: all 0.2s ease;
                box-shadow: 0 2px 6px rgba(0,0,0,0.08);
            ">
                <i class="fas fa-chevron-left"></i>
            </button>

            <div class="ar-dots-container" style="display:flex; gap:6px; align-items:center;">
                ${dotsHtml}
            </div>

            <span class="ar-slide-counter" style="
                font-size: 0.8rem;
                font-weight: 700;
                color: var(--text-muted, #888);
                min-width: 36px;
                text-align: center;
            ">১ / ${totalSlides}</span>

            <button class="ar-slider-btn ar-next ${totalSlides <= 1 ? 'disabled' : ''}" title="পরের কার্ড" style="
                width: 40px; height: 40px;
                border-radius: 50%;
                border: 1.5px solid var(--border-color, #ddd);
                background: var(--card-bg, #fff);
                color: var(--text-color, #333);
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; font-size: 0.85rem;
                transition: all 0.2s ease;
                box-shadow: 0 2px 6px rgba(0,0,0,0.08);
            ">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <style>
            .ar-slider-btn {
                width: 44px; height: 44px;
                border-radius: 50%;
                border: 1px solid var(--border-color, #ddd);
                background: #f8f9fa;
                color: var(--text-color, #333);
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; font-size: 1rem;
                transition: all 0.2s ease;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                position: static !important;
                transform: none !important;
                margin: 0 !important;
            }
            .ar-slider-btn:hover:not(.disabled) {
                background: var(--primary, #4361ee) !important;
                color: white !important;
                border-color: var(--primary, #4361ee) !important;
                transform: scale(1.08) !important;
                box-shadow: 0 4px 12px rgba(67, 97, 238, 0.3) !important;
            }
            .ar-slider-btn.disabled {
                opacity: 0.6;
                color: #bbb !important;
                background: #f1f1f1 !important;
                border-color: #eee !important;
                cursor: not-allowed !important;
                box-shadow: none !important;
            }
            /* Kill any floating side buttons */
            .ar-slider-btn.prev, .ar-slider-btn.next {
                display: none !important;
            }
            .ar-dot {
                width: 8px; height: 8px;
                border-radius: 50%;
                border: none;
                background: var(--border-color, #ddd);
                cursor: pointer;
                padding: 0;
                transition: all 0.2s;
            }
            .ar-dot.active {
                background: var(--primary, #4361ee);
                width: 22px;
                border-radius: 4px;
            }
            .ar-card-reason-box {
                display: -webkit-box;
                -webkit-line-clamp: 4;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;
                min-height: 60px;
                line-height: 1.5 !important;
            }
            @media (max-width: 576px) {
                .ar-card-reason-box {
                    -webkit-line-clamp: 5;
                }
            }
        </style>
    `;
}


/**
 * Load and render access requests as a slider carousel
 */
export async function loadAccessRequests() {
    const listEl = document.getElementById('arList');
    const navEl = document.getElementById('arSliderNav');

    if (!listEl) return;

    // If auth hasn't resolved yet (isSuperAdmin not set), wait and retry
    if (!state.isSuperAdmin) {
        listEl.innerHTML = '<p style="opacity: 0.5; text-align: center; padding: 30px;"><i class="fas fa-spinner fa-spin"></i> অনুমোদন যাচাই হচ্ছে...</p>';
        if (navEl) navEl.style.display = 'none';
        // Retry after 1.5s to allow Firebase auth to complete
        setTimeout(() => {
            if (state.isSuperAdmin) {
                loadAccessRequests();
            } else {
                listEl.innerHTML = '<p style="opacity: 0.5; text-align: center; padding: 30px;"><i class="fas fa-lock"></i> শুধুমাত্র সুপার অ্যাডমিনের জন্য</p>';
            }
        }, 1500);
        return;
    }

    listEl.innerHTML = '<p style="opacity: 0.5; text-align: center; padding: 30px;"><i class="fas fa-spinner fa-spin"></i> লোড হচ্ছে...</p>';
    if (navEl) navEl.style.display = 'none';

    try {
        const requests = await getAccessRequests();

        // Update statistics Dashboard in Header
        const total = requests.length;
        const pending = requests.filter(r => r.status === 'pending').length;
        const approved = requests.filter(r => r.status === 'approved').length;
        const rejected = requests.filter(r => r.status === 'rejected').length;

        const statsHtml = `
            <style>
                .ar-stats-dashboard {
                    display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-start; align-items: center; overflow: visible;
                    padding: 4px;
                }
                .ar-stat-card {
                    display: flex; align-items: center; gap: 8px;
                    padding: 6px 12px; flex: 1; min-width: 110px; max-width: 140px;
                    background: var(--card-bg, #fff);
                    border: 1px solid var(--border-color, #eaeaea);
                    border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                    transition: all 0.2s ease;
                }
                @media (max-width: 576px) {
                    .ar-stat-card {
                        min-width: 130px;
                        max-width: none;
                    }
                    .ar-stats-dashboard {
                        justify-content: center;
                    }
                }
                .ar-stat-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                }
                .ar-stat-icon {
                    width: 32px; height: 32px; border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 0.9rem;
                }
                .ar-stat-info {
                    display: flex; flex-direction: column; justify-content: center;
                }
                .ar-stat-value {
                    font-size: 1.25rem; font-weight: 700; color: var(--text-color, #222);
                    line-height: 1.2;
                }
                .ar-stat-label {
                    font-size: 0.75rem; font-weight: 600; color: var(--text-muted, #777);
                    text-transform: uppercase; letter-spacing: 0.5px;
                }
            </style>
            <div class="ar-stats-dashboard">
                <div class="ar-stat-card">
                    <div class="ar-stat-icon" style="background: rgba(67, 97, 238, 0.1); color: #4361ee;">
                        <i class="fas fa-list-ul"></i>
                    </div>
                    <div class="ar-stat-info">
                        <span class="ar-stat-value">${convertToBengaliDigits(total)}</span>
                        <span class="ar-stat-label">মোট</span>
                    </div>
                </div>
                <div class="ar-stat-card">
                    <div class="ar-stat-icon" style="background: rgba(255, 152, 0, 0.1); color: #f57c00;">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="ar-stat-info">
                        <span class="ar-stat-value">${convertToBengaliDigits(pending)}</span>
                        <span class="ar-stat-label">পেন্ডিং</span>
                    </div>
                </div>
                <div class="ar-stat-card">
                    <div class="ar-stat-icon" style="background: rgba(76, 175, 80, 0.1); color: #388e3c;">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="ar-stat-info">
                        <span class="ar-stat-value">${convertToBengaliDigits(approved)}</span>
                        <span class="ar-stat-label">অনুমোদিত</span>
                    </div>
                </div>
                <div class="ar-stat-card">
                    <div class="ar-stat-icon" style="background: rgba(244, 67, 54, 0.1); color: #d32f2f;">
                        <i class="fas fa-times-circle"></i>
                    </div>
                    <div class="ar-stat-info">
                        <span class="ar-stat-value">${convertToBengaliDigits(rejected)}</span>
                        <span class="ar-stat-label">প্রত্যাখ্যাত</span>
                    </div>
                </div>
            </div>
        `;

        const headerStats = document.getElementById('arHeaderStats');
        if (headerStats) {
            headerStats.innerHTML = statsHtml;
        }

        // Update navigation badge
        const navBadge = document.getElementById('navAccessReqBadge'); 
        if (navBadge) {
            if (pending > 0) {
                navBadge.textContent = convertToBengaliDigits(pending);
                navBadge.style.display = 'flex';
            } else {
                navBadge.style.display = 'none';
            }
        }

        // Apply status filter
        const filterStatus = document.getElementById('arStatusFilter')?.value || 'all';
        const filteredRequests = filterStatus === 'all' 
            ? requests 
            : requests.filter(r => r.status === filterStatus);

        if (filteredRequests.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; padding: 40px; opacity: 0.5;">
                <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                <p>${filterStatus === 'all' ? 'কোনো রিকোয়েস্ট নেই' : 'এই ক্যাটাগরিতে কোনো রিকোয়েস্ট নেই'}</p>
            </div>`;
            if (navEl) navEl.style.display = 'none';
            _totalSlides = 0;
            return;
        }

        // Build slider track with slides
        const slidesHtml = filteredRequests.map((req, idx) => {
            const statusColors = {
                pending: { bg: 'rgba(255, 152, 0, 0.05)', border: 'rgba(255, 152, 0, 0.1)', color: '#f57c00', icon: 'clock', text: 'পেন্ডিং' },
                approved: { bg: 'rgba(76, 175, 80, 0.05)', border: 'rgba(76, 175, 80, 0.1)', color: '#388e3c', icon: 'check-circle', text: 'অনুমোদিত' },
                rejected: { bg: 'rgba(244, 67, 54, 0.05)', border: 'rgba(244, 67, 54, 0.1)', color: '#d32f2f', icon: 'times-circle', text: 'প্রত্যাখ্যাত' }
            };
            const st = statusColors[req.status] || statusColors.pending;
            const date = req.createdAt?.toDate?.() || new Date();
            const dateStr = date.toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' });

            // Professional Compact Reason Logic
            const originalReason = req.reason || 'উল্লেখ করা হয়নি';
            const displayReason = originalReason; // Let CSS handle truncation

            return `
            <div class="ar-slide ${idx === 0 ? 'ar-slide-enter' : ''}">
                <div class="ar-card ar-card-wrapper" data-id="${req.docId}" data-status="${req.status}">
                    <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: ${st.color}; opacity: 0.8;"></div>
                    <div class="ar-card-inner">
                        <div class="ar-card-header">
                            <div class="ar-card-avatar">
                                <i class="fas fa-user-circle"></i>
                            </div>
                            <div class="ar-card-info">
                                <strong class="ar-card-name">${req.name || 'নাম নেই'}</strong>
                                <span style="font-size: 0.7rem; color: var(--text-muted);">${dateStr} • ${req.group || 'ব্যবহারকারী'}</span>
                            </div>
                        </div>
                        
                        <div class="ar-card-contact-strip">
                            <div class="ar-card-contact-item">
                                <i class="fas fa-phone-alt" style="color: #4caf50;"></i> ${req.phone || 'N/A'}
                            </div>
                            <div class="ar-card-contact-item">
                                <i class="fas fa-envelope" style="color: var(--primary);"></i> ${req.email || req.contact || 'N/A'}
                            </div>
                        </div>

                        <div class="ar-card-reason-box truncated" 
                             data-reason="${originalReason.replace(/"/g, '&quot;')}" 
                             data-name="${req.name || 'ব্যবহারকারী'}">
                            <div style="font-size: 0.82rem; line-height: 1.4;">
                                <strong style="color: var(--primary);">কারণ:</strong> ${displayReason}
                            </div>
                        </div>
                        
                        <div class="ar-card-actions-row">
                            <span class="ar-card-status-badge" style="background: ${st.bg}; color: ${st.color}; border: 1px solid ${st.border};">
                                <i class="fas fa-${st.icon}"></i> ${st.text}
                            </span>
                            
                            <div class="ar-card-btn-group">
                                ${req.status === 'pending' ? `
                                    <button class="ar-card-btn approve ar-approve-btn" data-id="${req.docId}" data-name="${req.name || ''}" style="background: #4caf50; color: white; border: none;">
                                        <i class="fas fa-check"></i> <span>অনুমোদন</span>
                                    </button>
                                    <button class="ar-card-btn reject ar-reject-btn" data-id="${req.docId}" data-name="${req.name || ''}" style="background: #ff5252; color: white; border: none;">
                                        <i class="fas fa-times"></i>
                                    </button>
                                ` : req.status === 'approved' ? `
                                    <button class="ar-card-btn reject ar-reject-btn" data-id="${req.docId}" data-name="${req.name || ''}" style="background: #ffa000; color: white; border: none;">
                                        <i class="fas fa-times"></i> <span>প্রত্যাখ্যান</span>
                                    </button>
                                    <button class="ar-card-btn delete ar-delete-btn" data-id="${req.docId}" style="background: none; border: 1px solid #ff5252; color: #ff5252;">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                ` : req.status === 'rejected' ? `
                                    <button class="ar-card-btn approve ar-approve-btn" data-id="${req.docId}" data-name="${req.name || ''}" style="background: #4caf50; color: white; border: none;">
                                        <i class="fas fa-check"></i> <span>অনুমোদন</span>
                                    </button>
                                    <button class="ar-card-btn delete ar-delete-btn" data-id="${req.docId}" style="background: none; border: 1px solid #ff5252; color: #ff5252;">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        // Render slider
        listEl.innerHTML = `
            <div class="custom-ar-slider-wrapper" style="position:relative; overflow:hidden; width:100%;">
                <div class="ar-slider-track">${slidesHtml}</div>
            </div>
        `;

        // Setup slider state
        _totalSlides = filteredRequests.length;
        _currentSlideIndex = 0;

        // Render navigation
        if (navEl && _totalSlides > 0) {
            navEl.innerHTML = buildSliderNav(_totalSlides);
            navEl.style.display = 'block';

            // Attach nav event listeners (bottom nav buttons only)
            const allPrev = navEl.querySelectorAll('.ar-prev');
            const allNext = navEl.querySelectorAll('.ar-next');

            allPrev.forEach(btn => btn.addEventListener('click', () => {
                if (_currentSlideIndex > 0) goToSlide(_currentSlideIndex - 1);
            }));
            allNext.forEach(btn => btn.addEventListener('click', () => {
                if (_currentSlideIndex < _totalSlides - 1) goToSlide(_currentSlideIndex + 1);
            }));

            // Dot click handlers
            navEl.querySelectorAll('.ar-dot').forEach(dot => {
                dot.addEventListener('click', () => {
                    const idx = parseInt(dot.dataset.index);
                    if (!isNaN(idx)) goToSlide(idx);
                });
            });
        }

        // Attach reason box click listeners for modal
        listEl.querySelectorAll('.ar-card-reason-box').forEach(box => {
            box.addEventListener('click', () => {
                const name = box.dataset.name;
                const reason = box.dataset.reason;
                showDetailsModal(name, reason);
            });
        });

        // Attach card action event handlers
        listEl.querySelectorAll('.ar-approve-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const name = btn.dataset.name;

                showConfirmModal(
                    `${name} এর রিকোয়েস্ট অনুমোদন করতে চান?`,
                    async () => {
                        const success = await updateAccessRequestStatus(id, 'approved', 'teacher');
                        if (success) {
                            showNotification(`${name} এর রিকোয়েস্ট অনুমোদিত হয়েছে ✅`);
                            loadAccessRequests();
                        } else {
                            showNotification('আপডেট করতে সমস্যা হয়েছে', 'error');
                        }
                    },
                    name,
                    'অনুমোদনের পর ব্যবহারকারী সিস্টেমে লগইন করতে পারবেন।',
                    {
                        title: 'অনুমোদন করতে চান?',
                        icon: 'fa-check-circle',
                        iconColor: '#4caf50',
                        btnText: 'হ্যাঁ, অনুমোদন করুন',
                        btnClass: 'btn-success'
                    }
                );
            });
        });

        listEl.querySelectorAll('.ar-reject-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const name = btn.dataset.name;

                showConfirmModal(
                    `${name} এর রিকোয়েস্ট প্রত্যাখ্যান করতে চান?`,
                    async () => {
                        const success = await updateAccessRequestStatus(id, 'rejected');
                        if (success) {
                            showNotification(`${name} এর রিকোয়েস্ট প্রত্যাখ্যাত হয়েছে ⛔`);
                            loadAccessRequests();
                        } else {
                            showNotification('আপডেট করতে সমস্যা হয়েছে', 'error');
                        }
                    },
                    name,
                    'প্রত্যাখ্যানের পর ব্যবহারকারী লগইন করতে পারবেন না।',
                    {
                        title: 'প্রত্যাখ্যান করতে চান?',
                        icon: 'fa-times-circle',
                        iconColor: '#ffa000',
                        btnText: 'হ্যাঁ, প্রত্যাখ্যান করুন',
                        btnClass: 'btn-warning-confirm'
                    }
                );
            });
        });

        listEl.querySelectorAll('.ar-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const card = btn.closest('.ar-card-wrapper');
                const name = card.querySelector('.ar-card-name').textContent;

                showConfirmModal(
                    'এই রিকোয়েস্ট মুছে ফেলতে চান?',
                    async () => {
                        const success = await deleteAccessRequest(id);
                        if (success) {
                            showNotification('রিকোয়েস্ট মুছে ফেলা হয়েছে');
                            loadAccessRequests();
                        } else {
                            showNotification('মুছতে সমস্যা হয়েছে', 'error');
                        }
                    },
                    name,
                    'এটি স্থায়ীভাবে মুছে যাবে।'
                );
            });
        });

    } catch (error) {
        console.error('Error loading access requests:', error);
        listEl.innerHTML = '<p style="color: red; text-align: center;">লোড করতে সমস্যা হয়েছে</p>';
    }
}

/**
 * Initialize the details modal HTML
 */
function initDetailsModal() {
    if (document.getElementById('arDetailsModal')) return;

    const modal = document.createElement('div');
    modal.id = 'arDetailsModal';
    modal.className = 'ar-details-modal-overlay';
    modal.innerHTML = `
        <div class="ar-details-modal">
            <div style="padding: 24px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--container-bg);">
                <h3 style="margin: 0; font-size: 1.2rem; font-weight: 800; color: var(--primary);">অনুরোধের বিস্তারিত</h3>
                <button class="ar-modal-close" style="background: none; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer;"><i class="fas fa-times"></i></button>
            </div>
            <div style="padding: 24px; max-height: 400px; overflow-y: auto;">
                <div id="arModalUserLabel" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 8px;">আবেদনকারী</div>
                <div id="arModalUserName" style="font-size: 1.1rem; font-weight: 700; color: var(--text-color); margin-bottom: 20px;"></div>
                
                <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 8px;">অনুরোধের কারণ</div>
                <div id="arModalReason" style="font-size: 1rem; line-height: 1.7; color: var(--text-color); white-space: pre-wrap; word-wrap: break-word; background: var(--container-bg); padding: 15px; border-radius: 12px; border: 1px solid var(--border-color);"></div>
            </div>
            <div style="padding: 20px 24px; background: var(--container-bg); border-top: 1px solid var(--border-color); text-align: right;">
                <button class="ar-modal-close-btn" style="padding: 10px 25px; background: var(--primary); color: white; border: none; border-radius: 10px; font-weight: 700; cursor: pointer;">বন্ধ করুন</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event Listeners
    modal.querySelectorAll('.ar-modal-close, .ar-modal-close-btn').forEach(btn => {
        btn.addEventListener('click', closeDetailsModal);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeDetailsModal();
    });
}

/**
 * Show the details modal
 */
function showDetailsModal(name, reason) {
    const modal = document.getElementById('arDetailsModal');
    const nameEl = document.getElementById('arModalUserName');
    const reasonEl = document.getElementById('arModalReason');

    if (!modal || !nameEl || !reasonEl) return;

    nameEl.textContent = name;
    reasonEl.textContent = reason;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; 
}

/**
 * Close the details modal
 */
function closeDetailsModal() {
    const modal = document.getElementById('arDetailsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Initialize the access request page UI
 */
export function initAccessRequestUI() {
    initDetailsModal();
    const statusFilter = document.getElementById('arStatusFilter');
    const refreshBtn = document.getElementById('arRefreshBtn');

    if (statusFilter) {
        statusFilter.addEventListener('change', () => loadAccessRequests());
    }
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadAccessRequests());
    }

    // Attach keyboard navigation (only once)
    if (!_keyboardListenerAttached) {
        _keyboardListenerAttached = true;
        document.addEventListener('keydown', (e) => {
            // Only work when access-requests page is visible
            const page = document.getElementById('accessRequestsPage');
            if (!page || page.style.display === 'none') return;
            if (_totalSlides <= 0) return;

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (_currentSlideIndex > 0) goToSlide(_currentSlideIndex - 1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (_currentSlideIndex < _totalSlides - 1) goToSlide(_currentSlideIndex + 1);
            }
        });
    }
}
