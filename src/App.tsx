import { useEffect } from 'react'
import { TTApplication } from './views/TTApplication'
import { AppLayout } from './components/Layout/AppLayout'

function App() {
  useEffect(() => {
    const app = TTApplication.Instance
    app.Initialize()
  }, [])

  return <AppLayout />
}

export default App
