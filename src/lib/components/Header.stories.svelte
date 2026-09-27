<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Header from './Header.svelte';

	const { Story } = defineMeta({
		title: 'Components/Header',
		component: Header
	});
</script>

<Story name="Default" />
