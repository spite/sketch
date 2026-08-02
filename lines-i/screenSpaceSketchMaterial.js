import { signal } from "../third_party/guspira.js";
import { MeshStandardMaterial, Vector2 } from "../third_party/three.module.js";
import { lines } from "../shaders/lines.js";
import { addMaterialParams } from "../js/params.js";

class ScreenSpaceSketchMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);

    this.params = {
      roughness: 0.4,
      metalness: 0.1,
      min: 0.25,
      max: 0.75,
      min2: 0.5,
      max2: 0.5,
      scale: 1,
      radius: 1,
    };

    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      range: { value: new Vector2(this.params.min, this.params.max) },
      range2: { value: new Vector2(this.params.min2, this.params.max2) },
      scale: { value: this.params.scale },
      radius: { value: this.params.radius },
    };

    this.onBeforeCompile = (shader, renderer) => {
      for (const uniformName of Object.keys(this.uniforms)) {
        shader.uniforms[uniformName] = this.uniforms[uniformName];
      }

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform vec2 range;
        uniform vec2 range2;
        uniform float scale;
        uniform float radius;
            ${lines}`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float l = luma(gl_FragColor.rgb);
        float darkColor = l;
        float lightColor = 1. - smoothstep(0., .1, l-.5);
        float darkLines = lines(darkColor, gl_FragCoord.xy, resolution, range, range2, scale, radius);
        float lightLines = lines(lightColor, gl_FragCoord.xy, resolution, range, range2, scale, radius);
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        gl_FragColor.rgb = paper.rgb * vec3(.25 + .75 * darkLines) + 1. * (1. - lightLines );`
      );
    };
  }
}

function generateParams(gui, material) {
  const params = material.params;
  addMaterialParams(gui, material);
  gui.addRangeSlider("range", signal([params.min, params.max]), 0, 2, 0.01, ([lo, hi]) => material.uniforms.range.value.set(lo, hi));
  gui.addRangeSlider("range 2", signal([params.min2, params.max2]), 0, 2, 0.01, ([lo, hi]) => material.uniforms.range2.value.set(lo, hi));
  gui.addSlider("scale", signal(params.scale), 0, 10, 0.01, (v) => (material.uniforms.scale.value = v));
  gui.addSlider("radius", signal(params.radius), 1, 10, 0.01, (v) => (material.uniforms.radius.value = v));
}

export { ScreenSpaceSketchMaterial, generateParams };
