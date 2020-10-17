import {
  MeshStandardMaterial,
  RepeatWrapping,
  TextureLoader,
  Vector2,
  Color,
} from "../third_party/three.module.js";

class CrossHatchMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);
    
    const loader = new TextureLoader();
    const noiseTexture = loader.load("../assets/noise1.png");
    noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;

    this.params = {
      roughness: 0.2,
      metalness: 0.1,
      inkColor: 0x2036FF,
      scale: 50,
      width: 2
    };

    this.uniforms = {
      inkColor: {value: new Color(this.params.inkColor)},
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      noiseTexture: { value: noiseTexture },
      width: {value: this.params.width},
      scale: {value: this.params.scale}
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
        uniform sampler2D noiseTexture;
        uniform float scale;
        uniform float width;
        uniform vec3 inkColor;
        in vec2 vCoords;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718
        
        float noise( in vec2 x ){return texture(noiseTexture, x*.01).x;}
        
        float texh(in vec2 p, in float lum) {
          float e = width * length(vec2(dFdx(p.x), dFdy(p.y))); 
          if (lum < 1.00) {
            float v = abs(mod(p.x + p.y, 10.0));
            if (v < e) {
              return 0.;
            }
          }
          
          if (lum < 0.8) {
            float v = abs(mod(p.x - p.y, 10.0));
            if (v < e) {
              return 0.;
            }
          }
          
          if (lum < 0.6) {
            float v = abs(mod(p.x + p.y - 5.0, 10.0));
            if (v < e) {
              return 0.;
            }
          }
          
          if (lum < 0.4) {
            float v = abs(mod(p.x - p.y - 5.0, 10.0));
            if (v < e) {
              return 0.;
            }
          }

          if (lum < 0.2) {
            float v = abs(mod(p.x + p.y - 7.5, 10.0));
            if (v < e) {
              return 0.;
            }
          }

         return 1.;
        }

        float texcube(in vec3 p, in vec3 n, in float l, float a) {
          //return texh(p.xy, l);
          float s = sin(a);
          float c = cos(a);
          mat2 rot = mat2(c, -s, s, c);
          vec3 v = vec3(texh(rot*p.yz,l), texh(rot*p.zx,l), texh(rot*p.xy,l));
          //return v.z;
          return dot(v, n*n);
        }

        float luma(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }
        float luma(vec4 color) {
          return dot(color.rgb, vec3(0.299, 0.587, 0.114));
        }

        float blendDarken(float base, float blend) {
          return min(blend,base);
        }
        
        vec3 blendDarken(vec3 base, vec3 blend) {
          return vec3(blendDarken(base.r,blend.r),blendDarken(base.g,blend.g),blendDarken(base.b,blend.b));
        }
        
        vec3 blendDarken(vec3 base, vec3 blend, float opacity) {
          return (blendDarken(base, blend) * opacity + base * (1.0 - opacity));
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
        float l = 2. * luma(gl_FragColor.rgb);
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        vec3 coords = scale*vWorldPosition.xyz;//*vec3(resolution, 1.); 
        float line = texcube(coords.xyz, vNormal, l, TAU/16.);
        float r = line;//1. - smoothstep(l-e, l+e, line);
        gl_FragColor.rgb = blendDarken(paper.rgb, inkColor,  1.-r);
        //gl_FragColor.rgb  = vec3(line);
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
  gui.add(params, "scale", 10, 100,.1).onChange((v) => (material.uniforms.scale.value = v));
  gui.add(params, "width", 0, 10,.01).onChange((v) => (material.uniforms.width.value = v));
}

export { CrossHatchMaterial, generateParams };

