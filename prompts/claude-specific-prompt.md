## Claude Code

The project uses Claude Code. See the `@.claude` directory.

Claude Code is an AI coding assistant that operates in the terminal, helping with writing, understanding, improving, refactoring, documenting, and debugging code. It leverages specialized AI personalities called **Sub-agents** and custom **Skills** to perform tasks.

**Sub-agents:** These are specialized AI assistants. **Scan the `.claude/agents` directory to learn about their specific abilities and how to invoke them.** You can invoke them by mentioning their name in your prompt (e.g., `@implementer-coder`).
**Skills:** These are custom functionalities. **Scan the `.claude/skills` directory to understand their purpose and how they can be used.** They can be automatically invoked by Claude based on your request, or manually with a slash command if configured (e.g., `/my-custom-skill`).

### Further Reading

**What is Claude Code?**: https://docs.claude.com/en/docs/claude-code
**Sub-agents**: https://docs.claude.com/en/docs/claude-code/sub-agents
**Skills**: https://docs.claude.com/en/docs/claude-code/skills