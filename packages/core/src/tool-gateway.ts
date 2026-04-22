import type { ToolDefinition } from "./domain.js";
import { evaluatePolicy, type PolicyAction } from "./policy-engine.js";
import type { Capability } from "./policy.js";

export type ToolHandler = (input: unknown) => unknown | Promise<unknown>;

export interface ToolGatewayTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export interface ToolExecutionRequest {
  action_id: string;
  step_id: string;
  tool_name: string;
  input: unknown;
  granted_capabilities: readonly Capability[];
  scope_allowed: boolean;
  approval_granted?: boolean;
  audit_available?: boolean;
  sandbox_matched?: boolean;
}

export type ToolExecutionResult =
  | { status: "succeeded"; output: unknown; policy: ReturnType<typeof evaluatePolicy> }
  | { status: "requires_approval"; policy: ReturnType<typeof evaluatePolicy> }
  | { status: "denied"; policy: ReturnType<typeof evaluatePolicy> }
  | { status: "failed"; policy?: ReturnType<typeof evaluatePolicy>; error: unknown };

export class InMemoryToolGateway {
  private readonly tools = new Map<string, ToolGatewayTool>();

  registerTool(tool: ToolGatewayTool): void;
  registerTool(definition: ToolDefinition, handler: ToolHandler): void;
  registerTool(
    toolOrDefinition: ToolGatewayTool | ToolDefinition,
    handler?: ToolHandler,
  ): void {
    const tool =
      handler === undefined
        ? (toolOrDefinition as ToolGatewayTool)
        : { definition: toolOrDefinition as ToolDefinition, handler };

    this.tools.set(tool.definition.name, {
      definition: {
        ...tool.definition,
        capabilities: [...tool.definition.capabilities],
        status: tool.definition.status ?? "enabled",
      },
      handler: tool.handler,
    });
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const tool = this.tools.get(request.tool_name);

    if (
      tool === undefined ||
      tool.definition.status === "disabled" ||
      tool.definition.status === "deprecated"
    ) {
      const policy = evaluatePolicy({
        id: request.action_id,
        step_id: request.step_id,
        tool_name: request.tool_name,
        requested_capabilities: [],
        granted_capabilities: request.granted_capabilities,
        risk_level: "low",
        scope_allowed: request.scope_allowed,
        approval_granted: request.approval_granted,
        audit_available: request.audit_available,
        tool_registered: false,
        sandbox_matched: request.sandbox_matched,
      });

      return { status: "denied", policy };
    }

    const policyAction: PolicyAction = {
      id: request.action_id,
      step_id: request.step_id,
      tool_name: request.tool_name,
      requested_capabilities: tool.definition.capabilities,
      granted_capabilities: request.granted_capabilities,
      risk_level: tool.definition.default_risk,
      scope_allowed: request.scope_allowed,
      approval_granted: request.approval_granted,
      audit_available: request.audit_available,
      tool_registered: true,
      sandbox_matched: request.sandbox_matched,
    };

    const policy = evaluatePolicy(policyAction);

    if (policy.decision === "deny") {
      return { status: "denied", policy };
    }

    if (policy.decision === "require_approval") {
      return { status: "requires_approval", policy };
    }

    try {
      const output = await tool.handler(request.input);
      return { status: "succeeded", output, policy };
    } catch (error) {
      return { status: "failed", error, policy };
    }
  }
}
