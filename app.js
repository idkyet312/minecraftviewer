// Dynamic import of Three.js and OrbitControls with CDN fallbacks
async function loadThreeWithFallbacks(){
  const sources = [
    {
      three: 'https://unpkg.com/three@0.154.0/build/three.module.js',
      controls: 'https://unpkg.com/three@0.154.0/examples/jsm/controls/OrbitControls.js'
    },
    {
      three: 'https://cdn.jsdelivr.net/npm/three@0.154.0/build/three.module.js',
      controls: 'https://cdn.jsdelivr.net/npm/three@0.154.0/examples/jsm/controls/OrbitControls.js'
    },
    {
      three: 'https://cdn.skypack.dev/three@0.154.0',
      controls: 'https://cdn.skypack.dev/three@0.154.0/examples/jsm/controls/OrbitControls.js'
    }
  ];
  let lastErr;
  for(const src of sources){
    try{
      const THREE = await import(src.three);
      const { OrbitControls } = await import(src.controls);
      return { THREE, OrbitControls };
    }catch(err){
      lastErr = err;
      console.warn('Failed to load Three from', src.three, err);
    }
  }
  throw lastErr || new Error('Failed to load Three.js from all CDNs');
}

const canvas = document.getElementById('c');
const infoEl = document.getElementById('info');

let THREE, OrbitControls;
let renderer, scene, camera, controls;

bootstrap().catch(err=>{
  console.error(err);
  if(infoEl) infoEl.textContent = 'Failed to initialize Three.js: ' + err;
});

async function bootstrap(){
  infoEl && (infoEl.textContent = 'Loading Three.js…');
  ({ THREE, OrbitControls } = await loadThreeWithFallbacks());
  infoEl && (infoEl.textContent = 'Loading model…');

  renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f0f0f);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 5000);
  camera.position.set(80, 60, 120);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 18, 0);
  controls.update();

  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(50,100,50);
  scene.add(dir);

  // helper grid
  const grid = new THREE.GridHelper(200, 40, 0x666666, 0x333333);
  scene.add(grid);
  scene.add(new THREE.AxesHelper(20));

  await loadModel();
  infoEl && (infoEl.textContent = 'Drag to orbit, scroll to zoom. Model: example_stand.geo.json');

  // render loop
  function animate(){
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

// load texture and model
async function loadModel() {
  const started = performance.now();
  const [texResp, geoResp] = await Promise.all([
    fetch('default.png'),
    fetch('example_stand.geo.json')
  ]);
  if(!texResp.ok || !geoResp.ok) throw new Error('Missing files');
  const texBlob = await texResp.blob();
  const texURL = URL.createObjectURL(texBlob);
  // load texture and wait until it's ready
  const texture = await new Promise((resolve, reject)=>{
    new THREE.TextureLoader().load(texURL, tx=>{
      tx.magFilter = THREE.NearestFilter;
      tx.minFilter = THREE.NearestFilter;
      resolve(tx);
    }, undefined, err=> reject(err));
  });

  const geoJson = await geoResp.json();
  const geom = geoJson['minecraft:geometry'][0];
  const desc = geom.description || {};
  const texW = desc.texture_width || 64;
  const texH = desc.texture_height || 64;

  // map of bone name -> Object3D
  const bones = new Map();

  // create root objects for bones with positions set to pivot
  for(const b of geom.bones || []){
  const obj = new THREE.Object3D();
    obj.name = b.name;
    const p = b.pivot || [0,0,0];
  // use JSON coordinates directly (Y is up in both formats)
  obj.position.set(p[0], p[1], p[2]);
    bones.set(b.name, {def:b, obj});
  }

  // attach bone parent relationships (kept for completeness but we won't rely on it)
  for(const [name, entry] of bones){
    const parent = entry.def.parent;
    if(parent && bones.has(parent)){
      bones.get(parent).obj.add(entry.obj);
    } else {
      // defer adding to scene; we'll add through modelRoot later
    }
  }

  // SIMPLE BUILDER: place cubes at their absolute origin positions (ignores bone transforms)
  const simpleRoot = new THREE.Object3D();
  let cubeCount = 0;
  for(const [name, entry] of bones){
    const b = entry.def;
    if(!b.cubes) continue;
    for(const cube of b.cubes){
      cubeCount++;
      const origin = cube.origin || [0,0,0];
      const size = cube.size || [1,1,1];
      const sx = size[0], sy = size[1], sz = size[2];
      const geometry = new THREE.BoxGeometry(sx, sy, sz);
      const material = new THREE.MeshStandardMaterial({map:texture, metalness:0.05, roughness:0.8});
      const mesh = new THREE.Mesh(geometry, material);
      const center = [origin[0] + sx/2, origin[1] + sy/2, origin[2] + sz/2];
      if(cube.pivot || cube.rotation){
        const group = new THREE.Object3D();
        const cPivot = cube.pivot || [0,0,0];
        group.position.set(cPivot[0], cPivot[1], cPivot[2]);
        if(cube.rotation){
          const r = cube.rotation;
          group.rotation.set(THREE.MathUtils.degToRad(r[0]||0), THREE.MathUtils.degToRad(r[1]||0), THREE.MathUtils.degToRad(r[2]||0));
        }
        mesh.position.set(center[0] - cPivot[0], center[1] - cPivot[1], center[2] - cPivot[2]);
        group.add(mesh);
        simpleRoot.add(group);
      } else {
        mesh.position.set(center[0], center[1], center[2]);
        simpleRoot.add(mesh);
      }
    }
  }

    // gather top-level bones under a single root so we can center/scale
    const modelRoot = simpleRoot; // use the simple root we built

    // compute bounding box and center the model
    const box = new THREE.Box3().setFromObject(modelRoot);
    if(!box.isEmpty()){
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      // translate so center is at origin
      modelRoot.position.sub(center);
      // scale to fit camera view if too large/small
      const maxDim = Math.max(size.x, size.y, size.z);
      if(maxDim > 0){
        const desired = 60; // target size for framing
        const s = desired / maxDim;
        modelRoot.scale.setScalar(s);
      }
    // after reposition/scale, add to scene
      scene.add(modelRoot);
      // point camera controls to model center (now at origin)
      controls.target.set(0, 0, 0);
      controls.update();
      // move camera back to fit based on size
    const dist = 2 * Math.max(size.x, size.y, size.z);
      camera.position.set(dist*0.8, dist*0.6, dist*1.2);
      camera.near = 0.1;
      camera.far = dist*10 + 100;
      camera.updateProjectionMatrix();
    // show stats
    const elapsed = Math.round(performance.now() - started);
    infoEl && (infoEl.textContent = `Loaded ${cubeCount} cubes in ${elapsed}ms • bbox ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)}`);
    } else {
      // fallback: add anyway
      scene.add(modelRoot);
    }

}

// bootstrap() calls loadModel() and starts the render loop
