import { useEffect } from 'react'
import type { Task } from '../types'

export function useTaskMarkers(taskOpen: boolean, tasks: readonly Task[]) {
  useEffect(() => {
    if (!taskOpen) return
    const api = window.particleOrb
    if (!api) return

    api.markers.clear()
    const colors = ['#d8d9e4', '#79bfd2', '#d49b79']
    tasks.forEach((task, index) => {
      api.markers.set(task.id, {
        phase: index / tasks.length,
        orbitRadius: 1.28 + index * 0.04,
        tilt: index % 2 ? -0.34 : 0.28,
        color: colors[index],
        size: 12,
        brightness: 1.7,
        speed: 0.18 + index * 0.035,
      })
    })
    api.trigger('burst', { intensity: 0.5, duration: 0.8 })
  }, [taskOpen, tasks])
}