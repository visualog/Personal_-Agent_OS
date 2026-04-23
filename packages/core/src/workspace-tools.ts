import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ToolDefinition } from "./domain.js";
import type { ToolGatewayTool } from "./tool-gateway.js";
import {
  isIgnoredPath,
  resolveWorkspacePath,
  type WorkspaceScope,
} from "./workspace-scope.js";

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_BYTES = 64 * 1024;

export interface ListWorkspaceFilesInput {
  root: string;
  path?: string;
  maxDepth?: number;
}

export interface WorkspaceFileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface ReadWorkspaceFileInput {
  root: string;
  path: string;
  maxBytes?: number;
}

export interface ReadWorkspaceFileOutput {
  path: string;
  content: string;
  bytes: number;
  truncated: boolean;
}

export interface WriteWorkspaceFileInput {
  root: string;
  path: string;
  content: string;
}

export interface WriteWorkspaceFileOutput {
  path: string;
  bytes: number;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function getRelativePath(root: string, absolutePath: string): string {
  return toPosixPath(path.relative(root, absolutePath));
}

async function walkWorkspace(
  scope: WorkspaceScope,
  absoluteDirectory: string,
  depthRemaining: number,
  entries: WorkspaceFileEntry[],
): Promise<void> {
  const directoryEntries = await readdir(absoluteDirectory, {
    withFileTypes: true,
  });

  for (const directoryEntry of directoryEntries) {
    const absoluteEntryPath = path.join(absoluteDirectory, directoryEntry.name);

    if (isIgnoredPath(scope, absoluteEntryPath)) {
      continue;
    }

    if (directoryEntry.isSymbolicLink()) {
      continue;
    }

    const relativePath = getRelativePath(scope.root, absoluteEntryPath);

    if (directoryEntry.isDirectory()) {
      if (depthRemaining > 0) {
        await walkWorkspace(scope, absoluteEntryPath, depthRemaining - 1, entries);
      }
      continue;
    }

    if (directoryEntry.isFile()) {
      const stats = await stat(absoluteEntryPath);
      entries.push({
        path: relativePath,
        type: "file",
        size: stats.size,
      });
    }
  }
}

export async function listWorkspaceFiles(
  input: ListWorkspaceFilesInput,
): Promise<{ entries: WorkspaceFileEntry[] }> {
  const root = path.resolve(input.root);
  const scope: WorkspaceScope = { root };
  const startPath = resolveWorkspacePath(scope, input.path ?? ".");
  const stats = await stat(startPath);

  if (!stats.isDirectory()) {
    return {
      entries: [
        {
          path: getRelativePath(root, startPath),
          type: "file",
          size: stats.size,
        },
      ],
    };
  }

  const entries: WorkspaceFileEntry[] = [];
  await walkWorkspace(
    scope,
    startPath,
    Math.max(0, input.maxDepth ?? DEFAULT_MAX_DEPTH),
    entries,
  );

  return {
    entries: entries.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export async function readWorkspaceFile(
  input: ReadWorkspaceFileInput,
): Promise<ReadWorkspaceFileOutput>;
export async function readWorkspaceFile(
  scope: WorkspaceScope,
  relativePath: string,
  options?: { maxBytes?: number },
): Promise<string>;
export async function readWorkspaceFile(
  inputOrScope: ReadWorkspaceFileInput | WorkspaceScope,
  relativePath?: string,
  options?: { maxBytes?: number },
): Promise<ReadWorkspaceFileOutput | string> {
  const input =
    relativePath === undefined
      ? (inputOrScope as ReadWorkspaceFileInput)
      : {
          root: inputOrScope.root,
          path: relativePath,
          maxBytes: options?.maxBytes,
        };

  const root = path.resolve(input.root);
  const scope: WorkspaceScope = { root };
  const absolutePath = resolveWorkspacePath(scope, input.path);
  const stats = await stat(absolutePath);

  if (!stats.isFile()) {
    throw new Error(`Workspace path is not a file: ${input.path}`);
  }

  if (isIgnoredPath(scope, absolutePath)) {
    throw new Error(`Workspace path is ignored: ${input.path}`);
  }

  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const file = await readFile(absolutePath);
  const truncated = file.byteLength > maxBytes;
  const content = file.subarray(0, maxBytes).toString("utf8");

  if (relativePath !== undefined) {
    return content;
  }

  return {
    path: toPosixPath(input.path),
    content,
    bytes: Buffer.byteLength(content, "utf8"),
    truncated,
  };
}

export async function writeWorkspaceFile(
  input: WriteWorkspaceFileInput,
): Promise<WriteWorkspaceFileOutput> {
  const root = path.resolve(input.root);
  const scope: WorkspaceScope = { root };
  const absolutePath = resolveWorkspacePath(scope, input.path);

  if (isIgnoredPath(scope, absolutePath)) {
    throw new Error(`Workspace path is ignored: ${input.path}`);
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.content, "utf8");

  return {
    path: toPosixPath(input.path),
    bytes: Buffer.byteLength(input.content, "utf8"),
  };
}

export const workspaceListFilesToolDefinition: ToolDefinition = {
  name: "workspace.list_files",
  description: "List files inside an allowed workspace root.",
  input_schema: { type: "object" },
  output_schema: { type: "object" },
  capabilities: ["workspace.read"],
  default_risk: "low",
  requires_approval: false,
  sandbox: "workspace",
  status: "enabled",
};

export const workspaceReadFileToolDefinition: ToolDefinition = {
  name: "workspace.read_file",
  description: "Read a UTF-8 file inside an allowed workspace root.",
  input_schema: { type: "object" },
  output_schema: { type: "object" },
  capabilities: ["workspace.read"],
  default_risk: "low",
  requires_approval: false,
  sandbox: "workspace",
  status: "enabled",
};

export const workspaceWriteFileToolDefinition: ToolDefinition = {
  name: "workspace.write_file",
  description: "Write a UTF-8 file inside an allowed workspace root.",
  input_schema: { type: "object" },
  output_schema: { type: "object" },
  capabilities: ["workspace.write"],
  default_risk: "high",
  requires_approval: true,
  sandbox: "workspace",
  status: "enabled",
};

function assertObjectInput(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Workspace tool input must be an object.");
  }

  return input as Record<string, unknown>;
}

export function createWorkspaceToolGatewayTools(
  scope: WorkspaceScope,
): ToolGatewayTool[] {
  return [
    {
      definition: workspaceListFilesToolDefinition,
      handler: async (input) => {
        const objectInput = assertObjectInput(input);
        return listWorkspaceFiles({
          root: scope.root,
          path: typeof objectInput.path === "string" ? objectInput.path : undefined,
          maxDepth:
            typeof objectInput.maxDepth === "number"
              ? objectInput.maxDepth
              : undefined,
        });
      },
    },
    {
      definition: workspaceReadFileToolDefinition,
      handler: async (input) => {
        const objectInput = assertObjectInput(input);
        if (typeof objectInput.path !== "string") {
          throw new Error("workspace.read_file requires a string path.");
        }

        return readWorkspaceFile({
          root: scope.root,
          path: objectInput.path,
          maxBytes:
            typeof objectInput.maxBytes === "number"
              ? objectInput.maxBytes
              : undefined,
        });
      },
    },
    {
      definition: workspaceWriteFileToolDefinition,
      handler: async (input) => {
        const objectInput = assertObjectInput(input);
        if (typeof objectInput.path !== "string") {
          throw new Error("workspace.write_file requires a string path.");
        }
        if (typeof objectInput.content !== "string") {
          throw new Error("workspace.write_file requires a string content.");
        }

        return writeWorkspaceFile({
          root: scope.root,
          path: objectInput.path,
          content: objectInput.content,
        });
      },
    },
  ];
}
