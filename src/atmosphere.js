/* Atmospheric effects library for Mira — particle systems, light shafts,
 * fog volumes, weather, and small environment helpers. Procedural and
 * lightweight: most effects use Points/Sprites with single small textures
 * or CanvasTextures so a scene gains real "ambient feel" with one call.
 *
 * Exposes window.PhobiaAtmosphere. Each builder returns the spawned object
 * (a THREE.Points / THREE.Mesh / THREE.Group) so the calling scene can
 * add it where it wants and call .userData.update(dt, t) per frame.
 */
(function () {
  "use strict";

  // ---- Tiny utilities ----
  function rand(a, b) { return a + Math.random() * (b - a); }

  // Round soft particle texture, generated once and reused.
  let _dotTex = null;
  function makeDotTexture() {
    if (_dotTex) return _dotTex;
    const SIZE = 64;
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const ctx = c.getContext("2d");
    const grd = ctx.createRadialGradient(SIZE/2, SIZE/2, 0, SIZE/2, SIZE/2, SIZE/2);
    grd.addColorStop(0,    "rgba(255,255,255,1)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.55)");
    grd.addColorStop(1,    "rgba(255,255,255,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, SIZE, SIZE);
    _dotTex = new window.THREE.CanvasTexture(c);
    _dotTex.colorSpace = window.THREE.SRGBColorSpace;
    return _dotTex;
  }

  // Streak (rain) texture
  let _streakTex = null;
  function makeStreakTexture() {
    if (_streakTex) return _streakTex;
    const W = 8, H = 64;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.4, "rgba(220,235,255,0.6)");
    grd.addColorStop(1, "rgba(220,235,255,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    _streakTex = new window.THREE.CanvasTexture(c);
    _streakTex.colorSpace = window.THREE.SRGBColorSpace;
    return _streakTex;
  }

  // ---- Dust motes ----
  // Floating dust particles drifting in a volume. Best in scenes with a
  // strong directional light — they catch the light and read as "real air".
  function createDustMotes(opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const o = Object.assign({
      count: 220,
      bounds: { x: 8, y: 4, z: 8 },     // box dimensions
      origin: [0, 1, 0],
      color: 0xfff5dd,
      size: 0.06,
      drift: 0.10,                       // m/s vertical drift speed
      opacity: 0.55,
    }, opts);

    const positions = new Float32Array(o.count * 3);
    const speeds    = new Float32Array(o.count);
    for (let i = 0; i < o.count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * o.bounds.x;
      positions[i * 3 + 1] = (Math.random() - 0.5) * o.bounds.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * o.bounds.z;
      speeds[i] = rand(0.5, 1.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: o.color,
      size: o.size,
      map: makeDotTexture(),
      transparent: true,
      opacity: o.opacity,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.position.set(o.origin[0], o.origin[1], o.origin[2]);
    points.userData.update = function (dt, t) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < o.count; i++) {
        const idx = i * 3;
        arr[idx + 1] += o.drift * dt * speeds[i];
        // Wobble in x/z so motes don't move in a column
        arr[idx + 0] += Math.sin(t * 0.5 + i) * 0.0015;
        arr[idx + 2] += Math.cos(t * 0.4 + i * 1.3) * 0.0015;
        // Wrap around the volume
        if (arr[idx + 1] > o.bounds.y / 2) arr[idx + 1] = -o.bounds.y / 2;
      }
      geo.attributes.position.needsUpdate = true;
    };
    return points;
  }

  // ---- Rain ----
  // Streaks of falling rain. Great for storms scene and any outdoor "wet"
  // mood. Particle vertical wrap means rain never runs out.
  function createRain(opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const o = Object.assign({
      count: 600,
      bounds: { x: 30, y: 14, z: 30 },
      origin: [0, 6, 0],
      speed: 14,
      sway: 1.2,
    }, opts);

    const positions = new Float32Array(o.count * 3);
    for (let i = 0; i < o.count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * o.bounds.x;
      positions[i * 3 + 1] = Math.random() * o.bounds.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * o.bounds.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xc9d6e8,
      size: 0.45,
      map: makeStreakTexture(),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.position.set(o.origin[0], o.origin[1], o.origin[2]);
    points.userData.update = function (dt) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < o.count; i++) {
        const idx = i * 3;
        arr[idx + 1] -= o.speed * dt;
        arr[idx + 0] += o.sway * dt;
        if (arr[idx + 1] < -2) {
          arr[idx + 1] = o.bounds.y;
          arr[idx + 0] = (Math.random() - 0.5) * o.bounds.x;
          arr[idx + 2] = (Math.random() - 0.5) * o.bounds.z;
        }
      }
      geo.attributes.position.needsUpdate = true;
    };
    return points;
  }

  // ---- Fog volume ----
  // A semi-transparent slab of additive fog that drifts with the camera.
  // Looks great when the scene has a strong directional light cutting
  // through it. Lighter than a full volumetric pass.
  function createFogPlane(opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const o = Object.assign({
      width: 12, height: 4, color: 0xb0c4dc, opacity: 0.18,
      origin: [0, 1.5, -3],
    }, opts);
    const planes = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(o.width, o.height),
        new THREE.MeshBasicMaterial({
          color: o.color,
          transparent: true,
          opacity: o.opacity * (0.7 + i * 0.15),
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        })
      );
      plane.position.set(o.origin[0], o.origin[1], o.origin[2] - i * 1.2);
      plane.rotation.y = (Math.random() - 0.5) * 0.2;
      planes.add(plane);
    }
    let phase = 0;
    planes.userData.update = function (dt) {
      phase += dt;
      planes.children.forEach((p, i) => {
        p.position.x += Math.sin(phase * 0.4 + i) * 0.001;
      });
    };
    return planes;
  }

  // ---- Light shaft (god ray) ----
  // A volumetric-feeling cone of light from a position toward a direction,
  // implemented as a softly textured cone with additive blending. Great
  // for windows in dim rooms or sun through trees.
  function createLightShaft(opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const o = Object.assign({
      length: 10, radius: 1.2, color: 0xfff0c8, opacity: 0.18,
      origin: [0, 4, 0],
      direction: [0, -1, 0],          // pointing down by default
    }, opts);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(o.radius, o.length, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: o.color, transparent: true, opacity: o.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    cone.position.set(o.origin[0], o.origin[1], o.origin[2]);
    // Aim the cone — Three.js cones point along +y, rotate so they point
    // along o.direction. We move the cone so its tip is at origin.
    cone.translateY(-o.length / 2);
    const dir = new THREE.Vector3(o.direction[0], o.direction[1], o.direction[2]).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, dir).normalize();
    const angle = Math.acos(up.dot(dir));
    if (axis.lengthSq() > 0.001) {
      cone.parent && cone.parent.updateMatrixWorld();
      // The lookAt on a Group containing the cone is the simplest path:
      const wrapper = new THREE.Group();
      wrapper.position.set(o.origin[0], o.origin[1], o.origin[2]);
      cone.position.set(0, -o.length / 2, 0);
      wrapper.add(cone);
      wrapper.lookAt(
        o.origin[0] + dir.x * 10,
        o.origin[1] + dir.y * 10,
        o.origin[2] + dir.z * 10
      );
      // Cone's local +y points along the wrapper's local +z, so rotate -90° x.
      wrapper.rotation.x += Math.PI / 2;
      wrapper.userData.update = function (dt, t) {
        cone.material.opacity = o.opacity * (0.85 + Math.sin(t * 0.8) * 0.10);
      };
      return wrapper;
    }
    cone.userData.update = function (dt, t) {
      cone.material.opacity = o.opacity * (0.85 + Math.sin(t * 0.8) * 0.10);
    };
    return cone;
  }

  // ---- Fireflies / floating sparks ----
  function createFireflies(opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const o = Object.assign({
      count: 40, bounds: { x: 12, y: 3, z: 12 },
      color: 0xc0ff90, size: 0.10,
      origin: [0, 1, 0],
    }, opts);
    const positions = new Float32Array(o.count * 3);
    const phases = new Float32Array(o.count);
    for (let i = 0; i < o.count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * o.bounds.x;
      positions[i * 3 + 1] = Math.random() * o.bounds.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * o.bounds.z;
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: o.color, size: o.size,
      map: makeDotTexture(),
      transparent: true, opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.position.set(o.origin[0], o.origin[1], o.origin[2]);
    points.userData.update = function (dt, t) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < o.count; i++) {
        const idx = i * 3;
        const ph = phases[i];
        arr[idx + 0] += Math.sin(t * 0.5 + ph) * 0.004;
        arr[idx + 1] += Math.cos(t * 0.4 + ph * 1.3) * 0.003;
        arr[idx + 2] += Math.sin(t * 0.3 + ph * 0.7) * 0.004;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.4 + Math.sin(t * 1.2) * 0.30;
    };
    return points;
  }

  // ---- Ambient pollen / leaves ----
  function createPollen(opts = {}) {
    return createDustMotes(Object.assign({
      color: 0xddffaa,
      count: 80,
      size: 0.05,
      drift: -0.04,
      opacity: 0.5,
    }, opts));
  }

  // ---- Simple Lightning helper ----
  // A function that returns a fn (scene, light, t) → call to spawn a flash.
  function createLightningController(opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const o = Object.assign({
      minDelay: 4, maxDelay: 12, color: 0xfff8ff, peak: 4.0,
    }, opts);

    let nextStrike = rand(o.minDelay, o.maxDelay);
    let elapsed = 0;
    let flashIntensity = 0;
    let strikeStart = -1;
    return {
      update(dt) {
        elapsed += dt;
        // Trigger
        if (elapsed >= nextStrike && strikeStart < 0) {
          strikeStart = elapsed;
          flashIntensity = o.peak * (0.6 + Math.random() * 0.6);
          // Two-flash strikes (90% of the time)
          if (Math.random() < 0.9) {
            setTimeout(() => { strikeStart = elapsed; flashIntensity = o.peak * 0.4; }, 110);
          }
        }
        // Decay
        if (strikeStart >= 0) {
          const since = elapsed - strikeStart;
          if (since > 0.18) {
            flashIntensity = 0;
            strikeStart = -1;
            elapsed = 0;
            nextStrike = rand(o.minDelay, o.maxDelay);
          }
        }
        return flashIntensity;
      },
      isStriking() { return flashIntensity > 0.01; },
    };
  }

  // ---- Cinematic camera shake driver ----
  function createCameraShake() {
    let mag = 0;
    let decay = 4;
    const offset = { x: 0, y: 0 };
    return {
      poke(magnitude = 0.1, dec = 4) {
        mag = Math.max(mag, magnitude);
        decay = dec;
      },
      update(dt) {
        if (mag > 0.001) {
          offset.x = (Math.random() - 0.5) * mag;
          offset.y = (Math.random() - 0.5) * mag;
          mag -= mag * Math.min(1, dt * decay);
        } else {
          offset.x = 0; offset.y = 0;
        }
        return offset;
      },
    };
  }

  function publish() {
    window.PhobiaAtmosphere = {
      createDustMotes,
      createRain,
      createFogPlane,
      createLightShaft,
      createFireflies,
      createPollen,
      createLightningController,
      createCameraShake,
      makeDotTexture,
      makeStreakTexture,
    };
  }
  publish();
})();
