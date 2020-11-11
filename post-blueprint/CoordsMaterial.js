import {
  MeshBasicMaterial,
  Vector2,
  Color,
} from "../third_party/three.module.js";

class Material extends MeshBasicMaterial {
  constructor(options) {
    super(options);

    this.params = {
      angleGrid: 0,
      scale: 40,
    };

    this.uniforms = {
      angleGrid: { value: this.params.angleGrid },
      scale: { value: this.params.scale },
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
        vWorldPosition = modelViewMatrix * vec4(position, 1.);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
        uniform float angleGrid;
        uniform float scale;

        in vec2 vCoords;
        in vec3 vPosition;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718
        
        mat2 rot(in float a) {
          float s = sin(a);
          float c = cos(a);
          mat2 rot = mat2(c, -s, s, c);
          return rot;
        }
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>

        vec2 uv = rot(angleGrid) * vWorldPosition.xy;
        float stripeX = .5 + .5 * sin(uv.x * scale);
        float stripeY = .5 + .5 * sin(uv.y * scale);
        float stripe = max(stripeX, stripeY);
        float e = .05 * length(vec2(dFdx(uv.x), dFdy(uv.y))) * scale;
        gl_FragColor.a = .25;
        if(stripe < 1.-e) {
          gl_FragColor.a = 1.;
        }
        gl_FragColor.rgb = vWorldPosition.xyz / vWorldPosition.w;
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
