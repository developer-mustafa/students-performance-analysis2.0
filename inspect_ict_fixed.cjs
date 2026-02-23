const XLSX = require('./node_modules/xlsx/xlsx.js');
const fs = require('fs');

const fileName = 'ict.xlsx';
const buf = fs.readFileSync(fileName);
const wb = XLSX.read(buf, { type: 'buffer' });
const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

console.log('Total Rows:', rawData.length);
console.log('Headers (Row 0):', JSON.stringify(rawData[0]));

// Data markers:
// 6: Written
// 7: MCQ
// 8: Practical

let absentCount = 0;
let examineesCount = 0;

for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length < 2) continue;

    // Check indices 6, 7, 8
    const written = row[6];
    const mcq = row[7];
    const practical = row[8];

    const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

    if (isBlank(written) && isBlank(mcq) && isBlank(practical)) {
        absentCount++;
    } else {
        examineesCount++;
    }
}

console.log(`Manual Count (Cols 6,7,8) - Absent: ${absentCount}, Examinees: ${examineesCount}`);
console.log('Row 7 Example:', JSON.stringify(rawData[7]));
