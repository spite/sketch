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
      scale: 100,
      inkColor: 0x1831D3,
      min: .1,
      max: .9,
      e: .1
    };

    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      scale: { value: this.params.scale },
      inkColor: { value: new Color(this.params.inkColor) },
      range: { value: new Vector2(this.params.min, this.params.max)},
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
        uniform vec2 range;
        uniform float scale;
        uniform float e;
        in vec2 vCoords;
        in vec3 vPosition;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718

        float aastep(float threshold, float value) {
          #ifdef GL_OES_standard_derivatives
            float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
            return smoothstep(threshold-afwidth, threshold+afwidth, value);
          #else
            return step(threshold, value);
          #endif  
        }

        vec2 noise(vec2 x){
          return fract(cos(dot(x,vec2(134.,1.61034)))*vec2(416418.0,1265.7486));
        }

        float calc(in vec2 uv, float f) {
          vec2 uv00 = vec2(0,0)+floor(uv);
          vec2 uv01 = vec2(0,1)+floor(uv);
          vec2 uv10 = vec2(1,0)+floor(uv);
          vec2 uv11 = vec2(1,1)+floor(uv);

          vec3 col = vec3(0);
          vec2 n00 = noise(uv00);
          vec2 n01 = noise(uv01);
          vec2 n10 = noise(uv10);
          vec2 n11 = noise(uv11);
          uv00 = ceil(uv00) + n00-.5;
          uv01 = ceil(uv01) + n01-.5;
          uv10 = ceil(uv10) + n10-.5;
          uv11 = ceil(uv11) + n11-.5;

          vec2 uv0 = mix(uv00,uv01, float(distance(uv00,uv)>distance(uv01,uv)));
          vec2 uv1 = mix(uv10,uv11, float(distance(uv10,uv)>distance(uv11,uv)));
          vec2 uvC = mix(uv0,uv1,   float(distance(uv0,uv) >distance(uv1,uv)));
          vec2 uvL = uv-uvC;
          vec2 vn = noise(uvC)-.5;
          float g = dot(uvL,normalize(vn));
          float v = .5 + .5 * (sin(15.*g));
          return smoothstep(f-e, f+e, v);//aastep(f, v);
        }


        /////////


        float hetched(in vec2 p, float ll) {
          float line = 1.;
          if(ll<.8){
            line *= calc(p/40., .01);
          }
          if(ll<.6){
            line *= calc(p/20., .05);
          }
          if(ll<.4){
            line *= calc(p/10., .3);
          }
          if(ll<.2){
            line *= calc(p/10., .5);
          }
          return ll + line;
        }

        float texcube(in vec3 p, in vec3 n, in float q) {
         vec3 v = vec3(hetched(p.yz,q), hetched(p.zx,q), hetched(p.xy,q));
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
        float ll = range.x + range.y * l;
        float line = texcube(coords, vNormal, ll);

        float r = aastep(.9, line);

        gl_FragColor.rgb = blendColorBurn(paper.rgb, inkColor, 1.-r);
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
  gui.add(params, "scale", 10, 200,.01).onChange((v) => (material.uniforms.scale.value = v));
  gui.add(params, "min", 0, 1,.001).onChange((v) => (material.uniforms.range.value.x = v));
  gui.add(params, "max", 0, 1,.001).onChange((v) => (material.uniforms.range.value.y = v));
  gui.add(params, "e", 0, 1,.001).onChange((v) => (material.uniforms.e.value = v));
}

export { LineMaterial, generateParams };
