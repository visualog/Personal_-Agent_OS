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
        `Command Center dev server is not reachable at ${baseUrl}. Start it with "npm run dev:web -- --host 127.0.0.1 --port 4173" before running UI regression tests.`,
      );
    }

    await page.evaluate(async () => {
      const response = await fetch('/api/command-center/reset', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Failed to reset command center runtime: ${response.status}`);
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
      () => document.querySelector('[data-testid="runtime-banner-message"]')?.textContent?.includes('resumed successfully'),
    );
    await page.waitForFunction(
      () => document.querySelector('[data-testid="selected-task-status"]')?.textContent?.includes('Completed'),
    );

    assert.equal(await page.locator('[data-testid="selected-task-status"]').textContent(), 'Completed');
    assert.equal(await page.locator('[data-testid^="approval-item-"]').count(), 0);
  });
});

test('deny closes the blocked step and clears the queue', async () => {
  await withCommandCenterPage(async (page) => {
    await clickFirstApprovalAction(page, 'deny');

    await page.waitForFunction(
      () => document.querySelector('[data-testid="runtime-banner-message"]')?.textContent?.includes('stayed closed'),
    );

    assert.equal(await page.locator('[data-testid^="approval-item-"]').count(), 0);
    const summary = await page.locator('[data-testid="selected-task-summary"]').textContent();
    assert.ok(summary);
    assert.match(summary, /policy risk signals|approval/);
  });
});

test('request changes keeps the approval pending and adds a review note', async () => {
  await withCommandCenterPage(async (page) => {
    await clickFirstApprovalAction(page, 'request_changes');

    await page.waitForFunction(
      () => document.querySelector('[data-testid="runtime-banner-message"]')?.textContent?.includes('Change request recorded'),
    );

    const approvalSummary = await page.locator('[data-testid^="approval-item-"]').first().textContent();
    const taskSummary = await page.locator('[data-testid="selected-task-summary"]').textContent();
    const timelineText = await page.locator('.timeline-list').textContent();
    const auditText = await page.getByLabel('Audit Records').textContent();

    assert.ok(approvalSummary?.includes('Changes requested before approval.'));
    assert.equal(await page.locator('[data-testid="selected-task-status"]').textContent(), 'Waiting Approval');
    assert.ok(taskSummary?.includes('change request note pending before approval'));
    assert.ok(timelineText?.includes('step.changes_requested'));
    assert.ok(auditText?.includes('step.changes_requested'));
  });
});

test('cancel task expires approval and marks the task canceled', async () => {
  await withCommandCenterPage(async (page) => {
    await clickFirstApprovalAction(page, 'cancel_task');

    await page.waitForFunction(
      () => document.querySelector('[data-testid="runtime-banner-message"]')?.textContent?.includes('Task canceled through the orchestrator'),
    );

    assert.equal(await page.locator('[data-testid="selected-task-status"]').textContent(), 'Canceled');
    assert.equal(await page.locator('[data-testid^="approval-item-"]').count(), 0);

    const planAndStepsText = await page.getByLabel('Plan and Steps').textContent();
    assert.ok(planAndStepsText?.includes('skipped'));
  });
});
