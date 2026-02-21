/**
 * User Management Module
 */

import { getAllUsers, updateUserRole } from '../firestoreService.js';
import { elements, setLoading } from './uiManager.js';
import { showNotification } from '../utils.js';
import { state } from './state.js';

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
        const users = await getAllUsers();
        renderUsers(users);
    } catch (error) {
        console.error('Error in user management:', error);
        showNotification('ব্যবহারকারী তালিকা লোড করতে সমস্যা হয়েছে', 'error');
    } finally {
        setLoading(false, '#userManagementModal .modal-content');
    }
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
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + user.displayName}" 
                             style="width: 32px; height: 32px; border-radius: 50%;">
                        <span>${user.displayName || 'Unnamed'}</span>
                    </div>
                </td>
                <td style="padding: 10px; font-size: 0.9em; color: #666;">${user.email}</td>
                <td style="padding: 10px;">
                    <span class="role-badge role-${user.role || 'user'}" 
                          style="padding: 2px 8px; border-radius: 12px; font-size: 0.8em; 
                                 background: ${getRoleColor(user.role)}; color: white;">
                        ${roleLabel}
                    </span>
                </td>
                <td style="padding: 10px; text-align: right;">
                    <select class="role-select" data-uid="${user.uid}" ${isSelf ? 'disabled' : ''} 
                            style="padding: 4px; font-size: 0.85em; border-radius: 4px;">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');

    // Attach listeners to selects
    elements.userListBody.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const uid = e.target.dataset.uid;
            const newRole = e.target.value;
            const success = await handleRoleUpdate(uid, newRole);
            if (success) {
                // Re-fetch and re-render
                handleUserManagement();
            }
        });
    });
}

/**
 * Update user role
 * @param {string} uid 
 * @param {string} newRole 
 */
async function handleRoleUpdate(uid, newRole) {
    const confirmed = confirm(`আপনি কি নিশ্চিত যে আপনি এই ব্যবহারকারীর রোল পরিবর্তন করে '${newRole}' করতে চান?`);
    if (!confirmed) return false;

    try {
        const success = await updateUserRole(uid, newRole);
        if (success) {
            showNotification('রোল আপডেট করা হয়েছে');
            return true;
        } else {
            showNotification('রোল আপডেট করতে সমস্যা হয়েছে', 'error');
            return false;
        }
    } catch (error) {
        console.error('Role update error:', error);
        return false;
    }
}

function getRoleColor(role) {
    switch (role) {
        case 'super_admin': return '#6c5ce7';
        case 'admin': return '#00b894';
        default: return '#b2bec3';
    }
}
