import { memo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Raw HTML and remote images are never rendered from model/database text.
export const CopilotAnswer = memo(function CopilotAnswer({ content }: { content: string }) {
  return <div className="copilot-answer"><Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']}
    components={{ a: ({ href, children }) => <a href={href} target={href?.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">{children}</a>,
      table: ({ children }) => <div className="copilot-table"><table>{children}</table></div> }}>{content}</Markdown></div>
})
