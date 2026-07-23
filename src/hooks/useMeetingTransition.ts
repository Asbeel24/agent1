import { useLayoutEffect, useRef, type RefObject } from 'react'
import { gsap } from 'gsap'

type UseMeetingTransitionOptions = {
  rootRef: RefObject<HTMLElement | null>
  sceneId: string
  textOpen: boolean
}

export function useMeetingTransition({
  rootRef,
  sceneId,
  textOpen,
}: UseMeetingTransitionOptions) {
  const previousSceneRef = useRef(sceneId)
  const previousTextOpenRef = useRef(false)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const previousScene = previousSceneRef.current
    const previousTextOpen = previousTextOpenRef.current
    const enteringMeeting = previousScene !== 'meeting' && sceneId === 'meeting'
    previousSceneRef.current = sceneId
    previousTextOpenRef.current = textOpen

    const orb = root.querySelector<HTMLElement>('.orb-stage')
    const transcript = root.querySelector<HTMLElement>('.meeting-transcript')
    const sceneChrome = Array.from(
      root.querySelectorAll<HTMLElement>('.scene-copy, .scene-meta'),
    )
    if (!orb) return

    if (sceneId !== 'meeting') {
      if (previousScene === 'meeting' && previousTextOpen) {
        gsap.killTweensOf([orb, ...sceneChrome])
        gsap.set(orb, { y: 0, scale: 1, opacity: 1, filter: 'blur(0px)' })
        gsap.set(sceneChrome, { y: 0, opacity: 1 })
      }
      return
    }

    if (!transcript) return

    if (enteringMeeting && !textOpen) {
      gsap.set(orb, { y: 0, scale: 1, opacity: 1, filter: 'blur(0px)' })
      gsap.set(transcript, { autoAlpha: 0, y: 0 })
      return
    }

    if (!textOpen && !previousTextOpen) {
      gsap.set(transcript, { autoAlpha: 0, y: 0 })
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.killTweensOf([orb, transcript, ...sceneChrome])

    if (reducedMotion) {
      gsap.set(orb, { opacity: textOpen ? 0 : 1, scale: textOpen ? 0.92 : 1 })
      gsap.set(sceneChrome, { opacity: textOpen ? 0 : 1 })
      gsap.set(transcript, { autoAlpha: textOpen ? 1 : 0, y: 0 })
      return
    }

    const timeline = gsap.timeline({ defaults: { overwrite: true } })
    if (textOpen) {
      timeline
        .to(sceneChrome, {
          y: -18,
          opacity: 0,
          duration: 0.32,
          ease: 'power2.in',
        })
        .to(
          orb,
          {
            y: -72,
            scale: 0.92,
            opacity: 0,
            filter: 'blur(8px)',
            duration: 0.5,
            ease: 'power3.inOut',
          },
          0,
        )
        .fromTo(
          transcript,
          { autoAlpha: 0, y: 42, clipPath: 'inset(0 0 100% 0)' },
          {
            autoAlpha: 1,
            y: 0,
            clipPath: 'inset(0 0 0% 0)',
            duration: 0.72,
            ease: 'power4.out',
          },
          0.32,
        )
        .fromTo(
          transcript.querySelectorAll('.meeting-transcript-line'),
          { y: 18, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.52,
            stagger: 0.07,
            ease: 'power3.out',
          },
          0.48,
        )
    } else {
      timeline
        .to(transcript, {
          autoAlpha: 0,
          y: 28,
          duration: 0.28,
          ease: 'power2.in',
        })
        .fromTo(
          orb,
          { y: -42, scale: 0.92, opacity: 0, filter: 'blur(8px)' },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            filter: 'blur(0px)',
            duration: 0.72,
            ease: 'expo.out',
          },
          0.16,
        )
        .to(
          sceneChrome,
          {
            y: 0,
            opacity: 1,
            duration: 0.52,
            stagger: 0.04,
            ease: 'power3.out',
          },
          0.34,
        )
    }

    return () => {
      timeline.kill()
    }
  }, [rootRef, sceneId, textOpen])
}
