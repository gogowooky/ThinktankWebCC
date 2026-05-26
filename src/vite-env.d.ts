/// <reference types="vite/client" />

interface Window {
  __THINKTANK_MODE__?: 'pwa' | 'local'
  __THINKTANK_LOCAL_API__?: string
  __runTests?: () => void
}
