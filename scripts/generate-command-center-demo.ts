import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { generateDemoState } from './command-center-demo-runtime.js';

async function main(): Promise<void> {
  const outputPath = path.join(
    process.cwd(),
    'apps',
    'web',
    'src',
    'generated',
    'demo-state.ts',
  );
  const state = await generateDemoState();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `export const generatedCommandCenterData = ${JSON.stringify(state, null, 2)} as const;\n`,
    'utf8',
  );
}

await main();
