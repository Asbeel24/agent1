import { useLayoutEffect, type RefObject } from 'react'
import { gsap } from 'gsap'
import type { SceneId } from '../types'

export function useSceneReentrance(
  rootRef: RefObject<HTMLElement | null>,
  sceneId: SceneId,
) {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const context = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'expo.out' } })
        .from('.scene-identity, .scene-description', {
          x: -14,
          duration: 0.72,
          stagger: 0.06,
        })
        .fromTo(
          '.scene-meta-value',
          { y: 8 },
          { y: 0, duration: 0.65, stagger: 0.06 },
          '<0.08',
        )
    }, root)
    return () => context.revert()
  }, [rootRef, sceneId])
}