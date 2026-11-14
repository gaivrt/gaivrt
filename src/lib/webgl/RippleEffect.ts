import * as THREE from 'three';
import vertSrc from '../../shaders/ripple.vert.glsl?raw';
import simFragSrc from '../../shaders/rippleSim.frag.glsl?raw';
import compositeFragSrc from '../../shaders/ripple.frag.glsl?raw';
import { RIPPLE } from '../constants';

export class RippleEffect {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fbos: THREE.WebGLRenderTarget[] = [];
  private currentIdx = 0;
  private simMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private rafId = 0;
  private resScale = 1;
  private width: number;
  private height: number;
  /** Latest pointer position (uv), and the one used by the last rendered frame */
  private mouse = new THREE.Vector2(-1, -1);
  private lastMouse: THREE.Vector2 | null = null;
  private mouseDirty = false;

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
    for (let i = 0; i < 2; i++) {
      this.fbos.push(new THREE.WebGLRenderTarget(fboW, fboH, fboOpts));
    }

    this.simMaterial = new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: simFragSrc,
      uniforms: {
        uCurrent: { value: this.fbos[0].texture },
        uMouse: { value: new THREE.Vector2(-1, -1) },
        uPrevMouse: { value: new THREE.Vector2(-1, -1) },
        uMouseActive: { value: 0.0 },
        uTexelSize: { value: new THREE.Vector2(1 / fboW, 1 / fboH) },
        uAspect: { value: this.width / this.height },
        uRadius: { value: RIPPLE.BRUSH_RADIUS_PX / this.height },
      },
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: compositeFragSrc,
      uniforms: {
        uHeightMap: { value: this.fbos[0].texture },
        uTint: { value: new THREE.Color(1, 1, 1) },
      },
      // The canvas is not premultiplied: write straight colour + alpha. Letting
      // three blend here would darken the colour by its own alpha.
      blending: THREE.NoBlending,
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

    const sim = this.simMaterial.uniforms;
    if (this.mouseDirty) {
      (sim.uPrevMouse.value as THREE.Vector2).copy(this.lastMouse ?? this.mouse);
      (sim.uMouse.value as THREE.Vector2).copy(this.mouse);
      sim.uMouseActive.value = 1.0;
      this.lastMouse = (this.lastMouse ?? new THREE.Vector2()).copy(this.mouse);
      this.mouseDirty = false;
    } else {
      sim.uMouseActive.value = 0.0;
    }

    // Sim pass: read current → write to the other FBO, then swap
    sim.uCurrent.value = this.fbos[this.currentIdx].texture;
    this.quad.material = this.simMaterial;
    this.currentIdx = 1 - this.currentIdx;
    this.renderer.setRenderTarget(this.fbos[this.currentIdx]);
    this.renderer.render(this.scene, this.camera);

    // Composite pass: read ink map → render to screen
    this.compositeMaterial.uniforms.uHeightMap.value = this.fbos[this.currentIdx].texture;
    this.quad.material = this.compositeMaterial;
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  onMouseMove(x: number, y: number) {
    this.mouse.set(x / this.width, 1.0 - y / this.height); // flip Y
    this.mouseDirty = true;
  }

  /** Colour of the trail (any CSS colour string) */
  setTint(color: string) {
    (this.compositeMaterial.uniforms.uTint.value as THREE.Color).set(color);
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.simMaterial.uniforms.uAspect.value = w / h;
    this.simMaterial.uniforms.uRadius.value = RIPPLE.BRUSH_RADIUS_PX / h;
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
