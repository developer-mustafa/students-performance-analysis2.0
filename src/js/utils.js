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
export function filterStudentData(data, filters) {
    let filteredData = [...data];

    const { group, searchTerm, grade } = filters;

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
            // Handle Total Fail (Written < 17, excluding absent)
            if (grade === 'total-fail') {
                return !isAbsent(student) && student.written < FAILING_THRESHOLD.written;
            }
            // Handle Total Pass (Written >= 17, excluding absent)
            if (grade === 'total-pass') {
                return !isAbsent(student) && student.written >= FAILING_THRESHOLD.written;
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
export function calculateStatistics(data) {
    const totalStudents = data.length;
    const absentStudents = data.filter((student) => isAbsent(student)).length;

    const failedStudents = data.filter(
        (student) =>
            !isAbsent(student) &&
            (student.written < FAILING_THRESHOLD.written ||
                calculateGrade(student.total).grade === 'F')
    ).length;

    const passedStudents = data.filter(
        (student) =>
            !isAbsent(student) &&
            student.written >= FAILING_THRESHOLD.written &&
            calculateGrade(student.total).grade !== 'F'
    ).length;

    const participants = totalStudents - absentStudents;

    return {
        totalStudents,
        absentStudents,
        failedStudents,
        passedStudents,
        participants,
    };
}

/**
 * Calculate group-wise statistics
 * @param {Array} data - Student data array
 * @returns {Array} - Array of group statistics
 */
export function calculateGroupStatistics(data) {
    const groups = [...new Set(data.map((student) => student.group))];

    return groups.map((group) => {
        const groupStudents = data.filter((student) => student.group === group);
        return {
            group,
            ...calculateStatistics(groupStudents),
        };
    });
}

/**
 * Get failed students from data
 * @param {Array} data - Student data array
 * @returns {Array} - Failed students array
 */
export function getFailedStudents(data) {
    return data.filter(
        (student) =>
            !isAbsent(student) &&
            (student.written < FAILING_THRESHOLD.written ||
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
