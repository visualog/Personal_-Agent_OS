import assert from "node:assert/strict";
import test from "node:test";

import * as core from "../src/index.js";
import type { ToolDefinition } from "../src/index.js";

const {
  InMemoryToolRegistry,
  InMemoryToolGateway,
} = core as {
  InMemoryToolRegistry: new () => {
    register: (tool: ToolDefinition) => void;
    get: (name: string) => ToolDefinition | undefined;
    list: () => readonly ToolDefinition[];
    unregister: (name: string) => boolean;
  };
  InMemoryToolGateway: new () => {
    registerTool: (tool: ToolDefinition, handler: (input: unknown) => unknown | Promise<unknown>) => void;
    execute: (request: {
      action_id: string;
      step_id: string;
      tool_name: string;
      input: unknown;
      granted_capabilities: readonly string[];
      scope_allowed: boolean;
      approval_granted?: boolean;
      audit_available?: boolean;
      sandbox_matched?: boolean;
    }) => Promise<
      | { status: "succeeded"; output: unknown }
      | { status: "requires_approval" }
      | { status: "denied" }
      | { status: "failed"; error: unknown }
    >;
  };
};

function createToolDefinition(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "workspace.read_file",
    description: "Read a file from workspace",
    input_schema: { type: "object" },
    output_schema: { type: "string" },
    capabilities: ["workspace.read"],
    default_risk: "low",
    requires_approval: false,
    sandbox: "workspace",
    ...overrides,
  };
}

test("exports the intended tool runtime API from the barrel", () => {
  assert.equal(typeof InMemoryToolRegistry, "function");
  assert.equal(typeof InMemoryToolGateway, "function");
});

test("registry register/get/list/unregister and default enabled status", () => {
  const registry = new InMemoryToolRegistry();
  const tool = createToolDefinition();

  registry.register(tool);

  assert.deepEqual(registry.get(tool.name), {
    ...tool,
    status: "enabled",
  });
  assert.deepEqual(registry.list(), [{ ...tool, status: "enabled" }]);
  assert.equal(registry.unregister(tool.name), true);
  assert.equal(registry.get(tool.name), undefined);
  assert.deepEqual(registry.list(), []);
});

test("gateway executes low-risk registered read tool successfully", async () => {
  const gateway = new InMemoryToolGateway();
  const tool = createToolDefinition({
    name: "workspace.read_file",
    capabilities: ["workspace.read"],
    default_risk: "low",
  });

  gateway.registerTool(tool, async (input) => ({ read: input }));

  const result = await gateway.execute({
    action_id: "action_01",
    step_id: "step_01",
    tool_name: tool.name,
    input: { path: "README.md" },
    granted_capabilities: ["workspace.read"],
    scope_allowed: true,
    sandbox_matched: true,
  });

  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.output, { read: { path: "README.md" } });
});

test("gateway denies missing capability", async () => {
  const gateway = new InMemoryToolGateway();
  const tool = createToolDefinition({
    name: "workspace.write_file",
    capabilities: ["workspace.write"],
    default_risk: "medium",
    requires_approval: true,
  });

  gateway.registerTool(tool, () => "written");

  const result = await gateway.execute({
    action_id: "action_02",
    step_id: "step_02",
    tool_name: tool.name,
    input: { path: "README.md" },
    granted_capabilities: ["workspace.read"],
    scope_allowed: true,
    sandbox_matched: true,
  });

  assert.equal(result.status, "denied");
});

test("gateway returns requires_approval for medium write without approval", async () => {
  const gateway = new InMemoryToolGateway();
  const tool = createToolDefinition({
    name: "workspace.write_file",
    capabilities: ["workspace.write"],
    default_risk: "medium",
    requires_approval: true,
  });

  gateway.registerTool(tool, () => "written");

  const result = await gateway.execute({
    action_id: "action_03",
    step_id: "step_03",
    tool_name: tool.name,
    input: { path: "README.md" },
    granted_capabilities: ["workspace.write"],
    scope_allowed: true,
    sandbox_matched: true,
  });

  assert.equal(result.status, "requires_approval");
});

test("gateway succeeds for medium write with approval", async () => {
  const gateway = new InMemoryToolGateway();
  const tool = createToolDefinition({
    name: "workspace.write_file",
    capabilities: ["workspace.write"],
    default_risk: "medium",
    requires_approval: true,
  });

  gateway.registerTool(tool, async () => "written");

  const result = await gateway.execute({
    action_id: "action_04",
    step_id: "step_04",
    tool_name: tool.name,
    input: { path: "README.md" },
    granted_capabilities: ["workspace.write"],
    scope_allowed: true,
    approval_granted: true,
    sandbox_matched: true,
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.output, "written");
});

test("gateway denies unknown tool", async () => {
  const gateway = new InMemoryToolGateway();

  const result = await gateway.execute({
    action_id: "action_05",
    step_id: "step_05",
    tool_name: "workspace.missing_tool",
    input: null,
    granted_capabilities: ["workspace.read"],
    scope_allowed: true,
    sandbox_matched: true,
  });

  assert.equal(result.status, "denied");
});

test("gateway returns failed when handler throws", async () => {
  const gateway = new InMemoryToolGateway();
  const tool = createToolDefinition({
    name: "workspace.read_file",
    capabilities: ["workspace.read"],
    default_risk: "low",
  });

  gateway.registerTool(tool, () => {
    throw new Error("boom");
  });

  const result = await gateway.execute({
    action_id: "action_06",
    step_id: "step_06",
    tool_name: tool.name,
    input: { path: "README.md" },
    granted_capabilities: ["workspace.read"],
    scope_allowed: true,
    sandbox_matched: true,
  });

  assert.equal(result.status, "failed");
  assert.match(String((result as { error: unknown }).error), /boom/);
});
