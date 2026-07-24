import { useLayoutEffect, type RefObject } from 'react'
import { gsap } from 'gsap'

export function useEntranceTimeline(rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const context = gsap.context(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduceMotion) return

      gsap
        .timeline({ defaults: { ease: 'expo.out' } })
        .from('.brand-mark, .system-status', { y: -16, duration: 0.9 })
        .from('.scene-nav-item', { y: -12, stagger: 0.08, duration: 0.8 }, '<0.12')
        .from('.orb-stage', { scale: 0.82, duration: 1.8 }, '<0.05')
        .from('.scene-copy, .scene-meta-row', { y: 28, stagger: 0.08, duration: 1 }, '<0.4')
        .from('.experience-footer', { y: 14, duration: 0.8 }, '<0.3')
    }, root)

    const compactLayout = window.matchMedia('(max-width: 900px)')
    const resetResponsiveOrbPosition = () => {
      const orb = root.querySelector<HTMLElement>('.orb-stage')
      if (!orb) return
      gsap.killTweensOf(orb)
      gsap.set(orb, { clearProps: 'transform,translate' })
    }
    compactLayout.addEventListener('change', resetResponsiveOrbPosition)

    return () => {
      compactLayout.removeEventListener('change', resetResponsiveOrbPosition)
      context.revert()
    }
  }, [rootRef])
}