# Godot Dialogue Manager - VS Code Extension

<p align="center">
  <img src="icon.png" alt="Logo" width="200"/>
</p>

<p align="center">
  <strong>A VS Code extension providing complete development support for Godot 4.x Dialogue Manager</strong>
</p>

<p align="center">
  <a href="https://github.com/hakubox/dialogue-godot-support">GitHub</a> •
  <a href="https://github.com/hakubox/dialogue-godot-support/issues">Report an issue</a> •
  <a href="https://github.com/hakubox/dialogue-godot-support/releases">Download</a>
</p>

---

## 📖 Contents

- Core features [<sup>1</sup>](#-core-features)
- Quick start [<sup>2</sup>](#-quick-start)
- Detailed features [<sup>3</sup>](#-detailed-features)
- Configuration [<sup>4</sup>](#-configuration)
- Examples [<sup>5</sup>](#-examples)
- FAQ [<sup>6</sup>](#-faq)
- Development and contributing [<sup>7</sup>](#-development-and-contributing)

---

## ✨ Core Features

### 🎨 **Complete syntax highlighting**
- Full Dialogue Manager syntax support (titles, dialogue, choices, conditions, loops, and more)
- BBCode and built-in tag highlighting
- Syntax coloring for code blocks and expressions

### 🧠 **Intelligent code completion**
| Type | Description | Trigger |
|------|------|----------|
| **Godot classes/methods** | Detects global classes, AutoLoad singletons, methods, properties, and signals | Type a class name followed by `.` |
| **Title navigation** | Local and cross-file title completion with `END`/`END!` support | Type `=>` or `-` |
| **Import paths** | Scans workspace `.dialogue` files and generates aliases | Type `import ` |
| **Dialogue tags** | 20+ built-in tags for timing, audio, text effects, and more | Type `[` |
| **Custom metadata tags** | Configurable custom tags for expressions, audio, effects, and more | Type `[#` |

### 🔍 **Hover information**
- **Godot members**: Method signatures, parameters, return values, and documentation
- **Title references**: Title descriptions, source files, and previews
- **Import paths**: File sizes and title counts
- **Tags**: Purpose, parameters, and examples

### 🚀 **Go to definition**
- `Ctrl + Click` to jump to GDScript classes, methods, properties, and signals
- Jump to title definitions, including across files
- Jump to imported `.dialogue` files

### 🔧 **Real-time diagnostics and quick fixes**
- Detect misspelled class and method names
- Validate argument counts and types
- Detect undefined title references
- One-click fixes for spelling, type conversion, and missing arguments

### 📦 **Dialogue export**
- Export to JSON, CSV, or Markdown
- Extract character dialogue, narration, and choices
- Remove BBCode and tags, with an option to preserve raw text
- Manage dialogue IDs by adding or removing them

### 🗂️ **Code folding**
- Automatically fold titles from `~ title` to the final `=>`
- Support custom `#region` / `#endregion` regions

---

## 🚀 Quick Start

### 1. Install the extension

#### Method A: Install from the VS Code Marketplace
1. Open VS Code
2. Press `Ctrl+Shift+X` to open the Extensions view
3. Search for `Godot Dialogue Manager`
4. Click **Install**

#### Method B: Install manually from a `.vsix`
1. Download the latest `.vsix` file from GitHub Releases [<sup>8</sup>](https://github.com/hakubox/dialogue-godot-support/releases)
2. Press `Ctrl+Shift+P` in VS Code
3. Enter `Extensions: Install from VSIX...`
4. Select the downloaded `.vsix` file

### 2. Open a Godot project
Make sure your project includes the Dialogue Manager plugin and contains `.dialogue` files.

### 3. Start writing dialogue
Create or open a `.dialogue` file and enter the following to test the extension:

```dialogue
~ start
# This is a test title

NPC: Hello! [#happy]
Player: Hello, may I ask...

- I want to buy something => shop
- I want to leave => END

~ shop
do! ShopManager.open_shop()
=> END
```

---

## 📚 Detailed Features

### 1️⃣ **Godot class and method completion**

#### 🔹 Automatically detect project classes
The extension scans `.godot/global_script_class_cache.cfg` and `project.godot` to detect:
- All global classes declared with `class_name`
- AutoLoad singletons such as `PlayerState` and `AudioManager`
- Inheritance relationships and documentation comments

#### 🔹 Smart triggering
Completion is triggered only in these contexts to avoid interfering with dialogue text:
- `do` / `do!` statements
- `set` statements
- `if` / `elif` conditions
- `{{ }}` interpolation
- `while` / `match` / `when` control flow

#### 🔹 Example

```dialogue
# ✅ Complete PlayerState methods
do PlayerState.add_gold(100)

# ✅ Complete properties
set player.health = 100

# ✅ Complete AutoLoad singletons
if AudioManager.is_playing("bgm_battle")
	do AudioManager.stop("bgm_battle")
endif

# ✅ Complete inside interpolation
NPC: You have {{PlayerState.gold}} gold.
```

#### 🔹 Access global members without a class prefix

After configuring global classes in `settings.json`, you can omit the class name:

```json
{
  "dialogue.diagnostics.globalClasses": [
    "PlayerState",
    "AudioManager"
  ]
}
```

You can then write:

```dialogue
# ❌ Previously required
do PlayerState.add_gold(100)
if PlayerState.gold >= 50

# ✅ After configuration
do add_gold(100)
if gold >= 50
```

---

### 2️⃣ **Title navigation completion**

#### 🔹 Local titles
The extension automatically scans all title definitions (`~ xxx`) in the current file:

```dialogue
~ start
NPC: Welcome!

- Start the adventure => dungeon    # ← Complete a local title
- Visit the shop => shop
- Leave => END                       # ← Built-in keyword

~ dungeon
# Dungeon scene...

~ shop
# Shop scene...
```

#### 🔹 Cross-file titles
Titles in files imported with `import` are also supported:

```dialogue
import "res://dialogues/common.dialogue" as Common
import "res://dialogues/chapter1.dialogue" as Ch1

~ start
NPC: Choose a chapter:

- Chapter one => Ch1/intro        # ← Complete a Ch1 title
- Help => Common/help              # ← Complete a Common title
- Return => start
```

#### 🔹 Immediate navigation (the `!` suffix)
Dialogue Manager's immediate navigation syntax is supported:

```dialogue
- Quick jump => next_scene!    # Do not wait for the current dialogue to finish
=> END!                         # Force an immediate end
```

#### 🔹 Hover information

When hovering over a title reference, the extension shows:
- The title name and full path
- Comments above the title (`#` or `##`)
- **A preview of the first dialogue line**
- The source file, local or imported

```dialogue
~ battle_start
# Battle begins
# The player enters the battle area

NPC: Prepare for battle!

# Hovering over => battle_start shows:
# 📍 battle_start
# **Preview:** `NPC: Prepare for battle!`
# **Description:**
# Battle begins
# The player enters the battle area
# **Location:** Line 10
```

---

### 3️⃣ **Import path completion**

#### 🔹 Automatically scan the workspace
The extension recursively scans all `.dialogue` files in the workspace and generates PascalCase aliases.

```dialogue
# Type import followed by a space to show all .dialogue files
import "res://dialogues/chapter1/intro.dialogue" as Chapter1Intro
```

#### 🔹 Directory navigation
Enter paths one directory at a time:

```dialogue
import "res://dialogues/    # ← Shows all files and subdirectories in dialogues
import "res://dialogues/chapter1/    # ← Shows files in the chapter1 directory
```

#### 🔹 Hover information
When hovering over an `import` path, the extension shows:
- The full file path
- File size
- Title count
- A one-click navigation link

---

### 4️⃣ **Dialogue tag completion**

#### 🔹 Built-in tags (20+)

Type `[` to show suggestions grouped by category:

| Category | Tags | Description |
|------|------|------|
| **Timing** | `[wait]`, `[speed]`, `[pause]` | Control dialogue speed and wait time |
| **Audio** | `[sound]`, `[voice]` | Play sound effects and voice lines |
| **Text effects** | `[wave]`, `[shake]`, `[rainbow]`, `[ghost]`, `[pulse]` | Text animation effects |
| **UI control** | `[br]`, `[signal]`, `[next]`, `[auto]`, `[jump]` | Line breaks, signals, autoplay, and more |
| **BBCode** | `[b]`, `[i]`, `[u]`, `[s]`, `[color]`, `[font]`, `[size]` | Rich-text formatting |

#### 🔹 Example

```dialogue
NPC: Hello[wait=1.5], welcome here!
This is a [wave]wavy text[/wave] effect.
[sound path="res://audio/coin.wav"]You received gold!
```

#### 🔹 Smart placeholders
Placeholders are generated automatically when inserting tags:

```dialogue
[wait=|]              # Cursor is placed at |
[sound path="|"]      # Cursor is placed in the path
[wave]|[/wave]        # Automatically closed with the cursor inside
```

---

### 5️⃣ **Custom metadata tags**

#### 🔹 Configure custom tags

Configure them in `settings.json`:

```json
{
  "dialogue.diagnostics.customTags": {
    "happy": {
      "description": "Happy expression",
      "example": "NPC: Hello! [#happy]",
      "category": "face",
      "alias": ["joyful", "cheerful"]
    },
    "knock_sound": {
      "description": "Knocking sound",
      "example": "[#knock_sound]",
      "category": "se",
      "alias": ["knocking"]
    }
  },
  "dialogue.diagnostics.metadataCategories": {
    "face": {
      "icon": "😊",
      "description": "Expression"
    },
    "se": {
      "icon": "🔊",
      "description": "Audio"
    }
  }
}
```

#### 🔹 Use custom tags

```dialogue
NPC: Hello! [#happy]          # or [#joyful]
*Knock knock* [#knock_sound]  # or [#knocking]
```

#### 🔹 Manage tags

Context menu → `Dialogue: Open Tag Settings` or `Dialogue: Add New Metadata Tag`

---

### 6️⃣ **Global variable support**

#### 🔹 Configure global variables

Define them in `settings.json`:

```json
{
  "dialogue.diagnostics.globalVariables": {
    // Simple types
    "playerName": {
      "type": "String",
      "comment": "Player character name"
    },
    "gold": {
      "type": "int",
      "comment": "Current gold"
    },
    
    // Complex nested types
    "playerStats": {
      "type": "Dictionary",
      "comment": "Player stats",
      "schema": {
        "hp": {
          "type": "int",
          "comment": "Health"
        },
        "skills": {
          "type": "Array",
          "itemType": "String",
          "comment": "Skill list"
        },
        "equipment": {
          "type": "Dictionary",
          "comment": "Equipment",
          "schema": {
            "weapon": { "type": "String" },
            "armor": { "type": "String?", "comment": "Optional" }
          }
        }
      }
    }
  }
}
```

#### 🔹 Use global variables

```dialogue
# ✅ Access a global variable
if gold >= 100
  NPC: Your gold: {{gold}}
endif

# ✅ Access a nested property
set playerStats.hp += 10
if playerStats.equipment.weapon == "sword"
  NPC: You equipped a sword!
endif

# ✅ Work with an array
if "fireball" in playerStats.skills
  NPC: You know Fireball!
endif
```

#### 🔹 Type checking

The extension validates:
- Whether property paths exist, such as `playerStats.equipment.weapon`
- Access to optional properties (`String?`)
- Array element types

---

### 7️⃣ **Real-time diagnostics and quick fixes**

#### 🔹 Detected error types

| Error type | Example | Quick fix |
|----------|------|----------|
| **Misspelled class name** | `PlayerStat.add_gold(100)` | Suggests `PlayerState` |
| **Misspelled method name** | `PlayerState.add_gld(100)` | Suggests `add_gold` |
| **Incorrect argument count** | `PlayerState.add_gold()` | Fills in required arguments |
| **Incorrect argument type** | `add_gold("100")` | Converts to `int("100")` |
| **Undefined title** | `=> undefined_title` | Suggests creating or correcting the title |

#### 🔹 Spelling correction algorithm
The extension uses the **Levenshtein distance algorithm** to suggest similar class and method names:

```dialogue
# ❌ Error
do PlayrState.add_gold(100)
   ^^^^^^^^^
  Class not found: 'PlayrState'

# 💡 Quick-fix suggestions:
# 1. Change 'PlayrState' to 'PlayerState'
# 2. Change 'PlayrState' to 'PlayerStat'
```

#### 🔹 Type conversion
The extension automatically suggests type conversions:

```dialogue
# ⚠️ Warning
do PlayerState.add_gold("100")
                       ^^^^^
  Parameter type mismatch: expected 'int', received 'String'

# 💡 Quick fix:
# Convert to int: int("100")
```

---

### 8️⃣ **Dialogue export**

#### 🔹 Export formats

Context menu → `Dialogue: Export Dialogue`, with support for:
- **JSON (Pretty)**: Easy to read and edit
- **JSON (Compact)**: Suitable for programmatic use
- **CSV**: Can be opened in Excel
- **Markdown**: Table format

#### 🔹 Exported content

```json
[
  {
    "id": "DLG_0001",
    "type": "character",
    "speaker": "NPC",
    "text": "Hello, welcome!",
    "rawText": "Hello, [wave]welcome[/wave]! [#happy]",
    "line": 5,
    "tags": ["happy"],
    "hasInlineCode": false
  },
  {
    "id": "DLG_0002",
    "type": "narration",
    "text": "This is a narration line.",
    "rawText": "This is a narration line.",
    "line": 6,
    "tags": [],
    "hasInlineCode": false
  }
]
```

#### 🔹 Dialogue ID management

Context menu → `Dialogue: Add IDs to All Dialogue Lines`

```dialogue
# IDs added automatically
NPC: Hello! [ID:A1B2C3D4E5F6]
Player: Hello. [ID:123456789ABC]

# Remove IDs
Context menu → `Dialogue: Remove All Dialogue IDs`
```

---

### 9️⃣ **Code folding**

#### 🔹 Automatically fold titles
Fold from `~ title` to the final `=>`:

```dialogue
~ start         # ← Click the folding icon
NPC: Hello!
- Choice 1 => a
- Choice 2 => b
=> END          # ← Fold to here
```

#### 🔹 Custom regions
Use `#region` / `#endregion`:

```dialogue
#region Chapter one dialogue
~ intro
...
~ ending
...
#endregion

#region Battle dialogue
~ battle_start
...
#endregion
```

---

## ⚙️ Configuration

### Complete configuration example

```json
{
  // ========== Global class configuration ==========
  "dialogue.diagnostics.globalClasses": [
    "PlayerState",
    "AudioManager",
    "SaveManager"
  ],

  // ========== Global variable configuration ==========
  "dialogue.diagnostics.globalVariables": {
    "playerName": {
      "type": "String",
      "comment": "Player name"
    },
    "playerStats": {
      "type": "Dictionary",
      "schema": {
        "hp": { "type": "int" },
        "mp": { "type": "int" }
      }
    }
  },

  // ========== Custom tag configuration ==========
  "dialogue.diagnostics.customTags": {
    "happy": {
      "description": "Happy expression",
      "category": "face",
      "alias": ["joyful"]
    }
  },

  // ========== Tag category configuration ==========
  "dialogue.diagnostics.metadataCategories": {
    "face": {
      "icon": "😊",
      "description": "Expression"
    }
  },

  // ========== Other options ==========
  "dialogue.diagnostics.enableCustomTags": true,
  "dialogue.diagnostics.strictMode": false
}
```

## ❓ FAQ

### Q1: Why is my class missing from the completion list?
**A**: Make sure your class uses a `class_name` declaration:

```gdscript
# ✅ Correct
class_name PlayerState
extends Node

# ❌ Incorrect
extends Node
```

Alternatively, register the class globally, then restart VS Code or wait for the class cache to refresh.

---

### Q2: Why is cross-file title completion not working?
**A**: Make sure that:
1. The `import` statement is correct and uses a `res://` path
2. The imported `.dialogue` file has been opened to trigger scanning
3. The imported file contains a `~ xxx` title definition

---

### Q3: How can I disable specific checks?
**A**: Set the option in `settings.json`:

```json
{
  "dialogue.diagnostics.strictMode": false  // Disable strict mode
}
```

---

### Q4: Why are private members (starting with `_`) not displayed?
**A**: This is expected and follows GDScript visibility rules. To access a private member, enter its full name manually; it will not be completed automatically.

---

### Q5: Why is completion slow when opening a project for the first time?
**A**: The extension scans all GDScript files to build the class cache, which usually takes 2-5 seconds. Wait for `✅ Class cache initialization complete` in the console before using completion.

---

## 🛠️ Development and Contributing

### Setup

```bash
git clone https://github.com/hakubox/dialogue-godot-support.git
cd dialogue-godot-support
npm install
```

### Debugging

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Open a Godot project in the new window and test the extension

### Packaging

```bash
npm run package
# Generates dist/dialogue-godot-support-x.x.x.vsix
```

### Contributing

Issues and pull requests are welcome. Please make sure to:
- Follow TypeScript conventions
- Add necessary comments
- Test new features

---

## 📄 License

MIT License - See the LICENSE [<sup>9</sup>](LICENSE) file for details

---

## 🙏 Acknowledgements

- Godot Engine [<sup>10</sup>](https://godotengine.org/)
- Dialogue Manager Plugin [<sup>11</sup>](https://github.com/nathanhoad/godot_dialogue_manager) by Nathan Hoad
- VSCode Extension API [<sup>12</sup>](https://code.visualstudio.com/api)

---

## 📧 Contact

- **GitHub Issues**: Submit an issue [<sup>13</sup>](https://github.com/hakubox/dialogue-godot-support/issues)
- **Author**: hakubox
- **Email**: hakubox@outlook.com

---

<p align="center">
  <strong>If this extension helps you, please give it a ⭐️ Star!</strong>
</p>