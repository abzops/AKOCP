import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CopilotAnswer } from './CopilotAnswer'
afterEach(cleanup)
describe('readable copilot answers', () => {
  it('renders emphasis, lists and tables without showing markdown punctuation', () => {
    render(<CopilotAnswer content={'**Approved expenses: ₹350**\n\n- October 2026\n\n| Category | Amount |\n| --- | --- |\n| Equipment | ₹350 |'}/>)
    expect(screen.getByText('Approved expenses: ₹350').tagName).toBe('STRONG')
    expect(screen.getByRole('listitem')).toHaveTextContent('October 2026')
    expect(screen.getByRole('table')).toHaveTextContent('Equipment')
  })
  it('does not load model-supplied images or execute HTML/javascript links', () => {
    const view = render(<CopilotAnswer content={'![tracker](https://example.test/pixel.png)\n<script>alert(1)</script>\n[unsafe](javascript:alert%281%29)'}/>)
    expect(view.container.querySelector('img')).toBeNull()
    expect(view.container.querySelector('script')).toBeNull()
    expect(view.container.querySelector('a')?.getAttribute('href')).not.toMatch(/^javascript:/)
  })
})
