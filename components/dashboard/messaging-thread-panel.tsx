'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from '@/components/ui/message-scroller'
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatMessageTime,
  getMessageSenderLabel,
  getSenderInitials,
  isOutgoingMessage,
  MESSAGING_BODY_MAX_LENGTH,
  MESSAGING_POLL_INTERVAL_MS,
  type MessagingMessage,
  type MessagingPerspective,
} from '@/lib/messaging'
import { toast } from 'sonner'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

type ThreadResult =
  | { success: true; messages: MessagingMessage[] }
  | { success: false; error: string }

type SendResult =
  | { success: true; message: MessagingMessage }
  | { success: false; error: string }

interface MessagingThreadPanelProps {
  perspective: MessagingPerspective
  clientName?: string
  companyName?: string
  title?: string
  subtitle?: string
  emptyHint?: string
  className?: string
  initialMessages?: MessagingMessage[]
  loadMessages: () => Promise<ThreadResult>
  sendMessage: (body: string) => Promise<SendResult>
}

export function MessagingThreadPanel({
  perspective,
  clientName,
  companyName,
  title,
  subtitle,
  emptyHint = 'Send a message to start the conversation.',
  className,
  initialMessages,
  loadMessages,
  sendMessage,
}: MessagingThreadPanelProps) {
  const [messages, setMessages] = useState<MessagingMessage[]>(initialMessages ?? [])
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(initialMessages === undefined)
  const [isSending, setIsSending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const refreshMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true)
      }

      const result = await loadMessages()

      if (result.success) {
        setMessages(result.messages)
        setLoadError(null)
      } else if (!options?.silent) {
        setLoadError(result.error || 'Failed to load messages')
      }

      if (!options?.silent) {
        setIsLoading(false)
      }
    },
    [loadMessages]
  )

  useEffect(() => {
    if (initialMessages !== undefined) return
    void refreshMessages()
  }, [refreshMessages, initialMessages])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshMessages({ silent: true })
    }, MESSAGING_POLL_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [refreshMessages])

  const handleSend = async () => {
    const body = draft.trim()
    if (!body || isSending) return

    setIsSending(true)

    const result = await sendMessage(body)

    if (result.success) {
      setDraft('')
      setMessages((current) => {
        if (current.some((message) => message.id === result.message.id)) {
          return current
        }
        return [...current, result.message]
      })
      textareaRef.current?.focus()
    } else {
      toast.error(result.error || 'Failed to send message')
    }

    setIsSending(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  if (isLoading) {
    return (
      <div className={cn('flex flex-1 min-h-0 flex-col gap-4', className)}>
        {(title || subtitle) && (
          <div className="shrink-0">
            {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
        )}
        <div className="flex flex-1 min-h-0 flex-col gap-3">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="ml-auto h-16 w-1/2" />
          <Skeleton className="h-16 w-3/5" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={cn('flex flex-1 min-h-0 flex-col items-center justify-center text-center', className)}>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <button
          type="button"
          className="mt-3 text-sm font-medium text-primary hover:underline"
          onClick={() => void refreshMessages()}
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-1 min-h-0 flex-col gap-4', className)}>
      {(title || subtitle) && (
        <div className="shrink-0">
          {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      )}

      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="flex-1 min-h-[320px] rounded-lg border bg-muted/20">
          <MessageScrollerViewport aria-label="Message history">
            <MessageScrollerContent className="gap-4 p-4">
              {messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground max-w-sm">{emptyHint}</p>
                </div>
              ) : (
                <MessageGroup className="gap-4">
                  {messages.map((message, index) => {
                    const isOutgoing = isOutgoingMessage(message, perspective)
                    const isLast = index === messages.length - 1
                    const senderLabel = getMessageSenderLabel(message, perspective, {
                      clientName,
                      companyName,
                    })

                    return (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={isLast}
                      >
                        <Message align={isOutgoing ? 'end' : 'start'}>
                          <MessageAvatar>
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-[0.625rem] font-medium">
                                {getSenderInitials(senderLabel)}
                              </AvatarFallback>
                            </Avatar>
                          </MessageAvatar>
                          <MessageContent>
                            <MessageHeader>{senderLabel}</MessageHeader>
                            <Bubble
                              variant={isOutgoing ? 'default' : 'tinted'}
                              align={isOutgoing ? 'end' : 'start'}
                            >
                              <BubbleContent className="whitespace-pre-wrap">
                                {message.body}
                              </BubbleContent>
                            </Bubble>
                            <MessageFooter>{formatMessageTime(message.created_at)}</MessageFooter>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )
                  })}
                </MessageGroup>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
          <form
            className="border-t bg-background p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSend()
            }}
          >
            <InputGroup className="h-auto min-h-12 items-end rounded-lg">
              <InputGroupTextarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write a message..."
                rows={2}
                maxLength={MESSAGING_BODY_MAX_LENGTH}
                disabled={isSending}
                aria-label="Message input"
              />
              <InputGroupAddon align="block-end" className="pb-2">
                <InputGroupButton
                  type="submit"
                  size="icon-sm"
                  disabled={!draft.trim() || isSending}
                  aria-label="Send message"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  )
}