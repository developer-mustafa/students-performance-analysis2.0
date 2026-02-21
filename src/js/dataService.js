/**
 * Data Service Module - Handles data loading, saving, and storage
 * Now integrated with Firebase Firestore for real-time sync
 * @module dataService
 */

import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { STORAGE_KEYS } from './constants.js';
import { showNotification } from './utils.js';
import defaultStudentData from '../data/students.json';
import {
    getAllStudents,
    bulkImportStudents,
    deleteAllStudents,
    subscribeToStudents,
    getSettings,
    updateSettings,
} from './firestoreService.js';

// Track Firestore connection status
let isOnline = true;

/**
 * Load data from Firestore (primary) or localStorage (fallback)
 * @returns {Promise<Array>} - Student data array
 */
export async function loadDataFromStorage() {
    try {
        // Try Firestore first
        const firestoreData = await getAllStudents();

        if (firestoreData && firestoreData.length > 0) {
            isOnline = true;
            // Cache to localStorage for offline use
            localStorage.setItem(STORAGE_KEYS.studentData, JSON.stringify(firestoreData));
            return firestoreData;
        }

        // Fallback to localStorage
        const savedData = localStorage.getItem(STORAGE_KEYS.studentData);
        if (savedData) {
            try {
                return JSON.parse(savedData);
            } catch (e) {
                console.error('ডেটা পার্স করতে সমস্যা:', e);
                return null;
            }
        }
        return null;
    } catch (error) {
        console.error('Firestore থেকে ডেটা লোড করতে সমস্যা:', error);
        isOnline = false;

        // Fallback to localStorage
        const savedData = localStorage.getItem(STORAGE_KEYS.studentData);
        if (savedData) {
            try {
                return JSON.parse(savedData);
            } catch (e) {
                console.error('ডেটা পার্স করতে সমস্যা:', e);
                return null;
            }
        }
        return null;
    }
}

/**
 * Save data to Firestore and localStorage
 * @param {Array} data - Student data array
 * @returns {Promise<boolean>} - Success status
 */
export async function saveDataToStorage(data) {
    console.log('saveDataToStorage called with', data.length, 'students');

    // Always save to localStorage for offline cache
    localStorage.setItem(STORAGE_KEYS.studentData, JSON.stringify(data));
    console.log('Saved to localStorage');

    try {
        // Save to Firestore
        console.log('Calling bulkImportStudents...');
        const success = await bulkImportStudents(data);
        console.log('bulkImportStudents result:', success);

        if (success) {
            isOnline = true;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Firestore-এ ডেটা সেভ করতে সমস্যা:', error);
        isOnline = false;
        return false;
    }
}

/**
 * Get default sample data
 * @returns {Array} - Default student data array
 */
export function getDefaultData() {
    return [...defaultStudentData];
}

/**
 * Clear all data from Firestore and localStorage
 * @returns {Promise<boolean>} - Success status
 */
export async function clearDataFromStorage() {
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEYS.studentData);

    try {
        // Clear Firestore
        const success = await deleteAllStudents();
        return success;
    } catch (error) {
        console.error('Firestore ডেটা মুছতে সমস্যা:', error);
        return false;
    }
}

/**
 * Handle file upload and parse JSON or Excel
 * @param {File} file - Uploaded file
 * @returns {Promise<Array>} - Promise resolving to student data array
 */
export async function handleFileUpload(file) {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.json')) {
        return handleJSONUpload(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        return handleExcelUpload(file);
    } else {
        throw new Error('শুধুমাত্র JSON বা Excel (.xlsx, .xls) ফাইল সাপোর্টেড');
    }
}

/**
 * Handle JSON file upload
 * @param {File} file - JSON file
 * @returns {Promise<Array>} - Student data array
 */
function handleJSONUpload(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function (e) {
            try {
                const jsonData = JSON.parse(e.target.result);
                if (Array.isArray(jsonData)) {
                    resolve(jsonData);
                } else {
                    reject(new Error('ডেটা অ্যারে ফরম্যাটে হতে হবে'));
                }
            } catch (error) {
                reject(new Error('ভুল JSON ফরম্যাট: ' + error.message));
            }
        };

        reader.onerror = function () {
            reject(new Error('ফাইল পড়তে সমস্যা হয়েছে'));
        };

        reader.readAsText(file);
    });
}

/**
 * Handle Excel file upload
 * @param {File} file - Excel file (.xlsx or .xls)
 * @returns {Promise<Array>} - Student data array
 */
async function handleExcelUpload(file) {
    // Dynamically import xlsx library
    const XLSXModule = await import('xlsx');
    const XLSX = XLSXModule.default || XLSXModule;

    console.log('XLSX library loaded:', !!XLSX);

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function (e) {
            try {
                console.log('File read, parsing Excel...');
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                console.log('Workbook sheets:', workbook.SheetNames);

                // Get first sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to JSON
                const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                console.log('Total rows in Excel:', rawData.length);
                console.log('Headers:', rawData[0]);

                if (rawData.length < 2) {
                    reject(new Error('এক্সেল ফাইলে পর্যাপ্ত ডেটা নেই'));
                    return;
                }

                // Get headers (first row)
                const headers = rawData[0].map(h => String(h).toLowerCase().trim());
                console.log('Detected headers (lowercase):', headers);

                // Map column indices based on headers
                const columnMap = detectColumns(headers);
                console.log('Column mapping:', columnMap);

                // Parse data rows
                const students = [];
                for (let i = 1; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row || row.length === 0) continue;

                    const student = parseExcelRow(row, columnMap, i);
                    if (student) {
                        students.push(student);
                    }
                }


                // Deduplicate students by composite key (Roll + Name + Group + Class + Session)
                // Use a Map to keep the last occurrence of each unique student profile
                const studentMap = new Map();

                students.forEach(student => {
                    if (student.id) {
                        // Create unique key based on all identity fields
                        const key = `${student.id}_${student.name}_${student.group}_${student.class || ''}_${student.session || ''}`;
                        studentMap.set(key, student);
                    }
                });

                const uniqueStudents = Array.from(studentMap.values());
                console.log(`Unique students count: ${uniqueStudents.length} (from ${students.length})`);

                if (uniqueStudents.length === 0) {
                    reject(new Error('কোনো বৈধ শিক্ষার্থী ডেটা পাওয়া যায়নি'));
                    return;
                }

                resolve(uniqueStudents);
            } catch (error) {
                console.error('Excel parsing error:', error);
                reject(new Error('এক্সেল ফাইল পড়তে সমস্যা: ' + error.message));
            }
        };

        reader.onerror = function () {
            reject(new Error('ফাইল পড়তে সমস্যা হয়েছে'));
        };

        reader.readAsArrayBuffer(file);
    });
}

/**
 * Detect column indices from headers
 * Supports Bengali and English column names
 * @param {Array<string>} headers - Header row (lowercase)
 * @returns {Object} - Column index mapping
 */
function detectColumns(headers) {
    const map = {
        name: -1,
        id: -1,      // Roll number
        group: -1,
        written: -1,
        mcq: -1,
        practical: -1,
        total: -1,
        subject: -1,
        class: -1,
        session: -1,
    };

    headers.forEach((header, index) => {
        // Name column
        if (header.includes('name') || header.includes('নাম')) {
            map.name = index;
        }
        // Roll/ID column
        else if (header.includes('roll') || header.includes('রোল') || header.includes('id') || header.includes('আইডি')) {
            map.id = index;
        }
        // Group column
        else if (header.includes('group') || header.includes('গ্রুপ') || header.includes('বিভাগ')) {
            map.group = index;
        }
        // Written column
        else if (header.includes('written') || header.includes('লিখিত')) {
            map.written = index;
        }
        // MCQ column
        else if (header.includes('mcq') || header.includes('এমসিকিউ') || header.includes('বহুনির্বাচনী')) {
            map.mcq = index;
        }
        // Practical column
        else if (header.includes('practical') || header.includes('ব্যবহারিক') || header.includes('প্রাক্টিক্যাল')) {
            map.practical = index;
        }
        // Total column
        else if (header.includes('total') || header.includes('মোট')) {
            map.total = index;
        }
        // Subject column
        else if (header.includes('subject') || header.includes('বিষয়')) {
            map.subject = index;
        }
        // Class column
        else if (header.includes('class') || header.includes('শ্রেণি') || header.includes('শ্রেণী')) {
            map.class = index;
        }
        // Session column
        else if (header.includes('session') || header.includes('সেশন') || header.includes('শিক্ষাবর্ষ')) {
            map.session = index;
        }
    });

    return map;
}

/**
 * Parse a single Excel row into student object
 * @param {Array} row - Row data
 * @param {Object} columnMap - Column index mapping
 * @param {number} rowIndex - Row index for fallback ID
 * @returns {Object|null} - Student object or null if invalid
 */
function parseExcelRow(row, columnMap, rowIndex) {
    // Get roll/id first (we may need it for name fallback)
    let id = columnMap.id >= 0 ? row[columnMap.id] : rowIndex;
    id = parseInt(id) || rowIndex;

    // Get name - if empty, generate from Roll number
    let name = columnMap.name >= 0 ? String(row[columnMap.name] || '').trim() : '';
    if (!name) {
        // Generate name from Roll number if name is empty
        name = `শিক্ষার্থী ${id}`;
    }

    // Check if this row has any meaningful data (at least a roll number or scores)
    const hasRoll = columnMap.id >= 0 && row[columnMap.id] !== undefined && row[columnMap.id] !== null;
    const hasScores = (columnMap.written >= 0 && row[columnMap.written] !== undefined) ||
        (columnMap.total >= 0 && row[columnMap.total] !== undefined);

    if (!hasRoll && !hasScores) {
        return null; // Skip truly empty rows
    }

    // Get group (default to 'বিজ্ঞান গ্রুপ' if not specified or detect from value)
    let group = 'বিজ্ঞান গ্রুপ';
    if (columnMap.group >= 0 && row[columnMap.group]) {
        const groupValue = String(row[columnMap.group]).toLowerCase().trim();
        // Map English group names to Bengali with 'গ্রুপ' suffix
        if (groupValue.includes('business') || groupValue.includes('ব্যবসায়') || groupValue.includes('বাণিজ্য') || groupValue.includes('studies') || groupValue.includes('commerce') || groupValue.includes('b.')) {
            group = 'ব্যবসায় গ্রুপ';
        } else if (groupValue.includes('arts') || groupValue.includes('মানবিক') || groupValue.includes('humanities')) {
            group = 'মানবিক গ্রুপ';
        } else if (groupValue.includes('science') || groupValue.includes('বিজ্ঞান')) {
            group = 'বিজ্ঞান গ্রুপ';
        }
        console.log(`Row ${rowIndex}: Excel group "${row[columnMap.group]}" -> "${group}"`);
    }

    // Get scores - handle absent/blank/text values
    const parseScore = (value) => {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'string') {
            const lowerVal = value.toLowerCase().trim();
            if (lowerVal === 'absent' || lowerVal === 'অনুপস্থিত' || lowerVal === '') return 0;
        }
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
    };

    const written = columnMap.written >= 0 ? parseScore(row[columnMap.written]) : 0;
    const mcq = columnMap.mcq >= 0 ? parseScore(row[columnMap.mcq]) : 0;
    const practical = columnMap.practical >= 0 ? parseScore(row[columnMap.practical]) : 0;

    // Calculate total or use from Excel
    let total = written + mcq + practical;
    if (columnMap.total >= 0 && row[columnMap.total]) {
        const excelTotal = parseFloat(row[columnMap.total]);
        if (!isNaN(excelTotal)) {
            total = excelTotal;
        }
    }

    // Get Class and Session
    const classVal = columnMap.class >= 0 ? String(row[columnMap.class] || '').trim() : '';
    const sessionVal = columnMap.session >= 0 ? String(row[columnMap.session] || '').trim() : '';

    return {
        id,
        name,
        group,
        class: classVal,
        session: sessionVal,
        written,
        mcq,
        practical,
        total,
    };
}

/**
 * Export chart as image with current theme
 * @param {HTMLCanvasElement} canvas - Chart canvas element
 * @param {string} filename - Export filename
 */
export function exportChartAsImage(canvas, filename = 'পারফর্ম্যান্স-চার্ট.png') {
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
        showNotification('চার্টটি দৃশ্যমান নয় অথবা ক্যালকুলেট করা সম্ভব হচ্ছে না', 'error');
        return;
    }

    try {
        // Get current theme colors
        const style = getComputedStyle(document.body);
        const isDarkMode = document.body.classList.contains('dark-mode');
        const bgColor = style.getPropertyValue('--container-bg').trim() || (isDarkMode ? '#1e1e1e' : '#ffffff');

        // Create a temporary canvas with background
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const ctx = tempCanvas.getContext('2d');

        // Fill with theme background color
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        // Draw the chart on top
        ctx.drawImage(canvas, 0, 0);

        // Export the composite image
        const link = document.createElement('a');
        link.download = filename;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error('Chart export error:', error);
        showNotification('এক্সপোর্ট করতে সমস্যা হয়েছে', 'error');
    }
}

/**
 * Capture an HTML element and download as image
 * @param {HTMLElement} element - Element to capture
 * @param {string} filename - Filename for the image
 */
export async function captureElementAsImage(element, filename = 'capture.png') {
    if (!element) return;

    try {
        const isDark = document.body.classList.contains('dark-mode');

        // Add class to body to disable unwanted styles for capture
        document.body.classList.add('capturing-image');

        // Wait for any active animations to stop
        await new Promise(r => setTimeout(r, 200));

        const style = getComputedStyle(document.body);
        let bgColor = style.getPropertyValue('--container-bg').trim() || (isDark ? '#1a1a1a' : '#ffffff');

        if (bgColor === 'transparent' || !bgColor) {
            bgColor = isDark ? '#1a1a1a' : '#ffffff';
        }

        const canvas = await html2canvas(element, {
            backgroundColor: bgColor,
            scale: 3, // Scale 2 is more stable for alignment than Scale 4
            useCORS: true,
            logging: false,
            allowTaint: true,
            windowWidth: 1920, // Stable viewport for consistent rendering
            windowHeight: 1080,
            onclone: (clonedDoc) => {
                const clonedBody = clonedDoc.body;
                clonedBody.classList.add('capturing-image');

                // Final check to remove animations in clone
                const target = clonedDoc.getElementById(element.id);
                if (target) {
                    target.style.animation = 'none';
                    target.style.transition = 'none';
                    target.style.padding = '25px';
                }
            }
        });

        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();

        // Cleanup
        document.body.classList.remove('capturing-image');
    } catch (error) {
        console.error('Capture error:', error);
        document.body.classList.remove('capturing-image');
        showNotification('ইমেজ তৈরি করতে সমস্যা হয়েছে', 'error');
    }
}

/**
 * Load theme preference from Firestore or localStorage
 * @returns {Promise<string>} - Theme preference ('light' or 'dark')
 */
export async function loadThemePreference() {
    try {
        const settings = await getSettings();
        if (settings && settings.theme) {
            localStorage.setItem(STORAGE_KEYS.theme, settings.theme);
            return settings.theme;
        }
    } catch (error) {
        console.error('থিম সেটিংস লোড করতে সমস্যা:', error);
    }

    // Fallback to localStorage
    return localStorage.getItem(STORAGE_KEYS.theme) || 'light';
}

/**
 * Save theme preference to Firestore and localStorage
 * @param {string} theme - Theme preference
 * @returns {Promise<void>}
 */
export async function saveThemePreference(theme) {
    localStorage.setItem(STORAGE_KEYS.theme, theme);

    try {
        await updateSettings({ theme });
    } catch (error) {
        console.error('থিম সেটিংস সেভ করতে সমস্যা:', error);
    }
}

/**
 * Subscribe to real-time student data updates
 * @param {Function} callback - Callback function receiving updated data
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToDataUpdates(callback) {
    return subscribeToStudents((students) => {
        // Update localStorage cache
        localStorage.setItem(STORAGE_KEYS.studentData, JSON.stringify(students));

        // Call the callback with new data
        callback(students);
    });
}

/**
 * Check if connected to Firestore
 * @returns {boolean} - Online status
 */
export function isFirestoreOnline() {
    return isOnline;
}
/**
 * Download Demo Excel Template
 */
export function downloadDemoTemplate() {
    const headers = [
        {
            'Roll': '101',
            'Name': 'রহিম উদ্দিন',
            'Class': '11',
            'Session': '2024-2025',
            'Subject': 'ICT',
            'Group': 'Science',
            'Written (50)': 40,
            'MCQ(25)': 20,
            'Practical (25)': 22,
            'Total (100)': 82,
            'GPA': '5.00',
            'Grade': 'A+',
            'Status': 'Passed'
        },
        {
            'Roll': '102',
            'Name': 'করিম হোসেন',
            'Class': '11',
            'Session': '2024-2025',
            'Subject': 'ICT',
            'Group': 'Humanities',
            'Written (50)': 35,
            'MCQ(25)': 18,
            'Practical (25)': 20,
            'Total (100)': 73,
            'GPA': '4.00',
            'Grade': 'A',
            'Status': 'Passed'
        }
    ];

    const ws = XLSX.utils.json_to_sheet(headers);

    // Add column widths
    const wscols = [
        { wch: 10 }, // Roll
        { wch: 20 }, // Name
        { wch: 10 }, // Class
        { wch: 15 }, // Session
        { wch: 10 }, // Subject
        { wch: 15 }, // Group
        { wch: 15 }, // Written
        { wch: 10 }, // MCQ
        { wch: 15 }, // Practical
        { wch: 15 }, // Total
        { wch: 10 }, // GPA
        { wch: 10 }, // Grade
        { wch: 10 }  // Status
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "student_data_template.xlsx");
}


/**
 * Export Student Data as Excel
 * @param {Array} students - Array of student objects
 * @param {string} filename - Filename for the excel file
 */
export function exportStudentDataAsExcel(students, filename = 'students_data.xlsx', subject = '') {
    if (!students || students.length === 0) {
        showNotification('কোনো ডেটা নেই', 'error');
        return;
    }

    // Format data for Excel
    const dataToExport = students.map((student, index) => ({
        'ক্রমিক নং (SL)': index + 1,
        'রোল (Roll)': student.id,
        'নাম (Name)': student.name,
        'বিষয় (Subject)': subject || '-',
        'গ্রুপ (Group)': student.group,
        'শ্রেণি (Class)': student.class || '-',
        'সেশন (Session)': student.session || '-',
        'লিখিত (Written)': student.written,
        'এমসিকিউ (MCQ)': student.mcq,
        'ব্যবহারিক (Practical)': student.practical,
        'মোট (Total)': student.total,
        'GPA': calculateGPA(student.total),
        'গ্রেড (Grade)': calculateGrade(student.total)
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Auto-width for columns
    const wscols = [
        { wch: 10 }, // SL
        { wch: 10 }, // Roll
        { wch: 25 }, // Name
        { wch: 20 }, // Subject
        { wch: 15 }, // Group
        { wch: 10 }, // Class
        { wch: 15 }, // Session
        { wch: 10 }, // Written
        { wch: 10 }, // MCQ
        { wch: 10 }, // Practical
        { wch: 10 }, // Total
        { wch: 10 }, // GPA
        { wch: 10 }  // Grade
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Result Data");
    XLSX.writeFile(wb, filename);
}

// Helper functions for Grade/GPA (duplicated from utils if not exported, 
// or better: import them from utils.js if possible, but let's keep it simple and self-contained here or basic logic)
function calculateGrade(total) {
    if (total >= 80) return 'A+';
    if (total >= 70) return 'A';
    if (total >= 60) return 'A-';
    if (total >= 50) return 'B';
    if (total >= 40) return 'C';
    if (total >= 33) return 'D';
    return 'F';
}

function calculateGPA(total) {
    if (total >= 80) return '5.00';
    if (total >= 70) return '4.00';
    if (total >= 60) return '3.50';
    if (total >= 50) return '3.00';
    if (total >= 40) return '2.00';
    if (total >= 33) return '1.00';
    return '0.00';
}
