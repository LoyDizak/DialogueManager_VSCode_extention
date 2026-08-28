import path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { GodotClass, GlobalVariable, GodotMethodParam, GlobalVariablesConfig } from './interface';

/** ============ Class cache manager ============ */
export class GodotClassCache {
  private classes: Map<string, GodotClass> = new Map();
  private autoloads: Map<string, string> = new Map(); // Singleton name -> file path
  private workspaceFolder?: vscode.WorkspaceFolder;
  private cachedGlobalClassNames: string = '';

  private globalMembers: Map<string, { className: string; type: 'method' | 'property' | 'signal' }> = new Map();
  /** Global variable storage */
  private globalVariables: Map<string, GlobalVariable> = new Map();

  constructor(workspaceFolder?: vscode.WorkspaceFolder) {
    this.workspaceFolder = workspaceFolder;
  }

  /**
  * Resolve a variable property path.
  * For example: playerStats.equipment.weapon
  * Returns the final property's type and comment.
    */
  resolveVariableProperty(
    variableName: string,
    propertyPath: string[]
  ): { type: string; comment?: string } | undefined {
    const variable = this.globalVariables.get(variableName);
    if (!variable) {
      console.log(`[Dialogue] ❌ Global variable not found: ${variableName}`);
      return undefined;
    }

    console.log(`[Dialogue] 🔍 Resolving property path: ${variableName}.${propertyPath.join('.')}`);

    // Recursively search from the root variable.
    return this.resolvePropertyInSchema(variable, propertyPath, 0);
  }

  /**
  * Recursively find a property in the schema.
   */
  private resolvePropertyInSchema(
    current: GlobalVariable,
    propertyPath: string[],
    depth: number
  ): { type: string; comment?: string } | undefined {
    // The end of the path has been reached.
    if (depth >= propertyPath.length) {
      return { type: current.type, comment: current.comment };
    }

    const currentProp = propertyPath[depth];

    // Access cannot continue unless the current type is a Dictionary.
    if (current.type !== 'Dictionary' || !current.schema) {
      console.log(`[Dialogue] ⚠️ Cannot access property '${currentProp}' on ${current.type}`);
      return undefined;
    }

    // Find the property in the schema.
    const nextProp = current.schema[currentProp];
    if (!nextProp) {
      console.log(`[Dialogue] ❌ Property does not exist: ${currentProp}`);
      return undefined;
    }

    // Continue recursively at the next level.
    return this.resolvePropertyInSchema(nextProp, propertyPath, depth + 1);
  }

  /**
  * Get all Dictionary properties for completion.
   */
  getVariableProperties(variableName: string, propertyPath: string[]): Array<{
    name: string;
    type: string;
    comment?: string;
  }> {
    const variable = this.globalVariables.get(variableName);
    if (!variable) return [];

    // Descend through each level until the target Dictionary is found.
    let current = variable;
    for (const prop of propertyPath) {
      if (current.type !== 'Dictionary' || !current.schema) {
        return [];
      }
      const next = current.schema[prop];
      if (!next) return [];
      current = next;
    }

    // Return all properties at the current level.
    if (current.type !== 'Dictionary' || !current.schema) {
      return [];
    }

    return Object.entries(current.schema).map(([name, def]) => ({
      name,
      type: def.type,
      comment: def.comment
    }));
  }

  async initialize(): Promise<void> {
    if (!this.workspaceFolder) {
      console.log('[Dialogue] ❌ No workspace; skipping initialization');
      return;
    }

    console.log('[Dialogue] -------- Starting class cache initialization --------');

    // 1. Parse global_script_class_cache.cfg.
    await this.loadGlobalClasses();

    // 2. Parse project.godot to find AutoLoads.
    await this.loadAutoloads();

    this.buildGlobalMembersIndex();

    // 4. Load global variables.
    this.loadGlobalVariables();

    console.log('[Dialogue] Class cache initialization complete');
    console.log('[Dialogue] 📊 Global classes:', this.classes.size);
    console.log('[Dialogue] 📊 AutoLoads:', this.autoloads.size);
    console.log('[Dialogue] 📊 Global members:', this.globalMembers.size);
    console.log('[Dialogue] 📊 Global variables:', this.globalVariables.size);
  }

  /**
  * Build the global member index from configured global classes.
   */
  private buildGlobalMembersIndex(): void {
    // Get the configured global class list.
    const config = vscode.workspace.getConfiguration('dialogue');
    const globalClassNames: string[] = config.get('diagnostics.globalClasses', []);

    // Skip rebuilding when the configuration is unchanged.
    const currentConfig = JSON.stringify(globalClassNames);
    if (this.cachedGlobalClassNames === currentConfig && this.globalMembers.size > 0) {
      console.log('[Dialogue] 🔄 Configuration unchanged; skipping index rebuild');
      return;
    }

    console.log('[Dialogue] 🌐 Configuration changed; rebuilding global member index');
    console.log('[Dialogue] 📋 Configured global classes:', globalClassNames);

    // Update the cache.
    this.cachedGlobalClassNames = currentConfig;

    // Clear the old index.
    this.globalMembers.clear();

    // Index each configured class.
    for (const className of globalClassNames) {
      const cls = this.classes.get(className);
      if (!cls) {
        console.warn(`[Dialogue] ⚠️ Global class not found: ${className}`);
        continue;
      }
      // Index methods.
      for (const method of cls.methods) {
        if (method.name.startsWith('_')) continue; // Skip private methods.
        if (this.globalMembers.has(method.name)) {
          console.warn(`[Dialogue] ⚠️ Member name conflict: ${method.name} (${className} and ${this.globalMembers.get(method.name)?.className})`);
        } else {
          this.globalMembers.set(method.name, { className, type: 'method' });
        }
      }
      // Index properties.
      for (const property of cls.properties) {
        if (property.name.startsWith('_')) continue;
        if (this.globalMembers.has(property.name)) {
          console.warn(`[Dialogue] ⚠️ Member name conflict: ${property.name}`);
        } else {
          this.globalMembers.set(property.name, { className, type: 'property' });
        }
      }
      // Index signals.
      for (const signal of cls.signals) {
        if (signal.startsWith('_')) continue;
        if (this.globalMembers.has(signal)) {
          console.warn(`[Dialogue] ⚠️ Member name conflict: ${signal}`);
        } else {
          this.globalMembers.set(signal, { className, type: 'signal' });
        }
      }
      console.log(`[Dialogue] 📦 Indexed global class: ${className}`);
    }
  }

  /**
  * Refresh the global member index after configuration changes.
   */
  refreshGlobalMembers(): void {
    console.log('[Dialogue] 🔄 Configuration changed; refreshing index');

    // Clear the cache to force a rebuild.
    this.cachedGlobalClassNames = '';

    this.buildGlobalMembersIndex();
  }

  /**
  * Find the global class that owns a member.
   */
  resolveGlobalMember(memberName: string): { className: string; type: 'method' | 'property' | 'signal' } | undefined {
    return this.globalMembers.get(memberName);
  }

  /**
  * Get all global members for completion.
   */
  getGlobalMembers(): Array<{ name: string; className: string; type: 'method' | 'property' | 'signal' }> {
    const members: Array<{ name: string; className: string; type: 'method' | 'property' | 'signal' }> = [];

    for (const [name, info] of this.globalMembers.entries()) {
      members.push({ name, ...info });
    }
    return members;
  }

  /** Load global classes. */
  private async loadGlobalClasses(): Promise<void> {
    const cachePath = path.join(
      this.workspaceFolder!.uri.fsPath,
      '.godot',
      'global_script_class_cache.cfg'
    );

    if (!fs.existsSync(cachePath)) {
      console.log('[Dialogue] ⚠️ Global class cache file does not exist');
      return;
    }

    const content = fs.readFileSync(cachePath, 'utf-8');
    const listMatch = content.match(/list\s*=\s*(\[[\s\S]*\])/);
    if (!listMatch) return;

    let arrayContent = listMatch[1].replace(/&"([^"]+)"/g, '"$1"');
    const classes = JSON.parse(arrayContent);

    for (const cls of classes) {
      const className = cls.class;
      const gdPath = this.resPathToFsPath(cls.path);

      const classInfo: GodotClass = {
        name: className,
        base: cls.base,
        path: cls.path,
        isTool: cls.is_tool,
        methods: [],
        properties: [],
        signals: [],
      };

      // Parse the GDScript file.
      if (fs.existsSync(gdPath)) {
        this.parseGDScriptFile(gdPath, classInfo);
      }

      this.classes.set(className, classInfo);
      console.log(`[Dialogue] 📦 Loaded class: ${className} (${classInfo.methods.length} methods, ${classInfo.properties.length} properties)`);
    }
  }

  /** Load AutoLoad singletons. */
  private async loadAutoloads(): Promise<void> {
    const projectPath = path.join(this.workspaceFolder!.uri.fsPath, 'project.godot');

    if (!fs.existsSync(projectPath)) {
      console.log('[Dialogue] ⚠️ project.godot does not exist');
      return;
    }

    const content = fs.readFileSync(projectPath, 'utf-8');

    // Match AutoLoad configuration.
    // Format: AudioManager="*res://scene/common/audio_manager/audio_manager.gd"
    const autoloadRegex = /^(\w+)="\*?(res:\/\/[^"]+)"$/gm;
    let match;

    while ((match = autoloadRegex.exec(content)) !== null) {
      const singletonName = match[1];
      const resPath = match[2];
      const fsPath = this.resPathToFsPath(resPath);

      this.autoloads.set(singletonName, resPath);
      console.log(`[Dialogue] 🌐 AutoLoad: ${singletonName} -> ${resPath}`);

      // Add it to the cache when it is not already a global class.
      if (!this.classes.has(singletonName) && fs.existsSync(fsPath)) {
        const classInfo: GodotClass = {
          name: singletonName,
          base: 'Node', // Default base class
          path: resPath,
          isTool: false,
          methods: [],
          properties: [],
          signals: [],
        };

        this.parseGDScriptFile(fsPath, classInfo);
        this.classes.set(singletonName, classInfo);
      }
    }
  }

  /** Parse GDScript file contents. */
  private parseGDScriptFile(fsPath: string, classInfo: GodotClass): void {
    try {
      const content = fs.readFileSync(fsPath, 'utf-8');
      const lines = content.split('\n');

      classInfo.classComment = this.extractClassComment(lines);

      let pendingDocComment: string | undefined;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Collect consecutive ## comments.
        if (trimmedLine.startsWith('##')) {
          const commentText = trimmedLine.substring(2).trim();
          if (pendingDocComment) {
            pendingDocComment += '\n' + commentText;
          } else {
            pendingDocComment = commentText;
          }
          continue;
        }

        // Match functions: func xxx() -> Type:
        const funcMatch = line.match(/^\s*(?:static\s+)?func\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\w+))?/);
        if (funcMatch) {
          const params = this.parseMethodParams(funcMatch[2]);  // Parse method parameters.

          classInfo.methods.push({
            name: funcMatch[1],
            returnType: funcMatch[3] || 'void',
            params: params,
            isStatic: line.includes('static'),
            docComment: pendingDocComment,
          });
          pendingDocComment = undefined;
          continue;
        }

        // Other code is intentionally ignored.
      }
    } catch (error) {
      console.error(`[Dialogue] ❌ Failed to parse file: ${fsPath}`, error);
    }
  }

  /**
  * Extract class comments from the top of the file (consecutive ## lines).
   */
  private extractClassComment(lines: string[]): string | undefined {
    const comments: string[] = [];
    let started = false;
    for (const line of lines) {
      const trimmed = line.trim();
      // Start collecting at the first ## line.
      if (trimmed.startsWith('##')) {
        started = true;
        const text = trimmed.substring(2).trim();
        if (text) {  // Skip empty comment lines.
          comments.push(text);
        }
        continue;
      }
      // Stop at the first non-comment line.
      if (started && trimmed && !trimmed.startsWith('#')) {
        break;
      }
    }
    return comments.length > 0 ? comments.join('\n') : undefined;
  }

  /**
  * Parse method parameters.
  * Input example: "slot_id: int, amount: float = 0.0, force: bool = false"
  * Output: [
   *   { name: "slot_id", type: "int", fullText: "slot_id: int" },
   *   { name: "amount", type: "float", defaultValue: "0.0", fullText: "amount: float = 0.0" },
   *   { name: "force", type: "bool", defaultValue: "false", fullText: "force: bool = false" }
   * ]
   */
  private parseMethodParams(paramsString: string): GodotMethodParam[] {
    if (!paramsString.trim()) return [];

    const params: GodotMethodParam[] = [];
    const paramList = paramsString.split(',');

    for (const param of paramList) {
      const trimmed = param.trim();
      if (!trimmed) continue;

      // Match the format: name: Type = default_value
      const match = trimmed.match(/^(\w+)\s*:\s*(\w+)(?:\s*=\s*(.+))?$/);

      if (match) {
        params.push({
          name: match[1],
          type: match[2],
          defaultValue: match[3]?.trim(),
          fullText: trimmed
        });
      } else {
        // Fallback for parameters that cannot be parsed.
        params.push({
          name: trimmed,
          type: 'Variant',
          fullText: trimmed
        });
      }
    }

    return params;
  }

  /** Convert a res:// path to a file-system path. */
  private resPathToFsPath(resPath: string): string {
    return path.join(
      this.workspaceFolder!.uri.fsPath,
      resPath.replace('res://', '')
    );
  }

  /** Get all classes. */
  getClasses(): GodotClass[] {
    return Array.from(this.classes.values());
  }

  /** Get a class by name. */
  getClass(name: string): GodotClass | undefined {
    console.log(`[Dialogue] 🔍 Looking up class: ${name}`);
    const cls = this.classes.get(name);

    if (cls) {
      console.log(`[Dialogue] Found: ${cls.name} (${cls.methods.length} methods, ${cls.properties.length} properties)`);
    } else {
      console.log(`[Dialogue] ❌ Not found`);
      console.log(`[Dialogue] 📋 Available classes: ${Array.from(this.classes.keys()).join(', ')}`);
    }

    return cls;
  }

  /** Check whether a name is an AutoLoad singleton. */
  isAutoload(name: string): boolean {
    return this.autoloads.has(name);
  }

  /**
  * Load global variable configuration.
   */
  loadGlobalVariables(): void {
    const config = vscode.workspace.getConfiguration('dialogue');
    const varsConfig: GlobalVariablesConfig = config.get('diagnostics.globalVariables', {});
    this.globalVariables.clear();
    for (const [name, def] of Object.entries(varsConfig)) {
      // Check whether the type is built-in or a defined class.
      const isBuiltIn = ['String', 'int', 'float', 'bool', 'Array', 'Dictionary', 'Variant', 'Node', 'Node2D', 'Node3D'].includes(def.type);
      const isCustomClass = this.classes.has(def.type);
      if (!isBuiltIn && !isCustomClass) {
        console.warn(`[Dialogue] ⚠️ Type '${def.type}' for global variable '${name}' was not found`);
      }
      this.globalVariables.set(name, def);
        console.log(`[Dialogue] 🌐 Global variable: ${name} (${def.type})`);
    }
    console.log(`[Dialogue] 📊 Global variables: ${this.globalVariables.size}`);
  }
  /**
  * Get a global variable.
   */
  getGlobalVariable(name: string): GlobalVariable | undefined {
    return this.globalVariables.get(name);
  }
  /**
  * Get all global variables for completion.
   */
  getAllGlobalVariables(): Array<{ name: string; def: GlobalVariable }> {
    return Array.from(this.globalVariables.entries()).map(([name, def]) => ({ name, def }));
  }
  /**
  * Refresh global variables after configuration changes.
   */
  refreshGlobalVariables(): void {
    console.log('[Dialogue] 🔄 Refreshing global variable configuration');
    this.loadGlobalVariables();
  }
}