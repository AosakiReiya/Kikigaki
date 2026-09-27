import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, deleteSession } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ cookies, platform }) => {
		const db = platform?.env.DB;
		const token = cookies.get(SESSION_COOKIE);
		if (db && token) {
			await deleteSession(db, token).catch(() => {});
		}
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/admin/login');
	}
};
