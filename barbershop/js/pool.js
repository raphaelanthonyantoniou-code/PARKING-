// Pool table lounge.
// Stub: returns an empty group until the module is built.
import * as THREE from 'three';

export function createPool(ctx) {
  return {
    group: new THREE.Group(),
    update() {},
  };
}
