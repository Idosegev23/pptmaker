import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { formatDate, documentTypeLabels, statusLabels } from '@/lib/utils'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'

export default async function DashboardPage() {
  let user: { id: string } | null = null
  let profile: { full_name?: string | null } | null = null
  let documents: Array<{
    id: string
    title: string
    type: 'quote' | 'deck'
    status: string
    created_at: string
  }> | null = null

  if (isDevMode) {
    // Use mock data in dev mode
    profile = { full_name: DEV_USER.full_name }
    documents = []
  } else {
    const supabase = await createClient()
    
    const { data: { user: authUser } } = await supabase.auth.getUser()
    user = authUser
    
    // Get user's recent documents
    const { data: docs } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(5)
    
    documents = docs

    // Get user profile
    const { data: prof } = await supabase
      .from('users')
      .select('*')
      .eq('id', user?.id)
      .single()
    
    profile = prof
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-heebo font-bold mb-2">
          שלום, {profile?.full_name?.split(' ')[0] || 'משתמש'}
        </h1>
        <p className="text-muted-foreground">
          מה תרצה ליצור היום?
        </p>
      </div>

      {/* Smart Proposal from Documents - Featured */}
      <Link href="/create-proposal" className="group block mb-4">
        <Card className="p-6 bg-gradient-to-l from-indigo-900 to-purple-800 border-0 text-white hover:from-indigo-800 hover:to-purple-700 transition-all duration-300 group-hover:-translate-y-1">
          <div className="flex items-center gap-6">
            <div className="p-4 rounded-2xl bg-white/10">
              <DocUploadIcon className="w-10 h-10" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold">הצעה מבוססת מסמכים</h3>
                <span className="px-2 py-0.5 text-xs font-medium bg-white/20 rounded-full">חדש</span>
              </div>
              <p className="text-white/70 text-sm">
                העלה בריף לקוח ומסמך התנעה, המערכת תחלץ את המידע ותבנה הצעה שלב אחר שלב עם wizard חכם
              </p>
            </div>
            <span className="text-white/80 font-medium group-hover:text-white">
              התחל &larr;
            </span>
          </div>
        </Card>
      </Link>

      {/* Auto Proposal - Secondary */}
      <Link href="/create-auto" className="group block mb-8">
        <Card className="p-6 bg-gradient-to-l from-gray-900 to-gray-800 border-0 text-white hover:from-gray-800 hover:to-gray-700 transition-all duration-300 group-hover:-translate-y-1">
          <div className="flex items-center gap-6">
            <div className="p-4 rounded-2xl bg-white/10">
              <AutoIcon className="w-10 h-10" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold">הצעת מחיר אוטומטית</h3>
                <span className="px-2 py-0.5 text-xs font-medium bg-white/20 rounded-full">AI</span>
              </div>
              <p className="text-white/70 text-sm">
                הזן שם מותג וכתובת אתר, והמערכת תבצע מחקר, תחלץ צבעים, ותיצור הצעה מותאמת אישית
              </p>
            </div>
            <span className="text-white/80 font-medium group-hover:text-white">
              התחל &larr;
            </span>
          </div>
        </Card>
      </Link>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6 mb-12">
        <Link href="/create?type=quote" className="group">
          <Card className="h-full p-6 border-2 border-transparent hover:border-accent transition-all duration-300 group-hover:-translate-y-1">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-accent/10 text-accent">
                <QuoteIcon className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">הצעת מחיר ידנית</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  מלא את הפרטים בעצמך שלב אחר שלב
                </p>
                <span className="text-accent font-medium text-sm group-hover:underline">
                  התחל עכשיו &larr;
                </span>
              </div>
            </div>
          </Card>
        </Link>

        <div className="relative cursor-not-allowed">
          <Card className="h-full p-6 border-2 border-transparent opacity-50">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-gray-200 text-gray-400">
                <DeckIcon className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-400">מצגת קריאטיב</h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-800 text-white rounded">בבנייה</span>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  צור מצגת מרשימה בפורמט 16:9, עם תמונות AI ועיצוב מקצועי
                </p>
                <span className="text-gray-400 font-medium text-sm">
                  בקרוב...
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Recent Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>מסמכים אחרונים</CardTitle>
          <Link href="/documents">
            <Button variant="ghost" size="sm">
              הצג הכל
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {documents && documents.length > 0 ? (
            <div className="space-y-3">
              {documents.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/preview/${doc.id}`}
                  className="flex items-center justify-between p-4 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${doc.type === 'quote' ? 'bg-accent/10 text-accent' : 'bg-brand-gold/10 text-brand-gold'}`}>
                      {doc.type === 'quote' ? (
                        <QuoteIcon className="w-5 h-5" />
                      ) : (
                        <DeckIcon className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {documentTypeLabels[doc.type]} &bull; {formatDate(doc.created_at)}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    doc.status === 'generated' 
                      ? 'bg-green-100 text-green-700'
                      : doc.status === 'draft'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {statusLabels[doc.status as keyof typeof statusLabels]}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                <DocumentEmptyIcon className="w-16 h-16 mx-auto opacity-50" />
              </div>
              <p className="text-muted-foreground mb-4">עדיין לא יצרת מסמכים</p>
              <Link href="/create">
                <Button variant="accent">צור מסמך ראשון</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Icons
function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function DeckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
    </svg>
  )
}

function DocumentEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function DocUploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function AutoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}


