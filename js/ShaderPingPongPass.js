import {
  OrthographicCamera,
  Scene,
  Mesh,
  PlaneBufferGeometry,
} from "../third_party/three.module.js";
import { getFBO } from "../js/FBO.js";

class ShaderPingPongPass {
  constructor(renderer, shader, options = {}) {
    this.renderer = renderer;
    this.shader = shader;
    this.orthoScene = new Scene();
    this.fbo = getFBO(1, 1, options);
    this.fbos = [this.fbo, this.fbo.clone()];
    this.currentFBO = 0;
    this.orthoCamera = new OrthographicCamera(
      1 / -2,
      1 / 2,
      1 / 2,
      1 / -2,
      0.00001,
      1000
    );
    this.orthoQuad = new Mesh(new PlaneBufferGeometry(1, 1), this.shader);
    this.orthoQuad.scale.set(1, 1, 1);
    this.orthoScene.add(this.orthoQuad);
    this.texture = this.fbo.texture;
  }

  render(final) {
    if (!final) {
      this.renderer.setRenderTarget(this.fbos[1 - this.currentFBO]);
    }
    this.renderer.render(this.orthoScene, this.orthoCamera);
    this.renderer.setRenderTarget(null);
    this.currentFBO = 1 - this.currentFBO;
  }

  setSize(width, height) {
    this.orthoQuad.scale.set(width, height, 1);

    this.fbos[0].setSize(width, height);
    this.fbos[1].setSize(width, height);

    this.orthoQuad.scale.set(width, height, 1);

    this.orthoCamera.left = -width / 2;
    this.orthoCamera.right = width / 2;
    this.orthoCamera.top = height / 2;
    this.orthoCamera.bottom = -height / 2;
    this.orthoCamera.updateProjectionMatrix();
  }
}

export { ShaderPingPongPass };
