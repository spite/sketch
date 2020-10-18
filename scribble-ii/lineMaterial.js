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
      scale: 1.,
      inkColor: 0x200d6,
      factor: 8,
      thickness: .7,
      e: .1,
      rim: 1,
    };

    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      scale: { value: this.params.scale },
      inkColor: { value: new Color(this.params.inkColor) },
      factor: { value: this.params.factor},
      thickness: { value: this.params.thickness},
      e: { value: this.params.e},
      rim: { value: this.params.rim}
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
        uniform float thickness;
        uniform float e;
        uniform float rim;
        in vec2 vCoords;
        in vec3 vPosition;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718

        // from https://www.shadertoy.com/view/MdfcRS

        float noise3( vec3 x ) {
          vec3 p = floor(x),f = fract(x);
      
          f = f*f*(3.-2.*f);  // or smoothstep     // to make derivative continuous at borders
      
      #define hash3(p)  fract(sin(1e3*dot(p,vec3(1,57,-13.7)))*4375.5453)        // rand
          
          return mix( mix(mix( hash3(p+vec3(0,0,0)), hash3(p+vec3(1,0,0)),f.x),       // triilinear interp
                          mix( hash3(p+vec3(0,1,0)), hash3(p+vec3(1,1,0)),f.x),f.y),
                      mix(mix( hash3(p+vec3(0,0,1)), hash3(p+vec3(1,0,1)),f.x),       
                          mix( hash3(p+vec3(0,1,1)), hash3(p+vec3(1,1,1)),f.x),f.y), f.z);
      }
      
      #define noise(x) (noise3(x)+noise3(x+11.5)) / 2. // pseudoperlin improvement from foxes idea 

        /////
   
        float aastep(float threshold, float value) {
          #ifdef GL_OES_standard_derivatives
            float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
            return smoothstep(threshold-afwidth, threshold+afwidth, value);
          #else
            return step(threshold, value);
          #endif  
        }

        /////////

        float texcube(in vec3 p, in vec3 n, in float q) {
          vec3 line = vec3(
            noise(vec3(1., p.yz)),
            noise(vec3(p.x, 1., p.z)),
            noise(vec3(p.xy, 1.))
          );
          vec3 v = sin(6.28*factor*line);
          vec3 r = smoothstep(-1.+e,1.-e, thickness*abs(v)/fwidth(v));
          return dot(r, n*n);
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

        vec3 n = normalize(vNormal);

        // Compute curvature
        vec3 dx = dFdx(n);
        vec3 dy = dFdy(n);
        vec3 xneg = n - dx;
        vec3 xpos = n + dx;
        vec3 yneg = n - dy;
        vec3 ypos = n + dy;
        float depth = length(vWorldPosition);
        float curvature = abs((cross(xneg, xpos).y - cross(yneg, ypos).x) * 400.0 / depth);

        l -= .1*curvature*rim;

        vec3 coords = scale * vWorldPosition.xyz / vWorldPosition.w;
        float r = 1.;
        if(l<.8) {
          float v =  texcube(coords, vNormal, l);
          r *= max(v, smoothstep(.5, .8, l));
        }
        if(l<.5) {
         float v = texcube(2. * coords, vNormal, l);
         r *= max(v, smoothstep(.2, .5, l));
        }
        if(l<.2) {
          float v = texcube(4. * coords, vNormal, l);
          r *= max(v, smoothstep(0., .2, l));
        }
        //r = aastep(e, r);

        gl_FragColor.rgb = blendColorBurn(paper.rgb, inkColor, 1.-r);
        //gl_FragColor.rgb = vec3(l);
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
  gui.add(params, "scale", .01, 3,.001).onChange((v) => (material.uniforms.scale.value = v));
  gui.add(params, "factor", 1, 20,.001).onChange((v) => (material.uniforms.factor.value = v));
  gui.add(params, "thickness", .01, 1,.001).onChange((v) => (material.uniforms.thickness.value = v));
  gui.add(params, "e", 0, 1,.001).onChange((v) => (material.uniforms.e.value = v));
  gui.add(params, "rim", 0, 1,.001).onChange((v) => (material.uniforms.rim.value = v));
}

export { LineMaterial, generateParams };
