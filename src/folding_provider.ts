import * as vscode from 'vscode';

export class DialogueFoldingProvider implements vscode.FoldingRangeProvider {
	provideFoldingRanges(
		document: vscode.TextDocument,
		context: vscode.FoldingContext,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.FoldingRange[]> {
		const ranges: vscode.FoldingRange[] = [];
		const lineCount = document.lineCount;

		let currentTitleLine = -1;
		const regionStack: number[] = [];

		// Regex: match #region and #endregion (case-insensitive, allowing spaces).
		const regionStartRegex = /^#\s*region\b/i;
		const regionEndRegex = /^#\s*endregion\b/i;

		for (let i = 0; i < lineCount; i++) {
			const lineText = document.lineAt(i).text;
			const trimmed = lineText.trim();

			// ✅ 1. Process title folding (~ title).
			if (trimmed.startsWith('~ ')) {
				// Finish the previously tracked title first.
				if (currentTitleLine !== -1) {
					const endLine = this.findLastGotoBeforeLine(document, currentTitleLine, i);
					if (endLine > currentTitleLine) {
						ranges.push(new vscode.FoldingRange(currentTitleLine, endLine, vscode.FoldingRangeKind.Region));
					}
				}
				// Start tracking the new title.
				currentTitleLine = i;
			}

			// ✅ 2. Process custom region folding (#region / #endregion).
			if (regionStartRegex.test(trimmed)) {
				regionStack.push(i);
			} else if (regionEndRegex.test(trimmed)) {
				const startLine = regionStack.pop();
				if (startLine !== undefined) {
					ranges.push(new vscode.FoldingRange(startLine, i, vscode.FoldingRangeKind.Region));
				}
			}
		}

		// ✅ Process the final title fold at the end of the file.
		if (currentTitleLine !== -1) {
			const endLine = this.findLastGotoBeforeLine(document, currentTitleLine, lineCount);
			if (endLine > currentTitleLine) {
				ranges.push(new vscode.FoldingRange(currentTitleLine, endLine, vscode.FoldingRangeKind.Region));
			}
		}

		return ranges;
	}

	/**
	 * Find the last => marker between startLine and beforeLine.
	 * @param document Document object.
	 * @param startLine Starting line (the title definition line).
	 * @param beforeLine Ending line (the next title's line or the end of the file).
	 * @returns The line containing the last =>, or beforeLine - 1 when none is found.
	 */
	private findLastGotoBeforeLine(
		document: vscode.TextDocument,
		startLine: number,
		beforeLine: number
	): number {
		let lastGotoLine = -1;

		// Scan from the line after the title definition up to beforeLine.
		for (let i = startLine + 1; i < beforeLine; i++) {
			const lineText = document.lineAt(i).text;
			const trimmed = lineText.trim();

			// ✅ Match => markers.
			// Supported formats:
			// => END
			// => next_scene
			// - option => target
			//   => target (indented)
			if (/^\s*(?:-[^=>]*)?=>\s*\S+/.test(lineText)) {
				lastGotoLine = i; // Record this => position and continue searching.
			}
		}

		// Fold to the last => line when found; otherwise fold to beforeLine - 1.
		return lastGotoLine !== -1 ? lastGotoLine : beforeLine - 1;
	}
}