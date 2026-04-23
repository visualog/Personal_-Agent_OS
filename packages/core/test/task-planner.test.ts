import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { createPlan, createTask, type Task } from "../src/index.js";

test("createTask trims title and applies defaults with a task.created hash", () => {
  const rawRequest = "  Build status dashboard  \n\nPlease inspect the project.  ";
  const result = createTask({
    raw_request: rawRequest,
    created_by: "user_01",
    title: "  Custom request title  ",
  });

  assert.equal(result.task.title, "Custom request title");
  assert.equal(result.task.status, "created");
  assert.equal(result.task.priority, "normal");
  assert.equal(result.task.sensitivity, "internal");
  assert.equal(result.event.event_type, "task.created");
  assert.equal(result.event.payload.raw_request_hash, crypto.createHash("sha256").update(rawRequest).digest("hex"));
});

test("createTask uses provided now timestamp", () => {
  const now = "2026-04-22T09:10:11.000Z";
  const result = createTask({
    raw_request: "  One line task  ",
    created_by: "user_01",
    now,
  });

  assert.equal(result.task.created_at, now);
  assert.equal(result.task.updated_at, now);
  assert.equal(result.event.timestamp, now);
});

test("createPlan for project status request creates list and read steps with dependency", () => {
  const result = createPlan({
    task: {
      id: "task_01",
      raw_request: "프로젝트 상태를 확인하고 파일을 읽어줘",
    } as Task,
  });

  assert.equal(result.plan.status, "drafted");
  assert.equal(result.plan.steps.length, 2);
  assert.equal(result.plan.steps[0].tool_name, "workspace.list_files");
  assert.equal(result.plan.steps[1].tool_name, "workspace.read_file");
  assert.deepEqual(result.plan.steps[1].depends_on, [result.plan.steps[0].id]);
});

test("createPlan emits plan.drafted with low risk summary and no approval requirement", () => {
  const result = createPlan({
    task: {
      id: "task_02",
      raw_request: "project status",
    } as Task,
    now: "2026-04-22T10:00:00.000Z",
  });

  assert.equal(result.event.event_type, "plan.drafted");
  assert.equal(result.event.payload.requires_approval, false);
  assert.deepEqual(result.event.payload.risk_summary, {
    low: result.plan.steps.length,
    medium: 0,
    high: 0,
    critical: 0,
  });
  assert.match(result.plan.summary, /초안입니다\.$/);
});

test("createPlan fallback still creates at least one ready step", () => {
  const result = createPlan({
    task: {
      id: "task_03",
      raw_request: "just do something",
    } as Task,
  });

  assert.ok(result.plan.steps.length >= 1);
  assert.equal(result.plan.steps[0].status, "ready");
});

test("createPlan for coding request without explicit target path creates proposal-only flow", () => {
  const result = createPlan({
    task: {
      id: "task_04",
      raw_request: "로그인 오류를 수정해줘",
    } as Task,
  });

  assert.deepEqual(
    result.plan.steps.map((step) => step.tool_name),
    ["workspace.list_files", "workspace.read_file", "workspace.write_draft"],
  );
  assert.equal(result.event.payload.requires_approval, false);
});

test("createPlan for coding request with explicit file path adds approval-gated apply step", () => {
  const result = createPlan({
    task: {
      id: "task_05",
      raw_request: "packages/core/src/orchestrator.ts 파일의 로그인 오류를 수정해줘",
    } as Task,
  });

  assert.deepEqual(
    result.plan.steps.map((step) => step.tool_name),
    [
      "workspace.list_files",
      "workspace.read_file",
      "workspace.write_draft",
      "workspace.apply_file_edit",
    ],
  );
  assert.equal(result.event.payload.requires_approval, true);
  assert.deepEqual(result.plan.steps[3]?.depends_on, [result.plan.steps[2]!.id]);
});
