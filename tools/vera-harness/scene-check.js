// The maths of ui.Transform / ui.Stage (VeraMotion.ets): pose arrays, interpolation, matrices, projection, culling of a cube.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const m = loadVera('VeraMotion')
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' ' + a + ' vs ' + b)

assert.deepEqual(m.poseFromArray([]), [0, 0, 0, 0, 0, 0, 1, 1])
assert.deepEqual(m.poseFromArray([10, 20]), [10, 20, 0, 0, 0, 0, 1, 1])
assert.equal(m.poseFromArray([NaN, 5, Infinity]).join(), [0, 5, 0, 0, 0, 0, 1, 1].join())
assert.equal(m.poseFromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 9]).length, 8)

const a = m.poseFromArray([0, 720]), b = m.poseFromArray([0, 810])
assert.equal(m.lerpPose(a, b, 0)[1], 720); assert.equal(m.lerpPose(a, b, 1)[1], 810); close(m.lerpPose(a, b, 0.5)[1], 765, 'a mid-way angle is by value')
assert.equal(m.lerpPose(a, b, 7)[1], 810); assert.equal(m.lerpPose(a, b, NaN)[1], 720)
assert.equal(m.easeOutCubic(0), 0); assert.equal(m.easeOutCubic(1), 1); assert.ok(m.easeOutCubic(0.5) > 0.5)

const I = m.identityMatrix()
assert.deepEqual(m.poseMatrix(m.poseFromArray([])), I)
// 90 degrees about Y takes +z (the front) to +x; about X takes +z to -y
let r = m.poseMatrix(m.poseFromArray([0, 90]))
close(r[2], 1, 'front -> +x'); close(r[10], 0, 'front no longer faces the viewer')
r = m.poseMatrix(m.poseFromArray([90, 0]))
close(r[6], -1, 'front -> -y about X')
// a chain is parent * child; identity is neutral
const p = m.poseMatrix(m.poseFromArray([30, 40, 50, 1, 2, 3, 1.5]))
assert.deepEqual(m.multiplyMatrices(I, p).map(x => +x.toFixed(9)), p.map(x => +x.toFixed(9)))
// projection: no perspective leaves x,y alone; a point nearer the viewer grows
assert.deepEqual(m.projectPoint(I, 0, 3, 4, 5).slice(0, 2), [3, 4])
const near = m.projectPoint(m.poseMatrix(m.poseFromArray([0, 0, 0, 0, 0, 100])), 400, 10, 0, 0)
close(near[0], 10 / (1 - 100 / 400), 'nearer is larger')

// a cube: each face is two nested poses, the outer turns it, the inner pushes it out by half the side; the cube turns them all
const H = 50
const faces = [[0, 0], [0, 180], [0, 90], [0, -90], [90, 0], [-90, 0]]   // front, back, right, left, top, bottom
const faceMatrix = (rx, ry) => m.multiplyMatrices(m.poseMatrix(m.poseFromArray([rx, ry])), m.poseMatrix(m.poseFromArray([0, 0, 0, 0, 0, H])))
function visibleFaces(cubePose, perspective) {
  const cube = m.poseMatrix(m.poseFromArray(cubePose))
  const shown = []
  faces.forEach(([rx, ry], i) => { if (m.facesViewer(m.multiplyMatrices(cube, faceMatrix(rx, ry)), perspective)) shown.push(i) })
  return {n: shown.length, shown}
}
// the faces really sit where their names say
{
  const at = (rx, ry) => m.projectPoint(faceMatrix(rx, ry), 0, 0, 0, 0)
  close(at(0, 90)[0], H, 'right face is at +x'); close(at(0, -90)[0], -H, 'left face is at -x')
  close(at(90, 0)[1], -H, 'top face is at -y (up on the screen)'); close(at(-90, 0)[1], H, 'bottom face is at +y')
  close(at(0, 0)[2], H, 'front face is at +z'); close(at(0, 180)[2], -H, 'back face is at -z')
}
// a body that spins and travels is one pose: it turns about ITS OWN centre and is then moved, it does not orbit the origin
{
  for (const spin of [0, 37, 90, 211]) {
    const body = m.poseMatrix(m.poseFromArray([spin, spin * 2, spin / 3, 70, -20, 40]))
    close(body[3], 70, 'x stays where it was moved'); close(body[7], -20, 'y'); close(body[11], 40, 'z')
  }
}
// depth order: the nearest layer ranks highest, ties keep the tree order
assert.deepEqual(m.depthRanks([5, -3, 10, 0]), [2, 0, 3, 1]); assert.deepEqual(m.depthRanks([1, 1, 1]), [0, 1, 2]); assert.deepEqual(m.depthRanks([]), [])
// the landing pose of the cube for each face: that face ends up facing the viewer, whatever number of whole turns come on top
const LAND = [[0, 0], [0, 180], [0, -90], [0, 90], [-90, 0], [90, 0]]
LAND.forEach(([rx, ry], i) => {
  for (const turns of [0, 1, 2, -3]) {
    assert.deepEqual(visibleFaces([rx + 360 * turns, ry - 720 * turns, 0], 800).shown, [i], 'landing on face ' + i + ' after ' + turns + ' turns')
  }
})
// the pixel conversion scales the distances only, the column-major order puts the translation at 12..14 and perspective at 11
assert.deepEqual(m.poseToPixels([1, 2, 3, 4, 5, 6, 7, 8], 3), [1, 2, 3, 12, 15, 18, 7, 8])
const cm = m.columnMajor(m.poseMatrix(m.poseFromArray([0, 0, 0, 7, 8, 9])))
assert.deepEqual([cm[12], cm[13], cm[14], cm[15]], [7, 8, 9, 1])
assert.equal(m.columnMajor(m.perspectiveMatrix(400))[11], -1 / 400); assert.equal(m.columnMajor(m.perspectiveMatrix(0))[11], 0)
for (const persp of [0, 600, 2400]) {
  // at rest only the front face is seen
  assert.deepEqual(visibleFaces([0, 0], persp).shown, [0], 'at rest the front face only, perspective ' + persp)
  // generic angles show exactly three faces (none edge-on)
  for (const [rx, ry] of [[25, 35], [-40, 60], [70, -25], [33, 200], [-20, 310], [15, 123]]) {
    const v = visibleFaces([rx, ry, 0], persp)
    assert.equal(v.n, 3, 'three faces at ' + rx + ',' + ry + ' persp ' + persp + ' got ' + v.shown)
  }
}
// opposite faces are never both visible
for (let rx = -170; rx <= 170; rx += 37) for (let ry = -170; ry <= 170; ry += 41) {
  const v = visibleFaces([rx + 0.3, ry + 0.7, 0], 800).shown
  for (const [a2, b2] of [[0, 1], [2, 3], [4, 5]]) assert.ok(!(v.includes(a2) && v.includes(b2)), 'opposite faces ' + a2 + b2 + ' at ' + rx + ',' + ry)
}
// shading: a face at rest is full brightness, turned faces are darker, never below the floor, the top is lighter than the right side
{
  const shade = pose => m.faceShade(m.poseMatrix(m.poseFromArray(pose)))
  close(shade([0, 0]), 1, 'front at rest'); assert.ok(shade([0, 90]) < shade([90, 0]) && shade([90, 0]) < 1, 'right darker than top darker than front')
  for (let rx = -180; rx <= 180; rx += 15) for (let ry = -180; ry <= 180; ry += 15) { const v = shade([rx, ry]); assert.ok(v >= 0.55 - 1e-9 && v <= 1 + 1e-9, 'in range ' + v) }
}
console.log('scene-check ok')
