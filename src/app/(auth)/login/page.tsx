'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

function LoginContent() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Validate
    if (!email || !password) {
      setError('נא למלא את כל השדות')
      setIsLoading(false)
      return
    }

    if (isSignUp && password !== confirmPassword) {
      setError('הסיסמאות לא תואמות')
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError('הסיסמא חייבת להיות לפחות 6 תווים')
      setIsLoading(false)
      return
    }

    try {
      const supabase = createClient()
      
      if (isSignUp) {
        // Sign Up - without email confirmation
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: undefined, // No email confirmation
          },
        })

        if (signUpError) {
          if (signUpError.message.includes('already registered')) {
            setError('המייל כבר רשום במערכת')
          } else {
            throw signUpError
          }
          setIsLoading(false)
          return
        }

        // Auto sign in after signup
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          throw signInError
        }

        router.push(redirectTo)
      } else {
        // Sign In
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          if (signInError.message.includes('Invalid login credentials')) {
            setError('מייל או סיסמא שגויים')
          } else {
            throw signInError
          }
          setIsLoading(false)
          return
        }

        router.push(redirectTo)
      }
    } catch (err) {
      console.error('Auth error:', err)
      setError('אירעה שגיאה. נסה שוב.')
      setIsLoading(false)
    }
  }

  return (
    <div className="relative z-10 w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-12">
        <Link href="/" className="inline-block">
          <Image 
            src="/logo.png" 
            alt="Leaders" 
            width={140} 
            height={47}
            className="mx-auto mb-4"
          />
          <h1 className="text-4xl font-heebo font-black text-white tracking-tight">
            Doc<span className="text-[#e94560]">Maker</span>
          </h1>
        </Link>
        <div className="h-0.5 w-16 bg-white mx-auto mt-4" />
      </div>

      <div className="border border-white/10 bg-[#1a1a1a] p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">
            {isSignUp ? 'הרשמה' : 'התחברות'}
          </h2>
          <p className="text-white/50 text-sm">
            {isSignUp ? 'צור חשבון חדש כדי להתחיל' : 'התחבר כדי להמשיך'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 border border-red-500/30 bg-red-500/10 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-white/70 text-sm mb-2">מייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-black/50 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 transition-colors"
              placeholder="your@email.com"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-2">סיסמא</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-black/50 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 transition-colors"
              placeholder="••••••••"
              disabled={isLoading}
            />
          </div>

          {isSignUp && (
            <div>
              <label className="block text-white/70 text-sm mb-2">אימות סיסמא</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black/50 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 transition-colors"
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-8 py-4 bg-white text-black font-bold text-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                מעבד...
              </span>
            ) : (
              isSignUp ? 'הרשמה' : 'התחבר'
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError(null)
            }}
            className="text-white/50 text-sm hover:text-white transition-colors"
          >
            {isSignUp ? 'יש לך חשבון? התחבר' : 'אין לך חשבון? הירשם'}
          </button>
        </div>
      </div>

      <p className="text-center text-white/30 text-sm mt-8">
        <Link href="/" className="hover:text-white transition-colors">
          חזרה לעמוד הבית
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[#0f0f0f] relative">
      {/* Grid Background */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #ffffff 1px, transparent 1px),
            linear-gradient(to bottom, #ffffff 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }}
      />
      
      {/* Accent Lines */}
      <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      <div className="absolute bottom-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      <Suspense fallback={
        <div className="flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-white/30 border-t-white rounded-full" />
        </div>
      }>
        <LoginContent />
      </Suspense>
    </div>
  )
}
