/**
 * Chart Module - Handles all Chart.js related functionality
 * @module chartModule
 */

import Chart from 'chart.js/auto';

import { CHART_TYPES, MAX_CHART_ENTRIES, FAILING_THRESHOLD } from './constants.js';
import { getGroupColor, sortStudentData, showNotification } from './utils.js';
import { exportChartAsImage } from './dataService.js';

let currentChart = null;

/**
 * Set Chart.js global theme colors based on dark/light mode
 */
function setChartTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#ffffff' : '#1f2937';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)';

    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = gridColor;
    Chart.defaults.scale.grid.color = gridColor;
    Chart.defaults.scale.ticks.color = textColor;
}

/**
 * Create or update the performance chart
 * @param {HTMLCanvasElement} canvas - Chart canvas element
 * @param {Array} data - Student data array
 * @param {Object} options - Chart options
 * @returns {Chart} - Chart instance
 */
export function createPerformanceChart(canvas, data, options = {}) {
    setChartTheme();
    const {
        chartType = 'total',
        sortOrder = 'desc',
        subject = null,
        group = null,
        grade = null,
        examName = null,
        onBarClick = null,
    } = options;

    // Destroy existing chart
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }



    if (!data || data.length === 0) {
        return null;
    }

    // Sort data
    const sortedData = sortStudentData(data, chartType, sortOrder);

    // Limit to max entries
    const limitedData = sortedData.slice(0, MAX_CHART_ENTRIES);


    // Prepare chart data
    const chartConfig = CHART_TYPES[chartType];
    const labels = limitedData.map((student) =>
        `রোল:${student.id}-${student.name} (${student.group.replace(' গ্রুপ', '')})`
    );
    const values = limitedData.map((student) => student[chartType]);

    // Dynamic Pass Mark (Default to 33 if not provided)
    // For specific chart types, caller should provide the correct pass mark
    const { passMark = 33 } = options;

    // Conditional colors based on score percentage and Pass Mark
    const getScoreColor = (score) => {
        // Simple logic: < Pass Mark = Red, >= Pass Mark = Green
        // We can keep the "Yellow" logic for mid-range if needed, but User emphasized "Pass/Fail".

        if (score < passMark) {
            return { bg: 'rgba(239, 68, 68, 0.8)', border: 'rgb(239, 68, 68)' }; // Red (Fail)
        }

        // Passing Colors
        // Optional: Differentiate High scores?
        // For now, let's keep it simple Green for Pass as per request "reflect pass mark data".

        // If it's a percentage based chart (Total), we might want gradients, but for now stick to Pass/Fail distinction.
        // Wait, for Total, is it 33% or specific mark? options.passMark handles it.

        return { bg: 'rgba(34, 197, 94, 0.8)', border: 'rgb(34, 197, 94)' }; // Green (Pass)
    };

    const backgroundColor = values.map((score) => getScoreColor(score).bg);
    const borderColor = values.map((score) => getScoreColor(score).border);

    // Check if mobile
    const isMobile = window.innerWidth <= 768;

    // Create chart
    const ctx = canvas.getContext('2d');

    // Get Theme Colors from CSS with proper fallbacks
    const style = getComputedStyle(document.body);
    const isDarkMode = document.body.classList.contains('dark-mode');
    const textColor = style.getPropertyValue('--text-color').trim() || (isDarkMode ? '#e0e0e0' : '#1f2937');
    const gridColor = style.getPropertyValue('--border-color').trim() || (isDarkMode ? '#444' : '#e5e7eb');

    // Dynamic Chart Label
    let datasetLabel = '';

    // Prepend Exam Name
    if (examName) {
        datasetLabel += `${examName}`;
    }

    // Add subject name
    if (subject) {
        datasetLabel += ` - ${subject}`;
    }

    // Add class and session from data
    const firstStudent = data[0];
    if (firstStudent) {
        if (firstStudent.class) datasetLabel += ` | শ্রেণি: ${firstStudent.class}`;
        if (firstStudent.session) datasetLabel += ` | সেশন: ${firstStudent.session}`;
    }

    datasetLabel += ` — ${chartConfig.label} (গ্রাফে দেখাচ্ছে)`;

    // Append Filter Info to Title
    if (group) {
        datasetLabel += ` (${group})`;
    }
    if (grade) {
        datasetLabel += ` [গ্রেড: ${grade}]`;
    }

    // Append count
    datasetLabel += ` - শিক্ষার্থী সংখ্যা: ${values.length} জন`;

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: datasetLabel,
                    data: values,
                    backgroundColor,
                    borderColor,
                    borderWidth: 1,
                },
            ],
        },
        options: {
            onClick: (e, elements) => {
                if (!elements || elements.length === 0) return;

                if (onBarClick && limitedData) {
                    const index = elements[0].index;
                    const student = limitedData[index];
                    if (student) {
                        onBarClick(student);
                    }
                }
            },
            indexAxis: isMobile ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: isMobile ? 'শিক্ষার্থীরা' : 'স্কোর',
                        color: textColor,
                    },
                    ticks: {
                        color: textColor,
                    },
                    grid: {
                        color: gridColor,
                    },
                },
                x: {
                    title: {
                        display: true,
                        text: isMobile ? 'স্কোর' : 'শিক্ষার্থীরা',
                        color: textColor,
                    },
                    ticks: {
                        autoSkip: false, // Force show all labels
                        maxRotation: 45,
                        minRotation: 45, // Vertical labels to save space
                        color: (context) => {
                            const label = labels[context.index];
                            if (label && label.includes('বিজ্ঞান')) return '#ef4444'; // Red for Science
                            if (label && label.includes('ব্যবসায়')) return '#10b981'; // Green for Business
                            if (label && label.includes('মানবিক')) return '#3b82f6'; // Blue for Humanities
                            return textColor;
                        },
                        font: {
                            size: 10 // Smaller font as requested
                        }
                    },
                    grid: {
                        color: gridColor,
                    },
                },
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: textColor,
                    },
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function (context) {
                            const student = limitedData[context.dataIndex];
                            const { writtenPass = FAILING_THRESHOLD.written, mcqPass = FAILING_THRESHOLD.mcq } = options;
                            let tooltipText = `গ্রুপ: ${student.group}`;
                            if (chartType === 'written' && Number(student.written) < writtenPass) {
                                tooltipText += `\n❌ ফেল (লিখিত < ${writtenPass})`;
                            }
                            if (chartType === 'mcq' && Number(student.mcq) < mcqPass) {
                                tooltipText += `\n❌ ফেল (MCQ < ${mcqPass})`;
                            }
                            return tooltipText;
                        },
                    },
                },
            },
        },
        plugins: [{
            id: 'dataLabels',
            afterDatasetsDraw(chart) {
                const { ctx, chartArea } = chart;
                const isDark = document.body.classList.contains('dark-mode');
                const labelColor = isDark ? '#ffffff' : '#1f2937';

                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    meta.data.forEach((bar, index) => {
                        const value = dataset.data[index];
                        if (value === null || value === undefined) return;

                        ctx.save();
                        ctx.font = 'bold 11px Arial';
                        ctx.fillStyle = labelColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';

                        // Position based on bar orientation
                        if (chart.options.indexAxis === 'y') {
                            // Horizontal bars
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(value, bar.x + 5, bar.y);
                        } else {
                            // Vertical bars
                            ctx.fillText(value, bar.x, bar.y - 5);
                        }
                        ctx.restore();
                    });
                });
            }
        }],
    });

    return currentChart;
}

/**
 * Get current chart instance
 * @returns {Chart|null} - Current chart instance
 */
export function getCurrentChart() {
    return currentChart;
}

/**
 * Update chart on resize
 */
export function updateChartOnResize() {
    if (currentChart) {
        currentChart.update();
    }
}

/**
 * Get chart title based on type
 * @param {string} chartType - Chart type key
 * @returns {string} - Chart title
 */
export function getChartTitle(chartType, examName, subject = null) {
    const baseTitle = CHART_TYPES[chartType]?.title || CHART_TYPES.total.title;
    let title = `${baseTitle} - ${examName || 'exam '}`;
    if (subject) {
        title += ` (${subject})`;
    }
    return title;
}

let currentHistoryChart = null;

/**
 * Create or update the history chart
 * @param {HTMLCanvasElement} canvas - Chart canvas element
 * @param {Array} historyData - Student history data array
 * @param {Object} options - Chart options { chartType, maxMarks }
 */
export function createHistoryChart(canvas, historyData, options = {}) {
    setChartTheme();
    const { chartType = 'total', maxMarks = 100, passMark = 33 } = options;

    // Destroy existing chart
    if (currentHistoryChart) {
        currentHistoryChart.destroy();
        currentHistoryChart = null;
    }

    if (!historyData || historyData.length === 0) {
        return;
    }

    const labels = historyData.map(item => item.examName);
    // Extract value based on chartType
    const values = historyData.map(item => {
        const val = item[chartType];
        return val !== undefined ? val : 0;
    });

    // Calculate colors based on comparisons with Pass Mark
    const backgroundColors = values.map(val => {
        if (val < passMark) return 'rgba(239, 68, 68, 0.7)'; // Red (Fail)
        return 'rgba(16, 185, 129, 0.7)'; // Modern Emerald Green (Pass)
    });

    const borderColors = values.map(val => {
        if (val < passMark) return 'rgb(239, 68, 68)';
        return 'rgb(16, 185, 129)';
    });

    const ctx = canvas.getContext('2d');

    const chartLabel = {
        total: 'মোট নম্বর (Total)',
        written: 'লিখিত (Written)',
        mcq: 'এমসিকিউ (MCQ)',
        practical: 'ব্যবহারিক (Practical)'
    }[chartType] || 'Total';

    // Helper to calculate grade if missing
    const calculateGrade = (marks, total) => {
        const pct = (marks / total) * 100;
        if (pct >= 80) return 'A+';
        if (pct >= 70) return 'A';
        if (pct >= 60) return 'A-';
        if (pct >= 50) return 'B';
        if (pct >= 40) return 'C';
        if (pct >= 33) return 'D';
        return 'F';
    };

    // Custom Plugin for Data Labels
    const dataLabelsPlugin = {
        id: 'dataLabels',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            const isDark = document.body.classList.contains('dark-mode');
            const labelColor = isDark ? '#ffffff' : '#1f2937';

            chart.data.datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                meta.data.forEach((bar, index) => {
                    const value = dataset.data[index];
                    if (value === 0 && dataset.data.length > 1) return;

                    const bnValue = String(value).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
                    let labelText = bnValue;

                    // Show Grade ONLY for Total Marks
                    if (chartType === 'total') {
                        let grade = historyData[index]?.grade;
                        if (!grade) {
                            grade = calculateGrade(value, maxMarks);
                        }
                        labelText = `${bnValue} (${grade})`;
                    }

                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.font = 'bold 16px "SolaimanLipi", "Inter", sans-serif';
                    ctx.fillStyle = labelColor;

                    // Subtle shadow for better pop on dark backgrounds
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetY = 2;

                    ctx.fillText(labelText, bar.x, bar.y - 8);
                    ctx.restore();
                });
            });
        }
    };

    const isDarkMode = document.body.classList.contains('dark-mode');
    const textColor = isDarkMode ? '#ffffff' : '#1f2937';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

    currentHistoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: chartLabel,
                data: values,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1.5,
                barPercentage: 0.5, // Slimmer bars like in image
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        plugins: [dataLabelsPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 40 // More space for labels
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${context.raw} / ${maxMarks}`;
                        },
                        afterLabel: function (context) {
                            const item = historyData[context.dataIndex];
                            return `Grade: ${item.grade || 'N/A'}`;
                        }
                    }
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: textColor,
                        font: {
                            size: 14
                        }
                    }
                },
                annotation: {
                    annotations: {
                        line1: {
                            type: 'line',
                            yMin: maxMarks * 0.33,
                            yMax: maxMarks * 0.33,
                            borderColor: 'red',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: 'Pass Mark',
                                enabled: true,
                                color: 'red',
                                position: 'start'
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: parseInt(maxMarks),
                    title: {
                        display: true,
                        text: 'নম্বর',
                        color: textColor,
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        color: textColor,
                        font: {
                            size: 12
                        }
                    },
                    grid: {
                        color: gridColor
                    }
                },
                x: {
                    ticks: {
                        color: textColor,
                        font: {
                            size: 12
                        }
                    },
                    grid: {
                        color: gridColor
                    }
                }
            }
        }
    });

    return currentHistoryChart;
}

/**
 * Download chart with high resolution (3x)
 * @param {string} filename - Filename to save as
 */
export function downloadHighResChart(filename) {
    if (!currentChart || !currentChart.canvas) return;
    const { canvas } = currentChart;

    if (canvas.width === 0 || canvas.height === 0) {
        showNotification('চার্টটি দৃশ্যমান নয় অথবা ক্যালকুলেট করা সম্ভব হচ্ছে না', 'error');
        return;
    }

    // 1. Save original pixel ratio
    const originalPixelRatio = currentChart.options.devicePixelRatio || window.devicePixelRatio || 1;

    try {
        // 2. Set high resolution (3x)
        currentChart.options.devicePixelRatio = 3;
        currentChart.resize();
        currentChart.update();

        // 3. Export image (using imported helper)
        setTimeout(() => {
            if (currentChart && currentChart.canvas && currentChart.canvas.width > 0) {
                exportChartAsImage(currentChart.canvas, filename);
            }

            // 4. Restore original pixel ratio
            if (currentChart) {
                currentChart.options.devicePixelRatio = originalPixelRatio;
                currentChart.resize();
                currentChart.update();
            }
        }, 500);
    } catch (error) {
        console.error('High-res export failed:', error);
        // Restore if failed
        currentChart.options.devicePixelRatio = originalPixelRatio;
        currentChart.resize();
        currentChart.update();
    }
}
