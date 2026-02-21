/**
 * Class-Subject Mapping Module
 */

import {
    saveClassSubjectMapping,
    subscribeToClassSubjectMappings
} from '../firestoreService.js';
import { elements } from './uiManager.js';
import { showNotification } from '../utils.js';
import { state } from './state.js';

let currentClassMappings = {};
let selectedSubjects = [];

/**
 * Initialize Class Mapping Manager
 */
export function initClassMappingManager() {
    if (!elements.classSubjectMappingModal) return;

    // Class selection change
    elements.mappingClassSelect?.addEventListener('change', (e) => {
        loadMappingsForClass(e.target.value);
    });

    // Add subject
    elements.addMappingSubjectBtn?.addEventListener('click', () => {
        const subject = elements.mappingSubjectInput.value.trim();
        if (subject) {
            addSubjectTag(subject);
            elements.mappingSubjectInput.value = '';
        }
    });

    elements.mappingSubjectInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const subject = elements.mappingSubjectInput.value.trim();
            if (subject) {
                addSubjectTag(subject);
                elements.mappingSubjectInput.value = '';
            }
        }
    });

    // Save
    elements.saveMappingBtn?.addEventListener('click', handleSaveMapping);

    // Initial load from subscription
    subscribeToClassSubjectMappings((mappings) => {
        currentClassMappings = mappings || {};
        const selectedClass = elements.mappingClassSelect?.value;
        if (selectedClass) {
            loadMappingsForClass(selectedClass);
        }
    });
}

function loadMappingsForClass(className) {
    selectedSubjects = currentClassMappings[className] || [];
    renderSubjectTags();
}

function addSubjectTag(subject) {
    if (!selectedSubjects.includes(subject)) {
        selectedSubjects.push(subject);
        renderSubjectTags();
    } else {
        showNotification('এই বিষয়টি ইতিমধ্যে যুক্ত করা হয়েছে', 'warning');
    }
}

function removeSubjectTag(subject) {
    selectedSubjects = selectedSubjects.filter(s => s !== subject);
    renderSubjectTags();
}

function renderSubjectTags() {
    if (!elements.mappingSubjectsContainer) return;

    if (selectedSubjects.length === 0) {
        elements.mappingSubjectsContainer.innerHTML = '<span style="color: #999; font-size: 0.9em;">কোনো বিষয় যুক্ত করা হয়নি</span>';
        return;
    }

    elements.mappingSubjectsContainer.innerHTML = selectedSubjects.map(subject => `
        <div class="subject-tag">
            ${subject}
            <i class="fas fa-times remove-tag" data-subject="${subject}"></i>
        </div>
    `).join('');

    // Attach remove listeners
    elements.mappingSubjectsContainer.querySelectorAll('.remove-tag').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const subject = e.target.dataset.subject;
            removeSubjectTag(subject);
        });
    });
}

/**
 * Populate a subject dropdown based on class selection
 * @param {HTMLElement} dropdown 
 * @param {string} className 
 * @param {string} currentSubject (Optional)
 */
export function populateSubjectDropdown(dropdown, className, currentSubject = '') {
    if (!dropdown) return;

    const subjects = currentClassMappings[className] || [];

    if (subjects.length === 0) {
        dropdown.innerHTML = '<option value="">আগে শ্রেণি সিলেক্ট করুন</option>';
        dropdown.disabled = true;
        return;
    }

    dropdown.disabled = false;
    dropdown.innerHTML = subjects.map(s =>
        `<option value="${s}" ${s === currentSubject ? 'selected' : ''}>${s}</option>`
    ).join('');
}

async function handleSaveMapping() {
    const className = elements.mappingClassSelect?.value;
    if (!className) return;

    try {
        const success = await saveClassSubjectMapping(className, selectedSubjects);
        if (success) {
            showNotification(`${className} শ্রেণির জন্য ম্যাপিং সেভ করা হয়েছে`);
        } else {
            showNotification('ম্যাপিং সেভ করতে সমস্যা হয়েছে', 'error');
        }
    } catch (error) {
        console.error('Error saving mapping:', error);
        showNotification('একটি ত্রুটি ঘটেছে', 'error');
    }
}
