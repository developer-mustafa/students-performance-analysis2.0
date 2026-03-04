/**
 * Access Request Manager Module
 * Handles viewing and managing access requests (Super Admin only)
 * with sliding card carousel UI
 * @module accessRequestManager
 */

import { getAccessRequests, updateAccessRequestStatus, deleteAccessRequest, subscribeToPendingAccessRequests } from '../firestoreService.js';
import { state } from './state.js';
import { showNotification } from '../utils.js';

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

    const track = document.querySelector('.ar-slider-track');
    if (track) {
        track.style.transform = `translateX(-${index * 100}%)`;
    }

    // Update dots
    document.querySelectorAll('.ar-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });

    // Update counter
    const counter = document.querySelector('.ar-slide-counter');
    if (counter) {
        counter.textContent = `${index + 1} / ${_totalSlides}`;
    }

    // Update button states
    const prevBtn = document.querySelector('.ar-slider-btn.ar-prev');
    const nextBtn = document.querySelector('.ar-slider-btn.ar-next');
    if (prevBtn) prevBtn.classList.toggle('disabled', index === 0);
    if (nextBtn) nextBtn.classList.toggle('disabled', index === _totalSlides - 1);

    // Add entrance animation to current slide
    const slides = document.querySelectorAll('.ar-slide');
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
        <div class="ar-slider-nav">
            <button class="ar-slider-btn ar-prev disabled" title="আগের কার্ড (←)">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="ar-dots-container">
                ${dotsHtml}
            </div>
            <span class="ar-slide-counter">1 / ${totalSlides}</span>
            <button class="ar-slider-btn ar-next ${totalSlides <= 1 ? 'disabled' : ''}" title="পরের কার্ড (→)">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="ar-key-hint">
            <kbd>←</kbd> <kbd>→</kbd> কী দিয়ে স্লাইড করুন
        </div>
    `;
}

/**
 * Load and render access requests as a slider carousel
 */
export async function loadAccessRequests() {
    if (!state.isSuperAdmin) return;

    const listEl = document.getElementById('arList');
    const navEl = document.getElementById('arSliderNav');
    const totalBadge = document.getElementById('arTotalCount');
    const pendingBadge = document.getElementById('arPendingCount');
    const statusFilter = document.getElementById('arStatusFilter');

    if (!listEl) return;

    listEl.innerHTML = '<p style="opacity: 0.5; text-align: center; padding: 30px;"><i class="fas fa-spinner fa-spin"></i> লোড হচ্ছে...</p>';
    if (navEl) navEl.style.display = 'none';

    try {
        const requests = await getAccessRequests();

        // Update badges
        if (totalBadge) totalBadge.textContent = requests.length;
        const pendingCount = requests.filter(r => r.status === 'pending').length;
        if (pendingBadge) pendingBadge.textContent = pendingCount + ' পেন্ডিং';

        // Filter by status
        const filter = statusFilter?.value || 'all';
        const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

        if (filtered.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; padding: 40px; opacity: 0.5;">
                <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                <p>${filter === 'all' ? 'কোনো রিকোয়েস্ট নেই' : 'এই ক্যাটাগরিতে কোনো রিকোয়েস্ট নেই'}</p>
            </div>`;
            if (navEl) navEl.style.display = 'none';
            _totalSlides = 0;
            return;
        }

        // Build slider track with slides
        const slidesHtml = filtered.map((req, idx) => {
            const statusColors = {
                pending: { bg: '#fff3e0', color: '#e65100', icon: 'clock', text: 'পেন্ডিং' },
                approved: { bg: '#e8f5e9', color: '#2e7d32', icon: 'check-circle', text: 'অনুমোদিত' },
                rejected: { bg: '#ffebee', color: '#c62828', icon: 'times-circle', text: 'প্রত্যাখ্যাত' }
            };
            const st = statusColors[req.status] || statusColors.pending;
            const date = req.createdAt?.toDate?.() || new Date();
            const dateStr = date.toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            return `
            <div class="ar-slide ${idx === 0 ? 'ar-slide-enter' : ''}">
                <div class="ar-card" data-id="${req.docId}" data-status="${req.status}"
                    style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.05); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: ${st.color}; opacity: 0.8;"></div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 15px;">
                        <div style="flex: 1; min-width: 250px;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <div style="width: 40px; height: 40px; background: var(--container-bg); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--primary); border: 1px solid var(--border-color);">
                                    <i class="fas fa-user-tie" style="font-size: 1.2rem;"></i>
                                </div>
                                <div>
                                    <strong style="font-size: 1.1rem; color: var(--text-color); display: block;">${req.name || 'নাম নেই'}</strong>
                                    <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${st.text} • ${dateStr}</span>
                                </div>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 12px; padding: 10px; background: var(--container-bg); border-radius: 10px; border: 1px solid var(--border-color);">
                                <div style="font-size: 0.85rem; color: var(--text-color); display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-phone-alt" style="color: #4caf50; width: 14px;"></i> 
                                    <span style="font-weight: 500;">${req.phone || 'N/A'}</span>
                                </div>
                                <div style="font-size: 0.85rem; color: var(--text-color); display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-envelope" style="color: var(--primary); width: 14px;"></i> 
                                    <span style="font-weight: 500;">${req.email || req.contact || 'N/A'}</span>
                                </div>
                            </div>

                            <div style="background: rgba(var(--primary-rgb, 74, 144, 226), 0.05); padding: 12px 15px; border-radius: 12px; font-size: 0.9rem; color: var(--text-color); border: 1px dashed var(--border-color); line-height: 1.5;">
                                <strong style="color: var(--primary); font-size: 0.8rem; text-transform: uppercase; display: block; margin-bottom: 4px;">অনুরোধের কারণ:</strong> 
                                ${req.reason || 'উল্লেখ করা হয়নি'}
                            </div>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 12px;">
                            <span style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; background: ${st.bg}; color: ${st.color}; border: 1px solid rgba(0,0,0,0.05);">
                                <i class="fas fa-${st.icon}"></i> ${st.text}
                            </span>
                            
                            ${req.status === 'pending' ? `
                            <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                                <button class="ar-approve-btn transition-transform" data-id="${req.docId}" data-name="${req.name || ''}"
                                    style="background: #4caf50; color: white; border: none; border-radius: 8px; padding: 10px 18px; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 10px rgba(76, 175, 80, 0.2);">
                                    <i class="fas fa-check-circle"></i> অনুমোদন করুন
                                </button>
                                <button class="ar-reject-btn transition-transform" data-id="${req.docId}" data-name="${req.name || ''}"
                                    style="background: #f44336; color: white; border: none; border-radius: 8px; padding: 10px 18px; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 10px rgba(244, 67, 54, 0.2);">
                                    <i class="fas fa-times-circle"></i> প্রত্যাখ্যান
                                </button>
                            </div>` : `
                            <button class="ar-delete-btn" data-id="${req.docId}"
                                style="background: transparent; color: #f44336; border: 1px solid rgba(244, 67, 54, 0.3); border-radius: 8px; padding: 8px 15px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                                <i class="fas fa-trash-alt"></i> রেকর্ড মুছুন
                            </button>`}
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        // Render slider
        listEl.innerHTML = `<div class="ar-slider-track">${slidesHtml}</div>`;

        // Setup slider state
        _totalSlides = filtered.length;
        _currentSlideIndex = 0;

        // Render navigation
        if (navEl && _totalSlides > 0) {
            navEl.innerHTML = buildSliderNav(_totalSlides);
            navEl.style.display = 'block';

            // Attach nav event listeners
            const prevBtn = navEl.querySelector('.ar-prev');
            const nextBtn = navEl.querySelector('.ar-next');

            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    if (_currentSlideIndex > 0) goToSlide(_currentSlideIndex - 1);
                });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    if (_currentSlideIndex < _totalSlides - 1) goToSlide(_currentSlideIndex + 1);
                });
            }

            // Dot click handlers
            navEl.querySelectorAll('.ar-dot').forEach(dot => {
                dot.addEventListener('click', () => {
                    const idx = parseInt(dot.dataset.index);
                    if (!isNaN(idx)) goToSlide(idx);
                });
            });
        }

        // Attach card action event handlers
        listEl.querySelectorAll('.ar-approve-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                if (!confirm(`${name} এর রিকোয়েস্ট অনুমোদন করতে চান?`)) return;
                const success = await updateAccessRequestStatus(id, 'approved', 'teacher');
                if (success) {
                    showNotification(`${name} এর রিকোয়েস্ট অনুমোদিত হয়েছে ✅`);
                    loadAccessRequests();
                } else {
                    showNotification('আপডেট করতে সমস্যা হয়েছে', 'error');
                }
            });
        });

        listEl.querySelectorAll('.ar-reject-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                if (!confirm(`${name} এর রিকোয়েস্ট প্রত্যাখ্যান করতে চান?`)) return;
                const success = await updateAccessRequestStatus(id, 'rejected');
                if (success) {
                    showNotification(`${name} এর রিকোয়েস্ট প্রত্যাখ্যাত হয়েছে ⛔`);
                    loadAccessRequests();
                } else {
                    showNotification('আপডেট করতে সমস্যা হয়েছে', 'error');
                }
            });
        });

        listEl.querySelectorAll('.ar-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (!confirm('এই রিকোয়েস্ট মুছে ফেলতে চান?')) return;
                const success = await deleteAccessRequest(id);
                if (success) {
                    showNotification('রিকোয়েস্ট মুছে ফেলা হয়েছে');
                    loadAccessRequests();
                } else {
                    showNotification('মুছতে সমস্যা হয়েছে', 'error');
                }
            });
        });

    } catch (error) {
        console.error('Error loading access requests:', error);
        listEl.innerHTML = '<p style="color: red; text-align: center;">লোড করতে সমস্যা হয়েছে</p>';
    }
}

/**
 * Initialize the access request page UI
 */
export function initAccessRequestUI() {
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
