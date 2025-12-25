// Development mode utilities for bypassing authentication

export const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true'

export const DEV_USER = {
  id: 'dev-user-id',
  email: 'dev@docmaker.local',
  full_name: 'מפתח מקומי',
  avatar_url: null,
  role: 'admin' as const,
  google_drive_folder_id: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

// Mock user object that mimics Supabase Auth User structure
export const DEV_AUTH_USER = {
  id: DEV_USER.id,
  email: DEV_USER.email,
  app_metadata: {},
  user_metadata: {
    full_name: DEV_USER.full_name,
  },
  aud: 'authenticated',
  created_at: DEV_USER.created_at,
}


