export type LanguageCode = string

export type Language = {
  code: LanguageCode
  label: string
  supportedTargets: LanguageCode[]
}
