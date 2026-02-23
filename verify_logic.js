import { determineStatus, isAbsent } from './src/js/utils.js';
import { FAILING_THRESHOLD } from './src/js/constants.js';

const testCases = [
    {
        name: 'Absent student (all null)',
        student: { written: null, mcq: null, practical: null, total: null },
        expected: 'অনুপস্থিত'
    },
    {
        name: 'CQ-only Pass (CQ=35, others null)',
        student: { written: 35, mcq: null, practical: null, total: 35 },
        expected: 'পাস'
    },
    {
        name: 'CQ-only Fail (CQ=20, others null)',
        student: { written: 20, mcq: null, practical: null, total: 20 },
        expected: 'ফেল'
    },
    {
        name: 'Standard Pass (CQ=18, MCQ=10)',
        student: { written: 18, mcq: 10, practical: 0, total: 28 },
        expected: 'পাস'
    },
    {
        name: 'Standard Fail (CQ=15, MCQ=10)',
        student: { written: 15, mcq: 10, practical: 0, total: 25 },
        expected: 'ফেল'
    },
    {
        name: 'Standard Fail (CQ=18, MCQ=5)',
        student: { written: 18, mcq: 5, practical: 0, total: 23 },
        expected: 'ফেল'
    },
    {
        name: 'Custom Config Pass (CQ=15, MCQ=5, threshold CQ=12, MCQ=5)',
        student: { written: 15, mcq: 5, practical: 0, total: 20 },
        options: { writtenPass: 12, mcqPass: 5 },
        expected: 'পাস'
    },
    {
        name: 'Absent student (components null, total 0)',
        student: { written: null, mcq: null, practical: null, total: 0 },
        expected: 'অনুপস্থিত'
    },
    {
        name: 'Practical-only Absent (but actually present if total 0?) - No, strictly null is absent',
        student: { written: 0, mcq: 0, practical: 0, total: 0 },
        expected: 'ফেল' // Fixed: 0 is fail, not absent
    }
];

console.log('Testing Pass/Fail Logic...\n');
let passed = 0;
testCases.forEach(tc => {
    const result = determineStatus(tc.student, tc.options);
    if (result === tc.expected) {
        console.log(`✅ PASS: ${tc.name}`);
        passed++;
    } else {
        console.log(`❌ FAIL: ${tc.name} | Expected: ${tc.expected} | Got: ${result}`);
    }
});

console.log(`\nResults: ${passed}/${testCases.length} passed.`);
if (passed === testCases.length) {
    process.exit(0);
} else {
    process.exit(1);
}
