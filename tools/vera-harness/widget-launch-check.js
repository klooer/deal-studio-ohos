// A widget row's tap, through the ability's launch routes, without a device or native SDK: the row is a router action with
// veraRun=1, its launch is a 'run' route, and the route opens the project with its latest runnable version on top -- or the
// project alone when no version can run. A home-screen shortcut (launchMode=runLatest) still runs on its own.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname,
  '../../entry/src/main/ets/entryability/EntryAbility.ets'), 'utf8');

// Only the methods below are evaluated, not ArkUI or the rest of the ability.
function methodOf(signature) {
  const start = source.indexOf('  private ' + signature);
  assert(start >= 0, signature + ' must exist');
  const end = source.indexOf('\n  }\n', start);
  return source.slice(start, end + 4).replace('private ', '')
    .replace(/: Promise<void>/g, '').replace(/: void/g, '').replace(/: string/g, '').replace(/: number/g, '')
    .replace(/: window\.WindowStage/g, '').replace(/: routerApi\.RouterOptions/g, '')
    .replace(/\(e: Error\)/g, '(e)').replace(/\(e as Error\)/g, '(e)').replace(/ as string/g, '')
    .replace(/let (\w+): \w+ = /g, 'let $1 = ').replace(/\.length > 0 \? params/g, '.length > 0 ? params');
}
const methods = [methodOf('async drainRoutes(windowStage: window.WindowStage, generation: number): Promise<void> {'),
  methodOf('queueRoute(kind: string, projectId: string): void {')].join('\n');

const widget = fs.readFileSync(path.join(__dirname,
  '../../entry/src/main/ets/widget/pages/WidgetCard.ets'), 'utf8');
assert.match(widget, /'action': 'router'/);
assert.match(widget, /'veraRun': '1'/);
assert.match(source, /params\['veraRun'\] === '1' \? 'run' : 'project'/, 'a widget row\'s launch is a run route');

class LaunchRoute { constructor() { this.kind = 'home'; this.projectId = ''; this.revision = 0 } }
class ParamsClass { }

async function check(name, kind, project, version, expected) {
  const calls = [];
  const router = {
    pushUrl(route) { calls.push('push ' + route.url); calls.params = (calls.params || []).concat([route.params]); return Promise.resolve(); },
    replaceUrl(route) { calls.push('replace ' + route.url); calls.params = (calls.params || []).concat([route.params]); return Promise.resolve(); },
    clear() { calls.push('clear'); }
  };
  const store = { init() {}, getProject: () => project, getLatestRunnableVersion: () => version };
  const ui = { getRouter: () => router, getPromptAction: () => ({ showToast() { calls.push('toast'); } }) };
  const windowStage = { getMainWindowSync: () => ({ getUIContext: () => ui }) };
  const hilog = { error(...args) { throw Error('logged an error: ' + args.join(' ')); } };
  const Controller = new Function('store', 'hilog', 'DOMAIN', 'routerApi', 'LaunchRoute', 'ProjectNavParams', 'RunProjectNavParams',
    'return class Controller { ' + methods + ' }')(store, hilog, 0, {RouterMode: {Standard: 0}}, LaunchRoute, ParamsClass, ParamsClass);
  const c = new Controller();
  Object.assign(c, { contentReady: true, windowStageGeneration: 1, launchRevision: 0, pendingRoute: null, lastDestination: null,
    isolatedRoot: false, rootNeedsReset: false, context: { filesDir: '/files' },
    routeIsCurrent: () => true, applyWindowMode: async () => {} });
  c.queueRoute(kind, 'project-1');
  await c.drainRoutes(windowStage, 1);
  assert.deepEqual(calls.slice(), expected, name);
  if (expected.includes('push pages/RunnerPage') && kind === 'run') {
    assert.deepEqual({ ...calls.params[calls.params.length - 1] }, { projectId: 'project-1', versionId: version.id, vbc2: version.vbc2 }, name);
  }
  assert.equal(c.pendingRoute, null, name + ': the route is done');
  console.log('PASS ' + name);
}

(async () => {
  const project = { id: 'project-1' };
  const runnable = { id: 'version-2', vbc2: 'fixture-bytecode' };
  await check('A widget row with a runnable version opens the runner over its project', 'run', project, runnable,
    ['push pages/ProjectPage', 'push pages/RunnerPage']);
  await check('A widget row with no runnable version opens the project', 'run', project, null, ['push pages/ProjectPage']);
  await check('A widget row for a deleted project goes home and says so', 'run', null, null, ['replace pages/Index', 'clear', 'toast']);
  await check('An ordinary project launch does not run', 'project', project, runnable, ['push pages/ProjectPage']);
  await check('A home-screen shortcut runs on its own', 'shortcut', project, runnable, ['replace pages/RunnerPage', 'clear']);
})().catch(error => { console.error(error); process.exitCode = 1; });
