import {
  MeshStandardMaterial,
  TextureLoader,
  Vector2,
  Vector3,
} from "../third_party/three.module.js";
import { lines } from "../shaders/lines.js";

class CrossHatchMaterial extends MeshStandardMaterial {
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
      shader.vertexShader = shader.vertexShader.replace(
        `#include <common>`,
        `#include <common>
        out vec2 vCoords;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        `#include <uv_vertex>`,
        `#include <uv_vertex>
        vCoords = uv;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform vec2 range;
        uniform vec2 range2;
        uniform float scale;
        uniform float radius;
        in vec2 vCoords;
        #define TAU 6.28318530718
        ${lines}
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float l = luma(gl_FragColor.rgb);
        // float darkColor = l;
        // float lightColor = 1. - smoothstep(0., .1, l-.5);
        // float darkLines = lines(darkColor, 100.*vCoords, resolution, range, range2, scale, radius);
        // float lightLines = lines(lightColor, 100.*vCoords, resolution, range, range2, scale, radius);
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        float levels = 5.;
        float freq = float(int(l * levels))/levels;
        float line = 1.;
        float f = 100.;
        float dd = .01;
        float m = .01;
        float x0 = .5;
        vec2 coords = vCoords;
        vec2 fw = fwidth(coords);
        float r = 50. * abs(fw.y+fw.x);
        coords *= vec2(1500., 100.);
        coords -= vec2(.5);
        float a = .123123;//TAU / 8.;
        float s = sin(a);
        float c = cos(a);
        mat2 rot = mat2(c, -s, s, c);
        coords = rot * coords;
        if(freq<4./5.){
          float x = .5 + .5 * sin(coords.y * 1.);
          line *= .75 + .25 * smoothstep(.0, .01 , abs(x-x0)-r/2. ) ;
        }
        if(freq<3./5.){
          float x = .5 + .5 * sin(coords.y * 2.);
          line *= .5 + .5 * smoothstep(.0, .01 , abs(x-x0)-r/2. ) ;
        }
        if(freq<2./5.){
          float x = .5 + .5 * sin(coords.y * 4.);
          line *= .25 + .75 *  smoothstep(.0, .01 , abs(x-x0)-r/2. ) ;

        }
        if(freq<1./5.){
          float x = .5 + .5 * sin(coords.y * 8.);
          line *= smoothstep(.0, .01 , abs(x-x0)-r/2. ) ;
        }

        coords = vCoords;
        coords *= vec2(1500., 100.);
        coords -= vec2(.5);
        a = -.49345;//TAU / 8.;
        s = sin(a);
        c = cos(a);
        rot = mat2(c, -s, s, c);
        coords = rot * coords;
        float line2 = 1.;
        if(freq<4./5.){
          float x = .5 + .5 * sin(coords.x * 1.);
          line2 *= .75 + .25 * smoothstep(.0, .01 , abs(x-x0)-r/2. ) ;
        }
        if(freq<3./5.){
          float x = .5 + .5 * sin(coords.x * 2.);
          line2 *= .5 + .5 * smoothstep(.0, .01 , abs(x-x0)-r/2. ) ;
        }
        if(freq<2./5.){
          float x = .5 + .5 * sin(coords.x * 4.);
          line2 *= .25 + .75 *  smoothstep(.0, .01 , abs(x-x0)-r/2. ) ;

        }
        if(freq<1./5.){
          float x = .5 + .5 * sin(coords.x * 8.);
          line2 *= smoothstep(.0, .01 , abs(x-x0)-r/2. ) ;
        }

        gl_FragColor.rgb = paper.rgb * (line);
        `
      );
    };
  }
}

export { CrossHatchMaterial };
