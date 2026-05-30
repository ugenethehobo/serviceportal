'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface Message {
  id: string
  content: string
  is_from_client: boolean
  created_at: string
  client_id: string
  clients?: { name: string } | null
  read?: boolean
  sender_id?: string
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select(`
        *,
        clients (name)
      `)
      .order('created_at', { ascending: true })
      .limit(100)

    if (data) setMessages(data as any)
    setLoading(false)
  }

  useEffect(() => {
    loadMessages()

    const interval = setInterval(() => {
      loadMessages()
    }, 4000)

    return () => clearInterval(interval)
  }, [])

  const sendReply = async () => {
    if (!replyText.trim() || !selectedClientId) return

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('messages').insert([{
      client_id: selectedClientId,
      content: replyText.trim(),
      is_from_client: false,
      sender_id: user?.id
    }])

    setReplyText('')
    await loadMessages()
  }

  const groupedMessages = messages.reduce((acc, msg) => {
    const clientName = msg.clients?.name || 'Unknown Client'
    if (!acc[clientName]) acc[clientName] = []
    acc[clientName].push(msg)
    return acc
  }, {} as Record<string, Message[]>)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Messages</h1>
        <p className="text-muted-foreground mt-2 leading-snug">Communicate with your clients</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversations List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(groupedMessages).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(groupedMessages).map(([clientName, clientMessages]) => (
                  <button
                    key={clientName}
                    onClick={() => setSelectedClientId(clientMessages[0].client_id)}
                    className={`w-full text-left p-4 rounded-xl hover:bg-muted transition-colors border ${
                      selectedClientId === clientMessages[0].client_id
                        ? 'bg-primary/10 border-primary'
                        : 'border-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-medium">{clientName}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(clientMessages[clientMessages.length - 1]?.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-1">
                      {clientMessages[clientMessages.length - 1]?.content}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No messages yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversation View */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedClientId ? (
              <>
                <div className="max-h-[400px] sm:max-h-[500px] overflow-y-auto mb-6 space-y-4 pr-2 border rounded-xl p-4">
                  {groupedMessages[Object.keys(groupedMessages).find(name =>
                    groupedMessages[name][0].client_id === selectedClientId
                  ) || '']?.map((msg, index) => (
                    <div key={index} className={`flex ${msg.is_from_client ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] px-5 py-3 rounded-3xl text-sm ${
                        msg.is_from_client
                          ? 'bg-muted'
                          : 'bg-primary text-primary-foreground'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                    placeholder="Type your reply..."
                    className="flex-1"
                  />
                  <Button onClick={sendReply} disabled={!replyText.trim()} className="w-full sm:w-auto">
                    Send
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-64 sm:h-96 text-muted-foreground">
                Select a conversation to view messages
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
