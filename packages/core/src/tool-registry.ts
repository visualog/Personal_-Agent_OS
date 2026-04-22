import type { ToolDefinition } from "./domain.js";

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  getEnabled(name: string): ToolDefinition | undefined;
  has(name: string): boolean;
  list(): readonly ToolDefinition[];
  unregister(name: string): boolean;
  clear(): void;
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (value && typeof value === "object") {
    return { ...(value as Record<string, unknown>) } as T;
  }

  return value;
}

function normalizeTool(tool: ToolDefinition): ToolDefinition {
  return {
    ...tool,
    capabilities: [...tool.capabilities],
    input_schema: cloneValue(tool.input_schema),
    output_schema: cloneValue(tool.output_schema),
    status: tool.status ?? "enabled",
  };
}

function cloneTool(tool: ToolDefinition): ToolDefinition {
  return {
    ...tool,
    capabilities: [...tool.capabilities],
    input_schema: cloneValue(tool.input_schema),
    output_schema: cloneValue(tool.output_schema),
  };
}

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, normalizeTool(tool));
  }

  get(name: string): ToolDefinition | undefined {
    const tool = this.tools.get(name);
    return tool ? cloneTool(tool) : undefined;
  }

  getEnabled(name: string): ToolDefinition | undefined {
    const tool = this.tools.get(name);
    return tool?.status === "enabled" ? cloneTool(tool) : undefined;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): readonly ToolDefinition[] {
    return [...this.tools.values()].map((tool) => cloneTool(tool));
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  clear(): void {
    this.tools.clear();
  }
}
