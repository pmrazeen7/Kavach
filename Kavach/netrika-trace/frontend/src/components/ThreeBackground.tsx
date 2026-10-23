/**
 * ThreeBackground.tsx
 * Ports the Three.js 3D animated shield/icosahedron from landing.html
 * into a reusable React component backed by a canvas fixed to the viewport.
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function ThreeBackground() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    // ── Scene setup ───────────────────────────────────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    )
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    // ── Core group ────────────────────────────────────────────────────
    const coreGroup = new THREE.Group()
    scene.add(coreGroup)

    // Inner solid icosahedron (semi-transparent orange fill)
    const innerGeo = new THREE.IcosahedronGeometry(7, 1)
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      wireframe: false,
      transparent: true,
      opacity: 0.15,
    })
    const innerCore = new THREE.Mesh(innerGeo, innerMat)
    coreGroup.add(innerCore)

    // Outer wireframe shield
    const outerGeo = new THREE.IcosahedronGeometry(12, 2)
    const outerWireframe = new THREE.WireframeGeometry(outerGeo)
    const outerMat = new THREE.LineBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.25,
    })
    const outerShield = new THREE.LineSegments(outerWireframe, outerMat)
    coreGroup.add(outerShield)

    // Orbital rings
    const createRing = (radius: number, thickness: number, opacity: number) => {
      const geo = new THREE.TorusGeometry(radius, thickness, 16, 100)
      const mat = new THREE.LineBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity,
      })
      return new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat)
    }

    const ring1 = createRing(16, 0.1, 0.2)
    const ring2 = createRing(20, 0.05, 0.15)
    const ring3 = createRing(24, 0.2, 0.1)

    ring1.rotation.x = Math.PI / 2
    ring2.rotation.y = Math.PI / 3
    ring3.rotation.z = Math.PI / 4

    coreGroup.add(ring1, ring2, ring3)

    // ── Particle cloud ────────────────────────────────────────────────
    const particlesCount = 1500
    const posArray = new Float32Array(particlesCount * 3)

    for (let i = 0; i < particlesCount; i++) {
      const r = 30 + Math.random() * 40
      const theta = 2 * Math.PI * Math.random()
      const phi = Math.acos(2 * Math.random() - 1)
      posArray[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      posArray[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      posArray[i * 3 + 2] = r * Math.cos(phi)
    }

    const particlesGeo = new THREE.BufferGeometry()
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
    const particlesMat = new THREE.PointsMaterial({
      size: 0.08,
      color: 0xff8833,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    })
    const particleMesh = new THREE.Points(particlesGeo, particlesMat)
    scene.add(particleMesh)

    camera.position.z = 45

    // ── Mouse interaction ─────────────────────────────────────────────
    let mouseX = 0
    let mouseY = 0
    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX - window.innerWidth / 2
      mouseY = e.clientY - window.innerHeight / 2
    }
    document.addEventListener('mousemove', onMouseMove)

    // ── Resize handler ────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    // ── Animation loop ────────────────────────────────────────────────
    const clock = new THREE.Clock()
    let animId: number

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      const targetX = mouseX * 0.001
      const targetY = mouseY * 0.001

      coreGroup.rotation.y += 0.05 * (targetX - coreGroup.rotation.y)
      coreGroup.rotation.x += 0.05 * (targetY - coreGroup.rotation.x)

      innerCore.rotation.y -= 0.005
      innerCore.rotation.z += 0.002
      outerShield.rotation.y += 0.002
      outerShield.rotation.x += 0.001

      ring1.rotation.z += 0.003
      ring2.rotation.x -= 0.002
      ring3.rotation.y += 0.001

      const pulse = 1 + Math.sin(t * 2) * 0.05
      coreGroup.scale.set(pulse, pulse, pulse)

      particleMesh.rotation.y = t * 0.05
      particleMesh.rotation.z = t * 0.02

      renderer.render(scene, camera)
    }

    animate()

    // ── Cleanup ───────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId)
      document.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <>
      {/* Fixed canvas behind all content */}
      <div
        ref={mountRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: -2,
          pointerEvents: 'none',
        }}
      />
      {/* Radial overlay to keep text readable */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background:
            'radial-gradient(circle at center, rgba(28,31,36,0.35) 0%, rgba(10,12,16,0.88) 100%)',
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />
    </>
  )
}
