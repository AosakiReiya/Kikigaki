import { gsap } from 'gsap';
import {
	Draggable,
	Flip,
	InertiaPlugin,
	ScrambleTextPlugin,
	ScrollTrigger,
	SplitText
} from 'gsap/all';
import { EASE } from './config';

let registered = false;

/* * every animation module initializes through here (plugin registration + global defaults) */
export function ensureGsap(): typeof gsap {
	if (!registered) {
		gsap.registerPlugin(
			Draggable,
			Flip,
			InertiaPlugin,
			ScrollTrigger,
			SplitText,
			ScrambleTextPlugin
		);
		gsap.defaults({ ease: EASE.soft, duration: 0.6 });
		registered = true;
	}
	return gsap;
}

export { Draggable, Flip, InertiaPlugin, ScrollTrigger, SplitText, ScrambleTextPlugin };
