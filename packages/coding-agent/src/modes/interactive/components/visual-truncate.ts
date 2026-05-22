/**
 * Shared utility for truncating text to visual lines (accounting for line wrapping).
 * Used by both tool-execution.ts and bash-execution.ts for consistent behavior.
 */

import { Text, visibleWidth } from "@earendil-works/pi-tui";

export interface VisualTruncateResult {
	/** The visual lines to display */
	visualLines: string[];
	/** Number of visual lines that were skipped (hidden) */
	skippedCount: number;
}

/**
 * Truncate text to a maximum number of visual lines (from the end).
 * This accounts for line wrapping based on terminal width.
 *
 * @param text - The text content (may contain newlines)
 * @param maxVisualLines - Maximum number of visual lines to show
 * @param width - Terminal/render width
 * @param paddingX - Horizontal padding for Text component (default 0).
 *                   Use 0 when result will be placed in a Box (Box adds its own padding).
 *                   Use 1 when result will be placed in a plain Container.
 * @returns The truncated visual lines and count of skipped lines
 */
export function truncateToVisualLines(
	text: string,
	maxVisualLines: number,
	width: number,
	paddingX: number = 0,
): VisualTruncateResult {
	if (!text) {
		return { visualLines: [], skippedCount: 0 };
	}

	const rawLines = text.split("\n");

	// Fast path: output is small — render everything, nothing to skip.
	if (rawLines.length <= maxVisualLines) {
		const tempText = new Text(text, paddingX, 0);
		return { visualLines: tempText.render(width), skippedCount: 0 };
	}

	// Walk backwards through raw lines, estimating the wrapped row count per
	// line via visibleWidth() (cheap: strips ANSI codes, measures chars) rather
	// than fully rendering. Stop once we've collected enough visual rows.
	//
	// This changes the cost from O(total_lines) — render everything, discard
	// most — to O(selected_lines), which for BASH_PREVIEW_LINES = 5 means we
	// typically touch ~5 raw lines regardless of total output size.
	const contentWidth = Math.max(1, width - paddingX * 2);
	let rowsBudget = maxVisualLines;
	let startIdx = rawLines.length;

	while (startIdx > 0 && rowsBudget > 0) {
		startIdx--;
		const lineW = visibleWidth(rawLines[startIdx]);
		const rowsThisLine = lineW === 0 ? 1 : Math.ceil(lineW / contentWidth);
		// Clamp: a single long raw line can't consume more rows than the budget.
		rowsBudget -= Math.min(rowsThisLine, rowsBudget);
	}

	// Count visual rows in the skipped prefix so the "N earlier lines" hint
	// reports terminal rows rather than raw line count (which under-counts when
	// lines wrap).
	let skippedVisualRows = 0;
	for (let i = 0; i < startIdx; i++) {
		const lineW = visibleWidth(rawLines[i]);
		skippedVisualRows += lineW === 0 ? 1 : Math.ceil(lineW / contentWidth);
	}
	const skippedCount = skippedVisualRows;

	// Render only the selected tail — cost is now proportional to displayed
	// lines, not total output size.
	const tempText = new Text(rawLines.slice(startIdx).join("\n"), paddingX, 0);
	const visualLines = tempText.render(width);

	// Safety clamp: visibleWidth() estimates can disagree with Text.render()'s
	// actual wrapping (e.g. when ANSI sequences affect layout), so the rendered
	// tail can occasionally exceed maxVisualLines.
	return {
		visualLines: visualLines.length > maxVisualLines ? visualLines.slice(-maxVisualLines) : visualLines,
		skippedCount,
	};
}
