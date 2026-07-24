import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  createLocalIdentity,
  readLocalIdentity,
  saveLocalIdentity,
  type LocalIdentity,
} from '../../auth/localIdentity'

type LocalLoginGateProps = {
  children: ReactNode
  transitionMs?: number
}

type LoginPhase = 'idle' | 'creating' | 'complete'

export function LocalLoginGate({
  children,
  transitionMs = 520,
}: LocalLoginGateProps) {
  const [identity, setIdentity] = useState<LocalIdentity | null>(() => readLocalIdentity())
  const [draft] = useState(createLocalIdentity)
  const [phase, setPhase] = useState<LoginPhase>('idle')
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    }
  }, [])

  if (identity) return children

  const completeLocalLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (phase !== 'idle') return

    setPhase('creating')
    saveLocalIdentity(draft)
    completionTimerRef.current = setTimeout(() => {
      setPhase('complete')
      setIdentity(draft)
    }, transitionMs)
  }

  return (
    <section
      className="local-login-shell"
      data-phase={phase}
      style={{ '--scene-accent': '#aebbd2' } as CSSProperties}
    >
      <div className="local-login-ambient" aria-hidden="true" />
      <div className="local-login-grid" aria-hidden="true" />
      <div className="local-login-grain" aria-hidden="true" />

      <header className="local-login-header">
        <div className="brand-mark" aria-label="BicaMind">
          <span>BICA</span>
          <span>MIND</span>
        </div>
        <div className="local-login-status">
          <i aria-hidden="true" />
          <span>Local identity</span>
          <small>DEVICE BOUND</small>
        </div>
      </header>

      <main className="local-login-main">
        <div className="local-login-intro">
          <p className="local-login-eyebrow">PRIVATE ACCESS FIELD</p>
          <h1>进入你的主场</h1>
          <p className="local-login-description">
            此设备将创建一个本地身份，用于保存偏好并隔离后续账号数据。
          </p>
        </div>

        <form
          className="local-login-form"
          aria-busy={phase === 'creating'}
          onSubmit={completeLocalLogin}
        >
          <div className="local-login-field">
            <label htmlFor="local-identity-email">本地邮箱</label>
            <input
              id="local-identity-email"
              value={draft.email}
              readOnly
              tabIndex={-1}
              autoComplete="off"
              spellCheck={false}
            />
            <small>AUTO GENERATED</small>
          </div>

          <div className="local-login-field">
            <label htmlFor="local-identity-password">本地密码</label>
            <input
              id="local-identity-password"
              value={draft.password}
              readOnly
              tabIndex={-1}
              type="password"
              autoComplete="new-password"
            />
            <small>24 CHAR LOCAL KEY</small>
          </div>

          <button
            className="local-login-submit interactive-target"
            type="submit"
            disabled={phase !== 'idle'}
          >
            <span>{phase === 'idle' ? '登录并进入' : '正在建立身份'}</span>
            <small>{phase === 'idle' ? 'ENTER FIELD' : 'WRITING LOCAL STATE'}</small>
          </button>

          <p className="local-login-notice" aria-live="polite">
            {phase === 'creating'
              ? '身份正在写入此浏览器'
              : '不连接认证服务器。清除本站浏览器数据后，此身份将被重置。'}
          </p>
        </form>
      </main>

      <footer className="local-login-footer">
        <span>LOCAL STORAGE / VERSION 01</span>
        <span>NO REMOTE AUTH</span>
      </footer>
    </section>
  )
}
