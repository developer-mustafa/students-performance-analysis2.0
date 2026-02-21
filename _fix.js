const fs = require('fs');
const content = fs.readFileSync('src/app.js', 'utf8');
const lines = content.split('\n');

// Find and remove the broken line (contains Bengali leftover)
// Line 268 (0-indexed: 267) should be "        }, লোড হয়েছে`);"
// We need to remove it - it's followed by a valid "        },"
for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('}, ') && lines[i].includes('`);')) {
        console.log('Removing broken line ' + (i + 1) + ': ' + lines[i].trim().substring(0, 40));
        lines.splice(i, 1);
    }
}

// Find "// Saved Exams Section Toggle" to insert confirm handlers before it
const idx = lines.findIndex(l => l.includes('// Saved Exams Section Toggle'));
if (idx > -1) {
    console.log('Inserting confirm handlers before line ' + (idx + 1));
    const handlers = [
        '',
        '    // --- Exam Load Confirmation Modal ---',
        "    elements.loadExamConfirmBtn?.addEventListener('click', () => {",
        '        const exam = state._pendingLoadExam;',
        '        if (exam) {',
        '            state.studentData = exam.studentData || [];',
        '            state.currentExamName = exam.name;',
        '            state.currentSubject = exam.subject;',
        '            state.currentExamSession = exam.session;',
        '            state.isViewingSavedExam = true;',
        "            localStorage.setItem('loadedExamId', exam.docId || '');",
        "            localStorage.setItem('currentSubject', exam.subject || '');",
        '            updateViews();',
        '            renderSavedExams();',
        '            showNotification(`${exam.name} সফলভাবে লোড হয়েছে`, `success`);',
        '            state._pendingLoadExam = null;',
        '        }',
        "        elements.loadExamConfirmModal?.classList.remove('active');",
        '    });',
        '',
        "    elements.loadExamCancelBtn?.addEventListener('click', () => {",
        '        state._pendingLoadExam = null;',
        "        elements.loadExamConfirmModal?.classList.remove('active');",
        '    });',
        '',
        "    elements.loadExamConfirmModal?.addEventListener('click', (e) => {",
        '        if (e.target === elements.loadExamConfirmModal) {',
        '            state._pendingLoadExam = null;',
        "            elements.loadExamConfirmModal.classList.remove('active');",
        '        }',
        '    });',
        '',
    ];
    lines.splice(idx, 0, ...handlers);
}

fs.writeFileSync('src/app.js', lines.join('\n'), 'utf8');
console.log('Done! app.js patched successfully.');
