/**
 * Chart Management Module
 */

import {
    createPerformanceChart,
    createHistoryChart,
    downloadHighResChart,
    getCurrentChart
} from '../chartModule.js';
import { state } from './state.js';

export function initializeMainChart(canvas, data, options) {
    if (!canvas) return null;
    return createPerformanceChart(canvas, data, options);
}

export function initializeHistoryChart(canvas, history, options) {
    if (!canvas) return null;
    return createHistoryChart(canvas, history, options);
}

export function handleChartDownload(filename) {
    const chart = getCurrentChart();
    if (chart) {
        downloadHighResChart(filename);
        return true;
    }
    return false;
}

export function updateChartTheme() {
    // Logic to refresh charts when theme changes
    // This typically involves re-running updateViews which will call the render logic
}
