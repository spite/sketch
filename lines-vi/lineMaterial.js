import {
  MeshStandardMaterial,
  Vector2,
  Color,
} from "../third_party/three.module.js";

// based on https://www.youtube.com/watch?v=508pwYME-w4

class LineMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);

    this.params = {
      roughness: 0.4,
      metalness: 0.1,
      scale: 0.65,
      inkColor: 0x44959,
      angleStep: 4,
      angle: 0,
      thickness: 0.9,
      min: 0.17,
      max: 1,
      rim: 0.9,
      noiseScale: 0.1,
      noiseAmplitude: 0.3,
    };

    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      angleStep: { value: this.params.angleStep },
      scale: { value: this.params.scale },
      angle: { value: this.params.angle },
      thickness: { value: this.params.thickness },
      inkColor: { value: new Color(this.params.inkColor) },
      range: { value: new Vector2(this.params.min, this.params.max) },
      rim: { value: this.params.rim },
      noiseScale: { value: this.params.noiseScale },
      noiseAmplitude: { value: this.params.noiseAmplitude },
    };

    this.onBeforeCompile = (shader, renderer) => {
      for (const uniformName of Object.keys(this.uniforms)) {
        shader.uniforms[uniformName] = this.uniforms[uniformName];
      }

      shader.vertexShader = shader.vertexShader.replace(
        `#include <common>`,
        `#include <common>
        out vec2 vCoords;
        out vec3 vCameraNormal;
        out vec4 vWorldPosition;
        out vec3 vPosition;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        `#include <uv_vertex>`,
        `#include <uv_vertex>
        vCoords = uv;
        vCameraNormal = normalMatrix * normal;
        vWorldPosition = modelViewMatrix * vec4(position, 1.);
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform float scale;
        uniform vec3 inkColor;
        uniform float thickness;
        uniform vec2 range;
        uniform float angleStep;
        uniform float angle;
        uniform float rim;
        uniform float noiseScale;
        uniform float noiseAmplitude;

        in vec3 vPosition;
        in vec2 vCoords;
        in vec4 vWorldPosition;
        in vec3 vCameraNormal;

        #define TAU 6.28318530718
        #define PI 3.141592653589793

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

        float luma(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }
        float luma(vec4 color) {
          return dot(color.rgb, vec3(0.299, 0.587, 0.114));
        }

        float lines( in float l, in vec2 fragCoord, in vec2 resolution, in float thickness, in float e){
          vec2 center = vec2(resolution.x/2., resolution.y/2.);
          vec2 uv = fragCoord.xy * resolution;
        
          float c = (.5 + .5 * sin(uv.x*.5));
          float f = (c+thickness)*l;
          f = smoothstep(.5-e, .5+e, f);
          return f;
        }

        float atan2(in float y, in float x){
            bool s = (abs(x) > abs(y));
            return mix(PI/2.0 - atan(x,y), atan(y,x), s);
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
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float l = luma(gl_FragColor.rgb);
        l = range.x + l * (range.y - range.x);

        vec3 n = normalize(vCameraNormal);
        float a = atan(n.y, n.x);
        a = round(a*angleStep)/angleStep;

        float r = max( 0., abs( dot( normalize( vNormal ), normalize( -vWorldPosition.xyz ) ) ) );
        // float de = length(vec2(dFdx(vWorldPosition.x), dFdy(vWorldPosition.y)));
        float de = .001 * length(vec2(dFdx(gl_FragCoord.x), dFdy(gl_FragCoord.y)));
        float e = .1 * de; 
        vec2 coords = scale*100.*vWorldPosition.xy/(de*500.);

        float border = pow(smoothstep(0.,.25, r), rim);
        l *= border;

        r = smoothstep(.8, .8+e, r);
        a *= 1.-r;

        a += PI / 2.; 
        a += angle;
        
        float s = sin(a);
        float c = cos(a);
        mat2 rot = mat2(c, -s, s, c);
        coords = rot * coords;

        float line = lines(l, coords, vec2(5.), thickness + noiseAmplitude * noise(noiseScale *coords.xy), e);

        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        gl_FragColor.rgb = blendDarken(paper.rgb, inkColor, 1.-line);
        `
      );
    };
  }
}

function generateParams(gui, material) {
  const params = material.params;
  gui.add(params, "roughness", 0, 1).onChange((v) => (material.roughness = v));
  gui.add(params, "metalness", 0, 1).onChange((v) => (material.metalness = v));
  gui
    .addColor(params, "inkColor")
    .onChange((v) => material.uniforms.inkColor.value.set(v));
  gui
    .add(params, "angleStep", 1, 10, 0.11)
    .onChange((v) => (material.uniforms.angleStep.value = v));
  gui
    .add(params, "scale", 0.1, 3, 0.001)
    .onChange((v) => (material.uniforms.scale.value = v));
  gui
    .add(params, "angle", 0, 2 * Math.PI, 0.001)
    .onChange((v) => (material.uniforms.angle.value = v));
  gui
    .add(params, "thickness", 0, 1, 0.001)
    .onChange((v) => (material.uniforms.thickness.value = v));
  gui
    .add(params, "min", 0, 1, 0.001)
    .onChange((v) => (material.uniforms.range.value.x = v));
  gui
    .add(params, "max", 0, 1, 0.001)
    .onChange((v) => (material.uniforms.range.value.y = v));
  gui
    .add(params, "rim", 0, 10, 0.001)
    .onChange((v) => (material.uniforms.rim.value = v));
  gui
    .add(params, "noiseScale", 0, 1, 0.001)
    .onChange((v) => (material.uniforms.noiseScale.value = v));
  gui
    .add(params, "noiseAmplitude", 0, 1, 0.001)
    .onChange((v) => (material.uniforms.noiseAmplitude.value = v));
}

export { LineMaterial, generateParams };
