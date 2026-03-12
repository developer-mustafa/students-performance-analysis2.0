import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  isValueAbsent,
  isAbsent,
  calculateGrade,
  determineStatus,
  filterStudentData,
  calculateStatistics,
} from './utils.js';

const sampleStudents = [
  { id: 1, name: 'ঋতু', group: 'বিজ্ঞান গ্রুপ', written: 90, mcq: 20, practical: 15, total: 95 },
  { id: 2, name: 'রবি', group: 'ব্যবসায় গ্রুপ', written: 55, mcq: 12, practical: 8, total: 75 },
  { id: 3, name: 'সুমি', group: 'মানবিক গ্রুপ', written: 0, mcq: 0, practical: 0, total: 0 },
];

describe('utils module', () => {
  it('normalizeText should normalize Bengali and whitespace consistently', () => {
    const value = '  বিজ্ঞান  গ্রুপ ';
    expect(normalizeText(value)).toBe('বিজ্ঞান গ্রুপ');
    expect(normalizeText('   কম্পিউটার   সায়েন্স  ')).toBe('কম্পিউটার সায়েন্স');
    expect(normalizeText('র\u09CD\u09AF')).toBe('র্য');
  });

  it('isValueAbsent covers empty/absent values', () => {
    expect(isValueAbsent(null)).toBe(true);
    expect(isValueAbsent(undefined)).toBe(true);
    expect(isValueAbsent('')).toBe(true);
    expect(isValueAbsent('absent')).toBe(true);
    expect(isValueAbsent('অনুপস্থিত')).toBe(true);
    expect(isValueAbsent(0)).toBe(false);
  });

  it('isAbsent should detect fully absent student', () => {
    expect(isAbsent({ written: null, mcq: null, practical: null, total: null })).toBe(true);
    expect(isAbsent({ written: 0, mcq: 0, practical: 0, total: 0 })).toBe(false); // 0 is present in this implementation
    expect(isAbsent({ written: 10, mcq: null, practical: null, total: 10 })).toBe(false);
  });

  it('calculateGrade returns correct grade points', () => {
    expect(calculateGrade(95)).toEqual({ grade: 'A+', point: 5.0 });
    expect(calculateGrade(72)).toEqual({ grade: 'A', point: 4.0 });
    expect(calculateGrade(67)).toEqual({ grade: 'A-', point: 3.5 });
    expect(calculateGrade(28)).toEqual({ grade: 'F', point: 0.0 });
  });

  it('determineStatus handles pass/fail/absent properly', () => {
    expect(determineStatus({ written: null, mcq: null, practical: null, total: null })).toBe('অনুপস্থিত');
    expect(determineStatus({ written: 30, mcq: 10, practical: 0, total: 40 })).toBe('পাস'); // default writtenPass 17, mcqPass 8
    expect(determineStatus({ written: 40, mcq: 15, practical: 10, total: 65 })).toBe('পাস');
    expect(determineStatus({ written: 25, mcq: 20, practical: 15, total: 60 }, { writtenPass: 40 })).toBe('ফেল');
  });

  it('filterStudentData filters by group and status', () => {
    const filtered = filterStudentData(sampleStudents, { group: 'বিজ্ঞান গ্রুপ', status: 'pass' }, { writtenPass: 33, mcqPass: 8, practicalPass: 5 });
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('ঋতু');
  });

  it('calculateStatistics returns totals and grade distribution', () => {
    const stats = calculateStatistics(sampleStudents, { writtenPass: 33, mcqPass: 8, practicalPass: 5 });
    expect(stats.totalStudents).toBe(3);
    expect(stats.absentStudents).toBe(0); // 0 marks in object is considered present
    expect(stats.participants).toBe(3);
    expect(stats.failedStudents).toBe(1);
    expect(stats.passedStudents).toBe(2);
    expect(stats.gradeDistribution['A']).toBe(1);
    expect(stats.gradeDistribution['A+']).toBe(1);
    expect(stats.gradeDistribution['F']).toBe(1);
  });
});
