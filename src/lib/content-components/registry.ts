/**
 * Content Component Registry (for client mounting; imports the real components).
 * Phase 15+: manifests gain schema/version/permissions; third-party components register here.
 */
import type { Component } from 'svelte';
import Callout from './Callout.svelte';
import YouTubeEmbed from './YouTubeEmbed.svelte';
import PostEmbed from './PostEmbed.svelte';
import ChartBlock from './ChartBlock.svelte';
import TimelineBlock from './TimelineBlock.svelte';
import GalleryBlock from './GalleryBlock.svelte';
import InteractiveCard from './InteractiveCard.svelte';
import CodeDemo from './CodeDemo.svelte';

type AnyProps = Record<string, unknown>;

/* * the mount layer doesn't validate props (schema formalized in Phase 15); each component degrades tolerantly on its own */
export const registry: Record<string, Component> = {
	callout: Callout as Component,
	youtube: YouTubeEmbed as Component,
	post: PostEmbed as Component,
	chart: ChartBlock as Component,
	timeline: TimelineBlock as Component,
	gallery: GalleryBlock as Component,
	card: InteractiveCard as Component,
	code: CodeDemo as Component
};

export type { AnyProps };
