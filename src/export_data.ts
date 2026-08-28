import * as vscode from 'vscode';
import * as path from 'path';

// ============ Dialogue export ============

/**
 * Exported dialogue item.
 */
interface ExportedDialogue {
	id: string;              // Unique ID (generated automatically)
	type: 'character' | 'narration' | 'choice';  // Type
	speaker?: string;        // Speaker name (only for type='character')
	text: string;            // Text content (tags removed)
	rawText: string;         // Original text (tags preserved)
	line: number;            // Line number
	tags: string[];          // Included tags
	hasInlineCode: boolean;  // Whether inline code is present ({{}} / [if], etc.)
}

/**
 * Dialogue exporter.
 */
export class DialogueExporter {
	/**
	 * Export all dialogue from the current document.
	 */
	static exportDialogues(document: vscode.TextDocument): ExportedDialogue[] {
		const dialogues: ExportedDialogue[] = [];
		const lines = document.getText().split('\n');

		let idCounter = 1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();

			// ✅ Skip blank lines and comments.
			if (!trimmedLine || trimmedLine.startsWith('#')) {
				continue;
			}

			// ✅ Skip control statements.
			if (this.isControlStatement(trimmedLine)) {
				continue;
			}

			// ✅ Parse character dialogue.
			const characterMatch = trimmedLine.match(/^(\w+|\?\?\?)\s*:\s*(.+)$/);
			if (characterMatch) {
				const speaker = characterMatch[1];
				const rawText = characterMatch[2];

				const dialogue = this.parseDialogueText(rawText, i + 1, idCounter++, 'character');
				dialogue.speaker = speaker;

				dialogues.push(dialogue);
				continue;
			}

			// ✅ Parse narration (text lines that are not character dialogue).
			if (this.isNarrationLine(trimmedLine)) {
				const dialogue = this.parseDialogueText(trimmedLine, i + 1, idCounter++, 'narration');
				dialogues.push(dialogue);
				continue;
			}

			// ✅ Parse choices.
			const choiceMatch = trimmedLine.match(/^-\s*(.+?)(?:\s*=>|\s*=)/);
			if (choiceMatch) {
				const choiceText = choiceMatch[1];
				const dialogue = this.parseDialogueText(choiceText, i + 1, idCounter++, 'choice');
				dialogues.push(dialogue);
				continue;
			}
		}

		console.log(`[Dialogue] ✅ Exported ${dialogues.length} dialogue entries`);
		return dialogues;
	}

	/**
	 * Parse dialogue text.
	 */
	private static parseDialogueText(
		rawText: string,
		lineNumber: number,
		id: number,
		type: 'character' | 'narration' | 'choice'
	): ExportedDialogue {
		// ✅ Extract all tags.
		const tags: string[] = [];
		const tagRegex = /\[([^\]]+)\]/g;
		let match;

		while ((match = tagRegex.exec(rawText)) !== null) {
			const tagContent = match[1];

			// Skip inline code tags.
			if (this.isInlineCodeTag(tagContent)) {
				continue;
			}

			tags.push(tagContent);
		}

		// ✅ Remove tags and inline code to obtain plain text.
		let cleanText = rawText;

		// Remove tags while preserving their enclosed text.
		cleanText = cleanText.replace(/\[(?:wait|speed|pause|p|sound|voice|br|signal|next|auto|jump)(?:=[^\]]+)?\]/g, '');
		cleanText = cleanText.replace(/\[\/?(wave|shake|rainbow|ghost|pulse|b|i|u|s|code|center|right|color|font|size)\]/g, '');
		cleanText = cleanText.replace(/\[#[^\]]+\]/g, '');  // Remove metadata tags.
		cleanText = cleanText.replace(/\[ID:[^\]]+\]/g, ''); // Remove ID tags.

		// Remove inline conditions while preserving their text.
		cleanText = cleanText.replace(/\[if\s+[^\]]+\]\s*/g, '');
		cleanText = cleanText.replace(/\[elif\s+[^\]]+\]\s*/g, '');
		cleanText = cleanText.replace(/\[else\]\s*/g, '');

		// Remove inline set/do.
		cleanText = cleanText.replace(/\[set\s+[^\]]+\]\s*/g, '');
		cleanText = cleanText.replace(/\[do!?\s+[^\]]+\]\s*/g, '');

		// Expand variable interpolation while preserving placeholders.
		cleanText = cleanText.replace(/\{\{([^}]+)\}\}/g, '{$1}');

		// Expand random options by selecting the first option.
		cleanText = cleanText.replace(/\[\[([^\]|]+)(?:\|[^\]]+)*\]\]/g, '$1');

		// Normalize excess whitespace.
		cleanText = cleanText.replace(/\s+/g, ' ').trim();

		// ✅ Check whether inline code is present.
		const hasInlineCode = /\{\{[^}]+\}\}|\[(?:if|elif|else|set|do)\s+[^\]]*\]/.test(rawText);

		return {
			id: `DLG_${id.toString().padStart(4, '0')}`,
			type: type,
			text: cleanText,
			rawText: rawText,
			line: lineNumber,
			tags: tags,
			hasInlineCode: hasInlineCode
		};
	}

	/**
	 * Check whether a line is a control statement.
	 */
	private static isControlStatement(line: string): boolean {
		const patterns = [
			/^~\s*/,                          // Title
			/^=>/,                             // goto
			/^import\s+/,                      // import
			/^using\s+/,                       // using
			/^(?:if|elif|else|while)\s+/,     // Control flow
			/^(?:do|set)\s+/,                  // Mutations
		];

		return patterns.some(p => p.test(line));
	}

	/**
	 * Check whether a line is narration.
	 */
	private static isNarrationLine(line: string): boolean {
		// It has no colon, or the text before the colon is not a word.
		return !/^\w+\s*:/.test(line);
	}

	/**
	 * Check whether a tag contains inline code.
	 */
	private static isInlineCodeTag(tagContent: string): boolean {
		return /^(?:if|elif|else|set|do!?)\s+/.test(tagContent);
	}

	/**
	 * Generate a JSON string.
	 */
	static generateJSON(dialogues: ExportedDialogue[], format: 'pretty' | 'compact'): string {
		if (format === 'pretty') {
			return JSON.stringify(dialogues, null, 2);
		} else {
			return JSON.stringify(dialogues);
		}
	}

	/**
	 * Generate a CSV string.
	 */
	static generateCSV(dialogues: ExportedDialogue[]): string {
		const header = 'ID,Type,Speaker,Text,Raw Text,Line,Tags,Inline Code\n';

		const rows = dialogues.map(d => {
			const speaker = d.speaker || '';
			const tags = d.tags.join('; ');
			const hasCode = d.hasInlineCode ? 'Yes' : 'No';

			// ✅ Escape CSV values (commas and quotes).
			const escapeCSV = (str: string) => {
				if (str.includes(',') || str.includes('"') || str.includes('\n')) {
					return `"${str.replace(/"/g, '""')}"`;
				}
				return str;
			};

			return [
				d.id,
				d.type,
				speaker,
				escapeCSV(d.text),
				escapeCSV(d.rawText),
				d.line.toString(),
				escapeCSV(tags),
				hasCode
			].join(',');
		});

		return header + rows.join('\n');
	}

	/**
	 * Generate a Markdown table.
	 */
	static generateMarkdown(dialogues: ExportedDialogue[]): string {
		const header = '| ID | Type | Speaker | Text | Line | Tags |\n|---|---|---|---|---|---|\n';

		const rows = dialogues.map(d => {
			const speaker = d.speaker || '-';
			const tags = d.tags.length > 0 ? d.tags.map(t => `\`${t}\``).join(', ') : '-';
			const text = d.text.replace(/\|/g, '\\|');  // Escape pipe characters.

			return `| ${d.id} | ${d.type} | ${speaker} | ${text} | ${d.line} | ${tags} |`;
		});

		return header + rows.join('\n');
	}
}

/**
 * Register export commands.
 */
export function registerExportCommands(context: vscode.ExtensionContext) {
	// ✅ Command 1: export as JSON (show a picker).
	const exportJSONCommand = vscode.commands.registerCommand(
		'dialogue.exportJSON',
		async () => {
			const editor = vscode.window.activeTextEditor;

			if (!editor || editor.document.languageId !== 'dialogue') {
				vscode.window.showErrorMessage('Open a .dialogue file first');
				return;
			}

			console.log('[Dialogue] ========== Starting dialogue export ==========');

			// ✅ Export dialogue.
			const dialogues = DialogueExporter.exportDialogues(editor.document);

			if (dialogues.length === 0) {
				vscode.window.showWarningMessage('The current file has no dialogue to export');
				return;
			}

			// ✅ Choose the export format.
			const format = await vscode.window.showQuickPick(
				[
					{ label: 'JSON (Pretty)', value: 'json-pretty', description: 'Easy to read and edit' },
					{ label: 'JSON (Compact)', value: 'json-compact', description: 'Smaller and suited for programs' },
					{ label: 'CSV', value: 'csv', description: 'Can be opened in Excel' },
					{ label: 'Markdown', value: 'markdown', description: 'Table format' }
				],
				{
					placeHolder: 'Select an export format'
				}
			);

			if (!format) return;

			let content: string;
			let fileExtension: string;

			switch (format.value) {
				case 'json-pretty':
					content = DialogueExporter.generateJSON(dialogues, 'pretty');
					fileExtension = 'json';
					break;
				case 'json-compact':
					content = DialogueExporter.generateJSON(dialogues, 'compact');
					fileExtension = 'json';
					break;
				case 'csv':
					content = DialogueExporter.generateCSV(dialogues);
					fileExtension = 'csv';
					break;
				case 'markdown':
					content = DialogueExporter.generateMarkdown(dialogues);
					fileExtension = 'md';
					break;
				default:
					return;
			}

			// ✅ Choose the save location.
			const currentFileName = path.basename(editor.document.fileName, '.dialogue');
			const defaultFileName = `${currentFileName}_export.${fileExtension}`;

			const saveUri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(
					path.join(path.dirname(editor.document.fileName), defaultFileName)
				),
				filters: {
					[format.label]: [fileExtension]
				}
			});

			if (!saveUri) return;

			// ✅ Write the file.
			await vscode.workspace.fs.writeFile(
				saveUri,
				Buffer.from(content, 'utf-8')
			);

			vscode.window.showInformationMessage(
				`✅ Exported ${dialogues.length} dialogue entries to ${path.basename(saveUri.fsPath)}`
			);

			// ✅ Ask whether to open the file.
			const openFile = await vscode.window.showInformationMessage(
				'Open the exported file?',
				'Open',
				'Cancel'
			);

			if (openFile === 'Open') {
				const doc = await vscode.workspace.openTextDocument(saveUri);
				await vscode.window.showTextDocument(doc);
			}
		}
	);

	// ✅ Command 2: quick preview (show JSON in a new tab).
	const previewJSONCommand = vscode.commands.registerCommand(
		'dialogue.previewJSON',
		async () => {
			const editor = vscode.window.activeTextEditor;

			if (!editor || editor.document.languageId !== 'dialogue') {
				vscode.window.showErrorMessage('Open a .dialogue file first');
				return;
			}

			const dialogues = DialogueExporter.exportDialogues(editor.document);

			if (dialogues.length === 0) {
				vscode.window.showWarningMessage('The current file has no dialogue to export');
				return;
			}

			// ✅ Show in a new tab.
			const content = DialogueExporter.generateJSON(dialogues, 'pretty');
			const doc = await vscode.workspace.openTextDocument({
				content: content,
				language: 'json'
			});

			await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
		}
	);

	// ✅ Command 3: copy to the clipboard.
	const copyJSONCommand = vscode.commands.registerCommand(
		'dialogue.copyJSON',
		async () => {
			const editor = vscode.window.activeTextEditor;

			if (!editor || editor.document.languageId !== 'dialogue') {
				vscode.window.showErrorMessage('Open a .dialogue file first');
				return;
			}

			const dialogues = DialogueExporter.exportDialogues(editor.document);

			if (dialogues.length === 0) {
				vscode.window.showWarningMessage('The current file has no dialogue to export');
				return;
			}

			const content = DialogueExporter.generateJSON(dialogues, 'pretty');
			await vscode.env.clipboard.writeText(content);

			vscode.window.showInformationMessage(
				`✅ Copied ${dialogues.length} dialogue entries to the clipboard`
			);
		}
	);

	context.subscriptions.push(
		exportJSONCommand,
		previewJSONCommand,
		copyJSONCommand
	);
}