import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateId } from '@/lib/utils'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

// POST - Create new document
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    const body = await request.json()
    const { type, title, data } = body

    if (!type || !title || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const documentId = generateId()

    const { error: insertError } = await supabase.from('documents').insert({
      id: documentId,
      user_id: isDevMode ? null : userId,
      type: type as 'quote' | 'deck',
      title,
      data,
      status: 'draft',
    })

    if (insertError) {
      console.error('Failed to create document:', insertError)
      return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      id: documentId,
      message: 'Document created successfully' 
    })
  } catch (error) {
    console.error('Documents API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET - List documents
export async function GET() {
  try {
    const supabase = await createClient()
    
    // In dev mode, get all documents (no user filter)
    if (isDevMode) {
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Failed to fetch documents:', error)
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
      }

      return NextResponse.json({ documents })
    }

    // Normal mode - filter by user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Failed to fetch documents:', error)
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Documents API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


