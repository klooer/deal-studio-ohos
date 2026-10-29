// ui.Motion: the poses of every preset (VeraMotion.ets), and that a program using it compiles, validates its preset,
// refuses a nested Motion and decodes to a node carrying preset, trigger and children.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {MOTION_PRESETS, motionDuration, motionPose, MotionPose} = loadVera('VeraMotion')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')
const {stylesFor} = loadVera('VeraUiCatalog')

assert.deepEqual(MOTION_PRESETS, stylesFor('motion'), 'the catalogue lists exactly the presets the renderer can play')
const identity = JSON.stringify(new MotionPose())
for (const preset of MOTION_PRESETS) {
  assert.ok(motionDuration(preset) > 0 && motionDuration(preset) <= 1000, preset + ' has a short, fixed duration')
  assert.equal(JSON.stringify(motionPose(preset, 1)), identity, preset + ' ends on the identity pose')
  assert.equal(JSON.stringify(motionPose(preset, 5)), identity, preset + ' past the end is still the identity')
  let moved = false
  for (let i = 0; i < 20; i++) {
    const p = motionPose(preset, i / 20)
    for (const k of Object.keys(p)) assert.ok(Number.isFinite(p[k]), preset + ' ' + k + ' is finite at ' + i)
    assert.ok(p.scale > 0.5 && p.scale < 1.6 && p.opacity >= 0 && p.opacity <= 1 && Math.abs(p.dx) <= 20 && Math.abs(p.dy) <= 60, preset + ' stays in bounds')
    if (JSON.stringify(p) !== identity) moved = true
  }
  assert.ok(moved, preset + ' really moves')
}
assert.equal(JSON.stringify(motionPose('nonsense', 0.3)), identity, 'an unknown preset is the identity')
assert.equal(JSON.stringify(motionPose('tumble', NaN)), JSON.stringify(motionPose('tumble', 0)), 'a NaN progress is the start')
assert.ok(motionPose('tumble', 0).angle > 360, 'a tumble starts well away from rest')

const program = (preset, inner) => `import * as ui from "std/ui"
import * as math from "std/math"

@jsonable
class AppState { roll: number; face: number; seed: number; }

function init(): AppState { return { roll: 0, face: 1, seed: 7 }; }

function onRoll(state: AppState, _v: number): AppState {
  let next: number = math.randomStep(state.seed);
  return { roll: state.roll + 1, face: math.randomBelow(next, 6) + 1, seed: next };
}

function view(state: AppState): ui.View {
  return ui.AppTheme("clean", "", [
    ui.Column("spacious", [
      ${inner.replace('PRESET', preset)},
      ui.Button("primary", "Roll", "onRoll", 0, true)
    ])
  ]);
}`
const good = 'ui.Motion("PRESET", state.roll, [ui.Text("body", "face")])'
const run = src => {
  const r = compileVeraSource(src)
  const vm = new VirtualMachine(deserializeVbc2(r.vbc2 !== undefined ? r.vbc2 : r), new UiHostEnvironment())
  const out = []
  const walk = n => { out.push(n); (n.children || []).forEach(walk) }
  const state = vm.execute('init')
  walk(decodeVeraUi(vm.execute('view', [state]))[0])
  const again = vm.execute('onRoll', [state, 0])
  const second = []
  const walk2 = n => { second.push(n); (n.children || []).forEach(walk2) }
  walk2(decodeVeraUi(vm.execute('view', [again]))[0])
  return {out, second}
}
for (const preset of MOTION_PRESETS) {
  const {out, second} = run(program(preset, good))
  const m = out.find(n => n.kind === 'motion'), m2 = second.find(n => n.kind === 'motion')
  assert.ok(m, preset + ': a motion node is decoded')
  assert.equal(m.style, preset); assert.equal(m.numberValue, 0); assert.equal(m2.numberValue, 1, 'the trigger follows the state')
  assert.equal(m.children.length, 1)
}
// styles are not validated by the compiler (an unknown one decodes to the first of the list)
assert.equal(run(program('wobble', good)).out.find(n => n.kind === 'motion').style, 'tumble', 'an unknown preset falls back to the first, like any style')
assert.throws(() => compileVeraSource(program('tumble', 'ui.Motion("tumble", state.roll, [ui.Motion("pop", state.roll, [ui.Text("body", "x")])])')),
  e => (e.diagnostics || []).length > 0, 'a Motion inside a Motion is refused')

// ui.Transform and ui.Stage: compile, decode with pose / duration / perspective / children, and the child rules
const scene = inner => `import * as ui from "std/ui"

@jsonable
class AppState { turn: number; }

function init(): AppState { return { turn: 0 }; }

function onTurn(state: AppState, _v: number): AppState { return { turn: state.turn + 180 }; }

function view(state: AppState): ui.View {
  return ui.AppTheme("clean", "", [
    ui.Column("spacious", [
      ${inner},
      ui.Button("primary", "Turn", "onTurn", 0, true)
    ])
  ]);
}`
const decodeScene = src => {
  const r = compileVeraSource(src)
  const vm = new VirtualMachine(deserializeVbc2(r.vbc2 !== undefined ? r.vbc2 : r), new UiHostEnvironment())
  const all = []
  const walk = n => { all.push(n); (n.children || []).forEach(walk) }
  walk(decodeVeraUi(vm.execute('view', [vm.execute('init')]))[0])
  return all
}
let nodes = decodeScene(scene('ui.Transform("default", [0, state.turn], 500, 0, [ui.Text("body", "card")])'))
let t = nodes.find(n => n.kind === 'transform')
assert.deepEqual(t.series, [0, 0]); assert.equal(t.numberValue, 500); assert.equal(t.children.length, 1); assert.equal(t.style, 'default')
nodes = decodeScene(scene('ui.Stage("default", 700, 0, [ui.Transform("default", [10, 20], 900, 0, [ui.Transform("solid", [0, 0, 0, 0, 0, 60], 0, 120, [ui.Text("body", "front")])])])'))
const stage = nodes.find(n => n.kind === 'stage')
assert.equal(stage.numberValue, 700); assert.equal(stage.children[0].kind, 'transform'); assert.equal(stage.children[0].children[0].style, 'solid')
assert.deepEqual(stage.children[0].children[0].series, [0, 0, 0, 0, 0, 60]); assert.equal(stage.children[0].children[0].minimum, 120, 'the layer side rides minimum')
assert.throws(() => compileVeraSource(scene('ui.Stage("default", 0, 0, [ui.Text("body", "x")])')), e => (e.diagnostics || []).length > 0, 'a Stage holds Transforms only')
assert.throws(() => compileVeraSource(scene('ui.Transform("default", [], 0, 0, [ui.Stage("default", 0, 0, [])])')), e => (e.diagnostics || []).length > 0, 'a Stage inside a Transform is refused')
assert.throws(() => compileVeraSource(scene('ui.Stage("default", 0, 0, [ui.Transform("default", [], 0, 0, [ui.Stage("default", 0, 0, [])])])')), e => (e.diagnostics || []).length > 0, 'a Stage inside a Stage is refused')
// the cube example of the Stage guidance, written out as a whole program: it compiles and draws six faces
{
  const faceFn = 'ui.Text("display", ui.numberToString(n))'
  const cube = `import * as ui from "std/ui"
import * as math from "std/math"

@jsonable
class AppState { seed: number; face: number; turnX: number; turnY: number; rolls: number; }

function init(): AppState { return { seed: 7, face: 1, turnX: 0, turnY: 0, rolls: 0 }; }

function faceView(n: number): ui.View { return ${faceFn}; }

function face(turnX: number, turnY: number, n: number): ui.View {
  return ui.Transform("default", [turnX, turnY], 0, 0, [ui.Transform("solid", [0, 0, 0, 0, 0, 60], 0, 120, [faceView(n)])]);
}

function roll(state: AppState, _v: number): AppState {
  let seed: number = math.randomStep(state.seed);
  let v: number = math.randomBelow(seed, 6) + 1;
  let rolls: number = state.rolls + 1;
  return { seed: seed, face: v, turnX: -90 + 720 * rolls, turnY: 720 * rolls, rolls: rolls };
}

function view(state: AppState): ui.View {
  return ui.AppTheme("clean", "", [
    ui.Column("spacious", [
      ui.Stage("floor", 0, 260, [ui.Transform("default", [state.turnX, state.turnY], 900, 0, [
        face(0, 0, 1), face(0, 180, 6), face(0, 90, 3), face(0, -90, 4), face(90, 0, 2), face(-90, 0, 5)
      ])]),
      ui.Button("primary", "Roll", "roll", 0, true)
    ])
  ]);
}`
  const r = compileVeraSource(cube)
  const vm = new VirtualMachine(deserializeVbc2(r.vbc2 !== undefined ? r.vbc2 : r), new UiHostEnvironment())
  const all = []
  const walk = n => { all.push(n); (n.children || []).forEach(walk) }
  const st = vm.execute('roll', [vm.execute('init'), 0])
  walk(decodeVeraUi(vm.execute('view', [st]))[0])
  const solids = all.filter(n => n.kind === 'transform' && n.style === 'solid')
  assert.equal(solids.length, 6); assert.ok(solids.every(n => n.minimum === 120 && n.series[5] === 60))
  const stageNode = all.find(n => n.kind === 'stage'); assert.equal(stageNode.style, 'floor'); assert.equal(stageNode.minimum, 260, 'the scene height rides minimum')
  assert.equal(all.find(n => n.kind === 'transform' && n.style === 'default').series[1], 720)
}
console.log('motion-check ok')
