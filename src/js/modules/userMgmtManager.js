/**
 * User Management Module
 */

import { getAllUsers, updateUserRole } from '../firestoreService.js';
import { elements, setLoading, showConfirmModal } from './uiManager.js';
import { showNotification } from '../utils.js';
import { state } from './state.js';

let allUsers = []; // Local cache for all users to enable efficient client-side search

/**
 * Initialize and render user management list
 */
export async function handleUserManagement() {
    if (!state.isSuperAdmin) {
        showNotification('শুধুমাত্র সুপার অ্যাডমিনরা এই পেজটি এক্সেস করতে পারবেন', 'warning');
        return;
    }

    setLoading(true, '#userManagementModal .modal-content');
    try {
        allUsers = await getAllUsers();
        setupSearchListener();
        updateUserStats(allUsers);
        renderUsers(allUsers);
    } catch (error) {
        console.error('Error in user management:', error);
        showNotification('ব্যবহারকারী তালিকা লোড করতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false, '#userManagementModal .modal-content');
    }
}

/**
 * Setup search input listener (once)
 */
function setupSearchListener() {
    if (!elements.userMgmtSearch || elements.userMgmtSearch.dataset.listenerAttached) return;

    elements.userMgmtSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = allUsers.filter(user => 
            (user.displayName && user.displayName.toLowerCase().includes(query)) ||
            (user.email && user.email.toLowerCase().includes(query))
        );
        renderUsers(filtered);
    });
    
    elements.userMgmtSearch.dataset.listenerAttached = 'true';
}

/**
 * Update statistics badges in the UI
 * @param {Array} users 
 */
function updateUserStats(users) {
    const stats = {
        super_admin: 0,
        admin: 0,
        user: 0
    };

    users.forEach(u => {
        if (u.role && stats.hasOwnProperty(u.role)) {
            stats[u.role]++;
        } else {
            stats.user++;
        }
    });

    if (elements.statSuperAdminCount) elements.statSuperAdminCount.textContent = stats.super_admin;
    if (elements.statAdminCount) elements.statAdminCount.textContent = stats.admin;
    if (elements.statUserCount) elements.statUserCount.textContent = stats.user;
}

/**
 * Render user rows into the table
 * @param {Array} users 
 */
function renderUsers(users) {
    if (!elements.userListBody) return;

    if (users.length === 0) {
        elements.userListBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">কোনো ব্যবহারকারী পাওয়া যায়নি</td></tr>';
        return;
    }

    elements.userListBody.innerHTML = users.map(user => {
        const isSelf = state.currentUser && state.currentUser.uid === user.uid;
        const roleLabel = user.role === 'super_admin' ? 'Super Admin' :
            user.role === 'admin' ? 'Admin' : 'User';

        return `
            <tr class="user-row">
                <td class="user-name-cell">
                    <div class="user-info-flex">
                        <img class="user-avatar-small" src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + user.displayName}">
                        <span class="user-display-name">${user.displayName || 'Unnamed'}</span>
                    </div>
                </td>
                <td class="user-email-cell">${user.email}</td>
                <td class="user-role-cell">
                    <span class="role-badge role-${user.role || 'user'}">
                        ${roleLabel}
                    </span>
                </td>
                <td class="user-action-cell">
                    <select class="role-select-premium" data-uid="${user.uid}" data-name="${user.displayName || 'Unnamed'}" ${isSelf ? 'disabled' : ''}>
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');

    // Attach listeners to selects
    elements.userListBody.querySelectorAll('.role-select-premium').forEach(select => {
        select.addEventListener('change', async (e) => {
            const uid = e.target.dataset.uid;
            const userName = e.target.dataset.name;
            const newRole = e.target.value;
            await handleRoleUpdate(uid, newRole, userName);
        });
    });
}

/**
 * Update user role
 * @param {string} uid 
 * @param {string} newRole 
 * @param {string} userName 
 */
async function handleRoleUpdate(uid, newRole, userName) {
    showConfirmModal(
        `আপনি কি নিশ্চিত যে আপনি এই ব্যবহারকারীর রোল পরিবর্তন করতে চান?`,
        async () => {
            try {
                const success = await updateUserRole(uid, newRole);
                if (success) {
                    showNotification('ব্যবহারকারীর রোল সফলভাবে আপডেট করা হয়েছে');
                    // Update stats locally and re-render to avoid full refetch if possible, 
                    // but for simplicity and safety, we re-fetch to ensure sync with DB
                    await handleUserManagement();
                } else {
                    showNotification('রোল আপডেট করতে সমস্যা হয়েছে', 'error');
                }
            } catch (error) {
                console.error('Error updating role:', error);
                showNotification('একটি ত্রুটি ঘটেছে', 'error');
            }
        },
        `ব্যবহারকারী: ${userName}`,
        `নতুন রোল: ${newRole}`
    );
}

