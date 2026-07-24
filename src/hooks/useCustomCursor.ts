import { useLayoutEffect, type RefObject } from 'react'
import { gsap } from 'gsap'

export function useCustomCursor(rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(pointer: coarse)').matches) return

    const cursor = root.querySelector<HTMLElement>('.field-cursor')
    if (!cursor) return

    const moveX = gsap.quickTo(cursor, 'x', { duration: 0.14, ease: 'power2.out' })
    const moveY = gsap.quickTo(cursor, 'y', { duration: 0.14, ease: 'power2.out' })
    const orbGrid = root.querySelector<HTMLElement>('.orb-grid')
    const moveGridX = orbGrid
      ? gsap.quickTo(orbGrid, 'x', { duration: 0.9, ease: 'power3.out' })
      : null
    const moveGridY = orbGrid
      ? gsap.quickTo(orbGrid, 'y', { duration: 0.9, ease: 'power3.out' })
      : null

    const moveCursor = (event: PointerEvent) => {
      moveX(event.clientX)
      moveY(event.clientY)
      moveGridX?.((event.clientX / window.innerWidth - 0.5) * 12)
      moveGridY?.((event.clientY / window.innerHeight - 0.5) * 8)
    }
    window.addEventListener('pointermove', moveCursor)
    return () => window.removeEventListener('pointermove', moveCursor)
  }, [rootRef])
}