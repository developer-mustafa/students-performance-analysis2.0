const XLSX = require('./node_modules/xlsx/xlsx.js');
const fs = require('fs');

const fileName = 'ict.xlsx';
const buf = fs.readFileSync(fileName);
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log('--- Headers ---');
console.log(JSON.stringify(rawData[0]));

console.log('\n--- Rows (First 30) ---');
for (let i = 1; i < Math.min(rawData.length, 30); i++) {
    const row = rawData[i];
    console.log(`Row ${i}:`, JSON.stringify(row));
}
