import { useLangStore } from '@/store/langStore'
import { strings } from '@/lib/strings.ts'

export function useStrings() {
  const lang = useLangStore((s) => s.lang)
  return strings[lang]
}
