const XLSX = require('./node_modules/xlsx/xlsx.js');
const fs = require('fs');

const fileName = 'test25.xlsx';
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

// Let's find some potentially absent rows.
// Production has 26 absent. Let's look at the end of the file or scan for them.
let absentRows = [];
for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    // Check if marks columns (Written index 7, MCQ index 8, Prac index 9) are empty/null/undefined
    const written = row[7];
    const mcq = row[8];
    const practical = row[9];

    if ((written === undefined || written === null || written === '') &&
        (mcq === undefined || mcq === null || mcq === '') &&
        (practical === undefined || practical === null || practical === '')) {
        absentRows.push({ index: i, row: row });
    }
}

console.log('Found', absentRows.length, 'potentially absent rows (all blanks in marks cols)');
if (absentRows.length > 0) {
    console.log('First 3 absent rows structure:');
    absentRows.slice(0, 3).forEach(r => {
        console.log(`Row ${r.index}:`, JSON.stringify(r.row));
    });
} else {
    // If not blank, maybe they are "0"?
    let zeroRows = [];
    for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (row[7] === 0 && row[8] === 0 && row[9] === 0) {
            zeroRows.push({ index: i, row: row });
        }
    }
    console.log('Found', zeroRows.length, 'rows with explicit 0 in all marks cols');
}
