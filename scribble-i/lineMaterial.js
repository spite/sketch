import {
  MeshStandardMaterial,
  RepeatWrapping,
  TextureLoader,
  Vector2,
  Vector3,
} from "../third_party/three.module.js";
import { lines } from "../shaders/lines.js";

class LineMaterial extends MeshStandardMaterial {
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
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform sampler2D noiseTexture;
        uniform vec2 range;
        uniform vec2 range2;
        uniform float scale;
        uniform float radius;
        in vec2 vCoords;
        in vec3 vPosition;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718

        mat2 m = mat2( vec2 (2.1, 1.0), vec2(-1.0, 2.1) );

        float noise_f(vec2 p) {
          return sin(1.66*p.x)*sin(1.66*p.y);
        }

        float warp(in vec2 p) {
          float f = 0.0;
          float amp = 1.0; 
          float kAmp = 0.5;
          float freq = 0.63;
          float kFreq = 1.53;
          
          f += amp*noise_f(p); p = m*p*freq; amp *=kAmp; freq *=kFreq;
          f += amp*noise_f(p); p = m*p*freq; amp *=kAmp; freq *=kFreq;
          f += amp*noise_f(p); p = m*p*freq; amp *=kAmp; freq *=kFreq;
          f += amp*noise_f(p);
          
          f = fract(f);
          
          return f;
        }
   
        float aastep(float threshold, float value) {
          #ifdef GL_OES_standard_derivatives
            float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
            return smoothstep(threshold-afwidth, threshold+afwidth, value);
          #else
            return step(threshold, value);
          #endif  
        }

        #define tileSize 0.05
        #define tileCenter vec2(tileSize / 2.0, tileSize / 2.0)

        float scribble(in vec2 uv, in float q) {
          
          vec2 tile = vec2(floor(uv.x / tileSize), floor(uv.y / tileSize));
          uv -= tile * tileSize;
          float dist = length(tileCenter - uv) + warp(uv);
          float circle = .5 + .5 * cos(dist * 1000. + 100. * warp(uv.yx));      
          return aastep(.4, circle+q);
        }

        /////////

        float texcube(in vec3 p, in vec3 n, in float q) {
          //p = .05 * vec3(warp(p.xy), warp(p.xy), warp(p.xy));
          vec3 v = vec3(scribble(p.yz,q), scribble(p.zx,q), scribble(p.xy,q));
          //p = 1. * vec3(warp(p.xy), warp(p.xy), warp(p.xy));
          p *= 1.1;
          vec3 v2 = vec3(scribble(p.yz,q), scribble(p.zx,q), scribble(p.xy,q));
          v *= v2;
          return dot(v, n*n);
        }

        float luma(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }
        float luma(vec4 color) {
          return dot(color.rgb, vec3(0.299, 0.587, 0.114));
        }
        float blendColorBurn(float base, float blend) {
          return (blend==0.0)?blend:max((1.0-((1.0-base)/blend)),0.0);
        }
        
        vec3 blendColorBurn(vec3 base, vec3 blend) {
          return vec3(blendColorBurn(base.r,blend.r),blendColorBurn(base.g,blend.g),blendColorBurn(base.b,blend.b));
        }
        
        vec3 blendColorBurn(vec3 base, vec3 blend, float opacity) {
          return (blendColorBurn(base, blend) * opacity + base * (1.0 - opacity));
        }
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float l = luma(gl_FragColor.rgb);
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));

        vec3 coords = .1 * vWorldPosition.xyz / vWorldPosition.w;
        float line = texcube(coords, vNormal, l);

        vec3 inkColor = vec3(20., 105., 10.)/255.;
        float r = aastep(1.-l, line);

        gl_FragColor.rgb = blendColorBurn(paper.rgb, inkColor, 1.-r);
        //gl_FragColor.rgb = vec3(r);
        `
      );
    };
  }
}

export { LineMaterial };
