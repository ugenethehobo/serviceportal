'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ClientMessaging({ clientId }: { clientId: string }) {
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const supabase = createClient()

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data)
  }

  useEffect(() => {
    loadMessages()

    // Poll for new messages every 4 seconds
    const interval = setInterval(() => {
      loadMessages()
    }, 4000)

    return () => clearInterval(interval)
  }, [clientId])

  const sendMessage = async () => {
    if (!newMessage.trim()) return

    setSending(true)

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('messages').insert([{
      client_id: clientId,
      content: newMessage.trim(),
      is_from_client: true,
      sender_id: user?.id
    }])

    setNewMessage('')
    await loadMessages()
    setSending(false)
  }

  return (
    <div>
      <div className="max-h-[280px] sm:max-h-80 overflow-y-auto mb-6 space-y-4 pr-2 border rounded-2xl p-4">
        {messages.length > 0 ? (
          messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.is_from_client ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-5 py-3 rounded-3xl text-sm ${msg.is_from_client ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                {msg.content}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center text-gray-500 py-8 text-sm">No messages yet</div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your message..."
          className="flex-1 border border-gray-300 rounded-2xl px-5 py-3 text-sm"
        />
        <button
          onClick={sendMessage}
          disabled={sending || !newMessage.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-8 rounded-2xl text-sm font-medium w-full sm:w-auto min-h-[44px]"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
