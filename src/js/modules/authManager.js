/**
 * Authentication and Role Management Module
 */

import { auth } from '../firebase.js';
import {
    syncUserRole,
    loginWithEmail,
    submitAccessRequest,
    loginWithGoogle,
    logoutAdmin,
    onAuthChange,
    getLoginPermission,
    getUserLoginStatus
} from '../firestoreService.js';
import { state } from './state.js';
import { showNotification } from '../utils.js';

export async function handleLogin() {
    try {
        // Check global login permission BEFORE attempting login
        const loginAllowed = await getLoginPermission();
        if (!loginAllowed) {
            showNotification('⛔ লগইন সাময়িকভাবে বন্ধ আছে। সফটওয়্যার নির্মাতা সুপার অ্যাডমিনের সাথে যোগাযোগ করুন: 01840-643946', 'error', 8000);
            return null;
        }
        const result = await loginWithGoogle();
        if (result.success) {
            // Check if this specific user's login is disabled
            const userDisabled = await getUserLoginStatus(result.user.uid);
            const role = await syncUserRole(result.user);
            if (userDisabled && role !== 'super_admin') {
                await logoutAdmin();
                showNotification('⛔ আপনার লগইন সুবিধা বন্ধ করা হয়েছে। সুপার অ্যাডমিনের সাথে যোগাযোগ করুন: 01840-643946', 'error', 8000);
                return null;
            }
            showNotification(`স্বাগতম, ${result.user.displayName || 'ব্যবহারকারী'}! 🎉`);
            return result.user;
        } else if (result.error !== 'auth/popup-closed-by-user') {
            showNotification('লগইন ব্যর্থ! আবার চেষ্টা করুন।', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('লগইন করতে সমস্যা হয়েছে', 'error');
    }
    return null;
}

export async function handleEmailLogin(email, password) {
    try {
        // Check global login permission BEFORE attempting login
        const loginAllowed = await getLoginPermission();
        if (!loginAllowed) {
            showNotification('⛔ লগইন সাময়িকভাবে বন্ধ আছে। সফটওয়্যার নির্মাতা সুপার অ্যাডমিনের সাথে যোগাযোগ করুন: 01840-643946', 'error', 8000);
            return null;
        }
        const result = await loginWithEmail(email, password);
        if (result.success) {
            // Check if this specific user's login is disabled
            const userDisabled = await getUserLoginStatus(result.user.uid);
            const role = await syncUserRole(result.user);
            if (userDisabled && role !== 'super_admin') {
                await logoutAdmin();
                showNotification('⛔ আপনার লগইন সুবিধা বন্ধ করা হয়েছে। সুপার অ্যাডমিনের সাথে যোগাযোগ করুন: 01840-643946', 'error', 8000);
                return null;
            }
            showNotification(`স্বাগতম, ${result.user.displayName || 'টিচার'}! 🎉`);
            return result.user;
        } else {
            const errorMsg = result.error === 'auth/wrong-password' ? 'ভুল পাসওয়ার্ড!' :
                result.error === 'auth/user-not-found' ? 'এই ইমেইলে কোনো ইউজার নেই!' :
                    'লগইন ব্যর্থ! আবার চেষ্টা করুন।';
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Email login error:', error);
        showNotification('লগইন করতে সমস্যা হয়েছে', 'error');
    }
    return null;
}

export async function handleAccessRequest(data) {
    const success = await submitAccessRequest(data);
    if (success) {
        showNotification('এক্সেস রিকোয়েস্ট পাঠানো হয়েছে। সুপার অ্যাডমিন অনুমোদন করলে আপনি এক্সেস পাবেন।');
    } else {
        showNotification('রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে।', 'error');
    }
    return success;
}

export async function handleLogout() {
    try {
        await logoutAdmin();
        // Clear session and navigate to dashboard
        window.location.hash = '#dashboard';
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
