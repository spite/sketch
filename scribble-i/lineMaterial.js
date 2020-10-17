import {
  MeshStandardMaterial,
  Vector2,
  Color,
} from "../third_party/three.module.js";

class LineMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);

    this.params = {
      roughness: 0.4,
      metalness: 0.1,
      scale: .1,
      inkColor: 0x14690A,
      factor: 1.1,
      e: .4
    };

    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      scale: { value: this.params.scale },
      inkColor: { value: new Color(this.params.inkColor) },
      factor: { value: this.params.factor},
      e: { value: this.params.e}
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
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform vec3 inkColor;
        uniform float factor;
        uniform float scale;
        uniform float e;
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
          return aastep(e, circle+q);
        }

        /////////

        float texcube(in vec3 p, in vec3 n, in float q) {
          //p = .05 * vec3(warp(p.xy), warp(p.xy), warp(p.xy));
          vec3 v = vec3(scribble(p.yz,q), scribble(p.zx,q), scribble(p.xy,q));
          //p = 1. * vec3(warp(p.xy), warp(p.xy), warp(p.xy));
          p *= factor;
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

        vec3 coords = scale * vWorldPosition.xyz / vWorldPosition.w;
        float line = texcube(coords, vNormal, l);

        float r = aastep(1.-l, line);

        gl_FragColor.rgb = blendColorBurn(paper.rgb, inkColor, 1.-r);
        //gl_FragColor.rgb = vec3(r);
        `
      );
    };
  }
}

function generateParams(gui, material) {
  const params = material.params;
  gui.add(params, "roughness", 0, 1).onChange((v) => (material.roughness = v));
  gui.add(params, "metalness", 0, 1).onChange((v) => (material.metalness = v));
  gui.addColor(params, "inkColor").onChange((v) => (material.uniforms.inkColor.value.set(v)));
  gui.add(params, "scale", .05, .2  ,.001).onChange((v) => (material.uniforms.scale.value = v));
  gui.add(params, "factor", .5, 1.5,.001).onChange((v) => (material.uniforms.factor.value = v));
  gui.add(params, "e", 0, 1,.001).onChange((v) => (material.uniforms.e.value = v));
}

export { LineMaterial, generateParams };
