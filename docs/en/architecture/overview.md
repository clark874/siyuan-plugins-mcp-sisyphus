# Overview

This page describes the top-level system layers and runtime shape.

When to read this page: you need a quick mental model of where MCP ends and SiYuan begins.

## Three-Layer View

1. AI agent / MCP client
2. MCP server and plugin runtime
3. SiYuan HTTP API and data model

## Key Facts

- The repo ships both a plugin and a standalone CLI
- The plugin can expose MCP over HTTP or stdio-backed execution
- Both entrypoints reuse the same tool registry and API wrapper layer
