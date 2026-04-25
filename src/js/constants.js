/**
 * Constants Module - Application-wide configuration
 * @module constants
 */

// বাংলাদেশী গ্রেডিং সিস্টেম
export const GRADING_SYSTEM = [
    { min: 80, max: 100, grade: 'A+', point: 5.0 },
    { min: 70, max: 79, grade: 'A', point: 4.0 },
    { min: 60, max: 69, grade: 'A-', point: 3.5 },
    { min: 50, max: 59, grade: 'B', point: 3.0 },
    { min: 40, max: 49, grade: 'C', point: 2.0 },
    { min: 33, max: 39, grade: 'D', point: 1.0 },
    { min: 0, max: 32, grade: 'F', point: 0.0 },
];

// চার্ট কালার থিম
export const CHART_COLORS = {
    science: {
        bg: 'rgba(76, 201, 240, 0.7)',
        border: 'rgba(76, 201, 240, 1)',
    },
    business: {
        bg: 'rgba(114, 9, 183, 0.7)',
        border: 'rgba(114, 9, 183, 1)',
    },
    arts: {
        bg: 'rgba(248, 150, 30, 0.7)',
        border: 'rgba(248, 150, 30, 1)',
    },
};

// গ্রুপ নাম ম্যাপিং
export const GROUP_NAMES = {
    science: 'বিজ্ঞান গ্রুপ',
    business: 'ব্যবসায় গ্রুপ',
    arts: 'মানবিক গ্রুপ',
};

// চার্ট টাইপ কনফিগারেশন
export const CHART_TYPES = {
    total: {
        key: 'total',
        label: 'মোট স্কোর',
        title: 'মোট স্কোর মেধাক্রমিং',
    },
    written: {
        key: 'written',
        label: 'লিখিত পরীক্ষার স্কোর',
        title: 'লিখিত পরীক্ষার স্কোর মেধাক্রমিং',
    },
    mcq: {
        key: 'mcq',
        label: 'এমসিকিউ স্কোর',
        title: 'এমসিকিউ স্কোর',
    },
    practical: {
        key: 'practical',
        label: 'প্র্যাকটিক্যাল পরীক্ষার স্কোর',
        title: 'প্র্যাকটিক্যাল পরীক্ষার স্কোর',
    },
};

// ফেইলিং থ্রেশহোল্ড
export const FAILING_THRESHOLD = {
    written: 17, // লিখিত পরীক্ষায় পাশ মার্কস
    mcq: 8,      // এমসিকিউ পাশ মার্কস
    total: 33,   // মোট পাশ মার্কস
};

// স্টোরেজ কী
export const STORAGE_KEYS = {
    studentData: 'studentPerformanceData',
    theme: 'dashboardTheme',
};

// ম্যাক্স চার্ট এন্ট্রি
export const MAX_CHART_ENTRIES = 200;
export const MAX_TABLE_ENTRIES = 2000;

// ড্রাফট সংরক্ষণ সময়সীমা (মিলিসেকেন্ড)
export const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 ঘন্টা

// ডিবাউন্স টাইমার (মিলিসেকেন্ড)
export const ANALYTICS_DEBOUNCE_MS = 2000;

// ডিফল্ট পাশ শতাংশ
export const DEFAULT_PASS_PERCENTAGE = 33;

// পেজিনেশন
export const DEFAULT_PAGE_SIZE = 10;
