/* ============================================================================
   Dice3D — solid rounded 3D dice rendered with three.js (vendored).
   Replaces the old CSS-cube dice: correct shape and perspective from every
   angle, plus a physical tumble animation (toss, spin, damped bounces, settle).
   Falls back to a simple 2D canvas drawing when WebGL is unavailable.
   ============================================================================ */
(function () {
  'use strict';

  const UP = new THREE.Vector3(0, 1, 0);

  // Face definitions: value -> { normal, u, v } where u/v are the pip plane axes.
  const FACES = {
    1: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    6: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    2: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    5: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    3: { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    4: { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }
  };

  const PIPS = {
    1: [[0, 0]],
    2: [[-0.44, 0.44], [0.44, -0.44]],
    3: [[-0.44, 0.44], [0, 0], [0.44, -0.44]],
    4: [[-0.44, -0.44], [-0.44, 0.44], [0.44, -0.44], [0.44, 0.44]],
    5: [[-0.44, -0.44], [-0.44, 0.44], [0, 0], [0.44, -0.44], [0.44, 0.44]],
    6: [[-0.44, -0.44], [-0.44, 0], [-0.44, 0.44], [0.44, -0.44], [0.44, 0], [0.44, 0.44]]
  };

  const DIE_SIZE = 2;          // world units
  const DIE_RADIUS = 0.42;     // corner roundness
  const REST_Y = DIE_SIZE / 2; // center height when at rest
  const SPOT_X = [-1.62, 1.62];

  const clamp01 = t => Math.max(0, Math.min(1, t));
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
  const smooth = t => t * t * (3 - 2 * t);

  function makeShadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  const Dice3D = {
    ok: false,
    canvas: null,
    dice: [null, null],
    values: [1, 1],
    _raf: 0,
    _needsFrame: true,

    /* ------------------------------ setup ------------------------------ */
    init(canvas) {
      if (this.canvas === canvas && this.ok) return this.ok;
      this.canvas = canvas;
      if (!canvas) { this.ok = false; return false; }
      if (this._raf) cancelAnimationFrame(this._raf);

      let renderer = null;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      } catch (e) { renderer = null; }
      if (!renderer || !window.THREE.RoundedBoxGeometry) {
        this.ok = false;
        this._draw2D();
        this._startLoop();
        return false;
      }

      this.renderer = renderer;
      renderer.setClearColor(0x000000, 0);
      renderer.outputEncoding = THREE.sRGBEncoding;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 60);
      camera.position.set(0, 7.9, 11.0);
      camera.lookAt(0, 0.4, 0);
      this.scene = scene; this.camera = camera;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x948da8, 1.28));
      const key = new THREE.DirectionalLight(0xffffff, 0.95);
      key.position.set(4, 9, 6);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xdcd6ff, 0.28);
      fill.position.set(-6, 5, -5);
      scene.add(fill);

      const bodyGeo = new THREE.RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 5, DIE_RADIUS);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xfaf8fc, roughness: 0.34, metalness: 0.03 });
      const pipGeo = new THREE.SphereGeometry(0.165, 22, 16);
      const pipMat = new THREE.MeshStandardMaterial({ color: 0x0e0b13, roughness: 0.6, metalness: 0.05 });

      const shadowTex = makeShadowTexture();

      this.dice = [0, 1].map(i => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(mesh);

        // Pips for every face, as children of the mesh so they rotate with it.
        for (let val = 1; val <= 6; val++) {
          const f = FACES[val];
          const n = new THREE.Vector3(...f.n);
          const u = new THREE.Vector3(...f.u);
          const v = new THREE.Vector3(...f.v);
          for (const [pu, pv] of PIPS[val]) {
            const pip = new THREE.Mesh(pipGeo, pipMat);
            pip.scale.set(1, 0.46, 1);
            pip.position.copy(n.clone().multiplyScalar(DIE_SIZE / 2))
              .add(u.clone().multiplyScalar(pu))
              .add(v.clone().multiplyScalar(pv));
            // orient the squash axis along the face normal
            pip.quaternion.setFromUnitVectors(UP, n);
            mesh.add(pip);
          }
        }

        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(3.1, 3.1),
          new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(SPOT_X[i], 0.02, 0);
        scene.add(shadow);

        group.position.set(SPOT_X[i], REST_Y, 0);
        scene.add(group);

        return {
          group, mesh, shadow,
          value: 1,
          yaw: i === 0 ? 0.5 : -0.5,
          roll: null,      // active roll animation state
          bobPhase: i * 1.7
        };
      });

      this.ok = true;
      this.resize();
      this.setFaces(this.values[0], this.values[1]);
      this._startLoop();
      return true;
    },

    resize() {
      if (!this.ok) return;
      const c = this.canvas;
      const w = c.clientWidth || 320;
      const h = c.clientHeight || 160;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this._needsFrame = true;
    },

    /* --------------------------- orientation --------------------------- */
    _restQuaternion(value, yaw) {
      const f = FACES[Math.max(1, Math.min(6, value))];
      const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...f.n), UP);
      const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
      return yawQ.multiply(align);
    },

    setFace(index, value) {
      this.values[index] = value;
      const d = this.dice[index];
      if (!d) return;
      d.value = value;
      if (d.roll) d.roll = null;
      d.mesh.quaternion.copy(this._restQuaternion(value, d.yaw));
      d.group.position.set(SPOT_X[index], REST_Y, 0);
      this._needsFrame = true;
      if (!this.ok) this._draw2D(performance.now());
    },

    setFaces(v1, v2) {
      this.setFace(0, v1);
      this.setFace(1, v2);
    },

    /* ------------------------------- roll ------------------------------ */
    roll(values, opts = {}) {
      const total = Math.max(opts.duration || 1250, 600);
      values.forEach((v, i) => {
        const d = this.dice[i];
        if (!d) return;
        d.value = v;
        this.values[i] = v;
        const axisA = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 0.6 + 0.2, Math.random() * 2 - 1).normalize();
        const axisB = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        const speed = (Math.PI * 2) * (2.6 + Math.random() * 1.6); // rad/s initial
        d.roll = {
          start: performance.now() + (opts.delay || 90) * i,
          T: total,
          axisA, axisB,
          speedA: speed,
          speedB: speed * (0.7 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1),
          target: this._restQuaternion(v, d.yaw + (Math.random() * 0.5 - 0.25)),
          settleFrom: null,
          jumpX: (Math.random() * 0.5 - 0.25),
          phase: Math.random() * Math.PI
        };
      });
      this._needsFrame = true;
      return new Promise(res => setTimeout(res, total + (opts.delay || 90) * values.length + 60));
    },

    /* --------------------------- animation loop ------------------------ */
    _startLoop() {
      const tick = (now) => {
        this._raf = requestAnimationFrame(tick);
        let active = this._needsFrame;
        this._needsFrame = false;

        if (this.ok) {
          this.dice.forEach((d, i) => {
            const y = this._stepDie(d, i, now);
            if (y === true) active = true;
          });
          if (active) this.renderer.render(this.scene, this.camera);
        } else if (this._rolling2D) {
          this._draw2D(now);
          active = true;
        }
      };
      this._raf = requestAnimationFrame(tick);
    },

    /** Advance one die; returns true while animating. */
    _stepDie(d, i, now) {
      const r = d.roll;
      if (!r) {
        // gentle idle bob so the dice feel alive
        const t = now * 0.001;
        const bob = Math.sin(t * 1.4 + d.bobPhase) * 0.045;
        d.group.position.y = REST_Y + bob;
        d.shadow.material.opacity = 0.9 - bob * 2.2;
        return true; // subtle continuous motion
      }

      let t = (now - r.start) / r.T;
      if (t < 0) t = 0;

      if (t >= 1) {
        d.mesh.quaternion.copy(r.target);
        d.group.position.set(SPOT_X[i] + r.jumpX * 0.0, REST_Y, 0);
        d.roll = null;
        return true;
      }

      // --- vertical bounce profile: big hop then two damped bounces ---
      let y = REST_Y;
      if (t < 0.42) {
        const p = t / 0.42; y = REST_Y + 1.65 * 4 * p * (1 - p) * 0.98 + 0.55 * p;
      } else if (t < 0.68) {
        const p = (t - 0.42) / 0.26; y = REST_Y + 0.5 * 4 * p * (1 - p);
      } else if (t < 0.86) {
        const p = (t - 0.68) / 0.18; y = REST_Y + 0.16 * 4 * p * (1 - p);
      }

      // --- spin: damped angular velocity integrated per frame ---
      const dt = Math.min(0.05, (now - (this._lastNow || now)) / 1000);
      this._lastNow = now;
      const damp = Math.pow(1 - clamp01(t), 1.65);
      const dA = r.axisA.clone().multiplyScalar(r.speedA * damp * dt);
      const dB = r.axisB.clone().multiplyScalar(r.speedB * damp * dt);
      const qa = new THREE.Quaternion().setFromAxisAngle(r.axisA, dA.length());
      const qb = new THREE.Quaternion().setFromAxisAngle(r.axisB, dB.length());
      d.mesh.quaternion.premultiply(qa).premultiply(qb);

      // --- settle: blend onto the exact target orientation near the end ---
      if (t > 0.78) {
        if (!r.settleFrom) r.settleFrom = d.mesh.quaternion.clone();
        const k = smooth(clamp01((t - 0.78) / 0.22));
        d.mesh.quaternion.copy(r.settleFrom).slerp(r.target, k);
      }

      // horizontal drift that eases back home
      const drift = Math.sin(t * Math.PI) * r.jumpX;
      d.group.position.set(SPOT_X[i] + drift, y, Math.cos(t * Math.PI * 2) * 0.06 * (1 - t));

      // shadow reacts to height
      const h = Math.max(0, y - REST_Y);
      const sc = 1 + h * 0.22;
      d.shadow.scale.set(sc, sc, 1);
      d.shadow.material.opacity = Math.max(0.25, 0.9 - h * 0.5);

      return true;
    },

    /* ------------------------- 2D fallback ----------------------------- */
    _draw2D(now) {
      const c = this.canvas;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth || 320, h = c.clientHeight || 160;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const shake = this._rolling2D && (now - this._rolling2D.start) < this._rolling2D.T
        ? Math.sin(now / 28) * 4 : 0;
      if (this._rolling2D && (now - this._rolling2D.start) >= this._rolling2D.T) this._rolling2D = null;
      [0, 1].forEach(i => {
        const x = w / 2 + (i === 0 ? -52 : 52) + shake * (i ? 1 : -1);
        const y = h / 2;
        const s = 62;
        g.save();
        g.translate(x, y);
        g.rotate((i ? -1 : 1) * 0.12);
        this._rr(g, -s / 2, -s / 2, s, s, 14);
        const grad = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d8d5e0');
        g.fillStyle = grad; g.fill();
        g.fillStyle = '#17131c';
        const v = this.values[i];
        for (const [pu, pv] of PIPS[v]) {
          g.beginPath();
          g.arc(pu * s * 0.32, pv * s * 0.32, s * 0.085, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      });
    },

    _rr(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
  };

  // 2D-fallback roll entry
  const origRoll = Dice3D.roll.bind(Dice3D);
  Dice3D.roll = function (values, opts) {
    if (!this.ok) {
      values.forEach((v, i) => { this.values[i] = v; });
      this._rolling2D = { start: performance.now(), T: (opts && opts.duration || 1000) };
      return new Promise(res => setTimeout(res, (opts && opts.duration || 1000) + 60));
    }
    return origRoll(values, opts);
  };

  window.Dice3D = Dice3D;
  window.addEventListener('resize', () => Dice3D.resize());
})();
