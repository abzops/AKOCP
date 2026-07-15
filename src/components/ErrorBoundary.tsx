import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { BrandMark, Button } from './ui'

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AK OCP render error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="fatal-error">
        <BrandMark withName size="large" />
        <AlertTriangle size={32} />
        <h1>Something interrupted the workspace</h1>
        <p>{this.state.message || 'An unexpected error occurred.'}</p>
        <Button onClick={() => window.location.reload()}>Reload application</Button>
      </main>
    )
  }
}
