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
import { authenticateLocalIdentity } from '../../auth/backendSession'

type LocalLoginGateProps = {
  children: ReactNode
  transitionMs?: number
  authenticate?: (identity: LocalIdentity) => Promise<unknown>
}

type LoginPhase = 'idle' | 'authenticating' | 'complete' | 'error'

export function LocalLoginGate({
  children,
  transitionMs = 520,
  authenticate = authenticateLocalIdentity,
}: LocalLoginGateProps) {
  const [identity, setIdentity] = useState<LocalIdentity | null>(() => readLocalIdentity())
  const [draft] = useState(createLocalIdentity)
  const [phase, setPhase] = useState<LoginPhase>(identity ? 'authenticating' : 'idle')
  const [errorMessage, setErrorMessage] = useState('')
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!identity || phase !== 'authenticating') return

    let active = true
    authenticate(identity)
      .then(() => {
        if (!active) return
        completionTimerRef.current = setTimeout(() => {
          setPhase('complete')
        }, transitionMs)
      })
      .catch((error: unknown) => {
        if (!active) return
        setErrorMessage(
          error instanceof Error ? error.message : '无法连接 Agent1 后端',
        )
        setPhase('error')
      })

    return () => {
      active = false
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    }
  }, [authenticate, identity, phase, transitionMs])

  if (identity && phase === 'complete') return children

  const completeLocalLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (phase === 'authenticating') return

    const nextIdentity = identity ?? draft
    if (!identity) saveLocalIdentity(nextIdentity)
    setErrorMessage('')
    setPhase('authenticating')
    setIdentity(nextIdentity)
  }

  const displayedIdentity = identity ?? draft
  const isAuthenticating = phase === 'authenticating'

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
          aria-busy={isAuthenticating}
          onSubmit={completeLocalLogin}
        >
          <div className="local-login-field">
            <label htmlFor="local-identity-email">本地邮箱</label>
            <input
              id="local-identity-email"
              value={displayedIdentity.email}
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
              value={displayedIdentity.password}
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
            disabled={isAuthenticating}
          >
            <span>
              {isAuthenticating
                ? '正在连接 Agent1'
                : phase === 'error'
                  ? '重新连接'
                  : '登录并进入'}
            </span>
            <small>
              {isAuthenticating
                ? 'AUTHENTICATING'
                : phase === 'error'
                  ? 'RETRY CONNECTION'
                  : 'ENTER FIELD'}
            </small>
          </button>

          <p className="local-login-notice" aria-live="polite">
            {isAuthenticating
              ? '正在恢复或创建测试账号，并建立实时通道'
              : phase === 'error'
                ? `连接失败：${errorMessage}`
                : '本地身份将自动映射到测试账号；清除本站浏览器数据后会重新创建。'}
          </p>
        </form>
      </main>

      <footer className="local-login-footer">
        <span>LOCAL IDENTITY / VERSION 01</span>
        <span>OPENTARS AUTH BRIDGE</span>
      </footer>
    </section>
  )
}
