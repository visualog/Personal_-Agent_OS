import path from "node:path";

export interface WorkspaceScope {
  root: string;
  ignoredNames?: readonly string[];
}

export class WorkspacePathError extends Error {
  code: "outside_workspace" | "invalid_path";

  constructor(
    code: "outside_workspace" | "invalid_path",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "WorkspacePathError";
    this.code = code;
  }
}

export const DEFAULT_IGNORED_NAMES = [
  ".git",
  "node_modules",
  ".paos",
  "dist",
  "build",
] as const;

function normalizeScopeRoot(root: string): string {
  const resolvedRoot = path.resolve(root);
  return resolvedRoot.endsWith(path.sep) && resolvedRoot !== path.sep
    ? resolvedRoot.slice(0, -1)
    : resolvedRoot;
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  if (candidate === root) {
    return true;
  }

  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function resolveWorkspacePath(
  scope: WorkspaceScope,
  relativePath: string,
): string {
  if (path.isAbsolute(relativePath)) {
    throw new WorkspacePathError(
      "invalid_path",
      `Absolute paths are not allowed: ${relativePath}`,
    );
  }

  const root = normalizeScopeRoot(scope.root);
  const resolved = path.resolve(root, relativePath);

  if (!isPathInsideRoot(root, resolved)) {
    throw new WorkspacePathError(
      "outside_workspace",
      `Path escapes workspace root: ${relativePath}`,
    );
  }

  return resolved;
}

export function isIgnoredPath(scope: WorkspaceScope, absolutePath: string): boolean {
  const root = normalizeScopeRoot(scope.root);
  const resolvedPath = path.resolve(absolutePath);
  const names = scope.ignoredNames ?? DEFAULT_IGNORED_NAMES;
  const ignored = new Set(names);

  if (!isPathInsideRoot(root, resolvedPath) && resolvedPath !== root) {
    return false;
  }

  const relative = path.relative(root, resolvedPath);
  const segments = relative.split(path.sep).filter(Boolean);

  return segments.some((segment) => ignored.has(segment));
}
