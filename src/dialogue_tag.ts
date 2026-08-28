// dialogue_tag.ts

import * as vscode from 'vscode';

/**
 * Dialogue Manager tag definition (shared interface)
 */
export interface DialogueTag {
	name: string;
	hasValue: boolean;
	valueType?: string;
	valueHint?: string;
	isPair: boolean;
	description: string;
	example: string;
	category: 'time' | 'audio' | 'effect' | 'ui' | 'metadata' | 'action';
	isMetadata?: boolean;
	isInline?: boolean;
	alias?: string[];
}

/**
 * Metadata category configuration interface
 */
export interface MetadataCategory {
	icon: string;
	description: string;
}

// ============ Keyword definitions (for hover information) ============
const DIALOGUE_KEYWORDS: Record<string, {
	description: string;
	example: string;
	inlineDescription?: string;  // ✅ Inline usage description
	inlineExample?: string;      // ✅ Inline usage example
}> = {
	'~': { description: 'Defines the start of a dialogue title.', example: '~ start' },
	'-': { description: 'Defines a dialogue choice.', example: '- Choice 1\n- Choice 2' },
	'=>': { description: 'Jumps to the specified dialogue title.', example: '=> next_scene\n=> END!' },

	// ✅ do keyword: distinguish line-start and inline usage
	'do': {
		description: '(At line start) Executes a Godot expression or method without blocking the dialogue flow.',
		example: 'do PlayerState.add_gold(100)\ndo queue_free()',
		inlineDescription: '(Inline) Executes an expression in dialogue text immediately.',
		inlineExample: 'NPC: Hello[do SaveManager.save()], the game is saved.'
	},

	// ✅ do! keyword
	'do!': {
		description: '(At line start) Executes an expression and waits for it to finish when it returns a signal.',
		example: 'do! play_animation("cutscene")',
		inlineDescription: '(Inline) Executes and waits for completion, pausing dialogue display.',
		inlineExample: 'NPC: Look at this [do! show_effect()] effect!'
	},

	// ✅ set keyword: distinguish line-start and inline usage
	'set': {
		description: '(At line start) Changes the value of a variable or property.',
		example: 'set player.health = 100\nset score += 50',
		inlineDescription: '(Inline) Changes a variable in dialogue text immediately.',
		inlineExample: 'You received 100 gold[set player.gold += 100]!'
	},

	'if': { description: 'Executes the indented block when the condition is true.', example: 'if count < 3:' },
	'elif': { description: 'Executes the indented block when the condition is true.', example: 'elif count < 3:' },
	'else': { description: 'Executes the indented block when all other conditions are false.', example: 'else:' },
	'while': { description: 'Repeats the indented block while the condition is true.', example: 'while count < 3:' },
	'match': { description: 'Executes the matching when branch for the expression value.', example: 'match player_class:' },
	'when': { description: 'A specific condition branch of a match statement.', example: 'when warrior:' },
	'{{': { description: 'Starts variable interpolation with an embedded Godot expression.', example: 'You have {{gold}} gold.' },
	'}}': { description: 'Ends variable interpolation.', example: 'You have {{gold}} gold.' },
	'%': { description: 'Weight for a random choice (%2 is twice as likely as %1).', example: '% Result 1.\n%2 Result 2.\n%2 Result 3.' }
};

// ============ Built-in tag definitions ============
export const DIALOGUE_TAGS: DialogueTag[] = [
	// ============ Inline action tags ============
	// ✅ Inline do tag
	{
		name: 'do',
		hasValue: true,
		valueType: 'expression',
		valueHint: 'Godot expression (for example SaveManager.save())',
		isPair: false,
		description: 'Execute an expression in dialogue text without blocking the dialogue flow',
		example: 'NPC: Hello[do SaveManager.save()], the game is saved.',
		category: 'action',
		isInline: true  // ✅ Mark as an inline tag
	},

	// ✅ Inline do! tag
	{
		name: 'do!',
		hasValue: true,
		valueType: 'expression',
		valueHint: 'Godot expression (returns a signal)',
		isPair: false,
		description: 'Execute an expression and wait for completion, pausing dialogue display',
		example: 'NPC: Look at this [do! show_effect()] effect!',
		category: 'action',
		isInline: true
	},

	// ✅ Inline set tag
	{
		name: 'set',
		hasValue: true,
		valueType: 'expression',
		valueHint: 'Change a variable value in dialogue text',
		isPair: false,
		description: 'Change a variable value in dialogue text',
		example: 'You received 100 gold[set gold += 100]!',
		category: 'action',
		isInline: true
	},

	// ============ Conditional control ============
	{
		name: 'if',
		hasValue: true,
		valueType: 'expression',
		valueHint: 'has_key',
		isPair: true,
		description: 'Start a conditional block and execute it when the expression is true',
		example: '[if player.has_key] You have a key [/if]',
		category: 'ui',
		isInline: true
	},
	{
		name: 'elif',
		hasValue: true,
		valueType: 'expression',
		valueHint: 'has_key',
		isPair: false,
		description: 'The else-if branch of a conditional block',
		example: '[if score > 100] Excellent [elif score > 60] Passing [else] Failing [/if]',
		category: 'ui',
		isInline: true
	},
	{
		name: 'else',
		hasValue: false,
		isPair: false,
		description: 'The inline else branch (must appear between [if] and [/if])',
		example: '[if player.has_key] You have a key [else] You do not have a key [/if]',
		category: 'ui',
		isInline: true
	},

	// ============ Timing control ============
	{
		name: 'wait',
		hasValue: true,
		valueType: 'number',
		valueHint: 'Seconds (decimals supported)',
		isPair: false,
		description: 'Pause for the specified number of seconds, then continue',
		example: '[wait=1.5]',
		category: 'time',
		isInline: true
	},
	{
		name: 'speed',
		hasValue: true,
		valueType: 'number',
		valueHint: 'Speed multiplier (1.0 is normal)',
		isPair: false,
		description: 'Set the text display speed',
		example: '[speed=2.0]',
		category: 'time',
		isInline: true
	},
	{
		name: 'pause',
		hasValue: false,
		isPair: false,
		description: 'Pause and wait for the player to press a key',
		example: '[pause]',
		category: 'time',
		isInline: true
	},
	{
		name: 'p',
		hasValue: false,
		isPair: false,
		description: 'Short form of pause',
		example: '[p]',
		category: 'time',
		isInline: true
	},

	// ============ Audio ============
	{
		name: 'sound',
		hasValue: true,
		valueType: 'path',
		valueHint: 'res://path/to/sound.ogg',
		isPair: false,
		description: 'Play a sound-effect file',
		example: '[sound=res://audio/sfx/click.ogg]',
		category: 'audio',
		isInline: true
	},
	{
		name: 'voice',
		hasValue: true,
		valueType: 'path',
		valueHint: 'res://path/to/voice.ogg',
		isPair: false,
		description: 'Play a character voice line',
		example: '[voice=res://audio/voice/line_001.ogg]',
		category: 'audio',
		isInline: true
	},

	// ============ Text effects ============
	{
		name: 'wave',
		hasValue: false,
		isPair: true,
		description: 'Wavy text effect',
		example: '[wave]Wavy text[/wave]',
		category: 'effect',
		isInline: true
	},
	{
		name: 'shake',
		hasValue: false,
		isPair: true,
		description: 'Shaking text effect',
		example: '[shake]Shaking text[/shake]',
		category: 'effect',
		isInline: true
	},
	{
		name: 'rainbow',
		hasValue: false,
		isPair: true,
		description: 'Rainbow gradient effect',
		example: '[rainbow]Rainbow text[/rainbow]',
		category: 'effect',
		isInline: true
	},
	{
		name: 'ghost',
		hasValue: false,
		isPair: true,
		description: 'Ghost fade effect',
		example: '[ghost]Ghost text[/ghost]',
		category: 'effect',
		isInline: true
	},
	{
		name: 'pulse',
		hasValue: false,
		isPair: true,
		description: 'Pulsing scale effect',
		example: '[pulse]Pulsing text[/pulse]',
		category: 'effect',
		isInline: true
	},

	// ============ UI control ============
	{
		name: 'b',
		hasValue: false,
		isPair: true,
		description: 'Bold text',
		example: '[b]Bold text[/b]',
		category: 'ui',
		isInline: true
	},
	{
		name: 'br',
		hasValue: false,
		isPair: false,
		description: 'Force a line break',
		example: '[br]',
		category: 'ui',
		isInline: true
	},
	{
		name: 'signal',
		hasValue: true,
		valueType: 'string',
		valueHint: 'Signal name',
		isPair: false,
		description: 'Send a custom signal',
		example: '[signal=player_choice]',
		category: 'ui',
		isInline: true
	},
	{
		name: 'next',
		hasValue: true,
		valueType: 'string',
		valueHint: 'Scene ID',
		isPair: false,
		description: 'Navigate to the next scene',
		example: '[next=chapter_2]',
		category: 'ui',
		isInline: true
	},
	{
		name: 'auto',
		hasValue: false,
		isPair: false,
		description: 'Enable autoplay mode',
		example: '[auto]',
		category: 'ui',
		isInline: true
	},
	{
		name: 'jump',
		hasValue: true,
		valueType: 'string',
		valueHint: 'Title name',
		isPair: false,
		description: 'Immediately navigate to the specified title',
		example: '[jump=next_scene]',
		category: 'ui',
		isInline: true
	}
];

/**
 * Register tag-related features.
 */
export function registerTagFeatures(context: vscode.ExtensionContext): void {
	console.log('[Dialogue] 📦 Registering tag features...');

	// Register unified tag completion and hover providers.
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ scheme: 'file', language: 'dialogue' },
			new DialogueTagCompletionProvider(),
			'[', '#'
		)
	);

	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{ scheme: 'file', language: 'dialogue' },
			new DialogueTagHoverProvider()
		)
	);

	// Register tag configuration commands.
	const tagConfigManager = TagConfigManager.getInstance();

	context.subscriptions.push(
		vscode.commands.registerCommand('dialogue.openTagSettings', () => {
			tagConfigManager.openSettings();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('dialogue.addNewTag', () => {
			tagConfigManager.addNewTag();
		})
	);

	console.log('[Dialogue] Tag features registered');
}

/**
 * Tag configuration manager (handles built-in and custom metadata tags).
 */
export class TagConfigManager {
	private static instance: TagConfigManager;

	private allTags: Map<string, DialogueTag> = new Map();
	private metadataCategories: Map<string, MetadataCategory> = new Map();
	private aliasToTag: Map<string, string> = new Map();
	private enabled: boolean = true;

	private constructor() {
		this.loadConfiguration();

		// Listen for configuration changes.
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('dialogue.diagnostics.customTags') ||
				event.affectsConfiguration('dialogue.diagnostics.enableCustomTags') ||
				event.affectsConfiguration('dialogue.diagnostics.metadataCategories')) {
				console.log('[Dialogue] 🔄 Configuration updated; reloading');
				this.loadConfiguration();
			}
		});
	}

	public static getInstance(): TagConfigManager {
		if (!TagConfigManager.instance) {
			TagConfigManager.instance = new TagConfigManager();
		}
		return TagConfigManager.instance;
	}

	/**
	 * Load configuration (combining built-in and custom tags).
	 */
	private loadConfiguration(): void {
		this.allTags.clear();
		this.metadataCategories.clear();

		// ✅ 1. Load all built-in tags.
		for (const tag of DIALOGUE_TAGS) {
			this.allTags.set(tag.name, tag);
		}

		const config = vscode.workspace.getConfiguration('dialogue');
		this.enabled = config.get<boolean>('enableCustomTags', true);
		if (!this.enabled) {
			console.log('[Dialogue] ⚠️ Custom tags are disabled');
			return;
		}

		// ✅ 2. Load metadata category configuration.
		const categoriesConfig = config.get<Record<string, MetadataCategory>>('diagnostics.metadataCategories', {});
		for (const [categoryKey, categoryConfig] of Object.entries(categoriesConfig)) {
			this.metadataCategories.set(categoryKey, categoryConfig);
		}
		console.log(`[Dialogue] ✅ Loaded ${this.metadataCategories.size} metadata categories`);

		// ✅ 3. Load user-defined metadata tags.
		const customTagsConfig = config.get<Record<string, {
			description: string;
			example?: string;
			category?: string;
			aliases?: string[];
		}>>('diagnostics.customTags', {});

		for (const [tagName, tagConfig] of Object.entries(customTagsConfig)) {
			const metadataTag: DialogueTag = {
				name: tagName,
				hasValue: false,
				isPair: false,
				description: tagConfig.description,
				example: tagConfig.example || `[#${tagName}]`,
				category: 'metadata',
				isMetadata: true,
				alias: tagConfig.aliases || []
			};

			if (tagConfig.category) {
				(metadataTag as any).metadataCategory = tagConfig.category;
			}
			this.allTags.set(tagName, metadataTag);

			// ✅ Build the alias map.
			if (tagConfig.aliases && tagConfig.aliases.length > 0) {
				for (const alias of tagConfig.aliases) {
					this.aliasToTag.set(alias, tagName);
					console.log(`[Dialogue] 📝 Registered alias: "${alias}" -> "${tagName}"`);
				}
			}
		}

		console.log(`[Dialogue] ✅ Loaded ${this.allTags.size} tags`);
	}


	/**
	 * ✅ Added: resolve the canonical tag name from an alias.
	 */
	public resolveAlias(aliasOrTagName: string): string {
		return this.aliasToTag.get(aliasOrTagName) || aliasOrTagName;
	}
	/**
	 * ✅ Added: get all aliases for a tag.
	 */
	public getAliases(tagName: string): string[] {
		const tag = this.allTags.get(tagName);
		return tag?.alias || [];
	}
	/**
	 * ✅ Added: check whether a string is an alias.
	 */
	public isAlias(text: string): boolean {
		return this.aliasToTag.has(text);
	}

	/**
	 * Get metadata category information.
	 */
	public getMetadataCategory(categoryKey: string): MetadataCategory | undefined {
		return this.metadataCategories.get(categoryKey);
	}

	/**
	 * Get all metadata categories.
	 */
	public getAllMetadataCategories(): Map<string, MetadataCategory> {
		return this.metadataCategories;
	}

	/**
	 * Get all tags.
	 */
	public getAllTags(): Map<string, DialogueTag> {
		return this.allTags;
	}

	/**
	 * Get a single tag.
	 */
	public getTag(tagName: string): DialogueTag | undefined {
		return this.allTags.get(tagName);
	}

	/**
	 * Get tags by category.
	 */
	public getTagsByCategory(category: DialogueTag['category']): DialogueTag[] {
		return Array.from(this.allTags.values()).filter(tag => tag.category === category);
	}

	/**
	 * Check whether custom tags are enabled.
	 */
	public isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Open the configuration.
	 */
	public async openSettings(): Promise<void> {
		await vscode.commands.executeCommand(
			'workbench.action.openSettings',
			'dialogue.customTags'
		);
	}

	/**
	 * Add a new metadata tag.
	 */
	public async addNewTag(): Promise<void> {
		const tagName = await vscode.window.showInputBox({
			prompt: 'Enter a tag name (without the # symbol)',
			placeHolder: 'For example: happy',
			validateInput: (value) => {
				if (!value) return 'Tag name cannot be empty';
				if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
					return 'Tag names may contain only letters, numbers, and underscores, and cannot start with a number';
				}
				if (this.allTags.has(value)) {
					return 'Tag already exists';
				}
				return null;
			}
		});

		if (!tagName) return;

		const description = await vscode.window.showInputBox({
			prompt: 'Enter a tag description',
			placeHolder: 'For example: Happy expression'
		});

		if (!description) return;

		// ✅ Added: enter aliases.
		const aliasesInput = await vscode.window.showInputBox({
			prompt: 'Enter aliases (optional; separate multiple aliases with commas)',
			placeHolder: 'For example: happy, cheerful, joyful'
		});

		const aliases = aliasesInput
			? aliasesInput.split(',').map(a => a.trim()).filter(a => a.length > 0)
			: [];

		const example = await vscode.window.showInputBox({
			prompt: 'Enter a usage example (optional)',
			placeHolder: `For example: NPC: Hello! [#${tagName}]`
		});

		// ✅ Show category selection.
		const categoryItems = Array.from(this.metadataCategories.entries()).map(([key, config]) => ({
			label: `${config.icon} ${key}`,
			description: config.description,
			value: key
		}));

		const categoryPick = await vscode.window.showQuickPick(categoryItems, {
			placeHolder: 'Select a tag category (optional)'
		});

		// Get the current configuration.
		const config = vscode.workspace.getConfiguration('dialogue');
		const currentTags = config.get<Record<string, any>>('customTags', {});

		// Add the new tag.
		currentTags[tagName] = {
			description: description,
			example: example || `[#${tagName}]`,
			category: categoryPick?.value,
			aliases: aliases
		};

		// Save the configuration.
		await config.update('customTags', currentTags, vscode.ConfigurationTarget.Global);

		// ✅ Show a success message, including alias information.
		const aliasInfo = aliases.length > 0
			? ` (Aliases: ${aliases.join(', ')})`
			: '';
		vscode.window.showInformationMessage(
			`✅ Metadata tag [#${tagName}] added!${aliasInfo}`
		);
	}
}

/**
 * Dialogue tag completion provider (handles built-in and metadata tags).
 */
export class DialogueTagCompletionProvider implements vscode.CompletionItemProvider {
	private tagConfigManager: TagConfigManager;

	constructor() {
		this.tagConfigManager = TagConfigManager.getInstance();
	}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	): Promise<vscode.CompletionItem[]> {
		const line = document.lineAt(position.line).text;
		const beforeCursor = line.substring(0, position.character);

		console.log('[Dialogue] ========== Tag completion triggered ==========');
		console.log('[Dialogue] 📝 Text before cursor:', beforeCursor);

		// ✅ 1. Check whether the cursor is at the start of a line (highest priority).
		// A line start contains only whitespace and possibly part of a keyword.
		const trimmedBeforeCursor = beforeCursor.trimStart();
		const isAtLineStart = beforeCursor === '' || /^\s+$/.test(beforeCursor) || /^\s*\w*$/.test(beforeCursor);

		if (isAtLineStart) {
			console.log('[Dialogue] 💡 Cursor is at the start of the line');

			// Extract the entered text, excluding leading whitespace.
			const partialInput = trimmedBeforeCursor;

			// Check whether it could be a keyword.
			const lineStartKeywords = ['if', 'elif', 'else', 'while', 'match', 'when', 'do', 'do!', 'set', '~', '=>', '-'];
			const isPossibleKeyword = lineStartKeywords.some(kw => kw.startsWith(partialInput));

			if (partialInput === '' || isPossibleKeyword) {
				console.log('[Dialogue] ✅ Providing line-start keyword completions');
				return this.getLineStartKeywordCompletions(partialInput);
			}

			// Do not provide completions when the input is not a keyword.
			console.log('[Dialogue] ⚠️ Input is not a keyword; skipping completions');
			return [];
		}

		// ✅ 2. Check whether the cursor is entering an inline tag.
		const isRegularTag = beforeCursor.endsWith('[');
		const isMetadataTag = /\[#\w*$/.test(beforeCursor);

		if (!isRegularTag && !isMetadataTag) {
			console.log('[Dialogue] ⚠️ Cursor is not in a tag position; skipping completions');
			return [];
		}

		console.log('[Dialogue] Providing inline tag completions');

		const items: vscode.CompletionItem[] = [];

		// Category icons.
		const categoryIcons: Record<string, string> = {
			time: '⏱️',
			audio: '🔊',
			effect: '✨',
			ui: '🎮',
			metadata: '🏷️',
			action: '⚡'
		};

		// Get all tags.
		const allTags = this.tagConfigManager.getAllTags();

		for (const [tagName, tag] of allTags.entries()) {
			// If [# was entered, show only metadata tags.
			if (isMetadataTag && !tag.isMetadata) continue;

			// ✅ Only inline tags appear when [ triggers completion.
			if (isRegularTag && !tag.isInline) continue;

			// ✅ Create the primary completion item for metadata tags.
			if (tag.isMetadata) {
				items.push(this.createMetadataTagCompletionItem(tag, categoryIcons));

				// ✅ Create a completion item for each alias.
				if (tag.alias && tag.alias.length > 0) {
					for (const alias of tag.alias) {
						items.push(this.createAliasCompletionItem(alias, tag, categoryIcons));
					}
				}
			} else {
				// Completion item for a built-in tag.
				const item = new vscode.CompletionItem(
					tagName,
					vscode.CompletionItemKind.Keyword
				);

				if (tag.hasValue) {
					if (['do', 'do!', 'set', 'if', 'elif'].includes(tagName)) {
						item.insertText = new vscode.SnippetString(`${tagName} \${1:${tag.valueHint}}\]`);
					} else {
						item.insertText = new vscode.SnippetString(`${tagName}=\${1:${tag.valueHint}}\]`);
					}
				} else if (tag.isPair) {
					item.insertText = new vscode.SnippetString(`${tagName}\]$1[/${tagName}]`);
				} else {
					item.insertText = `${tagName}]`;
				}

				item.detail = `${categoryIcons[tag.category]} ${tag.description}`;

				const docs: string[] = [];
				docs.push(`## ${categoryIcons[tag.category]} [${tagName}]`);
				docs.push('');
				docs.push(`**Category:** ${tag.category}`);
				docs.push('');
				docs.push(`**Description:** ${tag.description}`);
				docs.push('');
				docs.push('**Example:**');
				docs.push('```dialogue');
				docs.push(tag.example);
				docs.push('```');

				if (tag.hasValue) {
					docs.push('');
					docs.push(`**Parameter type:** \`${tag.valueType}\``);
					docs.push(`**Parameter description:** ${tag.valueHint}`);
				}

				if (tag.isPair) {
					docs.push('');
					docs.push('⚠️ **Paired tag**; closing tag required `[/' + tagName + ']`');
				}

				item.documentation = new vscode.MarkdownString(docs.join('\n'));

				const categoryOrder: Record<string, string> = {
					action: '0',
					time: '1',
					audio: '2',
					effect: '3',
					ui: '4',
					metadata: '5'
				};
				item.sortText = `${categoryOrder[tag.category]}_${tagName}`;

				items.push(item);
			}
		}

		console.log(`[Dialogue] 📦 Returning ${items.length} tag completion items`);
		return items;
	}

	/**
	 * ✅ Added: create a metadata tag completion item.
	 */
	private createMetadataTagCompletionItem(
		tag: DialogueTag,
		categoryIcons: Record<string, string>
	): vscode.CompletionItem {
		const item = new vscode.CompletionItem(
			`#${tag.name}`,
			vscode.CompletionItemKind.Keyword
		);

		item.insertText = `#${tag.name}]`;

		const metadataCategory = (tag as any).metadataCategory;
		const categoryConfig = metadataCategory
			? this.tagConfigManager.getMetadataCategory(metadataCategory)
			: undefined;

		const icon = categoryConfig?.icon || '🏷️';
		const categoryDesc = categoryConfig?.description || 'Other';
		item.detail = `${icon} ${categoryDesc} - ${tag.description}`;

		const docs: string[] = [];
		docs.push(`## ${icon} #${tag.name}`);
		docs.push('');
		docs.push(`**Category:** ${categoryDesc}`);
		docs.push('');
		docs.push(`**Description:** ${tag.description}`);
		docs.push('');

		// ✅ Show alias information.
		if (tag.alias && tag.alias.length > 0) {
			docs.push(`**Aliases:** ${tag.alias.map(a => `\`${a}\``).join(', ')}`);
			docs.push('');
		}

		docs.push('**Example:**');
		docs.push('```dialogue');
		docs.push(tag.example);
		docs.push('```');

		item.documentation = new vscode.MarkdownString(docs.join('\n'));
		item.sortText = `5_metadata_${tag.name}`;

		return item;
	}

	/**
	 * ✅ Added: create an alias completion item.
	 */
	private createAliasCompletionItem(
		alias: string,
		tag: DialogueTag,
		categoryIcons: Record<string, string>
	): vscode.CompletionItem {
		const item = new vscode.CompletionItem(
			alias,  // Display the alias.
			vscode.CompletionItemKind.Text  // Distinguish it with a text icon.
		);

		item.insertText = `${tag.name}]`;
		item.filterText = alias;  // Used for search matching.

		const metadataCategory = (tag as any).metadataCategory;
		const categoryConfig = metadataCategory
			? this.tagConfigManager.getMetadataCategory(metadataCategory)
			: undefined;

		const icon = categoryConfig?.icon || '🏷️';
		const categoryDesc = categoryConfig?.description || 'Other';

		// ✅ Mark this as an alias in the details.
		item.detail = `${icon} ${categoryDesc} - ${tag.description} (Alias: ${alias})`;

		const docs: string[] = [];
		docs.push(`## 🔄 ${alias}`);
		docs.push('');
		docs.push(`**Canonical tag:** \`#${tag.name}\``);
		docs.push('');
		docs.push(`**Category:** ${categoryDesc}`);
		docs.push('');
		docs.push(`**Description:** ${tag.description}`);
		docs.push('');

		// ✅ Show all aliases.
		if (tag.alias && tag.alias.length > 1) {
			const otherAliases = tag.alias.filter(a => a !== alias);
			docs.push(`**Other aliases:** ${otherAliases.map(a => `\`${a}\``).join(', ')}`);
			docs.push('');
		}

		docs.push('**Example:**');
		docs.push('```dialogue');
		docs.push(tag.example);
		docs.push('```');

		item.documentation = new vscode.MarkdownString(docs.join('\n'));

		// ✅ Sort aliases after the canonical tag.
		item.sortText = `5_metadata_${tag.name}_alias_${alias}`;

		return item;
	}

	/**
	 * Get line-start keyword completions.
	 */
	private getLineStartKeywordCompletions(partialInput: string): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		// Line-start keywords to complete.
		const lineStartKeywords = ['if', 'elif', 'else', 'while', 'match', 'when', 'do', 'do!', 'set', '~', '=>', '-'];

		for (const keyword of lineStartKeywords) {
			// Show only matching keywords.
			if (partialInput !== '' && !keyword.startsWith(partialInput)) {
				continue;
			}

			const kwDef = DIALOGUE_KEYWORDS[keyword];

			if (!kwDef) {
				console.log(`[Dialogue] ⚠️ Keyword ${keyword} has no definition`);
				continue;
			}

			const item = new vscode.CompletionItem(
				keyword,
				vscode.CompletionItemKind.Keyword
			);

			// Set insertion text.
			if (['if', 'elif', 'while', 'match', 'when'].includes(keyword)) {
				item.insertText = new vscode.SnippetString(`${keyword} \${1:condition}`);
			} else if (keyword === 'do') {
				item.insertText = new vscode.SnippetString(`do \${1:expression}`);
			} else if (keyword === 'do!') {
				item.insertText = new vscode.SnippetString(`do! \${1:expression}`);
			} else if (keyword === 'set') {
				item.insertText = new vscode.SnippetString(`set \${1:variable} = \${2:value}`);
			} else if (keyword === '~') {
				item.insertText = new vscode.SnippetString(`~ \${1:title_name}`);
			} else if (keyword === '=>') {
				item.insertText = new vscode.SnippetString(`=> \${1:title_name}`);
			} else if (keyword === '-') {
				item.insertText = new vscode.SnippetString(`- \${1:option_text} => \${2:title_name}`);
			} else {
				item.insertText = keyword;
			}

			item.detail = `🔑 ${kwDef.description}`;

			const docs: string[] = [];
			docs.push(`## 🔑 ${keyword}`);
			docs.push('');
			docs.push(`**Description:** ${kwDef.description}`);
			docs.push('');
			docs.push('**Example:**');
			docs.push('```dialogue');
			docs.push(kwDef.example);
			docs.push('```');

			if (kwDef.inlineDescription) {
				docs.push('');
				docs.push('---');
				docs.push('');
				docs.push('### 💡 Inline usage');
				docs.push('');
				docs.push(`**Description:** ${kwDef.inlineDescription}`);
				docs.push('');
				docs.push('**Example:**');
				docs.push('```dialogue');
				docs.push(kwDef.inlineExample || '');
				docs.push('```');
			}

			item.documentation = new vscode.MarkdownString(docs.join('\n'));

			const keywordPriority: Record<string, string> = {
				'if': '0',
				'elif': '1',
				'else': '2',
				'while': '3',
				'match': '4',
				'when': '5',
				'do': '6',
				'do!': '7',
				'set': '8',
				'~': '9',
				'=>': '10',
				'-': '11'
			};
			item.sortText = `0_keyword_${keywordPriority[keyword] || '99'}_${keyword}`;

			items.push(item);
		}

		console.log(`[Dialogue] 📦 Returning ${items.length} line-start keyword completion items`);
		return items;
	}
}

/**
 * Dialogue tag hover provider (unified handling).
 */
class DialogueTagHoverProvider implements vscode.HoverProvider {
	private tagConfigManager: TagConfigManager;

	constructor() {
		this.tagConfigManager = TagConfigManager.getInstance();
	}

	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.Hover | undefined> {
		const line = document.lineAt(position.line).text;

		console.log('[Dialogue] ========== Tag/keyword hover triggered ==========');

		// 1. Check line-start keywords first (if/elif/else/while/match/when/do/set).
		const lineFirstKeywordMatch = line.match(/^\s*(if|elif|else|while|match|when|do!?|set)\b/);
		if (lineFirstKeywordMatch) {
			const keywordStart = line.indexOf(lineFirstKeywordMatch[1]);
			const keywordEnd = keywordStart + lineFirstKeywordMatch[1].length;

			if (position.character >= keywordStart && position.character <= keywordEnd) {
				let keyword = lineFirstKeywordMatch[1];

				const kwDef = DIALOGUE_KEYWORDS[keyword];
				if (kwDef) {
					console.log(`[Dialogue] 🔍 Found line-start keyword: ${keyword}`);
					const docs: string[] = [];
					docs.push(`## 🔑 ${keyword}`);
					docs.push('');
					docs.push(`**Description:** ${kwDef.description}`);
					docs.push('');
					docs.push('**Example:**');
					docs.push('```dialogue');
					docs.push(kwDef.example);
					docs.push('```');

					// ✅ Show inline usage when available.
					if (kwDef.inlineDescription) {
						docs.push('');
						docs.push('---');
						docs.push('');
						docs.push('### 💡 Inline usage');
						docs.push('');
						docs.push(`**Description:** ${kwDef.inlineDescription}`);
						docs.push('');
						docs.push('**Example:**');
						docs.push('```dialogue');
						docs.push(kwDef.inlineExample || '');
						docs.push('```');
					}

					return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
				}
			}
		}

		// ✅ 2. Check other special keywords (~, =>, {{, }}, %).
		const keywordRange = document.getWordRangeAtPosition(
			position,
			/~|=>|\{\{|\}\}|%\d*/
		);

		if (keywordRange) {
			let word = document.getText(keywordRange);
			if (word.startsWith('%')) word = '%';

			const kwDef = DIALOGUE_KEYWORDS[word];
			if (kwDef) {
				console.log(`[Dialogue] 🔍 Found special keyword: ${word}`);
				const docs: string[] = [];
				docs.push(`## 🔑 ${word}`);
				docs.push('');
				docs.push(`**Description:** ${kwDef.description}`);
				docs.push('');
				docs.push('**Example:**');
				docs.push('```dialogue');
				docs.push(kwDef.example);
				docs.push('```');
				return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
			}
		}

		// ✅ 3. Check inline tags.
		const inlineTagRegex = /\[(do!?|set)\s+([^\]]+)\]|\[(\/?[a-zA-Z_][a-zA-Z0-9_]*)(?:[\s=]([^\]]+))?\]/g;
		let match;

		while ((match = inlineTagRegex.exec(line)) !== null) {
			const tagStart = match.index;
			const tagEnd = match.index + match[0].length;

			if (position.character >= tagStart && position.character <= tagEnd) {
				if (match[1]) {
					const tagName = match[1];
					const tagValue = match[2]?.trim();
					console.log(`[Dialogue] 🔍 Found inline action tag: [${tagName} ${tagValue}]`);
					return this.getInlineTagHover(tagName, tagValue);
				}

				const tagName = match[3]?.replace(/^\//, '');
				const tagValue = match[4]?.trim();
				console.log(`[Dialogue] 🔍 Found inline tag: [${match[3]}${tagValue ? ' ' + tagValue : ''}]`);
				return this.getInlineTagHover(tagName, tagValue);
			}
		}

		// ✅ 4. Check metadata tags.
		const metadataTagRegex = /\[#([\w\s,]+)\]/g;
		while ((match = metadataTagRegex.exec(line)) !== null) {
			const tagStart = match.index;
			const tagEnd = match.index + match[0].length;

			if (position.character >= tagStart && position.character <= tagEnd) {
				const tagsText = match[1];
				const tags = tagsText.split(',').map(t => t.trim());

				let currentPos = tagStart + 2;
				for (const tag of tags) {
					const thisTagStart = currentPos;
					const thisTagEnd = thisTagStart + tag.length;

					if (position.character >= thisTagStart && position.character <= thisTagEnd) {
						console.log(`[Dialogue] 🔍 Found metadata tag: #${tag}`);
						return this.getInlineTagHover(tag, undefined);
					}

					currentPos = thisTagEnd + 2;
				}
			}
		}

		return undefined;
	}

	/**
	 * Get inline tag hover information.
	 */
	private getInlineTagHover(tagName: string, tagValue?: string, aliasName?: string): vscode.Hover | undefined {
		const tagDef = this.tagConfigManager.getTag(tagName);

		if (!tagDef) {
			console.log(`[Dialogue] ⚠️ Unknown tag: ${tagName}`);
			return new vscode.Hover(
				new vscode.MarkdownString(
					`⚠️ **Undefined tag:** \`${tagName}\`\n\n` +
					`💡 You can add a description for this tag in Settings.`
				)
			);
		}

		// ✅ For do/do!/set, prefer the inline usage description.
		const kwDef = DIALOGUE_KEYWORDS[tagName];
		const useInlineDescription = kwDef?.inlineDescription && tagDef.isInline;

		// Build the hover documentation.
		const docs: string[] = [];

		// Category icons.
		const categoryIcons: Record<string, string> = {
			time: '⏱️',
			audio: '🔊',
			effect: '✨',
			ui: '🎮',
			metadata: '🏷️',
			action: '⚡'
		};

		// ✅ Show category information for metadata tags.
		if (tagDef.isMetadata) {
			const metadataCategory = (tagDef as any).metadataCategory;
			const categoryConfig = metadataCategory
				? this.tagConfigManager.getMetadataCategory(metadataCategory)
				: undefined;
			const icon = categoryConfig?.icon || '🏷️';
			const categoryDesc = categoryConfig?.description || 'Other';
			
			// ✅ Show alias information when hovering over an alias.
			if (aliasName) {
				docs.push(`## 🔄 Alias: ${aliasName}`);
				docs.push('');
				docs.push(`**Canonical tag:** \`#${tagDef.name}\``);
				docs.push('');
			} else {
				docs.push(`## ${icon} #${tagDef.name}`);
				docs.push('');
			}
			docs.push(`**Category:** ${categoryDesc}`);
			docs.push('');
		} else {
			docs.push(`## ${categoryIcons[tagDef.category]} [${tagDef.name}]`);
			docs.push('');
		}

		// ✅ Show the inline description when available.
		if (useInlineDescription && kwDef) {
			docs.push(`**Description:** ${kwDef.inlineDescription}`);
		} else {
			docs.push(`**Description:** ${tagDef.description}`);
		}

		// ✅ Show alias information.
		if (tagDef.alias && tagDef.alias.length > 0) {
			docs.push('');
			const allAlias = aliasName
				? tagDef.alias.filter(a => a !== aliasName)
				: tagDef.alias;
			
			if (allAlias.length > 0) {
				const aliasLabel = aliasName ? 'Other aliases' : 'Aliases';
				docs.push(`**${aliasLabel}:** ${allAlias.map(a => `\`${a}\``).join(', ')}`);
			}
		}

		if (tagDef.hasValue) {
			docs.push('');
			docs.push(`**Parameter type:** \`${tagDef.valueType}\``);
			docs.push('');
			docs.push(`**Parameter description:** ${tagDef.valueHint}`);

			if (tagValue) {
				docs.push('');
				docs.push(`**Current value:** \`${tagValue}\``);

				// Validate the value.
				if (tagDef.valueType === 'number' && isNaN(Number(tagValue))) {
					docs.push('');
					docs.push('⚠️ **Warning:** The current value is not a valid number');
				}
			}
		}

		docs.push('');
		docs.push('**Example:**');
		docs.push('```dialogue');
		// ✅ Prefer the inline example.
		if (useInlineDescription && kwDef?.inlineExample) {
			docs.push(kwDef.inlineExample);
		} else {
			docs.push(tagDef.example);
		}
		docs.push('```');

		// ✅ For do/set, also show line-start usage.
		if (kwDef && (tagName === 'do' || tagName === 'do!' || tagName === 'set')) {
			docs.push('');
			docs.push('---');
			docs.push('');
			docs.push('### 💡 Line-start usage');
			docs.push('');
			docs.push(`**Description:** ${kwDef.description}`);
			docs.push('');
			docs.push('**Example:**');
			docs.push('```dialogue');
			docs.push(kwDef.example);
			docs.push('```');
		}

		if (tagDef.isPair) {
			docs.push('');
			docs.push('⚠️ **Paired tag**; closing tag required `[/' + tagDef.name + ']`');
		}

		return new vscode.Hover(new vscode.MarkdownString(docs.join('\n')));
	}
}