# Design Decisions

This page records the main architectural choices behind the project.

When to read this page: you are evaluating whether a change fits the current design.

## Aggregated Tools

- The project exposes 10 aggregated tools instead of 100+ single-purpose tools
- Benefit: lower MCP surface area, better discoverability, smaller context footprint

## Progressive Disclosure

- Common actions appear in tool descriptions
- Detailed semantics live in help resources and reference pages

## Permission Model

- Notebook-level permissions are enforced as `none`, `r`, `rw`, `rwd`
- This creates a controllable boundary for external agents

## Shared Core for Plugin and CLI

- Plugin MCP server and CLI use the same tool registry and API layer
- This keeps behavior aligned across transports and user entrypoints
