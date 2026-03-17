import * as THREE from 'three';
import vertSrc from '../../shaders/ripple.vert.glsl?raw';
import simFragSrc from '../../shaders/rippleSim.frag.glsl?raw';
import compositeFragSrc from '../../shaders/ripple.frag.glsl?raw';

export class RippleEffect {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fbos: THREE.WebGLRenderTarget[] = [];
  private currentIdx = 0;
  private previousIdx = 1;
  private outputIdx = 2;
  private simMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private rafId = 0;
  private resScale = 1;
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement) {
    this.width = canvas.clientWidth;
    this.height = canvas.clientHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x000000, 0);

    const fboOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    };
    const fboW = Math.floor(this.width * this.resScale);
    const fboH = Math.floor(this.height * this.resScale);
    for (let i = 0; i < 3; i++) {
      this.fbos.push(new THREE.WebGLRenderTarget(fboW, fboH, fboOpts));
    }

    this.simMaterial = new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: simFragSrc,
      uniforms: {
        uCurrent: { value: this.fbos[0].texture },
        uPrevious: { value: this.fbos[1].texture },
        uMouse: { value: new THREE.Vector2(-1, -1) },
        uMouseActive: { value: 0.0 },
        uTexelSize: { value: new THREE.Vector2(1 / fboW, 1 / fboH) },
      },
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: compositeFragSrc,
      uniforms: {
        uHeightMap: { value: this.fbos[0].texture },
      },
      transparent: true,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geo, this.simMaterial);
    this.scene.add(this.quad);
  }

  start() {
    if (this.rafId) return;
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      this.render();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Returns the current timestamp from rAF for external perf monitoring */
  onFrame?: (time: number) => void;

  private render() {
    const now = performance.now();
    this.onFrame?.(now);

    // Sim pass: read current + previous → write to output (all different FBOs)
    this.simMaterial.uniforms.uCurrent.value = this.fbos[this.currentIdx].texture;
    this.simMaterial.uniforms.uPrevious.value = this.fbos[this.previousIdx].texture;
    this.quad.material = this.simMaterial;
    this.renderer.setRenderTarget(this.fbos[this.outputIdx]);
    this.renderer.render(this.scene, this.camera);

    // Rotate indices: output becomes current, current becomes previous, previous becomes output
    const oldPrevious = this.previousIdx;
    this.previousIdx = this.currentIdx;
    this.currentIdx = this.outputIdx;
    this.outputIdx = oldPrevious;

    // Composite pass: read height map → render to screen
    this.compositeMaterial.uniforms.uHeightMap.value = this.fbos[this.currentIdx].texture;
    this.quad.material = this.compositeMaterial;
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // Reset mouse active after each frame to avoid continuous injection
    this.simMaterial.uniforms.uMouseActive.value = 0.0;
  }

  onMouseMove(x: number, y: number) {
    const u = x / this.width;
    const v = 1.0 - y / this.height; // flip Y
    (this.simMaterial.uniforms.uMouse.value as THREE.Vector2).set(u, v);
    this.simMaterial.uniforms.uMouseActive.value = 1.0;
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.updateFBOSize();
  }

  setResolutionScale(scale: number) {
    this.resScale = scale;
    this.updateFBOSize();
  }

  private updateFBOSize() {
    const w = Math.max(1, Math.floor(this.width * this.resScale));
    const h = Math.max(1, Math.floor(this.height * this.resScale));
    for (const fbo of this.fbos) fbo.setSize(w, h);
    this.simMaterial.uniforms.uTexelSize.value.set(1 / w, 1 / h);
  }

  dispose() {
    this.stop();
    for (const fbo of this.fbos) fbo.dispose();
    this.simMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
  }
}
