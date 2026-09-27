<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TagLink from './TagLink.svelte';

	const { Story } = defineMeta({
		title: 'Components/TagLink',
		component: TagLink,
		args: {
			name: 'GSAP',
			count: 3
		}
	});
</script>

<Story name="Default" />
<Story name="Without Count" args={{ count: undefined }} />
