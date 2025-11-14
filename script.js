import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import gsap from "https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js";

let camera, scene, renderer, controls;
let imagePlaneGroup;
let pedestalMesh;
let spotLight;

let particleSphereGroup;
let particlePoints;
let originalParticlePositions;
let targetParticlePositions;
let isZoomed = false;
let isCardFlipped = false;

let composer;


init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.8, 7);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0a0a, 1);

    document.getElementById('app-container').appendChild(renderer.domElement);

    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85); // strength, radius, threshold
    bloomPass.threshold = 0.9;
    bloomPass.strength = 1.0;
    bloomPass.radius = 0.5;
    composer.addPass(bloomPass);

    spotLight = new THREE.SpotLight(0xffffff, 100, 15, Math.PI * 0.15, 0.5, 0.5);
    spotLight.position.set(0, 7, 3);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.camera.near = 0.5;
    spotLight.shadow.camera.far = 15;
    spotLight.shadow.camera.fov = 30;
    scene.add(spotLight);

    const bottomLight = new THREE.PointLight(0x00aaff, 10, 10);
    bottomLight.position.set(0, -2.5, 0);
    scene.add(bottomLight);

    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    scene.add(ambientLight);

    const groundGeometry = new THREE.PlaneGeometry(10, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        metalness: 0.1,
        roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.5;
    ground.receiveShadow = true;
    scene.add(ground);

    const pedestalGeometry = new THREE.CylinderGeometry(1.5, 2, 1, 32);
    const pedestalMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.8,
        roughness: 0.2
    });
    pedestalMesh = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
    pedestalMesh.position.y = -2;
    pedestalMesh.receiveShadow = true;
    pedestalMesh.castShadow = true;
    scene.add(pedestalMesh);

    particleSphereGroup = new THREE.Group();
    const sphereRadius = 3.5;
    const sphereSegments = 20;
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, sphereSegments, sphereSegments);

    const pointsMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.08,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.9
    });
    particlePoints = new THREE.Points(sphereGeometry, pointsMaterial);
    particleSphereGroup.add(particlePoints);

    const wireframeGeometry = new THREE.WireframeGeometry(sphereGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.2
    });
    const lines = new THREE.LineSegments(wireframeGeometry, lineMaterial);
    particleSphereGroup.add(lines);

    particleSphereGroup.position.y = 0.5;

    scene.add(particleSphereGroup);

    storeParticlePositions();

    loadCardTextures()
        .then(({ frontTexture, backTexture }) => {
            createImagePlane(frontTexture, backTexture);
        })
        .catch((err) => {
            console.error("Не вдалося завантажити текстури зображень. Переконайтеся, що файли 'images/CardMainBG.png' та 'images/CardBackBG.png' існують.", err);
        });

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.enableZoom = false;

    controls.enabled = false;

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('click', onClick);
}

function createImagePlane(frontTexture, backTexture) {
    
    const aspect = frontTexture.image.width / frontTexture.image.height;
    const planeHeight = 5.0;
    const planeWidth = planeHeight * aspect;

    const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);


    const frontMaterial = new THREE.MeshBasicMaterial({
        map: frontTexture,
        side: THREE.FrontSide,
        transparent: true,
        alphaMap: frontTexture,
        alphaTest: 0.1
    });
    const frontMesh = new THREE.Mesh(planeGeometry, frontMaterial);
    frontMesh.position.z = 0.001; 

    const backMaterial = new THREE.MeshBasicMaterial({
        map: backTexture,
        side: THREE.FrontSide,
        transparent: true,
        alphaMap: backTexture,
        alphaTest: 0.1
    });
    const backMesh = new THREE.Mesh(planeGeometry, backMaterial);
    backMesh.rotation.y = Math.PI; 

    imagePlaneGroup = new THREE.Group();
    imagePlaneGroup.add(frontMesh);
    imagePlaneGroup.add(backMesh);
    imagePlaneGroup.castShadow = true;
    imagePlaneGroup.receiveShadow = true;

    imagePlaneGroup.position.y = 0.5;
    scene.add(imagePlaneGroup);
}

function loadCardTextures() {
    const loader = new THREE.TextureLoader();
    const frontPath = 'images/CardMainBG.png';
    const backPath = 'images/CardBackBG.png';

    return new Promise((resolve, reject) => {
        let frontTex = null;
        let backTex = null;
        let loaded = 0;
        let errored = false;

        loader.load(frontPath,
            (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                tex.flipY = true;
                frontTex = tex;
                loaded++;
                if (loaded === 2 && !errored) resolve({ frontTexture: frontTex, backTexture: backTex });
            },
            undefined,
            (err) => {
                console.error("Помилка завантаження передньої текстури:", err);
                errored = true;
                reject(err);
            }
        );

        loader.load(backPath,
            (tex) => {
                tex.encoding = THREE.sRGBEncoding;
                tex.flipY = true;
                backTex = tex;
                loaded++;
                if (loaded === 2 && !errored) resolve({ frontTexture: frontTex, backTexture: backTex });
            },
            undefined,
            (err) => {
                console.error("Помилка завантаження задньої текстури:", err);
                errored = true;
                reject(err);
            }
        );
    });
}


function storeParticlePositions() {
    const positions = particlePoints.geometry.attributes.position.array;
    originalParticlePositions = new Float32Array(positions);
    targetParticlePositions = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 3) {
        let pos = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
        let targetPos = pos.clone().normalize().multiplyScalar(15);

        targetParticlePositions[i] = targetPos.x;
        targetParticlePositions[i + 1] = targetPos.y;
        targetParticlePositions[i + 2] = targetPos.z;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

function onClick(event) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    if (!imagePlaneGroup) return;

    const intersects = raycaster.intersectObjects(imagePlaneGroup.children);

    if (intersects.length > 0) {
        if (!isZoomed) {
            zoomIn();
        } else {
            flipCard();
        }
    } else {
        if (isZoomed) {
            zoomOut();
        }
    }
}

function zoomIn() {
    isZoomed = true;
    controls.enabled = false;

    gsap.to(camera.position, {
        duration: 1.5,
        x: 0,
        y: 0.5,
        z: 2.5,
        ease: "power3.inOut"        
    });

    const positions = particlePoints.geometry.attributes.position.array;
    gsap.to(positions, {
        duration: 1.5,
        ease: "power3.inOut",
        endArray: targetParticlePositions,
        onUpdate: () => {
            particlePoints.geometry.attributes.position.needsUpdate = true;
        }
    });
}

function zoomOut() {
    isZoomed = false;

    gsap.to(camera.position, {
        duration: 1.5,
        x: 0,
        y: 1.8,
        z: 7,
        ease: "power3.inOut",
        onComplete: () => {
            controls.enabled = true;
        }
    });

    const positions = particlePoints.geometry.attributes.position.array;
    gsap.to(positions, {
        duration: 1.5,
        ease: "power3.inOut",
        endArray: originalParticlePositions,
        onUpdate: () => {
            particlePoints.geometry.attributes.position.needsUpdate = true;
        }
    });

    if (isCardFlipped) {
        flipCard();
    }
}

function flipCard() {
    isCardFlipped = !isCardFlipped;
    gsap.to(imagePlaneGroup.rotation, {
        duration: 1,
        y: isCardFlipped ? Math.PI : 0,
        ease: "power3.inOut"
    });
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (!isZoomed) {
        particleSphereGroup.rotation.y += 0.001;
    }
    composer.render();
}