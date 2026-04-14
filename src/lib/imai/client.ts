/**
 * IMAI API Client — Influencer Marketing AI platform.
 *
 * Base URL: https://imai.co/api
 * Auth: authkey header
 * Rate limit: 10 req/sec
 *
 * Key endpoints used:
 * - /search/newv1/ — find influencers by criteria
 * - /reports/new/ — get audience demographics
 * - /raw/ig/user/info/ — Instagram user details
 * - /raw/tt/user/info/ — TikTok user details
 */

const BASE_URL = 'https://imai.co/api'

function getApiKey(): string {
  const key = process.env.IMAI_API_KEY
  if (!key) throw new Error('IMAI_API_KEY not configured')
  return key
}

async function imaiRequest<T>(
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'authkey': getApiKey(),
      'Content-Type': 'application/json',
    },
    ...(body && method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'unknown' }))
    const errMsg = errBody.error || errBody.error_message || errBody.detail || errBody.message || JSON.stringify(errBody).slice(0, 200)
    throw new Error(`IMAI ${res.status} (${endpoint}): ${errMsg}`)
  }

  return res.json() as Promise<T>
}

// ─── Types ──────────────────────────────────────────

export interface ImaiInfluencer {
  user_id: string
  username: string
  fullname: string
  picture: string
  followers: number
  engagements: number
  engagement_rate: number
  avg_likes: number
  avg_comments: number
  avg_views: number
  is_verified: boolean
  platform: 'instagram' | 'tiktok' | 'youtube'
  geo?: { country?: { name: string; code: string } }
  language?: { code: string; name: string }
}

export interface ImaiSearchResult {
  success: boolean
  data: ImaiInfluencer[]
  total?: number
}

export interface ImaiAudienceReport {
  success: boolean
  user_profile: {
    username: string
    fullname: string
    followers: number
    engagement_rate: number
    avg_likes: number
    avg_comments: number
    avg_views: number
    picture: string
    description: string
    geo?: { country?: { name: string } }
  }
  audience_followers?: {
    data?: {
      audience_genders?: { code: string; weight: number }[]
      audience_ages?: { code: string; weight: number }[]
      audience_geo?: { countries?: { name: string; weight: number }[] }
      audience_credibility?: number
    }
  }
}

// ─── Search ──────────────────────────────────────────

export interface ImaiSearchFilters {
  platform?: 'instagram' | 'tiktok' | 'youtube'
  followers_from?: number
  followers_to?: number
  engagement_rate_from?: number
  geo?: number[]           // geo IDs from /geos/ endpoint
  language?: string[]       // language codes
  gender?: 'MALE' | 'FEMALE'
  keywords?: string[]
  relevance?: string[]     // topic tags
  has_contact_details?: boolean
}

/**
 * Search for influencers matching criteria.
 * Uses POST /search/newv1/
 * Cost: tokens charged for unindexed results only.
 */
export async function searchInfluencers(
  filters: ImaiSearchFilters,
  limit: number = 20,
  offset: number = 0,
): Promise<ImaiSearchResult> {
  const requestId = `imai-search-${Date.now()}`
  const platform = filters.platform || 'instagram'

  console.log(`[IMAI][${requestId}] Searching ${platform} influencers...`)

  // Build IMAI v1 filter format (tested with real API)
  const filter: Record<string, unknown> = {}
  if (filters.followers_from || filters.followers_to) {
    filter.followers = {
      left_number: filters.followers_from || 1000,
      right_number: filters.followers_to || 10000000,
    }
  }
  if (filters.geo?.length) filter.audience_geo = filters.geo.map(id => ({ id }))
  if (filters.language?.length) filter.language = filters.language.map(code => ({ code }))
  if (filters.gender) filter.gender = filters.gender
  if (filters.relevance?.length) {
    // IMAI v1 relevance expects array of objects with tag property.
    // Single words only — multi-word phrases return 400.
    const tags = filters.relevance.flatMap(r => r.split(/\s+/)).filter(Boolean).map(t => t.toLowerCase())
    if (tags.length) filter.relevance = tags.map(tag => ({ tag }))
  }
  if (filters.keywords?.length) {
    // Keywords are plain strings (search in bio/posts)
    filter.keywords = filters.keywords.filter(Boolean)
  }
  if (filters.has_contact_details) filter.with_contact = [{ type: 'email' }]

  const rawResult = await imaiRequest<{
    total: number
    accounts: Array<{
      account: { user_profile: ImaiInfluencer }
      match?: Record<string, unknown>
    }>
  }>('POST', '/search/newv1/', {
    filter,
    sort: { field: 'followers', direction: 'desc' },
    paging: { skip: offset, limit },
  }, { platform })

  // Normalize to our ImaiSearchResult format
  const data = (rawResult.accounts || []).map(a => ({
    ...a.account.user_profile,
    platform: platform as 'instagram' | 'tiktok' | 'youtube',
  }))

  console.log(`[IMAI][${requestId}] Found ${data.length}/${rawResult.total} influencers`)
  return { success: true, data, total: rawResult.total }
}

/**
 * Get detailed audience report for a specific influencer.
 * Uses POST /reports/new/
 * Cost: 1 token per report. Free with dry_run=true.
 */
export async function getAudienceReport(
  username: string,
  platform: 'instagram' | 'tiktok' | 'youtube' = 'instagram',
  dryRun: boolean = false,
): Promise<ImaiAudienceReport> {
  const requestId = `imai-report-${Date.now()}`
  console.log(`[IMAI][${requestId}] Getting audience report for @${username} (${platform})${dryRun ? ' [DRY RUN]' : ''}`)

  const result = await imaiRequest<ImaiAudienceReport>(
    'POST',
    '/reports/new/',
    { filter: {} },
    { url: username, platform, dry_run: String(dryRun) },
  )

  console.log(`[IMAI][${requestId}] Report: ${result.user_profile?.followers || 0} followers, ${result.user_profile?.engagement_rate || 0} ER`)
  return result
}

/**
 * Get basic user info from Instagram Raw API.
 * Cost: 0.02 tokens. Rate limit: 1 req/sec.
 * IMAI endpoint expects `url` param with the username (not `username`).
 */
export async function getInstagramUserInfo(username: string): Promise<{
  user_id: string
  username: string
  fullname: string
  followers: number
  picture: string
  is_verified: boolean
  biography: string
}> {
  const clean = username.replace('@', '').trim()
  // Try multiple param names — IMAI API has inconsistent docs
  try {
    return await imaiRequest('GET', '/raw/ig/user/info/', undefined, { url: clean })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // If 400 with 'url', try 'username' fallback
    if (msg.includes('400')) {
      try {
        return await imaiRequest('GET', '/raw/ig/user/info/', undefined, { username: clean })
      } catch {
        // Try POST variant as last resort
        return imaiRequest('POST', '/raw/ig/user/info/', { url: clean })
      }
    }
    throw err
  }
}

/**
 * Search Israeli influencers by niche keywords.
 * Convenience wrapper with Israel geo filter.
 */
export async function searchIsraeliInfluencers(
  keywords: string[],
  opts: {
    platform?: 'instagram' | 'tiktok'
    minFollowers?: number
    maxFollowers?: number
    minEngagement?: number
    limit?: number
  } = {},
): Promise<ImaiInfluencer[]> {
  // Israel geo ID in IMAI (verified via /geos/?q=Israel)
  const ISRAEL_GEO_ID = 1473946
  const HEBREW_LANG = 'he'

  const result = await searchInfluencers({
    platform: opts.platform || 'instagram',
    followers_from: opts.minFollowers || 5000,
    followers_to: opts.maxFollowers || 500000,
    engagement_rate_from: opts.minEngagement || 1.5,
    geo: [ISRAEL_GEO_ID],
    language: [HEBREW_LANG],
    relevance: keywords,
  }, opts.limit || 15)

  return result.data || []
}
