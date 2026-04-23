import assert from 'node:assert/strict';
import test from 'node:test';

import { chromium, type Page } from 'playwright';

const baseUrl = process.env.COMMAND_CENTER_BASE_URL ?? 'http://127.0.0.1:4173';

async function withCommandCenterPage(run: (page: Page) => Promise<void>): Promise<void> {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
    } catch {
      throw new Error(
        `명령 센터 개발 서버에 ${baseUrl}로 연결할 수 없습니다. UI 회귀 테스트를 실행하기 전에 "npm run dev:web -- --host 127.0.0.1 --port 4173" 명령으로 서버를 먼저 실행하세요.`,
      );
    }

    await page.evaluate(async () => {
      const response = await fetch('/api/command-center/reset', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`명령 센터 런타임 초기화에 실패했습니다: ${response.status}`);
      }
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="runtime-banner"]');
    await run(page);
  } finally {
    await browser.close();
  }
}

async function clickFirstApprovalAction(page: Page, action: string): Promise<void> {
  const approvalItem = page.locator('[data-testid^="approval-item-"]').first();
  await approvalItem.waitFor();
  await approvalItem.locator(`[data-action="${action}"]`).click();
}

test('approve completes the selected task and clears the queue', async () => {
  await withCommandCenterPage(async (page) => {
    await clickFirstApprovalAction(page, 'approve');

    await page.waitForFunction(
      () => document.querySelector('[data-testid="runtime-banner-message"]')?.textContent?.includes('정상적으로 다시 실행되었습니다'),
    );
    await page.waitForFunction(
      () => document.querySelector('[data-testid="selected-task-status"]')?.textContent?.includes('완료'),
    );

    assert.equal(await page.locator('[data-testid="selected-task-status"]').textContent(), '완료');
    assert.equal(await page.locator('[data-testid^="approval-item-"]').count(), 0);
  });
});

test('deny closes the blocked step and clears the queue', async () => {
  await withCommandCenterPage(async (page) => {
    await clickFirstApprovalAction(page, 'deny');

    await page.waitForFunction(
      () => document.querySelector('[data-testid="runtime-banner-message"]')?.textContent?.includes('그대로 유지됩니다'),
    );

    assert.equal(await page.locator('[data-testid^="approval-item-"]').count(), 0);
    const summary = await page.locator('[data-testid="selected-task-summary"]').textContent();
    assert.ok(summary);
    assert.match(summary, /정책 위험 신호|승인/);
  });
});

test('request changes keeps the approval pending and adds a review note', async () => {
  await withCommandCenterPage(async (page) => {
    await clickFirstApprovalAction(page, 'request_changes');

    await page.waitForFunction(
      () => document.querySelector('[data-testid="runtime-banner-message"]')?.textContent?.includes('수정 요청이 기록되었습니다'),
    );

    const approvalSummary = await page.locator('[data-testid^="approval-item-"]').first().textContent();
    const taskSummary = await page.locator('[data-testid="selected-task-summary"]').textContent();
    const timelineText = await page.locator('.timeline-list').textContent();
    const auditText = await page.getByLabel('감사 기록').textContent();

    assert.ok(approvalSummary?.includes('승인 전에 수정 요청이 기록되었습니다'));
    assert.equal(await page.locator('[data-testid="selected-task-status"]').textContent(), '승인 대기');
    assert.ok(taskSummary?.includes('수정 요청 메모'));
    assert.ok(timelineText?.includes('수정 요청'));
    assert.ok(auditText?.includes('수정 요청'));
  });
});

test('cancel task expires approval and marks the task canceled', async () => {
  await withCommandCenterPage(async (page) => {
    await clickFirstApprovalAction(page, 'cancel_task');

    await page.waitForFunction(
      () => document.querySelector('[data-testid="runtime-banner-message"]')?.textContent?.includes('작업이 취소되었습니다'),
    );

    assert.equal(await page.locator('[data-testid="selected-task-status"]').textContent(), '취소됨');
    assert.equal(await page.locator('[data-testid^="approval-item-"]').count(), 0);

    const planAndStepsText = await page.getByLabel('계획과 단계').textContent();
    assert.ok(planAndStepsText?.includes('skipped'));
  });
});
