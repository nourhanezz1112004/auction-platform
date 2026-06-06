import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Lang = 'en' | 'ar'

interface LangState {
  lang: Lang
  toggleLang: () => void
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: 'en',
      toggleLang: () => set((state) => ({ lang: state.lang === 'en' ? 'ar' : 'en' })),
      setLang: (lang) => set({ lang }),
    }),
    {
      name: 'lang-storage',
    }
  )
)
