// ============ Import path completion provider ============

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ============ Enhanced Import completion provider ============

/**
 * Recursively search all .dialogue files.
 */
interface DialogueFileInfo {
	relativePath: string;  // Path relative to the workspace.
	resPath: string;       // res:// path.
	fileName: string;      // File name (without the extension).
	fullPath: string;      // Full file-system path.
	depth: number;         // Directory depth.
}


/**
 * Import statement completion provider (enhanced).
 */
export class ImportPathCompletionProvider implements vscode.CompletionItemProvider {
	private dialogueFiles: DialogueFileInfo[] = [];
	private workspaceFolder?: vscode.WorkspaceFolder;

	constructor(workspaceFolder?: vscode.WorkspaceFolder) {
		this.workspaceFolder = workspaceFolder;
		
		// ✅ Scan all .dialogue files during initialization.
		if (workspaceFolder) {
			this.scanDialogueFiles();
		}
	}

	/**
	 * Scan all .dialogue files in the workspace.
	 */
	private scanDialogueFiles(): void {
		if (!this.workspaceFolder) return;

		console.log('[Dialogue] 🔍 Scanning .dialogue files...');

		this.dialogueFiles = [];
		const rootPath = this.workspaceFolder.uri.fsPath;

		this.scanDirectory(rootPath, '', 0);

		console.log(`[Dialogue] ✅ Found ${this.dialogueFiles.length} .dialogue files`);
	}

	/**
	 * Recursively scan directories.
	 */
	private scanDirectory(absolutePath: string, relativePath: string, depth: number): void {
		// ✅ Limit recursion depth to avoid performance issues.
		if (depth > 10) return;

		// ✅ Skip hidden and special directories.
		const skipDirs = ['.godot', '.git', 'node_modules', 'addons'];
		const dirName = path.basename(absolutePath);
		
		if (dirName.startsWith('.') || skipDirs.includes(dirName)) {
			return;
		}

		try {
			const entries = fs.readdirSync(absolutePath, { withFileTypes: true });

			for (const entry of entries) {
				const entryAbsolutePath = path.join(absolutePath, entry.name);
				const entryRelativePath = relativePath 
					? path.join(relativePath, entry.name)
					: entry.name;

				if (entry.isDirectory()) {
					// Recursively scan subdirectories.
					this.scanDirectory(entryAbsolutePath, entryRelativePath, depth + 1);
				} else if (entry.isFile() && entry.name.endsWith('.dialogue')) {
					// Add the .dialogue file.
					const resPath = 'res://' + entryRelativePath.replace(/\\/g, '/');
					const fileName = entry.name.replace('.dialogue', '');

					this.dialogueFiles.push({
						relativePath: entryRelativePath,
						resPath: resPath,
						fileName: fileName,
						fullPath: entryAbsolutePath,
						depth: depth
					});
				}
			}
		} catch (error) {
			console.error(`[Dialogue] ❌ Failed to scan directory: ${absolutePath}`, error);
		}
	}

  async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	): Promise<vscode.CompletionItem[]> {
		const line = document.lineAt(position.line).text;
		const beforeCursor = line.substring(0, position.character);

		console.log('[Dialogue] ========== Import completion triggered ==========');
		console.log('[Dialogue] 📝 Text before cursor:', beforeCursor);

		// ✅ Strict check: the line must start with an import statement.
		if (!/^\s*import\b/.test(line)) {
			console.log('[Dialogue] ⚠️ Not an import statement; skipping');
			return [];
		}

		// ✅ Scenario 1: import was just entered (possibly followed by spaces).
		if (/^\s*import\s*$/.test(beforeCursor)) {
			console.log('[Dialogue] 💡 Import detected; showing all .dialogue files');
			return this.provideAllDialogueFiles();
		}

		// ✅ Scenario 2: entering a path.
		const pathMatch = beforeCursor.match(/^\s*import\s+"(res:\/\/[^"]*)$/);
		if (pathMatch) {
			const currentPath = pathMatch[1];
			console.log('[Dialogue] 📂 Entering path:', currentPath);
			return this.provideFilteredFiles(currentPath);
		}

		// ✅ Scenario 3: path is complete; waiting for as.
		const completedPathMatch = beforeCursor.match(/^\s*import\s+"(res:\/\/[^"]+)"\s*$/);
		if (completedPathMatch) {
			const filePath = completedPathMatch[1];
			console.log('[Dialogue] 💡 Path complete; suggesting as');
			return this.provideAsAliasCompletion(filePath);
		}

		// ✅ Scenario 4: entering an alias.
		const aliasMatch = beforeCursor.match(/^\s*import\s+"(res:\/\/[^"]+)"\s+as\s+(\w*)$/);
		if (aliasMatch) {
			const filePath = aliasMatch[1];
			console.log('[Dialogue] 💡 Entering alias');
			return this.provideAsAliasCompletion(filePath);
		}

		console.log('[Dialogue] ⚠️ Not in an import completion context');
		return [];
	}

	/**
	 * Provide completion items for all .dialogue files.
	 */
	private provideAllDialogueFiles(): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		// ✅ Sort by directory depth (shallow directories first).
		const sortedFiles = [...this.dialogueFiles].sort((a, b) => {
			if (a.depth !== b.depth) return a.depth - b.depth;
			return a.fileName.localeCompare(b.fileName);
		});

		for (const file of sortedFiles) {
			const item = new vscode.CompletionItem(
				file.fileName,
				vscode.CompletionItemKind.File
			);

			// ✅ Generate an alias.
			const alias = this.generateAlias(file.fileName);

			// ✅ Use a snippet to insert the complete import statement.
			item.insertText = new vscode.SnippetString(
				`"${file.resPath}" as \${1:${alias}}`
			);

			// ✅ Show detailed information.
			const pathParts = file.relativePath.split(path.sep);
			const dirPath = pathParts.slice(0, -1).join('/') || 'Root directory';

			item.detail = `📄 ${dirPath}`;
			item.filterText = `${file.fileName} ${file.relativePath}`;  // Support path search.

			// ✅ Documentation.
			const docs: string[] = [];
			docs.push(`## 📄 ${file.fileName}.dialogue`);
			docs.push('');
			docs.push(`**Full path:** \`${file.resPath}\``);
			docs.push(`**Directory:** \`${dirPath}\``);
			docs.push(`**Suggested alias:** \`${alias}\``);
			docs.push('');
			docs.push('---');
			docs.push('');
			docs.push('💡 **Generated automatically:** `import "' + file.resPath + '" as ' + alias + '`');

			item.documentation = new vscode.MarkdownString(docs.join('\n'));

			// ✅ Sort with the root directory first, then by depth.
			item.sortText = `${file.depth}_${file.fileName}`;

			items.push(item);
		}

		console.log(`[Dialogue] 📦 Returning ${items.length} file completion items`);
		return items;
	}

	/**
	 * Provide filtered file completions based on the current path.
	 */
	private provideFilteredFiles(currentPath: string): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		// ✅ Extract the current directory path.
		const pathWithoutProtocol = currentPath.replace('res://', '');
		const currentDir = pathWithoutProtocol.endsWith('/') 
			? pathWithoutProtocol 
			: path.dirname(pathWithoutProtocol) + '/';

		console.log('[Dialogue] 📂 Current directory:', currentDir);

		// ✅ 1. Add subdirectory completions.
		const uniqueDirs = new Set<string>();
		
		for (const file of this.dialogueFiles) {
			const fileDir = path.dirname(file.relativePath).replace(/\\/g, '/') + '/';
			
			// If the file is in a subdirectory of the current directory.
			if (fileDir.startsWith(currentDir) && fileDir !== currentDir) {
				const subDir = fileDir.substring(currentDir.length).split('/')[0];
				
				if (subDir && !uniqueDirs.has(subDir)) {
					uniqueDirs.add(subDir);

					const item = new vscode.CompletionItem(
						subDir,
						vscode.CompletionItemKind.Folder
					);

					const newPath = `res://${currentDir}${subDir}/`;
					item.insertText = newPath;
					item.detail = '📁 Directory';
					item.sortText = `0_${subDir}`;

					items.push(item);
				}
			}
		}

		// ✅ 2. Add files in the current directory.
		for (const file of this.dialogueFiles) {
			const fileDir = path.dirname(file.relativePath).replace(/\\/g, '/') + '/';

			if (fileDir === currentDir) {
				const item = new vscode.CompletionItem(
					file.fileName,
					vscode.CompletionItemKind.File
				);

				const alias = this.generateAlias(file.fileName);

				item.insertText = new vscode.SnippetString(
					`${file.resPath}" as \${1:${alias}}`
				);

				item.detail = '📄 Dialogue file';
				item.documentation = new vscode.MarkdownString(
					`**Path:** \`${file.resPath}\`\n\n**Alias:** \`${alias}\``
				);

				item.sortText = `1_${file.fileName}`;

				items.push(item);
			}
		}

		console.log(`[Dialogue] 📦 Returning ${items.length} filtered completion items`);
		return items;
	}

	/**
	 * Provide as-alias completions.
	 */
	private provideAsAliasCompletion(filePath: string): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		// ✅ Extract the file name from the path.
		const fileName = path.basename(filePath, '.dialogue');
		const alias = this.generateAlias(fileName);

		console.log('[Dialogue] 💡 Suggested alias:', alias);

		// ✅ Create the completion item.
		const item = new vscode.CompletionItem(
			`as ${alias}`,
			vscode.CompletionItemKind.Keyword
		);

		item.insertText = new vscode.SnippetString(`as \${1:${alias}}`);
		item.detail = '📝 Import alias';
		item.documentation = new vscode.MarkdownString(
			`Alias automatically generated from the file name \`${fileName}\`\n\n` +
			`Complete statement:\n\`\`\`dialogue\nimport "${filePath}" as ${alias}\n\`\`\``
		);

		items.push(item);

		return items;
	}

	/**
	 * Generate an alias (PascalCase).
	 */
	private generateAlias(fileName: string): string {
		// Remove the extension.
		const nameWithoutExt = fileName.replace(/\.dialogue$/, '');

		// Split on underscores, hyphens, or spaces.
		const words = nameWithoutExt.split(/[-_\s]/);

		// Convert to PascalCase.
		const pascalCase = words.join('');

		return pascalCase;
	}

	/**
	 * Refresh the file list (called when the file system changes).
	 */
	public refresh(): void {
		console.log('[Dialogue] 🔄 Refreshing .dialogue file list');
		this.scanDialogueFiles();
	}
}


// ============ Import hover provider ============

export class ImportHoverProvider implements vscode.HoverProvider {
	constructor(private workspaceFolder?: vscode.WorkspaceFolder) {}

	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.Hover | undefined> {
		const line = document.lineAt(position.line).text;

		// ✅ Match import statements.
		const importMatch = line.match(/^\s*import\s+"(res:\/\/[^"]+)"\s+as\s+(\w+)/);
		if (!importMatch) return undefined;

		const [, filePath, alias] = importMatch;

		// Check whether the cursor is on the path or alias.
		const pathStart = line.indexOf(filePath);
		const pathEnd = pathStart + filePath.length;
		const aliasStart = line.lastIndexOf(alias);
		const aliasEnd = aliasStart + alias.length;

		const isOnPath = position.character >= pathStart && position.character <= pathEnd;
		const isOnAlias = position.character >= aliasStart && position.character <= aliasEnd;

		if (!isOnPath && !isOnAlias) return undefined;

		// ✅ Get file information.
		if (!this.workspaceFolder) return undefined;

		const fsPath = path.join(
			this.workspaceFolder.uri.fsPath,
			filePath.replace('res://', '')
		);

		if (!fs.existsSync(fsPath)) {
			return new vscode.Hover(
				new vscode.MarkdownString(`⚠️ **File does not exist**\n\nPath: \`${filePath}\``)
			);
		}

		// ✅ Read file information.
		const stat = fs.statSync(fsPath);
		const content = fs.readFileSync(fsPath, 'utf-8');
		const lines = content.split('\n');

		// Count titles.
		const titleCount = lines.filter(line => line.trim().startsWith('~')).length;

		const docs: string[] = [];
		docs.push(`## 📄 ${path.basename(filePath)}`);
		docs.push('');
		docs.push(`**Path:** \`${filePath}\``);
		docs.push(`**Alias:** \`${alias}\``);
		docs.push(`**Size:** ${(stat.size / 1024).toFixed(2)} KB`);
		docs.push(`**Dialogue title count:** ${titleCount}`);
		docs.push('');
		docs.push('---');
		docs.push('');
		docs.push('💡 **Tip:** Use `Ctrl + Click` to open the file');

		return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
	}
}

