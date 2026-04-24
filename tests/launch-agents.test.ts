import assert from "node:assert/strict";
import test from "node:test";

import {
  getLaunchAgentPath,
  renderLaunchAgentPlist,
  type ServiceDefinition,
} from "../scripts/manage-launch-agents.js";

const service: ServiceDefinition = {
  name: "agent-daemon",
  label: "com.personal-agent-os.agent-daemon",
  npmScript: "start:agent-daemon",
  logName: "agent-daemon",
};

test("getLaunchAgentPath resolves the user launch agent plist path", () => {
  assert.equal(
    getLaunchAgentPath("com.personal-agent-os.agent-daemon", "/Users/tester"),
    "/Users/tester/Library/LaunchAgents/com.personal-agent-os.agent-daemon.plist",
  );
});

test("renderLaunchAgentPlist keeps secrets out and runs the npm service script", () => {
  const plist = renderLaunchAgentPlist({
    service,
    workspaceRoot: "/Users/tester/Project/Labs",
    logDir: "/Users/tester/Project/Labs/.paos/logs",
  });

  assert.match(plist, /com\.personal-agent-os\.agent-daemon/);
  assert.match(plist, /npm run start:agent-daemon/);
  assert.match(plist, /RunAtLoad/);
  assert.match(plist, /KeepAlive/);
  assert.match(plist, /\.paos\/logs\/agent-daemon\.out\.log/);
  assert.doesNotMatch(plist, /SLACK_BOT_TOKEN/);
  assert.doesNotMatch(plist, /xoxb-/);
});

