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
        in vec4 vWorldPosition;
        #define TAU 6.28318530718
        
        float noise( in vec2 x ){return texture(noiseTexture, x*.01).x;}
        
        // adapted from https://www.shadertoy.com/view/MsKfRw


        #define sc (resolution.x/300.)

        vec2 uvSmooth(vec2 uv,vec2 res) {
          return uv+.6*sin(uv*res*PI2)/PI2/res;
        }

        vec4 getRand(vec2 pos) {
          vec2 tres=vec2(textureSize(noiseTexture,0));
          vec2 uv=pos/tres.xy;
          uv=uvSmooth(uv,tres);
          return textureLod(noiseTexture,uv,0.);
        }

        float texh(in vec2 p, in float lum) {
          vec4 r = getRand(p*1.2/sqrt(sc))-getRand(p*1.2/sqrt(sc)+vec2(1,-1)*1.5);
          float ramp=0.;
          int hnum = 5;
          #define N(v) (v.yx*vec2(-1,1))
          #define CS(ang) cos(ang-vec2(0,1.6))
          float hatch = 0.;
          float hatch2 = 0.;
          float sum=0.;
          for(int i=0;i<hnum;i++) {
            float br= lum;
            float ang=-.5-.08*float(i)*float(i);
            vec2 uvh=mat2(CS(ang),N(CS(ang)))*p/sqrt(sc)*vec2(.05,1)*1.3;
            vec4 rh = pow(getRand(uvh+vec2(sin(uvh.y),0)),vec4(1.));
            hatch += 1.-smoothstep(.5,1.5,(rh.x)+br)-.3*abs(r.z);
            hatch2 = max(hatch2, 1.-smoothstep(.5,1.5,(rh.x)+br)-.3*abs(r.z));
            sum+=1.;
            if( float(i)>(1.-br)*float(hnum) && i>=2 ) break;
          }
          return 1.-clamp(mix(hatch/sum,hatch2,.5),0.,1.);          
        }

        float texcube(in vec3 p, in vec3 n, in float l, float a) {
          float s = sin(a);
          float c = cos(a);
          mat2 rot = mat2(c, -s, s, c);
          vec3 v = vec3(texh(p.yz,l), texh(rot*p.zx,l), texh(rot*p.xy,l));
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
        vec3 coords = 200.*vWorldPosition.xyz;//*vec3(resolution, 1.); 
        float line = texcube(coords.xyz, vNormal, l, TAU/16.);
        vec3 inkColor = vec3(143., 10., 20.)/255.;
        float e = .01;
        float r = line;
        gl_FragColor.rgb = blendDarken(paper.rgb, inkColor,  1.-r);
        //gl_FragColor.rgb  = vec3(line);
        `
      );
    };
  }
}

export { CrossHatchMaterial };
