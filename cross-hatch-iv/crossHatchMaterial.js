import {
  MeshStandardMaterial,
  Vector2,
  Color,
} from "../third_party/three.module.js";
import { lines } from "../shaders/lines.js";

class CrossHatchMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);
    
    this.params = {
      roughness: 0.2,
      metalness: 0.1,
      inkColor: 0xF313F2,
      scale: 200,
    };

    this.uniforms = {
      inkColor: {value: new Color(this.params.inkColor)},
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      scale: {value:this.params.scale}
    }

    this.onBeforeCompile = (shader, renderer) => {
      for (const uniformName of Object.keys(this.uniforms)) {
        shader.uniforms[uniformName] = this.uniforms[uniformName];
      }

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
        vWorldPosition = modelViewMatrix * vec4(position, 1.);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform vec3 inkColor;
        uniform float scale;
        in vec2 vCoords;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718
        
        vec2 noise(vec2 x){
            return fract(cos(dot(x,vec2(134.,1.61034)))*vec2(416418.0,1265.7486));
        }

        float calc(vec2 v, float l) {
          float a = atan(v.y, v.x);
          float r = .5 + .5 * sin(length(v)+a);
          return r - l;
        }

        float texcube(in vec3 p, in vec3 n, in float f) {
          vec3 v = vec3(calc(p.yz,f), calc(p.xz,f), calc(p.xy,f));
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

        float aastep(float threshold, float value) {
          #ifdef GL_OES_standard_derivatives
            float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
            return smoothstep(threshold-afwidth, threshold+afwidth, value);
          #else
            return step(threshold, value);
          #endif  
        }
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float l =  luma(gl_FragColor.rgb);
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        vec3 coords = scale * vWorldPosition.xyz / vWorldPosition.w;
        float line = texcube(coords, vNormal, .5*l);
        float r = aastep(l, line);
        gl_FragColor.rgb = blendColorBurn(paper.rgb, inkColor, r);
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
  gui.add(params, "scale", 10, 400,.1).onChange((v) => (material.uniforms.scale.value = v));
}

export { CrossHatchMaterial ,generateParams };
