const XLSX = require('./node_modules/xlsx/xlsx.js');
const fs = require('fs');

const fileName = 'ict.xlsx';
if (!fs.existsSync(fileName)) {
    console.error(`File ${fileName} not found`);
    process.exit(1);
}

const buf = fs.readFileSync(fileName);
const wb = XLSX.read(buf, { type: 'buffer' });
const firstSheetName = wb.SheetNames[0];
const worksheet = wb.Sheets[firstSheetName];
const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log('Total Rows:', rawData.length);
console.log('Headers (Row 0):', JSON.stringify(rawData[0]));

// Count pass/fail/absent manually based on blank marks
let absent = 0;
let examinees = 0;

for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length < 2) continue;

    const written = row[7];
    const mcq = row[8];
    const practical = row[9];

    const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

    if (isBlank(written) && isBlank(mcq) && isBlank(practical)) {
        absent++;
    } else {
        examinees++;
    }
}

console.log(`Manual Count - Absent: ${absent}, Examinees: ${examinees}`);
console.log('First student row:', JSON.stringify(rawData[1]));
