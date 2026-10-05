# pi-system-one ⚡⚖️

> **System One** intelligent classifier router, tool dispatcher, and JEV/Clef decision engine for [@earendil-works/pi-coding-agent](https://pi.dev).

---

## 🌟 Overview

Large Language Models (System Two) excel at deep reasoning and conversation, but are slow and expensive for simple decisions. **`pi-system-one`** integrates ultra-fast, non-conversational **System One classifier models** (such as *TypeSafe JEV* and *Cloudflare Clef*) directly into Pi coding agent:

1. 🚀 **Pre-Flight Tool Routing (`before_agent_start`):**
   Reads the session's **live active tool list** (`pi.getAllTools()` ∩ `pi.getActiveTools()`), hands it to the classifier as choice criteria, and in **~200ms** decides *which concrete tool* the agent should call first (plus an optional supporting tool). The decision — not a vague hint — is injected into the system prompt guidelines, so the main model never selects tools itself.
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
| `/system-one test <prompt>` | Run live tool routing against the session's tool list; shows the selected tool chain, confidence, response time, and cost |
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
│   ├── shared/             # Kernel: types, state, config cascade, i18n, classifier client, tool candidates
│   └── slices/
│       ├── preflight/      # before_agent_start tool router (active tool list → classifier → guideline)
│       ├── tools/          # system_one_* agent tools
│       └── commands/       # /system-one & /s1 slash command handlers
└── test/                   # Automated unit tests
```

### How pre-flight routing works

```
user prompt
  → collectToolCandidates(pi)          # getAllTools() ∩ getActiveTools(), minus system_one_*
  → classifyToolSelection(...)         # one classifier call, three questions:
  │     needs_tools     (bool)         #   is any tool call needed at all?
  │     primary_tool    (choice)       #   which tool to call FIRST (+ answer_directly sentinel)
  │     supporting_tool (choice)       #   complementary second tool (+ none sentinel)
  → if confident (≥ confidenceThreshold):
        systemPromptOptions.promptGuidelines.push(
          "System One tool routing: call `kb_search` first, then `read` …")
        + optional UI notification
```

Sentinel choices (`answer_directly`, `none`) let the classifier explicitly decline tool use,
so conversational prompts are left untouched.

---

## 📄 License

MIT © [mastnacek](https://github.com/mastnacek)
