import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Title information
 */
export interface TitleInfo {
	name: string;           // Title name (for example "start")
	fullName: string;       // Full name (for example "a1/start", with an alias across files)
	line: number;           // Line number
	uri: vscode.Uri;        // File URI
	comment?: string;       // Preceding comment
	alias?: string;         // Owning file alias (across files)
	preview?: string;       // First dialogue line preview
}

/**
 * Title manager (supports cross-file titles)
 */
export class TitleManager {
	private titles: Map<string, TitleInfo[]> = new Map();
	private importedTitles: Map<string, TitleInfo[]> = new Map();

	/**
	 * Scan all titles in a document.
	 */
	public scanDocument(document: vscode.TextDocument): void {
		const titles: TitleInfo[] = [];
		const lines = document.getText().split('\n');

		let pendingComment: string | undefined;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// ✅ Collect all comments, including # and ##.
			if (trimmed.startsWith('#')) {
				// Extract comment text after the leading # or ##.
				const commentText = trimmed.replace(/^#+\s*/, '');

				if (pendingComment) {
					pendingComment += '\n' + commentText;
				} else {
					pendingComment = commentText;
				}
				continue;
			}

			// Match title declarations.
			const titleMatch = trimmed.match(/^~\s+([^\s]+!?)/);
			if (titleMatch) {
				const titleName = titleMatch[1];

				// Get a preview.
				const preview = this.getTitlePreview(lines, i + 1);

				titles.push({
					name: titleName,
					fullName: titleName,
					line: i,
					uri: document.uri,
					comment: pendingComment,  // ✅ Includes all comments above the title.
					preview: preview
				});

				pendingComment = undefined;
				continue;
			}

			// Clear pending comments after other content.
			if (trimmed && !trimmed.startsWith('#')) {
				pendingComment = undefined;
			}
		}

		this.titles.set(document.uri.toString(), titles);
		console.log(`[Dialogue] ✅ Scanned ${path.basename(document.uri.fsPath)}; found ${titles.length} titles`);

		this.scanImportedTitles(document);
	}

	/**
	 * Get the first dialogue line as a title preview.
	 */
	private getTitlePreview(lines: string[], startLine: number): string | undefined {
		// Find dialogue starting after the title declaration.
		for (let i = startLine; i < Math.min(startLine + 10, lines.length); i++) {
			const line = lines[i].trim();

			// Skip blank lines and comments.
			if (!line || line.startsWith('#')) continue;

			// Match narration, not choices.
			if (!line.startsWith('-')) {
				let content = line;

				if (content.length > 50) {
					content = content.substring(0, 50) + '...';
				}
				return content;
			}
		}

		return undefined;
	}

	/**
	 * Scan titles in imported files.
	 */
	private scanImportedTitles(document: vscode.TextDocument): void {
		const importedTitles: TitleInfo[] = [];
		const lines = document.getText().split('\n');
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

		if (!workspaceFolder) return;

		for (const line of lines) {
			const importMatch = line.match(/^\s*import\s+"(res:\/\/[^"]+)"\s+as\s+([^\s]+)/);
			if (!importMatch) continue;

			const [, resPath, alias] = importMatch;

			const fsPath = path.join(
				workspaceFolder.uri.fsPath,
				resPath.replace('res://', '')
			);

			if (!fs.existsSync(fsPath)) {
				console.log(`[Dialogue] ⚠️ Imported file does not exist: ${fsPath}`);
				continue;
			}

			const importedContent = fs.readFileSync(fsPath, 'utf-8');
			const importedLines = importedContent.split('\n');
			const importedUri = vscode.Uri.file(fsPath);

			// ✅ Collect comments in imported files too.
			let pendingComment: string | undefined;

			for (let i = 0; i < importedLines.length; i++) {
				const importedLine = importedLines[i];
				const trimmed = importedLine.trim();

				// Collect comments.
				if (trimmed.startsWith('#')) {
					const commentText = trimmed.replace(/^#+\s*/, '');
					if (pendingComment) {
						pendingComment += '\n' + commentText;
					} else {
						pendingComment = commentText;
					}
					continue;
				}

				const titleMatch = trimmed.match(/^~\s+([^\s]+!?)/);

				if (titleMatch) {
					const titleName = titleMatch[1];

					// Get a preview from the imported file.
					const preview = this.getTitlePreview(importedLines, i + 1);

					importedTitles.push({
						name: titleName,
						fullName: `${alias}/${titleName}`,
						line: i,
						uri: importedUri,
						alias: alias,
						comment: pendingComment,  // ✅ Includes comments.
						preview: preview
					});

					pendingComment = undefined;
					console.log(`[Dialogue] 📦 Imported title: ${alias}/${titleName}`);
				}

				// Clear comments.
				if (trimmed && !trimmed.startsWith('#') && !titleMatch) {
					pendingComment = undefined;
				}
			}
		}

		this.importedTitles.set(document.uri.toString(), importedTitles);
		console.log(`[Dialogue] ✅ Imported ${importedTitles.length} cross-file titles`);
	}

	// ... Other methods remain unchanged ...

	public getTitles(documentUri: vscode.Uri): TitleInfo[] {
		const localTitles = this.titles.get(documentUri.toString()) || [];
		const importedTitles = this.importedTitles.get(documentUri.toString()) || [];

		return [...localTitles, ...importedTitles];
	}

	public findTitle(documentUri: vscode.Uri, titleName: string): TitleInfo | undefined {
		const allTitles = this.getTitles(documentUri);

		const exactMatch = allTitles.find(t => t.fullName === titleName);
		if (exactMatch) return exactMatch;

		return allTitles.find(t => t.name === titleName);
	}

	public clearDocument(documentUri: vscode.Uri): void {
		this.titles.delete(documentUri.toString());
		this.importedTitles.delete(documentUri.toString());
	}
}


// ============ Title navigation completion provider ============

export class TitleCompletionProvider implements vscode.CompletionItemProvider {
	constructor(private titleManager: TitleManager) { }

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.CompletionItem[]> {
		const line = document.lineAt(position.line).text;
		const beforeCursor = line.substring(0, position.character);

		console.log('[Dialogue] ========== Title completion triggered ==========');

		// Check after => or =.
		const gotoMatch = beforeCursor.match(/(?:^|\s)(=>)(\s*)([^\s]*)$/);
		if (!gotoMatch) {
			console.log('[Dialogue] ⚠️ Not in a => context');
			return [];
		}

		const operator = gotoMatch[1];
		const spaceAfter = gotoMatch[2];
		const partialInput = gotoMatch[3];

		console.log(`[Dialogue] 📝 Operator: "${operator}", spaces: "${spaceAfter}", entered: "${partialInput}"`);

		const needsSpace = spaceAfter === '';
		const prefix = needsSpace ? ' ' : '';

		console.log(`[Dialogue] ${needsSpace ? '✅ A space is needed' : '❌ Space already present'}`);

		const titles = this.titleManager.getTitles(document.uri);

		const items: vscode.CompletionItem[] = [];

		// Add the special END markers.
		const endItem = new vscode.CompletionItem('END', vscode.CompletionItemKind.Keyword);
		endItem.detail = '🛑 End dialogue';
		endItem.documentation = new vscode.MarkdownString('**End the current dialogue flow**');
		endItem.insertText = `${prefix}END`;
		endItem.sortText = '0_END';
		items.push(endItem);

		const endForceItem = new vscode.CompletionItem('END!', vscode.CompletionItemKind.Keyword);
		endForceItem.detail = '🛑 Force-end dialogue';
		endForceItem.documentation = new vscode.MarkdownString('**Force-end dialogue (ignore subsequent logic)**');
		endForceItem.insertText = `${prefix}END!`;
		endForceItem.sortText = '0_END!';
		items.push(endForceItem);

		// ✅ Add all titles with previews.
		for (const title of titles) {
			const item = new vscode.CompletionItem(
				title.fullName,
				vscode.CompletionItemKind.Reference
			);

			// Distinguish local and imported titles.
			if (title.alias) {
				item.detail = `📦 ${title.alias} (imported)`;
			} else {
				item.detail = `📍 ${title.fullName}`;
			}

			const docs: string[] = [];
			docs.push(`### ${title.fullName}`);

			// ✅ Add the preview.
			if (title.preview) {
				docs.push('');
				docs.push('**Preview:** `' + title.preview + '`');
			}

			if (title.comment) {
				docs.push('');
				docs.push('**Description:**');
				docs.push(title.comment);
			}

			if (title.alias) {
				docs.push('');
				docs.push(`**Source:** \`${path.basename(title.uri.fsPath)}\``);
			} else {
				docs.push('');
				docs.push(`**Location:** line ${title.line + 1}`);
			}

			item.documentation = new vscode.MarkdownString(docs.join('\n'));
			item.insertText = `${prefix}${title.fullName}`;
			item.sortText = title.alias ? `2_${title.fullName}` : `1_${title.fullName}`;

			items.push(item);
		}

		console.log(`[Dialogue] 📦 Returning ${items.length} title completion items`);
		return items;
	}
}

// ============ Title hover provider ============

export class TitleHoverProvider implements vscode.HoverProvider {
	constructor(private titleManager: TitleManager) { }

	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.Hover | undefined> {
		const line = document.lineAt(position.line).text;

		// Match => xxx or - xxx => yyy.
		const gotoMatch = line.match(/(?:^|\s)(?:=>|=)\s+([^\s]+!?)/);
		if (!gotoMatch) return undefined;

		const titleNameWithBang = gotoMatch[1];
		const titleStart = line.indexOf(titleNameWithBang);
		const titleEnd = titleStart + titleNameWithBang.length;

		if (position.character < titleStart || position.character > titleEnd) {
			return undefined;
		}

		const hasInstantJump = titleNameWithBang.endsWith('!');
		const titleName = hasInstantJump
			? titleNameWithBang.slice(0, -1)
			: titleNameWithBang;

		// Handle END and END! specially.
		if (titleName === 'END') {
			const docs: string[] = [];

			docs.push(hasInstantJump ? '### 🛑 END!' : '### 🛑 END');
			docs.push('');

			if (hasInstantJump) {
				docs.push('**Force-end the dialogue immediately**');
				docs.push('');
				docs.push('Immediately terminate the dialogue, skipping all subsequent logic and cleanup code.');
			} else {
				docs.push('**End the current dialogue flow**');
				docs.push('');
				docs.push('The dialogue ends normally and triggers the `dialogue_ended` signal.');
			}
			docs.push('');
			docs.push('---');
			docs.push('');
			docs.push('💡 **Note:** This is a special built-in marker; no title definition is required.');
			return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
		}

		// Find a regular title.
		const title = this.titleManager.findTitle(document.uri, titleName);
		if (title) {
			const docs: string[] = [];
			docs.push(`### 📍 ${title.fullName}`);

			docs.push('');
			docs.push('**Type:** Dialogue title');

			// ✅ Add the preview.
			if (title.preview) {
				docs.push('');
				docs.push('**Preview:** `' + title.preview + '`');
			}

			if (title.comment) {
				docs.push('');
				docs.push('**Description:**');
				docs.push(title.comment);
			}

			if (title.alias) {
				docs.push('');
				docs.push(`**Source:** \`${path.basename(title.uri.fsPath)}\` (Alias: \`${title.alias}\`)`);
			} else {
				docs.push('');
				docs.push(`**Location:** line ${title.line + 1}`);
			}

			docs.push('');
			docs.push('---');
			docs.push('');
			docs.push('💡 **Note:** Use `Ctrl + Click` to navigate to the definition.');

			return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
		}

		return undefined;
	}
}

// ============ Title definition provider (unchanged) ============

export class TitleDefinitionProvider implements vscode.DefinitionProvider {
	constructor(private titleManager: TitleManager) { }

	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.Definition | undefined> {
		const line = document.lineAt(position.line).text;

		const gotoMatch = line.match(/(?:^|\s)(?:=>|=)\s+([^\s]+!?)/);
		if (!gotoMatch) return undefined;

		const titleNameWithBang = gotoMatch[1];
		const titleStart = line.indexOf(titleNameWithBang);
		const titleEnd = titleStart + titleNameWithBang.length;

		if (position.character < titleStart || position.character > titleEnd) {
			return undefined;
		}

		const titleName = titleNameWithBang.endsWith('!')
			? titleNameWithBang.slice(0, -1)
			: titleNameWithBang;

		if (titleName === 'END') {
			console.log(`[Dialogue] 💡 ${titleNameWithBang} is a built-in marker; no navigation needed`);
			return undefined;
		}

		const title = this.titleManager.findTitle(document.uri, titleName);
		if (!title) {
			console.log(`[Dialogue] ⚠️ Title not found: ${titleName}`);
			return undefined;
		}

		console.log(`[Dialogue] ✅ Navigating to title: ${title.fullName} (${title.uri.fsPath}:${title.line})`);
		const targetPosition = new vscode.Position(title.line, 0);
		return new vscode.Location(title.uri, targetPosition);
	}
}