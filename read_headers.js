import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const buf = readFileSync('pre-test-ict-hsc-2026-result (4).xlsx');
const workbook = XLSX.read(buf);
const sheet_name_list = workbook.SheetNames;
const xlData = XLSX.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);
console.log(JSON.stringify(Object.keys(xlData[0])));
