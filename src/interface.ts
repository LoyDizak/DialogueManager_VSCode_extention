/** Godot global class information */
export interface GodotClass {
	name: string;           // Class name
	base: string;           // Base class
	path: string;           // File path
	isTool: boolean;        // Whether this is a tool script
	methods: GodotMethod[]; // Methods
	properties: GodotProperty[]; // Properties
	signals: string[];      // Signals
	classComment?: string;  // Class-level documentation comment
}

/** Method information */
export interface GodotMethod {
	name: string;
	returnType: string;
	params: GodotMethodParam[];
	isStatic: boolean;
	docComment?: string;
}

/** Method parameter information */
export interface GodotMethodParam {
	name: string;
	type: string;
	defaultValue?: string;  // Default value (optional when present)
	fullText: string;       // Full text (for example "slot_id: int = 1")
}

/** Property information */
export interface GodotProperty {
	name: string;
	type: string;
	isExported: boolean;
}

/** Global variable definition (supports complex nested types) */
export interface GlobalVariable {
	type: string;       // Base type
	comment?: string;   // Description
	schema?: GlobalVariableSchema;  // Dictionary internal structure
	itemType?: string;  // Array element type
}

/** Variable schema definition (recursive) */
export interface GlobalVariableSchema {
	[key: string]: GlobalVariable;  // Recursive definition with unlimited nesting
}

/** Global variable configuration (read from settings.json) */
export interface GlobalVariablesConfig {
	[variableName: string]: GlobalVariable;
}