const XLSX = require('./node_modules/xlsx/xlsx.js');
const fs = require('fs');

// We'll mock the requirements or use the actual files if we can.
// Since we are in a node environment, we might need to adjust imports.
// Let's just copy the logic for now to be sure.

function isValueAbsent(value) {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'string') {
        const lowerVal = value.toLowerCase().trim();
        if (lowerVal === 'absent' || lowerVal === 'অনুপস্থিত') return true;
    }
    return false;
}

function isAbsent(student) {
    const wAbsent = isValueAbsent(student.written);
    const mAbsent = student.isOnlyWritten ? true : isValueAbsent(student.mcq);
    const pAbsent = student.isOnlyWritten ? true : isValueAbsent(student.practical);
    return wAbsent && mAbsent && pAbsent;
}

function parseScore(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    if (typeof value === 'string') {
        const lowerVal = value.toLowerCase().trim();
        if (lowerVal === 'absent' || lowerVal === 'অনুপস্থিত') return null;
    }
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

const fileName = 'test25.xlsx';
const buf = fs.readFileSync(fileName);
const wb = XLSX.read(buf, { type: 'buffer' });
const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

// Exact Column Map from my previous inspection
const columnMap = {
    id: 1,
    name: 2,
    written: 7,
    mcq: 8,
    practical: 9,
    total: 10,
    group: 4,
    subject: 3
};

console.log('--- Simulating Row 7 (Absent Student) ---');
const row7 = rawData[7];
console.log('Raw Row 7:', JSON.stringify(row7));

const written = columnMap.written >= 0 ? parseScore(row7[columnMap.written]) : null;
const mcq = columnMap.mcq >= 0 ? parseScore(row7[columnMap.mcq]) : null;
const practical = columnMap.practical >= 0 ? parseScore(row7[columnMap.practical]) : null;

const isMcqBlank = columnMap.mcq < 0 || row7[columnMap.mcq] === undefined || row7[columnMap.mcq] === null || String(row7[columnMap.mcq] || '').trim() === '';
const isPracticalBlank = columnMap.practical < 0 || row7[columnMap.practical] === undefined || row7[columnMap.practical] === null || String(row7[columnMap.practical] || '').trim() === '';

const isOnlyWritten = written !== null && isMcqBlank && isPracticalBlank;

const student = {
    written,
    mcq,
    practical,
    isOnlyWritten
};

console.log('Parsed Student:', JSON.stringify(student));
console.log('isAbsent(student):', isAbsent(student));

console.log('\n--- Simulating Row 2 (Examinee) ---');
const row2 = rawData[1]; // Row 1 in Excel
console.log('Raw Row 2:', JSON.stringify(row2));
// ... skip full parse for brevity, just test Row 7 result.
