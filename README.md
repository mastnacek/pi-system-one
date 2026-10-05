# pi-system-one ⚡⚖️

> **System One** intelligent classifier router, tool dispatcher, and JEV/Clef decision engine for [@earendil-works/pi-coding-agent](https://pi.dev).

---

## 🌟 Overview

Large Language Models (System Two) excel at deep reasoning and conversation, but are slow and expensive for simple decisions. **`pi-system-one`** integrates ultra-fast, non-conversational **System One classifier models** (such as *TypeSafe JEV* and *Cloudflare Clef*) directly into Pi coding agent:

1. 🚀 **Pre-Flight Strategy Routing (`before_agent_start`):**
   Evaluates incoming user prompts in **~200ms** to identify the best tool domain (e.g. LotusScript, Code Search, File Editing, SPAI, Shell, Web Research) and automatically injects guidance into the system prompt.
2. 🛠️ **Autonomous Classifier Tools:**
   Exposes high-speed tools for the agent:
   - `system_one_classify` — evaluate arbitrary JSON state against boolean, categorical, or ordinal questions.
   - `system_one_route` — evaluate a task against candidate tools/skills and return ranked probability distributions.
   - `system_one_safety` — evaluate shell/git commands for destructive risk before execution.
3. 💬 **Interactive Slash Commands (`/system-one` or `/s1`):**
   Full control over routing modes (`auto`, `manual`, `off`), live prompt testing, statistics inspection, and multilingual UI (`en` / `cs`).

---

## 📦 Installation

Add directly to your Pi configuration (`~/.pi/agent/settings.json`):

```json
{
  "packages": [
    "D:/01_programovani/pi/plugins/pi-system-one"
  ]
}
```

Or install from git:
```bash
pi install git:github.com/mastnacek/pi-system-one
```

---

## ⚡ Slash Commands

| Command | Description |
|---|---|
| `/system-one status` | View current routing mode, active classifier model, and performance statistics |
| `/system-one mode <auto\|manual\|off> [--global]` | Set routing mode (`auto` evaluates every prompt; `manual` tools only) |
| `/system-one notify <on\|off> [--global]` | Toggle popup notifications for pre-flight routing |
| `/system-one test <prompt>` | Test live classification and measure response time and cost |
| `/system-one stats reset` | Reset classification count, latency, and spend statistics |
| `/system-one lang <en\|cs> [--global]` | Switch UI language |

*(You can also use the shorthand `/s1` for all commands).*

---

## 🛠️ Provided Tools

### 1. `system_one_route`
Routes a task description to the optimal option from candidate choices:
```typescript
await tools.system_one_route({
  task: "Find where session tokens are created in the backend",
  candidates: {
    symbol_search: "Search symbols and identifiers across the workspace",
    grep: "Simple textual search across files",
    web: "Search online web documentation"
  }
});
```

### 2. `system_one_safety`
Checks if a command is destructive:
```typescript
await tools.system_one_safety({
  command: "git reset --hard HEAD~1"
});
```

### 3. `system_one_classify`
General-purpose JSON state evaluator:
```typescript
await tools.system_one_classify({
  state: { diffLines: 15, containsAuthKey: true },
  questions: {
    isSensitive: {
      type: "bool",
      instructions: "Does this diff touch sensitive security keys?",
      criteria: { true: "Sensitive", false: "Standard" }
    }
  }
});
```

---

## 🏗️ Architecture

Built following **Vertical Slice Architecture (VSA)**:
```
pi-system-one/
├── index.ts                # Composition root (lifecycle, subagent guard)
├── src/
│   ├── shared/             # Kernel: types, state, config cascade, i18n, classifier client
│   └── slices/
│       ├── preflight/      # before_agent_start strategy router
│       ├── tools/          # system_one_* agent tools
│       └── commands/       # /system-one & /s1 slash command handlers
└── test/                   # Automated unit tests
```

---

## 📄 License

MIT © [mastnacek](https://github.com/mastnacek)
