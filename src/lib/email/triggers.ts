/**
 * Phase 71 — template type → trigger event mapping (for the UI info panel; client-safe).
 * live = system already calls sendTemplatedEmail; planned/manual = not wired yet.
 */
export const TEMPLATE_TRIGGERS: Record<
	string,
	{ status: 'live' | 'planned' | 'manual'; desc: string }
> = {
	comment_reply: { status: 'live', desc: '有人回覆評論且該回覆通過審核時，寄給留過信箱的原評論者' },
	welcome: { status: 'planned', desc: '需會員/訂閱系統（尚未建置）；現可由 API 手動觸發' },
	verify_email: {
		status: 'live',
		desc: '電子報訂閱 double opt-in 確認信（訂閱勾選/手動加入時自動發）'
	},
	password_reset: { status: 'planned', desc: '後台帳號目前無自助重設流程；接線後自動用此範本' },
	new_comment: { status: 'planned', desc: '新評論通知站長——待站長通知地址設定上線' },
	newsletter: {
		status: 'live',
		desc: '後台「電子報訂閱者」頁選文章發送（double opt-in 名單；每封帶退訂連結）'
	},
	system: { status: 'manual', desc: '系統手動觸發（API／Agent send_test_email）' },
	custom: { status: 'manual', desc: '自訂用途，由 API 以 slug 指定發送' }
};

export function triggerOf(type: string): { status: 'live' | 'planned' | 'manual'; desc: string } {
	return TEMPLATE_TRIGGERS[type] ?? TEMPLATE_TRIGGERS['custom'];
}
