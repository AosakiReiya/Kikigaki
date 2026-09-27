<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SectionHeading from './SectionHeading.svelte';

	const { Story } = defineMeta({
		title: 'Components/SectionHeading',
		component: SectionHeading,
		args: {
			index: '01'
		}
	});
</script>

<Story name="Default">文章</Story>
