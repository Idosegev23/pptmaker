import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

// GET - Get single document
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    
    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify ownership (skip in dev mode)
    if (!isDevMode && document.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ document })
  } catch (error) {
    console.error('Get document error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update document data
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    
    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    // Get existing document
    const { data: document, error: getError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (getError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify ownership (skip in dev mode)
    if (!isDevMode && document.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get updates from request body
    const updates = await request.json()
    
    // Merge updates with existing data
    const existingData = document.data as Record<string, unknown> || {}
    const mergedData = { ...existingData, ...updates }
    
    // Update document
    const { error: updateError } = await supabase
      .from('documents')
      .update({ 
        data: mergedData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      console.error('Update document error:', updateError)
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Document updated successfully' 
    })
  } catch (error) {
    console.error('Patch document error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    
    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    // Get existing document
    const { data: document, error: getError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (getError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify ownership (skip in dev mode)
    if (!isDevMode && document.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete document
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Delete document error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Document deleted successfully' 
    })
  } catch (error) {
    console.error('Delete document error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

