import { state } from './state.js';
import { 
    updateAccessControlSettings, 
    subscribeToAccessControl
} from '../firestoreService.js';
import { COLLECTIONS } from '../firestoreService.js';
import { doc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { showNotification } from '../utils.js';

const AccessControlManager = {
    init() {
        this.setupEventListeners();
        this.subscribeToUpdates();
        console.log('AccessControlManager ইমপ্লিমেন্টেড');
    },

    setupEventListeners() {
        // Global Entry Buttons
        document.getElementById('acAllSikshokOk')?.addEventListener('click', () => this.handleGlobalEntry(false));
        document.getElementById('acAllSikshokNo')?.addEventListener('click', () => this.handleGlobalEntry(true));

        // Deadline Save
        document.getElementById('acSaveDeadlineBtn')?.addEventListener('click', () => this.handleSaveDeadline());

        // Teacher Search
        document.getElementById('acTeacherSearch')?.addEventListener('input', (e) => this.filterTeachers(e.target.value));

        // Deadline Toggle (New)
        document.getElementById('acDeadlineEnabled')?.addEventListener('change', (e) => {
            this.handleDeadlineToggle(e.target.checked);
        });

        // Result Publication Deadline
        document.getElementById('acResultPublishEnabled')?.addEventListener('change', (e) => {
            this.handleResultDeadlineToggle(e.target.checked);
        });
        document.getElementById('acSaveResultDeadlineBtn')?.addEventListener('click', () => {
            this.handleSaveResultDeadline();
        });

        // Global Result Status Buttons
        document.getElementById('acResultOk')?.addEventListener('click', () => this.handleGlobalResult(false));
        document.getElementById('acResultNo')?.addEventListener('click', () => this.handleGlobalResult(true));
    },

    subscribeToUpdates() {
        subscribeToAccessControl((settings) => {
            if (settings) {
                state.accessControl = {
                    ...state.accessControl,
                    ...settings
                };
                this.renderUI();
            } else {
                // Initialize default if not exists
                this.handleGlobalEntry(false);
            }
        });
    },

    async renderUI() {
        this.renderTabAccess();
        this.renderGlobalStatus();
        this.renderGlobalResultStatus();
        await this.renderTeacherList();
        
        // Update deadline fields
        const deadlineInput = document.getElementById('acEntryDeadline');
        const deadlineToggle = document.getElementById('acDeadlineEnabled');
        
        if (deadlineInput && state.accessControl.entryDeadline) {
            deadlineInput.value = state.accessControl.entryDeadline;
        }
        if (deadlineToggle) {
            deadlineToggle.checked = state.accessControl.deadlineEnabled || false;
            const lbl = document.getElementById('acDeadlineLabel');
            if (lbl) lbl.textContent = deadlineToggle.checked ? 'অন' : 'অফ';
        }

        // Result Publication update fields
        const resultDeadlineInput = document.getElementById('acResultDeadline');
        const resultDeadlineToggle = document.getElementById('acResultPublishEnabled');
        
        if (resultDeadlineInput && state.accessControl.resultPublishDeadline) {
            resultDeadlineInput.value = state.accessControl.resultPublishDeadline;
        }
        if (resultDeadlineToggle) {
            resultDeadlineToggle.checked = state.accessControl.resultPublishEnabled || false;
            const lbl = document.getElementById('acResultPublishLabel');
            if (lbl) lbl.textContent = resultDeadlineToggle.checked ? 'অন' : 'অফ';
        }
    },

    renderTabAccess() {
        const container = document.getElementById('acTabAccessList');
        if (!container) return;

        const tabs = [
            { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: 'fa-chart-bar' },
            { id: 'students', label: 'শিক্ষার্থী', icon: 'fa-user-graduate' },
            { id: 'result-entry', label: 'রেজাল্ট এন্ট্রি', icon: 'fa-keyboard' },
            { id: 'marksheet', label: 'মার্কশীট', icon: 'fa-file-alt' },
            { id: 'admit-card', label: 'এডমিট ও সিট প্লান', icon: 'fa-id-card' }
        ];

        const roles = ['admin', 'teacher'];

        let html = '';
        tabs.forEach(tab => {
            const currentAccess = state.accessControl.tabAccess[tab.id] || [];
            html += `
                <div class="ac-tab-row">
                    <div class="ac-tab-row-label">
                        <i class="fas ${tab.icon}"></i>
                        <span>${tab.label}</span>
                    </div>
                    <div class="ac-tab-checks">
                        ${roles.map(role => `
                            <div class="ac-tab-check-item">
                                <span class="ac-tab-role-name">${role === 'admin' ? 'এডমিন' : 'শিক্ষক'}</span>
                                <label class="ac-sw">
                                    <input type="checkbox" data-tab="${tab.id}" data-role="${role}" 
                                        ${currentAccess.includes(role) ? 'checked' : ''}
                                        onchange="AccessControlManager.toggleTabAccess(this)">
                                    <span class="ac-sw-sl"></span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        window.AccessControlManager = this; // Expose for onchange
    },

    async toggleTabAccess(checkbox) {
        const { tab, role } = checkbox.dataset;
        const currentAccess = state.accessControl.tabAccess[tab] || [];
        
        let newAccess;
        if (checkbox.checked) {
            newAccess = [...new Set([...currentAccess, role])];
        } else {
            newAccess = currentAccess.filter(r => r !== role);
        }

        // Always keep super_admin
        if (!newAccess.includes('super_admin')) {
            newAccess.push('super_admin');
        }

        const updatedTabAccess = {
            ...state.accessControl.tabAccess,
            [tab]: newAccess
        };

        await updateAccessControlSettings({ tabAccess: updatedTabAccess });
        showNotification(`${tab} এর এক্সেস আপডেট করা হয়েছে`);
    },

    renderGlobalStatus() {
        const statusText = document.getElementById('acGlobalStatusText');
        const entryDisabled = state.accessControl.globalEntryDisabled;
        
        if (statusText) {
            statusText.innerText = entryDisabled 
                ? 'বর্তমানে সকল শিক্ষকের জন্য এন্ট্রি বন্ধ আছে' 
                : 'সকল শিক্ষকের জন্য এন্ট্রি সক্রিয় আছে';
            statusText.style.color = entryDisabled ? '#ef4444' : '#10b981';
            statusText.style.fontWeight = '700';
        }

        // Highlight active buttons
        const okBtn = document.getElementById('acAllSikshokOk');
        const noBtn = document.getElementById('acAllSikshokNo');
        if (okBtn && noBtn) {
            if (entryDisabled) {
                okBtn.style.opacity = '0.5';
                noBtn.style.opacity = '1';
                noBtn.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.3)';
            } else {
                okBtn.style.opacity = '1';
                okBtn.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.3)';
                noBtn.style.opacity = '0.5';
                noBtn.style.boxShadow = 'none';
            }
        }
    },

    async handleGlobalEntry(disabled) {
        await updateAccessControlSettings({ globalEntryDisabled: disabled });
        showNotification(disabled ? 'গ্লোবাল এন্ট্রি বন্ধ করা হয়েছে' : 'গ্লোবাল এন্ট্রি খোলা হয়েছে');
    },

    async handleDeadlineToggle(enabled) {
        await updateAccessControlSettings({ deadlineEnabled: enabled });
        showNotification(enabled ? 'এন্ট্রি ডেডলাইন সক্রিয় করা হয়েছে' : 'এন্ট্রি ডেডলাইন নিস্ক্রিয় করা হয়েছে');
    },

    async handleSaveDeadline() {
        const deadline = document.getElementById('acEntryDeadline').value;
        await updateAccessControlSettings({ entryDeadline: deadline });
        showNotification('ডেডলাইন আপডেট করা হয়েছে');
    },

    async handleResultDeadlineToggle(enabled) {
        await updateAccessControlSettings({ resultPublishEnabled: enabled });
        showNotification(enabled ? 'ফলাফল শিডিউল পাবলিশ অন করা হয়েছে' : 'ফলাফল শিডিউল পাবলিশ অফ করা হয়েছে');
    },

    async handleSaveResultDeadline() {
        const deadline = document.getElementById('acResultDeadline').value;
        await updateAccessControlSettings({ resultPublishDeadline: deadline });
        showNotification('ফলাফল পাবলিশ ডেডলাইন আপডেট করা হয়েছে');
    },

    async handleGlobalResult(disabled) {
        await updateAccessControlSettings({ globalResultDisabled: disabled });
        showNotification(disabled ? 'ফলাফল ড্রাফট মোডে রাখা হয়েছে (পাবলিকলি বন্ধ)' : 'ফলাফল সবার জন্য উন্মুক্ত করা হয়েছে');
    },

    renderGlobalResultStatus() {
        const statusText = document.getElementById('acResultStatusText');
        const resultsDisabled = state.accessControl.globalResultDisabled;
        
        if (statusText) {
            statusText.innerText = resultsDisabled 
                ? 'বর্তমানে জনসাধারণের জন্য ফলাফল বন্ধ আছে' 
                : 'ফলাফল জনসাধারণের জন্য উন্মুক্ত আছে';
            statusText.style.color = resultsDisabled ? '#ef4444' : '#10b981';
            statusText.style.fontWeight = '700';
        }

        // Highlight active buttons
        const okBtn = document.getElementById('acResultOk');
        const noBtn = document.getElementById('acResultNo');
        if (okBtn && noBtn) {
            if (resultsDisabled) {
                okBtn.style.opacity = '0.5';
                okBtn.style.boxShadow = 'none';
                noBtn.style.opacity = '1';
                noBtn.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.3)';
            } else {
                okBtn.style.opacity = '1';
                okBtn.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.3)';
                noBtn.style.opacity = '0.5';
                noBtn.style.boxShadow = 'none';
            }
        }
    },

    async renderTeacherList() {
        const container = document.getElementById('acTeacherList');
        if (!container) return;

        try {
            // 1. Get all assignments first
            const aq = query(collection(db, COLLECTIONS.teacher_assignments));
            const assignmentSnapshot = await getDocs(aq);
            const assignments = [];
            const assignedUids = new Set();
            assignmentSnapshot.forEach(doc => {
                const data = doc.data();
                assignments.push(data);
                assignedUids.add(data.uid);
            });

            // 2. Get all users (to include names/emails for anyone with an assignment)
            // or those specifically with role 'teacher'
            const usersRef = collection(db, COLLECTIONS.users);
            const userSnapshot = await getDocs(usersRef);
            const allUsers = [];
            userSnapshot.forEach(doc => {
                allUsers.push({ uid: doc.id, ...doc.data() });
            });

            // 3. Filter teachers: those with role 'teacher' OR those who have an assignment
            const teachers = allUsers.filter(u => u.role === 'teacher' || assignedUids.has(u.uid));

            // Map assignments to teachers
            teachers.forEach(teacher => {
                teacher.assignments = assignments.filter(a => a.uid === teacher.uid);
            });

            this.allTeachers = teachers; // Store for filtering
            this.displayTeachers(teachers);
        } catch (error) {
            console.error('শিক্ষক তালিকা লোড করতে সমস্যা:', error);
            container.innerHTML = '<p style="color:red; text-align:center;">শিক্ষক তালিকা লোড করতে ব্যর্থ হয়েছে</p>';
        }
    },

    getBadgeStyle(text, type) {
        if (!text) return '';
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = text.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const hue = Math.abs(hash % 360);
        const isDarkMode = document.body.classList.contains('dark-mode');
        
        // Dynamic adjustment for contrast
        const saturation = type === 'class' ? 80 : 70;
        const bgLightness = isDarkMode ? 15 : 94; // Darker in dark mode, very light in light mode
        const textLightness = isDarkMode ? 85 : 30; // Brighter in dark mode, darker in light mode
        const borderAlpha = isDarkMode ? 0.3 : 0.8;

        return `background: hsl(${hue}, ${saturation}%, ${bgLightness}%); 
                color: hsl(${hue}, ${saturation}%, ${textLightness}%); 
                border-color: hsla(${hue}, ${saturation}%, ${isDarkMode ? 40 : 80}%, ${borderAlpha});`;
    },

    displayTeachers(teachers) {
        const container = document.getElementById('acTeacherList');
        if (!container) return;

        // Global Statistics calculation (from allTeachers)
        const statsSource = this.allTeachers || teachers;
        const total = statsSource.length;
        const activeCount = statsSource.filter(t => !state.accessControl.teacherPermissions[t.uid]?.disabled).length;
        const inactiveCount = total - activeCount;

        // Update stats UI
        const statTotal = document.getElementById('acStatTotal');
        const statActive = document.getElementById('acStatActive');
        const statInactive = document.getElementById('acStatInactive');
        
        if (statTotal) statTotal.textContent = total;
        if (statActive) statActive.textContent = activeCount;
        if (statInactive) statInactive.textContent = inactiveCount;

        if (teachers.length === 0) {
            container.innerHTML = '<p style="text-align:center; opacity:0.5; padding: 20px;">কোন শিক্ষক পাওয়া যায়নি</p>';
            return;
        }

        container.innerHTML = '';
        teachers.forEach(teacher => {
            const isDisabled = state.accessControl.teacherPermissions[teacher.uid]?.disabled || false;
            const statusClass = isDisabled ? 'is-inactive' : 'is-active';
            
            const classes = [...new Set(teacher.assignments?.map(a => a.assignedClass).filter(Boolean))];
            const sessions = [...new Set(teacher.assignments?.map(a => a.assignedSession).filter(Boolean))];

            const badgesHtml = `
                ${classes.map(c => `<span class="ac-badge" style="${this.getBadgeStyle(c, 'class')}">${c}</span>`).join('')}
                ${sessions.map(s => `<span class="ac-badge" style="${this.getBadgeStyle(s, 'session')}">${s}</span>`).join('')}
            `;

            const row = document.createElement('div');
            row.className = `ac-teacher-row ${statusClass}`;
            row.id = `teacher-row-${teacher.uid}`;
            row.innerHTML = `
                <div class="ac-teacher-info" style="flex:1;">
                    <div class="ac-teacher-name">${teacher.displayName || 'নামহীন শিক্ষক'}</div>
                    <div class="ac-teacher-email" style="font-size: 0.8rem; opacity: 0.6;">${teacher.email}</div>
                    <div class="ac-badge-group">
                        ${badgesHtml}
                    </div>
                </div>
                <div class="ac-teacher-action">
                    <label class="ac-sw">
                        <input type="checkbox" data-uid="${teacher.uid}" ${!isDisabled ? 'checked' : ''}>
                        <span class="ac-sw-sl"></span>
                    </label>
                </div>
            `;
            container.appendChild(row);
        });

        // Add event listeners for toggles
        container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                const uid = e.target.dataset.uid;
                const active = e.target.checked;
                const row = document.getElementById(`teacher-row-${uid}`);

                if (row) {
                    row.classList.toggle('is-active', active);
                    row.classList.toggle('is-inactive', !active);
                }

                const success = await this.toggleTeacherPermission(uid, !active);
                if (success) {
                    showNotification(active ? 'পারমিশন সক্রিয় করা হয়েছে' : 'পারমিশন নিস্ক্রিয় করা হয়েছে', 'success');
                    // Update state and refresh UI for perfect accuracy
                    if (state.accessControl.teacherPermissions[uid]) {
                        state.accessControl.teacherPermissions[uid].disabled = !active;
                    } else {
                        state.accessControl.teacherPermissions[uid] = { disabled: !active };
                    }
                    
                    // Re-calculate and update stats UI immediately
                    const currentStatsSource = this.allTeachers || teachers;
                    const reActive = currentStatsSource.filter(t => !state.accessControl.teacherPermissions[t.uid]?.disabled).length;
                    const reInactive = currentStatsSource.length - reActive;

                    if (statActive) statActive.textContent = reActive;
                    if (statInactive) statInactive.textContent = reInactive;
                } else {
                    e.target.checked = !active; // Revert checkbox
                    if (row) {
                        row.classList.toggle('is-active', !active);
                        row.classList.toggle('is-inactive', active);
                    }
                    showNotification('পারমিশন আপডেট করতে সমস্যা হয়েছে', 'error');
                }
            });
        });
    },

    async toggleTeacherPermission(uid, disabled) {
        try {
            const updatedPermissions = {
                ...(state.accessControl.teacherPermissions || {}),
                [uid]: { disabled }
            };
            await updateAccessControlSettings({ teacherPermissions: updatedPermissions });
            
            // Sync local state immediately
            if (!state.accessControl.teacherPermissions) state.accessControl.teacherPermissions = {};
            state.accessControl.teacherPermissions[uid] = { disabled };
            
            return true;
        } catch (error) {
            console.error('Toggle permission error:', error);
            return false;
        }
    },

    filterTeachers(query) {
        if (!this.allTeachers) return;
        const filtered = this.allTeachers.filter(t => 
            t.displayName?.toLowerCase().includes(query.toLowerCase()) || 
            t.email?.toLowerCase().includes(query.toLowerCase())
        );
        this.displayTeachers(filtered);
    }
};

export default AccessControlManager;
