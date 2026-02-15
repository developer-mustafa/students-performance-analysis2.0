/**
 * Chart Module - Handles all Chart.js related functionality
 * @module chartModule
 */

import Chart from 'chart.js/auto';

import { CHART_TYPES, MAX_CHART_ENTRIES, FAILING_THRESHOLD } from './constants.js';
import { getGroupColor, sortStudentData } from './utils.js';

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
        `রোল: ${student.id} - ${student.name} (${student.group.replace(' গ্রুপ', '')})`
    );
    const values = limitedData.map((student) => student[chartType]);

    // Conditional colors based on score percentage
    const getScoreColor = (score) => {
        // 1. Check specific failing thresholds first
        if (chartType === 'mcq' && score < FAILING_THRESHOLD.mcq) {
            return { bg: 'rgba(239, 68, 68, 0.8)', border: 'rgb(239, 68, 68)' }; // Red
        }
        if (chartType === 'written' && score < FAILING_THRESHOLD.written) {
            return { bg: 'rgba(239, 68, 68, 0.8)', border: 'rgb(239, 68, 68)' }; // Red
        }
        if (chartType === 'total' && score < FAILING_THRESHOLD.total) { // 33 for Total
            return { bg: 'rgba(239, 68, 68, 0.8)', border: 'rgb(239, 68, 68)' }; // Red
        }

        // 2. For passing scores, determine color based on quality (if possible)
        // For MCQ/Written, if passed, we can default to Green or try to map percentage
        // But since we don't strictly know max marks for MCQ/Written here (it varies),
        // let's assume if it passed the threshold, it's at least 'Ok'.

        if (chartType === 'mcq' || chartType === 'written') {
            // Passed the threshold
            return { bg: 'rgba(34, 197, 94, 0.8)', border: 'rgb(34, 197, 94)' }; // Green
        }

        // 3. Fallback for Total (percentage basis assuming 100 max)
        const maxScore = 100;
        const percentage = (score / maxScore) * 100;

        if (percentage < 33) {
            return { bg: 'rgba(239, 68, 68, 0.8)', border: 'rgb(239, 68, 68)' };
        } else if (percentage < 50) {
            return { bg: 'rgba(234, 179, 8, 0.8)', border: 'rgb(234, 179, 8)' }; // Yellow
        } else if (percentage < 70) {
            return { bg: 'rgba(245, 158, 11, 0.8)', border: 'rgb(245, 158, 11)' }; // Orange
        } else {
            return { bg: 'rgba(34, 197, 94, 0.8)', border: 'rgb(34, 197, 94)' }; // Green
        }
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
        datasetLabel += `${examName} - `;
    }

    datasetLabel += chartConfig.label;
    if (subject && chartType === 'total') {
        datasetLabel += ` - ${subject}`; // e.g. "Total Score - Bangla"
    }

    // Append Filter Info to Title
    if (group) {
        datasetLabel += ` (${group})`;
    }
    if (grade) {
        datasetLabel += ` [গ্রেড: ${grade}]`;
    }

    // Append count
    datasetLabel += ` - ${values.length} জন`;

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
                        maxRotation: 45,
                        minRotation: 45,
                        color: textColor,
                        font: {
                            size: 11
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
                            let tooltipText = `গ্রুপ: ${student.group}`;
                            if (chartType === 'written' && student.written < 17) {
                                tooltipText += '\n❌ ফেল (লিখিত < ১৭)';
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
    const { chartType = 'total', maxMarks = 100 } = options;

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

    // Calculate colors based on percentage of maxMarks
    // Calculate colors based on percentage of maxMarks
    const backgroundColors = values.map(val => {
        const percentage = (val / maxMarks) * 100;
        // Brighter colors for better visibility (0.85 opacity)
        if (percentage < 33) return 'rgba(231, 76, 60, 0.85)'; // Red
        if (percentage < 50) return 'rgba(241, 196, 15, 0.85)'; // Yellow
        if (percentage < 80) return 'rgba(230, 126, 34, 0.85)'; // Orange
        return 'rgba(46, 204, 113, 0.85)'; // Green
    });

    const borderColors = values.map(val => {
        const percentage = (val / maxMarks) * 100;
        if (percentage < 33) return 'rgba(192, 57, 43, 1)';
        if (percentage < 50) return 'rgba(243, 156, 18, 1)';
        if (percentage < 80) return 'rgba(211, 84, 0, 1)';
        return 'rgba(39, 174, 96, 1)';
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
                    if (value === 0) return;

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
                    ctx.font = 'bold 20px "SolaimanLipi", sans-serif';
                    ctx.fillStyle = labelColor;

                    // Shadow for better readability in both modes
                    if (isDark) {
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                        ctx.shadowBlur = 4;
                        ctx.shadowOffsetX = 1;
                        ctx.shadowOffsetY = 1;
                    } else {
                        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                        ctx.shadowBlur = 3;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    }

                    ctx.fillText(labelText, bar.x, bar.y - 8);
                    ctx.restore();
                });
            });
        }
    };

    const isDarkMode = document.body.classList.contains('dark-mode');
    const textColor = isDarkMode ? '#ffffff' : '#1f2937';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';

    currentHistoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: chartLabel,
                data: values,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1,
                fill: true,
                barPercentage: 0.6,
                borderRadius: 4, // Rounded corners for modern look
                borderSkipped: false, // All corners rounded
            }]
        },
        plugins: [dataLabelsPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 30
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
