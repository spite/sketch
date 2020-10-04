import {
  MeshStandardMaterial,
  RepeatWrapping,
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
      const texture = loader.load("../assets/Craft_Light.jpg");
      const noiseTexture = loader.load("../assets/noise1.png");
      noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;
      shader.uniforms.resolution = { value: new Vector2(1, 1) };
      shader.uniforms.paperTexture = { value: texture };
      shader.uniforms.noiseTexture = { value: noiseTexture };
      shader.uniforms.range = { value: new Vector2(0.25, 0.75) };
      shader.uniforms.range2 = { value: new Vector2(0.5, 0.5) };
      shader.uniforms.scale = { value: 1 };
      shader.uniforms.radius = { value: 1 };
      self.uniforms = shader.uniforms;
      shader.vertexShader = shader.vertexShader.replace(
        `#include <common>`,
        `#include <common>
        out vec2 vCoords;
        out vec4 vWorldPosition;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        `#include <uv_vertex>`,
        `#include <uv_vertex>
        vCoords = uv;
        vWorldPosition = modelMatrix * vec4(position, 1.);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform sampler2D noiseTexture;
        uniform vec2 range;
        uniform vec2 range2;
        uniform float scale;
        uniform float radius;
        in vec2 vCoords;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718
        
        // adapted from https://www.shadertoy.com/view/4lfXDM
        float noise( in vec2 x ){return texture(noiseTexture, x*.01).x;}
        float texh(in vec2 p, in float str)
        {
            p*= .7;
            float rz= 1.;
            for (int i=0;i<10;i++)
            {
                float g = texture(noiseTexture,vec2(0.025,.5)*p).x;
                g = smoothstep(0.-str*0.1,2.3-str*0.1,g);
                rz = min(1.-g,rz);
                p.xy = p.yx;
                p += .07;
                p *= 1.2;
                if (float(i) > str)break;
            }
            return rz * 1.05;
        }

        float texcube(in vec3 p, in vec3 n, in float str) {
          vec3 v = vec3(texh(p.yz,str), texh(p.zx,str), texh(p.xy,str));
          return dot(v, n*n);
        }

        float luma(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }
        float luma(vec4 color) {
          return dot(color.rgb, vec3(0.299, 0.587, 0.114));
        }
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float l = 1. - luma(gl_FragColor.rgb);
        l = smoothstep(.4, 1., l);
        float threshold = .5;
        float l2 = l;//.5 * smoothstep(0., 1., luma(gl_FragColor.rgb)-threshold);
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        float line = texcube(vWorldPosition.xyz, vNormal, l*10.);
        float line2 = clamp(0.,1.,texcube(vWorldPosition.xyz, vNormal, l2*10.)-threshold);
        float e = .2;
        line = smoothstep(.5-e, .5+e, line);
        //line = .15 + .85 * line;
        line2 = smoothstep(.5-e, .5+e, line2);
        vec3 inkColor = vec3(112., 66., 20.)/255.;
        inkColor *= .2;
        gl_FragColor.rgb = mix( inkColor, paper.rgb, .25 + .75 * line);
        gl_FragColor.rgb += vec3(4.*line2);
        `
      );
    };
  }
}

export { CrossHatchMaterial };
