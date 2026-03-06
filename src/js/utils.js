/**
 * Utilities Module - Helper functions for student data processing
 * @module utils
 */

import { GRADING_SYSTEM, FAILING_THRESHOLD, CHART_COLORS, GROUP_NAMES } from './constants.js';

/**
 * Robust Bengali and English text normalization
 * Handles character variants, spacing, and casing
 */
export function normalizeText(str) {
    if (!str) return '';
    return String(str)
        .replace(/ী/g, 'ি')
        .replace(/ূ/g, 'ু')
        .replace(/ৈ/g, 'ে')
        .replace(/ৌ/g, 'ো')
        .replace(/ড়/g, 'র')
        .replace(/ঢ়/g, 'র')
        .replace(/য়/g, 'য়')
        .replace(/\s+/g, ' ') // collapse multiple spaces to single
        .toLowerCase()
        .trim();
}

/**
 * Check if a value represents absence (0, blank, "অনুপস্থিত", "absent", null, undefined)
 * @param {*} value - Value to check
 * @returns {boolean} - True if value indicates absence
 */
export function isValueAbsent(value) {
    if (value === null || value === undefined) return true;
    if (value === '') return true;
    if (typeof value === 'string') {
        const lowerVal = value.toLowerCase().trim();
        if (lowerVal === 'absent' || lowerVal === 'অনুপস্থিত') {
            return true;
        }
    }
    return false;
}

/**
 * Check if a student is absent
 * Primary check: Written marks - if 0/অনুপস্থিত/Absent/blank
 * Then check: MCQ and Practical
 * @param {Object} student - Student data object
 * @returns {boolean} - True if student is absent
 */
export function isAbsent(student) {
    // A student is considered absent if all individual score components are absent (null/blank)
    // We treat 0 as present for components, but if all components are null, 
    // we consider the student absent even if total is 0 (often used as a placeholder).
    const writtenAbsent = isValueAbsent(student.written);
    const mcqAbsent = isValueAbsent(student.mcq);
    const practicalAbsent = isValueAbsent(student.practical);

    if (writtenAbsent && mcqAbsent && practicalAbsent) {
        // If all components are absent, check total
        const totalValue = student.total;
        // If total is also 0 or null, it's definitely absent
        if (totalValue === 0 || isValueAbsent(totalValue)) {
            return true;
        }
    }

    return false;
}

/**
 * Calculate grade based on total marks
 * @param {number} total - Total marks
 * @returns {Object} - Grade object with grade and GPA point
 */
export function calculateGrade(total) {
    for (const gradeInfo of GRADING_SYSTEM) {
        if (total >= gradeInfo.min && total <= gradeInfo.max) {
            return {
                grade: gradeInfo.grade,
                point: gradeInfo.point,
            };
        }
    }
    return { grade: 'F', point: 0.0 };
}

/**
 * Determine student status (Pass/Fail/Absent)
 * @param {Object} student - Student data object
 * @returns {string} - Status string
 */
export function determineStatus(student, options = {}) {
    if (isAbsent(student)) {
        return 'অনুপস্থিত';
    }

    const {
        writtenPass = FAILING_THRESHOLD.written,
        mcqPass = FAILING_THRESHOLD.mcq,
        practicalPass = 0
    } = options;

    const written = student.written === null || student.written === '' || student.written === undefined ? null : Number(student.written);
    const mcq = student.mcq === null || student.mcq === '' || student.mcq === undefined ? null : Number(student.mcq);
    const practical = student.practical === null || student.practical === '' || student.practical === undefined ? null : Number(student.practical);

    // Subject Configuration Priority System:
    // Only check a component if its pass mark > 0 AND the student has a value for it
    let failed = false;

    // Check Written (CQ)
    if (writtenPass > 0 && written !== null && written < writtenPass) {
        failed = true;
    }

    // Check MCQ — only if mcqPass > 0
    if (mcqPass > 0 && mcq !== null && mcq < mcqPass) {
        failed = true;
    }

    // Check Practical — only if practicalPass > 0
    if (practicalPass > 0 && practical !== null && practical < practicalPass) {
        failed = true;
    }

    if (failed) return 'ফেল';

    // If custom totalPass is provided, check total
    if (options.totalPass) {
        const total = (written || 0) + (mcq || 0) + (practical || 0);
        if (total < options.totalPass) return 'ফেল';
    }

    return 'পাস';
}

/**
 * Get color for a group
 * @param {string} group - Group name
 * @returns {Object} - Color object with bg and border
 */
export function getGroupColor(group) {
    if (group === GROUP_NAMES.science) {
        return CHART_COLORS.science;
    }
    if (group === GROUP_NAMES.business) {
        return CHART_COLORS.business;
    }
    return CHART_COLORS.arts;
}

/**
 * Get CSS class for a group
 * @param {string} group - Group name
 * @returns {string} - CSS class name
 */
export function getGroupClass(group) {
    if (group === GROUP_NAMES.science) return 'science-group';
    if (group === GROUP_NAMES.business) return 'business-group';
    return 'arts-group';
}

/**
 * Get CSS class for grade
 * @param {string} grade - Grade string
 * @returns {string} - CSS class for grade
 */
export function getGradeClass(grade) {
    return `grade-${grade.replace('+', '-plus').replace('-', '-minus')}`;
}

/**
 * Filter student data based on criteria
 * @param {Array} data - Student data array
 * @param {Object} filters - Filter criteria
 * @param {Object} options - Subject configuration options
 * @returns {Array} - Filtered data
 */
export function filterStudentData(data, filters, options = {}) {
    let filteredData = [...data];

    const { group, searchTerm, grade, status, subject } = filters;

    // 1. Group Filter (Improved robustness)
    if (group && group !== 'all') {
        const normFilter = normalizeText(group);
        filteredData = filteredData.filter((student) => {
            const normStudentGroup = normalizeText(student.group);
            // Match exactly or if keywords are present (e.g., "বিজ্ঞান" in "বিজ্ঞান গ্রুপ")
            return normStudentGroup === normFilter ||
                (normFilter.includes('বিজ্ঞান') && normStudentGroup.includes('বিজ্ঞান')) ||
                (normFilter.includes('ব্যবসায়') && normStudentGroup.includes('ব্যবসায়')) ||
                (normFilter.includes('মানবিক') && normStudentGroup.includes('মানবিক'));
        });
    }

    // 2. Subject Filter (Improved robustness)
    if (subject && subject !== 'all' && subject !== '') {
        const normSubject = normalizeText(subject);
        filteredData = filteredData.filter((student) => {
            if (!student.subject) return true;
            return normalizeText(student.subject) === normSubject;
        });
    }

    // Filter by search term
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredData = filteredData.filter(
            (student) =>
                student.name.toLowerCase().includes(term) ||
                student.id.toString().includes(term)
        );
    }

    // Filter by status (First tier: Pass/Fail/Absent)
    if (status && status !== 'all') {
        filteredData = filteredData.filter((student) => {
            if (status === 'absent') return isAbsent(student);
            const studentStatus = determineStatus(student, options);
            if (status === 'pass') return studentStatus === 'পাস';
            if (status === 'fail') return studentStatus === 'ফেল';
            return true;
        });
    }

    // Filter by grade (Second tier: A+, A, etc.)
    if (grade && grade !== 'all') {
        filteredData = filteredData.filter((student) => {
            if (isAbsent(student)) return false;

            // If filtering by F, ensure it matches failure status
            if (grade === 'F') {
                return determineStatus(student, options) === 'ফেল';
            }

            const gradeInfo = calculateGrade(student.total);
            return gradeInfo.grade === grade;
        });
    }

    return filteredData;
}

/**
 * Sort student data
 * @param {Array} data - Student data array
 * @param {string} sortBy - Field to sort by
 * @param {string} order - Sort order (asc/desc)
 * @returns {Array} - Sorted data
 */
export function sortStudentData(data, sortBy, order = 'desc') {
    // Roll number sorting
    if (order === 'roll-asc' || order === 'roll-desc') {
        const groupPriority = {
            [GROUP_NAMES.science]: 1,
            [GROUP_NAMES.business]: 2,
            [GROUP_NAMES.arts]: 3
        };

        return [...data].sort((a, b) => {
            const groupA = groupPriority[a.group] || 4;
            const groupB = groupPriority[b.group] || 4;

            if (groupA !== groupB) {
                return groupA - groupB; // Always sort groups: Science -> Business -> Humanities
            }

            // Same group, sort by ID
            return order === 'roll-asc'
                ? Number(a.id) - Number(b.id)
                : Number(b.id) - Number(a.id);
        });
    }
    return [...data].sort((a, b) => {
        const comparison = b[sortBy] - a[sortBy];
        return order === 'desc' ? comparison : -comparison;
    });
}

/**
 * Calculate statistics for a dataset
 * @param {Array} data - Student data array
 * @returns {Object} - Statistics object
 */
export function calculateStatistics(data, options = {}) {
    const totalStudents = data.length;
    const absentStudents = data.filter((student) => isAbsent(student)).length;

    const failedStudents = data.filter(
        (student) => determineStatus(student, options) === 'ফেল'
    ).length;

    const participants = totalStudents - absentStudents;
    const passedStudents = participants - failedStudents;

    // Grade Distribution
    const gradeDistribution = {
        'A+': 0, 'A': 0, 'A-': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0
    };

    data.forEach(student => {
        if (!isAbsent(student)) {
            const status = determineStatus(student, options);
            if (status === 'ফেল') {
                gradeDistribution['F']++;
            } else {
                const gradeInfo = calculateGrade(student.total);
                if (gradeDistribution[gradeInfo.grade] !== undefined) {
                    gradeDistribution[gradeInfo.grade]++;
                } else {
                    gradeDistribution['F']++; // Fallback
                }
            }
        }
    });

    return {
        totalStudents,
        absentStudents,
        failedStudents,
        passedStudents,
        participants,
        gradeDistribution
    };
}

/**
 * Calculate group-wise statistics
 * @param {Array} data - Student data array
 * @returns {Array} - Array of group statistics
 */
export function calculateGroupStatistics(data, options = {}) {
    const groups = [...new Set(data.map((student) => student.group))];

    return groups.map((group) => {
        const groupStudents = data.filter((student) => student.group === group);
        return {
            group,
            ...calculateStatistics(groupStudents, options),
        };
    });
}

/**
 * Get failed students from data
 * @param {Array} data - Student data array
 * @returns {Array} - Failed students array
 */
export function getFailedStudents(data, options = {}) {
    const { searchTerm = '' } = options;

    return data.filter((student) => {
        // First check if student is failed
        const isFailed = determineStatus(student, options) === 'ফেল';
        if (!isFailed) return false;

        // If no search term, return all failed
        if (!searchTerm) return true;

        // Search by roll or id (exact match)
        const roll = String(student.roll || student.id || '').trim();
        const search = convertToEnglishDigits(searchTerm.trim());
        const searchBn = convertToBengaliDigits(searchTerm.trim());

        return roll === search || roll === searchBn;
    });
}

/**
 * Show notification
 * @param {string} message - Notification message
 */
export function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

export function convertToEnglishDigits(str) {
    if (str === null || str === undefined) return '';
    const bengali = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    const english = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    let result = String(str);
    for (let i = 0; i < bengali.length; i++) {
        result = result.replace(new RegExp(bengali[i], 'g'), english[i]);
    }
    return result;
}

/**
 * Normalize session string to a standard English format (e.g., "2024-2025")
 * Handles variants like "২০২৪ - ২০২৫", "2024/25", etc.
 * @param {string} session - Raw session string
 * @returns {string} - Normalized session string
 */
export function normalizeSession(session) {
    if (!session) return '';

    // Convert to English digits first
    let normalized = convertToEnglishDigits(session);

    // Replace various separators with a standard hyphen
    normalized = normalized.replace(/[\/\u2013\u2014_,\\.]/g, '-');

    // Remove any non-digit/non-hyphen characters and spaces
    normalized = normalized.replace(/[^\d-]/g, '').trim();

    // Handle "2024-25" type short sessions to "2024-2025"
    const parts = normalized.split('-');
    if (parts.length === 2) {
        let [start, end] = parts;
        if (start.length === 4 && end.length === 2) {
            const prefix = start.substring(0, 2);
            end = prefix + end;
            normalized = `${start}-${end}`;
        }
    }

    return normalized;
}
/**
 * Convert numbers to Bengali digits
 * @param {number|string} num - Number or string containing digits
 * @returns {string} - String with Bengali digits
 */
export function convertToBengaliDigits(num) {
    const bengali = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    const english = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    let str = num.toString();
    for (let i = 0; i < english.length; i++) {
        str = str.replace(new RegExp(english[i], 'g'), bengali[i]);
    }
    return str;
}

/**
 * Format a date object into a Bengali string
 * Format: ২০ ফেব্রুয়ারী ২০২৬, ৭:২০ am
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted Bengali date string
 */
export function formatDateBengali(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';

    const day = convertToBengaliDigits(date.getDate());
    const year = convertToBengaliDigits(date.getFullYear());

    const months = [
        'জানুয়ারী', 'ফেব্রুয়ারী', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
        'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
    ];
    const month = months[date.getMonth()];

    let hours = date.getHours();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const minutes = date.getMinutes().toString().padStart(2, '0');

    const timeStr = `${convertToBengaliDigits(hours)}:${convertToBengaliDigits(minutes)} ${ampm}`;

    return `${day} ${month} ${year}, ${timeStr}`;
}
