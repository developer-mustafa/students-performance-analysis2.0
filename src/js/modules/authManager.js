/**
 * Authentication and Role Management Module
 */

import { auth } from '../firebase.js';
import {
    loginWithGoogle,
    logoutAdmin,
    onAuthChange,
    syncUserRole
} from '../firestoreService.js';
import { state } from './state.js';
import { showNotification } from '../utils.js';

export async function handleLogin() {
    try {
        const result = await loginWithGoogle();
        if (result.success) {
            showNotification(`স্বাগতম, ${result.user.displayName || 'ব্যবহারকারী'}! 🎉`);
            return result.user;
        } else if (result.error !== 'auth/popup-closed-by-user') {
            showNotification('লগইন ব্যর্থ! আবার চেষ্টা করুন।', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('লগইন করতে সমস্যা হয়েছে', 'error');
    }
    return null;
}

export async function handleLogout() {
    try {
        await logoutAdmin();
        showNotification('লগআউট সফল!');
        return true;
    } catch (error) {
        console.error('Logout error:', error);
        return false;
    }
}

export function setupAuthListener(callbacks = {}) {
    const {
        onLogin,
        onLogout,
        onRoleSync,
        renderUI
    } = callbacks;

    return onAuthChange(async (user) => {
        console.log('Auth state changed:', user ? user.email : 'Logged Out');
        state.currentUser = user;

        if (user) {
            const role = await syncUserRole(user);
            state.userRole = role;
            state.isAdmin = ['admin', 'super_admin'].includes(role);
            state.isSuperAdmin = role === 'super_admin';

            if (onLogin) onLogin(user, role);
            if (onRoleSync) onRoleSync(role);
        } else {
            state.currentUser = null;
            state.isAdmin = false;
            state.isSuperAdmin = false;
            state.userRole = 'guest';

            if (onLogout) onLogout();
        }

        if (renderUI) renderUI(user);
    });
}
