import {
  Color,
  MeshStandardMaterial,
  Vector2,
} from "../third_party/three.module.js";

class LineMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);

    this.params = {
      roughness: 0.4,
      metalness: 0.1,
      scale: 200,
      inkColor: 0x31603,
      angle: 1.45,
      e: .22,
    };

    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      scale: { value: this.params.scale },
      inkColor: { value: new Color(this.params.inkColor) },
      angle: { value: this.params.angle },
      e: { value: this.params.e },
    };

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
        uniform vec3 inkColor;
        uniform float scale;
        uniform float angle;
        uniform float e;
        in vec2 vCoords;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718
        
        // procedural noise from IQ
        vec2 hash( vec2 p )
        {
          p = vec2( dot(p,vec2(127.1,311.7)),
              dot(p,vec2(269.5,183.3)) );
          return -1.0 + 2.0*fract(sin(p)*43758.5453123);
        }

        float noise( in vec2 p )
        {
          const float K1 = 0.366025404; // (sqrt(3)-1)/2;
          const float K2 = 0.211324865; // (3-sqrt(3))/6;
          
          vec2 i = floor( p + (p.x+p.y)*K1 );
          
          vec2 a = p - i + (i.x+i.y)*K2;
          vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
          vec2 b = a - o + K2;
          vec2 c = a - 1.0 + 2.0*K2;
          
          vec3 h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );
          
          vec3 n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
          
          return dot( n, vec3(70.0) );
        }

        /////////

        float aastep(float threshold, float value) {
          #ifdef GL_OES_standard_derivatives
            float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
            return smoothstep(threshold-afwidth, threshold+afwidth, value);
          #else
            return step(threshold, value);
          #endif  
        }

        vec2 rot (vec2 p ,float a){
            float c = cos(a);
            float s=sin(a);
          return vec2(p.x*c -p.y*s,p.x*s + p.y*c);
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

        float pattern(in vec2 qr, in float angle, in float w) {
          vec2 coords = rot(qr, angle);
          float v = .5 + .5 * sin(coords.y);
          float line = v;
          return line;
        }

        float texCube(in vec3 p, in float angle, in vec3 n, in float l) {
          vec3 v = vec3(pattern(p.yz, angle, l),pattern(p.zx,angle, l), pattern(p.xy,angle, l));
          return dot(v, n*n);
        }
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float l = 1.-luma(gl_FragColor.rgb);
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        vec3 coords = scale * vWorldPosition.xyz;
        float line = 1.;
        if(l>.2) {
          float v = l - .2;
          line *= texCube(coords, angle, vNormal, v) + pow(1.-v, 10.);
        }
        if(l>.5) {
          float v = l - .5;
          line *= texCube(2.*coords, angle - TAU/8., vNormal, v) + pow(1.-v, 10.);
        }
        if(l>.8) {
          float v = l - .8;
          line *= texCube(2.*coords, angle + TAU/8., vNormal, v) + pow(1.-v, 10.);
        }
        line += .3 * noise(.1*gl_FragCoord.xy/resolution) * l;
        line = clamp(line, 0., 1.);
        float r = aastep(e, line);
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
  gui.add(params, "scale", 10, 300,.01).onChange((v) => (material.uniforms.scale.value = v));
  gui.add(params, "angle", 0, 2 * Math.PI,.01).onChange((v) => (material.uniforms.angle.value = v));
  gui.add(params, "e", 0, 1,.01).onChange((v) => (material.uniforms.e.value = v));
}

export { LineMaterial, generateParams };
