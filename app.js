/* StepOne-Bench site: 3D road network hero, twin toggle, hint ladder, shuttle animation. */
(function () {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = { lure: 0xeb6834, patient: 0x2a78d6, closed: 0xd23c3c, road: 0x5b7099, node: 0xc9d6ea };

  /* ---------- hero: a road network where the car shuttles at the closed road ---------- */
  function initHero() {
    const canvas = document.getElementById("network");
    if (!canvas || typeof THREE === "undefined") return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (error) {
      canvas.remove();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1b2a49, 30, 70);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    // A jittered grid of places; neighbours joined by roads.
    const cols = 11, rows = 7, gap = 1.75;
    const rand = mulberry32(7);
    const place = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        place.push(new THREE.Vector3((c - (cols - 1) / 2) * gap + (rand() - 0.5) * 0.65, 0,
                                     (r - (rows - 1) / 2) * gap + (rand() - 0.5) * 0.65));
      }
    }
    const at = (r, c) => place[r * cols + c];
    const roadPoints = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c + 1 < cols && rand() > 0.18) roadPoints.push(at(r, c), at(r, c + 1));
        if (r + 1 < rows && rand() > 0.35) roadPoints.push(at(r, c), at(r + 1, c));
      }
    }
    const roads = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(roadPoints),
                                         new THREE.LineBasicMaterial({ color: COLORS.road, transparent: true, opacity: 0.55 }));
    scene.add(roads);
    const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(place),
                                  new THREE.PointsMaterial({ color: COLORS.node, size: 0.16, transparent: true, opacity: 0.8 }));
    scene.add(dots);

    // Two routes from the start (left) to the goal (right).
    const lureRoute = [at(3, 1), at(2, 2), at(2, 3), at(2, 4), at(2, 5), at(2, 6), at(2, 7), at(3, 8), at(3, 9)];
    const patientRoute = [at(3, 1), at(4, 2), at(5, 3), at(5, 4), at(5, 5), at(5, 6), at(5, 7), at(4, 8), at(3, 9)];
    const closedIndex = 4; // the road from lureRoute[4] to lureRoute[5] is closed
    const tube = (points, color, radius) => new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => p.clone().setY(0.02)), false, "centripetal"), 160, radius, 8, false),
      new THREE.MeshBasicMaterial({ color }));
    scene.add(tube(lureRoute.slice(0, closedIndex + 1), COLORS.lure, 0.07));
    scene.add(tube(lureRoute.slice(closedIndex + 1), COLORS.lure, 0.07));
    scene.add(tube(patientRoute, COLORS.patient, 0.07));
    const closed = tube([lureRoute[closedIndex], lureRoute[closedIndex + 1]], COLORS.closed, 0.1);
    scene.add(closed);

    const marker = (p, color, size) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 16), new THREE.MeshBasicMaterial({ color }));
      m.position.copy(p).setY(0.05);
      scene.add(m);
      return m;
    };
    marker(lureRoute[0], 0xffffff, 0.22);
    marker(lureRoute[lureRoute.length - 1], 0xffffff, 0.22);

    // The car and its glow.
    const car = marker(lureRoute[0], 0xffd2bd, 0.16);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: COLORS.lure, transparent: true,
                                                             blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.6, 1.6, 1);
    scene.add(glow);

    // Path: drive the lure route up to the closed road, then shuttle between two places.
    const drive = lureRoute.slice(0, closedIndex + 1);
    const shuttle = [lureRoute[closedIndex], lureRoute[closedIndex - 1]];
    const legs = [];
    for (let i = 0; i + 1 < drive.length; i++) legs.push([drive[i], drive[i + 1]]);
    for (let k = 0; k < 6; k++) legs.push(k % 2 === 0 ? [shuttle[0], shuttle[1]] : [shuttle[1], shuttle[0]]);
    const legTime = 0.9;

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();

    let pointerX = 0, pointerY = 0;
    window.addEventListener("pointermove", e => {
      pointerX = e.clientX / window.innerWidth - 0.5;
      pointerY = e.clientY / window.innerHeight - 0.5;
    });

    let visible = true, start = performance.now();
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(canvas);

    function frame(now) {
      const t = Math.max(0, (now - start) / 1000);  // frame timestamps can precede the start time
      const angle = reduceMotion ? 0.35 : 0.35 + Math.sin(t * 0.08) * 0.25 + pointerX * 0.25;
      camera.position.set(Math.sin(angle) * 21 - 5, 14 + pointerY * 2, Math.cos(angle) * 21);
      camera.lookAt(-7.2, 0, 1.2);  // network sits to the right of the headline

      const total = legs.length * legTime + 1.2;
      const local = reduceMotion ? legTime * (closedIndex + 1.5) : t % total;
      const index = Math.min(Math.floor(local / legTime), legs.length - 1);
      const [a, b] = legs[index];
      const f = Math.min((local - index * legTime) / legTime, 1);
      const eased = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      car.position.lerpVectors(a, b, eased).setY(0.2);
      glow.position.copy(car.position);
      closed.material.color.setHex(Math.sin(t * 4) > 0 || reduceMotion ? COLORS.closed : 0x8e2424);

      renderer.render(scene, camera);
      if (!reduceMotion) requestAnimationFrame(loop);
    }
    function loop(now) {
      if (visible) frame(now);
      else requestAnimationFrame(loop);
    }
    window.addEventListener("load", resize);
    frame(performance.now());  // draw at once; later frames follow from the loop
  }

  function glowTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- twin toggle ---------- */
  const TWINS = {
    trap: { what: "One road two segments down the tempting route is closed.",
            best: "<strong>Best first move:</strong> the patient road (28 min against 36, since the tempting route must turn back).",
            label: "closed", open: false, decoy: false },
    open: { what: "The same road is open and takes 1 minute. Nothing else changes.",
            best: "<strong>Best first move:</strong> the tempting road (19 min against 28).",
            label: "1 min", open: true, decoy: false },
    decoy: { what: "As in the trap twin, plus a dead-end road nobody uses is also closed.",
             best: "<strong>Best first move:</strong> the patient road, as in the trap twin. A decoy edit must change nothing.",
             label: "closed", open: false, decoy: true }
  };
  function initTwins() {
    const buttons = document.querySelectorAll(".tab");
    const decisive = document.getElementById("decisive");
    const label = document.getElementById("decisive-label");
    const spur = document.getElementById("deadend");
    const what = document.getElementById("twin-what");
    const best = document.getElementById("twin-best");
    if (!decisive) return;
    buttons.forEach(button => button.addEventListener("click", () => {
      const twin = TWINS[button.dataset.twin];
      buttons.forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      decisive.classList.toggle("is-open", twin.open);
      spur.classList.toggle("is-closed", twin.decoy);
      label.textContent = twin.label;
      label.style.fill = twin.open ? "var(--lure)" : "var(--closed)";
      what.textContent = twin.what;
      best.innerHTML = twin.best;
    }));
  }

  /* ---------- hint ladder ---------- */
  const RUNGS = {
    plain: { code: "road_a: drive to the east yard (4 minutes)\nroad_b: drive to the mill dock (7 minutes)",
             note: "The closure sits only in the road list. Every model is at the floor." },
    route: { code: "road_a: drive to the east yard (4 minutes; this route to the hill field uses the roads:\n  the east yard to the mill cross, the east yard to the upper row,\n  the east cross to the upper row, the east cross to the upper cross, ...)\nroad_b: drive to the mill dock (7 minutes; this route uses the roads: ...)",
             note: "Roads listed, status not given. Intern 4B looks them up (0.30–0.60); Minitaur can't." },
    near: { code: "road_a: drive to the east yard (4 minutes; closed roads further along this route:\n  the east cross to the upper row)\nroad_b: drive to the mill dock (7 minutes; closed roads further along this route: none)",
            note: "The closure is linked for the model. Minitaur gets about 0.77 at every depth." },
    total: { code: "road_a: drive to the east yard (4 minutes; best total time this way: 36 minutes)\nroad_b: drive to the mill dock (7 minutes; best total time this way: 28 minutes)",
             note: "Only two numbers to compare. The large models are near 1." }
  };
  function initLadder() {
    const buttons = document.querySelectorAll(".rung");
    const code = document.getElementById("rung-code");
    const note = document.getElementById("rung-note");
    buttons.forEach(button => button.addEventListener("click", () => {
      const rung = RUNGS[button.dataset.rung];
      buttons.forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      code.textContent = rung.code;
      note.textContent = rung.note;
    }));
  }

  /* ---------- live play: the car shuttles between two places ---------- */
  function initShuttle() {
    const car = document.getElementById("car");
    if (!car || reduceMotion) return;
    let visible = false;
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(car.ownerSVGElement);
    function step(now) {
      if (visible) {
        const phase = (Math.sin(now / 520) + 1) / 2;
        car.setAttribute("cx", String(200 + phase * 140));
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  initHero();
  initTwins();
  initLadder();
  initShuttle();
})();
