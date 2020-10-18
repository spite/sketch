import {
  MeshStandardMaterial,
  RepeatWrapping,
  TextureLoader,
  Vector2,
  Color,
} from "../third_party/three.module.js";

class LineMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);

    const loader = new TextureLoader();
    const texture = loader.load("../assets/Craft_Rough.jpg");
    const noiseTexture = loader.load("../assets/noise2.png");
    noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;

    this.params = {
      roughness: 0.4,
      metalness: 0.1,
      scale: 200,
      inkColor: 0xD94A4A,
      e: .4
    };
    
    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: texture },
      noiseTexture: { value: noiseTexture },
      inkColor: { value: new Color(this.params.inkColor)},
      scale: { value: this.params.scale },
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
        uniform float e;
        in vec2 vCoords;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718
        
        // adapted from https://www.shadertoy.com/view/4ssyz4

        float aastep(float threshold, float value) {
          #ifdef GL_OES_standard_derivatives
            float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
            return smoothstep(threshold-afwidth, threshold+afwidth, value);
          #else
            return step(threshold, value);
          #endif  
        }
        
        vec4 getRand(vec2 pos)
        {
          ivec2 size = textureSize(noiseTexture, 0);
            return texture(noiseTexture,pos/vec2(float(size.x), float(size.y)));
        }

        float quantize(float v, int num)
        {
            return floor(v*float(num)+.5)/float(num);
        }


        float htPattern(vec2 pos, float v)
        {
          int lnum = 10;//100 - int(round(v * 5.)/5.)*10;
            float p;
            float b0= v;
            float bq=quantize(b0,lnum);
            float b=bq*float(lnum);
            float db=b0*float(lnum)-b;
            float d=1.;
            d*=1.*(1.-(b+.3*float(lnum))/1.3/float(lnum));
            float ang=-(float(lnum-1)-b-.5+.0)/float(lnum)/**3.121*/*PI;
            vec2 dir = vec2(cos(ang),sin(ang));
            vec2 dir2 = vec2(cos(ang*3.),sin(ang*3.));
            float l=length(pos+getRand(pos).xy*0.-resolution.xy*.5-dir2*resolution.y*.4)*d;
            p = 1.-1.7*exp(-cos(l)*cos(l)*1./d/d);
            return p;
        }

        float texcube(in vec3 p, in vec3 n, in float l) {
          vec3 v = vec3(htPattern(p.yz,l),htPattern(p.zx,l), htPattern(p.xy,l));
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
        float l = 1.2 * luma(gl_FragColor.rgb);
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        vec3 coords = scale * vWorldPosition.xyz/ vWorldPosition.w;
        float line = texcube(coords, vNormal, l);
        float r = aastep(-.25+1.-l, line);
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
  gui.add(params, "scale", 50, 400, .1).onChange((v) => (material.uniforms.scale.value = v));
}

export { LineMaterial, generateParams };

