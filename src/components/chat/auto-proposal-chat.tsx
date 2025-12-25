'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BrandResearch } from '@/lib/gemini/brand-research'
import type { BrandColors } from '@/lib/gemini/color-extractor'
import type { ProposalContent } from '@/lib/openai/proposal-writer'

// Chat states
type ChatState = 
  | 'initial'           // Waiting for brand name
  | 'waiting_for_url'   // Waiting for website URL
  | 'scraping'          // Scraping website
  | 'researching'       // AI research in progress
  | 'confirm_research'  // Show research results for confirmation
  | 'waiting_for_budget' // Waiting for budget input
  | 'waiting_for_goals' // Waiting for goals selection
  | 'generating'        // Generating proposal content
  | 'complete'          // Ready to generate PDF

interface Message {
  id: string
  type: 'bot' | 'user' | 'loading' | 'research_summary'
  content: string
  data?: Record<string, unknown>
}

interface AutoProposalChatProps {
  onComplete: (data: {
    brandResearch: BrandResearch
    brandColors: BrandColors
    proposalContent: ProposalContent
    userInputs: {
      brandName: string
      websiteUrl: string
      budget: number
      currency: string
      goals: string[]
    }
  }) => void
}

const GOAL_OPTIONS = [
  'מודעות',
  'חינוך שוק',
  'נוכחות דיגיטלית',
  'נחשקות ו-FOMO',
  'הנעה למכר',
  'השקת מוצר',
  'חיזוק נאמנות',
]

export function AutoProposalChat({ onComplete }: AutoProposalChatProps) {
  const [state, setState] = useState<ChatState>('initial')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  // Collected data
  const [brandName, setBrandName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [brandResearch, setBrandResearch] = useState<BrandResearch | null>(null)
  const [brandColors, setBrandColors] = useState<BrandColors | null>(null)
  const [scrapedData, setScrapedData] = useState<{
    logoUrl?: string
    screenshot?: string
    heroImages?: string[]
    productImages?: string[]
    lifestyleImages?: string[]
  } | null>(null)
  const [budget, setBudget] = useState(0)
  const [selectedGoals, setSelectedGoals] = useState<string[]>([])
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  // Focus input
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isLoading, state])
  
  // Add message helper
  const addMessage = useCallback((type: Message['type'], content: string, data?: Record<string, unknown>) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setMessages(prev => [...prev, { id, type, content, data }])
  }, [])
  
  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      addMessage('bot', 'היי! אני אעזור לך ליצור הצעת מחיר מקצועית. מה שם המותג שאתה רוצה ליצור לו הצעה?')
    }
  }, [messages.length, addMessage])
  
  // Handle input submission
  const handleSubmit = async () => {
    if (!inputValue.trim() || isLoading) return
    
    const value = inputValue.trim()
    setInputValue('')
    
    switch (state) {
      case 'initial':
        // User entered brand name
        addMessage('user', value)
        setBrandName(value)
        setState('waiting_for_url')
        setTimeout(() => {
          addMessage('bot', `מעולה! מה כתובת האתר של ${value}?`)
        }, 500)
        break
        
      case 'waiting_for_url':
        // User entered URL
        addMessage('user', value)
        setWebsiteUrl(value)
        await startResearch(value)
        break
        
      case 'waiting_for_budget':
        // User entered budget
        const budgetNum = parseInt(value.replace(/[^\d]/g, ''))
        if (isNaN(budgetNum) || budgetNum <= 0) {
          addMessage('bot', 'אנא הזן מספר תקף (למשל: 50000)')
          return
        }
        addMessage('user', `₪${budgetNum.toLocaleString()}`)
        setBudget(budgetNum)
        setState('waiting_for_goals')
        setTimeout(() => {
          addMessage('bot', 'מה המטרות העיקריות של הקמפיין? (בחר עד 5)')
        }, 500)
        break
    }
  }
  
  // Start research process
  const startResearch = async (url: string) => {
    setIsLoading(true)
    setState('scraping')
    
    addMessage('loading', 'סורק את האתר (צילום מסך, לוגו, תמונות, צבעים)...')
    
    try {
      // Call enhanced scrape API
      const scrapeRes = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, enhanced: true }),
      })
      
      if (!scrapeRes.ok) throw new Error('Failed to scrape website')
      const scrapeResult = await scrapeRes.json()
      const scraped = scrapeResult.data
      
      // Save scraped visual assets
      setScrapedData({
        logoUrl: scraped.logoUrl,
        screenshot: scraped.screenshot,
        heroImages: scraped.heroImages,
        productImages: scraped.productImages,
        lifestyleImages: scraped.lifestyleImages,
      })
      
      console.log('[Chat] Scraped assets:', {
        logo: scraped.logoUrl,
        screenshot: scraped.screenshot ? 'Yes' : 'No',
        heroImages: scraped.heroImages?.length || 0,
        colors: scraped.colorPalette,
      })
      
      // Update message
      setMessages(prev => prev.filter(m => m.type !== 'loading'))
      addMessage('loading', 'מבצע מחקר מותג מעמיק...')
      setState('researching')
      
      // Call research API with scraped data
      const researchRes = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName,
          websiteData: scraped,
        }),
      })
      
      if (!researchRes.ok) throw new Error('Failed to research brand')
      const researchData = await researchRes.json()
      
      // Store results
      setBrandResearch(researchData.research)
      setBrandColors(researchData.colors)
      
      // Remove loading message
      setMessages(prev => prev.filter(m => m.type !== 'loading'))
      
      // Show research summary with scraped data
      addMessage('research_summary', 'הנה מה שמצאתי:', {
        research: researchData.research,
        colors: researchData.colors,
        scraped: {
          logoUrl: scraped.logoUrl,
          screenshot: scraped.screenshot,
          heroImagesCount: scraped.heroImages?.length || 0,
        },
      })
      
      setState('confirm_research')
      setTimeout(() => {
        addMessage('bot', 'האם המידע הזה נכון? (כן/לא)')
      }, 800)
      
    } catch (error) {
      console.error('Research error:', error)
      setMessages(prev => prev.filter(m => m.type !== 'loading'))
      addMessage('bot', 'משהו השתבש. בוא ננסה שוב - מה כתובת האתר?')
      setState('waiting_for_url')
    } finally {
      setIsLoading(false)
    }
  }
  
  // Confirm research
  const confirmResearch = async (confirmed: boolean) => {
    if (confirmed) {
      addMessage('user', 'כן, נכון')
      setState('waiting_for_budget')
      setTimeout(() => {
        addMessage('bot', 'מעולה! מה התקציב לקמפיין? (בשקלים)')
      }, 500)
    } else {
      addMessage('user', 'לא, לא מדויק')
      addMessage('bot', 'אוקיי, בוא ננסה עם כתובת אתר אחרת או יותר ספציפית.')
      setState('waiting_for_url')
    }
  }
  
  // Toggle goal selection
  const toggleGoal = (goal: string) => {
    setSelectedGoals(prev => {
      if (prev.includes(goal)) {
        return prev.filter(g => g !== goal)
      }
      if (prev.length >= 5) return prev
      return [...prev, goal]
    })
  }
  
  // Generate proposal
  const generateProposal = async () => {
    if (selectedGoals.length === 0) {
      addMessage('bot', 'בחר לפחות מטרה אחת')
      return
    }
    
    addMessage('user', selectedGoals.join(', '))
    setIsLoading(true)
    setState('generating')
    addMessage('loading', 'יוצר הצעת מחיר מותאמת (תוכן, משפיענים, תמונות)...')
    
    try {
      const res = await fetch('/api/generate-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandResearch,
          brandColors,
          budget,
          goals: selectedGoals,
          scrapedData,
        }),
      })
      
      if (!res.ok) throw new Error('Failed to generate proposal')
      const data = await res.json()
      
      setMessages(prev => prev.filter(m => m.type !== 'loading'))
      
      // Log what we generated
      console.log('[Chat] Generated proposal:', {
        contentKeys: Object.keys(data.content || {}),
        influencerRecs: data.influencerStrategy?.recommendations?.length || 0,
        imagesGenerated: Object.keys(data.images || {}).filter(k => data.images[k]).length,
      })
      
      addMessage('bot', `הצעת המחיר מוכנה! כוללת ${data.influencerStrategy?.recommendations?.length || 0} המלצות משפיענים.`)
      setState('complete')
      
      // Call onComplete with all data including influencer research, scraped assets, and real influencers
      onComplete({
        brandResearch: {
          ...brandResearch!,
          // Add scraped assets for template
          _scrapedAssets: {
            ...scrapedData,
            ...data.scrapedAssets,
          },
        } as BrandResearch,
        brandColors: brandColors!,
        proposalContent: {
          ...data.content,
          _influencerResearch: data.influencerStrategy,
          _scrapedInfluencers: data.scrapedInfluencers,
          _images: data.images,
          _brandAssets: data.brandAssets,
        },
        userInputs: {
          brandName,
          websiteUrl,
          budget,
          currency: '₪',
          goals: selectedGoals,
        },
      })
      
    } catch (error) {
      console.error('Generate error:', error)
      setMessages(prev => prev.filter(m => m.type !== 'loading'))
      addMessage('bot', 'משהו השתבש ביצירת ההצעה. ננסה שוב?')
      setState('waiting_for_goals')
    } finally {
      setIsLoading(false)
    }
  }
  
  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }
  
  // Render research summary - Enhanced
  const renderResearchSummary = (data: Record<string, unknown>) => {
    const research = data.research as BrandResearch
    const colors = data.colors as BrandColors
    
    // Helper to get competitor names
    const getCompetitorNames = () => {
      if (!research.competitors || research.competitors.length === 0) return null
      if (typeof research.competitors[0] === 'string') {
        return (research.competitors as unknown as string[]).slice(0, 3).join(', ')
      }
      return research.competitors.slice(0, 3).map(c => c.name).join(', ')
    }
    
    // Get primary audience - handle both old and new format
    const targetDemo = research.targetDemographics as { 
      primaryAudience?: { gender?: string; ageRange?: string };
      gender?: string;
      ageRange?: string;
    } | undefined
    const primaryAudience = targetDemo?.primaryAudience
    const audienceGender = primaryAudience?.gender || (targetDemo as { gender?: string })?.gender || 'לא ידוע'
    const audienceAge = primaryAudience?.ageRange || (targetDemo as { ageRange?: string })?.ageRange || 'לא ידוע'
    
    return (
      <div className="bg-gray-50 rounded-xl p-5 space-y-5 text-sm border border-gray-200">
        {/* Brand Header */}
        <div className="flex items-start gap-4">
          {colors && (
            <div 
              className="w-12 h-12 rounded-xl flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent || colors.primary})` }}
            />
          )}
          <div className="flex-1">
            <div className="font-bold text-lg text-gray-900">{research.brandName}</div>
            <div className="text-gray-500">{research.industry}{research.subIndustry ? ` / ${research.subIndustry}` : ''}</div>
            {research.tagline && <div className="text-gray-600 italic mt-1">"{research.tagline}"</div>}
          </div>
        </div>
        
        {/* Company Description */}
        {research.companyDescription && (
          <div>
            <div className="font-semibold text-gray-900 mb-2">על המותג</div>
            <div className="text-gray-600 leading-relaxed line-clamp-4">
              {research.companyDescription.slice(0, 400)}...
            </div>
          </div>
        )}
        
        {/* Key Info Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="text-xs text-gray-400 mb-1">קהל יעד</div>
            <div className="font-medium text-gray-900">{audienceGender}</div>
            <div className="text-gray-600">{audienceAge}</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="text-xs text-gray-400 mb-1">טון מותג</div>
            <div className="font-medium text-gray-900">{research.toneOfVoice}</div>
          </div>
        </div>
        
        {/* Brand Values */}
        {research.brandValues && research.brandValues.length > 0 && (
          <div>
            <div className="font-semibold text-gray-900 mb-2">ערכי מותג</div>
            <div className="flex flex-wrap gap-2">
              {research.brandValues.slice(0, 5).map((value, i) => (
                <span key={i} className="px-3 py-1 bg-white border border-gray-200 rounded-full text-gray-600 text-xs">
                  {value}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Colors */}
        {colors && (
          <div>
            <div className="font-semibold text-gray-900 mb-2">צבעי המותג</div>
            <div className="flex gap-2 items-center">
              {[colors.primary, colors.secondary, colors.accent].filter(Boolean).map((color, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div
                    className="w-8 h-8 rounded-lg border border-gray-200 shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-gray-400">{color}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Competitors */}
        {getCompetitorNames() && (
          <div>
            <div className="font-semibold text-gray-900 mb-1">מתחרים עיקריים</div>
            <div className="text-gray-600">{getCompetitorNames()}</div>
          </div>
        )}
        
        {/* Unique Selling Points */}
        {research.uniqueSellingPoints && research.uniqueSellingPoints.length > 0 && (
          <div>
            <div className="font-semibold text-gray-900 mb-2">יתרונות ייחודיים</div>
            <ul className="space-y-1">
              {research.uniqueSellingPoints.slice(0, 3).map((usp, i) => (
                <li key={i} className="text-gray-600 flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#10003;</span>
                  <span>{usp}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Recommended Goals */}
        {research.recommendedGoals && research.recommendedGoals.length > 0 && (
          <div>
            <div className="font-semibold text-gray-900 mb-2">מטרות מומלצות</div>
            <div className="flex flex-wrap gap-2">
              {research.recommendedGoals.slice(0, 4).map((goal, i) => (
                <span key={i} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs">
                  {typeof goal === 'string' ? goal.split(' - ')[0] : goal}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Confidence & Sources */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              research.confidence === 'high' ? 'bg-green-500' : 
              research.confidence === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="text-xs text-gray-400">
              רמת ביטחון: {research.confidence === 'high' ? 'גבוהה' : research.confidence === 'medium' ? 'בינונית' : 'נמוכה'}
            </span>
          </div>
          {research.sources && research.sources.length > 0 && (
            <span className="text-xs text-gray-400">{research.sources.length} מקורות</span>
          )}
        </div>
      </div>
    )
  }
  
  // Render input area
  const renderInput = () => {
    if (isLoading) return null
    
    switch (state) {
      case 'confirm_research':
        return (
          <div className="flex gap-3">
            <Button onClick={() => confirmResearch(true)} className="flex-1 bg-gray-900 hover:bg-gray-800">
              כן, נכון
            </Button>
            <Button onClick={() => confirmResearch(false)} variant="outline" className="flex-1">
              לא, לא מדויק
            </Button>
          </div>
        )
        
      case 'waiting_for_goals':
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map(goal => (
                <button
                  key={goal}
                  onClick={() => toggleGoal(goal)}
                  className={`px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                    selectedGoals.includes(goal)
                      ? 'bg-gray-900 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {goal}
                </button>
              ))}
            </div>
            {selectedGoals.length > 0 && (
              <Button onClick={generateProposal} className="w-full bg-gray-900 hover:bg-gray-800">
                המשך עם {selectedGoals.length} מטרות
              </Button>
            )}
          </div>
        )
        
      case 'complete':
        return null
        
      default:
        return (
          <div className="flex gap-3">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                state === 'initial' ? 'שם המותג...' :
                state === 'waiting_for_url' ? 'https://...' :
                state === 'waiting_for_budget' ? '50000' :
                'הקלד כאן...'
              }
              className="flex-1 bg-white border-gray-200 placeholder:text-gray-400"
              dir={state === 'waiting_for_url' ? 'ltr' : 'rtl'}
            />
            <Button onClick={handleSubmit} className="bg-gray-900 hover:bg-gray-800 px-6">
              המשך
            </Button>
          </div>
        )
    }
  }
  
  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="bg-white px-6 py-5 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">יצירת הצעת מחיר אוטומטית</h2>
        <p className="text-sm text-gray-500">מחקר מותג + יצירת תוכן מותאם</p>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.type === 'user' ? 'justify-start' : 'justify-end'}`}
          >
            {msg.type === 'loading' ? (
              <div className="bg-gray-100 px-5 py-3 rounded-2xl rounded-bl-md border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-gray-600">{msg.content}</span>
                </div>
              </div>
            ) : msg.type === 'research_summary' ? (
              <div className="max-w-[90%]">
                <div className="text-gray-600 mb-2">{msg.content}</div>
                {msg.data && renderResearchSummary(msg.data)}
              </div>
            ) : (
              <div
                className={`max-w-[85%] px-5 py-3.5 rounded-2xl ${
                  msg.type === 'user'
                    ? 'bg-gray-900 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-900 rounded-bl-md border border-gray-200'
                }`}
              >
                {msg.content}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input area */}
      <div className="p-6 border-t border-gray-100">
        {renderInput()}
      </div>
    </div>
  )
}

