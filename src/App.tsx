import { ParticleOrb } from './components/ParticleOrb'

export default function App() {
  return (
    <main className="orb-page">
      <div className="orb-stage">
        <ParticleOrb mode="idle" />
      </div>
    </main>
  )
}
