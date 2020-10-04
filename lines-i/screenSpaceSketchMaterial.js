import {
  MeshStandardMaterial,
  TextureLoader,
  Vector2,
  Vector3,
} from "../third_party/three.module.js";
import { lines } from "../shaders/lines.js";

class ScreenSpaceSketchMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);
    const self = this;

    this.onBeforeCompile = (shader, renderer) => {
      const loader = new TextureLoader();
      const texture = loader.load("../assets/Watercolor_ColdPress.jpg");
      shader.uniforms.resolution = { value: new Vector2(1, 1) };
      shader.uniforms.paperTexture = { value: texture };
      shader.uniforms.range = { value: new Vector2(0.25, 0.75) };
      shader.uniforms.range2 = { value: new Vector2(0.5, 0.5) };
      shader.uniforms.scale = { value: 1 };
      shader.uniforms.radius = { value: 1 };
      self.uniforms = shader.uniforms;
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

export { ScreenSpaceSketchMaterial };
