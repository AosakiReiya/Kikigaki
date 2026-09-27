/**
 * Traffic-source attribution (domain level only; full referer URLs never stored).
 * Priority: UTM medium → UTM source lookup → referer domain lookup → direct.
 */
export type Channel = 'direct' | 'search' | 'social' | 'referral' | 'email' | 'ads' | 'campaign';

/** matching list: hostname matched by lowercase "contains" */
const SEARCH_DOMAINS = [
	'google.',
	'bing.com',
	'duckduckgo.com',
	'yahoo.',
	'yandex.',
	'baidu.com',
	'sogou.com',
	'so.com',
	'naver.com',
	'daum.net',
	'ecosia.org',
	'startpage.com',
	'brave.com',
	'searx',
	'perplexity.ai',
	'copilot.microsoft.com',
	'gemini.google.com',
	'chatgpt.com',
	'okgoogle'
];

const SOCIAL_DOMAINS = [
	'twitter.com',
	'x.com',
	't.co',
	'facebook.com',
	'fb.com',
	'fb.me',
	'messenger.com',
	'm.me',
	'instagram.com',
	'threads.net',
	'threads.com',
	'reddit.com',
	'redd.it',
	'discord.com',
	'discord.gg',
	'telegram.org',
	't.me',
	'bsky.app',
	'linkto.blue',
	'mastodon.',
	'linkedin.com',
	'plurk.com',
	'weibo.com',
	'weibo.',
	'line.me',
	'line.naver',
	'pinterest.',
	'tiktok.com',
	'youtube.com',
	'youtu.be',
	'vk.com',
	'weixin.qq.com',
	'whatsapp.com',
	'dribbble.com',
	'behance.net',
	'tumblr.com',
	't.co',
	'news.ycombinator.com',
	'hckrnews.com',
	'lobste.rs',
	'dcard.tw',
	'ptt.cc',
	'v2ex.com',
	'jike',
	'm.weibo',
	'web.weibo'
];

const EMAIL_MEDIUMS = ['email', 'newsletter', 'ml'];
const ADS_MEDIUMS = [
	'cpc',
	'ppc',
	'paid',
	'paidsearch',
	'paid_search',
	'display',
	'banner',
	'ads',
	'adwords',
	'social_ads',
	'paidsocial'
];
const SOCIAL_MEDIUMS = ['social', 'sms', 'chat', 'community', 'post', 'link_in_bio'];
const SEARCH_MEDIUMS = ['organic', 'search', 'seo'];

function matches(list: string[], host: string): boolean {
	return list.some((d) => host.includes(d));
}

/** referer URL → clean domain (lowercase, www. stripped; null when invalid or same-origin) */
export function refDomainOf(referrer: string | null | undefined, selfHost: string): string | null {
	if (!referrer) return null;
	try {
		const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
		if (!host || host === selfHost) return null;
		return host.slice(0, 120);
	} catch {
		return null;
	}
}

export function classifyChannel(input: {
	refDomain: string | null;
	utmMedium?: string | null;
	utmSource?: string | null;
}): Channel {
	const medium = (input.utmMedium ?? '').toLowerCase().trim();
	const source = (input.utmSource ?? '').toLowerCase().trim();

	if (medium) {
		if (matches(ADS_MEDIUMS, medium)) return 'ads';
		if (matches(EMAIL_MEDIUMS, medium)) return 'email';
		if (matches(SOCIAL_MEDIUMS, medium)) return 'social';
		if (matches(SEARCH_MEDIUMS, medium)) return 'search';
	}
	if (source) {
		if (matches(SOCIAL_DOMAINS, source) || matches(SOCIAL_DOMAINS, source + '.')) return 'social';
		if (matches(SEARCH_DOMAINS, source)) return 'search';
		if (EMAIL_MEDIUMS.some((e) => source.includes(e))) return 'email';
	}
	if (medium && !matches(SOCIAL_MEDIUMS, medium) && !matches(ADS_MEDIUMS, medium))
		return 'campaign';
	if (input.refDomain) {
		if (matches(SEARCH_DOMAINS, input.refDomain)) return 'search';
		if (matches(SOCIAL_DOMAINS, input.refDomain)) return 'social';
		return 'referral';
	}
	return 'direct';
}
