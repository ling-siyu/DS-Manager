import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createPreviewServer } from '../commands/ui.js';

// Headless screenshots of preview stage routes for the edit loop. Uses the
// machine's installed Chrome via puppeteer-core (no bundled browser). All
// determinism knobs are pinned: viewport/DPR, sRGB, no LCD text, no font
// hinting, reduced motion; the StagePage itself kills animations and signals
// readiness via [data-stage-ready].

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const LAUNCH_ARGS = [
  '--hide-scrollbars',
  '--force-color-profile=srgb',
  '--disable-lcd-text',
  '--font-render-hinting=none',
  '--disable-gpu',
];

const READY_OR_ERROR = '[data-stage-ready="true"], .render-error, vite-error-overlay';

/**
 * Screenshot a set of stage targets. Spins up a fresh preview server (so the
 * shots always reflect the on-disk state — no race with watchers), shoots every
 * (component × scenario), and tears everything down.
 *
 * targets: [{ source: 'dsm'|'securamark', name, scenarios: number[] }]
 * Returns [{ source, name, scenario, file }]; throws on stage render errors.
 */
export async function captureShots(paths, targets, outDir, options = {}) {
  const { onLog = () => {}, timeoutMs = 30_000 } = options;

  const executablePath = findChrome();
  if (!executablePath) {
    throw new Error(
      'No Chrome/Chromium found. Install Google Chrome or set CHROME_PATH to a browser binary.',
    );
  }

  mkdirSync(outDir, { recursive: true });

  const needSecuramark = targets.some((t) => t.source === 'securamark');
  const preview = await createPreviewServer(paths, {
    port: 7800,
    securamark: needSecuramark,
    watch: false,
    build: true,
    onLog,
  });

  const { default: puppeteer } = await import('puppeteer-core');
  let browser;
  const shots = [];
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: LAUNCH_ARGS,
      defaultViewport: { width: 900, height: 700, deviceScaleFactor: 2 },
    });

    for (const target of targets) {
      for (const scenario of target.scenarios) {
        // Fresh page per shot: hash-only navigation would not remount the stage.
        const page = await browser.newPage();
        try {
          await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
          const stageUrl = `${preview.url}#/stage/${target.source}/${encodeURIComponent(target.name)}?scenario=${scenario}`;
          await page.goto(stageUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
          await page.waitForSelector(READY_OR_ERROR, { timeout: timeoutMs });

          const failure = await page.evaluate(() => {
            const overlay = document.querySelector('vite-error-overlay');
            if (overlay) return `Vite error overlay: ${overlay.shadowRoot?.textContent?.slice(0, 300) ?? 'unknown'}`;
            const err = document.querySelector('.render-error');
            return err ? err.textContent : null;
          });
          if (failure) {
            throw new Error(`Stage failed for ${target.name} scenario ${scenario}: ${failure}`);
          }

          const stage = await page.$('.stage');
          const file = join(outDir, `${target.source}-${target.name}-s${scenario}.png`);
          await stage.screenshot({ path: file });
          shots.push({ source: target.source, name: target.name, scenario, file });
          onLog(`shot ${target.name} scenario ${scenario}`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await preview.close().catch(() => {});
  }

  return shots;
}
