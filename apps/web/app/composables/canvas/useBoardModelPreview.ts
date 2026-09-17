import type { BoardPackage } from '~/utils/boardPackage'
import type { Artwork } from '~/utils/artwork'
import { decodeGlb } from '~/utils/boardModels'
import { boardSurface } from '~/utils/boardSurface'
import type { Object3D, Material, Mesh, WebGLRenderer, PerspectiveCamera, Texture, Group } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const useBoardModelPreview = (props: Readonly<{ board: BoardPackage; artwork: Artwork[]; silk: boolean; background: string; side: string; fabrication: boolean }>, host: Readonly<Ref<HTMLElement | null>>) => {
  const loading = ref(true)
  const error = ref('')
  let disposed = false
  let renderer: WebGLRenderer | undefined
  let controls: OrbitControls | undefined
  let camera: PerspectiveCamera | undefined
  let group: Group | undefined
  let resize: ResizeObserver | undefined
  let renderScene = () => {}
  let fitScene = () => {}
  let updateTextures = async () => {}
  let animationFrame: number | undefined
  let textureVersion = 0
  let updateTimer: ReturnType<typeof setTimeout> | undefined
  const textures: Texture[] = []
  const geometries = new Set<{ dispose: () => void }>()
  const materials = new Set<Material>()
  const collect = (root: Object3D) => root.traverse(node => {
    const mesh = node as Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
  })
  const fit = () => fitScene()
  const zoom = (factor: number) => {
    if (!camera || !controls) return
    controls.dollyIn(1 / factor)
    renderScene()
  }


  const disposeScene = () => {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
    animationFrame = undefined
    disposed = true; textureVersion++; clearTimeout(updateTimer); resize?.disconnect(); controls?.dispose()
    textures.splice(0).forEach(texture => texture.dispose())
    geometries.forEach(geometry => geometry.dispose()); geometries.clear()
    materials.forEach(material => material.dispose()); materials.clear()
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove()
    renderer = undefined; controls = undefined; camera = undefined
  }

  onMounted(async () => {
    try {
      const bytes = decodeGlb(props.board.models!.glb!, props.board.models!.encoding)
      const [THREE, { GLTFLoader }, { OrbitControls }, { SVGLoader }, { mergeGeometries }] = await Promise.all([
        import('three'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/controls/OrbitControls.js'),
        import('three/addons/loaders/SVGLoader.js'), import('three/addons/utils/BufferGeometryUtils.js'),
      ])
      if (disposed || !host.value) return
      const manager = new THREE.LoadingManager()
      manager.setURLModifier(() => { throw new Error('External model assets are not allowed.') })
      const loaded = await new GLTFLoader(manager).parseAsync(bytes.buffer as ArrayBuffer, '')
      collect(loaded.scene)
      if (disposed) { geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); return }
      const scene = new THREE.Scene()
      group = new THREE.Group(); scene.add(group)
      // Open CASCADE writes metres with GLB Y normal to the board and Z down the PCB.
      // The rest of this viewer uses millimetres, matching the artwork's coordinates.
      loaded.scene.scale.setScalar(1000); loaded.scene.updateMatrixWorld(true)
      const batches = new Map<string, { material: Material; geometries: import('three').BufferGeometry[] }>()
      loaded.scene.traverse(node => {
        const mesh = node as Mesh
        if (!mesh.isMesh || !mesh.geometry || Array.isArray(mesh.material)) return
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
        if (!geometry.attributes.normal) geometry.computeVertexNormals()
        geometry.clearGroups(); geometries.add(geometry)
        const key = mesh.material.uuid + Object.keys(geometry.attributes).sort().join(',')
        if (!batches.has(key)) batches.set(key, { material: mesh.material, geometries: [] })
        batches.get(key)!.geometries.push(geometry)
      })
      for (const batch of batches.values()) {
        const merged = mergeGeometries(batch.geometries)
        if (merged) { geometries.add(merged); group.add(new THREE.Mesh(merged, batch.material)) }
        else for (const geometry of batch.geometries) group.add(new THREE.Mesh(geometry, batch.material))
      }
      const { x, y, width, height } = props.board.bounds
      const thickness = props.board.models!.boardThicknessMm
      const outline = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${props.board.outline} ${props.board.holes}" fill-rule="evenodd"/></svg>`)
      const shapes = outline.paths.flatMap(path => SVGLoader.createShapes(path))
      const bodyGeometry = new THREE.ExtrudeGeometry(shapes, { depth: thickness, bevelEnabled: false, curveSegments: 8 })
      bodyGeometry.rotateX(Math.PI / 2); bodyGeometry.translate(0, thickness, 0)
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#787457', roughness: 0.9 })
      // Only the board edge uses the extrusion; textured surfaces replace its
      // caps so nearly coincident faces cannot fight in the depth buffer.
      const hiddenCaps = new THREE.MeshBasicMaterial({ visible: false })
      group.add(new THREE.Mesh(bodyGeometry, [hiddenCaps, bodyMaterial]))
      const surfaces = ['front', 'back'].map(side => {
        const geometry = new THREE.ShapeGeometry(shapes)
        const positions = geometry.getAttribute('position')
        const uv = geometry.getAttribute('uv')
        for (let index = 0; index < positions.count; index++) uv.setXY(index, (positions.getX(index) - x) / width, 1 - (positions.getY(index) - y) / height)
        geometry.rotateX(Math.PI / 2); geometry.translate(0, side === 'front' ? thickness : 0, 0)
        const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
        group!.add(new THREE.Mesh(geometry, material))
        return material
      })
      group.position.set(-x - width / 2, -thickness / 2, -y - height / 2)
      collect(group)
      scene.add(new THREE.HemisphereLight('#ffffff', '#7c836e', 2.2))
      const light = new THREE.DirectionalLight('#ffffff', 3)
      light.position.set(-width, height * 2, -height); scene.add(light)
      const rearLight = new THREE.DirectionalLight('#ffffff', 2)
      rearLight.position.set(width, -height, height); scene.add(rearLight)
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      host.value.appendChild(renderer.domElement)
      renderer.domElement.className = 'size-full touch-none'
      renderer.domElement.setAttribute('aria-label', `${props.board.name} assembled 3D preview`)
      renderer.domElement.setAttribute('role', 'img')
      camera = new THREE.PerspectiveCamera(35, 1, .1, Math.max(width, height) * 50)
      // OrbitControls caches the up-axis transform during construction.
      camera.up.set(0, 0, -1)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.14
      controls.rotateSpeed = 0.65
      controls.zoomSpeed = 0.7
      controls.zoomToCursor = true
      controls.screenSpacePanning = true
      controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }
      controls.minDistance = Math.max(width, height) * .15
      controls.maxDistance = Math.max(width, height) * 12
      // Keep drawing while the controls settle, then stop using the GPU at rest.
      renderScene = () => {
        if (disposed || animationFrame !== undefined) return
        animationFrame = requestAnimationFrame(() => {
          animationFrame = undefined
          if (disposed || !renderer || !camera) return
          const moving = controls?.update()
          renderer.render(scene, camera)
          if (moving) renderScene()
        })
      }
      controls.addEventListener('change', renderScene)
      const bounds = new THREE.Box3().setFromObject(group)
      const center = bounds.getCenter(new THREE.Vector3())
      const size = bounds.getSize(new THREE.Vector3())
      fitScene = () => {
        if (!camera || !controls) return
        // Flush residual motion before an explicit Front/Back/Fit reset.
        controls.enableDamping = false
        controls.update()
        controls.target.copy(center)
        const distance = Math.max(size.x / camera.aspect, size.z, size.y) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.3
        // A mostly overhead view keeps front/back orientation easy to compare to 2D.
        const direction = props.side === 'front' ? new THREE.Vector3(0, 1, .38) : new THREE.Vector3(0, -1, .38)
        camera.position.copy(center).add(direction.normalize().multiplyScalar(distance))
        controls.update()
        controls.enableDamping = true
        renderScene()
      }
      let fitted = false
      const measure = () => {
        if (!host.value || !renderer || !camera) return
        const { width, height } = host.value.getBoundingClientRect()
        if (width <= 0 || height <= 0) return
        renderer.setSize(width, height, false)
        camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix()
        if (!fitted) { fitScene(); fitted = true }
        else renderScene()
      }
      updateTextures = async () => {
        const version = ++textureVersion
        const canvases = await Promise.all(['front', 'back'].map(side => boardSurface(props.board, props.artwork, side, props.silk, props.background, props.fabrication)))
        if (disposed || version !== textureVersion) return
        textures.splice(0).forEach(texture => texture.dispose())
        canvases.forEach((canvas, index) => {
          const texture = new THREE.CanvasTexture(canvas)
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(8, renderer!.capabilities.getMaxAnisotropy())
          textures.push(texture); surfaces[index]!.map = texture; surfaces[index]!.needsUpdate = true
        })
        renderScene()
      }
      resize = new ResizeObserver(measure); resize.observe(host.value)
      measure(); await updateTextures()
      if (!disposed) { loading.value = false; renderScene() }
    } catch (cause) { if (!disposed) { loading.value = false; error.value = cause instanceof Error ? cause.message : '3D preview is unavailable on this device.'; disposeScene() } }
  })
  watch(() => props.side, () => fitScene())
  watch(() => [props.artwork, props.silk, props.background, props.fabrication], () => {
    clearTimeout(updateTimer)
    updateTimer = setTimeout(() => { updateTextures().catch(() => { error.value = 'Could not update the board artwork preview.' }) }, 100)
  }, { deep: true })
  onBeforeUnmount(disposeScene)
  return { loading, error, fit, zoom }
}
