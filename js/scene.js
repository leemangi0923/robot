import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { fk, SEED, point } from "./robot.js";
const v = (p) => new THREE.Vector3(...p.map((x) => x / 1000));
export class RobotScene {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#f0f2e9");
    this.scene.fog = new THREE.Fog("#f0f2e9", 2.5, 6);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 15);
    this.camera.up.set(0, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "마우스 드래그로 회전하고 스크롤로 확대하는 M0609 3D 로봇",
    );
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 4;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0.12, 0.23, 0.21);
    this.resetView();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa88d, 2.7));
    let light = new THREE.DirectionalLight(0xfffaf0, 3);
    light.position.set(-0.8, -0.5, 2);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -1.2;
    light.shadow.camera.right = 1.2;
    light.shadow.camera.top = 1.2;
    light.shadow.camera.bottom = -1.2;
    light.shadow.normalBias = 0.001;
    light.shadow.bias = -0.0001;
    this.scene.add(light);
    let fill = new THREE.DirectionalLight(0xd9ebf0, 1.2);
    fill.position.set(1, 1, 1.4);
    this.scene.add(fill);
    this.white = new THREE.MeshStandardMaterial({
      color: 0xe6e9df,
      roughness: 0.34,
      metalness: 0.2,
    });
    this.green = new THREE.MeshStandardMaterial({
      color: 0x3d7b5d,
      roughness: 0.32,
      metalness: 0.3,
    });
    this.dark = new THREE.MeshStandardMaterial({
      color: 0x466052,
      roughness: 0.4,
      metalness: 0.6,
    });
    this.silver = new THREE.MeshStandardMaterial({
      color: 0xc4ccbc,
      roughness: 0.5,
      metalness: 0.45,
    });
    this.robot = new THREE.Group();
    this.scene.add(this.robot);
    this.parts = [];
    this.buildEnvironment();
    this.pathGroup = new THREE.Group();
    this.scene.add(this.pathGroup);
    this.target = new THREE.Group();
    let ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.013, 0.0012, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xd09a58 }),
    );
    this.target.add(ring);
    for (const xy of [
      [-0.022, 0, 0.022, 0],
      [0, -0.022, 0, 0.022],
    ]) {
      let g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xy[0], xy[1], 0),
        new THREE.Vector3(xy[2], xy[3], 0),
      ]);
      this.target.add(
        new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd09a58 })),
      );
    }
    this.target.visible = false;
    this.scene.add(this.target);
    this.tcp = new THREE.Mesh(
      new THREE.SphereGeometry(0.005, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xe2b574 }),
    );
    this.scene.add(this.tcp);
    this.setQ(SEED);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
  mesh(geo, mat, pos, parent = this.scene) {
    let m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  box(w, d, h, x, y, z, mat, parent) {
    return this.mesh(
      new THREE.BoxGeometry(w, d, h),
      mat,
      new THREE.Vector3(x, y, z),
      parent,
    );
  }
  cylinder(radius, length, pos, mat, parent = this.scene) {
    let m = this.mesh(
      new THREE.CylinderGeometry(radius, radius, length, 36),
      mat,
      pos,
      parent,
    );
    m.rotation.x = Math.PI / 2;
    return m;
  }
  label(text, size = 0.035, color = "#658353", background = "transparent") {
    let c = document.createElement("canvas");
    c.width = 256;
    c.height = 100;
    let ctx = c.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 256, 100);
    ctx.fillStyle = color;
    ctx.font = "500 42px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 50);
    let texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    let m = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
      }),
    );
    m.scale.set(size * 2.56, size, 1);
    return m;
  }
  buildEnvironment() {
    const floor = new THREE.MeshStandardMaterial({
      color: 0xe9eee0,
      roughness: 0.9,
    });
    this.box(200, 200, 0.015, 0, 0, -0.302, floor);
    let grid = new THREE.GridHelper(8, 80, 0xc7d3b9, 0xdde4d4);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.292;
    grid.material.transparent = true;
    grid.material.opacity = 0.65;
    this.scene.add(grid);
    // Pedestal ends at z=0: screen placement does not add a kinematic offset.
    this.box(
      0.19,
      0.19,
      0.28,
      0,
      0,
      -0.14,
      new THREE.MeshStandardMaterial({ color: 0xb5c3ab, roughness: 0.65 }),
    );
    this.box(0.24, 0.24, 0.014, 0, 0, -0.007, this.silver);
    this.cylinder(0.084, 0.035, new THREE.Vector3(0, 0, 0.0175), this.dark);
    this.cylinder(0.067, 0.047, new THREE.Vector3(0, 0, 0.055), this.green);
    for (let x of [-1, 1])
      for (let y of [-1, 1])
        this.cylinder(
          0.006,
          0.005,
          new THREE.Vector3(x * 0.089, y * 0.089, 0.003),
          this.dark,
        );
    const table = new THREE.MeshStandardMaterial({
      color: 0xe3d5b6,
      roughness: 0.85,
    });
    this.box(0.47, 0.4, 0.026, 0.31, 0.465, 0.189, table);
    this.box(
      0.44,
      0.37,
      0.012,
      0.31,
      0.465,
      0.17,
      new THREE.MeshStandardMaterial({ color: 0xb4bca2, roughness: 0.8 }),
    );
    for (let x of [0.11, 0.51])
      for (let y of [0.31, 0.62]) {
        this.box(0.025, 0.025, 0.45, x, y, -0.064, this.silver);
        this.box(0.04, 0.04, 0.01, x, y, -0.287, this.dark);
      }
    this.box(
      0.34,
      0.2,
      0.009,
      0.303,
      0.464,
      0.207,
      new THREE.MeshStandardMaterial({ color: 0xccd6b7, roughness: 0.85 }),
    );
    let outline = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(0.34, 0.2, 0.009),
    );
    let line = new THREE.LineSegments(
      outline,
      new THREE.LineBasicMaterial({ color: 0xadb993 }),
    );
    line.position.set(0.303, 0.464, 0.207);
    this.scene.add(line);
    const origin = new THREE.Vector3(-0.09, -0.09, 0.006);
    for (let [dir, color, label] of [
      [new THREE.Vector3(0.13, 0, 0), 0xc78973, "X"],
      [new THREE.Vector3(0, 0.13, 0), 0x8aab72, "Y"],
      [new THREE.Vector3(0, 0, 0.13), 0x7e9eae, "Z"],
    ]) {
      this.scene.add(
        new THREE.ArrowHelper(
          dir.clone().normalize(),
          origin,
          dir.length(),
          color,
          0.014,
          0.007,
        ),
      );
      let t = this.label(label, 0.019, "#8b9d7a");
      t.position.copy(
        origin
          .clone()
          .add(dir)
          .add(new THREE.Vector3(0, 0, 0.01)),
      );
      this.scene.add(t);
    }
    let baseLabel = this.label("BASE", 0.018, "#91a27e");
    baseLabel.position.set(-0.1, -0.1, -0.065);
    this.scene.add(baseLabel);
  }
  setQ(q) {
    const frames = fk(q, true);
    if (!this.joints) {
      this.joints = [];
      this.links = [];
      for (let i = 0; i < 6; i++) {
        let g = new THREE.Group();
        let joint = this.cylinder(
          i < 2 ? 0.048 : i < 4 ? 0.041 : 0.028,
          i < 2 ? 0.072 : 0.053,
          new THREE.Vector3(),
          this.green,
          g,
        );
        let cap = this.cylinder(
          i < 2 ? 0.035 : i < 4 ? 0.029 : 0.021,
          (i < 2 ? 0.072 : 0.053) + 0.003,
          new THREE.Vector3(),
          this.white,
          g,
        );
        let band = this.cylinder(
          i < 2 ? 0.037 : i < 4 ? 0.031 : 0.023,
          0.006,
          new THREE.Vector3(0, 0, 0.027),
          this.dark,
          g,
        );
        this.robot.add(g);
        this.joints.push(g);
        if (i < 5) {
          let link = this.mesh(
            new THREE.CylinderGeometry(
              i < 3 ? 0.029 : 0.021,
              i < 3 ? 0.034 : 0.023,
              1,
              24,
            ),
            this.white,
            new THREE.Vector3(),
            this.robot,
          );
          this.links.push(link);
        }
      }
      this.flange = this.cylinder(
        0.021,
        0.014,
        new THREE.Vector3(),
        this.silver,
        this.robot,
      );
    }
    for (let i = 0; i < 6; i++) {
      let matrix = new THREE.Matrix4().set(...frames[i]);
      matrix.elements[12] /= 1000;
      matrix.elements[13] /= 1000;
      matrix.elements[14] /= 1000;
      this.joints[i].matrixAutoUpdate = false;
      this.joints[i].matrix.copy(matrix);
      if (i < 5) {
        let a = v(point(frames[i])),
          b = v(point(frames[i + 1])),
          d = b.clone().sub(a);
        this.links[i].position.copy(a.clone().add(b).multiplyScalar(0.5));
        this.links[i].quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          d.clone().normalize(),
        );
        this.links[i].scale.y = Math.max(0.001, d.length());
      }
    }
    this.flange.position.copy(v(point(frames[5])));
    this.tcp.position.copy(v(point(frames[5])));
    return point(frames[5]);
  }
  clearPlan() {
    while (this.pathGroup.children.length) {
      const o = this.pathGroup.children[0];
      this.pathGroup.remove(o);
      o.traverse((x) => {
        x.geometry?.dispose();
        if (x.material) {
          for (const m of Array.isArray(x.material)
            ? x.material
            : [x.material]) {
            m.map?.dispose();
            m.dispose();
          }
        }
      });
    }
    this.target.visible = false;
  }
  setPlan(plan) {
    this.clearPlan();
    if (plan.motions.length) {
      let pts = [v(plan.motions[0].from.slice(0, 3))];
      for (const m of plan.motions) pts.push(v(m.to.slice(0, 3)));
      let g = new THREE.BufferGeometry().setFromPoints(pts);
      this.pathGroup.add(
        new THREE.Line(
          g,
          new THREE.LineBasicMaterial({
            color: 0x8aab63,
            transparent: true,
            opacity: 0.68,
          }),
        ),
      );
      for (const m of plan.motions) {
        let dot = this.mesh(
          new THREE.SphereGeometry(0.0025, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0x8eab6a }),
          v(m.to.slice(0, 3)),
          this.pathGroup,
        );
      }
    }
    plan.points.forEach((p, i) => {
      let dot = this.mesh(
        new THREE.SphereGeometry(0.0035, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x6e8d54 }),
        v(p.slice(0, 3)),
        this.pathGroup,
      );
      let label = this.label(String(i), 0.019, "#6d8956");
      label.position.copy(v(p.slice(0, 3))).add(new THREE.Vector3(0, 0, 0.013));
      this.pathGroup.add(label);
      let g = new THREE.BufferGeometry().setFromPoints([
        v(p.slice(0, 3)),
        v([p[0], p[1], p[2] + 20]),
      ]);
      this.pathGroup.add(
        new THREE.Line(
          g,
          new THREE.LineDashedMaterial({
            color: 0xa9b994,
            dashSize: 0.003,
            gapSize: 0.003,
          }),
        ).computeLineDistances(),
      );
    });
  }
  setTarget(p) {
    this.target.visible = !!p;
    if (p) this.target.position.copy(v(p.slice(0, 3)));
  }
  resetView() {
    this.camera.position.set(1.35, 1.55, 1.05);
    this.controls.target.set(0.14, 0.23, 0.23);
    this.controls.update();
  }
  resize() {
    let w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (w && h) {
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }
}
