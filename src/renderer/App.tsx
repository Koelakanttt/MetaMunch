import { useState } from 'react'

export default function App() {
  const [reply, setReply] = useState('')

  async function ping(): Promise<void> {
    const res = await window.api.invoke('app:ping', { message: 'hi' })
    setReply(res.reply)
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-slate-100">
      <h1 className="text-3xl font-semibold">MetaMunch</h1>
      <button
        type="button"
        className="mt-6 rounded bg-slate-700 px-4 py-2 hover:bg-slate-600"
        onClick={() => {
          void ping()
        }}
      >
        Ping
      </button>
      <p className="mt-6">{reply}</p>
    </div>
  )
}
