import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeText,
    isValueAbsent,
    isAbsent,
    calculateGrade,
    determineStatus,
    isStudentEligibleForSubject,
    filterStudentData,
    calculateStatistics,
    normalizeSession,
    convertToBengaliDigits,
    escapeHtml,
    sortStudentData,
    calculateGroupStatistics,
    getFailedStudents,
} from './utils.js';

const sampleStudents = [
    { id: 1, name: 'ঋতু', group: 'বিজ্ঞান গ্রুপ', written: 90, mcq: 20, practical: 15, total: 95 },
    { id: 2, name: 'রবি', group: 'ব্যবসায় গ্রুপ', written: 55, mcq: 12, practical: 8, total: 75 },
    { id: 3, name: 'সুমি', group: 'মানবিক গ্রুপ', written: 0, mcq: 0, practical: 0, total: 0 },
];

test('normalizeText normalizes Bengali variants and whitespace consistently', () => {
    assert.equal(normalizeText('  বিজ্ঞান  গ্রুপ '), 'বিজ্ঞান গ্রুপ');
    assert.equal(normalizeText('   কম্পিউটার   সায়েন্স  '), 'কম্পিউটার সাযেন্স');
    assert.equal(normalizeText('র\u09CD\u09AF'), 'র্য');
});

test('isValueAbsent covers empty and absent values', () => {
    assert.equal(isValueAbsent(null), true);
    assert.equal(isValueAbsent(undefined), true);
    assert.equal(isValueAbsent(''), true);
    assert.equal(isValueAbsent('absent'), true);
    assert.equal(isValueAbsent('অনুপস্থিত'), true);
    assert.equal(isValueAbsent(0), false);
});

test('isAbsent detects fully absent students without treating literal zero as absent', () => {
    assert.equal(isAbsent({ written: null, mcq: null, practical: null, total: null }), true);
    assert.equal(isAbsent({ written: 0, mcq: 0, practical: 0, total: 0 }), false);
    assert.equal(isAbsent({ written: 10, mcq: null, practical: null, total: 10 }), false);
});

test('calculateGrade returns the correct grade and point', () => {
    assert.deepEqual(calculateGrade(95), { grade: 'A+', point: 5.0 });
    assert.deepEqual(calculateGrade(72), { grade: 'A', point: 4.0 });
    assert.deepEqual(calculateGrade(67), { grade: 'A-', point: 3.5 });
    assert.deepEqual(calculateGrade(28), { grade: 'F', point: 0.0 });
});

test('determineStatus handles pass, fail, and absent cases', () => {
    assert.equal(determineStatus({ written: null, mcq: null, practical: null, total: null }), 'অনুপস্থিত');
    assert.equal(determineStatus({ written: 30, mcq: 10, practical: 0, total: 40 }), 'পাস');
    assert.equal(determineStatus({ written: 40, mcq: 15, practical: 10, total: 65 }), 'পাস');
    assert.equal(determineStatus({ written: 25, mcq: 20, practical: 15, total: 60 }, { writtenPass: 40 }), 'ফেল');
});

test('filterStudentData filters by group and status', () => {
    const filtered = filterStudentData(
        sampleStudents,
        { group: 'বিজ্ঞান গ্রুপ', status: 'pass' },
        { writtenPass: 33, mcqPass: 8, practicalPass: 5 }
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, 'ঋতু');
});

test('calculateStatistics returns totals and grade distribution', () => {
    const stats = calculateStatistics(sampleStudents, { writtenPass: 33, mcqPass: 8, practicalPass: 5 });

    assert.equal(stats.totalStudents, 3);
    assert.equal(stats.absentStudents, 0);
    assert.equal(stats.participants, 3);
    assert.equal(stats.failedStudents, 1);
    assert.equal(stats.passedStudents, 2);
    assert.equal(stats.gradeDistribution.A, 1);
    assert.equal(stats.gradeDistribution['A+'], 1);
    assert.equal(stats.gradeDistribution.F, 1);
});

test('normalizeSession standardizes separators and expands short trailing years', () => {
    assert.equal(normalizeSession('2024/25'), '2024-2025');
    assert.equal(normalizeSession('2024 - 2025'), '2024-2025');
    assert.equal(normalizeSession('\u09E8\u09E6\u09E8\u09EA/\u09E8\u09EB'), '2024-2025');
});

test('convertToBengaliDigits converts numeric strings without changing punctuation', () => {
    assert.equal(convertToBengaliDigits(2025), '\u09E8\u09E6\u09E8\u09EB');
    assert.equal(convertToBengaliDigits('Class 10-2'), 'Class \u09E7\u09E6-\u09E8');
});

test('isStudentEligibleForSubject respects subject mappings before group rules', () => {
    const student = { id: '07', group: '\u09AC\u09BF\u099C\u09CD\u099E\u09BE\u09A8' };
    const subjectMappings = [
        { subject: '\u09AA\u09A6\u09BE\u09B0\u09CD\u09A5\u09AC\u09BF\u099C\u09CD\u099E\u09BE\u09A8', group: '\u09AC\u09BF\u099C\u09CD\u099E\u09BE\u09A8', rolls: ['7', '8'] },
        { subject: '\u09AA\u09A6\u09BE\u09B0\u09CD\u09A5\u09AC\u09BF\u099C\u09CD\u099E\u09BE\u09A8', group: '\u09AE\u09BE\u09A8\u09AC\u09BF\u0995', rolls: ['1'] },
    ];
    const marksheetRules = {
        HSC: {
            groupSubjects: {
                '\u09AC\u09BF\u099C\u09CD\u099E\u09BE\u09A8': ['\u09AA\u09A6\u09BE\u09B0\u09CD\u09A5\u09AC\u09BF\u099C\u09CD\u099E\u09BE\u09A8'],
            },
        },
    };

    assert.equal(
        isStudentEligibleForSubject(student, '\u09AA\u09A6\u09BE\u09B0\u09CD\u09A5\u09AC\u09BF\u099C\u09CD\u099E\u09BE\u09A8', { subjectMappings, marksheetRules, className: 'HSC' }),
        true
    );
    assert.equal(
        isStudentEligibleForSubject({ id: '09', group: '\u09AC\u09BF\u099C\u09CD\u099E\u09BE\u09A8' }, '\u09AA\u09A6\u09BE\u09B0\u09CD\u09A5\u09AC\u09BF\u099C\u09CD\u099E\u09BE\u09A8', { subjectMappings, marksheetRules, className: 'HSC' }),
        false
    );
});

test('escapeHtml prevents XSS by escaping special characters', () => {
    assert.equal(escapeHtml('<script>alert("XSS & test")</script>'), '&lt;script&gt;alert(&quot;XSS &amp; test&quot;)&lt;/script&gt;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(123), '123');
});

test('sortStudentData sorts students by different criteria and handles group priority', () => {
    const students = [
        { id: 3, name: 'Arts Student', group: 'মানবিক গ্রুপ', total: 60 },
        { id: 1, name: 'Science Student', group: 'বিজ্ঞান গ্রুপ', total: 95 },
        { id: 2, name: 'Business Student', group: 'ব্যবসায় গ্রুপ', total: 75 },
    ];

    // Descending order by total
    const sortedByTotal = sortStudentData(students, 'total', 'desc');
    assert.equal(sortedByTotal[0].name, 'Science Student');
    assert.equal(sortedByTotal[2].name, 'Arts Student');

    // Ascending order by total
    const sortedByTotalAsc = sortStudentData(students, 'total', 'asc');
    assert.equal(sortedByTotalAsc[0].name, 'Arts Student');
    assert.equal(sortedByTotalAsc[2].name, 'Science Student');

    // Roll Ascending (Checks Group Priority: Science > Business > Arts)
    const sortedByRoll = sortStudentData(students, 'id', 'roll-asc');
    assert.equal(sortedByRoll[0].name, 'Science Student');
    assert.equal(sortedByRoll[1].name, 'Business Student');
    assert.equal(sortedByRoll[2].name, 'Arts Student');
});

test('calculateGroupStatistics generates separate stats for each group', () => {
    const students = [
        { id: 1, group: 'বিজ্ঞান', written: 40, total: 50 },
        { id: 2, group: 'বিজ্ঞান', written: 20, total: 20 }, // Fail
        { id: 3, group: 'মানবিক', written: 40, total: 50 },
    ];
    
    const stats = calculateGroupStatistics(students, { writtenPass: 33 });
    assert.equal(stats.length, 2);
    
    const scienceStats = stats.find(s => s.group === 'বিজ্ঞান');
    assert.equal(scienceStats.totalStudents, 2);
    assert.equal(scienceStats.failedStudents, 1);
    
    const artsStats = stats.find(s => s.group === 'মানবিক');
    assert.equal(artsStats.totalStudents, 1);
    assert.equal(artsStats.failedStudents, 0);
});

test('getFailedStudents accurately identifies failed students and handles search', () => {
    const students = [
        { id: 1, roll: 101, name: 'Passer', written: 50, total: 60 },
        { id: 2, roll: 102, name: 'Failer 1', written: 20, total: 30 },
        { id: 3, roll: 103, name: 'Failer 2', written: 15, total: 25 },
    ];

    // Find all failed
    const allFailed = getFailedStudents(students, { writtenPass: 33 });
    assert.equal(allFailed.length, 2);
    assert.equal(allFailed[0].name, 'Failer 1');

    // Search for specific failed student (by English digit)
    const searchedFail = getFailedStudents(students, { writtenPass: 33, searchTerm: '102' });
    assert.equal(searchedFail.length, 1);
    assert.equal(searchedFail[0].name, 'Failer 1');

    // Search for specific failed student (by Bengali digit)
    const bnSearchedFail = getFailedStudents(students, { writtenPass: 33, searchTerm: '১০৩' });
    assert.equal(bnSearchedFail.length, 1);
    assert.equal(bnSearchedFail[0].name, 'Failer 2');
});
