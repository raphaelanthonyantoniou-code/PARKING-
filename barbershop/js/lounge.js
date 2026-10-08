// Lounge, reception and waiting area, and ceiling fans.
//
// Lounge, right of the chairs (x 8–14.5): a Chesterfield sofa, a floor lamp,
// a bar cart with whisky, framed posters and a jukebox whose arch and bubble
// tubes cycle colour while a record turns behind the glass.
// Reception, left of the chairs (x -9 to -5.3): a fluted walnut desk with a
// brass cash register that rings up a sale now and then, a bell, a banker's
// lamp and the appointment book; club chairs, a coffee table and a rug; a
// coat stand, a palm and a schoolhouse clock showing the visitor's time.
// Fans turn overhead. Static furniture is baked per area, and every printed
// thing (posters, rug, clock face, magazines…) shares one canvas atlas.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SERVICES } from './config.js';
import { mesh, bake, makeCanvas, rng, extrude, archShape, neonLevel, TAU, clamp, lerp, ease } from './kit.js';

// Placements: x, y, z and rotation about y.
const SOFA = [9.6, 0, -1.76, 0];
const CART = [11.15, 0, -1.93, 0];
const FLOOR_LAMP = [8.2, 0, -1.92, 0];
const JUKEBOX = [13.98, 0, -1.78, -0.3];
const DESK = [-6.45, 0, 0.7, 0.55];
const REGISTER = [-0.36, 1.02, -0.02, 0.1]; // on the desk
const CLOCK = [-7.2, 2.3, -2.2, 0];
const FANS = [[-6.9, -0.4], [1.5, 0.6], [11, 1.5]]; // x, z

// The one extra light (desktop only) follows the camera to whichever area
// it is looking at, so both get a real key light for the price of one.
const SPOTS = {
  reception: { pos: [-6.3, 4.4, 1.9], target: [-7.3, 0.5, -0.9], angle: 0.62, power: 15 },
  lounge: { pos: [9.9, 4.3, 0.9], target: [10.4, 0.5, -1.9], angle: 0.5, power: 13 },
};

export async function createLounge(ctx) {
  const { M, tier } = ctx;
  await loadFonts();
  const art = paintArt();
  const L = makeMaterials(M, art);
  const root = new THREE.Group();
  const warm = []; // light pools from lamps and picture lights
  const jukeGlow = []; // coloured light around the jukebox

  // ------------------------------------------------------------ lounge
  const lounge = new THREE.Group();
  const sofa = buildSofa(M);
  place(sofa, SOFA);
  lounge.add(sofa);
  const cart = buildBarCart(M);
  place(cart, CART);
  lounge.add(cart);
  const lamp = buildFloorLamp(M, L);
  place(lamp, FLOOR_LAMP);
  lounge.add(lamp);
  warm.push({ p: [8.2, 0.004, -1.55], s: [1.7, 1.5], up: true }, { p: [8.2, 2.05, -2.196], s: [1.1, 1.3] });

  for (const [rect, x, y, w, h, frame] of [
    [ART.eight, 9.1, 1.84, 0.5, 0.694, M.ebony],
    [ART.shave, 10.1, 1.84, 0.5, 0.694, M.brass],
    [ART.rules, 11.15, 1.78, 0.32, 0.427, M.brass],
    [ART.rhythm, 13.95, 2.04, 0.42, 0.583, M.ebony],
  ]) {
    lounge.add(buildPoster(M, L, rect, x, y, w, h, frame));
    warm.push({ p: [x, y + h / 2 + 0.05, -2.196], s: [w * 2.1, h * 1.2] });
  }

  const juke = buildJukebox(M, L);
  place(juke.body, JUKEBOX);
  lounge.add(juke.body);
  jukeGlow.push(
    { p: [13.62, 0.005, -1.05], s: [2.8, 2.1], up: true },
    { p: [13.95, 1.55, -2.197], s: [2.2, 2.0] },
    { p: [13.95, 0.62, -2.155], s: [2.0, 1.0] }
  );
  root.add(bake(lounge));
  const jukeAnim = place(new THREE.Group(), JUKEBOX);
  jukeAnim.add(juke.deck);
  root.add(jukeAnim);

  // ------------------------------------------------------------ reception
  const reception = new THREE.Group();
  const desk = place(buildDesk(M, L), DESK);
  const register = buildRegister(M, L);
  desk.add(place(register.body, REGISTER));
  reception.add(desk);
  desk.updateMatrixWorld(true);
  const lampPool = desk.localToWorld(new THREE.Vector3(0.52, 1.023, -0.02));
  warm.push({ p: lampPool.toArray(), s: [0.75, 0.6], up: true, ry: DESK[3] });

  reception.add(buildRug(L), buildCoffeeTable(M, L));
  for (const [x, z, ry] of [[-8.15, -1.35, 0.5], [-6.65, -1.45, -0.5]]) reception.add(place(buildClubChair(M), [x, 0, z, ry]));
  reception.add(place(buildCoatStand(M, L), [-8.85, 0, 0.25, 0.4]));
  reception.add(place(buildPalm(M, L), [-5.6, 0, -1.8, 0]));
  for (const [rect, x, y, w, h, frame] of [
    [ART.tonic, -8.65, 1.86, 0.5, 0.694, M.woodDark],
    [ART.prices, -6.15, 1.84, 0.46, 0.638, M.brass],
  ]) {
    reception.add(buildPoster(M, L, rect, x, y, w, h, frame));
    warm.push({ p: [x, y + h / 2 + 0.05, -2.196], s: [w * 2.1, h * 1.2] });
  }
  const clock = buildClock(M, L);
  reception.add(place(clock.body, CLOCK));
  root.add(bake(reception));

  const deskAnim = place(new THREE.Group(), DESK);
  deskAnim.add(place(register.moving, REGISTER));
  const clockAnim = place(new THREE.Group(), CLOCK);
  clockAnim.add(clock.moving);
  root.add(deskAnim, clockAnim);

  // ------------------------------------------------------------ fans
  const fanBodies = new THREE.Group();
  const rotors = FANS.map(([x, z]) => {
    const fan = buildFan(M, L);
    fan.body.position.set(x, 3.62, z);
    fanBodies.add(fan.body);
    const rotor = bake(fan.rotor);
    rotor.position.set(x, 3.62, z);
    rotor.rotation.y = x;
    root.add(rotor);
    return rotor;
  });
  root.add(bake(fanBodies));

  // ------------------------------------------------------------ light
  const warmPools = buildPools(warm, L.pool, 0xffc690);
  const jukePools = buildPools(jukeGlow, L.jukePool, 0xffffff);
  root.add(warmPools, jukePools);

  // Far from the key light: no point casting or sampling its shadow.
  root.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });

  let spot = null;
  if (tier === 2) {
    spot = new THREE.SpotLight(0xffd6a8, 0, 0, 0.6, 0.75, 1.6);
    spot.userData.at = null;
    root.add(spot, spot.target);
  }

  const tz = new Date().getTimezoneOffset() * 60000;
  const tint = new THREE.Color();
  let spin = 0;

  function update(dt, time, env) {
    const P = env.power;
    const move = !env.reduced;
    // Picture lights and fan globes are house lights; they dim after hours
    // but less than the overheads so the walls keep some colour.
    const fixture = P * (1 - 0.45 * env.afterHours);
    L.print.emissiveIntensity = 0.62 * fixture;
    L.glow.color.setRGB(4.2, 2.5, 1.2).multiplyScalar(fixture);
    L.frosted.emissiveIntensity = 1.5 * fixture;
    L.bankers.emissiveIntensity = 1.6 * P;
    L.pool.color.setScalar(0.55 * fixture);

    // Jukebox: flickers on after the neon, then cycles its colours.
    const juke = neonLevel(env.since === null ? null : env.since - 2.1, P, env.reduced) * env.glow;
    L.jukeUniforms.uLevel.value = juke;
    if (move) L.jukeUniforms.uTime.value += dt;
    L.chamber.color.setRGB(1.6, 0.95, 0.55).multiplyScalar(juke);
    L.jukePool.color.copy(jukeColor(-L.jukeUniforms.uTime.value * 0.07 + 0.3, tint)).multiplyScalar(0.5 * juke);
    L.vinyl.emissiveIntensity = 0.5 * juke;
    spin = lerp(spin, move && juke > 0.5 ? 3.5 : 0, 1 - Math.exp(-dt * 1.2));
    juke.record?.rotation; // placeholder removed below
    record.rotation.y -= spin * dt;

    if (move) for (const r of rotors) r.rotation.y += dt * 1.9;
    updateClock(clock, Date.now() - tz, env.reduced);
    updateRegister(register, time, env.reduced);
    if (spot) aimSpot(spot, env);
  }

  const record = juke.record;
  return { group: root, update };
}
