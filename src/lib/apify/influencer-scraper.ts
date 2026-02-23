/**
 * Influencer Profile Scraper
 * Uses ScrapeCreators API (primary) or Apify (fallback) for Instagram profiles
 */

import { ApifyClient } from 'apify-client'
import { getInstagramProfile as scGetProfile, getMultipleProfiles as scGetMultiple, isScrapeCreatorsAvailable } from './scrapecreators-scraper'

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
})

/**
 * Clean search query from special characters that cause Apify errors
 */
function cleanSearchQuery(query: string): string {
  return query
    .replace(/[!?.,:;\-+=*&%$#@\/\\~^|<>()[\]{}"'`״׳]/g, ' ') // Remove special chars
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()
}

export interface ScrapedInfluencer {
  username: string
  fullName: string
  profileUrl: string
  profilePicUrl: string
  bio: string
  
  // Stats
  followers: number
  following: number
  posts: number
  
  // Engagement
  avgLikes: number
  avgComments: number
  engagementRate: number
  
  // Content samples
  recentPosts: {
    imageUrl: string
    caption: string
    likes: number
    comments: number
    timestamp: string
  }[]
  
  // Categories/tags
  categories: string[]
  hashtags: string[]
  
  // Contact
  email?: string
  website?: string
  
  // Verification
  isVerified: boolean
  isBusinessAccount: boolean
}

/**
 * Search for influencers on Instagram by keywords
 */
export async function searchInfluencers(
  keywords: string[],
  category: string,
  minFollowers: number = 10000,
  maxFollowers: number = 500000,
  limit: number = 10
): Promise<{ username: string; profileUrl: string }[]> {
  // Clean keywords and create search query
  const cleanedKeywords = keywords.map(k => cleanSearchQuery(k)).filter(k => k.length > 0)
  const searchQuery = cleanSearchQuery(cleanedKeywords.join(' '))
  
  console.log(`[Influencer Search] Searching for "${searchQuery}" in ${category}`)
  
  try {
    // Use Instagram Search Scraper to find relevant accounts
    const run = await client.actor('apify/instagram-search-scraper').call({
      search: searchQuery,
      resultsType: 'accounts',
      resultsLimit: limit * 3, // Get more to filter
    }, {
      timeout: 120,
    })
    
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    
    // Filter by follower count
    const filtered = items
      .filter((item: { followersCount?: number }) => {
        const followers = item.followersCount || 0
        return followers >= minFollowers && followers <= maxFollowers
      })
      .slice(0, limit)
      .map((item: { username?: string }) => ({
        username: item.username || '',
        profileUrl: `https://instagram.com/${item.username}`,
      }))
    
    console.log(`[Influencer Search] Found ${filtered.length} potential influencers`)
    return filtered
  } catch (error) {
    console.error('[Influencer Search] Error:', error)
    return []
  }
}

/**
 * Scrape a single Instagram profile
 * Uses ScrapeCreators API first, falls back to Apify
 */
export async function scrapeInstagramProfile(username: string): Promise<ScrapedInfluencer | null> {
  console.log(`[Influencer Scrape] Scraping @${username}`)

  // Try ScrapeCreators first
  if (isScrapeCreatorsAvailable()) {
    try {
      const scProfile = await scGetProfile(username)
      if (scProfile) {
        const categories = detectCategories(scProfile.biography || '', [])
        return {
          username: scProfile.username,
          fullName: scProfile.fullName,
          profileUrl: `https://instagram.com/${scProfile.username}`,
          profilePicUrl: scProfile.profilePicUrl,
          bio: scProfile.biography,
          followers: scProfile.followersCount,
          following: scProfile.followingCount,
          posts: scProfile.postsCount,
          avgLikes: 0,
          avgComments: 0,
          engagementRate: 0,
          recentPosts: [],
          categories,
          hashtags: [],
          email: scProfile.businessEmail,
          website: scProfile.externalUrl,
          isVerified: scProfile.isVerified,
          isBusinessAccount: scProfile.isBusinessAccount,
        }
      }
    } catch (scErr) {
      console.log(`[Influencer Scrape] ScrapeCreators failed for @${username}, trying Apify:`, scErr)
    }
  }

  // Fallback: Apify
  try {
    const run = await client.actor('apify/instagram-profile-scraper').call({
      usernames: [username],
      resultsLimit: 12,
    }, {
      timeout: 120,
    })

    const { items } = await client.dataset(run.defaultDatasetId).listItems()

    if (items.length === 0) {
      console.log(`[Influencer Scrape] No data for @${username}`)
      return null
    }

    const profile = items[0] as {
      username?: string
      fullName?: string
      biography?: string
      profilePicUrl?: string
      followersCount?: number
      followsCount?: number
      postsCount?: number
      isVerified?: boolean
      isBusinessAccount?: boolean
      businessEmail?: string
      externalUrl?: string
      latestPosts?: Array<{
        displayUrl?: string
        caption?: string
        likesCount?: number
        commentsCount?: number
        timestamp?: string
      }>
    }

    const posts = profile.latestPosts || []
    const totalLikes = posts.reduce((sum, p) => sum + (p.likesCount || 0), 0)
    const totalComments = posts.reduce((sum, p) => sum + (p.commentsCount || 0), 0)
    const avgLikes = posts.length > 0 ? Math.round(totalLikes / posts.length) : 0
    const avgComments = posts.length > 0 ? Math.round(totalComments / posts.length) : 0
    const engagementRate = profile.followersCount
      ? ((avgLikes + avgComments) / profile.followersCount) * 100
      : 0

    const allHashtags: string[] = []
    posts.forEach(p => {
      const matches = (p.caption || '').match(/#[\u0590-\u05FFa-zA-Z0-9_]+/g)
      if (matches) allHashtags.push(...matches)
    })
    const topHashtags = getTopItems(allHashtags, 10)
    const categories = detectCategories(profile.biography || '', topHashtags)

    return {
      username: profile.username || username,
      fullName: profile.fullName || '',
      profileUrl: `https://instagram.com/${username}`,
      profilePicUrl: profile.profilePicUrl || '',
      bio: profile.biography || '',
      followers: profile.followersCount || 0,
      following: profile.followsCount || 0,
      posts: profile.postsCount || 0,
      avgLikes,
      avgComments,
      engagementRate: Math.round(engagementRate * 100) / 100,
      recentPosts: posts.slice(0, 6).map(p => ({
        imageUrl: p.displayUrl || '',
        caption: (p.caption || '').slice(0, 200),
        likes: p.likesCount || 0,
        comments: p.commentsCount || 0,
        timestamp: p.timestamp || '',
      })),
      categories,
      hashtags: topHashtags,
      email: profile.businessEmail,
      website: profile.externalUrl,
      isVerified: profile.isVerified || false,
      isBusinessAccount: profile.isBusinessAccount || false,
    }
  } catch (error) {
    console.error(`[Influencer Scrape] Error for @${username}:`, error)
    return null
  }
}

/**
 * Scrape multiple influencer profiles
 * Uses ScrapeCreators batch when available
 */
export async function scrapeMultipleInfluencers(
  usernames: string[]
): Promise<ScrapedInfluencer[]> {
  console.log(`[Influencer Scrape] Scraping ${usernames.length} profiles`)

  // Try ScrapeCreators batch first
  if (isScrapeCreatorsAvailable()) {
    try {
      const scProfiles = await scGetMultiple(usernames)
      if (scProfiles.length > 0) {
        console.log(`[Influencer Scrape] ScrapeCreators returned ${scProfiles.length}/${usernames.length} profiles`)
        return scProfiles.map(p => {
          const categories = detectCategories(p.biography || '', [])
          return {
            username: p.username,
            fullName: p.fullName,
            profileUrl: `https://instagram.com/${p.username}`,
            profilePicUrl: p.profilePicUrl,
            bio: p.biography,
            followers: p.followersCount,
            following: p.followingCount,
            posts: p.postsCount,
            avgLikes: 0,
            avgComments: 0,
            engagementRate: 0,
            recentPosts: [],
            categories,
            hashtags: [],
            email: p.businessEmail,
            website: p.externalUrl,
            isVerified: p.isVerified,
            isBusinessAccount: p.isBusinessAccount,
          }
        })
      }
    } catch (scErr) {
      console.log('[Influencer Scrape] ScrapeCreators batch failed, trying Apify:', scErr)
    }
  }

  // Fallback: Apify one by one
  const results: ScrapedInfluencer[] = []
  for (let i = 0; i < usernames.length; i += 3) {
    const batch = usernames.slice(i, i + 3)
    const batchResults = await Promise.all(
      batch.map(username => scrapeInstagramProfile(username))
    )
    for (const result of batchResults) {
      if (result) results.push(result)
    }
    if (i + 3 < usernames.length) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  console.log(`[Influencer Scrape] Successfully scraped ${results.length}/${usernames.length} profiles`)
  return results
}

/**
 * Full influencer discovery and scraping flow
 */
export async function discoverAndScrapeInfluencers(
  industry: string,
  targetAudience: { gender?: string; ageRange?: string; interests?: string[] },
  budget: number,
  count: number = 6
): Promise<ScrapedInfluencer[]> {
  console.log(`[Influencer Discovery] Starting for ${industry}`)
  
  // Generate search keywords based on industry and audience
  const keywords = generateSearchKeywords(industry, targetAudience)
  
  // Determine follower ranges based on budget
  const tiers = calculateInfluencerTiers(budget, count)
  
  const allInfluencers: ScrapedInfluencer[] = []
  
  for (const tier of tiers) {
    // Search for influencers in this tier
    const found = await searchInfluencers(
      keywords,
      industry,
      tier.minFollowers,
      tier.maxFollowers,
      tier.count
    )
    
    // Scrape the profiles
    if (found.length > 0) {
      const scraped = await scrapeMultipleInfluencers(
        found.map(f => f.username)
      )
      allInfluencers.push(...scraped)
    }
  }
  
  // Sort by engagement rate
  allInfluencers.sort((a, b) => b.engagementRate - a.engagementRate)
  
  console.log(`[Influencer Discovery] Found ${allInfluencers.length} influencers`)
  return allInfluencers.slice(0, count)
}

// Helper functions

function generateSearchKeywords(
  industry: string,
  audience: { gender?: string; ageRange?: string; interests?: string[] }
): string[] {
  const keywords: string[] = []
  
  // Use ENGLISH keywords for better Instagram search results
  // Hebrew keywords don't work well with Instagram's search
  const industryMap: Record<string, string[]> = {
    'food': ['israeli food blogger', 'food israel', 'telaviv foodie', 'israeli chef'],
    'fashion': ['israeli fashion', 'telaviv style', 'israel fashion blogger'],
    'fitness': ['israeli fitness', 'telaviv gym', 'israel workout'],
    'beauty': ['israeli beauty', 'telaviv makeup', 'israel skincare'],
    'lifestyle': ['israeli lifestyle', 'telaviv blogger', 'israel influencer'],
    'parenting': ['israeli mom', 'telaviv family', 'israel parenting'],
    'travel': ['israel travel', 'telaviv travel', 'israeli traveler'],
    'tech': ['israeli tech', 'startup israel', 'telaviv tech'],
    'health': ['israeli wellness', 'israel healthy', 'telaviv nutrition'],
    'home': ['israeli home', 'telaviv interior', 'israel design'],
    'מזון': ['israeli food blogger', 'telaviv foodie', 'israel chef'],
    'אופנה': ['israeli fashion', 'telaviv style', 'fashion israel'],
    'כושר': ['israeli fitness', 'telaviv trainer', 'israel gym'],
    'יופי': ['israeli beauty', 'telaviv makeup', 'israel skincare'],
    'טיולים': ['israel travel', 'telaviv blogger', 'travel israel'],
    'משקאות': ['israeli drinks', 'telaviv bar', 'israel beverage'],
    'בריאות': ['israeli health', 'telaviv wellness', 'israel nutrition'],
  }
  
  // Find matching industry keywords (check in both English and Hebrew)
  const lowerIndustry = industry.toLowerCase()
  for (const [key, values] of Object.entries(industryMap)) {
    if (lowerIndustry.includes(key) || lowerIndustry.includes(key.toLowerCase())) {
      keywords.push(...values)
      break // Found a match, use these keywords
    }
  }
  
  // If no match found, use generic Israeli influencer keywords
  if (keywords.length === 0) {
    keywords.push('israeli influencer', 'telaviv blogger', 'israel lifestyle')
  }
  
  // Add English versions of interests if available
  if (audience.interests) {
    const englishInterests = audience.interests
      .slice(0, 2)
      .map(i => `israel ${i}`)
      .filter(i => /^[a-zA-Z\s]+$/.test(i)) // Only add if it's English
    keywords.push(...englishInterests)
  }
  
  return Array.from(new Set(keywords)).slice(0, 4)
}

function calculateInfluencerTiers(
  budget: number,
  totalCount: number
): { minFollowers: number; maxFollowers: number; count: number }[] {
  // Budget allocation strategy - minimum 10K followers for all tiers
  if (budget >= 100000) {
    return [
      { minFollowers: 100000, maxFollowers: 500000, count: Math.ceil(totalCount * 0.3) },
      { minFollowers: 30000, maxFollowers: 100000, count: Math.ceil(totalCount * 0.4) },
      { minFollowers: 10000, maxFollowers: 30000, count: Math.ceil(totalCount * 0.3) },
    ]
  } else if (budget >= 50000) {
    return [
      { minFollowers: 50000, maxFollowers: 200000, count: Math.ceil(totalCount * 0.2) },
      { minFollowers: 20000, maxFollowers: 50000, count: Math.ceil(totalCount * 0.5) },
      { minFollowers: 10000, maxFollowers: 20000, count: Math.ceil(totalCount * 0.3) },
    ]
  } else {
    // Even for low budgets, only show influencers with 10K+ followers
    return [
      { minFollowers: 30000, maxFollowers: 100000, count: Math.ceil(totalCount * 0.3) },
      { minFollowers: 10000, maxFollowers: 30000, count: Math.ceil(totalCount * 0.7) },
    ]
  }
}

function getTopItems(items: string[], limit: number): string[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item)
}

function detectCategories(bio: string, hashtags: string[]): string[] {
  const categories: string[] = []
  const text = (bio + ' ' + hashtags.join(' ')).toLowerCase()
  
  const categoryPatterns: Record<string, RegExp[]> = {
    'לייפסטייל': [/lifestyle/i, /לייפסטייל/],
    'אופנה': [/fashion/i, /אופנה/, /סטייל/],
    'יופי': [/beauty/i, /makeup/i, /יופי/, /איפור/],
    'כושר': [/fitness/i, /gym/i, /כושר/, /אימון/],
    'אוכל': [/food/i, /chef/i, /אוכל/, /מתכון/],
    'הורות': [/mom/i, /parent/i, /אמא/, /הור/],
    'טיולים': [/travel/i, /טיול/, /נסיעות/],
    'עסקים': [/business/i, /entrepreneur/i, /יזם/],
  }
  
  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    if (patterns.some(p => p.test(text))) {
      categories.push(category)
    }
  }
  
  return categories.length > 0 ? categories : ['כללי']
}

