import type { Language } from '../../types'

type LanguageSwitcherProps = {
  sourceLanguage: Language
  targetLanguage: Language
  onCycleSource: () => void
  onCycleTarget: () => void
  onSwap: () => void
}

export function LanguageSwitcher({
  sourceLanguage,
  targetLanguage,
  onCycleSource,
  onCycleTarget,
  onSwap,
}: LanguageSwitcherProps) {
  return (
    <div className="language-switcher" aria-label="翻译语言设置">
      <button
        className="language-option interactive-target"
        type="button"
        onClick={onCycleSource}
        aria-label={`切换源语言，当前为${sourceLanguage.label}`}
      >
        <small>From</small>
        <span>{sourceLanguage.label}</span>
        <em>{sourceLanguage.code}</em>
      </button>
      <button
        className="language-swap interactive-target"
        type="button"
        onClick={onSwap}
        aria-label="交换源语言和目标语言"
      >
        <span aria-hidden="true">⇄</span>
      </button>
      <button
        className="language-option interactive-target"
        type="button"
        onClick={onCycleTarget}
        aria-label={`切换目标语言，当前为${targetLanguage.label}`}
      >
        <small>To</small>
        <span>{targetLanguage.label}</span>
        <em>{targetLanguage.code}</em>
      </button>
    </div>
  )
}