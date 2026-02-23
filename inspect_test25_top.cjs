const XLSX = require('./node_modules/xlsx/xlsx.js');
const fs = require('fs');

const fileName = 'test25.xlsx';
const buf = fs.readFileSync(fileName);
const wb = XLSX.read(buf, { type: 'buffer' });
const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    console.log(`Row ${i}:`, JSON.stringify(rawData[i]));
}
