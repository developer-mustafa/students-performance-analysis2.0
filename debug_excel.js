import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const fileName = 'pre-test-ict-hsc-2026-result (3).xlsx';
const filePath = path.resolve(process.cwd(), fileName);

console.log(`Checking file: ${filePath}`);

if (!fs.existsSync(filePath)) {
    console.error('File does NOT exist!');
    process.exit(1);
}

try {
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    console.log('Sheets:', workbook.SheetNames);

    if (workbook.SheetNames.length === 0) {
        console.error('No sheets found!');
        process.exit(1);
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Get headers
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    console.log(`Total rows: ${rawData.length}`);

    if (rawData.length > 0) {
        const headers = rawData[0].map(h => String(h).toLowerCase().trim());
        console.log('Headers:', headers);

        // Analyze group distribution
        const groupCounts = {};
        const parsedGroups = {};

        // Detect group column index
        const groupIndex = headers.findIndex(h => h.includes('group') || h.includes('গ্রুপ'));

        if (groupIndex >= 0) {
            console.log(`Group column found at index ${groupIndex}: ${headers[groupIndex]}`);

            for (let i = 1; i < rawData.length; i++) {
                const row = rawData[i];
                if (!row || row.length === 0) continue;

                const rawGroup = String(row[groupIndex] || '').trim();
                groupCounts[rawGroup] = (groupCounts[rawGroup] || 0) + 1;

                // EXACT LOGIC FROM dataService.js
                const groupValue = rawGroup.toLowerCase();
                let parsedGroup = 'বিজ্ঞান গ্রুপ'; // Default

                if (groupValue.includes('business') || groupValue.includes('ব্যবসায়') || groupValue.includes('বাণিজ্য') || groupValue.includes('studies') || groupValue.includes('commerce') || groupValue.includes('b.')) {
                    parsedGroup = 'ব্যবসায় গ্রুপ';
                } else if (groupValue.includes('arts') || groupValue.includes('মানবিক') || groupValue.includes('humanities')) {
                    parsedGroup = 'মানবিক গ্রুপ';
                } else if (groupValue.includes('science') || groupValue.includes('বিজ্ঞান')) {
                    parsedGroup = 'বিজ্ঞান গ্রুপ';
                }

                parsedGroups[parsedGroup] = (parsedGroups[parsedGroup] || 0) + 1;
            }

            console.log('Raw Group Counts:', groupCounts);
            console.log('Parsed Group Counts (Actual Logic):', parsedGroups);
        } else {
            console.log('Group column NOT found!');
        }

        // Check for expected columns
        const expected = ['roll', 'name', 'group', 'class', 'session', 'written'];
        const found = expected.filter(e => headers.some(h => h.includes(e)));
        console.log('Found expected columns:', found);

        console.log('First 2 data rows:');
        console.log(JSON.stringify(rawData.slice(1, 3), null, 2));
    } else {
        console.log('File is empty');
    }

} catch (error) {
    console.error('Error reading Excel:', error);
}
