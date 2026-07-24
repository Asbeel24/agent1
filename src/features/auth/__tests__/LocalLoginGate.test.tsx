import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LOCAL_IDENTITY_STORAGE_KEY } from '../../../auth/localIdentity'
import { LocalLoginGate } from '../LocalLoginGate'

describe('LocalLoginGate', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('creates credentials only when the user enters', async () => {
    const user = userEvent.setup()
    render(
      <LocalLoginGate transitionMs={0}>
        <div data-testid="experience">experience</div>
      </LocalLoginGate>,
    )

    expect(screen.queryByTestId('experience')).not.toBeInTheDocument()
    expect(screen.getByLabelText<HTMLInputElement>('本地邮箱').value).toMatch(
      /@local\.agent1$/,
    )
    expect(window.localStorage.getItem(LOCAL_IDENTITY_STORAGE_KEY)).toBeNull()

    await user.click(screen.getByRole('button', { name: /登录并进入/ }))

    await waitFor(() => expect(screen.getByTestId('experience')).toBeInTheDocument())
    const stored = JSON.parse(window.localStorage.getItem(LOCAL_IDENTITY_STORAGE_KEY) ?? '{}')
    expect(stored.email).toMatch(/@local\.agent1$/)
    expect(stored.password).toHaveLength(24)
  })

  it('restores an existing identity without showing the gate again', async () => {
    const user = userEvent.setup()
    const first = render(
      <LocalLoginGate transitionMs={0}>
        <div data-testid="experience">experience</div>
      </LocalLoginGate>,
    )
    await user.click(screen.getByRole('button', { name: /登录并进入/ }))
    await waitFor(() => expect(screen.getByTestId('experience')).toBeInTheDocument())
    const storedIdentity = window.localStorage.getItem(LOCAL_IDENTITY_STORAGE_KEY)
    first.unmount()

    render(
      <LocalLoginGate transitionMs={0}>
        <div data-testid="restored-experience">experience</div>
      </LocalLoginGate>,
    )

    expect(screen.getByTestId('restored-experience')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /登录并进入/ })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(LOCAL_IDENTITY_STORAGE_KEY)).toBe(storedIdentity)
  })
})
