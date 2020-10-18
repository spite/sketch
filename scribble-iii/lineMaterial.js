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
      scale: 1.4,
      inkColor: 0x3f342c,
      thickness: .41,
      rim: .18
    };

    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      scale: { value: this.params.scale },
      inkColor: { value: new Color(this.params.inkColor) },
      thickness: { value: this.params.thickness},
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
        uniform float scale;
        uniform float thickness;
        uniform float rim;
        in vec2 vCoords;
        in vec3 vPosition;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718

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

        // from https://www.shadertoy.com/view/WdfXWl
  
        float hash(vec2 p)  // replace this by something better
        {
            p  = 50.0*fract( p*0.3183099 + vec2(0.71,0.113));
            return -1.0+2.0*fract( p.x*p.y*(p.x+p.y) );
        }

        float noise( in vec2 p )
        {
            vec2 i = floor( p );
            vec2 f = fract( p );
          
          vec2 u = f*f*(3.0-2.0*f);

            return mix( mix( hash( i + vec2(0.0,0.0) ), 
                            hash( i + vec2(1.0,0.0) ), u.x),
                        mix( hash( i + vec2(0.0,1.0) ), 
                            hash( i + vec2(1.0,1.0) ), u.x), u.y);
        }

        vec2 rot (vec2 p ,float a){
            float c = cos(a);
            float s=sin(a);
          return vec2(p.x*c -p.y*s,p.x*s + p.y*c);
        }
        
        float sdCircunf(vec2 p,float r,float t){
        
          return abs(length(p)-r)-t;
        }
        
        vec2 fMod(inout vec2 p, vec2 cellsize){
          vec2 cell =  floor(p/cellsize);
            p = mod(p,cellsize)-cellsize*0.5;
            return cell;
        }
      

        float hash11(float p)
        {
          vec2 p2 = fract(vec2(p * 5.3983, p * 5.4427));
            p2 += dot(p2.yx, p2.xy + vec2(21.5351, 14.3137));
          return fract(p2.x * p2.y * 95.4337);
        }

        float noise(float x)
        {
            float i=floor(x);
            float f=fract(x);
            f=f*f*(3.0-2.0*f);
            float y=3.0*mix(hash11(i), hash11(i+1.), f);
            return y;
        }

        float scribble(vec2 uv,int str,float ink){
    
          float cs;
          float c,ln,m;
          float fc=0.;
          vec2 duv,cell;

          for(int i=1;i<str;i++){
            cs= float(i+1)/(float(str)*2.);
            float h =noise(float(i)*2. );
            duv = uv + rot(uv+ noise(uv*0.1 +ink*0.1),h);
            
            cell = fMod(duv,vec2(cs));
            
            ln = noise(duv *10./cs +cell.x/cs +cell.y);
            c = sdCircunf(duv,mix(cs*0.45,cs*0.49,ln),mix(0.04*cs,0.006*cs,ln)*smoothstep(ink,0.,1.));
            m = 1.- round(smoothstep(c,cs*0.1*ink*ink,-cs*0.01*ink*ink));
              
            fc += m*ink;
          }
          return 1.-fc;
        }

        float texcube(in vec3 p, in vec3 n, in float q, int str) {
          float ink = (1.-q) * thickness;
          vec3 r = vec3(scribble(p.yz,str,ink), scribble(p.xz, str,ink), scribble(p.xy, str, ink));
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
        float curvature = abs((cross(xneg, xpos).y - cross(yneg, ypos).x) * 100.0 / depth);

        l -= curvature * rim;
        l = clamp(l, 0., 1.);

        vec3 coords = scale * vWorldPosition.xyz / vWorldPosition.w;
        float max = 10.;
        int str = int(clamp(max - l * max, 0., max));
        float r = texcube(coords, vNormal, l, str);
        
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
  gui.add(params, "thickness", .01, 1,.001).onChange((v) => (material.uniforms.thickness.value = v));
  gui.add(params, "rim", 0, 1,.001).onChange((v) => (material.uniforms.rim.value = v));
}

export { LineMaterial, generateParams };
