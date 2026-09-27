---
title: 用 GSAP 打造 SvelteKit 頁面轉場
date: 2026-08-18
tags: [GSAP, 動畫, SvelteKit]
summary: 從 onNavigate 掛載點到 GSAP timeline，一步步拆解做一個不閃爍、可中斷、支援前後退的頁面轉場，踩過的坑都寫在裡面了。
cover: /covers/gsap-page-transition.svg
---

先說結論：**頁面轉場的本質，就是填補舊頁消失到新頁出現之間的那段空窗。**

空窗處理得差，使用者看到的是白屏閃爍；處理得好，使用者只會覺得頁面空間是連續的。前者讓網站看起來像壞掉的，後者讓網站看起來「很貴」。差別就是在這段時間裡，你讓使用者看了什麼。

這篇文章是我把轉場實際做進網站後，整理出來的完整流程 — 從掛載點、動畫時序，到三個我踩過的坑。

## 流程長這樣

以 SvelteKit 為例，一次帶轉場的導航大致是：

```text
使用者點連結
  → onNavigate（離開動畫）
  → SvelteKit 載入新路由的資料
  → 舊內容換成新內容
  → afterNavigate（進場動畫）
  → 完成
```

關鍵是第一步：`onNavigate` 回傳的 Promise 會被 SvelteKit `await`，也就是說**你告訴它「等等再走」它就會等**。離開動畫播完之前，頁面不會被換掉 — 這正是我們要的空窗填充。

## 用 viewTransition 還是 GSAP？

如果只是想要最基本的淡入淡出，SvelteKit 官方建議直接用 View Transitions API，程式碼只需要幾行：

```typescript
import { onNavigate } from '$app/navigation';

onNavigate(() => {
	return new Promise((resolve) => {
		document.startViewTransition(async () => {
			resolve();
		});
	});
});
```

不過整套 API 能客製的只有轉場名稱，動畫本身的時序、遮罩形狀、緩動曲線都不好深入。想做出 Awwwards 那種遮罩翻頁效果，**直接用 GSAP 開 timeline 才是正解**：

```typescript
onNavigate(async ({ from, to }) => {
	if (!from || !to || from.url.pathname === to.url.pathname) return;

	await pageLeave(); // GSAP timeline：舊頁淡出 + 遮罩進場
});
```

`pageLeave` 內部就是一段 timeline，動畫結束 resolve，SvelteKit 才會把頁面換掉，然後由新頁面的 component 在 mount 時播進場動畫。一進一出，節奏就出來了。

## 三個常見錯誤

這些都是我實際踩過 (以及看別人踩過) 的坑。

### 1. 用 beforeNavigate + cancel + goto

這是最直觀的寫法：攔截導航、播動畫、再重新 `goto`：

```typescript
// ❌ 風險很高，不建議
beforeNavigate(({ cancel, to }) => {
	if (isTransitioning) return;
	cancel();
	animateOut().then(() => goto(to.url));
});
```

問題在於 `goto` 可能失敗（路由不存在、連線中斷），或中途又觸發其他導航。只要有一次 `isTransitioning` 沒有被重置，導航就永遠被卡住 — 使用者會覺得網站整個死掉。用 `onNavigate` 讓框架自己處理等待，就不會有這種狀態機問題。

### 2. 動畫沒有超時兜底

`onNavigate` 等你 resolve，那就代表：**只要動畫永遠不回去，導航就永遠卡著。**

動畫被 `display: none` 的元素卡住、某些瀏覽器效應導致 `onComplete` 沒觸發、promise 忘了 resolve…發生的方式太多了。一律加個保險：

```typescript
// 上限 1.2 秒，animations 沒跑完直接跳到結尾狀態
gsap.delayedCall(1.2, () => tl.progress(1));
```

不優雅，但保證永遠不會把頁面卡死。轉場這種事，**寧可瞬間跳過，也不要卡住**。

### 3. 忘了處理中途被中斷的動畫

使用者在前後退按鈕、快速點連結、連點兩下。如果上一段 timeline 還在播，新的動畫又疊上去，元素狀態會整個錯亂 — 閃一下、跳半格，比沒轉場還難看。

實作上的對策：

```typescript
function pageLeave() {
	let tl = gsap
		.timeline({ paused: true, onComplete: () => (tl = null) })
		.to('.page', { autoAlpha: 0, duration: 0.35 })
		.to('.overlay', { scaleY: 1, transformOrigin: 'bottom', duration: 0.5, ease: 'power4.inOut' });
	gsap.killTweensOf('.page'); // 把還在跑的舊動畫全部清掉
	gsap.killTweensOf('.overlay');
	tl.play();
	return tl.then(() => {});
}
```

記住一個原則：**動畫的狀態要以 timeline 為唯一來源，而不是靠一堆散落的 tween 各自記錄。**

## 遮罩轉場：Awwwards 經典款

最常見的高級感轉場，就是全屏遮罩（curtain）：

```typescript
gsap
	.timeline()
	.to('.overlay', { scaleY: 1, transformOrigin: 'bottom', duration: 0.5, ease: 'power4.inOut' })
	.to('.overlay', { scaleY: 0, transformOrigin: 'top', duration: 0.5, ease: 'power4.out' });
```

遮罩蓋上的瞬間換內容，掀開時新頁已經準備好 — 使用者全程看不到空窗。注意 `transformOrigin` 不同，蓋和掀的方向才會有「翻頁」的感覺。

這個網站的首屏載入就是類似的思路：全屏 preloader 蓋上去，內容就緒後掀開；而站內比較尋常的頁面跳轉，只用輕量 fade，避免每個頁面都來一次大動作，反而失去焦點。**轉場的力道要和跳轉的重要性成正比。**

## 其他細節

- **`prefers-reduced-motion`** 時直接跳過動畫 — 不要剝奪使用者「快速到達目的地」的權力。用 `matchMedia` 或 CSS 關掉就好。
- **`ScrollTrigger` 要清理和重建**：頁面切換後，前一個頁面的 ScrollTrigger 如果沒 `kill()`，scroller 的計算會全錯，捲動位置會莫名被拉走。
- **進場動畫不要動佈局屬性**：只改 `transform / opacity`，不然會造成 layout shift。

## 小結

- 用 `onNavigate` 的 Promise 機制，不要自己 `cancel + goto`
- 所有動畫都要有超時兜底，卡住比沒有動畫更糟
- 動畫由 timeline 統一管理，被中斷時先 `killTweensOf`
- 轉場的力道對應跳轉的重要性，全站每個頁面都放煙火只會很吵

下一篇我會實際拆這個網站的轉場配置：怎麼讓 preloader、首頁動畫、站內跳轉共用同一套 GSAP 設定又不打架。
