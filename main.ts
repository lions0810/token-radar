// Token Radar entry point (radar-3). Node 22, standard library only, no network.
//
// What a run does, in order:
//   1. reads the sealed snapshot (--input <file|dir>, default /input/snapshot.json),
//   2. scores every pre-token protocol with the fitted power law in lib/model.ts,
//   3. refuses to write anything if the board fails the gate's own checks,
//   4. writes board.json, data.js and report.md into the output directory,
//   5. copies this repository's dashboard/ and screenshots/ beside them,
//   6. writes dossier.json last, with the vendored make.fun library, because the
//      scorer rebuilds it from the finished output and compares bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildReport } from './lib/report.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));

/** The gate's caps, mirrored from the kit: dossier text, and the screenshot count and size. */
const DOSSIER_TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const SCREENSHOTS_REQUIRED = 3;

/** One `--name value` or `--name=value` argument, or the fallback when it is absent. */
function readArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const at = process.argv.indexOf(flag);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`));
  return inline === undefined ? fallback : inline.slice(flag.length + 1);
}

/** Fails the run with the message on stderr and exit code 2: a usage problem, not a bad board. */
function die(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(2);
}

// --- read and score -----------------------------------------------------------------------------

const inputArg = readArg('input', '/input');
const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  die(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const outputDir = readArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);

// The gate's verdict on the board comes before any file is written: a refused board
// must not leave a half-written output directory behind for the scorer to find.
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// --- write the scored outputs -------------------------------------------------------------------

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));
writeFileSync(join(outputDir, 'report.md'), buildReport(snapshot, radar, board));

/** Copies a directory's regular files into the output, skipping dotfiles; returns the names. */
function copyTree(name: string): string[] {
  const from = join(repoDir, name);
  if (!existsSync(from)) return [];
  const to = join(outputDir, name);
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const entry of readdirSync(from)) {
    if (entry.startsWith('.')) continue;
    const path = join(from, entry);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, entry));
    copied.push(entry);
  }
  return copied;
}

const dashboardFiles = copyTree('dashboard');
const screenshots = copyTree('screenshots');
if (screenshots.length < SCREENSHOTS_REQUIRED) {
  process.stderr.write(`token radar: screenshots/ holds ${screenshots.length} image${screenshots.length === 1 ? '' : 's'}: hand in ${SCREENSHOTS_REQUIRED}, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of screenshots) {
  if (!SCREENSHOT_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// --- the dossier, always last ---------------------------------------------------------------------

writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: model ${radar.model_version} fitted on ${radar.fit.n} live protocols (a=${radar.fit.a.toFixed(4)}, b=${radar.fit.b.toFixed(4)})\n` +
    `token radar: wrote board.json, data.js, report.md, dashboard (${dashboardFiles.length} files), screenshots (${screenshots.length} images) and dossier.json to ${outputDir}\n`,
);
