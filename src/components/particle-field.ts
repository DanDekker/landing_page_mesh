import { FieldRenderer } from '../graphics/renderer.ts';
import { COUNT, DEFAULT_SETTINGS, IDLE_POINTER, writeShape, normalizeSettings, type FieldSettings, type Pointer } from '../shared/field.ts';

export class ParticleField extends HTMLElement {
  private renderer?: FieldRenderer;
  private canvas?: HTMLCanvasElement;
  private worker?: Worker;
  private socket?: WebSocket;
  private privateActive = false;
  private resizeObserver?: ResizeObserver;
  private lifetime?: AbortController;
  private settings = { ...DEFAULT_SETTINGS };
  private target = new Float32Array(COUNT * 3);
  private displayed = new Float32Array(COUNT * 3);
  private targetTime = 0;
  private displayedTime = 0;
  private raf = 0;
  private previous = 0;
  private dirtyUntil = 0;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private pointer: Pointer = { ...IDLE_POINTER };

  connectedCallback() {
    this.lifetime = new AbortController();
    const { signal } = this.lifetime;
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{display:block;overflow:hidden;touch-action:none}canvas{display:block;width:100%;height:100%;outline:0}</style><canvas aria-hidden="true"></canvas>';
    this.canvas = root.querySelector('canvas')!;
    writeShape(this.target, this.settings.form); this.displayed.set(this.target);
    try { this.renderer = new FieldRenderer(this.canvas); }
    catch (error) { this.failure(error); return; }
    this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); cancelAnimationFrame(this.raf); this.raf = 0; }, { signal });
    this.canvas.addEventListener('webglcontextrestored', () => {
      try { this.renderer?.dispose(); this.renderer = new FieldRenderer(this.canvas!); this.resize(); this.renderer.palette(this.settings.palette); this.requestFrame(); }
      catch (error) { this.failure(error); }
    }, { signal });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this);
    this.addEventListener('pointermove', event => {
      if (!this.renderer) return;
      this.pointer = { ...this.renderer.pointer(event.clientX, event.clientY), down: event.buttons === 1 };
      this.send({ type: 'pointer', pointer: this.pointer });
    }, { signal });
    this.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !this.renderer) return;
      this.setPointerCapture(event.pointerId);
      this.pointer = { ...this.renderer.pointer(event.clientX, event.clientY), down: true };
      this.send({ type: 'pointer', pointer: this.pointer });
      this.send({ type: 'pulse', x: this.pointer.x, y: this.pointer.y, z: this.pointer.z });
    }, { signal });
    const release = (event: PointerEvent) => {
      this.pointer = { ...this.pointer, down: false, active: event.pointerType === 'mouse' && event.type !== 'pointercancel' };
      this.send({ type: 'pointer', pointer: this.pointer });
      if (this.hasPointerCapture(event.pointerId)) this.releasePointerCapture(event.pointerId);
    };
    this.addEventListener('pointerup', release, { signal }); this.addEventListener('pointercancel', release, { signal });
    this.addEventListener('lostpointercapture', () => { this.pointer.down = false; this.send({ type: 'pointer', pointer: this.pointer }); }, { signal });
    this.addEventListener('pointerleave', () => { if (!this.pointer.down) { this.pointer.active = false; this.send({ type: 'pointer', pointer: this.pointer }); } }, { signal });
    document.addEventListener('visibilitychange', () => {
      this.send({ type: 'visibility', visible: !document.hidden });
      if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; }
      else { this.previous = 0; this.requestFrame(); }
    }, { signal });
    this.startWorker(); this.connectPrivate(signal); this.resize();
  }

  disconnectedCallback() {
    this.lifetime?.abort(); this.resizeObserver?.disconnect(); this.worker?.terminate(); this.socket?.close();
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    cancelAnimationFrame(this.raf); this.raf = 0; this.renderer?.dispose();
  }

  configure(input: Partial<FieldSettings>) {
    this.settings = normalizeSettings(input, this.settings);
    this.renderer?.palette(this.settings.palette);
    this.send({ type: 'settings', settings: this.settings }); this.requestFrame();
  }

  reset() { this.send({ type: 'reset' }); this.requestFrame(); }

  private failure(error: unknown) {
    console.error('Mesh renderer:', error);
    this.dispatchEvent(new CustomEvent('mesh-error', { detail: 'This view needs WebGL 2. Please enable hardware acceleration.', bubbles: true }));
  }

  private startWorker() {
    if (this.worker || !this.isConnected) return;
    this.worker = new Worker('/worker.js', { type: 'module', name: 'mesh-field' });
    this.worker.addEventListener('message', ({ data }) => {
      if (this.privateActive || data.type !== 'frame') return;
      if (data.positions instanceof Float32Array && data.positions.length === COUNT * 3) this.frame(data.positions, data.time);
    });
    this.worker.addEventListener('error', error => this.failure(error));
    this.worker.postMessage({ type: 'settings', settings: this.settings });
    this.worker.postMessage({ type: 'visibility', visible: !document.hidden });
  }

  private async connectPrivate(signal: AbortSignal) {
    try {
      const response = await fetch('/api/field', { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) });
      if (!response.ok || !(await response.json()).private || signal.aborted) return;
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/field`);
      socket.binaryType = 'arraybuffer'; this.socket = socket;
      this.connectionTimer = setTimeout(() => { if (!this.privateActive) socket.close(); }, 4000);
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'settings', settings: this.settings }));
        socket.send(JSON.stringify({ type: 'visibility', visible: !document.hidden }));
      });
      socket.addEventListener('message', ({ data }) => {
        if (!(data instanceof ArrayBuffer) || data.byteLength !== (COUNT * 3 + 2) * 4) return;
        const frame = new Float32Array(data);
        if (frame[1] !== COUNT || !Number.isFinite(frame[0])) return;
        if (!this.privateActive) {
          this.privateActive = true; this.worker?.terminate(); this.worker = undefined;
          if (this.connectionTimer) clearTimeout(this.connectionTimer);
        }
        this.frame(frame.subarray(2), frame[0]!);
      });
      socket.addEventListener('close', () => { this.privateActive = false; this.socket = undefined; this.startWorker(); });
      socket.addEventListener('error', () => socket.close());
    } catch { /* The standalone renderer is already running. */ }
  }

  private send(message: Record<string, unknown>) {
    if (this.privateActive && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    else this.worker?.postMessage(message);
  }

  private frame(positions: Float32Array, time: number) {
    this.target = positions; this.targetTime = time; this.requestFrame();
  }

  private resize() { if (this.renderer) { this.renderer.resize(this.clientWidth, this.clientHeight); this.requestFrame(); } }

  private requestFrame() {
    this.dirtyUntil = performance.now() + 1000;
    if (!this.raf && !document.hidden) this.raf = requestAnimationFrame(time => this.render(time));
  }

  private render(now: number) {
    this.raf = 0;
    if (!this.renderer || document.hidden) return;
    const delta = this.previous ? Math.min(.05, (now - this.previous) / 1000) : 1 / 60;
    this.previous = now;
    const blend = 1 - Math.exp(-delta * 22);
    for (let i = 0; i < this.displayed.length; i++) this.displayed[i] += (this.target[i]! - this.displayed[i]!) * blend;
    this.displayedTime += (this.targetTime - this.displayedTime) * blend;
    this.renderer.render(this.displayed, this.displayedTime, delta);
    if (!this.settings.paused || now < this.dirtyUntil) this.raf = requestAnimationFrame(time => this.render(time));
  }
}
