import {
  MeshBasicMaterial,
  Vector2,
  Color,
} from "../third_party/three.module.js";

class Material extends MeshBasicMaterial {
  constructor(options) {
    super(options);

    this.params = {
      roughness: 0.4,
      metalness: 0.1,
      scale: 100,
      inkColor: 0x1831d3,
      min: 0.1,
      max: 0.9,
      e: 0.1,
    };

    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      scale: { value: this.params.scale },
      inkColor: { value: new Color(this.params.inkColor) },
      range: { value: new Vector2(this.params.min, this.params.max) },
      e: { value: this.params.e },
    };

    this.onBeforeCompile = (shader, renderer) => {
      for (const uniformName of Object.keys(this.uniforms)) {
        shader.uniforms[uniformName] = this.uniforms[uniformName];
      }

      shader.vertexShader = shader.vertexShader.replace(
        `#include <common>`,
        `#include <common>
        out vec2 vCoords;
        out vec3 vPosition;
        out vec4 vWorldPosition;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        `#include <uv_vertex>`,
        `#include <uv_vertex>
        vCoords = uv;
        vPosition = position;
        vWorldPosition = modelViewMatrix * vec4(position, 1.);// + vec4(normal.xyz, 0.);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform vec3 inkColor;
        uniform vec2 range;
        uniform float scale;
        uniform float e;
        in vec2 vCoords;
        in vec3 vPosition;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        gl_FragColor.rgb = vWorldPosition.xyz;
        `
      );
    };
  }
}

function generateParams(gui, material) {
  const params = material.params;
  gui.add(params, "roughness", 0, 1).onChange((v) => (material.roughness = v));
  gui.add(params, "metalness", 0, 1).onChange((v) => (material.metalness = v));
}

export { Material, generateParams };
