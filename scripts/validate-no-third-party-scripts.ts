import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const FORBIDDEN_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'amplitude.com',
  'segment.io',
  'mixpanel.com',
  'hotjar.com',
  'sentry.io',
];

const DIST_DIR = join(process.cwd(), 'apps/platform/dist');

function checkFile(filePath: string) {
  const content = readFileSync(filePath, 'utf8');
  for (const domain of FORBIDDEN_DOMAINS) {
    if (content.includes(domain)) {
      console.error(`Error: Found forbidden tracking domain "${domain}" in file: ${filePath}`);
      process.exit(1);
    }
  }
}

function scanDir(dir: string) {
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      if (statSync(fullPath).isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
        checkFile(fullPath);
      }
    }
  } catch (e: unknown) {
    console.warn(
      `Warning: Could not scan directory ${dir}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// Fail loudly if the build output is missing: a silent "pass" on an absent
// dist would let a tracking-laden bundle ship unaudited. Run `pnpm build` first.
if (!existsSync(DIST_DIR)) {
  console.error(
    `Error: build directory ${DIST_DIR} not found. Run \`pnpm build\` before the tracking audit.`,
  );
  process.exit(1);
}

console.log(`Auditing build directory ${DIST_DIR} for third-party analytics scripts...`);
scanDir(DIST_DIR);
console.log('Audit complete: No forbidden tracking domains found.');
