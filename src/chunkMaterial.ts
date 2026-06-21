// ---------------------------------------------------------------------------
// Chunk materials. Built on MeshBasicMaterial (texture * brightness, with fog
// for free) and patched via onBeforeCompile to read a per-vertex `aLight`
// attribute = (bakedShade, skylight) and dim by a global day/night uniform.
//   final.rgb = texture.rgb * shade * (ambient + (1-ambient) * sky*uDayLight)
// shade already encodes per-face shading (top/side/bottom) * ambient occlusion.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const AMBIENT = 0.08;

export interface ChunkMaterials {
  opaque: THREE.Material;
  cutout: THREE.Material;
  translucent: THREE.Material;
  setDayLight(v: number): void;
}

export function makeChunkMaterials(atlas: THREE.Texture): ChunkMaterials {
  const dayLight = { value: 1.0 };

  function patch(mat: THREE.MeshBasicMaterial) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDayLight = dayLight;
      shader.vertexShader =
        'attribute vec2 aLight;\nvarying vec2 vAL;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vAL = aLight;',
        );
      shader.fragmentShader =
        'varying vec2 vAL;\nuniform float uDayLight;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  float _sky = clamp(vAL.y * uDayLight, 0.0, 1.0);
  float _bright = vAL.x * (${AMBIENT.toFixed(3)} + ${(1 - AMBIENT).toFixed(3)} * _sky);
  diffuseColor.rgb *= _bright;`,
        );
    };
  }

  const base = {
    map: atlas,
    fog: true,
  };

  const opaque = new THREE.MeshBasicMaterial({ ...base, side: THREE.FrontSide });
  patch(opaque);

  // Glass: alpha-blended translucent pane. depthWrite is OFF (like water) so
  // stacked glass panes sort back-to-front and stay visible through each other
  // rather than the nearer pane's body occluding the farther one. (This is the
  // RenderLayer.Cutout slot; glass is its only block.)
  const cutout = new THREE.MeshBasicMaterial({
    ...base,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });
  patch(cutout);

  const translucent = new THREE.MeshBasicMaterial({
    ...base,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  patch(translucent);

  return {
    opaque,
    cutout,
    translucent,
    setDayLight(v: number) {
      dayLight.value = v;
    },
  };
}
