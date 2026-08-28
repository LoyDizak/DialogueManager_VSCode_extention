import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { registerExportCommands } from './export_data';
import { ImportHoverProvider, ImportPathCompletionProvider } from './import_file';
import { TitleCompletionProvider, TitleDefinitionProvider, TitleHoverProvider, TitleManager } from './title_manager';
import { registerTagFeatures } from './dialogue_tag';
import { DialogueFoldingProvider } from './folding_provider';
import { GodotClassCache } from './common';
import { GodotCodeActionProvider, GodotDiagnosticProvider } from './error_handler';
import { GodotMethod } from './interface';
import { generateDialogueID } from './utils';

/**
 * Format Godot-style documentation comments.
 * 
 * 输入示例：
 * ```
 * Get slot data.
 * @param slot_id: int Slot ID (1-99)
 * @param include_empty: bool Whether to include empty slots
 * @return Dictionary Slot data
 * ```
 * 
 * 输出示例：
 * ```
 * Get slot data.
 * 
 * **Parameters:**
 * - `slot_id` (int): Slot ID (1-99)
 * - `include_empty` (bool): Whether to include empty slots
 * 
 * **Returns:** Dictionary - 槽位数据
 * ```
 */
function formatGodotDocComment(rawComment: string): string {
	const lines = rawComment.split('\n');
	const formatted: string[] = [];
	const params: string[] = [];
	let returnInfo: string | null = null;
	let description: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();

		// Match @param tags.
		// Format: @param name: Type description
		const paramMatch = trimmed.match(/^@param\s+(\w+)\s*:\s*(\w+)\s+(.+)$/);
		if (paramMatch) {
			const [, paramName, paramType, paramDesc] = paramMatch;
			params.push(`- \`${paramName}\` (${paramType}): ${paramDesc}`);
			continue;
		}

		// Match @return tags.
		// Format: @return Type description
		const returnMatch = trimmed.match(/^@return\s+(\w+)\s+(.+)$/);
		if (returnMatch) {
			const [, returnType, returnDesc] = returnMatch;
			returnInfo = `${returnType} - ${returnDesc}`;
			continue;
		}

		// Treat other lines as descriptions.
		if (trimmed && !trimmed.startsWith('@')) {
			description.push(trimmed);
		}
	}

	// Assemble the formatted documentation.
	if (description.length > 0) {
		formatted.push(description.join('\n'));
		formatted.push('');
	}

	if (params.length > 0) {
		formatted.push('**Parameters:**');
		formatted.push(params.join('\n'));
		formatted.push('');
	}

	if (returnInfo) {
		formatted.push(`**Returns:** ${returnInfo}`);
	}

	return formatted.join('\n').trim();
}



// ============ Extension activation ============

export function activate(context: vscode.ExtensionContext) {
	console.log('[Dialogue] ============ Extension activation started ============');

	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		console.log('[Dialogue] Workspace path:', workspaceFolder.uri.fsPath);
	}

	const classCache = new GodotClassCache(workspaceFolder);
	const titleManager = new TitleManager(); // Added.

	classCache.initialize().then(() => {
		console.log('[Dialogue] Class cache initialized');
	});

	// ============ Register the "Add Dialogue IDs" command ============
	context.subscriptions.push(
		vscode.commands.registerCommand('dialogue.addDialogueIDs', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'dialogue') {
				vscode.window.showWarningMessage('Use this command in a .dialogue file');
				return;
			}

			const document = editor.document;
			const edit = new vscode.WorkspaceEdit();
			let addedCount = 0;

			for (let i = 0; i < document.lineCount; i++) {
				const line = document.lineAt(i);
				const text = line.text;

				// ============ Added: skip all comment lines ============
				if (text.trimStart().startsWith('#')) {
					continue;
				}

				// Identify dialogue lines in the format "Character: Dialogue text".
				// Exclude titles (~), jumps (=>), choices (-), comments (#), and code blocks (do/set/if, etc.).
				const dialoguePattern = /^\s*([^\s]*)\s*:?\s*(.+)$/;
				const match = text.match(dialoguePattern);

				if (!match) continue; // Not a dialogue line.

				// Exclude lines that already have an ID.
				if (/\[ID:[A-F0-9]{12}\]/.test(text)) {
					continue;
				}

				// Exclude lines beginning with special keywords (such as if: or set:).
				const speaker = match[1];
				if (['~', '=>', 'if', 'elif', 'else', 'do', 'set', 'while', 'match', 'when'].includes(speaker.toLowerCase())) {
					continue;
				}

				// Generate a 12-character hexadecimal ID.
				const id = generateDialogueID();

				// Insert the ID at the end of the line.
				const endPosition = line.range.end;
				edit.insert(document.uri, endPosition, ` [ID:${id}]`);
				addedCount++;
			}

			if (addedCount === 0) {
				vscode.window.showInformationMessage('No dialogue lines found that need IDs');
				return;
			}

			// Apply the edit.
			await vscode.workspace.applyEdit(edit);
			vscode.window.showInformationMessage(`✅ Added IDs to ${addedCount} dialogue lines`);
		})
	);

	// ============ Added: register the "Remove Dialogue IDs" command ============
	context.subscriptions.push(
		vscode.commands.registerCommand('dialogue.removeDialogueIDs', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'dialogue') {
				vscode.window.showWarningMessage('Use this command in a .dialogue file');
				return;
			}
			const document = editor.document;
			const edit = new vscode.WorkspaceEdit();
			let removedCount = 0;
			// Match [ID:XXXXXXXXXXXX] (supports hexadecimal IDs of any length).
			const idPattern = /\s*\[ID:[^\s]+\]/g;
			for (let i = 0; i < document.lineCount; i++) {
				const line = document.lineAt(i);
				const text = line.text;
				// Find all ID markers in the line.
				const matches = [...text.matchAll(idPattern)];
				if (matches.length === 0) continue;
				// Remove all ID markers.
				let newText = text;
				for (const match of matches) {
					newText = newText.replace(match[0], '');
				}
				// Replace the entire line.
				const fullRange = new vscode.Range(
					line.range.start,
					line.range.end
				);
				edit.replace(document.uri, fullRange, newText);
				removedCount += matches.length;
			}
			if (removedCount === 0) {
				vscode.window.showInformationMessage('No dialogue IDs found');
				return;
			}
			// Apply the edit.
			await vscode.workspace.applyEdit(edit);
			vscode.window.showInformationMessage(`✅ Removed ${removedCount} dialogue IDs`);
		})
	);

	// ============ Dialogue tag features ============
	registerTagFeatures(context);

	// ============ Register the code folding provider ============
	context.subscriptions.push(
		vscode.languages.registerFoldingRangeProvider(
			{ scheme: 'file', language: 'dialogue' },
			new DialogueFoldingProvider()
		)
	);

	// ============ Automatically close {{ }} ============
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId !== 'dialogue') return;

			// Only handle insertion of a single character.
			if (event.contentChanges.length !== 1) return;

			const change = event.contentChanges[0];

			// Check whether the second { was entered.
			if (change.text === '{' && change.rangeLength === 0) {
				const beforePosition = change.range.start;
				const beforeChar = event.document.getText(
					new vscode.Range(
						beforePosition.translate(0, -1),
						beforePosition
					)
				);

				// If the previous character is {, automatically add }}.
				if (beforeChar === '{') {
					const editor = vscode.window.activeTextEditor;
					if (editor && editor.document === event.document) {
						const insertPosition = change.range.end.translate(0, 1);
						editor.edit(editBuilder => {
							editBuilder.insert(insertPosition, '}}');
						}).then(() => {
							// Move the cursor between {{ and }}.
							const newPosition = insertPosition;
							editor.selection = new vscode.Selection(newPosition, newPosition);
						});
					}
				}
			}
		})
	);

	// Title management: listen for document changes.
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(doc => {
			if (doc.languageId === 'dialogue') {
				titleManager.scanDocument(doc);
			}
		}),
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId === 'dialogue') {
				titleManager.scanDocument(event.document);
			}
		}),
		vscode.workspace.onDidCloseTextDocument(doc => {
			if (doc.languageId === 'dialogue') {
				titleManager.clearDocument(doc.uri);
			}
		})
	);
	// Scan all currently open dialogue files.
	vscode.workspace.textDocuments.forEach(doc => {
		if (doc.languageId === 'dialogue') {
			titleManager.scanDocument(doc);
		}
	});
	// Register title-related features.
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ scheme: 'file', language: 'dialogue' },
			new TitleCompletionProvider(titleManager),
			'>', '=', ' '  // Trigger characters.
		)
	);
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{ scheme: 'file', language: 'dialogue' },
			new TitleHoverProvider(titleManager)
		)
	);
	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			{ scheme: 'file', language: 'dialogue' },
			new TitleDefinitionProvider(titleManager)
		)
	);

	// ============ Import-related features ============
	const importCompletionProvider = new ImportPathCompletionProvider(workspaceFolder);

	// Register the Import path completion provider (space triggers it).
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ scheme: 'file', language: 'dialogue' },
			importCompletionProvider,
			' ', '"', '/'  // Key fix: add space as a trigger.
		)
	);

	// Register the Import hover provider.
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{ scheme: 'file', language: 'dialogue' },
			new ImportHoverProvider(workspaceFolder)
		)
	);

	// Listen for file system changes.
	const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.dialogue');

	fileWatcher.onDidCreate(() => {
		console.log('[Dialogue] 📝 New file detected; refreshing list');
		importCompletionProvider.refresh();
	});

	fileWatcher.onDidDelete(() => {
		console.log('[Dialogue] 🗑️ File deletion detected; refreshing list');
		importCompletionProvider.refresh();
	});

	context.subscriptions.push(fileWatcher);


	// ============ Godot code diagnostics ============
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('dialogue');
	context.subscriptions.push(diagnosticCollection);

	const diagnosticProvider = new GodotDiagnosticProvider(classCache, diagnosticCollection, titleManager);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(doc => {
			if (doc.languageId === 'dialogue') {
				diagnosticProvider.updateDiagnostics(doc);
			}
		}),
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId === 'dialogue') {
				diagnosticProvider.updateDiagnostics(event.document);
			}
		}),
		vscode.workspace.onDidCloseTextDocument(doc => {
			if (doc.languageId === 'dialogue') {
				diagnosticCollection.delete(doc.uri);
			}
		})
	);

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			{ scheme: 'file', language: 'dialogue' },
			new GodotCodeActionProvider(classCache, diagnosticCollection, titleManager),
			{
				providedCodeActionKinds: [
					vscode.CodeActionKind.QuickFix,
					vscode.CodeActionKind.RefactorRewrite
				]
			}
		)
	);

	// Run initial diagnostics for all currently open dialogue files.
	vscode.workspace.textDocuments.forEach(doc => {
		if (doc.languageId === 'dialogue') {
			diagnosticProvider.updateDiagnostics(doc);
		}
	});

	// ============ Godot class completion ============
	// Fix: trigger GodotCompletionProvider only in specific contexts to avoid conflicts with Import.
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ scheme: 'file', language: 'dialogue' },
			new GodotCompletionProvider(classCache),
			'.'  // Key fix: keep only the period trigger and remove space.
		)
	);

	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{ scheme: 'file', language: 'dialogue' },
			new GodotHoverProvider(classCache)
		)
	);

	context.subscriptions.push(
		vscode.languages.registerSignatureHelpProvider(
			{ scheme: 'file', language: 'dialogue' },
			new GodotSignatureHelpProvider(classCache),
			'(', ','
		)
	);

	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			{ scheme: 'file', language: 'dialogue' },
			new GodotDefinitionProvider(classCache)
		)
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			// Existing: global class configuration changed.
			if (event.affectsConfiguration('dialogue.diagnostics.globalClasses')) {
				console.log('[Dialogue] 🔄 Configuration changed; rebuilding global member index');
				classCache.refreshGlobalMembers();
				// Re-run diagnostics for all open dialogue files.
				vscode.workspace.textDocuments.forEach(doc => {
					if (doc.languageId === 'dialogue') {
						diagnosticProvider.updateDiagnostics(doc);
					}
				});
			}
			// Added: global variable configuration changed.
			if (event.affectsConfiguration('dialogue.diagnostics.globalVariables')) {
				console.log('[Dialogue] 🔄 Global variable configuration changed');
				classCache.refreshGlobalVariables();

				// Re-run diagnostics for all open files.
				vscode.workspace.textDocuments.forEach(doc => {
					if (doc.languageId === 'dialogue') {
						diagnosticProvider.updateDiagnostics(doc);
					}
				});
			}
		})
	);

	registerExportCommands(context);

	console.log('[Dialogue] ============ Extension activation complete ============');
}

export function deactivate() {
	console.log('[Dialogue] Extension deactivated');
}

// ============ Completion provider ============
class GodotCompletionProvider implements vscode.CompletionItemProvider {
	constructor(private classCache: GodotClassCache) { }

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext  // Add the context parameter.
	): Promise<vscode.CompletionItem[]> {
		console.log('[Dialogue] ========== Completion triggered ==========');

		const line = document.lineAt(position.line).text;
		const beforeCursor = line.substring(0, position.character);

		console.log('[Dialogue] 📝 Current line:', line);
		console.log('[Dialogue] 📝 Text before cursor:', beforeCursor);

		// Check whether this is an import statement (if so, let ImportCompletionProvider handle it).
		if (/^\s*import\b/.test(beforeCursor)) {
			console.log('[Dialogue] ⚠️ In an import statement; skipping Godot completion');
			return [];
		}
		// **Added: check whether this is a goto statement (=> or - xxx =>).**
		if (/(?:^|\s)(?:=>|=)\s*[^\s]*$/.test(beforeCursor)) {
			console.log('[Dialogue] ⚠️ In a goto statement; skipping Godot completion');
			return [];
		}
		// **Added: check whether this is a title declaration (~ xxx).**
		if (/^\s*~\s+/.test(beforeCursor)) {
			console.log('[Dialogue] ⚠️ In a title declaration; skipping Godot completion');
			return [];
		}
		// **Added: check whether this is a choice (- xxx).**
		if (/^\s*-\s+[^=>]*$/.test(beforeCursor)) {
			console.log('[Dialogue] ⚠️ In choice text; skipping Godot completion');
			return [];
		}

		// **Added: check whether this is character dialogue (Character: dialogue text).**
		// Matches: NPC: Hello
		// Does not match: do NPC.method()
		if (/^\s*\w+:\s+[^[{]*$/.test(beforeCursor) && !/^\s*(?:do!?|set|if|elif|while|match|when)\s+/.test(beforeCursor)) {
			console.log('[Dialogue] ⚠️ In dialogue text; skipping Godot completion');
			return [];
		}

		// **Added: check whether this is narration (plain text outside a code area).**
		const textLinePatterns = [
			/^\s*~\s+/,                    // Title
			/^\s*=>/,                      // goto
			/^\s*-\s*/,                    // Choice
			/^\s*#/,                       // Comment
			/^\s*import\s+/,               // import
			/^\s*using\s+/,                // using
			/^\s*(?:if|elif|else|while|match|when)\s+/, // Control flow (block-level)
			/^\s*(?:do!?|set)\s+/,         // Mutation (block-level)
		];

		const isBlockLevelCode = textLinePatterns.some(p => p.test(beforeCursor));

		// If this is not block-level code and has no code marker, it is narration.
		if (!isBlockLevelCode &&
			!/\[(?:do!?|set|if|elif)\s+/.test(beforeCursor) &&
			!/\{\{/.test(beforeCursor)) {
			console.log('[Dialogue] ⚠️ In narration text; skipping Godot completion');
			return [];
		}

		// Check member access first (ClassName.).
		// Supports multiple levels: objA.b.c.
		const memberAccessMatch = beforeCursor.match(/(\w+(?:\.\w+)*)\.(\w*)$/);
		if (memberAccessMatch) {
			const fullPath = memberAccessMatch[1];  // For example: playerStats.equipment
			const partialMember = memberAccessMatch[2];

			console.log(`[Dialogue] 🔍 Member access: ${fullPath}.${partialMember}`);

			// Split the path.
			const pathParts = fullPath.split('.');
			const rootIdentifier = pathParts[0];

			// Check whether it is a global variable.
			const globalVar = this.classCache.getGlobalVariable(rootIdentifier);
			if (globalVar) {
				console.log(`[Dialogue] 🌐 Global variable member access: ${fullPath}`);

				// Single-level access (playerStats.xxx).
				if (pathParts.length === 1) {
					return this.getVariableMembers(rootIdentifier, []);
				}

				// Multi-level access (playerStats.equipment.xxx).
				const propertyPath = pathParts.slice(1);  // ['equipment']
				return this.getVariableMembers(rootIdentifier, propertyPath);
			}

			// 否则当作类名处理
			return this.getClassMembers(rootIdentifier);
		}

		// Then check whether this is a code area (manual trigger required).
		const triggerPatterns = [
			/^\s*do!?\s+[\w.]*$/,              // do 后可能有类名和点
			/\{\{[^}]*$/,                      // {{ 插值
			/^\s*set\s+[\w.]*$/,               // set 变量
			/^\s*(?:if|elif)\s+[\S.]*$/,      // if/elif 条件
			/\[(?:if|elif)\s+[^\]]*$/,        // 行内条件
		];

		const shouldTrigger = triggerPatterns.some(p => p.test(beforeCursor));

		console.log('[Dialogue] 🔍 In code area:', shouldTrigger);

		if (!shouldTrigger) {
			// Also show completions when manually triggered (Ctrl+Space).
			if (context.triggerKind === vscode.CompletionTriggerKind.Invoke) {
				console.log('[Dialogue] 💡 Completion manually triggered by the user');
				return [
					...this.getAllClasses(),
					...this.getGlobalVariablesCompletions(),
					...this.getGlobalMembersCompletions()
				];
			}

			console.log('[Dialogue] ⚠️ Not in a code area; skipping completion');
			return [];
		}

		console.log('[Dialogue] In a code area; returning all classes');

		return [
			...this.getAllClasses(),
			...this.getGlobalVariablesCompletions(),
			...this.getGlobalMembersCompletions()
		];
	}

	/**
	 * Added: get global member completion items.
	 */
	private getGlobalMembersCompletions(): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];
		const globalMembers = this.classCache.getGlobalMembers();

		for (const member of globalMembers) {
			const cls = this.classCache.getClass(member.className);
			if (!cls) continue;

			if (member.type === 'method') {
				const method = cls.methods.find(m => m.name === member.name);
				if (!method) continue;

				const item = new vscode.CompletionItem(
					member.name,
					vscode.CompletionItemKind.Method
				);

				const paramTexts = method.params.map(p => p.fullText).join(', ');
				item.detail = `${method.returnType} ${member.className}.${member.name}(${paramTexts})`;
				item.insertText = new vscode.SnippetString(`${member.name}($0)`);

				const docs: string[] = [];
				docs.push(`🌐 **Global method** (from \`${member.className}\`)`);
				docs.push('');

				if (method.docComment) {
					docs.push(formatGodotDocComment(method.docComment));
					docs.push('');
					docs.push('---');
				}

				docs.push(`**Returns:** \`${method.returnType}\``);

				if (method.params.length > 0) {
					docs.push(`**Parameters:**`);
					for (const param of method.params) {
						const defaultValue = param.defaultValue ? ` = ${param.defaultValue}` : '';
						docs.push(`- \`${param.name}: ${param.type}${defaultValue}\``);
					}
				}

				item.documentation = new vscode.MarkdownString(docs.join('\n'));
				item.sortText = `0_global_${member.name}`; // Show global members first.

				items.push(item);

			} else if (member.type === 'property') {
				const property = cls.properties.find(p => p.name === member.name);
				if (!property) continue;

				const item = new vscode.CompletionItem(
					member.name,
					vscode.CompletionItemKind.Property
				);

				item.detail = `${property.type} ${member.className}.${member.name}`;
				item.documentation = new vscode.MarkdownString(
					`🌐 **Global property** (from \`${member.className}\`)\n\n**Type:** ${property.type}`
				);
				item.sortText = `0_global_${member.name}`;

				items.push(item);
			}
		}

		return items;
	}

	/**
	 * Added: get global variable completion items.
	 */
	private getGlobalVariablesCompletions(): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];
		const globalVars = this.classCache.getAllGlobalVariables();
		for (const { name, def } of globalVars) {
			const item = new vscode.CompletionItem(
				name,
				vscode.CompletionItemKind.Variable
			);
			item.detail = `${def.type} (global variable)`;

			const docs: string[] = [];
			docs.push(`🌐 **Global variable** (configured in settings.json)`);
			docs.push('');
			docs.push(`**Type:** \`${def.type}\``);

			if (def.comment) {
				docs.push('');
				docs.push(`**Description:**`);
				// Supports multi-line comments.
				docs.push(def.comment);
			}
			item.documentation = new vscode.MarkdownString(docs.join('\n'));
			item.sortText = `0_var_${name}`;  // Highest priority.
			items.push(item);
		}
		return items;
	}

	/**
	 * Added: get variable property completion items.
	 */
	private getVariableMembers(
		variableName: string,
		propertyPath: string[]
	): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];
		const properties = this.classCache.getVariableProperties(variableName, propertyPath);

		console.log(`[Dialogue] 📦 Getting variable members: ${variableName}.${propertyPath.join('.')}`);
		console.log(`[Dialogue] 📊 Found ${properties.length} properties`);

		for (const prop of properties) {
			// Remove the optional marker (String? -> String).
			const cleanType = prop.type.replace('?', '');
			const isOptional = prop.type.endsWith('?');

			const item = new vscode.CompletionItem(
				prop.name,
				vscode.CompletionItemKind.Property
			);

			item.detail = `${prop.type} (variable property)`;

			const docs: string[] = [];
			docs.push(`**Type:** \`${cleanType}\``);

			if (isOptional) {
				docs.push(`**Optional:** Yes`);
			}

			if (prop.comment) {
				docs.push('');
				docs.push(`**Description:** ${prop.comment}`);
			}

			item.documentation = new vscode.MarkdownString(docs.join('\n'));
			item.sortText = `0_prop_${prop.name}`;

			items.push(item);
		}

		return items;
	}

	/** Get completion items for all classes. */
	private getAllClasses(): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		for (const cls of this.classCache.getClasses()) {
			const item = new vscode.CompletionItem(cls.name, vscode.CompletionItemKind.Class);
			item.detail = `extends ${cls.base}`;

			const docs: string[] = [];

			// Show the class comment.
			if (cls.classComment) {
				docs.push('');
				const _comments = cls.classComment.split('\n');
				for (let i = 0; i < _comments.length; i++) {
					const _comment = _comments[i];
					docs.push(_comment);
					docs.push('');
				}
				docs.push('---');
				docs.push('');
			}

			docs.push(`**Base Class:** \`${cls.base}\``);
			docs.push('');
			docs.push(`**Path:** \`${cls.path}\``);

			if (this.classCache.isAutoload(cls.name)) {
				docs.push('');
				docs.push('🌐 **AutoLoad Singleton**');
			}

			// Add a methods and properties overview.
			if (cls.methods.length > 0) {
				const publicMethods = cls.methods.filter(m => !m.name.startsWith('_'));
				if (publicMethods.length > 0) {
					docs.push('');
					docs.push(`**Methods:** ${publicMethods.length} public methods`);
				}
			}

			if (cls.properties.length > 0) {
				const publicProps = cls.properties.filter(p => !p.name.startsWith('_'));
				if (publicProps.length > 0) {
					docs.push(`**Properties:** ${publicProps.length} public properties`);
				}
			}

			item.documentation = new vscode.MarkdownString(docs.join('\n'));
			item.sortText = this.classCache.isAutoload(cls.name) ? `0_${cls.name}` : `1_${cls.name}`;

			items.push(item);
		}

		return items;
	}

	/** Get completion items for class members. */
	private getClassMembers(className: string): vscode.CompletionItem[] {
		console.log(`[Dialogue] -------- Getting members of ${className} --------`);

		const cls = this.classCache.getClass(className);

		if (!cls) {
			console.log(`[Dialogue] ❌ Class not found: ${className}`);
			return [];
		}

		console.log(`[Dialogue] Found class: ${className}`);
		console.log(`[Dialogue] 📊 Method count: ${cls.methods.length}`);
		console.log(`[Dialogue] 📊 Property count: ${cls.properties.length}`);

		const items: vscode.CompletionItem[] = [];

		// Add methods (excluding names that start with an underscore).
		for (const method of cls.methods) {
			if (method.name.startsWith('_')) {
				console.log(`[Dialogue] ⏭️ Skipping private method: ${method.name}`);
				continue;
			}

			console.log(`[Dialogue] 📦 Adding method: ${method.name}`);

			const item = new vscode.CompletionItem(method.name, vscode.CompletionItemKind.Method);

			// Fix: concatenate parameters correctly.
			const paramTexts = method.params.map(p => p.fullText).join(', ');
			item.detail = `${method.returnType} ${className}.${method.name}(${paramTexts})`;

			item.insertText = new vscode.SnippetString(`${method.name}($0)`);

			const docs: string[] = [];

			// Format the documentation comment.
			if (method.docComment) {
				docs.push(formatGodotDocComment(method.docComment));
				docs.push('');
				docs.push('---');
			}

			// Fix: show parameter information.
			docs.push(`**Returns:** \`${method.returnType}\``);

			if (method.params.length > 0) {
				docs.push(`**Parameters:**`);
				for (const param of method.params) {
					const defaultValue = param.defaultValue ? ` = ${param.defaultValue}` : '';
					docs.push(`- \`${param.name}: ${param.type}${defaultValue}\``);
				}
			} else {
				docs.push(`**Parameters:** _none_`);
			}

			if (method.isStatic) {
				docs.push('\n🔒 **Static method**');
			}

			item.documentation = new vscode.MarkdownString(docs.join('\n'));

			items.push(item);
		}

		// Add properties (✅ excluding names that start with an underscore).
		for (const prop of cls.properties) {
			if (prop.name.startsWith('_')) {
				console.log(`[Dialogue] ⏭️ Skipping private property: ${prop.name}`);
				continue;
			}

			console.log(`[Dialogue] 📦 Adding property: ${prop.name}`);

			const item = new vscode.CompletionItem(prop.name, vscode.CompletionItemKind.Property);
			item.detail = `${prop.type} ${className}.${prop.name}`;

			const docs = [`**Type:** ${prop.type}`];
			if (prop.isExported) {
				docs.push('\n🔧 **Exported property**');
			}

			item.documentation = new vscode.MarkdownString(docs.join('\n'));

			items.push(item);
		}

		// Add signals (✅ excluding names that start with an underscore).
		for (const signal of cls.signals) {
			if (signal.startsWith('_')) {
				console.log(`[Dialogue] ⏭️ Skipping private signal: ${signal}`);
				continue;
			}

			console.log(`[Dialogue] 📦 Adding signal: ${signal}`);

			const item = new vscode.CompletionItem(signal, vscode.CompletionItemKind.Event);
			item.detail = `signal ${className}.${signal}`;
			item.documentation = new vscode.MarkdownString('📡 **Signal**');

			items.push(item);
		}

		console.log(`[Dialogue] 📊 Returning ${items.length} members in total`);

		return items;
	}
}

// ============ Hover provider ============
class GodotHoverProvider implements vscode.HoverProvider {
	constructor(private classCache: GodotClassCache) { }

	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.Hover | undefined> {
		console.log('[Dialogue] ========== Hover triggered ==========');

		const line = document.lineAt(position.line).text;

		// Get the word at the cursor first.
		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) return undefined;

		const word = document.getText(wordRange);
		console.log(`[Dialogue] 🔍 Word under cursor: ${word}`);

		// Detect member access, including nested access.
		const beforeWord = line.substring(0, wordRange.start.character);
		const fullPathMatch = beforeWord.match(/(\w+(?:\.\w+)*)\.$/);

		if (fullPathMatch) {
			const fullPath = fullPathMatch[1];  // For example: playerStats.equipment
			const pathParts = fullPath.split('.');
			const rootIdentifier = pathParts[0];

			console.log(`[Dialogue] 🔍 Hovering over member: ${fullPath}.${word}`);

			// Check whether it is a global variable.
			const globalVar = this.classCache.getGlobalVariable(rootIdentifier);
			if (globalVar) {
				console.log(`[Dialogue] 🌐 Hovering over a global variable property`);

				const propertyPath = [...pathParts.slice(1), word];
				const result = this.classCache.resolveVariableProperty(rootIdentifier, propertyPath);

				if (result) {
					const cleanType = result.type.replace('?', '');
					const isOptional = result.type.endsWith('?');

					const docs: string[] = [];
					docs.push(`## ${word}`);
					docs.push('');
					docs.push(`**Type:** \`${cleanType}\`${isOptional ? ' (Optional)' : ''}`);

					if (result.comment) {
						docs.push('');
						docs.push(`**Description:** ${result.comment}`);
					}

					docs.push('');
					docs.push('---');
					docs.push(`💡 From global variable \`${rootIdentifier}\``);

					return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
				}
			}

			// Otherwise, treat it as a class member.
			return this.getMemberHover(rootIdentifier, word);
		}

		const globalMember = this.classCache.resolveGlobalMember(word);

		if (globalMember) {
			console.log(`[Dialogue] 🌐 Found global member: ${word} (from ${globalMember.className})`);
			return this.getMemberHover(globalMember.className, word);
		}

		// Added: check whether this is a global variable itself.
		const globalVar = this.classCache.getGlobalVariable(word);

		if (globalVar) {
			const docs: string[] = [];
			docs.push(`## 🌐 ${word}`);
			docs.push('');
				docs.push(`**Type:** \`${globalVar.type}\``);

			if (globalVar.comment) {
				docs.push('');
				docs.push(`**Description:**`);
				docs.push(globalVar.comment);
			}
			docs.push('');
			docs.push('---');
			docs.push('💡 **Global variable** (configured in settings.json)');
			return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
		}

		// Detect a standalone class name.
		console.log(`[Dialogue] 🔍 Detecting standalone class name: ${word}`);

		// 检查是否在代码区域
		const codePatterns = [
			/^\s*(while|match|when|do!?)\s+/,
			/\[do!?\s+/,
			/\{\{[^}]*/,
			/^\s*set\s+/,
			/\[set\s+/,
			/^\s*(?:if|elif)\s+/,
			/\[(?:if|elif)\s+[^\]]*/,
		];

		const inCodeArea = codePatterns.some(p => p.test(line));
		if (!inCodeArea) {
			console.log('[Dialogue] ⚠️ Not in a code area; skipping hover');
			return undefined;
		}

		return this.getClassHover(word);
	}

	/** Get hover information for a class. */
	private getClassHover(className: string): vscode.Hover | undefined {
		const cls = this.classCache.getClass(className);
		if (!cls) return undefined;

		const docs: string[] = [
			`## ${cls.name}`,
		];

		// Show the class comment.
		if (cls.classComment) {
			docs.push('');
			const _comments = cls.classComment.split('\n');
			for (let i = 0; i < _comments.length; i++) {
				const _comment = _comments[i];
				docs.push(_comment);
				docs.push('');
			}
			docs.push('---');
			docs.push('');
		}

		docs.push(`**Base Class:** \`${cls.base}\``);
		docs.push('');
		docs.push(`**Path:** \`${cls.path}\``);

		if (this.classCache.isAutoload(className)) {
			docs.push('\n🌐 **Global Singleton (AutoLoad)**');
		}

		return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
	}

	/** Get hover information for a member (method/property). */
	private getMemberHover(className: string, memberName: string): vscode.Hover | undefined {
		const cls = this.classCache.getClass(className);
		if (!cls) return undefined;

		// Do not show hover information for private members.
		if (memberName.startsWith('_')) {
			console.log(`[Dialogue] ⏭️ Hiding hover for private member: ${memberName}`);
			return undefined;
		}

		// Find a method.
		const method = cls.methods.find(m => m.name === memberName);
		if (method) {
			const docs: string[] = [];

			// Add the function signature.
			docs.push('```gdscript');
			const paramTexts = method.params.map(p => p.fullText).join(', ');
			docs.push(`func ${method.name}(${paramTexts}) -> ${method.returnType}`);
			docs.push('```');

			// Format and add the documentation comment.
			if (method.docComment) {
				docs.push('');
				docs.push(formatGodotDocComment(method.docComment));
			}

			// Add metadata.
			docs.push('');
			docs.push('---');
			docs.push(`**Class:** \`${className}\``);

			if (method.isStatic) {
				docs.push('🔒 **Static method**');
			}

			return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
		}

		// Find a property.
		const property = cls.properties.find(p => p.name === memberName);
		if (property) {
			const docs: string[] = [];

			docs.push('```gdscript');
			docs.push(`var ${property.name}: ${property.type}`);
			docs.push('```');

			docs.push('');
			docs.push('---');
			docs.push(`**Class:** \`${className}\``);
			docs.push(`**Type:** \`${property.type}\``);

			if (property.isExported) {
				docs.push('🔧 **Exported property**');
			}

			return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
		}

		// Find a signal.
		const signal = cls.signals.find(s => s === memberName);
		if (signal) {
			const docs: string[] = [];

			docs.push('```gdscript');
			docs.push(`signal ${signal}`);
			docs.push('```');

			docs.push('');
			docs.push('---');
			docs.push(`**Class:** \`${className}\``);
			docs.push('📡 **Signal**');

			return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
		}

		return undefined;
	}
}

// ============ Signature help provider ============
class GodotSignatureHelpProvider implements vscode.SignatureHelpProvider {
	constructor(private classCache: GodotClassCache) { }

	async provideSignatureHelp(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.SignatureHelp | undefined> {
		console.log('[Dialogue] ========== Signature help triggered ==========');

		const line = document.lineAt(position.line).text;
		const beforeCursor = line.substring(0, position.character);

		console.log('[Dialogue] 📝 Current line:', line);
		console.log('[Dialogue] 📝 Text before cursor:', beforeCursor);

		// Find a complete function call first (ClassName.method()).
		const fullFunctionCallMatch = beforeCursor.match(/(?:^|\[do!?\s+|\[set\s+|\{\{)[\s\S]*?(\w+)\.(\w+)\s*\(([^)]*)$/);

		if (fullFunctionCallMatch) {
			const className = fullFunctionCallMatch[1];
			const methodName = fullFunctionCallMatch[2];
			const paramsText = fullFunctionCallMatch[3];

			console.log(`[Dialogue] 🔍 Detected function: ${className}.${methodName}`);

			const cls = this.classCache.getClass(className);
			if (cls) {
				const method = cls.methods.find(m => m.name === methodName);
				if (method) {
					return this.createSignatureHelp(method, paramsText);
				}
			}
		}

		// Added: check global method calls (method()).
		const globalFunctionCallMatch = beforeCursor.match(/(?:^|\[do!?\s+|\[set\s+|\{\{)[\s\S]*?(\w+)\s*\(([^)]*)$/);

		if (globalFunctionCallMatch) {
			const methodName = globalFunctionCallMatch[1];
			const paramsText = globalFunctionCallMatch[2];

			console.log(`[Dialogue] 🔍 Possible global method detected: ${methodName}`);

			const globalMember = this.classCache.resolveGlobalMember(methodName);

			if (globalMember && globalMember.type === 'method') {
				console.log(`[Dialogue] 🌐 Confirmed global method: ${methodName} (from ${globalMember.className})`);

				const cls = this.classCache.getClass(globalMember.className);
				if (cls) {
					const method = cls.methods.find(m => m.name === methodName);
					if (method) {
						return this.createSignatureHelp(method, paramsText);
					}
				}
			}
		}

		console.log('[Dialogue] ⚠️ No function call detected');
		return undefined;
	}

	/**
	 * Added: create signature help (extract shared logic).
	 */
	private createSignatureHelp(method: GodotMethod, paramsText: string): vscode.SignatureHelp {
		console.log(`[Dialogue] Found method: ${method.name}`);
		console.log(`[Dialogue] 📊 Parameter list:`, method.params.map(p => p.fullText));

		const commaCount = (paramsText.match(/,/g) || []).length;
		const activeParameter = Math.min(commaCount, method.params.length - 1);

		console.log(`[Dialogue] 📍 Current parameter position: ${activeParameter}`);

		const signatureHelp = new vscode.SignatureHelp();

		const paramTexts = method.params.map(p => p.fullText).join(', ');
		const signature = new vscode.SignatureInformation(
			`${method.name}(${paramTexts}) -> ${method.returnType}`
		);

		if (method.docComment) {
			signature.documentation = new vscode.MarkdownString(formatGodotDocComment(method.docComment));
		}

		for (const param of method.params) {
			const paramInfo = new vscode.ParameterInformation(param.fullText);

			const paramDocs: string[] = [`**Type:** \`${param.type}\``];

			if (param.defaultValue) {
				paramDocs.push(`**Default:** \`${param.defaultValue}\``);
			}

			paramInfo.documentation = new vscode.MarkdownString(paramDocs.join('\n'));

			signature.parameters.push(paramInfo);
		}

		signatureHelp.signatures.push(signature);
		signatureHelp.activeSignature = 0;
		signatureHelp.activeParameter = activeParameter;

		console.log(`[Dialogue] Returning signature help`);

		return signatureHelp;
	}
}

// ============ 定义跳转提供者 ============
class GodotDefinitionProvider implements vscode.DefinitionProvider {
	constructor(private classCache: GodotClassCache) { }

	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.Definition | undefined> {
		console.log('[Dialogue] ========== Definition lookup triggered ==========');

		const line = document.lineAt(position.line).text;
		const beforeCursor = line.substring(0, position.character);
		const afterCursor = line.substring(position.character);

		console.log('[Dialogue] 📝 Current line:', line);
		console.log('[Dialogue] 📝 Text before cursor:', beforeCursor);
		console.log('[Dialogue] 📝 Text after cursor:', afterCursor);
		console.log('[Dialogue] 📝 Cursor position:', position.character);

		// Get the word at the cursor.
		const range = document.getWordRangeAtPosition(position);
		if (!range) {
			console.log('[Dialogue] ❌ Could not get the word at the cursor');
			return undefined;
		}

		const word = document.getText(range);
		console.log('[Dialogue] 🔍 Word at cursor:', word);
		console.log('[Dialogue] 🔍 Word range:', `[${range.start.character}, ${range.end.character}]`);

		// Improved member-access detection: find the complete call chain.
		// For example, the cursor may be anywhere in PlayerState.add_gold(100).
		const fullLine = line;

		// Find the nearest period before the cursor.
		const beforeDot = beforeCursor.lastIndexOf('.');
		if (beforeDot !== -1) {
			// Extract the class name (the word before the period).
			const beforeDotText = beforeCursor.substring(0, beforeDot);
			const classNameMatch = beforeDotText.match(/(\w+)$/);

			if (classNameMatch) {
				const className = classNameMatch[1];

				// Added: check whether it is a global variable first.
				const globalVar = this.classCache.getGlobalVariable(className);

				// Check whether the cursor is on the class name.
				const classNameStart = beforeDot - className.length;
				const classNameEnd = beforeDot;

				if (position.character >= classNameStart && position.character <= classNameEnd) {
					console.log(`[Dialogue] Cursor is on ${globalVar ? 'global variable' : 'class name'}: ${className}`);

					// Global variables do not support definition lookup.
					if (globalVar) {
						console.log(`[Dialogue] ⚠️ Global variables do not support definition lookup (defined in configuration)`);
						return undefined;
					}

					return this.getClassDefinition(className);
				}

				// Check whether the cursor is on the member name (after the period).
				if (position.character > beforeDot) {
					const afterDotText = line.substring(beforeDot + 1);
					const memberNameMatch = afterDotText.match(/^(\w+)/);

					if (memberNameMatch) {
						const memberName = memberNameMatch[1];
						const memberStart = beforeDot + 1;
						const memberEnd = memberStart + memberName.length;

						if (position.character >= memberStart && position.character <= memberEnd) {
							// Use the type of the global variable when applicable.
							const targetClass = globalVar ? globalVar.type : className;
							console.log(`[Dialogue] Cursor is on member name: ${targetClass}.${memberName}`);
							return this.getMemberDefinition(targetClass, memberName);
						}
					}
				}
			}
		}

		// Detect a standalone class name.
		console.log(`[Dialogue] 🔍 Detecting standalone class name: ${word}`);

		// Added: check whether it is a global member.
		const globalMember = this.classCache.resolveGlobalMember(word);

		if (globalMember) {
			console.log(`[Dialogue] 🌐 Found global member: ${word} (from ${globalMember.className})`);

			// 检查是否在代码区域
			const codePatterns = [
				/^\s*(while|match|when|do!?)\s+/,
				/\[do!?\s+/,
				/\{\{[^}]*/,
				/^\s*set\s+/,
				/\[set\s+/,
				/^\s*(?:if|elif)\s+/,
				/\[(?:if|elif)\s+[^\]]*/,
			];
			const inCodeArea = codePatterns.some(p => p.test(line));
			if (inCodeArea) {
				return this.getMemberDefinition(globalMember.className, word);
			}
		}

		// Detect a standalone class name.
		console.log(`[Dialogue] 🔍 Detecting standalone class name: ${word}`);

		// 检查是否在代码区域
		const codePatterns = [
			/^\s*(while|match|when|do!?)\s+/,
			/\[do!?\s+/,
			/\{\{[^}]*/,
			/^\s*set\s+/,
			/\[set\s+/,
			/^\s*(?:if|elif)\s+/,
			/\[(?:if|elif)\s+[^\]]*/,
		];

		const inCodeArea = codePatterns.some(p => p.test(line));
		if (!inCodeArea) {
			console.log('[Dialogue] ⚠️ Not in a code area; skipping definition lookup');
			return undefined;
		}

		console.log('[Dialogue] In a code area; attempting to navigate to the class definition');
		return this.getClassDefinition(word);
	}

	/** Get the definition location for a class. */
	private getClassDefinition(className: string): vscode.Definition | undefined {
		const cls = this.classCache.getClass(className);
		if (!cls) {
			console.log(`[Dialogue] ❌ Class not found: ${className}`);
			return undefined;
		}

		const fsPath = this.resPathToFsPath(cls.path);
		if (!fs.existsSync(fsPath)) {
			console.log(`[Dialogue] ❌ File does not exist: ${fsPath}`);
			return undefined;
		}

		// Navigate to the class_name declaration line.
		const location = this.findClassNameLine(fsPath, className);

		console.log(`[Dialogue] Navigating to class definition: ${fsPath}`);
		return location;
	}

	/** Get the definition location for a member (method/property). */
	private getMemberDefinition(className: string, memberName: string): vscode.Definition | undefined {
		const cls = this.classCache.getClass(className);
		if (!cls) return undefined;

		// Do not navigate for private members.
		if (memberName.startsWith('_')) {
			console.log(`[Dialogue] ⏭️ Private members do not support navigation: ${memberName}`);
			return undefined;
		}

		const fsPath = this.resPathToFsPath(cls.path);
		if (!fs.existsSync(fsPath)) return undefined;

		// Find the method definition.
		const method = cls.methods.find(m => m.name === memberName);
		if (method) {
			console.log(`[Dialogue] Navigating to method: ${memberName}`);
			return this.findMethodLine(fsPath, memberName);
		}

		// Find the property definition.
		const property = cls.properties.find(p => p.name === memberName);
		if (property) {
			console.log(`[Dialogue] Navigating to property: ${memberName}`);
			return this.findPropertyLine(fsPath, memberName);
		}

		// Find the signal definition.
		const signal = cls.signals.find(s => s === memberName);
		if (signal) {
			console.log(`[Dialogue] Navigating to signal: ${memberName}`);
			return this.findSignalLine(fsPath, memberName);
		}

		return undefined;
	}

	/** Find the class_name declaration line. */
	private findClassNameLine(fsPath: string, className: string): vscode.Location | undefined {
		try {
			const content = fs.readFileSync(fsPath, 'utf-8');
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const match = line.match(new RegExp(`^\\s*class_name\\s+${className}\\b`));
				if (match) {
					const uri = vscode.Uri.file(fsPath);
					const position = new vscode.Position(i, line.indexOf(className));
					const range = new vscode.Range(position, position.translate(0, className.length));
					return new vscode.Location(uri, range);
				}
			}

			// If there is no class_name, navigate to the beginning of the file.
			const uri = vscode.Uri.file(fsPath);
			return new vscode.Location(uri, new vscode.Position(0, 0));
		} catch (error) {
			console.error(`[Dialogue] ❌ Failed to find class definition:`, error);
			return undefined;
		}
	}

	/** Find the method definition line. */
	private findMethodLine(fsPath: string, methodName: string): vscode.Location | undefined {
		try {
			const content = fs.readFileSync(fsPath, 'utf-8');
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const match = line.match(new RegExp(`^\\s*(?:static\\s+)?func\\s+${methodName}\\s*\\(`));
				if (match) {
					const uri = vscode.Uri.file(fsPath);
					const position = new vscode.Position(i, line.indexOf(methodName));
					const range = new vscode.Range(position, position.translate(0, methodName.length));
					return new vscode.Location(uri, range);
				}
			}
		} catch (error) {
			console.error(`[Dialogue] ❌ Failed to find method definition:`, error);
		}
		return undefined;
	}

	/** Find the property definition line. */
	private findPropertyLine(fsPath: string, propertyName: string): vscode.Location | undefined {
		try {
			const content = fs.readFileSync(fsPath, 'utf-8');
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const match = line.match(new RegExp(`^\\s*(?:@export\\s+)?var\\s+${propertyName}\\b`));
				if (match) {
					const uri = vscode.Uri.file(fsPath);
					const position = new vscode.Position(i, line.indexOf(propertyName));
					const range = new vscode.Range(position, position.translate(0, propertyName.length));
					return new vscode.Location(uri, range);
				}
			}
		} catch (error) {
			console.error(`[Dialogue] ❌ Failed to find property definition:`, error);
		}
		return undefined;
	}

	/** Find the signal definition line. */
	private findSignalLine(fsPath: string, signalName: string): vscode.Location | undefined {
		try {
			const content = fs.readFileSync(fsPath, 'utf-8');
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const match = line.match(new RegExp(`^\\s*signal\\s+${signalName}\\b`));
				if (match) {
					const uri = vscode.Uri.file(fsPath);
					const position = new vscode.Position(i, line.indexOf(signalName));
					const range = new vscode.Range(position, position.translate(0, signalName.length));
					return new vscode.Location(uri, range);
				}
			}
		} catch (error) {
			console.error(`[Dialogue] ❌ Failed to find signal definition:`, error);
		}
		return undefined;
	}

	/** Convert a res:// path to a file system path. */
	private resPathToFsPath(resPath: string): string {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) return '';

		return path.join(
			workspaceFolder.uri.fsPath,
			resPath.replace('res://', '')
		);
	}
}

