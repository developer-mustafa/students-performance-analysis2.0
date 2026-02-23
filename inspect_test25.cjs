const XLSX = require('./node_modules/xlsx/xlsx.js');
const fs = require('fs');

const fileName = 'test25.xlsx';
const buf = fs.readFileSync(fileName);
const wb = XLSX.read(buf, { type: 'buffer' });
const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

console.log('Total Rows:', rawData.length);
console.log('Headers (Row 0):', JSON.stringify(rawData[0]));

// Row 7 check (usually absent in my previous tests)
console.log('Row 7:', JSON.stringify(rawData[7]));

// Find a student who should be "Only Written"
for (let i = 1; i < 20; i++) {
    console.log(`Row ${i}:`, JSON.stringify(rawData[i]));
}
