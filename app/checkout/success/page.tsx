import { Suspense } from 'react'
import CheckoutSuccessClient from './CheckoutSuccessClient'

export default function CheckoutSuccessPage() {
  return (
    <Suspense 
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="text-center text-muted-foreground">
            Loading...
          </div>
        </div>
      }
    >
      <CheckoutSuccessClient />
    </Suspense>
  )
}
