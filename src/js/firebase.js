/**
 * Firebase Configuration Module
 * @module firebase
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB-_EMg5Xx8OkkWYhH4gSOt09ejK2kmLrg",
    authDomain: "todo-181b6.firebaseapp.com",
    projectId: "todo-181b6",
    storageBucket: "todo-181b6.firebasestorage.app",
    messagingSenderId: "19269727022",
    appId: "1:19269727022:web:3bccbb2e85d7fdffd140bf",
    measurementId: "G-SWWK62RZLM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Analytics
export const analytics = getAnalytics(app);

// Export app instance
export default app;
