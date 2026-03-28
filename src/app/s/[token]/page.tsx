import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import type { Presentation } from '@/types/presentation'
import type { ViewerConfig, PublicPresentationData } from '@/types/share'
import SharedPresentationViewer from '@/components/presentation/SharedPresentationViewer'

interface SharePageProps {
  params: Promise<{ token: string }>
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params

  const supabase = await createServiceClient()

  // Find active share
  const { data: share } = await supabase
    .from('presentation_shares')
    .select('id, document_id, is_active, viewer_config, view_count')
    .eq('share_token', token)
    .eq('is_active', true)
    .single()

  if (!share) notFound()

  // Fetch document
  const { data: doc } = await supabase
    .from('documents')
    .select('data, title')
    .eq('id', share.document_id)
    .single()

  if (!doc) notFound()

  const docData = doc.data as Record<string, unknown>
  const htmlPres = docData._htmlPresentation as { htmlSlides?: string[]; title?: string; brandName?: string } | undefined
  const presentation = docData._presentation as Presentation | undefined

  // HTML-native takes priority
  const isHtmlNative = !!(htmlPres?.htmlSlides?.length)

  if (!isHtmlNative && (!presentation || !presentation.slides?.length)) notFound()

  // Increment view count
  supabase
    .from('presentation_shares')
    .update({
      view_count: (share.view_count || 0) + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq('id', share.id)
    .then(() => {})

  const brandName = (docData.brandName as string) || doc.title || (isHtmlNative ? htmlPres?.brandName : presentation?.title) || ''
  const viewerConfig = share.viewer_config as unknown as ViewerConfig

  // HTML-native share — render iframes directly
  if (isHtmlNative && htmlPres?.htmlSlides) {
    return (
      <html lang="he" dir="rtl">
        <head>
          <meta charSet="UTF-8" />
          <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        </head>
        <body style={{ margin: 0, background: '#0a0a0f', fontFamily: "'Heebo', sans-serif" }}>
          {htmlPres.htmlSlides.map((slideHtml, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: slideHtml }} style={{ marginBottom: 2 }} />
          ))}
        </body>
      </html>
    )
  }

  // AST share — use existing SharedPresentationViewer
  if (!presentation) notFound()

  const publicData: PublicPresentationData = {
    presentation: {
      title: presentation.title,
      designSystem: presentation.designSystem,
      slides: presentation.slides,
    },
    viewerConfig,
    brandName,
    shareId: share.id,
  }

  return (
    <>
      <link
        href={`https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&family=${encodeURIComponent(presentation.designSystem.fonts.heading)}:wght@300;400;500;600;700;800;900&display=swap`}
        rel="stylesheet"
      />
      <SharedPresentationViewer
        data={publicData}
        shareToken={token}
      />
    </>
  )
}
