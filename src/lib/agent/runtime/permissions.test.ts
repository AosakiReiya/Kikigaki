import { describe, it, expect } from 'vitest';
import {
	wildcardMatch,
	matchRule,
	evaluatePermission,
	decideToolAccess,
	type PermRule
} from './permissions';

const r = (pattern: string, action: PermRule['action']): PermRule => ({
	scope: 'global',
	scopeName: null,
	pattern,
	action
});

describe('wildcardMatch（OpenCode Wildcard 同構）', () => {
	it('* 全配與字面', () => {
		expect(wildcardMatch('publish_post', '*')).toBe(true);
		expect(wildcardMatch('publish_post', 'publish_post')).toBe(true);
		expect(wildcardMatch('publish_post', 'publish_*')).toBe(true);
		expect(wildcardMatch('mmcp_echo', 'mmcp_*')).toBe(true);
		expect(wildcardMatch('other', 'mmcp_*')).toBe(false);
	});
	it('? 單字元；大小寫不敏感', () => {
		expect(wildcardMatch('read_post', 'read?post')).toBe(true);
		expect(wildcardMatch('read_posts', 'read?post')).toBe(false);
		expect(wildcardMatch('READ_POST', 'read_post')).toBe(true);
	});
	it('尾 " *" 也可配裸前綴（指令語意）', () => {
		expect(wildcardMatch('git', 'git *')).toBe(true);
		expect(wildcardMatch('git push', 'git *')).toBe(true);
		expect(wildcardMatch('github', 'git *')).toBe(false);
	});
});

describe('規則評估', () => {
	it('findLast：後者覆蓋前者', () => {
		const rules = [r('*', 'deny'), r('publish_*', 'allow')];
		expect(matchRule(rules, 'publish_post')?.action).toBe('allow');
		expect(matchRule(rules, 'delete_all')?.action).toBe('deny');
	});
	it('evaluatePermission 跨規則串（session 蓋 agent 蓋 global）', () => {
		const sets: PermRule[][] = [[r('publish_post', 'ask')], [r('publish_post', 'allow')], []];
		expect(evaluatePermission(sets, 'publish_post')).toBe('allow');
	});
	it('無命中回 null（回退風險預設）', () => {
		expect(evaluatePermission([[r('a_*', 'deny')]], 'b_x')).toBeNull();
		expect(evaluatePermission([], 'anything')).toBeNull();
	});
});

describe('decideToolAccess（35A 單一決策軸）', () => {
	const sets = (rules: PermRule[]) => [rules];
	it('規則 deny 壓過一切（即使 ceiling 寬容）', () => {
		const v = decideToolAccess(
			sets([r('publish_post', 'deny')]),
			'critical',
			'publish_post',
			'high'
		);
		expect(v.action).toBe('deny');
		expect(v.reason).toContain('permission_denied_by_rule');
	});
	it('ceiling 超過 → deny 且理由含上限', () => {
		const v = decideToolAccess(sets([]), 'read', 'publish_post', 'high');
		expect(v.action).toBe('deny');
		expect(v.reason).toContain('risk_ceiling_exceeded');
	});
	it('規則 allow 生效（ceiling 內）', () => {
		expect(
			decideToolAccess(sets([r('create_post', 'allow')]), 'critical', 'create_post', 'medium')
				.action
		).toBe('allow');
	});
	it('allow 規則但超 ceiling → 仍 deny（上限硬於規則）', () => {
		expect(
			decideToolAccess(sets([r('publish_post', 'allow')]), 'low', 'publish_post', 'high').action
		).toBe('deny');
	});
	it('ask 強制；無命中 default 交由風險分級', () => {
		expect(decideToolAccess(sets([r('*', 'ask')]), 'critical', 'anything', 'low').action).toBe(
			'ask'
		);
		expect(decideToolAccess(sets([]), 'critical', 'x', 'low').action).toBe('default');
	});
	it('未知風險字串一律 deny（安全預設）', () => {
		expect(decideToolAccess(sets([]), 'critical', 'x', 'weird').action).toBe('deny');
	});
});
