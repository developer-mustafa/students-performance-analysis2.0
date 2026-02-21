/**
 * Utilities Module - Helper functions for student data processing
 * @module utils
 */

import { GRADING_SYSTEM, FAILING_THRESHOLD, CHART_COLORS, GROUP_NAMES } from './constants.js';

/**
 * Check if a value represents absence (0, blank, "অনুপস্থিত", "absent", null, undefined)
 * @param {*} value - Value to check
 * @returns {boolean} - True if value indicates absence
 */
export function isValueAbsent(value) {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'number' && value === 0) return true;
    if (typeof value === 'string') {
        const lowerVal = value.toLowerCase().trim();
        if (lowerVal === '0' || lowerVal === 'absent' || lowerVal === 'অনুপস্থিত' || lowerVal === '') {
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
    // Primary check: Written marks
    if (isValueAbsent(student.written)) {
        // If written is absent, check if other marks are also absent/zero
        return isValueAbsent(student.mcq) && isValueAbsent(student.practical);
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
export function determineStatus(student) {
    if (isAbsent(student)) {
        return 'অনুপস্থিত';
    }

    if (student.written < FAILING_THRESHOLD.written) {
        return 'ফেল';
    }

    const gradeInfo = calculateGrade(student.total);
    if (gradeInfo.grade === 'F') {
        return 'ফেল';
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
 * @returns {Array} - Filtered data
 */
export function filterStudentData(data, filters, options = {}) {
    let filteredData = [...data];

    const { group, searchTerm, grade } = filters;
    const { writtenPass = FAILING_THRESHOLD.written, mcqPass = FAILING_THRESHOLD.mcq } = options;

    // Filter by group
    if (group && group !== 'all') {
        filteredData = filteredData.filter((student) => student.group === group);
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

    // Filter by grade
    if (grade && grade !== 'all') {
        filteredData = filteredData.filter((student) => {
            // Handle absent filter
            if (grade === 'absent') {
                return isAbsent(student);
            }

            const isWrittenView = options.criteria === 'written';
            const isMcqView = options.criteria === 'mcq';

            // Handle Total Fail
            if (grade === 'total-fail') {
                if (isAbsent(student)) return false;
                const failedWritten = Number(student.written) < writtenPass;
                const failedMcq = Number(student.mcq) < mcqPass;

                if (isWrittenView) return failedWritten;
                if (isMcqView) return failedMcq;

                return failedWritten || failedMcq;
            }
            // Handle Total Pass
            if (grade === 'total-pass') {
                if (isAbsent(student)) return false;
                const passedWritten = Number(student.written) >= writtenPass;
                const passedMcq = Number(student.mcq) >= mcqPass;

                if (isWrittenView) return passedWritten;
                if (isMcqView) return passedMcq;

                return passedWritten && passedMcq;
            }
            // Normal grade filter
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
    const { writtenPass = FAILING_THRESHOLD.written, mcqPass = FAILING_THRESHOLD.mcq, totalPass = 33 } = options;

    const totalStudents = data.length;
    const absentStudents = data.filter((student) => isAbsent(student)).length;

    const failedStudents = data.filter(
        (student) => {
            if (isAbsent(student)) return false;

            // Check based on provided thresholds
            // If any criteria fails, the student fails
            const failedWritten = Number(student.written) < writtenPass;
            const failedMcq = Number(student.mcq) < mcqPass;
            // const failedTotal = Number(student.total) < totalPass; // Optional check

            return failedWritten || failedMcq;
        }
    ).length;

    const participants = totalStudents - absentStudents;
    const passedStudents = participants - failedStudents;

    // Grade Distribution
    const gradeDistribution = {
        'A+': 0, 'A': 0, 'A-': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0
    };

    data.forEach(student => {
        if (!isAbsent(student)) {
            // Check if student failed based on marks OR final grade
            const failedWritten = Number(student.written) < writtenPass;
            const failedMcq = Number(student.mcq) < mcqPass;
            const gradeInfo = calculateGrade(student.total);

            if (failedWritten || failedMcq || gradeInfo.grade === 'F') {
                gradeDistribution['F']++;
            } else {
                if (gradeDistribution[gradeInfo.grade] !== undefined) {
                    gradeDistribution[gradeInfo.grade]++;
                }
            }
        }
        // Absent students are handled separately in 'absentStudents' count.
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
    const { writtenPass = FAILING_THRESHOLD.written, mcqPass = FAILING_THRESHOLD.mcq } = options;
    return data.filter(
        (student) =>
            !isAbsent(student) &&
            (Number(student.written) < writtenPass ||
                Number(student.mcq) < mcqPass ||
                calculateGrade(student.total).grade === 'F')
    );
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

/**
 * Convert Bengali digits to English digits
 * @param {string} str - String containing Bengali digits
 * @returns {string} - String with English digits
 */
export function convertToEnglishDigits(str) {
    const bengali = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    const english = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    let result = str;
    for (let i = 0; i < bengali.length; i++) {
        result = result.replace(new RegExp(bengali[i], 'g'), english[i]);
    }
    return result;
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
