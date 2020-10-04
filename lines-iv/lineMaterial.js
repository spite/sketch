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
      const texture = loader.load("../assets/Craft_Rough.jpg");
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

        float hetched(vec2 p, vec2 q)
        { 
          return (1.45*abs(p.y) + .3 * noise(q));
        }

        float texcube(in vec3 p, in vec3 n, in vec3 q) {
          vec3 v = vec3(hetched(p.yz,q.xy), hetched(p.zx,q.xy), hetched(p.xy,q.xy));
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
        vec3 coords = .01 * gl_FragCoord.xyz/ gl_FragCoord.w;
        vec3 qr = coords.xyz;
        float line = texcube(2.0*fract(qr) - 1.0, vNormal, .1 * coords)*l;
        vec3 inkColor = vec3(135., 180., 31.)/255.;
        float r = aastep(-.25+1.-l, line);
        gl_FragColor.rgb = blendColorBurn(paper.rgb, inkColor, 1.-r);

        `
      );
    };
  }
}

export { LineMaterial };
